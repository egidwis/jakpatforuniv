import { describe, it, expect } from 'vitest';
import { adUnitPriceOf, buildOrderInvoiceItems, rateContextOf, type InvoiceItem } from './invoiceItems';

const NOV_15 = Date.parse('2026-11-15T10:00:00+07:00');
const DEC_02 = Date.parse('2026-12-02T10:00:00+07:00');
const JAN_05 = Date.parse('2027-01-05T10:00:00+07:00');
/** `formatIDR` menyisipkan U+00A0 sesudah "Rp" — samakan supaya mudah dibaca. */
const plain = (s: string | null) => s?.replace(/ /g, ' ') ?? null;

describe('rateContextOf — dari tarif mana harga satuan iklan datang', () => {
  it('terkunci di masa perkenalan: efektif, normal, dan batasnya', () => {
    expect(plain(rateContextOf({ questionCount: 40, rateLockedAt: '2026-10-05T03:00:00Z', nowMs: DEC_02 })))
      .toBe('Tarif 31–50 soal, dikunci 5 Okt 2026: Rp 300.000/hari · normal Rp 500.000 · harga perkenalan s/d 30 Nov 2026');
  });

  it('memakai instan KUNCI, bukan sekarang — tagihan Desember untuk order Oktober tetap tarif Oktober', () => {
    const text = plain(rateContextOf({ questionCount: 40, rateLockedAt: '2026-10-05T03:00:00Z', nowMs: JAN_05 }));
    expect(text).toContain('Rp 300.000/hari');
  });

  it('belum dikunci → tarif hari ini, dan disebut terang', () => {
    expect(plain(rateContextOf({ questionCount: 10, rateLockedAt: null, nowMs: DEC_02 })))
      .toBe('Tarif 1–15 soal, belum dikunci — memakai tarif hari ini: Rp 160.000/hari · normal Rp 200.000 · harga perkenalan s/d 31 Des 2026');
  });

  it('tarif penuh → tanpa "normal"/"harga perkenalan"', () => {
    expect(plain(rateContextOf({ questionCount: 80, rateLockedAt: '2027-01-02T03:00:00Z', nowMs: JAN_05 })))
      .toBe('Tarif >70 soal, dikunci 2 Jan 2027: Rp 800.000/hari');
  });

  it('tanggal kunci dibaca kalender WIB (17.30 UTC = besoknya di WIB)', () => {
    expect(plain(rateContextOf({ questionCount: 20, rateLockedAt: '2026-10-04T17:30:00Z', nowMs: NOV_15 })))
      .toContain('dikunci 5 Okt 2026');
  });

  it('Kilat diberi keterangan rumusnya', () => {
    expect(rateContextOf({ questionCount: 20, rateLockedAt: null, isKilat: true, nowMs: NOV_15 }))
      .toMatch(/Kilat: tarif 1× \+ add-on$/);
  });

  it('tanpa jumlah soal → null', () => {
    expect(rateContextOf({ questionCount: 0, rateLockedAt: null, nowMs: NOV_15 })).toBeNull();
  });
});

describe('adUnitPriceOf — pembanding penanda harga di bawah sistem', () => {
  const item = (category: string, price: number): InvoiceItem =>
    ({ id: `${category}-${price}`, name: category, qty: 1, price, category });

  it('harga satuan iklan terendah, abaikan kategori lain', () => {
    expect(adUnitPriceOf([
      item('Jakpat for Universities (ads)', 300000),
      item("Respondent's Incentive", 25000),
      item('Jakpat for Universities (ads)', 250000),
    ])).toBe(250000);
  });

  it('tanpa baris iklan → null (mis. voucher uji JFUTGRX)', () => {
    const { items } = buildOrderInvoiceItems({ voucherCode: 'JFUTGRX', questionCount: 40, duration: 3, rateInstantMs: NOV_15 });
    expect(adUnitPriceOf(items)).toBeNull();
  });

  it('prefill order = tarif efektif pada instan kunci', () => {
    const { items } = buildOrderInvoiceItems({ questionCount: 40, duration: 3, rateInstantMs: Date.parse('2026-10-05T03:00:00Z') });
    expect(adUnitPriceOf(items)).toBe(300000);
  });
});
