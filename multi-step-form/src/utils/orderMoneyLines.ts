import type { CostCalculation } from '../types';
import type { MoneyLine } from './scheduleMoney';

/**
 * Jembatan `CostCalculation` → `MoneyLine[]`.
 *
 * ⚠️ MASALAH YANG DITUTUPNYA. Ringkasan menghitung dengan `calculateTotalCost`
 * (bentuk `CostCalculation`) sementara kartu jadwal memakai
 * `deriveScheduleMoney` (bentuk `MoneyLine[]`). Sampai modul ini lahir keduanya
 * MENGGAMBAR baris rinciannya sendiri-sendiri — dua blok JSX terpisah — jadi
 * urutan baris, tanda diskon, dan labelnya bisa menyimpang tanpa ada yang
 * menyadarinya sampai peneliti membandingkan dua layar.
 *
 * ⚠️ MODUL INI TIDAK MENGHITUNG APA PUN. Setiap angka datang apa adanya dari
 * `CostCalculation`. Menghitung ulang di sini akan melahirkan sumber kebenaran
 * KETIGA untuk harga — persis cacat yang sedang ditutup.
 */

export interface OrderLineContext {
  questionCount: number;
  duration: number;
  isKilat?: boolean;
  voucherCode?: string;
}

/**
 * Urutannya SENGAJA dicocokkan dengan `deriveScheduleMoney`:
 * Iklan → Diskon → Add-on → Reward → PPN.
 *
 * Peneliti melihat rincian yang sama di Ringkasan dan di kartu jadwal; urutan
 * yang berbeda membuat keduanya terasa seperti dua tagihan yang berbeda.
 */
export function orderMoneyLines(
  calc: CostCalculation,
  ctx: OrderLineContext,
): MoneyLine[] {
  const lines: MoneyLine[] = [];

  lines.push({
    label: 'Iklan',
    labelKey: 'costLineAd',
    // Kilat selesai ~2 jam, jadi durasinya tidak berlaku — menyebut "× 1 hari"
    // mengesankan jendela tayang yang tidak pernah ada.
    hint: ctx.isKilat
      ? `${ctx.questionCount} Qs · base rate`
      : `${ctx.questionCount} Qs × ${ctx.duration} hari`,
    hintKey: ctx.isKilat ? undefined : 'costHintQsDays',
    hintVars: { q: ctx.questionCount, d: ctx.duration },
    amount: calc.adCost,
  });

  if (calc.discount > 0) {
    // ⚠️ NEGATIF, sama seperti `deriveScheduleMoney`. `CostBreakdown` memakai
    // tandanya untuk memutuskan merender "-"; tanda positif membuat diskon
    // terbaca seperti biaya tambahan.
    lines.push({
      label: ctx.voucherCode ? `Diskon Voucher (${ctx.voucherCode})` : 'Diskon Voucher',
      labelKey: ctx.voucherCode ? 'costLineVoucherNamed' : 'costLineVoucher',
      labelVars: { code: ctx.voucherCode ?? '' },
      amount: -calc.discount,
      tone: 'discount',
    });
  }

  if (calc.kilatAddonCost && calc.kilatAddonCost > 0) {
    lines.push({ label: 'Add-on JFU Kilat', labelKey: 'costLineKilatAddon', amount: calc.kilatAddonCost, tone: 'addon' });
  }

  // Nol dilewati, bukan ditampilkan "Rp 0" — baris nol cuma bising.
  if (calc.incentiveCost > 0) {
    lines.push({ label: 'Reward', labelKey: 'costLineReward', amount: calc.incentiveCost });
  }

  /*
    ⚠️ SUBTOTAL (DPP) WAJIB ADA di Ringkasan, dan ia BUKAN sekadar jumlah baris
    di atasnya — ia Dasar Pengenaan Pajak, angka yang PPN 11% dihitung darinya.
    Blok lama menampilkannya; menghilangkannya membuat peneliti tidak bisa
    memverifikasi pajaknya sendiri, dan itu informasi yang sah ia minta.

    Ditandai `isSubtotal` supaya `CostBreakdown` bisa memisahkannya secara
    visual dari baris komponen biaya — ia RANGKUMAN baris di atasnya, bukan
    penambah baru. Tanpa pemisahan itu, menjumlahkan seluruh kolom akan
    menghitung ganda.
  */
  lines.push({ label: 'Subtotal (DPP)', labelKey: 'costLineSubtotal', amount: calc.subtotal, isSubtotal: true });

  lines.push({ label: 'PPN 11%', labelKey: 'costLinePpn', amount: calc.ppn });

  return lines;
}
