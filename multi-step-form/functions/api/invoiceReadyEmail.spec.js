import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  ═══════════════════════════════════════════════════════════════════════════
  TAGIHAN PERPANJANGAN TIDAK BOLEH TERBIT DALAM DIAM
  ═══════════════════════════════════════════════════════════════════════════

  Sampai 2026-09-10 `InvoiceForm` menggerbang email tagihan dengan
  `!entry.isExtension`, jadi setiap perpanjangan yang ditagih satuan terbit
  tanpa satu pun pemberitahuan dari kami. Satu-satunya yang sampai ke peneliti
  adalah "Pesanan Baru" dari DOKU — yang membawa URL DOKU MENTAH.

  Itu membuat urutan pekerjaan tidak bisa ditukar: **mematikan notifikasi DOKU
  sebelum email ini ada berarti menerbitkan tagihan yang tidak diketahui siapa
  pun.** Tes ini yang menahan urutan itu tetap benar.

  Yang dijaga: kalimat `extension` tidak boleh meminjam janji milik `order`.
  "Disetujui" salah (perpanjangan tidak pernah direview) dan "setelah bayar,
  pilih jadwal" salah (tanggalnya sudah dipegang) — dua kalimat yang mengirim
  peneliti mencari layar yang tidak ada.
*/

const sent = [];
vi.mock('./_mail.js', () => ({
    sendMail: async (_env, msg) => {
        sent.push(msg);
        return { ok: true, id: 'msg-1', provider: 'uji' };
    },
}));

const { onRequestPost } = await import('./send-invoice-ready-email.js');

const post = (body) => onRequestPost({
    request: new Request('https://submit.jakpatforuniv.com/api/send-invoice-ready-email', {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    env: {},
});

const base = {
    name: 'Rina',
    email: 'rina@example.ac.id',
    title: 'Persepsi Mahasiswa',
    invoiceUrl: 'https://submit.jakpatforuniv.com/bayar/11111111-2222-4333-8444-555555555555',
    amount: 233_100,
};

beforeEach(() => { sent.length = 0; });

describe('email tagihan siap — varian order (perilaku lama, tidak boleh berubah)', () => {
    it('tanpa `variant`, kalimatnya persis seperti sebelum varian ada', async () => {
        const res = await post(base);
        expect(res.status).toBe(200);
        expect(sent).toHaveLength(1);
        expect(sent[0].subject).toContain('Pesananmu disetujui');
        expect(sent[0].html).toContain('sudah kami periksa dan disetujui');
        expect(sent[0].html).toContain('memilih jadwal tayang');
    });

    it('`variant: "order"` eksplisit sama dengan tanpa varian', async () => {
        await post({ ...base, variant: 'order' });
        expect(sent[0].subject).toContain('Pesananmu disetujui');
    });
});

describe('email tagihan siap — varian extension', () => {
    it('judulnya menyebut JADWAL BARU, bukan pesanan disetujui', async () => {
        await post({ ...base, variant: 'extension' });
        expect(sent[0].subject).toContain('Tagihan jadwal iklan barumu');
        expect(sent[0].subject).not.toContain('disetujui');
    });

    it('TIDAK meminjam dua janji milik varian order', async () => {
        await post({ ...base, variant: 'extension' });
        // "disetujui" — perpanjangan tidak pernah melewati review manual.
        expect(sent[0].html).not.toContain('disetujui');
        // "pilih jadwal setelah bayar" — tanggalnya sudah dipegang.
        expect(sent[0].html).not.toContain('memilih jadwal tayang');
    });

    it('menyebut tanggal tayangnya dalam WIB, bukan zona server', async () => {
        // 2026-09-22T17:00:00Z = 23 September 00.00 WIB. Kalau dirender di UTC,
        // emailnya menyebut tanggal yang salah satu hari.
        await post({ ...base, variant: 'extension', airingStart: '2026-09-22T17:00:00.000Z' });
        expect(sent[0].html).toContain('23 September 2026');
    });

    it('tanpa tanggal, kalimatnya tetap utuh (tidak ada "undefined" bocor)', async () => {
        await post({ ...base, variant: 'extension' });
        expect(sent[0].html).not.toContain('undefined');
        expect(sent[0].html).not.toContain('null');
    });

    it('link yang dikirim yang dioper pemanggil — endpoint tidak menyusun URL sendiri', async () => {
        await post({ ...base, variant: 'extension' });
        expect(sent[0].html).toContain(base.invoiceUrl);
        expect(sent[0].html).not.toContain('checkout.doku.com');
    });
});

describe('email tagihan siap — gerbang masukan', () => {
    it.each([
        ['tanpa email', { ...base, email: undefined }],
        ['tanpa nama', { ...base, name: undefined }],
        ['tanpa invoiceUrl', { ...base, invoiceUrl: undefined }],
    ])('%s → 400, dan NOL email terkirim', async (_label, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(sent).toHaveLength(0);
    });
});
