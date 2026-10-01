import {
  adRateAt, calculateAdCostPerDay, calculateDiscount, calculateIncentiveCost, getKilatAddonCost,
  rateInstantOf, tierIndexOf,
} from '@/utils/cost-calculator';
import { AD_TIER_LABELS } from '@/utils/constants';
import { formatYmdId, toWibYmd } from '@/utils/airing-window';
import { formatIDR } from '@/utils/currency';
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
  /**
   * Kapan masa berlaku voucher dinilai — `voucherInstantOf(order.created_at)`.
   *
   * ⚠️ BUKAN "sekarang". Setiap voucher punya tenggatnya sendiri, dan
   * `create-payment.js` menilainya dengan `created_at` ORDER. Selama nilai ini
   * tidak dioper, tagihan yang diterbitkan admin sehari sesudah tenggat
   * menghitung harga PENUH sementara server menghitung harga berdiskon untuk
   * order yang sama — dua angka untuk satu pesanan.
   *
   * Pada tagihan gabungan ia dinilai PER BUNDEL: satu tagihan boleh memuat
   * pesanan yang lahir sebelum tenggat (didiskon) dan sesudahnya (harga penuh).
   *
   * Kosong = sekarang, mempertahankan perilaku pemanggil yang belum menyediakannya.
   */
  voucherInstantMs?: number;
  /**
   * Instan TARIF — `rateInstantOf(entry.rateLockedAt)` (sql/103). WAJIB, tanpa
   * default: tagihan Desember untuk order Oktober harus memakai tarif Oktober,
   * persis seperti yang dihitung create-payment.js. Berbeda dari
   * `voucherInstantMs` untuk jadwal yang dipesan ulang sesudah dilepas.
   */
  rateInstantMs: number;
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
      price: calculateAdCostPerDay(questionCount, input.rateInstantMs),
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
  // Harga satuan = tarif EFEKTIF (yang ditagih). Invoice & kwitansi sengaja
  // tidak memuat baris "Harga perkenalan" — sama seperti voucher yang sejak
  // dulu dilipat ke harga satuan (rencana 29 Sep, layar ⑧).
  const costPerDay = calculateAdCostPerDay(questionCount, input.rateInstantMs);
  const adCost = costPerDay * duration;
  const incentiveCost = calculateIncentiveCost(winnerCount, prizePerWinner);
  const discount = calculateDiscount(input.voucherCode || undefined, adCost, incentiveCost, duration, input.voucherInstantMs ?? Date.now());

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
    /** Lihat `OrderPricingInput.voucherInstantMs`. */
    voucherInstantMs?: number;
  }
): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  // Instan tarif perpanjangan = saat ia dipesan (atau dipesan ulang) — sql/103.
  const costPerDay = calculateAdCostPerDay(opts.questionCount || 0, rateInstantOf(entry.rateLockedAt));
  const duration = entry.duration || 0;

  if (costPerDay > 0 && duration > 0) {
    const adCost = costPerDay * duration;
    const incentiveCost = entry.isNewPeriod
      ? calculateIncentiveCost(entry.winnerCount, entry.prizePerWinner)
      : 0;
    const discount = calculateDiscount(opts.voucherCode || undefined, adCost, incentiveCost, duration, opts.voucherInstantMs ?? Date.now());
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


/**
 * Baris konteks di atas daftar item: dari tarif mana harga satuan iklan datang.
 *
 * Harga satuan iklan sengaja hanya tarif EFEKTIF (lihat `buildOrderInvoiceItems`),
 * jadi tanpa baris ini admin melihat "Rp300.000" tanpa tahu bahwa harga
 * normalnya Rp500.000 dan sampai kapan harga perkenalannya berlaku — dan tidak
 * bisa menjawab peneliti yang bertanya. Instan tarifnya SAMA dengan prefill
 * (`rateInstantOf(entry.rateLockedAt)`), jadi angkanya selalu cocok dengan item.
 *
 * `null` = belum ada jumlah soal (tidak ada tarif untuk diterangkan).
 */
export function rateContextOf(input: {
  questionCount?: number | null;
  rateLockedAt: string | null | undefined;
  isKilat?: boolean;
  nowMs?: number;
}): string | null {
  const questionCount = input.questionCount || 0;
  if (!questionCount) return null;
  const nowMs = input.nowMs ?? Date.now();
  const atMs = rateInstantOf(input.rateLockedAt, nowMs);
  const { list, effective, introUntil } = adRateAt(questionCount, atMs);
  const isLocked = !Number.isNaN(Date.parse(input.rateLockedAt ?? ''));
  const lock = isLocked
    ? `dikunci ${formatYmdId(toWibYmd(new Date(atMs)))}`
    : 'belum dikunci — memakai tarif hari ini';
  let text = `Tarif ${AD_TIER_LABELS[tierIndexOf(questionCount)]} soal, ${lock}: ${formatIDR(effective)}/hari`;
  if (introUntil) {
    text += ` · normal ${formatIDR(list)} · harga perkenalan s/d ${formatYmdId(introUntil)}`;
  }
  if (input.isKilat) text += ' · Kilat: tarif 1× + add-on';
  return text;
}

const AD_CATEGORY: InvoiceItem['category'] = 'Jakpat for Universities (ads)';

/**
 * Harga satuan iklan TERENDAH di daftar item — `null` bila tidak ada baris
 * iklan. Pembanding penanda "di bawah harga sistem" di InvoiceForm; dipanggil
 * pada hasil prefill (= harga sistem, voucher sudah terlipat) dan pada item
 * yang sedang disunting admin.
 */
export function adUnitPriceOf(items: readonly InvoiceItem[]): number | null {
  const prices = items.filter((it) => it.category === AD_CATEGORY).map((it) => it.price);
  return prices.length ? Math.min(...prices) : null;
}
