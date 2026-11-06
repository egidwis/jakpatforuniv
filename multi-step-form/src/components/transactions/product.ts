/**
 * Fase 4 webinar — aturan produk, uji, dan pendapatan untuk halaman Transaksi.
 *
 * Fungsi murni (tanpa Supabase, tanpa React) supaya angkanya bisa diuji dan
 * dicocokkan dengan kueri SQL gerbang di rencana. Aturannya WAJIB sama dengan
 * kueri itu:
 *
 *   - **Produk**: `webinar` bila `entity_type='webinar'`; `kilat` bila
 *     `ad_schedules.distribution_type` = 'kilat', dengan fallback ke
 *     `form_submissions.distribution_type` saat jadwal tidak terbaca (aturan
 *     `functions/api/doku/_kilat-paid-alert.js:138`); selain itu `iklan`,
 *     termasuk perpanjangan.
 *   - **Uji**: hanya penanda eksplisit `note.is_test === true`. Heuristik
 *     Rp 10.000 milik Analytics SENGAJA tidak dipakai, supaya angka iklan sama
 *     persis dengan sebelum Fase 4.
 *   - **Pendapatan**: lunas (`isPaidTx`: `paid`/`completed`) dan bukan uji.
 *     `refunded` tidak lunas, jadi refund mengurangi bulan pembayaran aslinya.
 *   - **Periode**: kalender WIB (`toWibYmd`), bukan jam perangkat.
 */
import { isPaidTx } from '@/utils/analytics/revenue';
import { toWibYmd } from '@/utils/airing-window';
import type { CsvCell } from '@/utils/csv';
import { formatPaymentChannel } from '@/utils/paymentChannel';
import { parseTransactionNote, type Transaction } from './types';

export type Product = 'iklan' | 'kilat' | 'webinar';
export const PRODUCT_IDS: readonly Product[] = ['iklan', 'kilat', 'webinar'];
export const PRODUCT_LABELS: Record<Product, string> = { iklan: 'Iklan', kilat: 'Kilat', webinar: 'Webinar' };

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();

export function productOfTransaction(
  t: Pick<Transaction, 'entity_type' | 'ad_schedules' | 'form_submissions'>
): Product {
  if (norm(t.entity_type) === 'webinar') return 'webinar';
  const kind = t.ad_schedules?.distribution_type || t.form_submissions?.distribution_type;
  return norm(kind) === 'kilat' ? 'kilat' : 'iklan';
}

export const isTestTransaction = (t: Pick<Transaction, 'note'>): boolean => parseTransactionNote(t.note).isTest;

export const isRevenueTx = (t: Pick<Transaction, 'status' | 'note'>): boolean => isPaidTx(t) && !isTestTransaction(t);

const isWebinar = (t: Pick<Transaction, 'entity_type'>): boolean => norm(t.entity_type) === 'webinar';

/** Awalan nama item webinar (sql/131, sql/134). */
const WEBINAR_ITEM_PREFIX = /^(Tiket webinar|Video kelas):\s*/;

export function transactionTitle(t: Transaction): string {
  if (isWebinar(t)) {
    const name = parseTransactionNote(t.note).items[0]?.name;
    return name ? name.replace(WEBINAR_ITEM_PREFIX, '') || 'Webinar' : 'Webinar';
  }
  return t.form_submissions?.title || 'Judul tidak tersedia';
}

/** Jenis tiket webinar dari awalan nama item; null untuk baris non-webinar. */
export function webinarKindOf(t: Transaction): 'live' | 'replay' | null {
  if (!isWebinar(t)) return null;
  const name = parseTransactionNote(t.note).items[0]?.name || '';
  if (name.startsWith('Tiket webinar:')) return 'live';
  if (name.startsWith('Video kelas:')) return 'replay';
  return null;
}

export function transactionPerson(t: Transaction): string {
  if (isWebinar(t)) return parseTransactionNote(t.note).buyer?.name || '';
  return t.form_submissions?.full_name || '';
}

export function transactionEmail(t: Transaction): string {
  if (isWebinar(t)) return parseTransactionNote(t.note).buyer?.email || '';
  return t.form_submissions?.email || '';
}

/** Bulan kalender WIB; `month` 0–11 seperti `Date#getMonth`. */
export function txMonthWib(t: Pick<Transaction, 'created_at'>): { year: number; month: number } {
  const ymd = toWibYmd(new Date(t.created_at));
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) - 1 };
}

export function productCounts(rows: Transaction[]): Record<Product | 'all', number> {
  const out: Record<Product | 'all', number> = { all: rows.length, iklan: 0, kilat: 0, webinar: 0 };
  for (const t of rows) out[productOfTransaction(t)] += 1;
  return out;
}

/** Pendapatan per produk + jumlah transaksi uji yang lunas (tidak dihitung). */
export function revenueByProduct(rows: Transaction[]): Record<Product, { amount: number; tests: number }> {
  const out: Record<Product, { amount: number; tests: number }> = {
    iklan: { amount: 0, tests: 0 },
    kilat: { amount: 0, tests: 0 },
    webinar: { amount: 0, tests: 0 },
  };
  for (const t of rows) {
    if (!isPaidTx(t)) continue;
    const bucket = out[productOfTransaction(t)];
    if (isTestTransaction(t)) bucket.tests += 1;
    else bucket.amount += Number(t.amount) || 0;
  }
  return out;
}

/** Rincian per kategori item, dengan aturan pendapatan yang sama. */
export function categoryRevenue(rows: Transaction[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const t of rows) {
    if (!isRevenueTx(t)) continue;
    const { items } = parseTransactionNote(t.note);
    if (items.length === 0) {
      acc.Lainnya = (acc.Lainnya || 0) + (Number(t.amount) || 0);
      continue;
    }
    for (const item of items) {
      const cat = item.category || 'Lainnya';
      acc[cat] = (acc[cat] || 0) + (item.price || 0) * (item.qty || 1);
    }
  }
  return acc;
}

export function matchesTransactionSearch(t: Transaction, term: string): boolean {
  const q = term.toLowerCase().trim();
  if (!q) return true;
  const id = q.replace(/^#/, '');
  return (
    transactionTitle(t).toLowerCase().includes(q) ||
    transactionPerson(t).toLowerCase().includes(q) ||
    transactionEmail(t).toLowerCase().includes(q) ||
    (t.payment_id || '').toLowerCase().includes(id) ||
    (t.form_submission_id || '').toLowerCase().includes(id)
  );
}

/**
 * Tagihan iklan sungguhan yang masih hidup — satu-satunya yang boleh dibatalkan.
 *
 * Cerminan `canCancel` di `ScheduleCardList`. Tagihan yang TERLEWAT batas bayar
 * atau basi TETAP boleh dibatalkan — justru itu yang paling ingin dibersihkan
 * admin. Baris webinar tidak pernah: order tiket dikelola di menu Webinar.
 */
export function isCancellableInvoice(t: Transaction, liveInvoiceIds: ReadonlySet<string>): boolean {
  return !isWebinar(t) && norm(t.status) === 'pending' && !!t.payment_id && liveInvoiceIds.has(t.payment_id);
}

/** Tombol Download Invoice / Salin Link Bayar — milik alur bayar iklan saja. */
export const showsAdPaymentActions = (t: Transaction): boolean => !isWebinar(t) && !!t.payment_url;

const wibStamp = (iso: string): string => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

/**
 * CSV Transaksi. Header lama dipertahankan nama & urutannya (spreadsheet yang
 * sudah ada tidak bergeser); `Produk` dan `Uji` ditambah di ujung.
 */
export function transactionCsv(rows: Transaction[]): { headers: string[]; rows: CsvCell[][] } {
  return {
    headers: [
      'Transaction ID', 'Survey Title', 'Researcher', 'Payment Method', 'Payment Channel', 'Amount', 'Status',
      'Created At', 'Invoice Number', 'Produk', 'Uji',
    ],
    rows: rows.map((t) => [
      t.id,
      transactionTitle(t),
      transactionPerson(t),
      t.payment_method,
      t.payment_channel ? formatPaymentChannel(t.payment_channel) : '',
      Number(t.amount) || 0,
      t.status,
      t.created_at ? wibStamp(t.created_at) : '',
      t.payment_id || '',
      PRODUCT_LABELS[productOfTransaction(t)],
      isTestTransaction(t) ? 'Ya' : '',
    ]),
  };
}
