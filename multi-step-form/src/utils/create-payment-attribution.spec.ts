import { describe, expect, test } from 'vitest';
// Alasan @ts-ignore & lokasinya sama dengan create-payment-select.spec.ts: ini
// Cloudflare Pages Function berformat .js tanpa tipe, dan berkas di dalam
// functions/ yang tidak berawalan `_` akan lahir jadi route publik.
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import { scheduleAttribution, assertScheduleBelongsToOrder } from '../../functions/api/doku/create-payment.js';

/*
  KENAPA TES INI ADA.

  Temuan 1 & 4 dari review rencana Phase 4 — dua cacat JALUR UANG yang
  keduanya GAGAL SENYAP, tanpa satu pun error.

  ── Temuan 1: atribusi ──────────────────────────────────────────────────
  `create-payment.js` menulis baris `invoices`/`transactions` dengan
  `form_submission_id` SAJA. Untuk jadwal ke-2 akibatnya berantai:

    1. `derive_schedule_id()` (sql/51) jatuh ke cabang ELSIF dan menempelkan
       tagihan itu ke jadwal ORDINAL 1.
    2. `webhook.js` STEP 5 bercabang pada `entity_type === 'extend' && extend_id`.
       Tanpa keduanya, tagihan jadwal ke-2 yang LUNAS masuk cabang REGULER dan
       menandai ORDER INDUK paid — bukan jadwalnya.

  Uangnya mendarat di baris yang salah dan tidak ada yang error.

  ── Temuan 4: kepemilikan ───────────────────────────────────────────────
  `scheduleId` datang dari browser. Tanpa penjaga, endpoint menerima id jadwal
  milik ORDER LAIN dan menempelkan tagihan order A ke jadwal order B.

  ── Kenapa bentuknya begini ─────────────────────────────────────────────
  Mengikuti pelajaran create-payment-select.spec.ts: yang diuji adalah
  SAMBUNGAN, bukan fungsi yang berdiri sendiri. Nilai yang diharapkan ditulis
  ulang di sini dengan sengaja — kalau tes dan kode menurunkannya dari sumber
  yang sama, tesnya tidak menjaga apa pun.
*/

const ORDER_INDUK = '11111111-1111-4111-8111-111111111111';
const ORDER_LAIN = '22222222-2222-4222-8222-222222222222';

/**
 * Baris `ad_schedules` jadwal ke-2, seperti isi database.
 *
 * ⚠️ TIGA UUID BERBEDA, dan tertukarnya tidak pernah error:
 *   id        → `invoices.schedule_id` dan resolver `/bayar/<id>`
 *   sourceId  → `invoices.extend_id` (kunci webhook STEP 5)
 *   submissionId → order induknya
 */
const JADWAL_KE_2 = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  submission_id: ORDER_INDUK,
  source_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ordinal: 2,
};

describe('atribusi tagihan jadwal ke-2 (Temuan 1)', () => {
  test('membawa entity_type, extend_id, DAN schedule_id sekaligus', () => {
    expect(scheduleAttribution(JADWAL_KE_2)).toEqual({
      entity_type: 'extend',
      extend_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      schedule_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  test('extend_id = source_id, BUKAN ad_schedules.id', () => {
    // Kunci yang dipakai webhook STEP 5 adalah `source_id`:
    //   ad_schedules?source_table=eq.form_submissions_extend&source_id=eq.<extend_id>
    // Mengisinya dengan `id` membuat PATCH-nya tidak menemukan baris apa pun —
    // dan `sbPatchExpectingRows` akan berteriak, tapi uangnya sudah masuk.
    const attr = scheduleAttribution(JADWAL_KE_2);
    expect(attr.extend_id).toBe(JADWAL_KE_2.source_id);
    expect(attr.extend_id).not.toBe(JADWAL_KE_2.id);
  });

  test('schedule_id = ad_schedules.id, BUKAN source_id', () => {
    // `derive_schedule_id()` menghormati nilai yang dikirim penulis
    // (`IF NEW.schedule_id IS NOT NULL THEN RETURN NEW`), jadi mengirimnya
    // sendiri lebih pendek daripada menumpang trigger — tapi hanya kalau
    // nilainya benar. Resolver /bayar/ dan schedule_billing() dikunci ke `id`.
    const attr = scheduleAttribution(JADWAL_KE_2);
    expect(attr.schedule_id).toBe(JADWAL_KE_2.id);
    expect(attr.schedule_id).not.toBe(JADWAL_KE_2.source_id);
  });

  test('tanpa jadwal (ordinal 1) atribusinya KOSONG, bukan null-null', () => {
    // Jalur ordinal 1 tidak boleh berubah sama sekali. Menulis
    // `entity_type: null` bukan hal yang sama dengan tidak menulis kolomnya:
    // yang pertama menimpa, yang kedua membiarkan trigger bekerja.
    expect(scheduleAttribution(null)).toEqual({});
    expect(scheduleAttribution(undefined)).toEqual({});
  });

  test('bentuknya sama dengan jalur admin (invoiceWrite.ts)', () => {
    // `invoiceWrite.ts:107-108` sudah melakukan ini untuk admin:
    //   entry.isExtension ? { entity_type: 'extend', extend_id: entry.sourceId } : {}
    // Dua penulis untuk satu pasangan kolom; bentuknya wajib identik.
    const attr = scheduleAttribution(JADWAL_KE_2);
    expect(attr.entity_type).toBe('extend');
    expect(Object.keys(attr).sort()).toEqual(['entity_type', 'extend_id', 'schedule_id']);
  });
});

describe('kepemilikan jadwal (Temuan 4)', () => {
  test('jadwal milik order yang sama LOLOS', () => {
    expect(() => assertScheduleBelongsToOrder(JADWAL_KE_2, ORDER_INDUK)).not.toThrow();
  });

  test('jadwal milik ORDER LAIN ditolak', () => {
    // Tanpa penjaga ini, browser bisa menagih order A untuk jadwal order B.
    expect(() => assertScheduleBelongsToOrder(JADWAL_KE_2, ORDER_LAIN)).toThrow();
  });

  test('jadwal yang tidak ditemukan ditolak — bukan diloloskan diam-diam', () => {
    // Gagal-TERTUTUP. `scheduleId` yang tidak ada di database adalah permintaan
    // yang salah, bukan izin untuk kembali ke perilaku ordinal 1.
    expect(() => assertScheduleBelongsToOrder(null, ORDER_INDUK)).toThrow();
  });

  test('perbandingannya tidak bisa diakali beda casing/spasi', () => {
    expect(() =>
      assertScheduleBelongsToOrder(JADWAL_KE_2, ` ${ORDER_INDUK.toUpperCase()} `)
    ).not.toThrow();
  });
});
