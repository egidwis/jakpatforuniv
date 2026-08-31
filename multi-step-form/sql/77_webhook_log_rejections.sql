-- ============================================================================
-- 77 — doku_webhook_events: catat juga request yang DITOLAK
-- ============================================================================
-- sql/54 menutup kegagalan TULIS: webhook yang diterima lalu gagal menulis ke
-- database sekarang selalu meninggalkan baris. Yang MASIH buta sesudahnya:
-- kegagalan MASUK. Ketiga jalan penolakan di webhook.js — 401 secret, 401
-- signature/header, 400 payload tak terbaca — semuanya `return` sebelum
-- recordWebhookEvent() sempat dipanggil.
--
-- Akibatnya "nol baris untuk sebuah invoice" berarti DUA hal yang sangat
-- berbeda dan tidak bisa dibedakan dari database:
--   (a) DOKU memang tidak pernah menelepon kita, atau
--   (b) DOKU menelepon dan KITA yang menolak.
--
-- Terukur 2026-08-31, invoice JFU-ac75fa15-1788158299791 (Rp 555.000, QRIS):
-- notification URL produk QRIS di dashboard DOKU menunjuk BO DOKU sendiri
-- (my.dokuwallet.com), jadi jawabannya (a). Tapi membuktikannya butuh
-- screenshot dashboard DOKU — database kita tidak punya apa pun untuk dibaca.
-- Setelah migrasi ini + webhook.js yang menyertainya, (b) selalu meninggalkan
-- baris, jadi "nol baris" akhirnya berarti (a) SAJA.
--
-- Sifatnya MELONGGARKAN constraint (menambah nilai yang diizinkan), jadi tidak
-- ada baris lama yang bisa jadi tidak sah. Idempoten & aman diulang.
--
-- ⚠️ URUTAN DEPLOY: migrasi ini HARUS mendarat SEBELUM webhook.js versi baru
-- dideploy. Kalau terbalik, setiap penolakan mencoba INSERT nilai outcome yang
-- belum diizinkan, PostgREST membalas 400, recordWebhookEvent menelannya
-- (memang sengaja tidak melempar) — dan penolakannya tetap tidak tercatat.
-- Persis kebutaan yang sedang ditutup.
-- ============================================================================

ALTER TABLE public.doku_webhook_events
  DROP CONSTRAINT IF EXISTS doku_webhook_events_outcome_check;

ALTER TABLE public.doku_webhook_events
  ADD CONSTRAINT doku_webhook_events_outcome_check CHECK (outcome IN (
    -- ── sudah ada sejak sql/54 ──────────────────────────────────────────────
    'ok',                   -- semua tulis terverifikasi          → 200
    'write_failed',         -- ada tulis gagal / 0 baris berubah  → 500 (retry), 200 setelah 5x
    'amount_mismatch',      -- STEP 0 menolak                     → 200
    'no_submission_found',  -- invoice tak dikenal                → 200 (retry tidak menolong)
    'forwarded_jm',         -- invoice JM-* diteruskan            → 200
    'payout',               -- notifikasi payout                  → 200
    -- ── baru di sql/77: request yang tidak pernah sampai ke fase tulis ──────
    'rejected_auth',        -- ditolak di gerbang autentikasi     → 401
    'rejected_payload',     -- lolos auth, badannya tak terbaca   → 400
    'handler_crashed'       -- error tak terduga di handler       → 500 (retry)
  ));

COMMENT ON COLUMN public.doku_webhook_events.outcome IS
  'Nasib satu notifikasi DOKU. ok/write_failed/amount_mismatch/no_submission_found/'
  'forwarded_jm/payout = request sudah lolos autentikasi. rejected_auth/'
  'rejected_payload/handler_crashed (sql/77) = ditolak sebelum fase tulis; '
  'ADA-nya baris ini berarti DOKU menelepon dan kita yang menolak — bedakan dari '
  'TIDAK ADA baris sama sekali, yang berarti DOKU tidak pernah menelepon.';

-- ============================================================================
-- Verifikasi (jalankan setelah ALTER):
--
-- 1. Constraint menerima nilai baru:
--      insert into public.doku_webhook_events (outcome, http_status, error_message)
--      values ('rejected_auth', 401, 'uji constraint sql/77') returning id;
--      -- lalu: delete from public.doku_webhook_events where error_message = 'uji constraint sql/77';
--
-- 2. Dan MASIH menolak yang ngawur:
--      insert into public.doku_webhook_events (outcome, http_status) values ('ngawur', 200);
--      -- harapan: ERROR doku_webhook_events_outcome_check
--
-- 3. Sesudah webhook.js dideploy, pantau penolakan yang belum diselesaikan:
--      select received_at, invoice_number, outcome, http_status, error_message
--      from public.doku_webhook_events
--      where outcome in ('rejected_auth','rejected_payload','handler_crashed')
--        and resolved_at is null
--      order by received_at desc;
-- ============================================================================
