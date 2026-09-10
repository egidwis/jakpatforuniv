import { describe, it, expect } from 'vitest';
import { compareLeadOrder, leadOf, payLinkPath, payLinkUrl } from './payLink';

describe('payLink — bentuk URL', () => {
  const id = '11111111-2222-4333-8444-555555555555';

  it('path memakai ad_schedules.id apa adanya', () => {
    expect(payLinkPath(id)).toBe(`/bayar/${id}`);
  });

  it('URL penuh menempel pada origin yang diberikan', () => {
    expect(payLinkUrl(id, 'https://submit.jakpatforuniv.com'))
      .toBe(`https://submit.jakpatforuniv.com/bayar/${id}`);
  });
});

describe('leadOf — WAJIB sepakat dengan `lead` di sql/85', () => {
  /*
    Kalau dua aturan ini berbeda, seseorang melihat tombol bayar yang kemudian
    ditolak resolver — atau sebaliknya, tidak melihat tombol yang seharusnya
    miliknya. Tes ini yang menahannya tetap satu.
  */
  const m = (startDate: string | null, ordinal: number | null, tag: string) =>
    ({ startDate, ordinal, tag });

  it('tanggal tayang paling awal yang memimpin', () => {
    const lead = leadOf([
      m('2026-09-20T08:00:00Z', 1, 'akhir'),
      m('2026-09-10T08:00:00Z', 1, 'awal'),
    ]);
    expect(lead?.tag).toBe('awal');
  });

  it('yang TANPA tanggal ditaruh paling BELAKANG (padanan NULLS LAST)', () => {
    const lead = leadOf([
      m(null, 1, 'tanpa tanggal'),
      m('2026-09-20T08:00:00Z', 1, 'bertanggal'),
    ]);
    expect(lead?.tag).toBe('bertanggal');
  });

  it('ordinal NULL ditaruh paling DEPAN saat tanggalnya seri (padanan NULLS FIRST)', () => {
    const lead = leadOf([
      m('2026-09-10T08:00:00Z', 2, 'ordinal 2'),
      m('2026-09-10T08:00:00Z', null, 'warisan'),
    ]);
    expect(lead?.tag).toBe('warisan');
  });

  it('ordinal jadi pemutus saat tanggalnya seri', () => {
    const lead = leadOf([
      m('2026-09-10T08:00:00Z', 3, 'tiga'),
      m('2026-09-10T08:00:00Z', 1, 'satu'),
    ]);
    expect(lead?.tag).toBe('satu');
  });

  it('daftar kosong → null, bukan lemparan', () => {
    expect(leadOf([])).toBeNull();
  });

  it('tidak mengubah urutan array aslinya', () => {
    const arr = [m('2026-09-20T08:00:00Z', 1, 'b'), m('2026-09-10T08:00:00Z', 1, 'a')];
    leadOf(arr);
    expect(arr[0].tag).toBe('b');
  });

  it('comparator-nya stabil terhadap dirinya sendiri', () => {
    const x = m('2026-09-10T08:00:00Z', 1, 'x');
    expect(compareLeadOrder(x, x)).toBe(0);
  });
});
