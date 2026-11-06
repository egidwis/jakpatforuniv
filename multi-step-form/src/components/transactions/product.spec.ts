import { describe, it, expect } from 'vitest';
import {
  productOfTransaction,
  isTestTransaction,
  isRevenueTx,
  transactionTitle,
  transactionPerson,
  transactionEmail,
  txMonthWib,
  productCounts,
  revenueByProduct,
  categoryRevenue,
  matchesTransactionSearch,
  isCancellableInvoice,
  showsAdPaymentActions,
  transactionCsv,
  webinarKindOf,
  PRODUCT_LABELS,
} from './product';
import type { Transaction } from './types';

/*
  Fase 4 webinar: halaman Transaksi membedakan Iklan / Kilat / Webinar.
  Aturan produk = `_kilat-paid-alert.js:138` (jadwal dulu, lalu submission).
  Angka gerbangnya dicocokkan dengan kueri SQL di rencana — jadi aturan di sini
  WAJIB sama dengan kueri itu: periode WIB, uji = `note.is_test === true`
  saja, pendapatan = lunas (`paid`/`completed`) dan bukan uji.
*/

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: 't1', payment_id: 'JFU-INV-abc', payment_method: 'doku', amount: 1_110_000,
  status: 'completed', payment_url: 'https://pay/x', created_at: '2026-11-05T07:21:00Z',
  updated_at: '2026-11-05T07:21:00Z', form_submission_id: 'o1', entity_type: 'submission',
  schedule_id: 's1',
  form_submissions: { id: 'o1', title: 'Survei Kepuasan Mahasiswa', full_name: 'Sari Wulandari', email: 'sari@ui.ac.id', distribution_type: 'regular' },
  ad_schedules: { distribution_type: 'regular' },
  ...o,
} as Transaction);

const webinarNote = (over: Record<string, unknown> = {}) => JSON.stringify({
  items: [{ qty: 1, name: 'Tiket webinar: Uji Webinar', price: 1000, category: 'Webinar' }],
  memo: 'Voucher JFUTGRX (potongan Rp98999)',
  buyer: { name: 'Putra Kurniawan', email: 'tegar@jakpat.net' },
  is_test: true,
  ...over,
});

const WEBINAR = tx({
  id: 'w1', payment_id: 'WBN-C416139F-1793919821265', amount: 1000, status: 'completed',
  payment_url: null as unknown as string, schedule_id: null, form_submission_id: null,
  entity_type: 'webinar', form_submissions: null as unknown as undefined, ad_schedules: null,
  note: webinarNote(), created_at: '2026-11-05T23:04:00Z',
});

describe('productOfTransaction', () => {
  it('webinar dari entity_type, apa pun isi lainnya', () => {
    expect(productOfTransaction(WEBINAR)).toBe('webinar');
  });

  it('Kilat dari jadwal', () => {
    expect(productOfTransaction(tx({ ad_schedules: { distribution_type: 'kilat' } }))).toBe('kilat');
  });

  it('Kilat dari submission bila jadwal tidak terbaca (fallback _kilat-paid-alert)', () => {
    expect(productOfTransaction(tx({ ad_schedules: null, form_submissions: { id: 'o1', title: 'x', full_name: 'y', email: 'z', distribution_type: 'kilat' } }))).toBe('kilat');
    expect(productOfTransaction(tx({ ad_schedules: { distribution_type: null }, form_submissions: { id: 'o1', title: 'x', full_name: 'y', email: 'z', distribution_type: 'kilat' } }))).toBe('kilat');
  });

  it('jadwal menang atas submission', () => {
    expect(productOfTransaction(tx({ ad_schedules: { distribution_type: 'regular' }, form_submissions: { id: 'o1', title: 'x', full_name: 'y', email: 'z', distribution_type: 'kilat' } }))).toBe('iklan');
  });

  it('selain itu Iklan, termasuk perpanjangan dan baris tanpa embed', () => {
    expect(productOfTransaction(tx())).toBe('iklan');
    expect(productOfTransaction(tx({ entity_type: 'extend' }))).toBe('iklan');
    expect(productOfTransaction(tx({ ad_schedules: undefined, form_submissions: undefined }))).toBe('iklan');
  });

  it('label produk', () => {
    expect(PRODUCT_LABELS).toEqual({ iklan: 'Iklan', kilat: 'Kilat', webinar: 'Webinar' });
  });
});

describe('isTestTransaction', () => {
  it('hanya penanda eksplisit is_test === true di note JSON', () => {
    expect(isTestTransaction(WEBINAR)).toBe(true);
    expect(isTestTransaction(tx({ note: webinarNote({ is_test: false }) }))).toBe(false);
    expect(isTestTransaction(tx({ note: webinarNote({ is_test: 'true' }) }))).toBe(false);
  });

  it('teks biasa, JSON rusak, dan kosong bukan uji', () => {
    expect(isTestTransaction(tx({ note: 'is_test true' }))).toBe(false);
    expect(isTestTransaction(tx({ note: '{rusak' }))).toBe(false);
    expect(isTestTransaction(tx({ note: undefined }))).toBe(false);
  });

  it('nominal kecil iklan BUKAN uji — heuristik Rp 10.000 Analytics tidak dipakai', () => {
    expect(isTestTransaction(tx({ amount: 1110 }))).toBe(false);
  });
});

describe('isRevenueTx', () => {
  it('paid dan completed dihitung', () => {
    expect(isRevenueTx(tx({ status: 'paid' }))).toBe(true);
    expect(isRevenueTx(tx({ status: 'completed' }))).toBe(true);
  });

  it('uji, refund, dan belum lunas tidak dihitung', () => {
    expect(isRevenueTx(WEBINAR)).toBe(false);
    expect(isRevenueTx(tx({ status: 'refunded' }))).toBe(false);
    expect(isRevenueTx(tx({ status: 'pending' }))).toBe(false);
  });
});

describe('tampilan baris', () => {
  it('iklan: judul survei, nama & email peneliti', () => {
    expect(transactionTitle(tx())).toBe('Survei Kepuasan Mahasiswa');
    expect(transactionPerson(tx())).toBe('Sari Wulandari');
    expect(transactionEmail(tx())).toBe('sari@ui.ac.id');
  });

  it('webinar: judul acara dari nama item tanpa awalan, pembeli dari note', () => {
    expect(transactionTitle(WEBINAR)).toBe('Uji Webinar');
    expect(transactionPerson(WEBINAR)).toBe('Putra Kurniawan');
    expect(transactionEmail(WEBINAR)).toBe('tegar@jakpat.net');
    const replay = tx({ ...WEBINAR, note: webinarNote({ items: [{ qty: 1, name: 'Video kelas: Olah Data SPSS', price: 49000, category: 'Webinar' }] }) });
    expect(transactionTitle(replay)).toBe('Olah Data SPSS');
  });

  it('judul tidak pernah kosong', () => {
    expect(transactionTitle(tx({ form_submissions: undefined }))).toBe('Judul tidak tersedia');
    expect(transactionTitle(tx({ ...WEBINAR, note: undefined }))).toBe('Webinar');
    expect(transactionPerson(tx({ ...WEBINAR, note: undefined }))).toBe('');
  });
});

describe('webinarKindOf', () => {
  it('jenis tiket dari awalan nama item; null untuk iklan atau note kosong', () => {
    expect(webinarKindOf(WEBINAR)).toBe('live');
    expect(webinarKindOf(tx({ ...WEBINAR, note: webinarNote({ items: [{ qty: 1, name: 'Video kelas: X', price: 1, category: 'Webinar' }] }) }))).toBe('replay');
    expect(webinarKindOf(tx())).toBeNull();
    expect(webinarKindOf(tx({ ...WEBINAR, note: undefined }))).toBeNull();
  });
});

describe('txMonthWib', () => {
  it('31 Okt 23.30 WIB = Oktober', () => {
    expect(txMonthWib(tx({ created_at: '2026-10-31T16:30:00Z' }))).toEqual({ year: 2026, month: 9 });
  });

  it('1 Nov 00.30 WIB = November walau UTC masih 31 Okt', () => {
    expect(txMonthWib(tx({ created_at: '2026-10-31T17:30:00Z' }))).toEqual({ year: 2026, month: 10 });
  });

  it('31 Des 23.30 WIB tetap tahun lama; 1 Jan 00.30 WIB tahun baru', () => {
    expect(txMonthWib(tx({ created_at: '2026-12-31T16:30:00Z' }))).toEqual({ year: 2026, month: 11 });
    expect(txMonthWib(tx({ created_at: '2026-12-31T17:30:00Z' }))).toEqual({ year: 2027, month: 0 });
  });
});

describe('angka per produk', () => {
  const ROWS = [
    tx({ id: 'a', amount: 1_000_000 }),
    tx({ id: 'b', amount: 500_000, status: 'paid' }),
    tx({ id: 'c', amount: 900_000, status: 'pending' }),
    tx({ id: 'd', amount: 910_200, ad_schedules: { distribution_type: 'kilat' } }),
    WEBINAR,
    tx({ ...WEBINAR, id: 'w2', amount: 49_000, status: 'refunded', note: webinarNote({ is_test: false }) }),
    tx({ ...WEBINAR, id: 'w3', amount: 49_000, note: webinarNote({ is_test: false }) }),
  ];

  it('productCounts menghitung baris per produk dan semua', () => {
    expect(productCounts(ROWS)).toEqual({ all: 7, iklan: 3, kilat: 1, webinar: 3 });
  });

  it('revenueByProduct: uji dan refund tidak dihitung; uji lunas dicatat terpisah', () => {
    expect(revenueByProduct(ROWS)).toEqual({
      iklan: { amount: 1_500_000, tests: 0 },
      kilat: { amount: 910_200, tests: 0 },
      webinar: { amount: 49_000, tests: 1 },
    });
  });

  it('jumlah per produk = total pendapatan', () => {
    const r = revenueByProduct(ROWS);
    const total = ROWS.filter(isRevenueTx).reduce((s, t) => s + t.amount, 0);
    expect(r.iklan.amount + r.kilat.amount + r.webinar.amount).toBe(total);
  });

  it('categoryRevenue memakai aturan pendapatan yang sama (uji & refund keluar)', () => {
    const cats = categoryRevenue([
      tx({ note: JSON.stringify({ items: [{ name: 'Iklan', category: 'Jakpat for Universities (ads)', price: 1_000_000, qty: 1 }] }) }),
      tx({ note: 'memo saja', amount: 300_000 }),
      WEBINAR,
      tx({ ...WEBINAR, id: 'w3', amount: 49_000, note: webinarNote({ is_test: false, items: [{ qty: 1, name: 'Tiket webinar: X', price: 49_000, category: 'Webinar' }] }) }),
    ]);
    expect(cats).toEqual({ 'Jakpat for Universities (ads)': 1_000_000, Lainnya: 300_000, Webinar: 49_000 });
  });
});

describe('matchesTransactionSearch', () => {
  it('kosong meloloskan semuanya', () => {
    expect(matchesTransactionSearch(tx(), '')).toBe(true);
  });

  it('judul, nama, email, invoice (dengan # di depan), id order', () => {
    expect(matchesTransactionSearch(tx(), 'kepuasan')).toBe(true);
    expect(matchesTransactionSearch(tx(), 'SARI')).toBe(true);
    expect(matchesTransactionSearch(tx(), 'sari@ui')).toBe(true);
    expect(matchesTransactionSearch(tx(), '#jfu-inv')).toBe(true);
    expect(matchesTransactionSearch(tx(), 'o1')).toBe(true);
    expect(matchesTransactionSearch(tx(), 'tidak-ada')).toBe(false);
  });

  it('webinar: judul acara dan pembeli dari note', () => {
    expect(matchesTransactionSearch(WEBINAR, 'uji webinar')).toBe(true);
    expect(matchesTransactionSearch(WEBINAR, 'putra')).toBe(true);
    expect(matchesTransactionSearch(WEBINAR, 'tegar@')).toBe(true);
    expect(matchesTransactionSearch(WEBINAR, 'wbn-c416')).toBe(true);
  });
});

describe('gerbang aksi', () => {
  const live = new Set(['JFU-INV-abc', 'WBN-C416139F-1793919821265']);

  it('tagihan iklan pending yang hidup boleh dibatalkan', () => {
    expect(isCancellableInvoice(tx({ status: 'pending' }), live)).toBe(true);
    expect(isCancellableInvoice(tx({ status: ' Pending ' }), live)).toBe(true);
  });

  it('bukan pending, atau tagihannya tidak hidup → tidak', () => {
    expect(isCancellableInvoice(tx({ status: 'completed' }), live)).toBe(false);
    expect(isCancellableInvoice(tx({ status: 'pending' }), new Set())).toBe(false);
  });

  it('webinar TIDAK PERNAH bisa dibatalkan dari Transaksi, walau datanya mirip tagihan hidup', () => {
    expect(isCancellableInvoice(tx({ ...WEBINAR, status: 'pending' }), live)).toBe(false);
  });

  it('aksi bayar iklan (invoice, link bayar) hanya untuk iklan/Kilat ber-payment_url', () => {
    expect(showsAdPaymentActions(tx())).toBe(true);
    expect(showsAdPaymentActions(tx({ payment_url: '' }))).toBe(false);
    expect(showsAdPaymentActions(tx({ ...WEBINAR, payment_url: 'https://pay/x' }))).toBe(false);
  });
});

describe('transactionCsv', () => {
  it('header lama utuh berurutan, Produk & Uji di ujung', () => {
    const { headers } = transactionCsv([]);
    expect(headers).toEqual([
      'Transaction ID', 'Survey Title', 'Researcher', 'Payment Method', 'Payment Channel', 'Amount', 'Status',
      'Created At', 'Invoice Number', 'Produk', 'Uji',
    ]);
  });

  it('baris iklan dan webinar: judul/pembeli lewat helper, waktu WIB', () => {
    const { rows } = transactionCsv([tx(), WEBINAR]);
    expect(rows[0]).toEqual([
      't1', 'Survei Kepuasan Mahasiswa', 'Sari Wulandari', 'doku', '', 1_110_000, 'completed',
      '2026-11-05 14:21', 'JFU-INV-abc', 'Iklan', '',
    ]);
    expect(rows[1]).toEqual([
      'w1', 'Uji Webinar', 'Putra Kurniawan', 'doku', '', 1000, 'completed',
      '2026-11-06 06:04', 'WBN-C416139F-1793919821265', 'Webinar', 'Ya',
    ]);
  });
});
