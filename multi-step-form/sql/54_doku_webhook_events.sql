-- ============================================================
-- Migration 54: doku_webhook_events
--
-- Insiden 2026-08-10, invoice JFU-INV-d7a41f-1786333513279 (Rp 499.500, VA BSI).
-- DOKU mencatat notifikasi TERKIRIM & SUKSES pukul 14.03 WIB, tapi invoices,
-- transactions, dan form_submissions tidak berubah sama sekali. Order tersangkut
-- "Menunggu channel" sampai ditemukan manual berjam-jam kemudian.
--
-- Penyebabnya: seluruh tulis ke DB di functions/api/doku/webhook.js lewat `fetch`
-- mentah ke PostgREST dan TIDAK SATU PUN memeriksa `res.ok`. `fetch` tidak melempar
-- error pada HTTP 4xx/5xx, jadi blok `catch (dbError)` di sana hampir tidak pernah
-- kena — webhook bisa "berhasil" tanpa menulis apa pun, lalu balas HTTP 200. DOKU
-- melihat 200, tidak pernah retry, dan pembayaran hilang permanen tanpa jejak.
--
-- Tidak ada jaring pengaman platform: Cloudflare Workers Logs DAN Logpush keduanya
-- tidak tersedia untuk project Pages (dikonfirmasi 2026-08-10 — jakpatforuniv-submit
-- tidak punya field `observability` sama sekali). Satu-satunya cara melihat apa pun
-- adalah `wrangler pages deployment tail` SAAT kejadian berlangsung. Tabel ini
-- menggantikan peran itu dengan catatan permanen di database kita sendiri.
--
-- ------------------------------------------------------------------
-- Kenapa tabel baru, bukan kolom di invoices/transactions
-- ------------------------------------------------------------------
-- Alternatifnya (last_webhook_at / last_webhook_outcome / webhook_error /
-- webhook_fail_count di kedua tabel) ditimbang dan ditolak 2026-08-10:
--
--   1. Wadahnya justru bagian yang sedang rusak. Yang dicatat adalah "PATCH ke
--      invoices/transactions gagal". Menulis penandanya ke baris yang sama lewat
--      jalur PostgREST yang sama akan gagal karena sebab yang sama — trigger
--      menolak, RLS menolak, 0 baris cocok. Di insiden 10 Agustus ketiga baris itu
--      memang tidak tersentuh sama sekali.
--   2. outcome 'no_submission_found' tidak punya baris untuk ditulisi. Kalau invoice
--      tidak ada di kedua tabel, tidak ada tempat menempelkan kolomnya — padahal itu
--      kasus terburuk (uang diterima untuk sesuatu yang tak bisa dicocokkan). Bukan
--      skenario karangan: terukur 2026-08-10 ada 17 invoice tanpa baris transactions
--      (jalur invoice manual admin), jadi pencarian dua-tahap di STEP 1 webhook.js
--      memang bisa meleset.
--   3. Kolom-per-invoice bersifat last-write-wins → riwayat "DOKU memanggil 4x,
--      percobaan 1-3 gagal jam sekian" hilang. Riwayat itu persis pertanyaan yang
--      paling lama dijawab saat insiden.
--   4. raw_payload jsonb (~2KB, berisi PII pembeli) akan membebani tabel yang dibaca
--      tiap kali dashboard dibuka, dan menambah kolom yang harus diperhitungkan
--      trigger guard_payment_columns() (sql/33).
--
-- Tabel lain sudah dicek dan tidak ada yang cocok dipakai ulang: `payments` (0 baris)
-- milik domain bayaran kreator sisi mission, `doku_payouts` untuk pencairan bukan
-- penerimaan.
--
-- Volume: ~92 transaksi/bulan (276 dalam 90 hari, diukur 2026-08-10), jadi tabel ini
-- tumbuh ratusan baris/bulan. Belum ada cron retensi — SENGAJA, mengingat insiden
-- sql/48 (cron dijadwalkan sebelum endpointnya ada, 3 email hangus permanen).
-- Pembersihan menyusul setelah pola datanya terlihat.
--
-- SENGAJA TANPA FOREIGN KEY ke invoices/form_submissions: baris yatim (invoice yang
-- tidak kita kenal) justru yang paling wajib bisa mendarat.
--
-- Idempoten: aman dijalankan ulang (IF NOT EXISTS + DROP POLICY IF EXISTS).
-- Jalankan di Supabase SQL Editor SEBELUM men-deploy kodenya — webhook.js menulis
-- ke tabel ini, jadi ia harus ada lebih dulu.
-- ============================================================

-- ============================================
-- 1. Tabel
-- ============================================
CREATE TABLE IF NOT EXISTS public.doku_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  invoice_number  TEXT,          -- NULL kalau payload tak punya invoice sama sekali
  doku_status     TEXT,          -- apa adanya dari DOKU: SUCCESS / FAILED / EXPIRED / ...
  app_status      TEXT,          -- hasil pemetaan kita: completed / failed / pending
  payment_channel TEXT,          -- mis. VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI
  amount          NUMERIC,

  outcome         TEXT NOT NULL,
  http_status     INT  NOT NULL, -- yang benar-benar kita balas ke DOKU
  error_message   TEXT,
  raw_payload     JSONB,         -- payload DOKU utuh; artefak diagnostik paling berharga

  resolved_at     TIMESTAMPTZ,   -- NULL = masih perlu diperiksa
  resolved_by     TEXT,          -- 'auto:webhook' atau email admin

  CONSTRAINT doku_webhook_events_outcome_check CHECK (outcome IN (
    'ok',                   -- semua tulis terverifikasi          → 200
    'write_failed',         -- ada tulis gagal / 0 baris berubah  → 500 (retry), 200 setelah 5x
    'amount_mismatch',      -- STEP 0 menolak                     → 200
    'no_submission_found',  -- invoice tak dikenal                → 200 (retry tidak menolong)
    'forwarded_jm',         -- invoice JM-* diteruskan            → 200
    'payout'                -- notifikasi payout                  → 200
  ))
);

CREATE INDEX IF NOT EXISTS doku_webhook_events_invoice_idx
  ON public.doku_webhook_events (invoice_number);

CREATE INDEX IF NOT EXISTS doku_webhook_events_received_idx
  ON public.doku_webhook_events (received_at DESC);

-- Dipakai dua jalur panas: pembatas retry di webhook.js (hitung kegagalan yang
-- belum selesai untuk satu invoice) dan banner admin di TransactionsPage.
CREATE INDEX IF NOT EXISTS doku_webhook_events_open_idx
  ON public.doku_webhook_events (outcome, received_at DESC)
  WHERE resolved_at IS NULL;

-- ============================================
-- 2. RLS
-- ============================================
ALTER TABLE public.doku_webhook_events ENABLE ROW LEVEL SECURITY;

-- raw_payload memuat PII pembeli (nama, email, telepon) apa adanya dari DOKU.
-- RLS bersifat row-level, bukan column-level — jadi cabut juga grant tabelnya dari
-- anon, lapisan yang memang mengatur akses tingkat tabel. Pelajaran sql/47.
REVOKE ALL ON TABLE public.doku_webhook_events FROM anon;

-- Admin (dashboard, login sebagai product@jakpat.net) membaca semuanya — pola sama
-- dengan invoices (sql/24) dan voucher_redemptions (sql/35).
DROP POLICY IF EXISTS "Admin can view doku webhook events" ON public.doku_webhook_events;
CREATE POLICY "Admin can view doku webhook events"
  ON public.doku_webhook_events FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- Admin menandai kejadian sudah ditangani lewat tombol "Tandai selesai" di banner
-- TransactionsPage. Policy ini tidak dibatasi per kolom (Postgres tidak punya
-- WITH CHECK per kolom); sama seperti admin UPDATE di invoices sql/24. Tabel ini
-- catatan, bukan sumber kebenaran uang, jadi risikonya kecil.
DROP POLICY IF EXISTS "Admin can resolve doku webhook events" ON public.doku_webhook_events;
CREATE POLICY "Admin can resolve doku webhook events"
  ON public.doku_webhook_events FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'product@jakpat.net')
  WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- Service role (webhook) akses penuh. SENGAJA TIDAK ADA policy INSERT untuk user:
-- baris hanya ditulis server saat notifikasi DOKU masuk.
DROP POLICY IF EXISTS "Service role full access doku webhook events" ON public.doku_webhook_events;
CREATE POLICY "Service role full access doku webhook events"
  ON public.doku_webhook_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. Verifikasi (jalankan setelah menerapkan)
-- ============================================================
-- 3a. Tabel, constraint, dan 3 index ada:
--
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'doku_webhook_events';
--   -- harapan: doku_webhook_events_pkey, _invoice_idx, _received_idx, _open_idx
--
--   select conname from pg_constraint
--   where conrelid = 'public.doku_webhook_events'::regclass and contype = 'c';
--   -- harapan: doku_webhook_events_outcome_check
--
-- 3b. CHECK constraint benar-benar menolak outcome ngawur:
--
--   insert into public.doku_webhook_events (outcome, http_status) values ('ngawur', 200);
--   -- harus error 23514
--
-- 3c. anon TIDAK boleh bisa membaca apa pun (ganti $URL dan $ANON):
--
--   curl "$URL/rest/v1/doku_webhook_events?select=raw_payload&limit=1" -H "apikey: $ANON"
--   -- harus gagal / kosong, JANGAN pernah mengembalikan payload
--
-- 3d. Tiga policy terpasang (SELECT admin, UPDATE admin, ALL service_role), dan
--     `anon` TIDAK muncul sama sekali di daftar grant:
--
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'doku_webhook_events';
--
--   select grantee, string_agg(distinct privilege_type, ', ') from information_schema.table_privileges
--   where table_schema = 'public' and table_name = 'doku_webhook_events' group by grantee;
--   -- harapan: hanya authenticated / postgres / service_role. TIDAK ADA anon.
--
-- 3e. Setelah kodenya dideploy, baris pertama harus muncul pada pembayaran
--     berikutnya:
--
--   select received_at, invoice_number, outcome, http_status, error_message
--   from public.doku_webhook_events order by received_at desc limit 10;

-- ============================================================
-- 4. Rollback
-- ============================================================
-- Tabel ini murni aditif — tidak ada kode lama yang membacanya, jadi menghapusnya
-- tidak meregresi apa pun SELAMA webhook.js versi baru sudah di-rollback lebih dulu
-- (kalau tidak, tiap notifikasi akan gagal menulis audit dan ikut kehilangan alert).
--
--   drop table if exists public.doku_webhook_events;
