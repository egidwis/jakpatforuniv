-- ============================================================================
-- 80 — doku_webhook_events: outcome baru `paid_on_dead_bill`
-- ============================================================================
-- Order af004b84 (2026-09-02): peneliti membayar Rp 444.000 lewat link DOKU
-- milik jadwal yang sudah dibatalkan 20 menit sesudah tagihannya terbit.
-- Webhook STEP 5 mencoba menghidupkan kembali jadwal batal itu
-- (`status='scheduled'`), penjaga irisan sql/75 menolaknya (P0001), dan
-- webhook membalas HTTP 500 tiga kali berturut-turut.
--
-- Di kasus itu penjaga irisan kebetulan menangkapnya — jendela jadwal batalnya
-- bertabrakan dengan jadwal pengganti. Untuk ordinal 1 tidak ada yang akan
-- menangkap apa pun: trg_submission_no_overlap hanya menyala pada
-- `UPDATE OF start_date, end_date`. Jadwal yang sengaja dibatalkan akan hidup
-- lagi, diam-diam, hanya karena uang mendarat di link lamanya.
--
-- Sesudah migrasi ini + webhook.js yang menyertainya: uang yang mendarat di
-- tagihan MATI (`cancelled`/`expired`/`failed` — rank 2 di payment_status_rank,
-- sql/53) dicatat sebagai `paid_on_dead_bill`, NOL tulisan, HTTP 200, dan
-- kartunya muncul di antrean admin. Presedennya persis `amount_mismatch`:
-- kondisi ini tidak akan pernah sukses di-retry, jadi 500 hanya membakar
-- percobaan DOKU (batasnya 5; insiden ini sudah memakai 3).
--
-- Sifatnya MELONGGARKAN constraint (menambah nilai yang diizinkan), jadi tidak
-- ada baris lama yang bisa jadi tidak sah. Idempoten & aman diulang.
--
-- ⚠️ URUTAN DEPLOY: migrasi ini HARUS mendarat SEBELUM webhook.js versi baru
-- dideploy — peringatan yang sama dengan sql/77, dan alasannya sama. Kalau
-- terbalik, setiap penolakan mencoba INSERT nilai outcome yang belum diizinkan,
-- PostgREST membalas 400, recordWebhookEvent menelannya (memang sengaja tidak
-- melempar) — dan penolakannya tidak tercatat sama sekali. Persis kebutaan
-- yang sedang ditutup.
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
    -- ── sql/77: request yang tidak pernah sampai ke fase tulis ──────────────
    'rejected_auth',        -- ditolak di gerbang autentikasi     → 401
    'rejected_payload',     -- lolos auth, badannya tak terbaca   → 400
    'handler_crashed',      -- error tak terduga di handler       → 500 (retry)
    -- ── baru di sql/80: uang sah, tapi tagihannya sudah mati ────────────────
    'paid_on_dead_bill'     -- tagihan cancelled/expired/failed   → 200, NOL tulisan
  ));

COMMENT ON COLUMN public.doku_webhook_events.outcome IS
  'Nasib satu notifikasi DOKU. ok/write_failed/amount_mismatch/no_submission_found/'
  'forwarded_jm/payout = request sudah lolos autentikasi. rejected_auth/'
  'rejected_payload/handler_crashed (sql/77) = ditolak sebelum fase tulis; '
  'ADA-nya baris ini berarti DOKU menelepon dan kita yang menolak — bedakan dari '
  'TIDAK ADA baris sama sekali, yang berarti DOKU tidak pernah menelepon. '
  'paid_on_dead_bill (sql/80) = uangnya SAH dan sudah diterima DOKU, tapi '
  'tagihannya sudah dibatalkan/kedaluwarsa, jadi jadwalnya SENGAJA tidak '
  'disentuh dan barisnya menunggu keputusan admin.';

-- ============================================================================
-- ⚠️ paid_on_dead_bill MENUKAR KEGAGALAN BERISIK DENGAN KEGAGALAN SUNYI DI BUKU.
--
-- Nol tulisan berarti uangnya ada di DOKU sementara buku kita bilang
-- `cancelled`. Sebelum ini, uang itu setidaknya mendarat di `transactions`;
-- sesudah ini, pendapatan KURANG HITUNG sampai admin bertindak. Banner di
-- WebhookFailuresBanner berubah dari informasi menjadi penanggung beban — jadi
-- barisnya wajib membawa nominal dan payment_id, dan rekonsiliasi DOKU-vs-buku
-- harus tahu kelas selisih baru ini ada.
--
-- Antreannya:
--   select received_at, invoice_number, amount, error_message
--   from public.doku_webhook_events
--   where outcome = 'paid_on_dead_bill' and resolved_at is null
--   order by received_at desc;
-- ============================================================================

-- ============================================================================
-- Verifikasi (jalankan setelah ALTER, SEBELUM deploy webhook.js):
--
-- 1. Constraint menerima nilai baru:
--      insert into public.doku_webhook_events (outcome, http_status, error_message)
--      values ('paid_on_dead_bill', 200, 'uji constraint sql/80') returning id;
--      delete from public.doku_webhook_events where error_message = 'uji constraint sql/80';
--
-- 2. Dan MASIH menolak yang ngawur:
--      insert into public.doku_webhook_events (outcome, http_status) values ('ngawur', 200);
--      -- harapan: ERROR doku_webhook_events_outcome_check
-- ============================================================================
