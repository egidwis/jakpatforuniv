import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEV TIDAK BOLEH PUNYA VERSI DOKU-NYA SENDIRI
  ═══════════════════════════════════════════════════════════════════════════

  `vite dev` tidak menjalankan runtime Pages, jadi setiap endpoint di
  `functions/` butuh jembatan. Ada DUA cara menulis jembatan itu, dan hanya
  satu yang aman:

    ✅ impor `onRequest` yang ASLI lalu jalankan di Node
       (dipakai jembatan sac/*, create-payment, check-email, chat)
    ❌ tulis ulang logikanya di `vite.config.js`

  Cara kedua pernah dipakai untuk `/api/doku/checkout` (`dokuProxyPlugin`), dan
  salinannya MENYIMPANG dalam dua hal — dua-duanya sunyi, dua-duanya merugikan:

  1. `request_id` dibuang. Salinan itu membuat `requestId`, menandatanganinya,
     mengirimnya sebagai header `Request-Id`, lalu memulangkan badan mentah
     DOKU — tanpa `request_id`. `createManualInvoice` membaca
     `data.request_id ?? null`, jadi setiap tagihan yang terbit dari lokal
     lahir dengan `invoices.doku_request_id = NULL`.

     Akibatnya bukan "tagihannya sedikit kurang lengkap": Cancel Order API
     menuntut nilai itu sebagai `original_request_id`, jadi tagihan itu
     TIDAK BISA DIMATIKAN — selamanya. Terukur di produksi 2026-09-10: dari
     42 tagihan sejak sql/84, tepat 2 yang kehilangannya, dan dua-duanya
     tagihan uji yang diterbitkan dari localhost.

  2. Routing Sub Account hilang. `checkout.js` menyisipkan
     `additional_info.account.id` (SAC JFU); salinannya tidak. Karena `.env`
     memakai kredensial PRODUKSI, tagihan uji dari lokal menerbitkan link DOKU
     sungguhan yang uangnya mendarat di akun yang salah.

  Keduanya lolos dari `dueDate.spec.js` karena penjaga itu hanya menyapu
  `functions/api/doku/`, sementara salinannya hidup di `vite.config.js`.

  ⚠️ YANG DIJAGA DI SINI BUKAN PERILAKU DEV. Yang dijaga adalah janji bahwa
  dev dan produksi menjalankan SATU berkas yang sama — sehingga apa pun yang
  Anda buktikan di lokal tetap benar sesudah deploy, dan sebaliknya. Salinan
  kedua membatalkan janji itu tanpa satu pun error.
*/

const DIR = dirname(fileURLToPath(import.meta.url));
const VITE_CONFIG = join(DIR, '..', '..', '..', 'vite.config.js');
const viteConfig = readFileSync(VITE_CONFIG, 'utf8');

describe('jembatan dev DOKU checkout', () => {
  it('vite.config.js tidak memanggil API checkout DOKU sendiri', () => {
    /*
      Kalau tes ini merah: JANGAN menambal salinannya. Ganti jembatannya jadi
      impor `onRequest` asli, seperti jembatan create-payment tepat di atasnya.
      Menambal salinan hanya menunda penyimpangan berikutnya.
    */
    expect(viteConfig, 'vite.config.js membangun permintaan checkout DOKU-nya sendiri')
      .not.toContain('/checkout/v1/payment');
  });

  it('vite.config.js tidak menandatangani permintaan DOKU sendiri', () => {
    // Tanda tangan HMAC di dua tempat = dua kebenaran tentang apa yang
    // ditandatangani, dan yang menyimpang menentukan apakah DOKU menerima
    // permintaannya sama sekali.
    expect(viteConfig, 'vite.config.js menyusun component string DOKU sendiri')
      .not.toContain('Request-Target:');
  });

  it('jembatan checkout memakai berkas Pages Function yang asli', () => {
    expect(viteConfig, 'tidak ada jembatan yang mengimpor functions/api/doku/checkout.js')
      .toMatch(/functions\/api\/doku['"],\s*['"]checkout\.js|functions\/api\/doku\/checkout\.js/);
  });
});

describe('kontrak yang dijembatani', () => {
  it('checkout.js memulangkan request_id — nilai yang membuat tagihan bisa dicabut', () => {
    /*
      Ini yang membuat jembatan impor bernilai. Kalau baris ini hilang dari
      `checkout.js`, SEMUA tagihan manual — lokal maupun produksi — lahir tanpa
      `doku_request_id`, dan tidak ada satu pun yang bisa dimatikan lewat
      Cancel Order. Kegagalannya sunyi di kedua lingkungan.
    */
    const checkout = readFileSync(join(DIR, 'checkout.js'), 'utf8');
    expect(checkout, 'checkout.js tidak lagi memulangkan request_id')
      .toMatch(/request_id\s*:\s*requestId/);
  });

  it('checkout.js merutekan ke Sub Account JFU', () => {
    const checkout = readFileSync(join(DIR, 'checkout.js'), 'utf8');
    expect(checkout, 'checkout.js tidak lagi menyisipkan additional_info.account')
      .toMatch(/additional_info[\s\S]{0,120}account/);
  });
});
