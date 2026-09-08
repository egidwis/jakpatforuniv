import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  ═══════════════════════════════════════════════════════════════════════════
  SETIAP PERMINTAAN CHECKOUT KE DOKU WAJIB MEMBAWA UMURNYA SENDIRI
  ═══════════════════════════════════════════════════════════════════════════

  Keputusan pemilik produk (2026-09-08): "Batas Waktu" di Pengaturan Kadaluarsa
  dashboard DOKU DIBIARKAN 0 Jam 0 Menit — SELAMANYA — supaya kedaluwarsa murni
  diatur sistem ini.

  Keputusan itu benar, dan lebih tegas daripada rencana semula: menyetel nilai
  dashboard hanya berguna kalau ia sekadar default, sementara MEMBIARKANNYA
  KOSONG benar di kedua kemungkinan (default maupun menimpa). Karena itu
  pertanyaan ke DOKU jadi tidak perlu.

  ⚠️ TAPI ADA YANG HILANG, DAN BERKAS INI PENGGANTINYA.

  Nilai dashboard tadinya direncanakan jadi JARING PENGAMAN untuk endpoint masa
  depan yang lupa mengirim `payment.payment_due_date`. Dengan dashboard
  dikosongkan selamanya, jaring itu tidak ada: sebuah endpoint baru yang lupa
  akan melahirkan link yang umurnya ditentukan DOKU, bukan kami — dan itu
  membatalkan seluruh aturan cutoff 14.00 WIB tanpa satu pun error.

  Kegagalannya SUNYI: link-nya terbit, terlihat normal, dan baru terasa salah
  berminggu-minggu kemudian saat seseorang membayar jadwal yang sudah lewat.

  Jadi jaringnya pindah ke sini. Ini tes SUMBER, bukan tes unit, dan itu
  disengaja: yang perlu dijaga bukan perilaku dua endpoint yang ADA sekarang —
  itu sudah benar — melainkan endpoint yang BELUM DITULIS.
*/

const DIR = dirname(fileURLToPath(import.meta.url));

/** Endpoint DOKU yang menerbitkan link pembayaran. */
const CHECKOUT_TARGET = '/checkout/v1/payment';

/**
 * Berkas yang HARI INI menerbitkan link. Daftarnya dikunci supaya menambah
 * penerbit baru jadi tindakan SADAR — orang yang menambahkannya harus lewat
 * berkas ini, dan karena itu membaca catatan di atas.
 */
const KNOWN_ISSUERS = ['checkout.js', 'create-payment.js'];

const sourceFiles = readdirSync(DIR)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.spec.js'))
  .map((f) => ({ name: f, body: readFileSync(join(DIR, f), 'utf8') }));

const issuers = sourceFiles.filter((f) => f.body.includes(CHECKOUT_TARGET));

describe('umur link DOKU — jaring pengaman pengganti setelan dashboard', () => {
  it('daftar penerbit link tidak berubah diam-diam', () => {
    /*
      Kalau tes ini merah karena Anda menambah endpoint penerbit baru: bagus,
      itu memang tugasnya. Tambahkan namanya ke KNOWN_ISSUERS — SESUDAH
      memastikan endpoint itu mengirim `payment.payment_due_date` sendiri.
    */
    expect(issuers.map((f) => f.name).sort()).toEqual([...KNOWN_ISSUERS].sort());
  });

  it('setiap penerbit link mengirim `payment_due_date` sendiri', () => {
    for (const f of issuers) {
      expect(f.body, `${f.name} memanggil ${CHECKOUT_TARGET} tanpa mengirim payment_due_date`)
        .toContain('payment_due_date');
    }
  });

  it('setiap penerbit menaruhnya di dalam objek `payment`, bukan sekadar menyebut namanya', () => {
    // `payment_due_date` yang cuma muncul di komentar tidak menagih apa pun ke
    // DOKU. Yang dikirim harus benar-benar ada di badan request.
    for (const f of issuers) {
      expect(f.body, `${f.name}: payment_due_date tidak berada di dalam objek payment`)
        .toMatch(/payment\s*:\s*\{[^}]*payment_due_date/s);
    }
  });

  it('lantai default kedua penerbit sama: 60 menit', () => {
    /*
      60 = `MIN_INVOICE_MINUTES` di payment.ts, dan itu bukan kebetulan — lihat
      catatan invarian cutoff di sana. Kalau salah satu berkas memakai angka
      lain, permintaan yang tidak menyebutkan umur akan mendapat umur berbeda
      tergantung endpoint mana yang dilewatinya.
    */
    // Dua bentuk fallback yang dipakai kedua berkas, dan keduanya sah:
    //   checkout.js        `requestData.payment_due_date || 60`
    //   create-payment.js  `... > 0 ? Math.round(...) : 60`
    for (const f of issuers) {
      expect(f.body, `${f.name}: default umur link bukan 60 menit`)
        .toMatch(/(\|\||:)\s*60\b/);
    }
  });
});

describe('pembatalan bukan penerbitan', () => {
  it('cancel-order tidak ikut terhitung sebagai penerbit link', () => {
    // Ia memakai `/checkout/v3/cancellations` — target lain, dan memang tidak
    // punya urusan dengan umur link. Tes ini menjaga daftar di atas tetap
    // bermakna kalau suatu saat pencocokannya dilonggarkan.
    expect(issuers.map((f) => f.name)).not.toContain('cancel-order.js');
  });
});
