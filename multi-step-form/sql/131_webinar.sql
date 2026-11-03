-- ============================================================================
-- sql/131 — WEBINAR: DATA & JALUR UANG (Fase 1)
-- ============================================================================
--
-- Rencana lengkap: docs/superpowers/plans/2026-11-02-webinar-jfu.md
--
-- ── YANG DIBUAT ─────────────────────────────────────────────────────────────
--
--   webinar_events        acara / video kelas. RLS tanpa policy.
--   webinar_orders        satu order = satu tiket/rekaman. RLS tanpa policy.
--   webinar_offer_state   SATU-SATUNYA aturan keadaan penjualan; dihitung saat
--                         dibaca, jadi tombol beli terbuka sendiri tanpa cron.
--   webinar_reserve_seat  menahan kursi & menulis order SEBELUM DOKU dipanggil.
--   webinar_mark_paid     order lunas + satu baris transactions, satu transaksi.
--   bucket webinar-public (poster, foto) dan webinar-materials (privat).
--
-- ── YANG DIUBAH ─────────────────────────────────────────────────────────────
--
--   doku_webhook_events_outcome_check  ditambah 4 outcome alarm webinar.
--   transactions                       partial unique index khusus webinar;
--                                      baris iklan tidak tersentuh.
--
-- ── KEPUTUSAN YANG MUDAH SALAH DIBACA ───────────────────────────────────────
--
--   * Semua akses lewat Function ber-service_role, jadi kelas bug "UPDATE RLS
--     nol baris senyap" tidak ada di sini. Fungsi sengaja SECURITY INVOKER:
--     tidak ada alasan memberi hak lebih dari pemanggilnya.
--   * pg_default_acl memberi anon DAN authenticated hak penuh pada SETIAP tabel
--     dan fungsi baru di `public`. Pencabutan di bawah wajib eksplisit per peran.
--   * Lock selalu event → order, di reserve maupun mark_paid. Urutan terbalik di
--     salah satunya bisa deadlock saat pembeli memesan ulang sambil membayar.
--   * webinar_reserve_seat mengecek "sudah punya" dan "pakai ulang pending"
--     SEBELUM kuota. Pemilik tiket di acara yang habis harus dibawa ke tiketnya,
--     bukan ditolak "habis"; pemegang kursi terakhir tidak boleh tertolak oleh
--     tahanannya sendiri.
--
-- Terapkan SEBELUM kode webinar di-push: push ke main = deploy otomatis.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja; jalankan sebagian atau semuanya lebih dulu)
-- ============================================================================
--
-- 1a. Belum ada objek webinar. Harapan: 0, 0, 0.
--
-- SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--          WHERE n.nspname = 'public' AND c.relname LIKE 'webinar%') AS tabel,
--        (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--          AND proname LIKE 'webinar%') AS fungsi,
--        (SELECT count(*) FROM storage.buckets WHERE id LIKE 'webinar%') AS bucket;
--
-- 1b. CHECK outcome masih persis daftar yang disalin ke berkas ini (11 nilai):
--     ok, write_failed, amount_mismatch, no_submission_found, forwarded_jm,
--     payout, rejected_auth, rejected_payload, handler_crashed,
--     paid_on_dead_bill, paid_on_stale_bill.
--     Kalau berbeda, BERHENTI: berkas ini akan menghapus nilai yang baru.
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'doku_webhook_events_outcome_check';
--
-- 1c. Tidak ada transaksi ber-entity_type webinar. Harapan: 0.
--
-- SELECT count(*) FROM public.transactions WHERE entity_type = 'webinar';


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

-- ── Tabel acara ─────────────────────────────────────────────────────────────

CREATE TABLE public.webinar_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text NOT NULL UNIQUE,
  title                  text NOT NULL,
  summary                text,
  description_blocks     jsonb,
  speakers               jsonb NOT NULL DEFAULT '[]'::jsonb,
  poster_url             text,

  starts_at              timestamptz,
  duration_minutes       integer,
  sales_open_at          timestamptz,
  sales_close_at         timestamptz,

  price                  integer,
  quota                  integer,

  status                 text NOT NULL DEFAULT 'draft',
  offer_kind             text NOT NULL DEFAULT 'live',
  sales_mode             text NOT NULL DEFAULT 'coming_soon',
  is_listed              boolean NOT NULL DEFAULT true,
  is_test                boolean NOT NULL DEFAULT false,

  youtube_video_id       text,
  recording_minutes      integer,
  recording_published_at timestamptz,
  materials_path         text,

  meeting_url            text,
  preview_token          text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  published_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webinar_events_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80 AND slug <> 'gabung'
  ),
  CONSTRAINT webinar_events_summary_len CHECK (summary IS NULL OR char_length(summary) <= 160),
  CONSTRAINT webinar_events_speakers_array CHECK (jsonb_typeof(speakers) = 'array'),
  CONSTRAINT webinar_events_status_check CHECK (status IN ('draft', 'published', 'cancelled')),
  CONSTRAINT webinar_events_offer_kind_check CHECK (offer_kind IN ('live', 'replay')),
  CONSTRAINT webinar_events_sales_mode_check CHECK (sales_mode IN ('coming_soon', 'open', 'closed')),
  CONSTRAINT webinar_events_price_min CHECK (price IS NULL OR price >= 1000),
  CONSTRAINT webinar_events_quota_pos CHECK (quota IS NULL OR quota > 0),
  CONSTRAINT webinar_events_duration_pos CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CONSTRAINT webinar_events_recording_pos CHECK (recording_minutes IS NULL OR recording_minutes > 0),
  CONSTRAINT webinar_events_youtube_format CHECK (
    youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  CONSTRAINT webinar_events_sales_window CHECK (
    sales_open_at IS NULL OR sales_close_at IS NULL OR sales_open_at < sales_close_at
  ),
  -- Isian dijual wajib lengkap saat terbit walau tanggal bukanya masih jauh,
  -- karena tombol beli nanti terbuka tanpa admin menekan apa pun.
  CONSTRAINT webinar_events_ready_to_sell CHECK (
    NOT (status = 'published' AND sales_mode = 'open')
    OR (
      price IS NOT NULL
      AND (
        (offer_kind = 'live' AND starts_at IS NOT NULL AND duration_minutes IS NOT NULL AND quota IS NOT NULL)
        OR
        (offer_kind = 'replay' AND youtube_video_id IS NOT NULL AND recording_published_at IS NOT NULL)
      )
    )
  )
);

CREATE TRIGGER set_timestamp_webinar_events
  BEFORE UPDATE ON public.webinar_events
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- ── Tabel order ─────────────────────────────────────────────────────────────

CREATE TABLE public.webinar_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                uuid NOT NULL REFERENCES public.webinar_events(id) ON DELETE RESTRICT,
  kind                    text NOT NULL,
  -- SET NULL: baris uang tidak ikut hilang kalau akunnya dihapus.
  auth_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  buyer_email             text NOT NULL,
  buyer_name              text,
  buyer_phone             text,
  buyer_university        text,
  buyer_major             text,
  buyer_status            text,
  buyer_referral          text,

  marketing_consent       boolean NOT NULL DEFAULT false,
  consent_at              timestamptz,
  consent_version         text,
  terms_version           text NOT NULL,
  terms_accepted_at       timestamptz NOT NULL,

  invoice_number          text NOT NULL UNIQUE,
  amount                  integer NOT NULL,
  subtotal                integer NOT NULL,
  ppn_rate                numeric(5,4) NOT NULL DEFAULT 0.11,
  ppn_amount              integer NOT NULL,

  status                  text NOT NULL DEFAULT 'pending',
  hold_until              timestamptz,
  payment_expires_at      timestamptz NOT NULL,

  doku_request_id         text,
  payment_url             text,
  payment_channel         text,
  paid_at                 timestamptz,
  paid_via                text,
  last_status_check_at    timestamptz,

  ticket_code             text UNIQUE,
  join_token              text UNIQUE,

  alarm_outcome           text,

  ticket_email_claimed_at timestamptz,
  ticket_email_sent_at    timestamptz,
  ticket_email_error      text,
  recording_email_sent_at timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webinar_orders_kind_check CHECK (kind IN ('live', 'replay')),
  CONSTRAINT webinar_orders_status_check CHECK (
    status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded')
  ),
  CONSTRAINT webinar_orders_paid_via_check CHECK (
    paid_via IS NULL OR paid_via IN ('webhook', 'status_check', 'admin')
  ),
  -- Maksimal 30 karakter selama kanal kartu DOKU aktif; format ini 26.
  CONSTRAINT webinar_orders_invoice_format CHECK (invoice_number ~ '^WBN-[0-9A-F]{8}-[0-9]{13}$'),
  CONSTRAINT webinar_orders_amount_min CHECK (amount >= 1000),
  -- Invarian yang sama dengan transactions produksi (nol selisih).
  CONSTRAINT webinar_orders_money_adds_up CHECK (subtotal + ppn_amount = amount),
  CONSTRAINT webinar_orders_consent_needs_time CHECK (NOT marketing_consent OR consent_at IS NOT NULL),
  CONSTRAINT webinar_orders_alarm_check CHECK (
    alarm_outcome IS NULL OR alarm_outcome IN (
      'webinar_over_quota', 'webinar_duplicate_paid', 'webinar_paid_on_cancelled'
    )
  ),
  CONSTRAINT webinar_orders_paid_complete CHECK (
    status NOT IN ('paid', 'refunded')
    OR (paid_at IS NOT NULL AND ticket_code IS NOT NULL AND join_token IS NOT NULL)
  )
);

CREATE TRIGGER set_timestamp_webinar_orders
  BEFORE UPDATE ON public.webinar_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- Satu pending per akun per acara, lintas kind. Permintaan bersamaan sudah
-- diurutkan oleh lock acara; index ini penjaga terakhirnya.
CREATE UNIQUE INDEX webinar_orders_one_pending
  ON public.webinar_orders (event_id, auth_user_id) WHERE status = 'pending';
CREATE INDEX webinar_orders_event_status ON public.webinar_orders (event_id, status, kind);
CREATE INDEX webinar_orders_auth_user ON public.webinar_orders (auth_user_id);

-- ── Hak akses tabel ─────────────────────────────────────────────────────────

ALTER TABLE public.webinar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.webinar_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webinar_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webinar_events TO service_role;
GRANT ALL ON TABLE public.webinar_orders TO service_role;

-- ── Keadaan penjualan ───────────────────────────────────────────────────────
--
-- Parameter tunggal bertipe baris supaya bisa dipanggil sebagai kolom terhitung
-- PostgREST: select=*,webinar_offer_state.
--
-- Urutan yang menang: draft → batal → ditutup admin → lewat tutup/acara mulai →
-- belum dibuka → habis → ditahan → dijual.

CREATE FUNCTION public.webinar_offer_state(e public.webinar_events)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sold  integer := 0;
  v_held  integer := 0;
  v_left  integer;
  v_state text;
  v_opens timestamptz;
BEGIN
  IF e.offer_kind = 'live' THEN
    SELECT count(*) FILTER (WHERE o.status = 'paid'),
           count(*) FILTER (WHERE o.status = 'pending' AND o.hold_until > now())
      INTO v_sold, v_held
      FROM webinar_orders o
     WHERE o.event_id = e.id AND o.kind = 'live';

    IF e.quota IS NOT NULL THEN
      v_left := greatest(e.quota - v_sold - v_held, 0);
    END IF;
  END IF;

  IF e.sales_mode = 'open' AND e.sales_open_at > now() THEN
    v_opens := e.sales_open_at;
  END IF;

  v_state := CASE
    WHEN e.status = 'draft' THEN 'draft'
    WHEN e.status = 'cancelled' THEN 'cancelled'
    WHEN e.sales_mode = 'closed' THEN 'closed'
    WHEN e.sales_close_at <= now() THEN 'sales_ended'
    WHEN e.offer_kind = 'live' AND e.starts_at <= now() THEN 'sales_ended'
    WHEN e.sales_mode = 'coming_soon' OR v_opens IS NOT NULL THEN 'coming_soon'
    WHEN e.offer_kind = 'live' AND v_sold >= e.quota THEN 'sold_out'
    WHEN e.offer_kind = 'live' AND v_sold + v_held >= e.quota THEN 'seats_held'
    ELSE 'on_sale'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'opens_at', v_opens,
    -- Sisa detik dari jam server; halaman tidak memakai jam perangkat.
    'seconds_until_open', CASE
      WHEN v_opens IS NULL OR v_state <> 'coming_soon' THEN NULL
      ELSE ceil(extract(epoch FROM v_opens - now()))::bigint
    END,
    'quota', CASE WHEN e.offer_kind = 'live' THEN e.quota END,
    'sold', v_sold,
    'held', v_held,
    'seats_left', v_left
  );
END;
$$;

-- ── Menahan kursi ───────────────────────────────────────────────────────────
--
-- `result`:
--   created        order baru; panggil DOKU lalu simpan payment_url
--   reused         link pending yang masih hidup; pakai payment_url kiriman
--   preparing      permintaan lain sedang menerbitkan link; jangan panggil DOKU
--   already_owned  sudah punya akses; arahkan ke order_id
--   rejected       lihat `state`
--   not_found      slug tidak ada

CREATE FUNCTION public.webinar_reserve_seat(
  p_slug              text,
  p_auth_user_id      uuid,
  p_buyer_email       text,
  p_buyer             jsonb,
  p_terms_version     text,
  p_marketing_consent boolean DEFAULT false,
  p_consent_version   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event    webinar_events%ROWTYPE;
  v_order    webinar_orders%ROWTYPE;
  v_state    jsonb;
  v_name     text;
  v_id       uuid := gen_random_uuid();
  v_invoice  text;
  v_subtotal integer;
BEGIN
  IF p_auth_user_id IS NULL OR coalesce(btrim(p_buyer_email), '') = '' THEN
    RAISE EXCEPTION 'webinar_reserve_seat: akun dan email wajib ada';
  END IF;
  IF coalesce(btrim(p_terms_version), '') = '' THEN
    RAISE EXCEPTION 'webinar_reserve_seat: persetujuan S&K wajib ada';
  END IF;

  SELECT * INTO v_event FROM webinar_events WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  -- Pemegang tiket otomatis berhak atas rekaman, jadi halaman video mengecek
  -- kedua kind; halaman tiket hanya tiket.
  SELECT * INTO v_order FROM webinar_orders o
   WHERE o.event_id = v_event.id
     AND o.auth_user_id = p_auth_user_id
     AND o.status = 'paid'
     AND (v_event.offer_kind = 'replay' OR o.kind = 'live')
   ORDER BY o.paid_at
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('result', 'already_owned', 'order_id', v_order.id);
  END IF;

  v_state := webinar_offer_state(v_event);
  v_name := v_state ->> 'state';
  IF v_name NOT IN ('on_sale', 'sold_out', 'seats_held') THEN
    RETURN jsonb_build_object('result', 'rejected', 'state', v_name);
  END IF;

  SELECT * INTO v_order FROM webinar_orders o
   WHERE o.event_id = v_event.id
     AND o.auth_user_id = p_auth_user_id
     AND o.status = 'pending'
   LIMIT 1;

  IF FOUND THEN
    IF v_order.kind = v_event.offer_kind AND v_order.payment_expires_at > now() THEN
      IF v_order.payment_url IS NOT NULL THEN
        RETURN jsonb_build_object(
          'result', 'reused',
          'order_id', v_order.id,
          'invoice_number', v_order.invoice_number,
          'amount', v_order.amount,
          'payment_url', v_order.payment_url,
          'payment_expires_at', v_order.payment_expires_at
        );
      END IF;
      -- Tanpa batas ini, panggilan DOKU yang gagal mengunci pembeli 30 menit.
      IF v_order.created_at > now() - interval '2 minutes' THEN
        RETURN jsonb_build_object('result', 'preparing', 'order_id', v_order.id);
      END IF;
    END IF;

    UPDATE webinar_orders SET status = 'expired' WHERE id = v_order.id;

    -- Tahanan sendiri baru saja lepas, jadi keadaan kuota dihitung ulang.
    v_state := webinar_offer_state(v_event);
    v_name := v_state ->> 'state';
  END IF;

  IF v_name <> 'on_sale' THEN
    RETURN jsonb_build_object('result', 'rejected', 'state', v_name);
  END IF;

  v_invoice := 'WBN-' || upper(substr(replace(v_id::text, '-', ''), 1, 8)) || '-' ||
               lpad(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text, 13, '0');
  v_subtotal := round(v_event.price::numeric / 1.11)::integer;

  INSERT INTO webinar_orders (
    id, event_id, kind, auth_user_id,
    buyer_email, buyer_name, buyer_phone, buyer_university, buyer_major, buyer_status, buyer_referral,
    marketing_consent, consent_at, consent_version, terms_version, terms_accepted_at,
    invoice_number, amount, subtotal, ppn_rate, ppn_amount,
    status, hold_until, payment_expires_at
  ) VALUES (
    v_id, v_event.id, v_event.offer_kind, p_auth_user_id,
    btrim(p_buyer_email),
    p_buyer ->> 'name', p_buyer ->> 'phone', p_buyer ->> 'university',
    p_buyer ->> 'major', p_buyer ->> 'status', p_buyer ->> 'referral',
    coalesce(p_marketing_consent, false),
    CASE WHEN p_marketing_consent THEN now() END,
    CASE WHEN p_marketing_consent THEN p_consent_version END,
    p_terms_version, now(),
    v_invoice, v_event.price, v_subtotal, 0.11, v_event.price - v_subtotal,
    'pending',
    CASE WHEN v_event.offer_kind = 'live' THEN now() + interval '40 minutes' END,
    now() + interval '30 minutes'
  );

  RETURN jsonb_build_object(
    'result', 'created',
    'order_id', v_id,
    'invoice_number', v_invoice,
    'amount', v_event.price,
    'kind', v_event.offer_kind,
    'item_name', v_event.title
  );
END;
$$;

-- ── Menandai lunas ──────────────────────────────────────────────────────────
--
-- Dipakai webhook dan Check Status DOKU. Uang yang sudah masuk selalu dicatat,
-- termasuk pada order expired; masalahnya menjadi alarm, bukan penolakan.
--
-- `outcome`: ok, webinar_not_found, amount_mismatch, webinar_over_quota,
-- webinar_duplicate_paid, webinar_paid_on_cancelled.
-- Pemanggilan ulang mengembalikan alarm tersimpan, bukan `ok`, karena `ok`
-- menutup semua alarm invoice ini di banner admin.

CREATE FUNCTION public.webinar_mark_paid(
  p_invoice text,
  p_amount  numeric,
  p_channel text,
  p_via     text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
  v_event    webinar_events%ROWTYPE;
  v_order    webinar_orders%ROWTYPE;
  v_outcome  text := 'ok';
  v_paid     integer;
BEGIN
  SELECT o.event_id INTO v_event_id FROM webinar_orders o WHERE o.invoice_number = p_invoice;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'webinar_not_found');
  END IF;

  SELECT * INTO v_event FROM webinar_events WHERE id = v_event_id FOR UPDATE;
  SELECT * INTO v_order FROM webinar_orders WHERE invoice_number = p_invoice FOR UPDATE;

  IF p_amount IS NULL OR p_amount <> v_order.amount THEN
    RETURN jsonb_build_object(
      'outcome', 'amount_mismatch',
      'order_id', v_order.id,
      'message', format('Tagihan Rp%s, notifikasi Rp%s. Tidak ada yang ditulis.',
                        v_order.amount, coalesce(p_amount::text, 'kosong'))
    );
  END IF;

  IF v_order.status IN ('paid', 'refunded') THEN
    RETURN jsonb_build_object(
      'outcome', coalesce(v_order.alarm_outcome, 'ok'),
      'order_id', v_order.id,
      'event_id', v_order.event_id,
      'kind', v_order.kind,
      'newly_paid', false,
      'send_ticket', v_order.status = 'paid'
                     AND v_event.status <> 'cancelled'
                     AND v_order.ticket_email_sent_at IS NULL
    );
  END IF;

  UPDATE webinar_orders SET
    status = 'paid',
    paid_at = now(),
    paid_via = p_via,
    payment_channel = p_channel,
    ticket_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    join_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO transactions (
    entity_type, form_submission_id, schedule_id, payment_id, status, amount,
    subtotal, ppn_rate, ppn_amount, payment_method, payment_channel,
    doku_request_id, note
  ) VALUES (
    'webinar', NULL, NULL, v_order.invoice_number, 'completed', v_order.amount,
    v_order.subtotal, v_order.ppn_rate, v_order.ppn_amount, 'doku', p_channel,
    v_order.doku_request_id,
    jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object(
        'name', CASE WHEN v_order.kind = 'live' THEN 'Tiket webinar: ' ELSE 'Video kelas: ' END || v_event.title,
        'qty', 1,
        'price', v_order.amount,
        'category', 'Webinar'
      )),
      'memo', '',
      'buyer', jsonb_build_object('name', v_order.buyer_name, 'email', v_order.buyer_email),
      'is_test', v_event.is_test
    )::text
  );

  IF v_event.status = 'cancelled' THEN
    v_outcome := 'webinar_paid_on_cancelled';
  ELSIF v_order.auth_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM webinar_orders o
     WHERE o.event_id = v_order.event_id
       AND o.auth_user_id = v_order.auth_user_id
       AND o.status = 'paid'
       AND o.id <> v_order.id
  ) THEN
    v_outcome := 'webinar_duplicate_paid';
  ELSIF v_order.kind = 'live' AND v_event.quota IS NOT NULL THEN
    SELECT count(*) INTO v_paid FROM webinar_orders o
     WHERE o.event_id = v_order.event_id AND o.kind = 'live' AND o.status = 'paid';
    IF v_paid > v_event.quota THEN
      v_outcome := 'webinar_over_quota';
    END IF;
  END IF;

  IF v_outcome <> 'ok' THEN
    UPDATE webinar_orders SET alarm_outcome = v_outcome WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'order_id', v_order.id,
    'event_id', v_order.event_id,
    'kind', v_order.kind,
    'newly_paid', true,
    -- Pembeli acara batal dihubungi admin; e-tiket hanya membingungkan.
    'send_ticket', v_outcome <> 'webinar_paid_on_cancelled'
  );
END;
$$;

-- ── Hak akses fungsi ────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.webinar_offer_state(public.webinar_events) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webinar_mark_paid(text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webinar_offer_state(public.webinar_events) TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.webinar_mark_paid(text, numeric, text, text) TO service_role;

-- ── Buku uang ───────────────────────────────────────────────────────────────

-- transactions.payment_id tidak punya unique index sama sekali. Yang ini hanya
-- berlaku untuk webinar; satu payment_id iklan boleh menaungi banyak jadwal.
CREATE UNIQUE INDEX transactions_webinar_payment_unique
  ON public.transactions (payment_id) WHERE entity_type = 'webinar';

ALTER TABLE public.doku_webhook_events DROP CONSTRAINT doku_webhook_events_outcome_check;
ALTER TABLE public.doku_webhook_events ADD CONSTRAINT doku_webhook_events_outcome_check CHECK (
  outcome = ANY (ARRAY[
    'ok', 'write_failed', 'amount_mismatch', 'no_submission_found', 'forwarded_jm',
    'payout', 'rejected_auth', 'rejected_payload', 'handler_crashed',
    'paid_on_dead_bill', 'paid_on_stale_bill',
    'webinar_over_quota', 'webinar_duplicate_paid', 'webinar_not_found', 'webinar_paid_on_cancelled'
  ])
);

-- ── Penyimpanan berkas ──────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('webinar-public', 'webinar-public', true, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('webinar-materials', 'webinar-materials', false, 52428800,
   ARRAY[
     'application/pdf',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/zip'
   ]);

-- Poster tetap terbuka lewat URL publik bucket; policy ini hanya mengatur
-- pendaftaran isi, tulis, dan hapus lewat Storage API. Pembeli mengunduh materi
-- dengan signed URL dari Function (service_role).
CREATE POLICY "Webinar: hanya pengelola" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('webinar-public', 'webinar-materials')
    AND (auth.jwt() ->> 'email') = 'product@jakpat.net'
  )
  WITH CHECK (
    bucket_id IN ('webinar-public', 'webinar-materials')
    AND (auth.jwt() ->> 'email') = 'product@jakpat.net'
  );

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja, atau ROLLBACK di akhir)
-- ============================================================================
--
-- 3a. Harapan: proacl hanya postgres & service_role, TANPA anon/authenticated.
--
-- SELECT proname, array_to_string(proacl::text[], ' | ')
--   FROM pg_proc WHERE proname LIKE 'webinar%';
--
-- 3b. Harapan: dua baris, relrowsecurity true; relacl tanpa anon/authenticated.
--
-- SELECT relname, relrowsecurity, array_to_string(relacl::text[], ' | ')
--   FROM pg_class WHERE relname IN ('webinar_events', 'webinar_orders');
--
-- 3c. Anon dan akun biasa benar-benar tertolak. Harapan: KEDUA pernyataan galat
--     "permission denied". Jalankan satu per satu.
--
-- BEGIN; SET LOCAL ROLE anon; SELECT * FROM public.webinar_orders; ROLLBACK;
-- BEGIN; SET LOCAL ROLE authenticated; SELECT public.webinar_mark_paid('x', 1, 'x', 'webhook'); ROLLBACK;
--
-- 3d. Uji perilaku tanpa jejak. Ganti :user dengan id akun yang sudah ada.
--     Harapan: result=created, lalu outcome=ok, lalu satu baris transactions
--     (amount 1110, subtotal 1000, ppn 110).
--
-- BEGIN;
-- INSERT INTO public.webinar_events (slug, title, status, sales_mode, price, quota, starts_at, duration_minutes, is_test)
--   VALUES ('verifikasi-131', 'Verifikasi', 'published', 'open', 1110, 1, now() + interval '1 day', 60, true);
-- SELECT public.webinar_reserve_seat('verifikasi-131', ':user'::uuid, 'uji@example.test', '{}'::jsonb, 'v1');
-- SELECT public.webinar_mark_paid(
--   (SELECT invoice_number FROM public.webinar_orders o JOIN public.webinar_events e ON e.id = o.event_id WHERE e.slug = 'verifikasi-131'),
--   1110, 'QRIS_DOKU', 'admin');
-- SELECT t.amount, t.subtotal, t.ppn_amount, t.status, t.entity_type FROM public.transactions t
--   JOIN public.webinar_orders o ON o.invoice_number = t.payment_id
--   JOIN public.webinar_events e ON e.id = o.event_id WHERE e.slug = 'verifikasi-131';
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK — hanya sebelum penjualan pertama
-- ============================================================================
--
-- Kode webinar harus di-revert DULU. Bucket berisi berkas dikosongkan lewat
-- dashboard Storage lebih dulu. Harapan cek pertama: 0; bila tidak, BERHENTI,
-- karena itu baris uang sungguhan dan CHECK lama akan menolak outcome webinar.
--
-- SELECT (SELECT count(*) FROM public.transactions WHERE entity_type = 'webinar')
--      + (SELECT count(*) FROM public.doku_webhook_events WHERE outcome LIKE 'webinar\_%');
--
-- BEGIN;
-- DROP POLICY IF EXISTS "Webinar: hanya pengelola" ON storage.objects;
-- SET LOCAL storage.allow_delete_query = 'true';  -- trigger storage.protect_delete
-- DELETE FROM storage.buckets WHERE id IN ('webinar-public', 'webinar-materials');
-- ALTER TABLE public.doku_webhook_events DROP CONSTRAINT doku_webhook_events_outcome_check;
-- ALTER TABLE public.doku_webhook_events ADD CONSTRAINT doku_webhook_events_outcome_check CHECK (
--   outcome = ANY (ARRAY[
--     'ok', 'write_failed', 'amount_mismatch', 'no_submission_found', 'forwarded_jm',
--     'payout', 'rejected_auth', 'rejected_payload', 'handler_crashed',
--     'paid_on_dead_bill', 'paid_on_stale_bill'
--   ])
-- );
-- DROP INDEX IF EXISTS public.transactions_webinar_payment_unique;
-- DROP FUNCTION IF EXISTS public.webinar_mark_paid(text, numeric, text, text);
-- DROP FUNCTION IF EXISTS public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text);
-- DROP FUNCTION IF EXISTS public.webinar_offer_state(public.webinar_events);
-- DROP TABLE IF EXISTS public.webinar_orders;
-- DROP TABLE IF EXISTS public.webinar_events;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
