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
// Dipakai DUA LAYAR: kartu jadwal di drawer admin dan kartu Fase ② di
// dashboard peneliti. Sebelumnya masing-masing punya hitungannya sendiri, dan
// yang di sisi peneliti menghitung ulang dari nol — jadi satu order bisa
// berbunyi dua harga tergantung siapa yang membukanya. Berkasnya tinggal di
// `utils/` justru supaya tidak ada sisi yang "memiliki"-nya.
//
// Sampai Phase 3 tab admin SELALU memakai yang kedua, dan itu salah dua kali:
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
  submission: {
    questionCount?: number | null;
    question_count?: number | null;
    distribution_type?: string | null;
    distributionType?: string | null;
  },
): ScheduleMoney {
  const isKilat = entry.distributionType === 'kilat' || submission.distribution_type === 'kilat' || submission.distributionType === 'kilat';
  const questionCount = submission.question_count ?? submission.questionCount ?? 0;

  // ── Sudah ditagih ────────────────────────────────────────
  if (entry.totalCost > 0) {
    const total = entry.totalCost;

    if (entry.subtotal != null && entry.ppnAmount != null) {
      const incentive = storedIncentive(entry);
      const netAdCost = incentive != null ? entry.subtotal - incentive : null;
      const duration = entry.duration || 1;
      const voucher = entry.voucherCode ?? undefined;

      let grossAdCost = netAdCost;
      let discountAmount = 0;

      if (voucher && netAdCost != null && netAdCost > 0) {
        let calculatedGross = isKilat
          ? calculateAdCostPerDay(questionCount)
          : calculateTotalAdCost(questionCount, duration);
        let calculatedDiscount = isKilat ? 0 : calculateDiscount(voucher, calculatedGross, incentive || 0, duration);

        if (calculatedGross > 0 && Math.abs((calculatedGross - calculatedDiscount) - netAdCost) < 10) {
          grossAdCost = calculatedGross;
          discountAmount = calculatedDiscount;
        } else if (!isKilat) {
          // `question_count` kosong, jadi harga kotornya tidak bisa dihitung ulang
          // — ia harus dibalik dari nilai bersih yang tersimpan.
          //
          // ⚠️ JANGAN MENDAFTAR KODE VOUCHER DI SINI. `calculateDiscount` sudah
          // jadi sumber kebenaran (dan sudah punya satu duplikat di
          // create-payment.js yang wajib diubah bersamaan) — menaruh salinan
          // ketiga berarti tarif diam-diam menyimpang. Yang dilakukan: PROBE
          // fungsi itu di dua titik. Kalau diskonnya proporsional terhadap harga
          // (semua voucher persentase), dua probe memberi rasio yang sama dan
          // pembalikannya sah: net = gross × (1 − r).
          //
          // Voucher non-proporsional (JFUFEB/ILKOMUNY yang memakai cap harian,
          // JFUTGRX yang mematok total) sengaja TIDAK dibalik — dua probenya
          // berbeda, dan baris diskon dilewati alih-alih menampilkan angka karangan.
          const probeA = 1_000_000;
          const probeB = 2_000_000;
          const rateA = calculateDiscount(voucher, probeA, 0, duration) / probeA;
          const rateB = calculateDiscount(voucher, probeB, 0, duration) / probeB;
          const isProportional = Math.abs(rateA - rateB) < 1e-9 && rateA > 0 && rateA < 1;

          if (isProportional) {
            grossAdCost = Math.round(netAdCost / (1 - rateA));
            discountAmount = grossAdCost - netAdCost;
          }
        }
      }

      const lines: MoneyLine[] = [];

      if (grossAdCost != null && grossAdCost >= 0) {
        lines.push({
          label: 'Iklan',
          hint: entry.duration ? `${entry.duration} hari` : undefined,
          amount: grossAdCost,
        });

        if (discountAmount > 0) {
          lines.push({
            label: `Diskon Voucher (${voucher})`,
            amount: -discountAmount,
            tone: 'discount',
          });
        }

        if (incentive != null && incentive > 0) {
          lines.push({
            label: 'Reward',
            hint: `Rp ${entry.prizePerWinner.toLocaleString('id-ID')} × ${entry.winnerCount}`,
            amount: incentive,
          });
        }
      } else {
        lines.push({ label: 'Subtotal (DPP)', amount: entry.subtotal });
      }

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

  /*
    ── Jadwal yang DIBATALKAN: tidak ada yang bisa dikatakan jujur ──

    ⚠️ ESTIMASI ADALAH PENAWARAN; JADWAL YANG DIBATALKAN TIDAK SEDANG
    DITAWARKAN.

    Terukur di order af004b84: kartu jadwal #2 memajang "Estimasi Total
    Rp 3.108.000" padahal `total_cost` baris itu 0 dan tagihan sungguhannya
    Rp 444.000. Sebabnya persis di sini — `entry.totalCost > 0` dipakai sebagai
    "sudah ditagih", jadwal batal itu bernilai 0, dan cabang di bawah menghitung
    ulang 57 Qs × 7 hari dengan tarif HARI INI. Angka itu membantah header
    kartunya sendiri ("Rp 999.000 ditagih") DAN invoice yang benar-benar terbit.

    Untuk jadwal batal: tampilkan yang benar-benar tercatat, atau tidak sama
    sekali. `total` 0 + `lines: null` membuat kartu memilih diam.
  */
  if (entry.status === 'cancelled') {
    return {
      total: 0,
      isEstimate: false,
      lines: null,
      note: 'Jadwal dibatalkan — tidak ada nominal yang ditagihkan untuk jadwal ini.',
    };
  }

  // ── Belum ditagih: penawaran, bukan catatan ──────────────
  const duration = entry.duration || 0;
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
  if (discount > 0) lines.push({ label: `Diskon Voucher (${entry.voucherCode})`, amount: -discount, tone: 'discount' });
  if (incentive > 0) {
    lines.push({
      label: 'Reward',
      hint: `Rp ${entry.prizePerWinner.toLocaleString('id-ID')} × ${entry.winnerCount}`,
      amount: incentive,
    });
  }
  lines.push({ label: 'PPN 11%', amount: ppn });

  return { total: subtotal + ppn, isEstimate: true, lines };
}
