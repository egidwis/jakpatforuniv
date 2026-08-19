import { describe, expect, test, afterEach, vi } from 'vitest';
// Alasan @ts-ignore-nya sama dengan voucher-validity.spec.ts: ini Cloudflare
// Pages Function berformat .js tanpa tipe, dan .d.ts di dalam functions/
// berisiko dirutekan sebagai endpoint. Tes ini juga sengaja TINGGAL DI SINI,
// bukan di functions/api/doku/, karena berkas di sana yang tidak berawalan `_`
// akan lahir jadi route publik.
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import { SUBMISSION_SELECT_COLUMNS, computeTotalCostFromSubmission } from '../../functions/api/doku/create-payment.js';

/*
  KENAPA TES INI ADA, DAN KENAPA BENTUKNYA BEGINI.

  `voucher-validity.spec.ts` sudah menguji bahwa JFUSUHUD mati 1 September 2026
  — di klien MAUPUN di server — dan seluruh suite-nya hijau. Bugnya tetap
  hidup di produksi selama itu.

  Sebabnya: tes itu memanggil `computeTotalCostFromSubmission` dengan
  `created_at` yang DISUAPKAN SENDIRI. Ia menguji fungsinya. Yang rusak adalah
  PEMANGGILNYA — `select=` di create-payment.js tidak pernah meminta kolom itu,
  jadi `orderInstant()` selalu jatuh ke `Date.now()` dan voucher dinilai pada
  jam bayar, bukan pada tanggal order lahir.

  Jadi tes ini tidak menguji harga. Ia menguji SAMBUNGAN antara daftar kolom
  yang diminta endpoint dan kolom yang dibaca jalur harga — dengan
  memproyeksikan baris uji lewat daftar itu persis seperti yang PostgREST
  lakukan.
*/

// 20 Agu 2026 10.00 WIB — JFUSUHUD masih hidup saat order LAHIR.
const LAHIR = '2026-08-20T03:00:00Z';
// 2 Sep 2026 11.00 WIB — JFUSUHUD sudah mati saat order DIBAYAR.
const DIBAYAR = Date.parse('2026-09-02T04:00:00Z');

// Baris `form_submissions` lengkap, seperti isi database.
const ORDER_DI_DATABASE = {
  id: '00000000-0000-4000-8000-000000000001',
  created_at: LAHIR,
  total_cost: 1_953_600,
  title: 'Survei uji',
  full_name: 'Peneliti Uji',
  email: 'peneliti@example.ac.id',
  phone_number: '08120000000',
  payment_status: 'pending',
  slot_booked_by: 'admin',
  slot_reserved_at: null,
  question_count: 20,
  duration: 7,
  winner_count: 10,
  prize_per_winner: 50_000,
  voucher_code: 'JFUSUHUD',
  distribution_type: 'regular',
  start_date: '2026-09-10',
  // Kolom yang ADA di tabel tapi tidak diminta endpoint — pembuktian bahwa
  // proyeksinya benar-benar memotong.
  admin_notes: 'rahasia internal',
  university: 'Universitas Uji',
};

/** Apa yang BENAR-BENAR sampai ke endpoint: PostgREST hanya memulangkan `select=`. */
const lewatSelect = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).filter(([kolom]) => SUBMISSION_SELECT_COLUMNS.includes(kolom)),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('daftar kolom yang diminta create-payment', () => {
  test('memuat setiap kolom yang dibaca jalur harga', () => {
    // Daftar ini ditulis ulang dengan sengaja, bukan diturunkan dari kode yang
    // diuji — kalau keduanya berasal dari sumber yang sama, tesnya tidak
    // menjaga apa pun.
    for (const kolom of [
      'created_at',
      'question_count',
      'duration',
      'winner_count',
      'prize_per_winner',
      'voucher_code',
      'distribution_type',
    ]) {
      expect(SUBMISSION_SELECT_COLUMNS, `kolom harga "${kolom}" hilang dari select=`)
        .toContain(kolom);
    }
  });

  test('proyeksinya nyata — kolom di luar daftar benar-benar terpotong', () => {
    expect(lewatSelect(ORDER_DI_DATABASE)).not.toHaveProperty('admin_notes');
  });
});

describe('voucher dinilai pada tanggal order LAHIR, bukan jam bayar', () => {
  test('baris hasil select= menghitung harga yang sama dengan baris lengkap', () => {
    vi.setSystemTime(DIBAYAR);
    expect(computeTotalCostFromSubmission(lewatSelect(ORDER_DI_DATABASE)).total).toBe(
      computeTotalCostFromSubmission(ORDER_DI_DATABASE).total,
    );
  });

  test('harganya tetap harga saat dipesan meski dibayar setelah 31 Agustus 2026', () => {
    vi.setSystemTime(DIBAYAR);
    // 1.953.600 = subtotal 1.760.000 (sudah didiskon 10%) + PPN 193.600.
    expect(computeTotalCostFromSubmission(lewatSelect(ORDER_DI_DATABASE)).total).toBe(1_953_600);
  });

  test('bug lamanya memang terjadi kalau created_at hilang — angkanya beda, bukan error', () => {
    // Bukti bahwa tes di atas benar-benar menjaga sesuatu: tanpa `created_at`
    // hasilnya bukan gagal keras, melainkan tagihan Rp 155.400 lebih mahal.
    // Itulah kenapa bug ini bisa hidup berbulan-bulan tanpa satu pun error.
    const tanpaCreatedAt = { ...lewatSelect(ORDER_DI_DATABASE) };
    delete (tanpaCreatedAt as Record<string, unknown>).created_at;

    vi.setSystemTime(DIBAYAR);
    expect(computeTotalCostFromSubmission(tanpaCreatedAt).total).toBe(2_109_000);
  });
});
