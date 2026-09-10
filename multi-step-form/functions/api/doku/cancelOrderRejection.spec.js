import { describe, it, expect } from 'vitest';
import { explainDokuRejection } from './cancel-order.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  PENOLAKAN DOKU HARUS PULANG SEBAGAI SEBAB, BUKAN PENGULANGAN AKIBAT
  ═══════════════════════════════════════════════════════════════════════════

  Kalimat lamanya tautologi: "DOKU tidak bisa menonaktifkan link ini. Link
  lamanya mungkin masih bisa dibayar." — persis apa yang SUDAH dikatakan toast
  pembungkusnya. Admin membaca akibat dua kali dan tidak pernah membaca sebabnya
  sekali pun, jadi "sudah dicoba berkali-kali tanpa hasil" tidak punya jalan
  untuk berubah jadi tindakan.

  ⚠️ SEBAB PERTAMA YANG PERNAH TEREKAM (2026-09-10, tagihan
  `JFU-INV-5b73a8-1789044625252`, lewat `doku_cancel_last_error` sql/87) ada di
  kasus pertama di bawah — dan ia menjelaskan kenapa `doku_cancelled_at` masih
  NOL BARIS seumur hidup: fiturnya memang tidak pernah aktif di akun ini.
*/

describe('explainDokuRejection', () => {
  it('badan ASLI dari produksi → "Cancel Order belum aktif", dan menyebut tindakannya', () => {
    const asli = '{"error":{"message":"Merchant not support cancel order, please do activation through DOKU dashboard."}}';
    const out = explainDokuRejection(400, asli);
    expect(out).toContain('belum aktif di akun DOKU');
    expect(out).toContain('dashboard DOKU');
    // ⚠️ Ini yang membedakannya dari kegagalan sementara: selama setelan itu
    // mati, MENCOBA LAGI tidak akan pernah menolong.
    expect(out).toContain('semua pembatalan akan gagal');
  });

  it.each([
    ['sudah dibayar', '{"error":{"message":"Order already paid"}}', 'sudah dibayar'],
    ['kedaluwarsa', '{"error":{"message":"Order has expired"}}', 'kedaluwarsa'],
    ['request_id asing', '{"error":{"message":"Invalid original_request_id"}}', 'tidak mengenali request_id'],
  ])('%s → sebabnya sendiri', (_label, body, harapan) => {
    expect(explainDokuRejection(400, body)).toContain(harapan);
  });

  it('pesan tak dikenal DIKUTIP, bukan dikarang', () => {
    const out = explainDokuRejection(422, '{"error":{"message":"Something entirely new"}}');
    expect(out).toContain('Something entirely new');
    expect(out).toContain('422');
  });

  it('badan bukan-JSON tetap terbaca — HTML/teks kosong pernah terjadi', () => {
    expect(explainDokuRejection(502, '<html>Bad Gateway</html>')).toContain('502');
    expect(explainDokuRejection(500, '')).toContain('tanpa pesan');
  });

  it('tidak pernah mengulang akibatnya — itu tugas pemanggil', () => {
    const semua = [
      explainDokuRejection(400, '{"error":{"message":"Merchant not support cancel order"}}'),
      explainDokuRejection(400, '{"error":{"message":"Order already paid"}}'),
      explainDokuRejection(500, ''),
    ];
    for (const out of semua) {
      expect(out.toLowerCase()).not.toContain('masih bisa dibayar');
      expect(out.toLowerCase()).not.toContain('tidak bisa menonaktifkan link');
    }
  });

  it('dipangkas — badan raksasa tidak boleh memenuhi toast', () => {
    const out = explainDokuRejection(400, `{"error":{"message":"${'x'.repeat(5000)}"}}`);
    expect(out.length).toBeLessThan(250);
  });
});
