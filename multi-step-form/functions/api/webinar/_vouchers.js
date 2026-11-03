// Voucher webinar: kode yang sama dengan iklan/Kilat (keputusan pemilik produk 3 Nov),
// tetapi hanya yang berbentuk persen atau harga jadi. Kode yang aturannya khusus iklan
// (harga per hari/durasi) ditolak dengan "tidak bisa digunakan pada produk ini".
//
// Satu daftar untuk checkout (penentu) dan pratinjau di halaman beli. Persen dan masa
// berlaku DIKUNCI ke src/utils/cost-calculator.ts oleh _vouchers.spec.js: kode iklan
// baru yang belum dipetakan di sini membuat spec gagal, supaya keputusannya disengaja.
//
// Harga webinar sudah termasuk PPN, jadi persen memotong harga tiket; harga jadi adalah
// total yang dibayar. Hasil tidak pernah di bawah Rp 1.000 (batas webinar_orders) dan
// tidak pernah di atas harga normal. Rumus yang sama dijalankan webinar_reserve_seat
// (sql/134); hitungan di sini hanya untuk pratinjau.

const AMBASSADOR_CODES = [
  'JFUTYR', 'SEKARJFU', 'ADINDAJFU', 'RAJAJFU', 'SACIJFU', 'JFUGITA',
  'JFUTANIA', 'JFUEDO', 'JFURAISA', 'JFUANA', 'JFUSALSA', 'JFUNATALIA',
];

export const WEBINAR_VOUCHERS = [
  { code: 'TEGARGANTENG', kind: 'percent', percent: 20, validUntil: null },
  { code: 'PPISWEDIA', kind: 'percent', percent: 20, validUntil: '2026-06-30T17:00:00Z' },
  { code: 'JFUSUHUD', kind: 'percent', percent: 10, validUntil: '2026-08-31T17:00:00Z' },
  { code: 'JFU-EHEF2026', kind: 'percent', percent: 10, validUntil: '2026-12-31T17:00:00Z' },
  { code: 'JFU-SUHUDENDYEAR', kind: 'percent', percent: 10, validUntil: '2027-01-31T17:00:00Z' },
  ...AMBASSADOR_CODES.map((code) => ({ code, kind: 'percent', percent: 10, validUntil: null })),
  { code: 'JFUTGRX', kind: 'total', total: 1000, validUntil: null },
  // Aturan per hari/durasi iklan, tidak punya arti untuk tiket.
  { code: 'JFUFEB', kind: 'ads_only' },
  { code: 'ILKOMUNY', kind: 'ads_only' },
  { code: 'JAKPATUNIV2025', kind: 'retired' },
];

export const MIN_WEBINAR_AMOUNT = 1000;

export const VOUCHER_MESSAGES = {
  unknown: 'Kode voucher tidak dikenal.',
  not_for_product: 'Kode voucher tidak bisa digunakan pada produk ini.',
  expired: 'Masa berlaku kode voucher sudah habis.',
};

/** Kode → { ok:true, entry } atau { ok:false, reason, message }. */
export function resolveWebinarVoucher(rawCode, atMs = Date.now()) {
  const code = String(rawCode || '').trim().toUpperCase();
  const entry = WEBINAR_VOUCHERS.find((v) => v.code === code);
  if (!entry) return { ok: false, reason: 'unknown', message: VOUCHER_MESSAGES.unknown };
  if (entry.kind === 'ads_only') return { ok: false, reason: 'not_for_product', message: VOUCHER_MESSAGES.not_for_product };
  if (entry.kind === 'retired' || (entry.validUntil && atMs >= Date.parse(entry.validUntil))) {
    return { ok: false, reason: 'expired', message: VOUCHER_MESSAGES.expired };
  }
  return { ok: true, entry };
}

/** Bentuk yang dikirim ke RPC webinar_reserve_seat (p_voucher). */
export function voucherRpcPayload(entry) {
  return entry.kind === 'percent'
    ? { code: entry.code, percent: entry.percent }
    : { code: entry.code, total: entry.total };
}

/** Cermin rumus sql/134: total yang dibayar setelah voucher. */
export function applyWebinarVoucher(price, entry) {
  const raw = entry.kind === 'percent'
    ? price - Math.round((price * entry.percent) / 100)
    : Math.min(price, entry.total);
  return Math.min(price, Math.max(raw, MIN_WEBINAR_AMOUNT));
}

export function voucherLabel(entry) {
  return entry.kind === 'percent' ? `Diskon ${entry.percent}%` : `Harga jadi Rp ${entry.total.toLocaleString('id-ID')}`;
}
