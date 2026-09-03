import { calculatePpn } from './cost-calculator';

/**
 * Menyusun SATU dokumen tagihan/kuitansi dari N baris pembayaran.
 *
 * Satu `payment_id` boleh dipakai N pesanan (tagihan gabungan). Halaman
 * invoice dulu menurunkan SEMUA angkanya dari satu baris — dan memperbaiki
 * query-nya saja tidak cukup: setiap turunan itu harus naik ke tingkat grup,
 * atau dokumennya berbohong dengan tenang.
 *
 * ⚠️ DOKUMEN INI DIPAKAI UNTUK PERTANGGUNGJAWABAN DANA KAMPUS. Kesalahan di
 * sini tidak berhenti di layar.
 *
 * Murni & teruji, bukan turunan di dalam komponen 700 baris — enam turunannya
 * semua soal uang dan soal bukti pembayaran.
 */

export interface DocItem {
  name?: string;
  category?: string;
  price: number;
  qty?: number;
}

/** Satu baris `transactions` (dengan `form_submissions` yang ikut di-join). */
export interface DocRow {
  payment_id: string;
  form_submission_id?: string;
  entity_type?: 'submission' | 'extend';
  extend_id?: string | null;
  billed_start_date?: string | null;
  amount: number;
  subtotal?: number | null;
  ppn_amount?: number | null;
  status: string;
  note?: string | null;
  created_at?: string;
  form_submissions?: {
    id?: string;
    title?: string;
    start_date?: string | null;
    end_date?: string | null;
    duration?: number | null;
    distribution_type?: string | null;
  } | null;
}

export interface ScheduleInfo {
  startDate?: string | null;
  endDate?: string | null;
  duration?: number | null;
  distributionType?: string | null;
  kilatSlotHour?: number | null;
}

/** Satu pesanan di dalam dokumen: judulnya, jadwalnya, item-itemnya. */
export interface DocBundle {
  /** Kunci jadwal — `extend_id` untuk jadwal ke-2 dst., `form_submission_id` selain itu. */
  sourceId: string | null;
  title: string;
  items: DocItem[];
  schedule: ScheduleInfo;
  subtotal: number;
  ppn: number;
  amount: number;
  isPaid: boolean;
}

export interface InvoiceDocument {
  bundles: DocBundle[];
  subtotal: number;
  ppn: number;
  total: number;
  /** RECEIPT hanya kalau SEMUA baris lunas — lihat catatan di bawah. */
  isPaid: boolean;
  /**
   * Σ nominal bundel yang SUDAH lunas, dan sisanya.
   *
   * ⚠️ ADA KEADAAN KETIGA, DAN DOKUMEN INI DULU BUTA TERHADAPNYA. `isPaid`
   * menjawab "semua lunas?" — jawabannya `false` sama untuk grup yang nol
   * rupiah masuk DAN grup yang 2 dari 3 pesanannya sudah dibayar. Keduanya
   * dirender identik: INVOICE bernominal PENUH, lengkap dengan tombol bayar.
   *
   * Grup separuh-lunas bukan hipotesis: `unmarkScheduleAsPaid` bisa membalik
   * satu anggota, dan `settleGroupAsPaid` bisa gagal di anggota ke-3 (loopnya
   * tidak transaksional).
   */
  paidTotal: number;
  outstanding: number;
  /** Ada yang lunas, tapi tidak semua. */
  isPartiallyPaid: boolean;
  hasPpn: boolean;
  showMaterai: boolean;
  /** Baris mana pun boleh mengoreksi item basi (Kilat 250rb → 200rb). */
  itemsWereCorrected: boolean;
}

/** Bea meterai (UU 10/2020) — di bawah ini tidak diperlukan. */
export const MATERAI_THRESHOLD = 5_000_000;

const isRowPaid = (status: string | null | undefined) =>
  ['completed', 'paid'].includes((status || '').toLowerCase());

/** Kunci jadwal baris ini: extend memakai `extend_id`, ordinal 1 memakai ordernya. */
export function sourceIdOf(row: DocRow): string | null {
  if (row.entity_type === 'extend' && row.extend_id) return row.extend_id;
  return row.form_submission_id || row.form_submissions?.id || null;
}

interface ParsedItems {
  items: DocItem[];
  corrected: boolean;
}

/**
 * Item satu baris, plus koreksi yang sudah lama berlaku di halaman ini.
 *
 * ⚠️ `note` tiap baris HANYA memuat item pesanannya sendiri (dijamin
 * `buildInvoiceRows`). Kalau suatu saat ada penulis yang menyalin seluruh item
 * formulir ke tiap baris, di sinilah akibatnya muncul: setiap item tercetak N
 * kali dan totalnya N× lipat.
 */
export function parseRowItems(row: DocRow): ParsedItems {
  let items: DocItem[] = [];
  try {
    if (row.note && row.note.trim().startsWith('{')) {
      items = JSON.parse(row.note).items || [];
    }
  } catch {
    items = [];
  }
  if (items.length === 0) {
    items = [{ category: 'Pembayaran', price: row.subtotal ?? row.amount, qty: 1 }];
  }

  let corrected = false;
  items = items.map((item) => {
    const updated = { ...item };
    if ((updated.name === 'Add-on JFU Kilat' || updated.category === 'Add-on JFU Kilat') && updated.price === 250000) {
      corrected = true;
      updated.price = 200000;
    }
    if (updated.name && /incentive/i.test(updated.name)) {
      updated.name = updated.name.replace(/incentive/gi, 'Reward');
    }
    if (updated.category && /incentive/i.test(updated.category)) {
      updated.category = updated.category.replace(/incentive/gi, 'Reward');
    }
    return updated;
  });

  return { items, corrected };
}

/**
 * N baris → satu dokumen.
 *
 * `schedules` memetakan `sourceId` → jadwal yang sudah diambil pemanggil (satu
 * lookup `ad_schedules` per baris). Baris tanpa entri di sana jatuh ke tanggal
 * yang menempel di baris/ordernya sendiri.
 */
export function buildInvoiceDocument(
  rows: DocRow[],
  schedules: Map<string, ScheduleInfo> = new Map(),
): InvoiceDocument {
  const bundles: DocBundle[] = rows.map((row) => {
    const { items, corrected } = parseRowItems(row);
    const sourceId = sourceIdOf(row);

    const itemsSubtotal = items.reduce((sum, it) => sum + (it.price * (it.qty || 1)), 0);
    /**
     * ⚠️ JALUR KOREKSI MENGABAIKAN `subtotal`/`amount` YANG TERSIMPAN dan
     * menghitung ulang dari item — perilaku yang sudah berlaku sebelum grup ada.
     * Untuk grup ia harus menghitung ulang dari item BARIS INI, lalu
     * dijumlahkan; melewatkannya membuat total kuitansi diam-diam menyusut jadi
     * porsi satu pesanan.
     */
    const subtotal = corrected
      ? itemsSubtotal
      : (row.subtotal ?? (row.amount - (row.ppn_amount ?? 0)));
    const ppn = corrected ? calculatePpn(subtotal) : (row.ppn_amount ?? 0);
    const amount = corrected ? subtotal + ppn : row.amount;

    const fallback: ScheduleInfo = {
      startDate: row.billed_start_date || row.form_submissions?.start_date || null,
      endDate: row.form_submissions?.end_date || null,
      duration: row.form_submissions?.duration ?? null,
      distributionType: row.form_submissions?.distribution_type || null,
      kilatSlotHour: null,
    };
    const resolved = sourceId ? schedules.get(sourceId) : undefined;

    return {
      sourceId,
      title: row.form_submissions?.title || 'Survei',
      items,
      schedule: resolved ? { ...fallback, ...stripEmpty(resolved) } : fallback,
      subtotal,
      ppn,
      amount,
      isPaid: isRowPaid(row.status),
    };
  });

  const sum = (pick: (b: DocBundle) => number) => bundles.reduce((s, b) => s + pick(b), 0);
  const total = sum((b) => b.amount);
  const paidTotal = bundles.filter((b) => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const allPaid = bundles.length > 0 && bundles.every((b) => b.isPaid);

  return {
    bundles,
    subtotal: sum((b) => b.subtotal),
    // ⚠️ DIJUMLAHKAN PER BARIS, bukan `calculatePpn(subtotal grup)`.
    // `calculatePpn` membulatkan, jadi Σ round(sᵢ×0,11) ≠ round(Σsᵢ×0,11), dan
    // total kuitansi harus sama persis dengan yang ditagih DOKU sampai rupiah.
    ppn: sum((b) => b.ppn),
    total,
    /**
     * ⚠️ "SEMUA BARIS", BUKAN "BARIS INI".
     *
     * `markScheduleAsPaid` berlingkup `schedule_id`, jadi admin bisa melunasi
     * satu anggota grup sendirian. Dokumen berjudul RECEIPT padahal separuh
     * grupnya belum dibayar adalah bukti pembayaran palsu.
     */
    isPaid: allPaid,
    paidTotal,
    outstanding: total - paidTotal,
    isPartiallyPaid: !allPaid && paidTotal > 0,
    hasPpn: rows.some((r) => r.ppn_amount != null) || bundles.some((b) => b.ppn > 0),
    // Gerbangnya TOTAL GRUP, bukan porsi satu pesanan: empat pesanan @1,5jt
    // memang melewati ambang meterai meski tak satu pun melewatinya sendiri.
    showMaterai: total > MATERAI_THRESHOLD,
    itemsWereCorrected: bundles.some((_, i) => parseRowItems(rows[i]).corrected),
  };
}

/** Buang field kosong supaya `{...fallback, ...resolved}` tidak menimpa dengan null. */
function stripEmpty(s: ScheduleInfo): ScheduleInfo {
  const out: ScheduleInfo = {};
  if (s.startDate) out.startDate = s.startDate;
  if (s.endDate) out.endDate = s.endDate;
  if (s.duration != null) out.duration = s.duration;
  if (s.distributionType) out.distributionType = s.distributionType;
  if (s.kilatSlotHour != null) out.kilatSlotHour = s.kilatSlotHour;
  return out;
}

/**
 * `paid_at` PALING AKHIR dan `expires_at` PALING AWAL di antara baris grup.
 *
 * Arahnya berbeda dan keduanya disengaja: grup baru benar-benar lunas saat
 * baris terakhirnya lunas, tapi ia mati saat baris pertamanya kedaluwarsa.
 */
export function groupMeta(rows: Array<{ paid_at?: string | null; expires_at?: string | null }>) {
  const times = (pick: (r: typeof rows[number]) => string | null | undefined) =>
    rows.map(pick).filter((v): v is string => !!v).map((v) => new Date(v).getTime())
      .filter((t) => Number.isFinite(t));

  const paid = times((r) => r.paid_at);
  const expires = times((r) => r.expires_at);

  return {
    paid_at: paid.length ? new Date(Math.max(...paid)).toISOString() : null,
    expires_at: expires.length ? new Date(Math.min(...expires)).toISOString() : null,
  };
}
