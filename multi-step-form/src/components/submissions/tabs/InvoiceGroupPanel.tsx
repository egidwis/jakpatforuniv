import { Check, ExternalLink, Layers } from 'lucide-react';
import { formatIDR } from '@/utils/currency';
import { formatWibShort } from '@/utils/airing-window';
import type { InvoiceGroup } from '@/utils/supabase';

/**
 * Panel "tagihan gabungan" di kartu jadwal admin.
 *
 * ⚠️ INFORMASI, BUKAN BARIS AKSI KEDUA — dan itu keputusan, bukan kelalaian.
 * Aksi kartu ini punya SATU sumber (`planCardActions`), dan invarian tab ini
 * berbunyi "maksimal satu tombol di luar menu ⋯". Menumbuhkan tombol
 * "Tandai Lunas"/"Batalkan" di sini berarti dua permukaan yang menawarkan aksi
 * uang yang sama, dengan dua gerbang yang bisa menyimpang — persis pola yang
 * dibongkar saat `PaymentSection` dibubarkan. Yang membuat cakupannya jujur
 * adalah LABEL aksinya ("Tandai Lunas (3 pesanan)") dan dialog konsekuensinya;
 * panel ini yang menyediakan buktinya: siapa saja yang ikut, dan berapa.
 *
 * Panel ini juga satu-satunya tempat di layar admin yang bisa menjawab
 * "pesanan mana lagi yang ikut tagihan ini" — anggota grup tersebar di ORDER
 * yang berbeda, jadi drawer order manapun hanya melihat potongannya sendiri.
 */
export function InvoiceGroupPanel({ group, currentScheduleId, expiresAt }: {
  group: InvoiceGroup;
  /** Jadwal yang kartunya sedang dibuka — ditandai «ini» di daftar. */
  currentScheduleId: string | null;
  /** Kapan link-nya mati. Null = tidak diketahui (baris pra-Bagian 3). */
  expiresAt?: string | null;
}) {
  if (group.memberCount < 2) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Layers className="w-3.5 h-3.5 shrink-0 text-blue-600" />
        <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide">
          Tagihan gabungan · {group.memberCount} pesanan
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-600">
          Total ditagih{' '}
          <strong className="font-semibold text-slate-900 tabular-nums">{formatIDR(group.total)}</strong>
        </span>
        {group.allPaid ? (
          <span className="font-semibold text-emerald-700">Lunas seluruhnya</span>
        ) : expiresAt ? (
          <span className="text-slate-500">
            Hidup s/d <strong className="font-semibold text-slate-700">{formatWibShort(expiresAt)}</strong>
          </span>
        ) : null}
      </div>

      <ul className="space-y-1">
        {group.members.map((m, i) => {
          const isCurrent = !!currentScheduleId && m.scheduleId === currentScheduleId;
          return (
            <li
              key={m.scheduleId ?? `${m.paymentId}-${i}`}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="min-w-0 flex items-center gap-1.5">
                <span className="text-slate-400 tabular-nums shrink-0">{i + 1}.</span>
                <span className={isCurrent ? 'truncate font-semibold text-slate-900' : 'truncate text-slate-600'}>
                  {m.title}
                </span>
                {/* Tanpa penanda ini admin harus mencocokkan judul sendiri untuk
                    tahu kartu mana yang sedang ia buka di dalam daftar anggota. */}
                {isCurrent && <span className="shrink-0 text-[10px] font-bold text-blue-700">◀ ini</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-slate-600">{formatIDR(m.amount)}</span>
                {m.isPaid ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700">
                    <Check className="w-3 h-3" /> lunas
                  </span>
                ) : (
                  <span className="text-slate-400">belum</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <a
        href={`/invoices/${group.paymentId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
      >
        Buka {group.allPaid ? 'kuitansi' : 'tagihan'} gabungan
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
