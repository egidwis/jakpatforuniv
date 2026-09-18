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

describe('email tagihan siap — varian order (jadwal pertama yang dibantu reservasi admin)', () => {
    it('tanpa `variant`, menyebut reservasi jadwal oleh admin dan disclaimer pembayaran', async () => {
        const res = await post(base);
        expect(res.status).toBe(200);
        expect(sent).toHaveLength(1);
        expect(sent[0].html).toContain('sudah kami periksa');
        expect(sent[0].html).toContain('disetujui');
        expect(sent[0].html).toContain('mereservasikan jadwal tayang');
        expect(sent[0].html).toContain('abaikan email ini');
    });

    it('`variant: "order"` eksplisit sama dengan tanpa varian dan menampilkan rincian jadwal', async () => {
        await post({
            ...base,
            variant: 'order',
            airingStart: '2026-09-22T17:00:00.000Z',
            bookingId: 'ABC12345',
        });
        expect(sent[0].subject).toContain('Pesananmu disetujui');
        expect(sent[0].html).toContain('23 September 2026');
        expect(sent[0].html).toContain('#ABC12345');
        expect(sent[0].html).toContain('abaikan email ini');
    });
});

describe('email tagihan siap — varian extension', () => {
    it('judulnya menyebut JADWAL BARU, bukan pesanan disetujui', async () => {
        await post({ ...base, variant: 'extension' });
        expect(sent[0].subject).toContain('Tagihan jadwal iklan barumu');
        expect(sent[0].subject).not.toContain('Pesananmu disetujui');
        expect(sent[0].html).toContain('abaikan email ini');
    });

    it('TIDAK meminjam klaim review disetujui milik varian order', async () => {
        await post({ ...base, variant: 'extension' });
        expect(sent[0].html).not.toContain('sudah kami periksa dan disetujui');
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

describe('email tagihan siap — varian bulk', () => {
    it('mengirim subjek tagihan gabungan dan merender tabel daftar jadwal', async () => {
        const res = await post({
            ...base,
            variant: 'bulk',
            items: [
                { title: 'Survei A', startDate: '2026-09-22T17:00:00.000Z', bookingId: 'SRV001', amount: 100000 },
                { title: 'Survei B', startDate: '2026-09-25T17:00:00.000Z', bookingId: 'SRV002', amount: 150000 },
            ],
        });
        expect(res.status).toBe(200);
        expect(sent[0].subject).toContain('Tagihan gabungan jadwal iklanmu siap dibayar');
        expect(sent[0].html).toContain('Survei A');
        expect(sent[0].html).toContain('Survei B');
        expect(sent[0].html).toContain('#SRV001');
        expect(sent[0].html).toContain('#SRV002');
        expect(sent[0].html).toContain('Total Tagihan Gabungan');
        expect(sent[0].html).toContain('abaikan email ini');
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
