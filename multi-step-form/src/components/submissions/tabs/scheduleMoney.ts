import type { AdScheduleEntry } from '@/utils/supabase';
import {
  calculateTotalAdCost, calculateIncentiveCost, calculateDiscount,
  calculateAdCostPerDay, calculatePpn, getKilatAddonCost,
} from '@/utils/cost-calculator';

// ─────────────────────────────────────────────────────────────
// Berapa uang untuk SATU jadwal.
//
// ⚠️ ADA DUA ANGKA YANG BERBEDA DAN TIDAK BOLEH TERTUKAR:
//
//   YANG DITAGIH  — `ad_schedules.total_cost`, catatan sejarah. Inilah yang
//                   benar-benar keluar sebagai tagihan ke peneliti.
//   ESTIMASI      — dihitung ulang dari tarif HARI INI.
//
// Sampai Phase 3 tab ini SELALU memakai yang kedua, dan itu salah dua kali:
//   * untuk order lama ia menampilkan harga hari ini atas order yang ditagih
//     dengan tarif lama — angka yang tidak pernah ada di invoice mana pun;
//   * untuk jadwal ke-2 dst. ia memakai rumus ORDER (base × durasi order),
//     bukan rumus perpanjangan. Terukur di produksi: "Kuesioner Persepsi
//     Ideologi" #1 ditagih Rp 1.110.000 dan #2 ditagih berbeda, tapi hitung
//     ulang menghasilkan angka yang sama untuk keduanya.
//
// Aturannya: kalau sudah pernah ditagih, TAMPILKAN YANG DITAGIH. Estimasi hanya
// untuk jadwal yang belum punya tagihan — di situ ia memang penawaran, bukan
// catatan.
// ─────────────────────────────────────────────────────────────

export interface MoneyLine {
  label: string;
  hint?: string;
  amount: number;
  tone?: 'discount' | 'addon';
}

export interface ScheduleMoney {
  total: number;
  /** true = belum pernah ditagih; angkanya hitungan tarif hari ini. */
  isEstimate: boolean;
  /** null = rincian tidak tersimpan untuk jadwal ini (order pra-PPN). */
  lines: MoneyLine[] | null;
  /** Kenapa rinciannya tidak ada, kalau memang tidak ada. */
  note?: string;
}

/** Insentif yang tersimpan untuk jadwal ini, kalau bisa dipercaya. */
function storedIncentive(e: AdScheduleEntry): number | null {
  // Top-up menempel ke pool berjalan, dan jumlah pemenang pool itu TIDAK
  // tersimpan di baris ini — mengalikannya dengan winner_count baris ini akan
  // menghasilkan angka karangan. Untuk kasus itu kita menolak memecah.
  if (e.additionalPrizePerWinner > 0) return null;
  return e.prizePerWinner * e.winnerCount;
}

export function deriveScheduleMoney(
  entry: AdScheduleEntry,
  submission: { questionCount?: number | null; distribution_type?: string | null },
): ScheduleMoney {
  const isKilat = entry.distributionType === 'kilat';

  // ── Sudah ditagih ────────────────────────────────────────
  if (entry.totalCost > 0) {
    const total = entry.totalCost;

    if (entry.subtotal != null && entry.ppnAmount != null) {
      const incentive = storedIncentive(entry);
      const adCost = incentive != null ? entry.subtotal - incentive : null;

      // Pecah jadi iklan + insentif hanya kalau hasilnya masuk akal. Selisih
      // negatif berarti asumsinya tidak berlaku untuk baris ini — lebih baik
      // menampilkan DPP utuh daripada dua angka yang tidak menjumlah.
      const lines: MoneyLine[] =
        adCost != null && adCost >= 0
          ? [
              { label: 'Iklan', hint: entry.duration ? `${entry.duration} hari` : undefined, amount: adCost },
              ...(incentive! > 0
                ? [{
                    label: 'Insentif',
                    hint: `Rp ${entry.prizePerWinner.toLocaleString('id-ID')} × ${entry.winnerCount}`,
                    amount: incentive!,
                  }]
                : []),
            ]
          : [{ label: 'Subtotal (DPP)', amount: entry.subtotal }];

      lines.push({ label: 'PPN 11%', amount: entry.ppnAmount });
      return { total, isEstimate: false, lines };
    }

    return {
      total,
      isEstimate: false,
      lines: null,
      note: 'Rincian tidak tersimpan — order sebelum PPN diberlakukan (sql/34).',
    };
  }

  // ── Belum ditagih: penawaran, bukan catatan ──────────────
  const duration = entry.duration || 0;
  const questionCount = submission.questionCount || 0;
  const incentive = calculateIncentiveCost(entry.winnerCount, entry.prizePerWinner);

  // Kilat: base rate 1× (durasi tidak berlaku — selesai ~2 jam), plus add-on,
  // tanpa diskon voucher. Rumus yang sama dipakai invoice admin dan
  // functions/api/doku/create-payment.js.
  const adCost = isKilat
    ? calculateAdCostPerDay(questionCount)
    : calculateTotalAdCost(questionCount, duration);
  const voucher = entry.voucherCode ?? undefined;
  const addon = isKilat ? getKilatAddonCost(voucher) : 0;
  const discount = isKilat ? 0 : calculateDiscount(voucher, adCost, incentive, duration);

  const subtotal = adCost - discount + addon + incentive;
  const ppn = calculatePpn(subtotal);

  const lines: MoneyLine[] = [
    {
      label: 'Iklan',
      hint: isKilat ? `${questionCount} Qs · base rate` : `${questionCount} Qs × ${duration} hari`,
      amount: adCost,
    },
  ];
  if (addon > 0) lines.push({ label: 'Add-on JFU Kilat', amount: addon, tone: 'addon' });
  if (discount > 0) lines.push({ label: `Diskon (${entry.voucherCode})`, amount: -discount, tone: 'discount' });
  if (incentive > 0) {
    lines.push({
      label: 'Insentif',
      hint: `Rp ${entry.prizePerWinner.toLocaleString('id-ID')} × ${entry.winnerCount}`,
      amount: incentive,
    });
  }
  lines.push({ label: 'PPN 11%', amount: ppn });

  return { total: subtotal + ppn, isEstimate: true, lines };
}
