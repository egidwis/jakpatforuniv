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
-- ⚠️ DEFINISI LENGKAP DITULIS DI SINI, BUKAN DITUNJUK KE RIWAYAT GIT.
-- Versi pertama berkas ini cuma memuat ALTER TABLE dan menyebut "definisi
-- lengkap ada di commit ini" — padahal DDL-nya tidak ikut sama sekali.
-- Akibatnya produksi punya `is_stale` tapi repo tidak: klon baru yang
-- menjalankan sql/53 lalu sql/60 mendapat fungsi versi sql/53, dan frontend
-- yang membaca `is_stale`/`stale_count` mati tanpa ada yang salah ketik.
-- Migrasi harus bisa dijalankan ulang dari nol; komentar tidak bisa.
--
-- RETURNS TABLE-nya berubah, jadi DROP dulu — CREATE OR REPLACE menolak
-- perubahan signature. Urutannya terbalik dari ketergantungan.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.schedule_billing_bulk(UUID);
DROP FUNCTION IF EXISTS public.schedule_billing_summary(UUID);
DROP FUNCTION IF EXISTS public.schedule_billing(UUID);

-- ⚠️ SECURITY INVOKER (bawaan), BUKAN DEFINER — disengaja. DEFINER akan
-- membuka riwayat pembayaran siapa pun kepada siapa pun yang bisa menebak UUID.
CREATE OR REPLACE FUNCTION public.schedule_billing(p_schedule_id UUID)
RETURNS TABLE (
  payment_id TEXT, amount BIGINT, status TEXT, payment_url TEXT,
  created_at TIMESTAMPTZ, source TEXT, voucher_code TEXT, attempts INT,
  is_superseded BOOLEAN, payment_method TEXT, payment_channel TEXT,
  billed_start_date TIMESTAMPTZ, is_stale BOOLEAN
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sched AS (SELECT start_date FROM ad_schedules WHERE id = p_schedule_id),
  events AS (
    SELECT coalesce(i.payment_id, 'inv:' || i.id::text) AS k, i.payment_id,
           i.amount::BIGINT AS amount, i.status, i.invoice_url AS url,
           -- invoices.created_at itu `timestamp without time zone` berisi UTC.
           -- Tanpa diangkat, ia dibaca sebagai waktu lokal dan urutannya kacau.
           (i.created_at AT TIME ZONE 'UTC') AS created_at,
           i.voucher_code, NULL::TEXT AS payment_method, NULL::TEXT AS payment_channel,
           i.billed_start_date, 1 AS prio, 'invoice' AS source
      FROM invoices i WHERE i.schedule_id = p_schedule_id
    UNION ALL
    SELECT coalesce(t.payment_id, 'txn:' || t.id::text), t.payment_id,
           t.amount::BIGINT, t.status, t.payment_url, t.created_at,
           t.voucher_code, t.payment_method, t.payment_channel,
           t.billed_start_date, 2, 'transaction'
      FROM transactions t WHERE t.schedule_id = p_schedule_id
  ),
  -- Satu baris per payment_id: invoice menang untuk NOMINAL (prio 1),
  -- transaksi hanya boleh MENAIKKAN status.
  merged AS (
    SELECT
      max(e.payment_id) AS payment_id,
      (array_agg(e.amount ORDER BY e.prio, e.created_at DESC))[1] AS amount,
      (array_agg(e.status ORDER BY payment_status_rank(e.status) DESC,
                                   e.prio, e.created_at DESC))[1] AS status,
      (array_agg(e.url ORDER BY e.prio, e.created_at DESC)
         FILTER (WHERE e.url IS NOT NULL))[1] AS payment_url,
      min(e.created_at) AS created_at,
      (array_agg(e.source ORDER BY e.prio))[1] AS source,
      (array_agg(e.voucher_code ORDER BY e.prio)
         FILTER (WHERE e.voucher_code IS NOT NULL AND e.voucher_code <> ''))[1] AS voucher_code,
      count(*) FILTER (WHERE e.source = 'transaction')::INT AS attempts,
      (array_agg(e.payment_method ORDER BY payment_status_rank(e.status) DESC, e.created_at DESC)
         FILTER (WHERE e.payment_method IS NOT NULL))[1] AS payment_method,
      (array_agg(e.payment_channel ORDER BY payment_status_rank(e.status) DESC, e.created_at DESC)
         FILTER (WHERE e.payment_channel IS NOT NULL))[1] AS payment_channel,
      (array_agg(e.billed_start_date ORDER BY e.prio)
         FILTER (WHERE e.billed_start_date IS NOT NULL))[1] AS billed_start_date
    FROM events e GROUP BY e.k
  )
  SELECT m.payment_id, m.amount, m.status, m.payment_url, m.created_at,
         m.source, m.voucher_code, m.attempts,
         (payment_status_rank(m.status) = 1
          AND EXISTS (SELECT 1 FROM merged n
                       WHERE payment_status_rank(n.status) = 3
                         AND n.created_at > m.created_at)) AS is_superseded,
         m.payment_method, m.payment_channel,
         m.billed_start_date,
         -- Uang yang sudah masuk TIDAK PERNAH basi. NULL = baris lama, juga tidak.
         (payment_status_rank(m.status) <> 3
          AND m.billed_start_date IS NOT NULL
          AND (SELECT start_date FROM sched) IS NOT NULL
          AND m.billed_start_date <> (SELECT start_date FROM sched)) AS is_stale
    FROM merged m ORDER BY m.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_billing_summary(p_schedule_id UUID)
RETURNS TABLE (
  billed BIGINT, paid BIGINT, outstanding BIGINT,
  invoice_count INT, open_count INT, stale_count INT
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH ev AS (SELECT * FROM schedule_billing(p_schedule_id)),
  -- HIDUP = uang yang sudah masuk, ATAU tagihan admin yang masih bisa dibayar.
  -- `pending` di transactions adalah checkout yang DITINGGALKAN, bukan piutang:
  -- memasukkannya menggelembungkan piutang jadi Rp 1,1 miliar.
  live AS (
    SELECT * FROM ev
     WHERE payment_status_rank(status) = 3
        OR (payment_status_rank(status) = 1 AND source = 'invoice'
            AND NOT is_superseded AND NOT is_stale)
  )
  SELECT
    coalesce((SELECT sum(amount) FROM live), 0)::BIGINT,
    coalesce((SELECT sum(amount) FROM live WHERE payment_status_rank(status) = 3), 0)::BIGINT,
    (coalesce((SELECT sum(amount) FROM live), 0)
   - coalesce((SELECT sum(amount) FROM live WHERE payment_status_rank(status) = 3), 0))::BIGINT,
    (SELECT count(*) FROM ev)::INT,
    (SELECT count(*) FROM live WHERE payment_status_rank(status) = 1)::INT,
    (SELECT count(*) FROM ev WHERE is_stale)::INT;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_billing_bulk(p_submission_id UUID)
RETURNS TABLE (
  schedule_id UUID, source_id UUID, payment_id TEXT, amount BIGINT, status TEXT,
  payment_url TEXT, created_at TIMESTAMPTZ, source TEXT, voucher_code TEXT,
  attempts INT, is_superseded BOOLEAN, payment_method TEXT, payment_channel TEXT,
  billed_start_date TIMESTAMPTZ, is_stale BOOLEAN
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT a.id, a.source_id, b.payment_id, b.amount, b.status, b.payment_url,
         b.created_at, b.source, b.voucher_code, b.attempts, b.is_superseded,
         b.payment_method, b.payment_channel, b.billed_start_date, b.is_stale
    FROM ad_schedules a
    CROSS JOIN LATERAL schedule_billing(a.id) b
   WHERE a.submission_id = p_submission_id
   ORDER BY a.ordinal, b.created_at DESC;
$function$;

-- ⚠️ DROP menghapus grant lama; DEFAULT PRIVILEGES Supabase memasang ulang
-- `anon`. Cabut eksplisit lagi — sama seperti sql/53.
REVOKE ALL ON FUNCTION public.schedule_billing(UUID)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_billing_summary(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_billing_bulk(UUID)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.schedule_billing(UUID)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_billing_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_billing_bulk(UUID)    TO authenticated, service_role;

COMMIT;

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
