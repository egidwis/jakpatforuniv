import { ChevronDown, ChevronUp, History } from 'lucide-react';
import type { ReviewHistoryEntry } from './types';
import { cn } from '@/lib/utils';

interface ReviewTimelineProps {
  history: ReviewHistoryEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}

/** Daftar riwayatnya saja — pemicunya `ReviewTimelineToggle` di bawah. */
export function ReviewTimeline({ history }: Pick<ReviewTimelineProps, 'history'>) {
  if (!history || history.length === 0) return null;

  // Terbaru di atas. Seri dipecah lewat URUTAN PENULISAN (indeks) secara
  // terbalik: dua entri bisa lahir di milidetik yang sama — mis. admin menekan
  // "Simpan Catatan" lalu peneliti langsung mengajukan ulang — dan `sort` yang
  // stabil akan mempertahankan urutan array untuk nilai seri, yaitu
  // kronologis. Di daftar yang mengaku terbaru-dulu, itu justru terbalik.
  const sortedHistory = history
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => {
      const d = new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime();
      return d !== 0 ? d : b.i - a.i;
    })
    .map(({ entry }) => entry);

  // Ini garis waktu PERISTIWA, jadi labelnya kata kerja — bukan nama status.
  // `actor` memisahkan dua peristiwa yang dulu tampil identik: peneliti
  // mengajukan ulang vs admin mengembalikan ke antrean. Entri lama tidak punya
  // actor dan sengaja jatuh ke kalimat netral, bukan menebak.
  const getStatusDetails = (entry: ReviewHistoryEntry) => {
    const byAdmin = entry.actor === 'admin';
    const byResearcher = entry.actor === 'researcher';

    switch (entry.action) {
      case 'approved':
        return {
          dotColor: 'bg-green-500 ring-green-100',
          textColor: 'text-green-700',
          label: 'Disetujui',
        };
      case 'rejected':
        return {
          dotColor: 'bg-amber-500 ring-amber-100',
          textColor: 'text-amber-700',
          label: 'Diminta Perbaikan',
        };
      case 'spam':
        return {
          dotColor: 'bg-orange-500 ring-orange-100',
          textColor: 'text-orange-700',
          label: 'Ditandai Tidak Valid',
        };
      case 'cancelled':
        return {
          dotColor: 'bg-slate-400 ring-slate-100',
          textColor: 'text-slate-600',
          label: byResearcher ? 'Dibatalkan peneliti' : byAdmin ? 'Dibatalkan admin' : 'Dibatalkan',
        };
      case 'in_review':
      default:
        return {
          dotColor: 'bg-blue-500 ring-blue-100',
          textColor: 'text-blue-700',
          label: byResearcher
            ? 'Diajukan ulang oleh peneliti'
            : byAdmin
              ? 'Dikembalikan ke antrean oleh admin'
              : 'Masuk antrean review',
        };
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const dateStr = date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateStr}, ${timeStr}`;
    } catch {
      return isoString;
    }
  };

  return (
    /**
     * ⚠️ KOTAK YANG MEN-SCROLL TIDAK BOLEH JADI KOTAK YANG MENGGAMBAR RAIL.
     *
     * Dulu `overflow-y-auto`, `border-l`, dan `pl-3` menempel di SATU elemen,
     * dan dot dipasang `-left-[17px]` supaya duduk di atas border itu. Artinya
     * dot mendarat di x = 12 − 17 = −5px, lalu `ring-4` menariknya sampai −9px:
     * di luar kotak. Dan `overflow-y-auto` memotongnya — spesifikasi CSS
     * memaksa sumbu satunya ikut `auto` begitu satu sumbu bukan `visible`,
     * jadi kotak ini meng-clip horizontal juga. Hasilnya dot separuh bulan.
     *
     * Sekarang: scroll di luar, gambar di dalam, dan SEMUA geometri hidup di
     * dalam padding box.
     *
     *   pl-5    → isi mulai x=20
     *   rail    → left-2 w-0.5  : x 8–10, pusat 9
     *   dot     → -left-[15px]  : x 5–13, pusat 9  (sejajar rail)
     *   ring-4  → x 1–17        : masih di dalam, nol pemotongan
     *
     * Angkanya sengaja bulat semua supaya tidak ada sub-pixel yang menggeser
     * dot keluar lagi saat browser membulatkan.
     */
    <div className="max-h-[150px] overflow-y-auto pr-1 scrollbar-thin">
      <div className="relative pl-5 py-1 space-y-4">
        <span
          aria-hidden="true"
          className="absolute left-2 top-2 bottom-2 w-0.5 rounded-full bg-gray-100"
        />
        {sortedHistory.map((entry, idx) => {
          const details = getStatusDetails(entry);
          return (
            <div key={idx} className="relative group">
            {/* Simpul garis waktu — menimpa rail, jadi rail tidak perlu putus. */}
            <div
              className={cn(
                "absolute -left-[15px] top-1 h-2 w-2 rounded-full ring-4 bg-current shrink-0",
                details.dotColor
              )}
            />

            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className={cn("font-semibold min-w-0", details.textColor)}>
                  {details.label}
                </span>
                <span className="text-gray-400 shrink-0 whitespace-nowrap">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              {entry.notes && (
                <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1 leading-relaxed whitespace-pre-line italic">
                  &ldquo;{entry.notes}&rdquo;
                </p>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pemicunya saja — satu tombol pendek yang muat di baris status.
 *
 * Dulu label "HISTORY LOG" dan tombol "Show History (n)" berdiri sendiri-sendiri
 * DAN daftarnya ikut dirender di blok yang sama. Karena blok itu duduk sebaris
 * dengan chip Review Status, membentangkan riwayat membuat chipnya ter-center
 * terhadap daftar setinggi 150px — persis tabrakan yang terlihat di layar.
 * Sekarang pemicunya tetap di baris, daftarnya turun ke bawah selebar footer.
 */
export function ReviewTimelineToggle({
  history,
  isExpanded,
  onToggle,
}: ReviewTimelineProps) {
  if (!history || history.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
      title={isExpanded ? 'Sembunyikan riwayat review' : 'Tampilkan riwayat review'}
    >
      <History className="w-3 h-3 shrink-0" />
      Riwayat ({history.length})
      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
    </button>
  );
}
