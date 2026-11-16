-- ============================================================================
-- sql/136b — WEBINAR: EMAIL OTOMATIS TANPA TABEL ANTREAN — BAGIAN B
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-11-02-webinar-jfu.md, "Iterasi 6 Nov (4)".
--
-- Email otomatis webinar pindah ke pola email iklan (notify_primary_ads_live,
-- sql/48): cron Postgres memanggil Function SEKALI PER PESERTA lewat pg_net,
-- lalu langsung mengisi kolom penanda di webinar_orders. Gagal kirim dicatat
-- Function di webinar_orders.email_error dan TIDAK diulang otomatis.
--
-- ── YANG BERUBAH ────────────────────────────────────────────────────────────
--
--   1. Jejak sistem lama disalin ke kolom penanda sql/136 (deliveries `sent`),
--      supaya tidak ada email yang terkirim dua kali.
--   2. webinar_notify_tick ditulis ulang (RETURNS integer = jumlah panggilan).
--      Cron `webinar-notify` (tiap menit) TIDAK diubah; perintahnya tetap
--      `select public.webinar_notify_tick()`.
--   3. Dihapus: webinar_broadcasts, webinar_broadcast_deliveries, dan fungsi
--      webinar_enqueue_broadcast, webinar_enqueue_due_reminders,
--      webinar_claim_deliveries, webinar_record_deliveries, webinar_retry_broadcast.
--
-- ── ATURAN PER JENIS (tiket live LUNAS saja; refund tidak pernah dikirimi) ──
--
--   Satu email per order per menit, prioritas sesuai urutan:
--   1 Pembatalan      acara cancelled, mulai > now() − 7 hari, cancel_email_sent_at kosong.
--   2 Jadwal berubah  acara published live, belum mulai, schedule_changed_at dalam 7 hari,
--                     order lunas SEBELUM schedule_changed_at, penanda kosong/lebih lama.
--   3 Pengingat H-1   acara published live, sekarang di [mulai − 24 jam, mulai − 3 jam),
--                     reminder_sent_for ≠ starts_at, lunas ≥ 6 jam lalu.
--                     Dilewati (ditandai tanpa dikirim) bila email jadwal < 12 jam lalu.
--   4 Rekaman         acara published, recording_published_at dalam 7 hari, penanda kosong.
--
-- ── KEPUTUSAN YANG MUDAH SALAH DIBACA ───────────────────────────────────────
--
--   * Penanda diisi SAAT Function dipanggil, bukan saat email terkirim (sama dengan
--     iklan). pg_net baru mengirim sesudah transaksi tick COMMIT, jadi penanda dan
--     panggilan selalu sejalan.
--   * Isi email dihitung Function saat dikirim (jadwal terbaru), jadi dua perubahan
--     jadwal sebelum tick jalan = satu email.
--   * schedule_email_sent_at diisi greatest(now(), schedule_changed_at): jam
--     Cloudflare dan Postgres bisa selisih sedikit, dan perubahan berikutnya harus
--     tetap lebih baru dari penanda.
--   * pg_try_advisory_xact_lock: tick yang tumpang tindih tidak mengirim dobel.
--   * Maks. 25 panggilan per tick (per menit). Sisanya menit berikutnya.
--   * SECURITY DEFINER hanya untuk membaca vault. Hak dicabut dari PUBLIC, anon,
--     authenticated, DAN service_role (pg_default_acl memberi hak otomatis).
--
-- Jalankan SEGERA SESUDAH kode Iterasi (4) terdeploy (pelajaran insiden sql/48:
-- tick baru yang memanggil Function lama mengisi penanda tanpa email terkirim).
-- Antara deploy dan berkas ini, email webinar hanya TERTUNDA, tidak hilang:
-- penanda baru belum diisi siapa pun.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- 1a. Kode baru sudah hidup. Dari terminal (harapan HTTP 401 berisi JSON
--     {"error":"Unauthorized"}, BUKAN 405 / halaman HTML):
--   curl -i -X POST https://submit.jakpatforuniv.com/api/webinar/watch
--
-- 1b. sql/136 (Bagian A) sudah diterapkan. Harapan: 6.
--
-- SELECT count(*) FROM information_schema.columns
--  WHERE (table_name = 'webinar_events' AND column_name IN ('recording_object_key', 'schedule_changed_at'))
--     OR (table_name = 'webinar_orders' AND column_name IN
--          ('reminder_sent_for', 'schedule_email_sent_at', 'cancel_email_sent_at', 'email_error'));
--
-- 1c. Jejak lama yang akan disalin (catat angkanya untuk langkah 3c).
--
-- SELECT b.kind, count(*) AS terkirim
--   FROM public.webinar_broadcast_deliveries d
--   JOIN public.webinar_broadcasts b ON b.id = d.broadcast_id
--  WHERE d.status = 'sent' GROUP BY 1;
--
-- 1d. Cron masih terdaftar. Harapan: 1 baris, active = true.
--
-- SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = 'webinar-notify';


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

-- ── 1. Salin jejak lama ─────────────────────────────────────────────────────

-- Pengingat terakhir yang terkirim per order: untuk jadwal apa.
UPDATE public.webinar_orders o
   SET reminder_sent_for = x.event_starts_at
  FROM (
    SELECT DISTINCT ON (d.order_id) d.order_id, b.event_starts_at
      FROM public.webinar_broadcast_deliveries d
      JOIN public.webinar_broadcasts b ON b.id = d.broadcast_id
     WHERE b.kind = 'reminder_day' AND d.status = 'sent'
     ORDER BY d.order_id, b.created_at DESC
  ) x
 WHERE o.id = x.order_id AND o.reminder_sent_for IS NULL;

UPDATE public.webinar_orders o
   SET schedule_email_sent_at = x.sent_at
  FROM (
    SELECT d.order_id, max(d.sent_at) AS sent_at
      FROM public.webinar_broadcast_deliveries d
      JOIN public.webinar_broadcasts b ON b.id = d.broadcast_id
     WHERE b.kind = 'schedule_change' AND d.status = 'sent'
     GROUP BY 1
  ) x
 WHERE o.id = x.order_id
   AND (o.schedule_email_sent_at IS NULL OR o.schedule_email_sent_at < x.sent_at);

UPDATE public.webinar_orders o
   SET cancel_email_sent_at = x.sent_at
  FROM (
    SELECT d.order_id, max(d.sent_at) AS sent_at
      FROM public.webinar_broadcast_deliveries d
      JOIN public.webinar_broadcasts b ON b.id = d.broadcast_id
     WHERE b.kind = 'cancellation' AND d.status = 'sent'
     GROUP BY 1
  ) x
 WHERE o.id = x.order_id AND o.cancel_email_sent_at IS NULL;

-- Jadwal yang berubah lewat sistem lama. Nilai yang ditulis kode baru (sesudah
-- deploy) lebih baru dan tidak ditimpa.
UPDATE public.webinar_events e
   SET schedule_changed_at = x.changed_at
  FROM (
    SELECT event_id, max(created_at) AS changed_at
      FROM public.webinar_broadcasts
     WHERE kind = 'schedule_change'
     GROUP BY 1
  ) x
 WHERE e.id = x.event_id
   AND (e.schedule_changed_at IS NULL OR e.schedule_changed_at < x.changed_at);

-- ── 2. Tick baru ────────────────────────────────────────────────────────────

DROP FUNCTION public.webinar_notify_tick();

CREATE FUNCTION public.webinar_notify_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
  r        record;
  n        integer := 0;
BEGIN
  -- Tick yang tumpang tindih (cron lambat) tidak mengirim dobel.
  IF NOT pg_try_advisory_xact_lock(hashtext('public.webinar_notify_tick')) THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'webinar_notify_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;
  IF v_url IS NULL OR v_secret IS NULL THEN
    -- Penanda TIDAK diisi: email menunggu sampai vault benar.
    RAISE WARNING 'webinar_notify_tick: vault webinar_notify_url/cron_notify_secret belum diset, dilewati';
    RETURN 0;
  END IF;

  -- Pengingat H-1 dilewati bila email "Jadwal baru" diserahkan < 12 jam lalu.
  UPDATE webinar_orders o
     SET reminder_sent_for = e.starts_at
    FROM webinar_events e
   WHERE e.id = o.event_id
     AND o.status = 'paid' AND o.kind = 'live'
     AND e.status = 'published' AND e.offer_kind = 'live'
     AND e.starts_at - interval '24 hours' <= now() AND e.starts_at - interval '3 hours' > now()
     AND o.reminder_sent_for IS DISTINCT FROM e.starts_at
     AND o.paid_at < now() - interval '6 hours'
     AND o.schedule_email_sent_at > now() - interval '12 hours';

  FOR r IN
    SELECT o.id, d.kind, e.starts_at, e.schedule_changed_at
      FROM webinar_orders o
      JOIN webinar_events e ON e.id = o.event_id
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN e.status = 'cancelled' AND e.starts_at > now() - interval '7 days'
               AND o.cancel_email_sent_at IS NULL
            THEN 'cancellation'
          WHEN e.status = 'published' AND e.offer_kind = 'live' AND e.starts_at > now()
               AND e.schedule_changed_at > now() - interval '7 days'
               AND o.paid_at < e.schedule_changed_at
               AND (o.schedule_email_sent_at IS NULL OR o.schedule_email_sent_at < e.schedule_changed_at)
            THEN 'schedule_change'
          WHEN e.status = 'published' AND e.offer_kind = 'live'
               AND e.starts_at - interval '24 hours' <= now() AND e.starts_at - interval '3 hours' > now()
               AND o.reminder_sent_for IS DISTINCT FROM e.starts_at
               AND o.paid_at < now() - interval '6 hours'
            THEN 'reminder_day'
          WHEN e.status = 'published' AND e.recording_published_at > now() - interval '7 days'
               AND o.recording_email_sent_at IS NULL
            THEN 'recording_ready'
        END AS kind
      ) d
     WHERE o.status = 'paid' AND o.kind = 'live' AND d.kind IS NOT NULL
     ORDER BY CASE d.kind WHEN 'cancellation' THEN 1 WHEN 'schedule_change' THEN 2
                          WHEN 'reminder_day' THEN 3 ELSE 4 END,
              o.paid_at, o.id
     LIMIT 25
  LOOP
    PERFORM net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('order_id', r.id, 'kind', r.kind),
      timeout_milliseconds := 10000
    );

    UPDATE webinar_orders
       SET cancel_email_sent_at = CASE WHEN r.kind = 'cancellation' THEN now() ELSE cancel_email_sent_at END,
           schedule_email_sent_at = CASE WHEN r.kind = 'schedule_change'
                                         THEN greatest(now(), r.schedule_changed_at) ELSE schedule_email_sent_at END,
           reminder_sent_for = CASE WHEN r.kind = 'reminder_day' THEN r.starts_at ELSE reminder_sent_for END,
           recording_email_sent_at = CASE WHEN r.kind = 'recording_ready' THEN now() ELSE recording_email_sent_at END
     WHERE id = r.id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.webinar_notify_tick() FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. Objek antrean lama ───────────────────────────────────────────────────

DROP FUNCTION public.webinar_retry_broadcast(uuid);
DROP FUNCTION public.webinar_record_deliveries(uuid, jsonb);
DROP FUNCTION public.webinar_claim_deliveries(integer);
DROP FUNCTION public.webinar_enqueue_due_reminders();
DROP FUNCTION public.webinar_enqueue_broadcast(uuid, text, text);
DROP TABLE public.webinar_broadcast_deliveries;
DROP TABLE public.webinar_broadcasts;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Objek lama hilang. Harapan: 0, 0.
--
-- SELECT (SELECT count(*) FROM pg_class WHERE relname IN ('webinar_broadcasts','webinar_broadcast_deliveries')) AS tabel,
--        (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN
--          ('webinar_enqueue_broadcast','webinar_enqueue_due_reminders','webinar_claim_deliveries',
--           'webinar_record_deliveries','webinar_retry_broadcast')) AS fungsi;
--
-- 3b. Hak tick. Harapan: hanya {postgres=X/postgres} (tanpa anon, authenticated,
--     service_role, dan tanpa "=X" milik PUBLIC); prorettype = integer.
--
-- SELECT proacl, prorettype::regtype FROM pg_proc WHERE proname = 'webinar_notify_tick';
--
-- 3c. Jejak tersalin. Harapan: angka sama dengan langkah 1c per jenis
--     (reminder_day / schedule_change / cancellation).
--
-- SELECT count(reminder_sent_for) AS pengingat, count(schedule_email_sent_at) AS jadwal,
--        count(cancel_email_sent_at) AS batal
--   FROM public.webinar_orders;
--
-- 3d. Cron tetap jalan tanpa galat (tunggu 2 menit). Harapan: succeeded.
--
-- SELECT status, return_message, start_time FROM cron.job_run_details
--  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'webinar-notify')
--  ORDER BY start_time DESC LIMIT 5;
--
-- 3e. Sesudah ada email yang jatuh tempo: Function menjawab 200. Yang dibaca
--     net._http_response, BUKAN cron.job (pelajaran sql/48).
--
-- SELECT id, status_code, left(content, 200) AS isi, created FROM net._http_response
--  ORDER BY created DESC LIMIT 5;
--
-- 3f. Bukti anon tertolak. Harapan: ERROR permission denied.
--
-- BEGIN; SET LOCAL ROLE anon; SELECT public.webinar_notify_tick(); ROLLBACK;


-- ============================================================================
-- ROLLBACK (hanya bersama kode lama: kembalikan deploy ke commit sebelum
-- Iterasi (4) DULU, baru jalankan ini. Kolom penanda sql/136 dibiarkan.)
-- ============================================================================
--
-- Riwayat antrean lama TIDAK kembali (tabelnya dibuat ulang kosong). Badan di
-- bawah disalin apa adanya dari sql/135.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.webinar_notify_tick();
--
-- -- ── Antrean email otomatis ──────────────────────────────────────────────────
--
-- CREATE TABLE public.webinar_broadcasts (
--   id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   event_id         uuid NOT NULL REFERENCES public.webinar_events(id) ON DELETE CASCADE,
--   kind             text NOT NULL,
--   event_starts_at  timestamptz,
--   recipient_total  integer NOT NULL DEFAULT 0,
--   skipped_reason   text,
--   created_by       text,               -- email admin; NULL = cron
--   created_at       timestamptz NOT NULL DEFAULT now(),
--
--   CONSTRAINT webinar_broadcasts_kind_check CHECK (kind IN ('reminder_day', 'schedule_change', 'cancellation'))
-- );
--
-- CREATE UNIQUE INDEX webinar_broadcasts_one_reminder
--   ON public.webinar_broadcasts (event_id, event_starts_at) WHERE kind = 'reminder_day';
-- CREATE UNIQUE INDEX webinar_broadcasts_one_cancellation
--   ON public.webinar_broadcasts (event_id) WHERE kind = 'cancellation';
-- CREATE INDEX webinar_broadcasts_event ON public.webinar_broadcasts (event_id, created_at DESC);
--
-- CREATE TABLE public.webinar_broadcast_deliveries (
--   broadcast_id  uuid NOT NULL REFERENCES public.webinar_broadcasts(id) ON DELETE CASCADE,
--   -- CASCADE: skrip ops yang menghapus order uji tidak terblokir riwayat email.
--   order_id      uuid NOT NULL REFERENCES public.webinar_orders(id) ON DELETE CASCADE,
--   email         text NOT NULL,
--   status        text NOT NULL DEFAULT 'queued',
--   attempts      integer NOT NULL DEFAULT 0,
--   claimed_at    timestamptz,
--   claim_token   uuid,               -- milik satu panggilan claim
--   retry_after   timestamptz,
--   sent_at       timestamptz,
--   error         text,
--   created_at    timestamptz NOT NULL DEFAULT now(),
--
--   PRIMARY KEY (broadcast_id, order_id),
--   CONSTRAINT webinar_broadcast_deliveries_status_check
--     CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped'))
-- );
--
-- CREATE INDEX webinar_broadcast_deliveries_open
--   ON public.webinar_broadcast_deliveries (created_at) WHERE status IN ('queued', 'sending', 'failed');
-- CREATE INDEX webinar_broadcast_deliveries_order ON public.webinar_broadcast_deliveries (order_id);
--
-- ALTER TABLE public.webinar_broadcasts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.webinar_broadcast_deliveries ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON TABLE public.webinar_broadcasts FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON TABLE public.webinar_broadcast_deliveries FROM PUBLIC, anon, authenticated;
-- GRANT ALL ON TABLE public.webinar_broadcasts TO service_role;
-- GRANT ALL ON TABLE public.webinar_broadcast_deliveries TO service_role;
--
-- -- Mengantrekan satu email untuk satu acara. Tidak pernah mengirim sendiri.
-- CREATE FUNCTION public.webinar_enqueue_broadcast(p_event_id uuid, p_kind text, p_created_by text DEFAULT NULL)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_event webinar_events%ROWTYPE;
--   v_id    uuid;
--   v_total integer := 0;
--   v_skip  text;
-- BEGIN
--   IF p_kind NOT IN ('reminder_day', 'schedule_change', 'cancellation') THEN
--     RAISE EXCEPTION 'Jenis email tidak dikenal: %', p_kind USING ERRCODE = '22023';
--   END IF;
--
--   SELECT * INTO v_event FROM webinar_events WHERE id = p_event_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object('outcome', 'not_found');
--   END IF;
--
--   IF p_kind = 'cancellation' THEN
--     IF v_event.status <> 'cancelled' THEN
--       RETURN jsonb_build_object('outcome', 'wrong_state');
--     END IF;
--   ELSIF v_event.status <> 'published' OR v_event.offer_kind <> 'live' OR v_event.starts_at IS NULL
--      OR v_event.starts_at + make_interval(mins => coalesce(v_event.duration_minutes, 0)) <= now() THEN
--     RETURN jsonb_build_object('outcome', 'wrong_state');
--   END IF;
--
--   IF p_kind = 'reminder_day' THEN
--     IF NOT (v_event.starts_at - interval '24 hours' <= now() AND v_event.starts_at - interval '3 hours' > now()) THEN
--       RETURN jsonb_build_object('outcome', 'not_due');
--     END IF;
--     IF EXISTS (SELECT 1 FROM webinar_broadcasts b
--                 WHERE b.event_id = p_event_id AND b.kind IN ('schedule_change', 'reminder_day')
--                   AND b.skipped_reason IS NULL AND b.created_at > now() - interval '12 hours') THEN
--       v_skip := 'Email jadwal/pengingat sudah terkirim kurang dari 12 jam sebelumnya';
--     END IF;
--   END IF;
--
--   -- Antrean basi: isinya sudah tidak benar lagi.
--   IF p_kind = 'schedule_change' THEN
--     UPDATE webinar_broadcast_deliveries d
--        SET status = 'skipped', error = 'Jadwal berubah lagi sebelum terkirim'
--       FROM webinar_broadcasts b
--      WHERE d.broadcast_id = b.id AND b.event_id = p_event_id
--        AND b.kind IN ('schedule_change', 'reminder_day') AND d.status IN ('queued', 'failed');
--   ELSIF p_kind = 'cancellation' THEN
--     UPDATE webinar_broadcast_deliveries d
--        SET status = 'skipped', error = 'Acara dibatalkan sebelum terkirim'
--       FROM webinar_broadcasts b
--      WHERE d.broadcast_id = b.id AND b.event_id = p_event_id
--        AND b.kind IN ('schedule_change', 'reminder_day') AND d.status IN ('queued', 'failed');
--   END IF;
--
--   INSERT INTO webinar_broadcasts (event_id, kind, event_starts_at, skipped_reason, created_by)
--   VALUES (p_event_id, p_kind, v_event.starts_at, v_skip, nullif(btrim(coalesce(p_created_by, '')), ''))
--   ON CONFLICT DO NOTHING
--   RETURNING id INTO v_id;
--   IF v_id IS NULL THEN
--     RETURN jsonb_build_object('outcome', 'already');
--   END IF;
--
--   IF v_skip IS NULL THEN
--     INSERT INTO webinar_broadcast_deliveries (broadcast_id, order_id, email)
--     SELECT v_id, o.id, o.buyer_email
--       FROM webinar_orders o
--      WHERE o.event_id = p_event_id AND o.kind = 'live' AND o.status = 'paid'
--        AND (p_kind <> 'reminder_day' OR o.paid_at < now() - interval '6 hours');
--     GET DIAGNOSTICS v_total = ROW_COUNT;
--     UPDATE webinar_broadcasts SET recipient_total = v_total WHERE id = v_id;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'outcome', CASE WHEN v_skip IS NULL THEN 'queued' ELSE 'skipped' END,
--     'broadcast_id', v_id,
--     'total', v_total,
--     'skipped_reason', v_skip
--   );
-- END;
-- $$;
--
-- -- Pengingat H-1 yang jatuh tempo; dipanggil webinar_notify_tick tiap menit.
-- CREATE FUNCTION public.webinar_enqueue_due_reminders()
-- RETURNS integer
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--   r   record;
--   n   integer := 0;
--   res jsonb;
-- BEGIN
--   FOR r IN
--     SELECT e.id FROM webinar_events e
--      WHERE e.status = 'published' AND e.offer_kind = 'live' AND e.starts_at IS NOT NULL
--        AND e.starts_at - interval '24 hours' <= now()
--        AND e.starts_at - interval '3 hours' > now()
--        AND NOT EXISTS (SELECT 1 FROM webinar_broadcasts b
--                         WHERE b.event_id = e.id AND b.kind = 'reminder_day' AND b.event_starts_at = e.starts_at)
--   LOOP
--     res := webinar_enqueue_broadcast(r.id, 'reminder_day', NULL);
--     IF res ->> 'outcome' IN ('queued', 'skipped') THEN
--       n := n + 1;
--     END IF;
--   END LOOP;
--   RETURN n;
-- END;
-- $$;
--
-- -- Ambil antrean untuk dikirim. Hasil: { token, rows: [...] }.
-- CREATE FUNCTION public.webinar_claim_deliveries(p_limit integer)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_token uuid := gen_random_uuid();
--   v_rows  jsonb;
-- BEGIN
--   -- 1. Yang tidak relevan lagi.
--   UPDATE webinar_broadcast_deliveries d
--      SET status = 'skipped', error = 'Tiket tidak lagi lunas'
--     FROM webinar_orders o
--    WHERE o.id = d.order_id AND d.status IN ('queued', 'failed') AND o.status <> 'paid';
--
--   UPDATE webinar_broadcast_deliveries d
--      SET status = 'skipped', error = 'Acara dibatalkan sebelum terkirim'
--     FROM webinar_broadcasts b
--     JOIN webinar_events e ON e.id = b.event_id
--    WHERE d.broadcast_id = b.id AND d.status IN ('queued', 'failed')
--      AND b.kind <> 'cancellation' AND e.status = 'cancelled';
--
--   -- 2. Pengirim yang berhenti tanpa mencatat hasil.
--   UPDATE webinar_broadcast_deliveries
--      SET status = 'failed', error = 'Terputus sebelum hasil tercatat', retry_after = now()
--    WHERE status = 'sending' AND claimed_at < now() - interval '10 minutes';
--
--   -- 3. Ambil.
--   WITH picked AS (
--     SELECT d.broadcast_id, d.order_id
--       FROM webinar_broadcast_deliveries d
--      WHERE d.status = 'queued'
--         OR (d.status = 'failed' AND d.retry_after IS NOT NULL AND d.retry_after <= now() AND d.attempts < 3)
--      ORDER BY d.created_at, d.order_id
--      LIMIT greatest(least(coalesce(p_limit, 20), 50), 1)
--      FOR UPDATE SKIP LOCKED
--   ), upd AS (
--     UPDATE webinar_broadcast_deliveries d
--        SET status = 'sending', claimed_at = now(), claim_token = v_token, attempts = d.attempts + 1,
--            error = NULL, retry_after = NULL,
--            email = o.buyer_email   -- alamat terbaru, mis. sesudah dikoreksi admin
--       FROM picked p, webinar_orders o
--      WHERE d.broadcast_id = p.broadcast_id AND d.order_id = p.order_id AND o.id = d.order_id
--     RETURNING d.broadcast_id, d.order_id, d.email
--   )
--   SELECT coalesce(jsonb_agg(jsonb_build_object(
--            'broadcast_id', u.broadcast_id,
--            'order_id', u.order_id,
--            'kind', b.kind,
--            'email', u.email,
--            'buyer_name', o.buyer_name,
--            'ticket_code', o.ticket_code,
--            'join_token', o.join_token,
--            'event', jsonb_build_object(
--              'id', e.id, 'title', e.title, 'starts_at', e.starts_at,
--              'duration_minutes', e.duration_minutes, 'speakers', e.speakers, 'status', e.status)
--          )), '[]'::jsonb)
--     INTO v_rows
--     FROM upd u
--     JOIN webinar_broadcasts b ON b.id = u.broadcast_id
--     JOIN webinar_orders o ON o.id = u.order_id
--     JOIN webinar_events e ON e.id = b.event_id;
--
--   RETURN jsonb_build_object('token', v_token, 'rows', v_rows);
-- END;
-- $$;
--
-- -- p_results: [{ broadcast_id, order_id, ok, error?, permanent? }]
-- CREATE FUNCTION public.webinar_record_deliveries(p_token uuid, p_results jsonb)
-- RETURNS integer
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--   n integer;
-- BEGIN
--   UPDATE webinar_broadcast_deliveries d
--      SET status = CASE WHEN (r ->> 'ok')::boolean THEN 'sent' ELSE 'failed' END,
--          sent_at = CASE WHEN (r ->> 'ok')::boolean THEN now() END,
--          error = CASE WHEN (r ->> 'ok')::boolean THEN NULL
--                       ELSE left(coalesce(r ->> 'error', 'tanpa keterangan'), 500) END,
--          retry_after = CASE WHEN NOT (r ->> 'ok')::boolean AND NOT coalesce((r ->> 'permanent')::boolean, false)
--                             THEN now() + interval '5 minutes' END
--     FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) r
--    WHERE d.broadcast_id = (r ->> 'broadcast_id')::uuid
--      AND d.order_id = (r ->> 'order_id')::uuid
--      AND d.status = 'sending'
--      AND d.claim_token = p_token;
--   GET DIAGNOSTICS n = ROW_COUNT;
--   RETURN n;
-- END;
-- $$;
--
-- -- Tombol "Kirim ulang yang gagal".
-- CREATE FUNCTION public.webinar_retry_broadcast(p_broadcast_id uuid)
-- RETURNS integer
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- SET search_path = public
-- AS $$
-- DECLARE
--   n integer;
-- BEGIN
--   UPDATE webinar_broadcast_deliveries d
--      SET status = 'queued', attempts = 0, retry_after = NULL, error = NULL
--     FROM webinar_orders o
--    WHERE d.broadcast_id = p_broadcast_id AND d.status = 'failed'
--      AND o.id = d.order_id AND o.status = 'paid';
--   GET DIAGNOSTICS n = ROW_COUNT;
--   RETURN n;
-- END;
-- $$;
--
-- -- Dipanggil pg_cron (sql/135b). SECURITY DEFINER hanya untuk membaca vault.
-- CREATE FUNCTION public.webinar_notify_tick()
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, extensions, vault
-- AS $$
-- DECLARE
--   v_url    text;
--   v_secret text;
-- BEGIN
--   PERFORM public.webinar_enqueue_due_reminders();
--
--   IF NOT EXISTS (
--     SELECT 1 FROM public.webinar_broadcast_deliveries
--      WHERE status = 'queued'
--         OR (status = 'failed' AND retry_after <= now() AND attempts < 3)
--         OR (status = 'sending' AND claimed_at < now() - interval '10 minutes')
--   ) THEN
--     RETURN;
--   END IF;
--
--   SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'webinar_notify_url' LIMIT 1;
--   SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;
--   IF v_url IS NULL OR v_secret IS NULL THEN
--     RAISE WARNING 'webinar_notify_tick: vault webinar_notify_url/cron_notify_secret belum diset, dilewati';
--     RETURN;
--   END IF;
--
--   PERFORM net.http_post(
--     url := v_url || '?k=' || v_secret,
--     headers := jsonb_build_object('Content-Type', 'application/json'),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 30000
--   );
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.webinar_enqueue_broadcast(uuid, text, text) FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION public.webinar_enqueue_due_reminders() FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION public.webinar_claim_deliveries(integer) FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION public.webinar_record_deliveries(uuid, jsonb) FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION public.webinar_retry_broadcast(uuid) FROM PUBLIC, anon, authenticated;
-- REVOKE ALL ON FUNCTION public.webinar_notify_tick() FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.webinar_enqueue_broadcast(uuid, text, text) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.webinar_enqueue_due_reminders() TO service_role;
-- GRANT EXECUTE ON FUNCTION public.webinar_claim_deliveries(integer) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.webinar_record_deliveries(uuid, jsonb) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.webinar_retry_broadcast(uuid) TO service_role;
-- COMMIT;
