-- ============================================================================
-- sql/134 — VOUCHER DI CHECKOUT WEBINAR
-- ============================================================================
--
-- Pemilik produk (3 Nov): kode voucher iklan/Kilat yang berbentuk persen atau
-- harga jadi juga berlaku untuk webinar. Katalog dan kalimat penolakannya ada di
-- functions/api/webinar/_vouchers.js; yang memanggil fungsi ini hanya Pages
-- Function ber-service_role, jadi browser tidak bisa mengirim p_voucher sendiri.
--
-- Isi:
--   1. webinar_orders: kolom voucher_code + discount_amount (snapshot per order).
--   2. webinar_reserve_seat: parameter baru p_voucher jsonb DEFAULT NULL.
--      {"code":"X","percent":10} → harga − round(harga × 10%)
--      {"code":"X","total":1000} → min(harga, 1000)
--      Hasil selalu di antara Rp 1.000 dan harga normal.
--      Tanpa p_voucher perilakunya sama persis dengan sql/131.
--   3. webinar_mark_paid: baris transactions ikut membawa voucher_code, dan memo
--      menyebut potongannya. Sisanya sama dengan sql/131.
--
-- Signature webinar_reserve_seat berubah, jadi fungsi lama di-DROP dulu. Tanpa
-- itu Postgres membuat overload kedua dan PostgREST tidak bisa memilih.
--
-- URUTAN: jalankan berkas ini SEBELUM deploy kode voucher. Kode lama yang
-- masih tayang memanggil tanpa p_voucher dan tetap berjalan.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- Harapan: satu baris, signature lama (7 argumen), proacl hanya postgres + service_role.
--
-- SELECT p.oid::regprocedure, p.proacl FROM pg_proc p WHERE p.proname = 'webinar_reserve_seat';
--
-- Harapan: 0 baris (kolom belum ada).
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'webinar_orders'
--    AND column_name IN ('voucher_code', 'discount_amount');


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

ALTER TABLE public.webinar_orders
  ADD COLUMN voucher_code    text,
  ADD COLUMN discount_amount integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT webinar_orders_discount_nonneg CHECK (discount_amount >= 0),
  ADD CONSTRAINT webinar_orders_discount_needs_code CHECK (discount_amount = 0 OR voucher_code IS NOT NULL);

DROP FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text);

CREATE FUNCTION public.webinar_reserve_seat(
  p_slug              text,
  p_auth_user_id      uuid,
  p_buyer_email       text,
  p_buyer             jsonb,
  p_terms_version     text,
  p_marketing_consent boolean DEFAULT false,
  p_consent_version   text DEFAULT NULL,
  p_voucher           jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event    webinar_events%ROWTYPE;
  v_order    webinar_orders%ROWTYPE;
  v_state    jsonb;
  v_name     text;
  v_id       uuid := gen_random_uuid();
  v_invoice  text;
  v_subtotal integer;
  v_amount   integer;
  v_code     text;
  v_percent  numeric;
BEGIN
  IF p_auth_user_id IS NULL OR coalesce(btrim(p_buyer_email), '') = '' THEN
    RAISE EXCEPTION 'webinar_reserve_seat: akun dan email wajib ada';
  END IF;
  IF coalesce(btrim(p_terms_version), '') = '' THEN
    RAISE EXCEPTION 'webinar_reserve_seat: persetujuan S&K wajib ada';
  END IF;
  IF p_voucher IS NOT NULL THEN
    v_code := upper(btrim(p_voucher ->> 'code'));
    IF coalesce(v_code, '') = '' THEN
      RAISE EXCEPTION 'webinar_reserve_seat: voucher tanpa kode';
    END IF;
    IF p_voucher ? 'percent' THEN
      v_percent := (p_voucher ->> 'percent')::numeric;
      IF v_percent IS NULL OR v_percent <= 0 OR v_percent >= 100 THEN
        RAISE EXCEPTION 'webinar_reserve_seat: persen voucher tidak sah (%)', p_voucher ->> 'percent';
      END IF;
    ELSIF NOT (p_voucher ? 'total') OR (p_voucher ->> 'total')::integer IS NULL THEN
      RAISE EXCEPTION 'webinar_reserve_seat: voucher tanpa persen atau total';
    END IF;
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
    -- Link yang masih hidup dipakai ulang apa adanya, termasuk harganya: link DOKU
    -- sudah terbit dengan nominal itu.
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

  -- Harga sudah termasuk PPN. Voucher tidak pernah menurunkan di bawah Rp 1.000
  -- (webinar_orders_amount_min) dan tidak pernah menaikkan harga.
  v_amount := v_event.price;
  IF p_voucher IS NOT NULL THEN
    IF v_percent IS NOT NULL THEN
      v_amount := v_event.price - round(v_event.price::numeric * v_percent / 100)::integer;
    ELSE
      v_amount := least(v_event.price, (p_voucher ->> 'total')::integer);
    END IF;
    v_amount := least(v_event.price, greatest(v_amount, 1000));
  END IF;

  v_invoice := 'WBN-' || upper(substr(replace(v_id::text, '-', ''), 1, 8)) || '-' ||
               lpad(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text, 13, '0');
  v_subtotal := round(v_amount::numeric / 1.11)::integer;

  INSERT INTO webinar_orders (
    id, event_id, kind, auth_user_id,
    buyer_email, buyer_name, buyer_phone, buyer_university, buyer_major, buyer_status, buyer_referral,
    marketing_consent, consent_at, consent_version, terms_version, terms_accepted_at,
    invoice_number, amount, subtotal, ppn_rate, ppn_amount, voucher_code, discount_amount,
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
    v_invoice, v_amount, v_subtotal, 0.11, v_amount - v_subtotal, v_code, v_event.price - v_amount,
    'pending',
    CASE WHEN v_event.offer_kind = 'live' THEN now() + interval '40 minutes' END,
    now() + interval '30 minutes'
  );

  RETURN jsonb_build_object(
    'result', 'created',
    'order_id', v_id,
    'invoice_number', v_invoice,
    'amount', v_amount,
    'list_price', v_event.price,
    'discount', v_event.price - v_amount,
    'voucher_code', v_code,
    'kind', v_event.offer_kind,
    'item_name', v_event.title
  );
END;
$function$;

-- pg_default_acl memberi anon & authenticated EXECUTE ke setiap fungsi baru.
REVOKE ALL ON FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.webinar_mark_paid(p_invoice text, p_amount numeric, p_channel text, p_via text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
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
    doku_request_id, voucher_code, note
  ) VALUES (
    'webinar', NULL, NULL, v_order.invoice_number, 'completed', v_order.amount,
    v_order.subtotal, v_order.ppn_rate, v_order.ppn_amount, 'doku', p_channel,
    v_order.doku_request_id, v_order.voucher_code,
    jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object(
        'name', CASE WHEN v_order.kind = 'live' THEN 'Tiket webinar: ' ELSE 'Video kelas: ' END || v_event.title,
        'qty', 1,
        'price', v_order.amount,
        'category', 'Webinar'
      )),
      'memo', CASE WHEN v_order.voucher_code IS NOT NULL
                   THEN format('Voucher %s (potongan Rp%s)', v_order.voucher_code, v_order.discount_amount)
                   ELSE '' END,
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
$function$;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- Harapan: satu baris, 8 argumen, proacl {postgres=X/postgres,service_role=X/postgres}.
-- Bila anon atau authenticated muncul, jalankan ulang REVOKE di atas.
--
-- SELECT p.oid::regprocedure, p.proacl FROM pg_proc p WHERE p.proname = 'webinar_reserve_seat';
--
-- Harapan: dua baris (voucher_code text, discount_amount integer).
--
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'webinar_orders'
--    AND column_name IN ('voucher_code', 'discount_amount');
--
-- Harapan: true (mark_paid kini menulis voucher_code).
--
-- SELECT pg_get_functiondef('public.webinar_mark_paid(text,numeric,text,text)'::regprocedure)
--        LIKE '%v_order.voucher_code%';


-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- Mengembalikan fungsi sql/131 apa adanya. Kolom voucher dibuang; order yang sudah
-- memakai voucher kehilangan catatan kodenya (nominal order & transactions tetap).
--
-- BEGIN;
--
-- DROP FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text, jsonb);
--
-- CREATE FUNCTION public.webinar_reserve_seat(p_slug text, p_auth_user_id uuid, p_buyer_email text, p_buyer jsonb, p_terms_version text, p_marketing_consent boolean DEFAULT false, p_consent_version text DEFAULT NULL::text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_event    webinar_events%ROWTYPE;
--   v_order    webinar_orders%ROWTYPE;
--   v_state    jsonb;
--   v_name     text;
--   v_id       uuid := gen_random_uuid();
--   v_invoice  text;
--   v_subtotal integer;
-- BEGIN
--   IF p_auth_user_id IS NULL OR coalesce(btrim(p_buyer_email), '') = '' THEN
--     RAISE EXCEPTION 'webinar_reserve_seat: akun dan email wajib ada';
--   END IF;
--   IF coalesce(btrim(p_terms_version), '') = '' THEN
--     RAISE EXCEPTION 'webinar_reserve_seat: persetujuan S&K wajib ada';
--   END IF;
--   SELECT * INTO v_event FROM webinar_events WHERE slug = p_slug FOR UPDATE;
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object('result', 'not_found');
--   END IF;
--   SELECT * INTO v_order FROM webinar_orders o
--    WHERE o.event_id = v_event.id AND o.auth_user_id = p_auth_user_id AND o.status = 'paid'
--      AND (v_event.offer_kind = 'replay' OR o.kind = 'live')
--    ORDER BY o.paid_at LIMIT 1;
--   IF FOUND THEN
--     RETURN jsonb_build_object('result', 'already_owned', 'order_id', v_order.id);
--   END IF;
--   v_state := webinar_offer_state(v_event);
--   v_name := v_state ->> 'state';
--   IF v_name NOT IN ('on_sale', 'sold_out', 'seats_held') THEN
--     RETURN jsonb_build_object('result', 'rejected', 'state', v_name);
--   END IF;
--   SELECT * INTO v_order FROM webinar_orders o
--    WHERE o.event_id = v_event.id AND o.auth_user_id = p_auth_user_id AND o.status = 'pending' LIMIT 1;
--   IF FOUND THEN
--     IF v_order.kind = v_event.offer_kind AND v_order.payment_expires_at > now() THEN
--       IF v_order.payment_url IS NOT NULL THEN
--         RETURN jsonb_build_object('result', 'reused', 'order_id', v_order.id, 'invoice_number', v_order.invoice_number,
--           'amount', v_order.amount, 'payment_url', v_order.payment_url, 'payment_expires_at', v_order.payment_expires_at);
--       END IF;
--       IF v_order.created_at > now() - interval '2 minutes' THEN
--         RETURN jsonb_build_object('result', 'preparing', 'order_id', v_order.id);
--       END IF;
--     END IF;
--     UPDATE webinar_orders SET status = 'expired' WHERE id = v_order.id;
--     v_state := webinar_offer_state(v_event);
--     v_name := v_state ->> 'state';
--   END IF;
--   IF v_name <> 'on_sale' THEN
--     RETURN jsonb_build_object('result', 'rejected', 'state', v_name);
--   END IF;
--   v_invoice := 'WBN-' || upper(substr(replace(v_id::text, '-', ''), 1, 8)) || '-' ||
--                lpad(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text, 13, '0');
--   v_subtotal := round(v_event.price::numeric / 1.11)::integer;
--   INSERT INTO webinar_orders (
--     id, event_id, kind, auth_user_id,
--     buyer_email, buyer_name, buyer_phone, buyer_university, buyer_major, buyer_status, buyer_referral,
--     marketing_consent, consent_at, consent_version, terms_version, terms_accepted_at,
--     invoice_number, amount, subtotal, ppn_rate, ppn_amount, status, hold_until, payment_expires_at
--   ) VALUES (
--     v_id, v_event.id, v_event.offer_kind, p_auth_user_id, btrim(p_buyer_email),
--     p_buyer ->> 'name', p_buyer ->> 'phone', p_buyer ->> 'university',
--     p_buyer ->> 'major', p_buyer ->> 'status', p_buyer ->> 'referral',
--     coalesce(p_marketing_consent, false),
--     CASE WHEN p_marketing_consent THEN now() END,
--     CASE WHEN p_marketing_consent THEN p_consent_version END,
--     p_terms_version, now(),
--     v_invoice, v_event.price, v_subtotal, 0.11, v_event.price - v_subtotal, 'pending',
--     CASE WHEN v_event.offer_kind = 'live' THEN now() + interval '40 minutes' END,
--     now() + interval '30 minutes'
--   );
--   RETURN jsonb_build_object('result', 'created', 'order_id', v_id, 'invoice_number', v_invoice,
--     'amount', v_event.price, 'kind', v_event.offer_kind, 'item_name', v_event.title);
-- END;
-- $function$;
--
-- REVOKE ALL ON FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.webinar_reserve_seat(text, uuid, text, jsonb, text, boolean, text) TO service_role;
--
-- -- webinar_mark_paid sql/131 dipulihkan SEBELUM kolom voucher dibuang.
-- CREATE OR REPLACE FUNCTION public.webinar_mark_paid(p_invoice text, p_amount numeric, p_channel text, p_via text)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_event_id uuid;
--   v_event    webinar_events%ROWTYPE;
--   v_order    webinar_orders%ROWTYPE;
--   v_outcome  text := 'ok';
--   v_paid     integer;
-- BEGIN
--   SELECT o.event_id INTO v_event_id FROM webinar_orders o WHERE o.invoice_number = p_invoice;
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object('outcome', 'webinar_not_found');
--   END IF;
--
--   SELECT * INTO v_event FROM webinar_events WHERE id = v_event_id FOR UPDATE;
--   SELECT * INTO v_order FROM webinar_orders WHERE invoice_number = p_invoice FOR UPDATE;
--
--   IF p_amount IS NULL OR p_amount <> v_order.amount THEN
--     RETURN jsonb_build_object(
--       'outcome', 'amount_mismatch',
--       'order_id', v_order.id,
--       'message', format('Tagihan Rp%s, notifikasi Rp%s. Tidak ada yang ditulis.',
--                         v_order.amount, coalesce(p_amount::text, 'kosong'))
--     );
--   END IF;
--
--   IF v_order.status IN ('paid', 'refunded') THEN
--     RETURN jsonb_build_object(
--       'outcome', coalesce(v_order.alarm_outcome, 'ok'),
--       'order_id', v_order.id,
--       'event_id', v_order.event_id,
--       'kind', v_order.kind,
--       'newly_paid', false,
--       'send_ticket', v_order.status = 'paid'
--                      AND v_event.status <> 'cancelled'
--                      AND v_order.ticket_email_sent_at IS NULL
--     );
--   END IF;
--
--   UPDATE webinar_orders SET
--     status = 'paid',
--     paid_at = now(),
--     paid_via = p_via,
--     payment_channel = p_channel,
--     ticket_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
--     join_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
--   WHERE id = v_order.id
--   RETURNING * INTO v_order;
--
--   INSERT INTO transactions (
--     entity_type, form_submission_id, schedule_id, payment_id, status, amount,
--     subtotal, ppn_rate, ppn_amount, payment_method, payment_channel,
--     doku_request_id, note
--   ) VALUES (
--     'webinar', NULL, NULL, v_order.invoice_number, 'completed', v_order.amount,
--     v_order.subtotal, v_order.ppn_rate, v_order.ppn_amount, 'doku', p_channel,
--     v_order.doku_request_id,
--     jsonb_build_object(
--       'items', jsonb_build_array(jsonb_build_object(
--         'name', CASE WHEN v_order.kind = 'live' THEN 'Tiket webinar: ' ELSE 'Video kelas: ' END || v_event.title,
--         'qty', 1,
--         'price', v_order.amount,
--         'category', 'Webinar'
--       )),
--       'memo', '',
--       'buyer', jsonb_build_object('name', v_order.buyer_name, 'email', v_order.buyer_email),
--       'is_test', v_event.is_test
--     )::text
--   );
--
--   IF v_event.status = 'cancelled' THEN
--     v_outcome := 'webinar_paid_on_cancelled';
--   ELSIF v_order.auth_user_id IS NOT NULL AND EXISTS (
--     SELECT 1 FROM webinar_orders o
--      WHERE o.event_id = v_order.event_id
--        AND o.auth_user_id = v_order.auth_user_id
--        AND o.status = 'paid'
--        AND o.id <> v_order.id
--   ) THEN
--     v_outcome := 'webinar_duplicate_paid';
--   ELSIF v_order.kind = 'live' AND v_event.quota IS NOT NULL THEN
--     SELECT count(*) INTO v_paid FROM webinar_orders o
--      WHERE o.event_id = v_order.event_id AND o.kind = 'live' AND o.status = 'paid';
--     IF v_paid > v_event.quota THEN
--       v_outcome := 'webinar_over_quota';
--     END IF;
--   END IF;
--
--   IF v_outcome <> 'ok' THEN
--     UPDATE webinar_orders SET alarm_outcome = v_outcome WHERE id = v_order.id;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'outcome', v_outcome,
--     'order_id', v_order.id,
--     'event_id', v_order.event_id,
--     'kind', v_order.kind,
--     'newly_paid', true,
--     -- Pembeli acara batal dihubungi admin; e-tiket hanya membingungkan.
--     'send_ticket', v_outcome <> 'webinar_paid_on_cancelled'
--   );
-- END;
-- $function$;
--
-- ALTER TABLE public.webinar_orders
--   DROP CONSTRAINT webinar_orders_discount_needs_code,
--   DROP CONSTRAINT webinar_orders_discount_nonneg,
--   DROP COLUMN discount_amount,
--   DROP COLUMN voucher_code;
--
-- COMMIT;
