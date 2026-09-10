import { describe, it, expect } from 'vitest';
import { PAY_LINK_CANONICAL_ORIGIN, compareLeadOrder, leadOf, payLinkForBill, payLinkPath, payLinkUrl } from './payLink';

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

describe('payLinkForBill — KEBERADAAN dari paymentUrl, BENTUK dari scheduleId', () => {
  /*
    ⚠️ TES REGRESI, BUKAN TES FITUR.

    Rencana A mengganti isi `links[...]` dari URL DOKU menjadi
    `payLinkPath(scheduleId)` polos. Bentuknya membaik; sinyalnya mati. Nilai
    ini dipakai di hulu sebagai penanda keberadaan (`finalPaymentLink ?
    'waiting_payment' : 'awaiting_invoice'`), dan `scheduleId` selalu terisi —
    jadi setiap jadwal selamanya menawarkan "Bayar Sekarang", termasuk jadwal
    yang seluruh tagihannya sudah dibatalkan. Peneliti mengklik, resolver
    menjawab "tidak ada tagihan", dan di situlah orangnya berhenti.

    Kalau tes ini merah karena "cuma soal bentuk URL": TIDAK. Yang dijaga
    adalah cabang `null`-nya.
  */
  const sched = '11111111-2222-4333-8444-555555555555';
  const live = { paymentUrl: 'https://checkout.doku.com/x', scheduleId: sched, isExpired: false };

  it('tagihan hidup → link perantara, bukan URL DOKU', () => {
    expect(payLinkForBill(live)).toBe(`/bayar/${sched}`);
  });

  it('TIDAK ADA tagihan terbuka → null, walau jadwalnya punya id', () => {
    // Inilah jadwal yang seluruh tagihannya dibatalkan: `openInvoice` null,
    // jadi `paymentUrl` null — sementara `scheduleId` tetap ada.
    expect(payLinkForBill({ ...live, paymentUrl: null })).toBeNull();
  });

  it('tagihan kedaluwarsa → null', () => {
    expect(payLinkForBill({ ...live, isExpired: true })).toBeNull();
  });

  it('URL kosong dihitung sebagai TIDAK ADA, bukan sebagai link kosong', () => {
    expect(payLinkForBill({ ...live, paymentUrl: '' })).toBeNull();
  });

  it('tanpa scheduleId, tagihan hidup tetap terbaca ADA (sinyal tidak ikut hilang)', () => {
    // Bentuknya mundur ke URL DOKU — tapi kartunya tidak boleh berubah jadi
    // "menunggu tagihan" padahal tagihannya nyata dan hidup.
    expect(payLinkForBill({ ...live, scheduleId: null })).toBe('https://checkout.doku.com/x');
  });
});

describe('payLinkUrl — origin dikunci ke host yang menjalankan resolver', () => {
  /*
    ⚠️ Root `functions/_middleware.js` menyajikan `jakpatforuniv.com` sebagai
    homepage statis dan TIDAK pernah memanggil `next()`. Jadi `/bayar/<id>` di
    apex bukan 404 — ia halaman depan. Link mati yang terlihat hidup, di inbox
    orang, berhari-hari.
  */
  const id = '11111111-2222-4333-8444-555555555555';

  it('apex dipaksa ke host kanonik', () => {
    expect(payLinkUrl(id, 'https://jakpatforuniv.com'))
      .toBe(`${PAY_LINK_CANONICAL_ORIGIN}/bayar/${id}`);
  });

  it('www juga dipaksa — ia apex yang sama', () => {
    expect(payLinkUrl(id, 'https://www.jakpatforuniv.com'))
      .toBe(`${PAY_LINK_CANONICAL_ORIGIN}/bayar/${id}`);
  });

  it('submit. dipakai apa adanya', () => {
    expect(payLinkUrl(id, 'https://submit.jakpatforuniv.com'))
      .toBe(`https://submit.jakpatforuniv.com/bayar/${id}`);
  });

  it('preview *.pages.dev dibiarkan — ia menjalankan resolver', () => {
    expect(payLinkUrl(id, 'https://abc123.jakpatforuniv-form.pages.dev'))
      .toBe(`https://abc123.jakpatforuniv-form.pages.dev/bayar/${id}`);
  });

  it('localhost dibiarkan — memaksanya ke produksi menyamarkan link uji', () => {
    expect(payLinkUrl(id, 'http://localhost:5173')).toBe(`http://localhost:5173/bayar/${id}`);
  });

  it('origin kosong / tak terbaca jatuh ke host kanonik, bukan ke path telanjang', () => {
    expect(payLinkUrl(id, '')).toBe(`${PAY_LINK_CANONICAL_ORIGIN}/bayar/${id}`);
    expect(payLinkUrl(id, 'bukan-url')).toBe(`${PAY_LINK_CANONICAL_ORIGIN}/bayar/${id}`);
  });
});
