-- ============================================================================
-- sql/135 — WEBINAR: OPERASIONAL ACARA (Fase 3) — BAGIAN A
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-11-02-webinar-jfu.md, "Iterasi 6 Nov".
--
-- ── YANG DIBUAT ─────────────────────────────────────────────────────────────
--
--   webinar_orders.refunded_at/by, refund_note   jejak refund (hanya admin).
--   webinar_mark_refunded         order + baris transactions → refunded, satu
--                                 transaksi. Kursi kembali dengan sendirinya
--                                 karena webinar_offer_state hanya menghitung paid.
--   webinar_broadcasts            satu email otomatis untuk satu acara:
--                                 reminder_day | schedule_change | cancellation.
--   webinar_broadcast_deliveries  satu baris per peserta; status queued →
--                                 sending → sent/failed/skipped.
--   webinar_enqueue_broadcast     mengantrekan email (dipanggil admin & cron).
--   webinar_enqueue_due_reminders pengingat H-1 yang jatuh tempo.
--   webinar_claim_deliveries      ambil antrean untuk dikirim (SKIP LOCKED).
--   webinar_record_deliveries     catat hasil kirim, hanya untuk token sendiri.
--   webinar_retry_broadcast       tombol "Kirim ulang yang gagal".
--   webinar_notify_tick           dipanggil cron tiap menit (BAGIAN B, berkas
--                                 sql/135b): antrekan H-1, lalu panggil Function
--                                 /api/notify-webinar bila ada pekerjaan.
--
-- ── KEPUTUSAN YANG MUDAH SALAH DIBACA ───────────────────────────────────────
--
--   * Email dikirim Cloudflare Function, bukan Postgres. Postgres hanya
--     menyimpan antrean dan memanggil Function lewat pg_net (pola sql/48).
--   * Penerima = tiket live LUNAS saat email diantrekan. Izin kontak tidak
--     dilihat: ini email layanan atas tiket yang dibeli, bukan promosi.
--   * Pengingat H-1 sekali per (acara, jadwal), 24 jam s/d 3 jam sebelum mulai.
--     Pembeli yang lunas < 6 jam sebelumnya dilewati (e-tiketnya baru masuk).
--     Dilewati bila email jadwal/pengingat terkirim < 12 jam sebelumnya.
--   * Antrean basi ditandai skipped: jadwal berubah lagi, acara batal, atau
--     tiket tidak lagi lunas. Email pembatalan sekali per acara.
--   * Galat sementara diulang otomatis maks. 3 kali (retry_after); galat
--     permanen (bounce) tidak. Baris `sending` > 10 menit dianggap terputus.
--   * Klaim memakai claim_token (uuid acak per panggilan), jadi pengirim lama
--     yang terlambat tidak bisa menimpa hasil pengirim baru.
--   * pg_default_acl memberi anon DAN authenticated hak pada SETIAP tabel dan
--     fungsi baru di `public`. Pencabutan di bawah eksplisit per peran.
--   * Lock acara → order, sama dengan webinar_mark_paid, supaya tidak deadlock.
--
-- Terapkan SEBELUM kode Fase 3 di-push: push ke main = deploy otomatis.
-- Cron dinyalakan lewat sql/135b SESUDAH deploy (pelajaran insiden sql/48).


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- 1a. Belum ada objek Fase 3. Harapan: 0, 0, 0.
--
-- SELECT (SELECT count(*) FROM pg_class WHERE relname IN ('webinar_broadcasts','webinar_broadcast_deliveries')) AS tabel,
--        (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN
--          ('webinar_mark_refunded','webinar_enqueue_broadcast','webinar_enqueue_due_reminders',
--           'webinar_claim_deliveries','webinar_record_deliveries','webinar_retry_broadcast','webinar_notify_tick')) AS fungsi,
--        (SELECT count(*) FROM information_schema.columns WHERE table_name = 'webinar_orders'
--          AND column_name IN ('refunded_at','refunded_by','refund_note')) AS kolom;
--
-- 1b. Belum ada order refunded (CHECK baru mensyaratkan catatan). Harapan: 0.
--
-- SELECT count(*) FROM public.webinar_orders WHERE status = 'refunded';
--
-- 1c. Baris transactions webinar berstatus 'completed' (dipakai refund). Harapan: ada.
--
-- SELECT status, count(*) FROM public.transactions WHERE entity_type = 'webinar' GROUP BY 1;


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

-- ── Refund ──────────────────────────────────────────────────────────────────

ALTER TABLE public.webinar_orders
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refunded_by text,
  ADD COLUMN refund_note text,
  ADD CONSTRAINT webinar_orders_refund_complete CHECK (
    status <> 'refunded' OR (refunded_at IS NOT NULL AND refund_note IS NOT NULL)
  );

CREATE FUNCTION public.webinar_mark_refunded(p_order_id uuid, p_note text, p_admin_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_note     text := btrim(coalesce(p_note, ''));
  v_event_id uuid;
  v_order    webinar_orders%ROWTYPE;
  v_tx       integer;
BEGIN
  IF char_length(v_note) < 3 THEN
    RAISE EXCEPTION 'Catatan refund wajib diisi (minimal 3 karakter)' USING ERRCODE = '22023';
  END IF;

  SELECT event_id INTO v_event_id FROM webinar_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  -- Urutan lock acara → order, sama dengan webinar_mark_paid.
  PERFORM 1 FROM webinar_events WHERE id = v_event_id FOR UPDATE;
  SELECT * INTO v_order FROM webinar_orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.status = 'refunded' THEN
    RETURN jsonb_build_object('outcome', 'already_refunded', 'refunded_at', v_order.refunded_at);
  END IF;
  IF v_order.status <> 'paid' THEN
    RETURN jsonb_build_object('outcome', 'not_paid', 'status', v_order.status);
  END IF;

  UPDATE webinar_orders
     SET status = 'refunded',
         refunded_at = now(),
         refunded_by = nullif(btrim(coalesce(p_admin_email, '')), ''),
         refund_note = left(v_note, 500)
   WHERE id = p_order_id;

  UPDATE transactions
     SET status = 'refunded'
   WHERE payment_id = v_order.invoice_number
     AND entity_type = 'webinar'
     AND status = 'completed';
  GET DIAGNOSTICS v_tx = ROW_COUNT;
  IF v_tx <> 1 THEN
    -- Buku tidak cocok dengan order: batalkan semuanya, jangan setengah refund.
    RAISE EXCEPTION 'Baris transactions untuk % bukan tepat satu (%)', v_order.invoice_number, v_tx;
  END IF;

  RETURN jsonb_build_object('outcome', 'ok', 'refunded_at', now());
END;
$$;

-- ── Antrean email otomatis ──────────────────────────────────────────────────

CREATE TABLE public.webinar_broadcasts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES public.webinar_events(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  event_starts_at  timestamptz,
  recipient_total  integer NOT NULL DEFAULT 0,
  skipped_reason   text,
  created_by       text,               -- email admin; NULL = cron
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webinar_broadcasts_kind_check CHECK (kind IN ('reminder_day', 'schedule_change', 'cancellation'))
);

CREATE UNIQUE INDEX webinar_broadcasts_one_reminder
  ON public.webinar_broadcasts (event_id, event_starts_at) WHERE kind = 'reminder_day';
CREATE UNIQUE INDEX webinar_broadcasts_one_cancellation
  ON public.webinar_broadcasts (event_id) WHERE kind = 'cancellation';
CREATE INDEX webinar_broadcasts_event ON public.webinar_broadcasts (event_id, created_at DESC);

CREATE TABLE public.webinar_broadcast_deliveries (
  broadcast_id  uuid NOT NULL REFERENCES public.webinar_broadcasts(id) ON DELETE CASCADE,
  -- CASCADE: skrip ops yang menghapus order uji tidak terblokir riwayat email.
  order_id      uuid NOT NULL REFERENCES public.webinar_orders(id) ON DELETE CASCADE,
  email         text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  attempts      integer NOT NULL DEFAULT 0,
  claimed_at    timestamptz,
  claim_token   uuid,               -- milik satu panggilan claim
  retry_after   timestamptz,
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (broadcast_id, order_id),
  CONSTRAINT webinar_broadcast_deliveries_status_check
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX webinar_broadcast_deliveries_open
  ON public.webinar_broadcast_deliveries (created_at) WHERE status IN ('queued', 'sending', 'failed');
CREATE INDEX webinar_broadcast_deliveries_order ON public.webinar_broadcast_deliveries (order_id);

ALTER TABLE public.webinar_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_broadcast_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webinar_broadcasts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webinar_broadcast_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webinar_broadcasts TO service_role;
GRANT ALL ON TABLE public.webinar_broadcast_deliveries TO service_role;

-- Mengantrekan satu email untuk satu acara. Tidak pernah mengirim sendiri.
CREATE FUNCTION public.webinar_enqueue_broadcast(p_event_id uuid, p_kind text, p_created_by text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event webinar_events%ROWTYPE;
  v_id    uuid;
  v_total integer := 0;
  v_skip  text;
BEGIN
  IF p_kind NOT IN ('reminder_day', 'schedule_change', 'cancellation') THEN
    RAISE EXCEPTION 'Jenis email tidak dikenal: %', p_kind USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event FROM webinar_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF p_kind = 'cancellation' THEN
    IF v_event.status <> 'cancelled' THEN
      RETURN jsonb_build_object('outcome', 'wrong_state');
    END IF;
  ELSIF v_event.status <> 'published' OR v_event.offer_kind <> 'live' OR v_event.starts_at IS NULL
     OR v_event.starts_at + make_interval(mins => coalesce(v_event.duration_minutes, 0)) <= now() THEN
    RETURN jsonb_build_object('outcome', 'wrong_state');
  END IF;

  IF p_kind = 'reminder_day' THEN
    IF NOT (v_event.starts_at - interval '24 hours' <= now() AND v_event.starts_at - interval '3 hours' > now()) THEN
      RETURN jsonb_build_object('outcome', 'not_due');
    END IF;
    IF EXISTS (SELECT 1 FROM webinar_broadcasts b
                WHERE b.event_id = p_event_id AND b.kind IN ('schedule_change', 'reminder_day')
                  AND b.skipped_reason IS NULL AND b.created_at > now() - interval '12 hours') THEN
      v_skip := 'Email jadwal/pengingat sudah terkirim kurang dari 12 jam sebelumnya';
    END IF;
  END IF;

  -- Antrean basi: isinya sudah tidak benar lagi.
  IF p_kind = 'schedule_change' THEN
    UPDATE webinar_broadcast_deliveries d
       SET status = 'skipped', error = 'Jadwal berubah lagi sebelum terkirim'
      FROM webinar_broadcasts b
     WHERE d.broadcast_id = b.id AND b.event_id = p_event_id
       AND b.kind IN ('schedule_change', 'reminder_day') AND d.status IN ('queued', 'failed');
  ELSIF p_kind = 'cancellation' THEN
    UPDATE webinar_broadcast_deliveries d
       SET status = 'skipped', error = 'Acara dibatalkan sebelum terkirim'
      FROM webinar_broadcasts b
     WHERE d.broadcast_id = b.id AND b.event_id = p_event_id
       AND b.kind IN ('schedule_change', 'reminder_day') AND d.status IN ('queued', 'failed');
  END IF;

  INSERT INTO webinar_broadcasts (event_id, kind, event_starts_at, skipped_reason, created_by)
  VALUES (p_event_id, p_kind, v_event.starts_at, v_skip, nullif(btrim(coalesce(p_created_by, '')), ''))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'already');
  END IF;

  IF v_skip IS NULL THEN
    INSERT INTO webinar_broadcast_deliveries (broadcast_id, order_id, email)
    SELECT v_id, o.id, o.buyer_email
      FROM webinar_orders o
     WHERE o.event_id = p_event_id AND o.kind = 'live' AND o.status = 'paid'
       AND (p_kind <> 'reminder_day' OR o.paid_at < now() - interval '6 hours');
    GET DIAGNOSTICS v_total = ROW_COUNT;
    UPDATE webinar_broadcasts SET recipient_total = v_total WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_skip IS NULL THEN 'queued' ELSE 'skipped' END,
    'broadcast_id', v_id,
    'total', v_total,
    'skipped_reason', v_skip
  );
END;
$$;

-- Pengingat H-1 yang jatuh tempo; dipanggil webinar_notify_tick tiap menit.
CREATE FUNCTION public.webinar_enqueue_due_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r   record;
  n   integer := 0;
  res jsonb;
BEGIN
  FOR r IN
    SELECT e.id FROM webinar_events e
     WHERE e.status = 'published' AND e.offer_kind = 'live' AND e.starts_at IS NOT NULL
       AND e.starts_at - interval '24 hours' <= now()
       AND e.starts_at - interval '3 hours' > now()
       AND NOT EXISTS (SELECT 1 FROM webinar_broadcasts b
                        WHERE b.event_id = e.id AND b.kind = 'reminder_day' AND b.event_starts_at = e.starts_at)
  LOOP
    res := webinar_enqueue_broadcast(r.id, 'reminder_day', NULL);
    IF res ->> 'outcome' IN ('queued', 'skipped') THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- Ambil antrean untuk dikirim. Hasil: { token, rows: [...] }.
CREATE FUNCTION public.webinar_claim_deliveries(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
  v_rows  jsonb;
BEGIN
  -- 1. Yang tidak relevan lagi.
  UPDATE webinar_broadcast_deliveries d
     SET status = 'skipped', error = 'Tiket tidak lagi lunas'
    FROM webinar_orders o
   WHERE o.id = d.order_id AND d.status IN ('queued', 'failed') AND o.status <> 'paid';

  UPDATE webinar_broadcast_deliveries d
     SET status = 'skipped', error = 'Acara dibatalkan sebelum terkirim'
    FROM webinar_broadcasts b
    JOIN webinar_events e ON e.id = b.event_id
   WHERE d.broadcast_id = b.id AND d.status IN ('queued', 'failed')
     AND b.kind <> 'cancellation' AND e.status = 'cancelled';

  -- 2. Pengirim yang berhenti tanpa mencatat hasil.
  UPDATE webinar_broadcast_deliveries
     SET status = 'failed', error = 'Terputus sebelum hasil tercatat', retry_after = now()
   WHERE status = 'sending' AND claimed_at < now() - interval '10 minutes';

  -- 3. Ambil.
  WITH picked AS (
    SELECT d.broadcast_id, d.order_id
      FROM webinar_broadcast_deliveries d
     WHERE d.status = 'queued'
        OR (d.status = 'failed' AND d.retry_after IS NOT NULL AND d.retry_after <= now() AND d.attempts < 3)
     ORDER BY d.created_at, d.order_id
     LIMIT greatest(least(coalesce(p_limit, 20), 50), 1)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE webinar_broadcast_deliveries d
       SET status = 'sending', claimed_at = now(), claim_token = v_token, attempts = d.attempts + 1,
           error = NULL, retry_after = NULL,
           email = o.buyer_email   -- alamat terbaru, mis. sesudah dikoreksi admin
      FROM picked p, webinar_orders o
     WHERE d.broadcast_id = p.broadcast_id AND d.order_id = p.order_id AND o.id = d.order_id
    RETURNING d.broadcast_id, d.order_id, d.email
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'broadcast_id', u.broadcast_id,
           'order_id', u.order_id,
           'kind', b.kind,
           'email', u.email,
           'buyer_name', o.buyer_name,
           'ticket_code', o.ticket_code,
           'join_token', o.join_token,
           'event', jsonb_build_object(
             'id', e.id, 'title', e.title, 'starts_at', e.starts_at,
             'duration_minutes', e.duration_minutes, 'speakers', e.speakers, 'status', e.status)
         )), '[]'::jsonb)
    INTO v_rows
    FROM upd u
    JOIN webinar_broadcasts b ON b.id = u.broadcast_id
    JOIN webinar_orders o ON o.id = u.order_id
    JOIN webinar_events e ON e.id = b.event_id;

  RETURN jsonb_build_object('token', v_token, 'rows', v_rows);
END;
$$;

-- p_results: [{ broadcast_id, order_id, ok, error?, permanent? }]
CREATE FUNCTION public.webinar_record_deliveries(p_token uuid, p_results jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE webinar_broadcast_deliveries d
     SET status = CASE WHEN (r ->> 'ok')::boolean THEN 'sent' ELSE 'failed' END,
         sent_at = CASE WHEN (r ->> 'ok')::boolean THEN now() END,
         error = CASE WHEN (r ->> 'ok')::boolean THEN NULL
                      ELSE left(coalesce(r ->> 'error', 'tanpa keterangan'), 500) END,
         retry_after = CASE WHEN NOT (r ->> 'ok')::boolean AND NOT coalesce((r ->> 'permanent')::boolean, false)
                            THEN now() + interval '5 minutes' END
    FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) r
   WHERE d.broadcast_id = (r ->> 'broadcast_id')::uuid
     AND d.order_id = (r ->> 'order_id')::uuid
     AND d.status = 'sending'
     AND d.claim_token = p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Tombol "Kirim ulang yang gagal".
CREATE FUNCTION public.webinar_retry_broadcast(p_broadcast_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE webinar_broadcast_deliveries d
     SET status = 'queued', attempts = 0, retry_after = NULL, error = NULL
    FROM webinar_orders o
   WHERE d.broadcast_id = p_broadcast_id AND d.status = 'failed'
     AND o.id = d.order_id AND o.status = 'paid';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Dipanggil pg_cron (sql/135b). SECURITY DEFINER hanya untuk membaca vault.
CREATE FUNCTION public.webinar_notify_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  PERFORM public.webinar_enqueue_due_reminders();

  IF NOT EXISTS (
    SELECT 1 FROM public.webinar_broadcast_deliveries
     WHERE status = 'queued'
        OR (status = 'failed' AND retry_after <= now() AND attempts < 3)
        OR (status = 'sending' AND claimed_at < now() - interval '10 minutes')
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'webinar_notify_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'webinar_notify_tick: vault webinar_notify_url/cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '?k=' || v_secret,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

-- ── Hak fungsi ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.webinar_mark_refunded(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_enqueue_broadcast(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_enqueue_due_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_claim_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_record_deliveries(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_retry_broadcast(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_notify_tick() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.webinar_mark_refunded(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_enqueue_broadcast(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_enqueue_due_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_claim_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_record_deliveries(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_retry_broadcast(uuid) TO service_role;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Tujuh fungsi; proacl TIDAK memuat anon=, authenticated=, atau "=X" (PUBLIC).
--     Enam memuat service_role=X; webinar_notify_tick tanpa service_role.
--
-- SELECT proname, proacl FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace AND proname IN
--   ('webinar_mark_refunded','webinar_enqueue_broadcast','webinar_enqueue_due_reminders',
--    'webinar_claim_deliveries','webinar_record_deliveries','webinar_retry_broadcast','webinar_notify_tick');
--
-- 3b. Dua tabel: RLS ON, relacl tanpa anon/authenticated.
--
-- SELECT relname, relrowsecurity, relacl FROM pg_class
--  WHERE relname IN ('webinar_broadcasts','webinar_broadcast_deliveries');
--
-- 3c. Bukti anon tertolak. Harapan: ERROR permission denied.
--
-- BEGIN; SET LOCAL ROLE anon; SELECT public.webinar_claim_deliveries(1); ROLLBACK;
--
-- 3d. Belum ada antrean (cron belum dinyalakan). Harapan: 0.
--
-- SELECT count(*) FROM public.webinar_broadcasts;


-- ============================================================================
-- ROLLBACK (hanya bila perlu; matikan dulu cron sql/135b bila sudah dijalankan:
-- SELECT cron.unschedule('webinar-notify');)
-- ============================================================================
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.webinar_notify_tick();
-- DROP FUNCTION IF EXISTS public.webinar_retry_broadcast(uuid);
-- DROP FUNCTION IF EXISTS public.webinar_record_deliveries(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.webinar_claim_deliveries(integer);
-- DROP FUNCTION IF EXISTS public.webinar_enqueue_due_reminders();
-- DROP FUNCTION IF EXISTS public.webinar_enqueue_broadcast(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.webinar_mark_refunded(uuid, text, text);
-- DROP TABLE IF EXISTS public.webinar_broadcast_deliveries;
-- DROP TABLE IF EXISTS public.webinar_broadcasts;
-- ALTER TABLE public.webinar_orders DROP CONSTRAINT IF EXISTS webinar_orders_refund_complete;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS refund_note;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS refunded_by;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS refunded_at;
-- COMMIT;
--
-- Catatan: order yang sudah refunded tetap 'refunded' (status lama sql/131
-- mengizinkannya), hanya jejak catatannya yang hilang.
