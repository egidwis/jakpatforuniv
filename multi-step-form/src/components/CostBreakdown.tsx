import { useState } from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { formatIDR } from '../utils/currency';
import type { MoneyLine } from '../utils/scheduleMoney';

/**
 * Rincian biaya — SATU komponen, dua kedalaman.
 *
 * ⚠️ SEBELUM INI ADA, rincian muncul di empat tempat dengan tiga cara berbeda:
 * Ringkasan (kartu penuh, `calculateTotalCost`), halaman bayar (total MENTAH
 * dari `submission.total_cost`), dan kartu jadwal (total + "Lihat rincian",
 * `deriveScheduleMoney`). Tiga cara berarti tiga kesempatan untuk berselisih —
 * dan `recordedVsBilled` sudah membuktikan `total_cost` bisa menyimpang dari
 * `invoices.amount`.
 *
 * Bentuknya diangkat dari `ScheduleBanner` (SchedulePhase.tsx) yang sudah
 * teruji di produksi: total dulu, rincian atas permintaan, tone
 * `discount`/`addon`, dan `costIsEstimateNote` saat angkanya belum ditagih.
 *
 * ⚠️ KOMPONEN INI TIDAK MENGHITUNG APA PUN. Ia menerima `MoneyLine[]` yang
 * sudah jadi — dari `deriveScheduleMoney` (yang memegang aturan `fundsPrizePool`
 * asal sql/37) atau `calculateTotalCost`. Menghitung ulang di lapisan tampilan
 * adalah cacat yang baru saja ditutup; jangan dibuka lagi lewat pintu ini.
 */

/**
 * Apakah rinciannya terlihat sekarang? — diangkat keluar dari komponen supaya
 * bisa diuji tanpa merender apa pun.
 *
 * Proyek ini menguji logika murni, bukan DOM (nol `@testing-library` di
 * `package.json`), jadi keputusan yang layak dikunci tes harus bisa dipanggil
 * sebagai fungsi. Yang dikunci di sini: `full` SELALU terbuka — `defaultOpen`
 * maupun klik tidak bisa menutupnya — sementara `compact` mengikuti state.
 */
export function isDetailVisible(
  variant: 'full' | 'compact',
  isOpen: boolean,
): boolean {
  return variant === 'full' ? true : isOpen;
}

export interface CostBreakdownProps {
  total: number;
  /** `null` = rincian tidak tersimpan untuk jadwal ini (order pra-PPN). */
  lines: MoneyLine[] | null;
  /** Kenapa rinciannya tidak ada, kalau memang tidak ada. */
  note?: string;
  /** Angkanya hitungan tarif hari ini, belum pernah ditagih. */
  isEstimate?: boolean;
  /**
   * `'full'`    — selalu terbuka, tanpa tombol. Untuk Ringkasan, tempat angkanya
   *               MASIH BISA DIUBAH (durasi, hadiah, voucher) sehingga rincian
   *               penuh memang yang sedang diputuskan.
   * `'compact'` — total dulu, rincian atas permintaan. Untuk halaman jadwal,
   *               tempat harganya sudah ditetapkan dan yang diputuskan TANGGAL;
   *               rincian penuh di sana cuma bersaing dengan kalender.
   */
  variant?: 'full' | 'compact';
  /**
   * Buka rincian sejak awal meski `compact`.
   *
   * ⚠️ WAJIB `true` untuk PERPANJANGAN: tidak ada Ringkasan di belakangnya,
   * jadi layar jadwal satu-satunya tempat harga pernah muncul sama sekali.
   */
  defaultOpen?: boolean;
  /** Label total. Bawaannya `totalPaymentLabel`. */
  totalLabel?: string;
  className?: string;
}

/** Satu baris rincian — bentuknya identik di kedua varian, sengaja. */
function BreakdownLine({ line }: { line: MoneyLine }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="min-w-0">
        {line.tone === 'addon' ? (
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> {line.label}
          </span>
        ) : line.label}
        {line.hint && (
          <span className="text-[11px] text-slate-400 font-normal"> ({line.hint})</span>
        )}
      </span>
      <span className={`font-semibold shrink-0 tabular-nums ${
        line.tone === 'discount' ? 'text-emerald-600'
          : line.tone === 'addon' ? 'text-amber-600'
            : 'text-slate-900'
      }`}>
        {line.amount < 0 ? `-${formatIDR(Math.abs(line.amount))}` : formatIDR(line.amount)}
      </span>
    </div>
  );
}

export function CostBreakdown({
  total,
  lines,
  note,
  isEstimate = false,
  variant = 'compact',
  defaultOpen = false,
  totalLabel,
  className = '',
}: CostBreakdownProps) {
  const { t } = useLanguage();
  // `full` tidak punya tombol, jadi state-nya tidak pernah dibaca di sana.
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasDetail = !!(lines || note);
  const showDetail = isDetailVisible(variant, isOpen);

  const detail = hasDetail && showDetail && (
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 space-y-2 text-xs font-normal text-slate-600">
      {lines
        ? lines.map((line, i) => <BreakdownLine key={`${line.label}-${i}`} line={line} />)
        : <p className="leading-relaxed">{note}</p>}
    </div>
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">
          {totalLabel ?? t('totalPaymentLabel')}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-jfu-primary tabular-nums">
            {formatIDR(total)}
          </span>
          {/* Tombol hanya untuk `compact` — di `full` rinciannya memang selalu
              terbuka, jadi tombol yang tidak pernah menutup apa pun cuma bising. */}
          {variant === 'compact' && hasDetail && (
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-expanded={isOpen}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-jfu-primary transition-colors py-0.5 px-1.5 rounded-md hover:bg-slate-100/80 cursor-pointer"
            >
              <span>{isOpen ? t('hideCostBreakdown') : t('viewCostBreakdown')}</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* ⚠️ "Estimasi", bukan "tagihan". `recordedVsBilled` membuktikan
          `total_cost` dan `invoices.amount` bisa menyimpang — menyebutnya
          tagihan adalah janji yang tidak selalu bisa ditepati. */}
      {isEstimate && (
        <p className="text-[11px] text-slate-500 font-normal leading-relaxed">
          {t('costIsEstimateNote')}
        </p>
      )}

      {detail}
    </div>
  );
}
