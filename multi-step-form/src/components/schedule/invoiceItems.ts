import {
  calculateAdCostPerDay, calculateDiscount, calculateIncentiveCost, getKilatAddonCost,
} from '@/utils/cost-calculator';
import type { AdScheduleEntry } from '@/utils/supabase';

// ─────────────────────────────────────────────────────────────
// Prefill item tagihan.
//
// Dua bentuk, karena jadwal pertama dan jadwal perpanjangan memang ditagih
// berbeda: yang pertama menagih seluruh order (iklan + insentif + potongan
// voucher), yang berikutnya menagih tambahannya saja (iklan + hadiah batch).
// Sebelumnya keduanya hidup di berkas terpisah yang tidak saling tahu.
// ─────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  category: string;
}

export const ITEM_CATEGORIES = [
  'Jakpat for Universities (ads)',
  'Jakpat for Universities (Platform)',
  "Respondent's Incentive",
  'Lainnya',
] as const;

let seq = 0;
const nextId = () => `${Date.now()}-${seq++}`;

export interface OrderPricingInput {
  duration?: number | null;
  questionCount?: number | null;
  winnerCount?: number | null;
  prizePerWinner?: number | null;
  voucherCode?: string | null;
  isKilat?: boolean;
}

/**
 * Prefill jadwal PERTAMA — menagih ordernya.
 *
 * Diangkat apa adanya dari `SchedulePaymentView.initializeInvoiceItems`.
 * Mengembalikan `{ items, note }` supaya cabang voucher testing tetap bisa
 * menitipkan memo-nya.
 */
export function buildOrderInvoiceItems(
  input: OrderPricingInput
): { items: InvoiceItem[]; note: string } {
  const duration = input.duration || 0;
  const questionCount = input.questionCount || 0;
  const winnerCount = input.winnerCount || 0;
  const prizePerWinner = input.prizePerWinner || 0;

  if (input.voucherCode?.toUpperCase() === 'JFUTGRX') {
    return {
      items: [{
        id: nextId(),
        name: 'System Testing Fee (JFUTGRX)',
        qty: 1,
        price: 1000,
        category: 'Lainnya',
      }],
      note: 'Testing Voucher JFUTGRX Applied',
    };
  }

  // JFU Kilat dihargai lain sama sekali: base rate 1× (durasi tidak berlaku
  // — Kilat selesai dalam ~2 jam), ditambah add-on, tanpa diskon voucher.
  // Rumus ini WAJIB sama dengan salinan otoritatif di
  // functions/api/doku/create-payment.js; kalau user membayar lewat
  // link-nya sendiri, server menghitung ulang dan akan menimpa total_cost
  // yang tidak cocok. Sebelum cabang ini ada, invoice Kilat dari dashboard
  // admin memakai rumus regular — add-on Rp 200.000 tidak pernah tertagih
  // dan base rate justru dikali durasi yang tidak berarti.
  if (input.isKilat) {
    const kilatItems: InvoiceItem[] = [{
      id: nextId(),
      name: 'Jakpat for Universities (ads)',
      qty: 1,
      price: calculateAdCostPerDay(questionCount),
      category: 'Jakpat for Universities (ads)',
    }, {
      id: nextId(),
      name: 'Add-on JFU Kilat',
      qty: 1,
      price: getKilatAddonCost(input.voucherCode || undefined),
      category: 'Lainnya',
    }];
    if (prizePerWinner > 0 && winnerCount > 0) {
      kilatItems.push({
        id: nextId(),
        name: "Respondent's Incentive",
        qty: winnerCount,
        price: prizePerWinner,
        category: "Respondent's Incentive",
      });
    }
    return { items: kilatItems, note: '' };
  }

  const invoiceItems: InvoiceItem[] = [];
  const costPerDay = calculateAdCostPerDay(questionCount);
  const adCost = costPerDay * duration;
  const incentiveCost = calculateIncentiveCost(winnerCount, prizePerWinner);
  const discount = calculateDiscount(input.voucherCode || undefined, adCost, incentiveCost, duration);

  if (costPerDay > 0 && duration > 0) {
    // Kalau ada diskon, terapkan ke tarif harian supaya tampilannya bersih.
    const discountedPerDay = discount > 0
      ? Math.max(0, costPerDay - Math.ceil(discount / duration))
      : costPerDay;
    invoiceItems.push({
      id: nextId(),
      name: 'Jakpat for Universities (ads)',
      qty: duration,
      price: discountedPerDay,
      category: 'Jakpat for Universities (ads)',
    });
  }
  if (prizePerWinner > 0 && winnerCount > 0) {
    invoiceItems.push({
      id: nextId(),
      name: "Respondent's Incentive",
      qty: winnerCount,
      price: prizePerWinner,
      category: "Respondent's Incentive",
    });
  }

  if (invoiceItems.length === 0) {
    invoiceItems.push({
      id: nextId(),
      name: 'Jakpat for Universities (ads)',
      qty: 1,
      price: 0,
      category: 'Jakpat for Universities (ads)',
    });
  }

  return { items: invoiceItems, note: '' };
}

/**
 * Prefill jadwal PERPANJANGAN — menagih tambahannya.
 *
 * `poolWinnerCount` adalah jumlah pemenang pool yang ditumpangi tagihan
 * tambahan ini, di-resolve di server untuk batch JADWAL INI — bukan jumlah
 * pemenang order induknya.
 *
 * Bedanya uang. Tagihan tambahan dihargai "additional prize × pemenang batch
 * yang ditambahi", dan pratinjau di form pembuatan jadwal memang selalu
 * menampilkan itu. Invoice-nya dulu dibangun dari jumlah pemenang order induk,
 * jadi peneliti bisa dikutip satu angka dan ditagih angka lain setiap kali
 * batch berikutnya mendanai jumlah pemenang yang berbeda.
 *
 * Jatuh kembali ke jumlah induk hanya kalau RPC tidak menjawab: itu perilaku
 * lama, dan invoice dengan kuantitas masuk akal lebih baik daripada tanpa
 * invoice.
 */
export function buildExtensionInvoiceItems(
  entry: AdScheduleEntry,
  opts: {
    questionCount?: number | null;
    poolWinnerCount?: number;
    fallbackWinnerCount?: number;
    /**
     * Voucher yang diketik admin untuk TAGIHAN ini.
     *
     * ⚠️ Jadwal perpanjangan tidak pernah punya voucher sendiri sebelum ini —
     * harganya selalu `tarif × durasi` polos. Karena voucher milik tagihan
     * (bukan order), admin boleh menerapkannya di sini; angkanya terlihat di
     * layar sebelum link pembayaran dibuat.
     */
    voucherCode?: string | null;
  }
): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const costPerDay = calculateAdCostPerDay(opts.questionCount || 0);
  const duration = entry.duration || 0;

  if (costPerDay > 0 && duration > 0) {
    const adCost = costPerDay * duration;
    const incentiveCost = entry.isNewPeriod
      ? calculateIncentiveCost(entry.winnerCount, entry.prizePerWinner)
      : 0;
    const discount = calculateDiscount(opts.voucherCode || undefined, adCost, incentiveCost, duration);
    const discountedPerDay = discount > 0
      ? Math.max(0, costPerDay - Math.ceil(discount / duration))
      : costPerDay;
    items.push({
      id: nextId(),
      name: 'Jakpat for Universities (ads)',
      qty: duration,
      price: discountedPerDay,
      category: 'Jakpat for Universities (ads)',
    });
  }

  // Hadiah untuk batch baru.
  if (entry.isNewPeriod && entry.prizePerWinner > 0 && entry.winnerCount > 0) {
    items.push({
      id: nextId(),
      name: "Respondent's Incentive (New Batch)",
      qty: entry.winnerCount,
      price: entry.prizePerWinner,
      category: "Respondent's Incentive",
    });
  }

  // Tambahan hadiah untuk batch berjalan.
  if (!entry.isNewPeriod && entry.additionalPrizePerWinner > 0) {
    items.push({
      id: nextId(),
      name: 'Additional Prize per Winner',
      qty: opts.poolWinnerCount || opts.fallbackWinnerCount || 1,
      price: entry.additionalPrizePerWinner,
      category: "Respondent's Incentive",
    });
  }

  if (items.length === 0) {
    items.push({
      id: nextId(),
      name: 'Jakpat for Universities (ads)',
      qty: 1,
      price: 0,
      category: 'Jakpat for Universities (ads)',
    });
  }

  return items;
}

export function newBlankItem(): InvoiceItem {
  return { id: nextId(), name: '', qty: 1, price: 0, category: 'Lainnya' };
}


/**
 * Apa yang voucher ini lakukan terhadap harga — untuk ditampilkan di bawah
 * kolom isian, supaya admin melihat efeknya sebelum link pembayaran dibuat.
 *
 * `null` = kode tidak dikenali. Sengaja tidak dilempar sebagai error: daftar
 * voucher hidup di `cost-calculator.ts` dan admin memang kadang mengetik kode
 * kampanye yang belum terdaftar di sana.
 */
export function describeVoucher(
  voucherCode: string | null | undefined,
  input: { adCost: number; incentiveCost: number; duration: number }
): { discount: number; label: string } | null {
  const code = (voucherCode || '').trim();
  if (!code) return null;
  if (code.toUpperCase() === 'JFUTGRX') {
    return { discount: 0, label: 'Voucher uji sistem — tagihan dipatok Rp 1.000' };
  }
  const discount = calculateDiscount(code, input.adCost, input.incentiveCost, input.duration);
  if (discount <= 0) return null;
  return {
    discount,
    label: `Potongan Rp ${discount.toLocaleString('id-ID')} diterapkan ke baris iklan`,
  };
}
