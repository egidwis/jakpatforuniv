-- ============================================================================
-- 84 — Simpan `doku_request_id`, dan catat hasil pembatalannya
-- ============================================================================
-- PRASYARAT untuk Cancel Order API (`POST /checkout/v3/cancellations`), yang
-- MENUNTUT `original_request_id` di badannya.
--
-- Nilai itu adalah `Request-Id` yang kita kirim saat membuat checkout. Hari ini
-- checkout.js:68 dan create-payment.js:528 menghasilkannya lewat
-- `crypto.randomUUID()`, hanya mem-`console.log`-nya, lalu MEMBUANGNYA — dan
-- tidak ada kolom untuk menyimpannya. Tanpa migrasi ini API-nya tidak bisa
-- dipanggil sama sekali.
--
-- Semua baris lama NULL, dan tidak ada sumber untuk memulihkannya: nilainya
-- tidak pernah ditulis ke mana pun. 183 tagihan `pending` yang sudah ada —
-- termasuk `…458` di order af004b84 — karena itu TIDAK bisa dimatikan di DOKU.
-- Mereka mati sendiri saat `payment_due_date`-nya lewat; sampai itu, penjaga
-- webhook sql/80 yang menanggungnya.
--
-- ⚠️ `doku_cancelled_at` BUKAN KOSMETIK — ia yang membuat layar dan email bisa
-- berkata jujur.
--
-- Sesudah gerbang 6a, membatalkan tagihan dan membatalkan jadwal menjadi DUA
-- LANGKAH TERPISAH: panggilan DOKU terjadi di langkah pertama, email pembatalan
-- dikirim di langkah kedua. Kalau hasil panggilan itu hanya jadi toast, ia mati
-- bersama toast-nya — dan email di langkah berikutnya cuma bisa MENEBAK apakah
-- link-nya sudah mati. Dengan kolom ini keduanya membaca sumber yang sama:
--   NULL   → tidak pernah berhasil dimatikan → cabang peringatan
--   terisi → dimatikan di DOKU pada waktu itu → cabang tenang
--
-- Jangan pernah menampilkan "link sudah dimatikan" tanpa kolom ini terisi.
-- Kalimat yang menenangkan tanpa dasar persis yang membuat insiden ini terjadi.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS doku_request_id TEXT,
  ADD COLUMN IF NOT EXISTS doku_cancelled_at TIMESTAMPTZ;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS doku_request_id TEXT;

COMMENT ON COLUMN public.invoices.doku_request_id IS
  'Request-Id yang dikirim ke DOKU saat checkout dibuat. Dipakai sebagai '
  '`original_request_id` di Cancel Order API. NULL = baris pra-sql/84; '
  'link-nya TIDAK bisa dimatikan lewat API dan harus dibiarkan kedaluwarsa.';

COMMENT ON COLUMN public.invoices.doku_cancelled_at IS
  'Kapan DOKU MENGONFIRMASI link bayarnya dinonaktifkan. NULL = belum pernah '
  'berhasil — termasuk saat panggilannya gagal, kanalnya tidak didukung, atau '
  'baris ini tidak punya doku_request_id. Dialog pembatalan tagihan dan email '
  'pembatalan jadwal membaca kolom ini untuk memilih nada; jangan pernah '
  'mengklaim link sudah mati tanpa nilai di sini.';

COMMENT ON COLUMN public.transactions.doku_request_id IS
  'Pasangan invoices.doku_request_id. Ditulis bersama payment_id supaya jalur '
  'swalayan (create-payment.js) juga bisa dibatalkan.';

-- ============================================================================
-- Verifikasi:
--   select count(*) filter (where doku_request_id is not null) as punya_req,
--          count(*) as total
--     from public.invoices;   -- sesudah migrasi: punya_req = 0, itu wajar
--
--   -- sesudah kode tayang, tagihan BARU harus terisi:
--   select payment_id, doku_request_id, doku_cancelled_at
--     from public.invoices order by created_at desc limit 5;
-- ============================================================================
