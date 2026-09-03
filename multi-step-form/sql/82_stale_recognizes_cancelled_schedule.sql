-- ============================================================================
-- 82 — `is_stale` mengenali jadwal yang MATI, bukan cuma yang PINDAH
-- ============================================================================
-- sql/60 memperkenalkan `billed_start_date` + `is_stale` untuk menutup balapan
-- admin-vs-peneliti: jadwal yang tanggalnya digeser sesudah tagihannya terbit
-- membuat tagihan itu basi. Rumusnya
-- `billed_start_date <> ad_schedules.start_date`.
--
-- Yang TIDAK tertangkap: jadwal yang DIBATALKAN. `cancelSchedule()` sengaja
-- MEMPERTAHANKAN tanggalnya, jadi tagihan milik jadwal batal punya
-- `billed_start_date = start_date` — dan `is_stale` = false. Terukur di order
-- af004b84: billed 04 Sep = sched 04 Sep, sementara jadwalnya sudah `cancelled`
-- sejak 20 menit setelah tagihan terbit. Detektornya melihat jadwal yang
-- pindah, buta terhadap yang mati.
--
-- Sesudah migrasi ini: tagihan milik jadwal batal tampil basi di kartu jadwal
-- dan halaman Transaksi SEJAK jadwalnya dibatalkan — tanpa menunggu ada yang
-- membayarnya lebih dulu.
--
-- Badan fungsi disalin dari `pg_get_functiondef` PRODUKSI, bukan dari berkas
-- sql/ mana pun (jebakan sql/49 vs sql/51: menyalin dari berkas yang salah
-- menghidupkan kembali cabang yang sudah sengaja dibuang).
--
-- Perubahannya TEPAT DUA baris terhadap versi produksi:
--   1. CTE `sched` ikut mengambil `status`.
--   2. `is_stale` juga benar saat `sched.status = 'cancelled'`.
-- Dua pengecualian sql/60 DIPERTAHANKAN APA ADANYA:
--   • uang yang sudah masuk tidak pernah basi (`payment_status_rank <> 3`)
--   • baris lama tidak pernah basi (`billed_start_date IS NOT NULL`)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_billing(p_schedule_id uuid)
 RETURNS TABLE(payment_id text, amount bigint, status text, payment_url text, created_at timestamp with time zone, source text, voucher_code text, attempts integer, is_superseded boolean, payment_method text, payment_channel text, billed_start_date timestamp with time zone, is_stale boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- sql/82: `status` ikut diambil — `is_stale` sekarang juga peduli jadwal MATI.
  WITH sched AS (SELECT start_date, status FROM ad_schedules WHERE id = p_schedule_id),
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
          AND (
            -- sql/60: jadwalnya PINDAH sesudah tagihan terbit.
            ((SELECT start_date FROM sched) IS NOT NULL
             AND m.billed_start_date <> (SELECT start_date FROM sched))
            -- sql/82: jadwalnya MATI. `cancelSchedule()` mempertahankan
            -- tanggalnya, jadi cabang di atas tidak akan pernah menyalakannya.
            OR (SELECT status FROM sched) = 'cancelled'
          )) AS is_stale
    FROM merged m ORDER BY m.created_at DESC;
$function$;

-- ============================================================================
-- Verifikasi:
--
--   -- tagihan milik jadwal batal → is_stale TRUE
--   select payment_id, status, is_stale from schedule_billing('<id jadwal cancelled>');
--
--   -- tagihan LUNAS mana pun → tetap FALSE, termasuk di jadwal batal
--   select payment_id, status, is_stale from schedule_billing('<id jadwal paid>');
--
--   -- jadwal hidup yang tanggalnya belum pindah → tetap FALSE (regresi sql/60)
-- ============================================================================
