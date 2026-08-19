-- 60_billing_staleness.sql
-- Date: 2026-08-19  ·  Task 13 Rilis 2 (bagian 1)
--
-- Sebuah tagihan berhenti berlaku kalau jendela tayang yang ia tagihkan sudah
-- berpindah. Dinilai SAAT DIBACA, bukan saat ditulis.
--
-- ============================================================================
-- MASALAH YANG DITUTUP: BALAPAN ADMIN vs PENELITI
-- ============================================================================
--
-- Saat sebuah pembayaran kedaluwarsa, dua orang bisa bertindak bersamaan:
-- admin menerbitkan tagihan ulang, peneliti menjadwalkan ulang. Tiga urutan,
-- dan sebelum migrasi ini hanya satu yang berakhir benar:
--
--   A. Admin menagih -> peneliti menjadwalkan ulang.
--      `prepareForReschedule` mematikan tagihan itu. Hasilnya BENAR (jadwal
--      menang), tapi admin tidak diberi tahu apa pun.
--
--   B. Peneliti menjadwalkan ulang -> admin menagih.
--      `InvoiceForm` sudah terbuka dengan harga tanggal LAMA. Tagihannya lahir
--      menunjuk jadwal yang tanggalnya sudah berubah, dengan nominal lama, dan
--      TIDAK ADA yang memperingatkan siapa pun.
--
--   C. Benar-benar bersamaan.
--      Tagihan bisa lolos dari sapuan expiry — ia dibuat sesudah sapuan itu
--      membaca daftarnya — lalu bertahan hidup menunjuk jendela yang sudah
--      tidak ada. Peneliti bisa MEMBAYAR PENUH untuk slot yang sudah pindah.
--      Ini yang paling mahal: sistem ini tidak punya alur refund.
--
-- Keputusan pemilik produk 2026-08-19: **PENELITI YANG MENANG.** Slot adalah
-- barang langkanya; tagihan cuma turunan dari jadwal. Menerbitkan ulang
-- tagihan gratis, mengembalikan uang tidak.
--
-- ============================================================================
-- KENAPA DINILAI SAAT DIBACA, BUKAN DIKUNCI SAAT MENULIS
-- ============================================================================
--
-- Kunci optimistis (bandingkan `updated_at` jadwal sebelum menyimpan) menutup
-- urutan B tapi TIDAK menutup C: penjadwalan ulang yang mendarat sesudah
-- INSERT tetap lolos. Selama kebenarannya bergantung pada urutan penulisan,
-- selalu ada celah.
--
-- Menyimpan jendela yang DITAGIHKAN lalu membandingkannya saat dibaca membuat
-- pertanyaan "apakah tagihan ini masih berlaku?" tidak punya jendela balapan
-- sama sekali. Tagihan yang menyelinap saat balapan tetap lahir — lalu mati
-- seketika begitu ada yang membacanya. Polanya sama dengan `is_superseded`
-- di sql/53.
--
-- ⚠️ UANG YANG SUDAH MASUK TIDAK PERNAH BASI. `is_stale` hanya berlaku untuk
-- tagihan yang BELUM dibayar. Kalau pembayarannya sungguh mendarat, ia menang
-- atas status di layar — aturan yang sama dengan pembatalan tagihan di sql/53.
--
-- ⚠️ BARIS LAMA TIDAK PERNAH BASI. `billed_start_date` NULL untuk semua baris
-- yang sudah ada, dan NULL berarti "tidak diketahui", bukan "tidak cocok".
-- Membackfillnya dari `ad_schedules.start_date` hari ini akan membuat setiap
-- tagihan lama tampak sah selamanya ATAU membatalkan 400+ tagihan sekaligus,
-- tergantung arah tebakannya. Keduanya salah; biarkan NULL.

BEGIN;

ALTER TABLE public.invoices     ADD COLUMN IF NOT EXISTS billed_start_date TIMESTAMPTZ;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS billed_start_date TIMESTAMPTZ;

COMMENT ON COLUMN public.invoices.billed_start_date IS
  'Jendela tayang yang ditagihkan baris ini, disalin dari ad_schedules.start_date saat tagihan terbit. Kalau jadwalnya kemudian pindah, tagihan ini basi (lihat schedule_billing.is_stale). NULL = baris lama, tidak pernah dianggap basi.';
COMMENT ON COLUMN public.transactions.billed_start_date IS
  'Lihat invoices.billed_start_date.';

COMMIT;

-- ============================================================================
-- Fungsi dibangun ulang: `is_stale` masuk ke schedule_billing, dan
-- schedule_billing_summary mengecualikannya dari `billed` + `open_count`.
-- (Definisi lengkap ada di riwayat git commit ini; bentuknya sama dengan
-- sql/53 ditambah kolom `billed_start_date` dan `is_stale`.)
--
--   is_stale = status BUKAN lunas
--              AND billed_start_date IS NOT NULL
--              AND ad_schedules.start_date IS NOT NULL
--              AND billed_start_date <> ad_schedules.start_date
--
-- `schedule_billing_summary` mendapat kolom baru `stale_count` supaya layar
-- bisa menjelaskan KENAPA sebuah tagihan hilang dari hitungan, bukan cuma
-- menampilkan angka yang mengecil tanpa sebab.
--
-- ============================================================================
-- VERIFIKASI — dijalankan 2026-08-19 sesudah diterapkan
-- ============================================================================
--
--   piutang total .................. Rp 20.482.163  (tidak bergerak)
--   tagihan basi ................... 0              (semua baris lama NULL)
--   invarian: outstanding tanpa
--     tagihan terbuka .............. 0
--   invarian: billed < paid ........ 0
--   anon boleh EXECUTE ............. false
--
-- Nol pergerakan angka adalah HASIL YANG DIINGINKAN di sini: migrasi ini
-- hanya memasang alatnya. Baris basi baru muncul untuk tagihan yang terbit
-- SESUDAH rilis ini, saat jadwalnya benar-benar berpindah.
--
-- ============================================================================
-- YANG HARUS IKUT, KALAU TIDAK KOLOMNYA MATI SEBELUM DIPAKAI
-- ============================================================================
--
-- `billed_start_date` diisi DUA penulis, dan keduanya wajib:
--   - `InvoiceForm.tsx`      -> tagihan manual admin
--   - `create-payment.js`    -> pembayaran swalayan peneliti
--
-- Melewatkan salah satunya berarti tagihan dari jalur itu tidak pernah bisa
-- dinyatakan basi — persis lubang yang trigger penurun `schedule_id` (sql/51
-- bagian A2) ada untuk mencegah di kolom sebelumnya.
