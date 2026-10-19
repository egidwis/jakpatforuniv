import { describe, it, expect } from 'vitest';
import { buildOrderInvoiceItems, kilatAddonOverpriced, type InvoiceItem } from './invoiceItems';

/*
  Insiden 15 Okt 2026 (order a4582981): tagihan manual admin memuat
  "Add-on JFU Kilat" Rp250.000 — harga PILOT (c00db82), padahal sejak 4 Agu
  (4b5bdbd) add-on = Rp200.000. Formulir mengisi 200rb dengan benar, admin
  menyuntingnya, dan tidak ada yang memperingatkan. Peneliti membayar
  Rp910.200 sementara dashboard (harga order) menulis Rp854.700. Pola sama
  sudah lunas di 70d2a51f (9 Sep) dan b1a738ea (11 Sep).
*/
const item = (name: string, price: number, category = 'Lainnya'): InvoiceItem =>
  ({ id: name, name, qty: 1, price, category });

describe('kilatAddonOverpriced — add-on Kilat tidak boleh di atas harga sistem', () => {
  it('kasus a4582981: add-on 250rb diketik → tertangkap, harga sistem 200rb', () => {
    const items = [
      item('Jakpat for Universities (ads)', 500_000, 'Jakpat for Universities (ads)'),
      item('Add-on JFU Kilat', 250_000),
      { ...item("Respondent's Incentive", 35_000, "Respondent's Incentive"), qty: 2 },
    ];
    expect(kilatAddonOverpriced(items, 'FUSUHUD')).toEqual({ typed: 250_000, system: 200_000 });
  });

  it('tagihan susulan yang isinya add-on saja (kasus 70d2a51f) juga tertangkap', () => {
    expect(kilatAddonOverpriced([item('Add-on JFU Kilat', 250_000)], null)).not.toBeNull();
  });

  it('nama diketik bebas (huruf/spasi beda) tetap dikenali', () => {
    expect(kilatAddonOverpriced([item('  add-on jfu kilat ', 250_000)], null)).not.toBeNull();
  });

  it('hasil prefill Kilat apa adanya lolos', () => {
    const { items } = buildOrderInvoiceItems({
      duration: 1, questionCount: 76, winnerCount: 2, prizePerWinner: 35_000,
      voucherCode: 'FUSUHUD', isKilat: true, rateInstantMs: Date.parse('2026-10-15T03:40:27Z'),
    });
    expect(kilatAddonOverpriced(items, 'FUSUHUD')).toBeNull();
  });

  it('di bawah harga sistem (nego) dan order tanpa add-on lolos', () => {
    expect(kilatAddonOverpriced([item('Add-on JFU Kilat', 150_000)], null)).toBeNull();
    expect(kilatAddonOverpriced([item('Jakpat for Universities (ads)', 900_000, 'Jakpat for Universities (ads)')], null)).toBeNull();
  });
});
