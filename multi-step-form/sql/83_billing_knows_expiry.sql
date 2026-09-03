-- ============================================================================
-- 83 — `schedule_billing()` tahu kapan link bayarnya kedaluwarsa
-- ============================================================================
-- PRASYARAT (b) untuk gerbang "batalkan jadwal" (Bagian 6a); (a)-nya sql/81.
--
-- Masalahnya bukan cuma baris lama. TIDAK ADA satu pun cron yang
-- mengedaluwarsakan tagihan: `cron.job` hanya berisi activate-extends dan dua
-- notifier, dan yang membalik status `pending` cuma cancelSchedule() dan
-- cancelInvoice() — keduanya dipicu manusia. Jadi begitu `expires_at` sebuah
-- tagihan lewat, statusnya tetap `pending` SELAMANYA dan setiap lapisan yang
-- membaca status menganggapnya masih bisa dibayar.
--
-- sql/81 membersihkan 181 baris warisan sekali jalan. Tanpa migrasi ini,
-- masalah yang sama tumbuh lagi dari nol untuk setiap tagihan baru yang
-- diterbitkan Bagian 3 — dan gerbang 6a akan mencabut "Batalkan Jadwal" dari
-- jadwal-jadwal itu, satu per satu, diam-diam.
--
-- Kedaluwarsa dijawab DI SINI, bukan di klien, karena `isLiveInvoice`
-- (billingCompare.ts) wajib jadi cermin `live` di schedule_billing_summary().
-- Dua tempat menghitung "masih bisa dibayar" = angka di layar mulai berbeda
-- dari angka di database tanpa satu pun error.
--
-- ⚠️ Mengubah RETURNS TABLE, jadi butuh DROP + CREATE — `CREATE OR REPLACE`
-- menolak perubahan tipe kembalian. Keduanya dalam satu transaksi, dan
-- schedule_billing_summary() ikut ditulis ulang di bawah supaya tidak ada
-- jendela waktu ia memanggil bentuk yang sudah hilang.
--
-- `transactions` TIDAK punya kolom expires_at (diverifikasi produksi
-- 2026-09-03), jadi sisi itu selalu NULL — dan NULL berarti "tidak diketahui",
-- bukan "sudah kedaluwarsa". Baris pra-Bagian 3 karena itu TIDAK mendadak
-- dianggap mati oleh migrasi ini; yang mengurus mereka sql/81.
-- ============================================================================

DROP FUNCTION IF EXISTS public.schedule_billing(uuid);

CREATE FUNCTION public.schedule_billing(p_schedule_id uuid)
 RETURNS TABLE(payment_id text, amount bigint, status text, payment_url text, created_at timestamp with time zone, source text, voucher_code text, attempts integer, is_superseded boolean, payment_method text, payment_channel text, billed_start_date timestamp with time zone, is_stale boolean, expires_at timestamp with time zone, is_expired boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sched AS (SELECT start_date, status FROM ad_schedules WHERE id = p_schedule_id),
  events AS (
    SELECT coalesce(i.payment_id, 'inv:' || i.id::text) AS k, i.payment_id,
           i.amount::BIGINT AS amount, i.status, i.invoice_url AS url,
           -- invoices.created_at itu `timestamp without time zone` berisi UTC.
           -- Tanpa diangkat, ia dibaca sebagai waktu lokal dan urutannya kacau.
           (i.created_at AT TIME ZONE 'UTC') AS created_at,
           i.voucher_code, NULL::TEXT AS payment_method, NULL::TEXT AS payment_channel,
           i.billed_start_date, 1 AS prio, 'invoice' AS source,
           i.expires_at
      FROM invoices i WHERE i.schedule_id = p_schedule_id
    UNION ALL
    SELECT coalesce(t.payment_id, 'txn:' || t.id::text), t.payment_id,
           t.amount::BIGINT, t.status, t.payment_url, t.created_at,
           t.voucher_code, t.payment_method, t.payment_channel,
           t.billed_start_date, 2, 'transaction',
           -- transactions tidak punya kolom ini; NULL = tidak diketahui.
           NULL::TIMESTAMPTZ
      FROM transactions t WHERE t.schedule_id = p_schedule_id
  ),
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
         FILTER (WHERE e.billed_start_date IS NOT NULL))[1] AS billed_start_date,
      (array_agg(e.expires_at ORDER BY e.prio)
         FILTER (WHERE e.expires_at IS NOT NULL))[1] AS expires_at
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
          AND (
            -- sql/60: jadwalnya PINDAH sesudah tagihan terbit.
            ((SELECT start_date FROM sched) IS NOT NULL
             AND m.billed_start_date <> (SELECT start_date FROM sched))
            -- sql/82: jadwalnya MATI. `cancelSchedule()` mempertahankan
            -- tanggalnya, jadi cabang di atas tidak akan pernah menyalakannya.
            OR (SELECT status FROM sched) = 'cancelled'
          )) AS is_stale,
         m.expires_at,
         -- sql/83. Uang yang sudah masuk tidak pernah "kedaluwarsa": kalau DOKU
         -- menerimanya, ia diterima — tanggal di kolom ini tidak boleh
         -- membatalkan fakta itu.
         (payment_status_rank(m.status) <> 3
          AND m.expires_at IS NOT NULL
          AND m.expires_at < now()) AS is_expired
    FROM merged m ORDER BY m.created_at DESC;
$function$;

-- `live` ikut menutup pintu: tagihan yang link-nya sudah kedaluwarsa bukan
-- piutang, dan bukan penghalang pembatalan jadwal.
CREATE OR REPLACE FUNCTION public.schedule_billing_summary(p_schedule_id uuid)
 RETURNS TABLE(billed bigint, paid bigint, outstanding bigint, invoice_count integer, open_count integer, stale_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ev AS (SELECT * FROM schedule_billing(p_schedule_id)),
  -- HIDUP = uang yang sudah masuk, ATAU tagihan admin yang masih bisa dibayar.
  -- `pending` di transactions adalah checkout yang DITINGGALKAN, bukan piutang:
  -- memasukkannya menggelembungkan piutang jadi Rp 1,1 miliar.
  live AS (
    SELECT * FROM ev
     WHERE payment_status_rank(status) = 3
        OR (payment_status_rank(status) = 1 AND source = 'invoice'
            AND NOT is_superseded AND NOT is_stale AND NOT is_expired)
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

-- `schedule_billing_bulk` ikut membawa kolom barunya. Ia menyebut kolom satu
-- per satu, jadi ia TIDAK patah oleh DROP di atas — dan justru itu bahayanya:
-- papan jadwal (yang memakai bulk) akan diam-diam kehilangan kesadaran
-- kedaluwarsa sementara kartu tunggal memilikinya. Dua kebenaran, nol error.
-- (DROP juga di sini: tipe kembaliannya ikut berubah.)
DROP FUNCTION IF EXISTS public.schedule_billing_bulk(uuid);

CREATE FUNCTION public.schedule_billing_bulk(p_submission_id uuid)
 RETURNS TABLE(schedule_id uuid, source_id uuid, payment_id text, amount bigint, status text, payment_url text, created_at timestamp with time zone, source text, voucher_code text, attempts integer, is_superseded boolean, payment_method text, payment_channel text, billed_start_date timestamp with time zone, is_stale boolean, expires_at timestamp with time zone, is_expired boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.source_id, b.payment_id, b.amount, b.status, b.payment_url,
         b.created_at, b.source, b.voucher_code, b.attempts, b.is_superseded,
         b.payment_method, b.payment_channel, b.billed_start_date, b.is_stale,
         b.expires_at, b.is_expired
    FROM ad_schedules a
    CROSS JOIN LATERAL schedule_billing(a.id) b
   WHERE a.submission_id = p_submission_id
   ORDER BY a.ordinal, b.created_at DESC;
$function$;

-- ============================================================================
-- Verifikasi:
--   -- kolom barunya ada dan tidak mengubah baris lama (semua expires_at NULL)
--   select count(*) filter (where is_expired) as expired_now, count(*) as total
--     from ad_schedules a cross join lateral schedule_billing(a.id);
--
--   -- piutang total TIDAK berubah selama belum ada expires_at yang lewat
--   select sum(outstanding) from ad_schedules a
--     cross join lateral schedule_billing_summary(a.id);
-- ============================================================================
