-- ============================================================================
-- OPS (sekali jalan): Pindahkan order 1b21bfec ke Kamis 19 Nov, pakai tagihan
-- tempo pertama (Rp 2.053.500), hapus jadwal #2 TTE4CVA7 & #3 ZDSN633Z
-- Tanggal: 2026-11-16
--
-- KONTEKS
-- Order 1b21bfec-2b6f-437e-aafc-6d7e83d5dfee ("Riset Psikologi Ideologi —
-- Bagian 2: Kuesioner", Edward Theodorus). 13 Nov admin menayangkannya sebelum
-- lunas ("Tayangkan Dulu", catatan "CC error") dengan tagihan tempo
-- JFU-INV-1b21bf-1794557540747 Rp 2.053.500 untuk Sen 16 → Kam 19 Nov.
-- 16 Nov peneliti minta pindah ke Kamis. Kartu jadwal kredit SENGAJA tidak
-- punya "Ganti Tanggal" (scheduleCardActions.ts, case airing_on_credit:
-- memindah tanggal membuat tagihan temponya basi). Jalur UI = hentikan lalu
-- pesan baru — dan pesanan baru lahir sebagai PERPANJANGAN (winner_count 0),
-- jadi baris reward 5 × Rp 100.000 (+ PPN = Rp 555.000) hilang:
--
--   #  booking   ad_schedules.id                        jendela (WIB)        status             harga
--   1  5FQ9W6SZ  37881551-a1ef-4423-bb24-59664da76fe1   Sen 16 → Kam 19 Nov  cancelled (admin)  2.053.500
--   2  TTE4CVA7  31c117cb-09fe-4663-a5e0-b91d8905564d   Kam 19 → Min 22 Nov  cancelled (admin)  1.498.500
--   3  ZDSN633Z  b985efcf-dfde-4e20-9891-b94365af5656   Kam 19 → Min 22 Nov  waiting_payment    0
--
-- YANG DILAKUKAN (satu transaksi)
--   1. Hapus tagihan tempo #2 JFU-INV-1b21bf-1794799807170 (1 transaksi +
--      1 invoice, expired; Cancel Order DOKU-nya tidak meninggalkan catatan
--      gagal). Duluan, karena FK schedule_id-nya ON DELETE SET NULL: kalau
--      jadwalnya dihapus dulu, baris tagihannya tertinggal yatim.
--   2. Hapus jadwal #2 & #3 (label form_submissions_extend; tidak ada trigger
--      DELETE di ad_schedules). WAJIB sebelum langkah 3: assert_no_schedule_
--      overlap menolak memindah #1 ke 19–22 Nov selama #3 (waiting_payment)
--      masih ada.
--   3. Hidupkan & pindahkan #1 lewat form_submissions — rantai trigger yang
--      sama dengan UI: sync_ad_schedule_from_submission (ordinal 1 → Kam
--      19 Nov 15.00 → Min 22 Nov 15.00 WIB, status scheduled, cancelled_by
--      NULL, rate_locked_at = sekarang — masih periode harga perkenalan s/d
--      30 Nov), kuota harian (19/20/21 Nov terisi 2/1/0 dari 4 oleh order
--      lain per 16 Nov), dan ensure_survey_page (halaman b3b57aac dibuka ulang
--      di jendela baru). air_on_credit_at (13 Nov) TIDAK disentuh → iklan tetap
--      tayang sebelum lunas, seperti semula.
--   4. Hidupkan tagihan tempo #1 — invoice DAN transaksi → pending, dengan
--      billed_start_date = tanggal mulai baru. Dua-duanya wajib:
--      payment_status_rank menilai expired (2) di atas pending (1), jadi
--      transaksi yang tertinggal expired menutupi invoice-nya di
--      schedule_billing; dan billed_start_date yang tidak ikut pindah membuat
--      is_stale = true sehingga /bayar/ menolak tagihannya.
--
-- YANG TIDAK DISENTUH
--   · Harga order (subtotal 1.850.000, PPN 203.500, total 2.053.500), voucher
--     JFUEDO, reward 5 × 100.000 — persis tagihan pertama.
--   · expires_at tagihan tempo (20 Nov 15.12 WIB): link DOKU yang SAMA dengan
--     yang diterima peneliti 13 Nov tetap dipakai — Cancel Order-nya ditolak
--     DOKU ("FAILED CANCEL ORDER REQUEST"), jadi link itu masih hidup.
--     Sesudah 20 Nov 15.12 WIB, /bayar/ memperbaruinya otomatis
--     (tempo_renewable). Kalau peneliti melapor link mati sebelum itu:
--       UPDATE public.invoices SET expires_at = now() AT TIME ZONE 'UTC'
--        WHERE payment_id = 'JFU-INV-1b21bf-1794557540747' AND status = 'pending';
--     lalu buka /bayar/ → link baru terbit.
--   · Dua tagihan mati lama #1 (checkout 12 Nov, tagihan manual 13 Nov) —
--     riwayat.
--   · TIDAK ada email otomatis. Kabari peneliti manual; link bayar:
--     https://submit.jakpatforuniv.com/bayar/37881551-a1ef-4423-bb24-59664da76fe1
--
-- CARA MENJALANKAN (SQL Editor Supabase, JANGAN lewat MCP)
-- Blok dijalankan SATU PER SATU — sorot bloknya, lalu Run.
--   1. DRY-RUN  → cocokkan dengan "Harapan" di bawah tiap kueri.
--   2. UJI      → DO-block yang SENGAJA gagal di akhir. Pesan errornya
--                 "UJI LULUS …" = semua langkah berhasil lalu dibatalkan
--                 otomatis. Pesan lain = berhenti, kirim pesannya.
--   3. APPLY    → BEGIN … COMMIT (sorot semuanya sekaligus). Kalau ada error,
--                 jalankan `ROLLBACK;`.
--   4. VERIFY
--   5. ROLLBACK → hanya kalau perlu, SEBELUM Kam 19 Nov 15.00 WIB dan selama
--                 tagihan tempo belum dibayar/diperbarui.
-- ============================================================================


-- ============================================================================
-- 1. DRY-RUN
-- ============================================================================
SELECT a.ordinal, a.booking_id, a.source_table, a.status, a.payment_status,
       a.slot_booked_by, a.cancelled_by,
       a.air_on_credit_at IS NOT NULL                                        AS kredit,
       to_char(a.start_date AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI') AS mulai_wib,
       to_char(a.end_date   AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI') AS selesai_wib,
       a.total_cost
  FROM public.ad_schedules a
 WHERE a.submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee'
 ORDER BY a.ordinal;
-- Harapan: 3 baris —
--   1 | 5FQ9W6SZ | form_submissions        | cancelled       | expired | NULL  | admin | true  | Mon 16 Nov 15:00 | Thu 19 Nov 15:00 | 2053500
--   2 | TTE4CVA7 | form_submissions_extend | cancelled       | pending | NULL  | admin | true  | Thu 19 Nov 15:00 | Sun 22 Nov 15:00 | 1498500
--   3 | ZDSN633Z | form_submissions_extend | waiting_payment | pending | admin | NULL  | false | Thu 19 Nov 15:00 | Sun 22 Nov 15:00 | 0

SELECT fs.submission_status, fs.payment_status, fs.start_date, fs.end_date,
       fs.duration, fs.slot_booked_by, fs.subtotal, fs.ppn_amount,
       fs.total_cost, fs.voucher_code, fs.winner_count, fs.prize_per_winner
  FROM public.form_submissions fs
 WHERE fs.id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
-- Harapan: slot_cancelled | expired | 2026-11-16 | 2026-11-19 | 3 | NULL |
--          1850000 | 203500 | 2053500 | JFUEDO | 5 | 100000

SELECT 'invoice' AS sumber, i.payment_id, i.schedule_id, i.status, i.is_tempo,
       i.amount, i.billed_start_date
  FROM public.invoices i
 WHERE i.form_submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee'
UNION ALL
SELECT 'transaksi', t.payment_id, t.schedule_id, t.status, NULL,
       t.amount, t.billed_start_date
  FROM public.transactions t
 WHERE t.form_submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee'
 ORDER BY 2, 1;
-- Harapan: 8 baris, TIDAK ada paid/completed —
--   JFU-1b21bfec-1794468186359    invoice cancelled / transaksi expired (checkout 12 Nov)
--   JFU-INV-1b21bf-1794557510919  invoice cancelled / transaksi expired (manual 13 Nov)
--   JFU-INV-1b21bf-1794557540747  invoice expired is_tempo / transaksi expired,
--                                 2053500, 37881551…, 2026-11-16 08:00+00  ← DIHIDUPKAN
--   JFU-INV-1b21bf-1794799807170  invoice expired is_tempo / transaksi expired,
--                                 1498500, 31c117cb…, 2026-11-19 08:00+00  ← DIHAPUS

SELECT count(*) AS notifikasi_doku
  FROM public.doku_webhook_events
 WHERE invoice_number LIKE 'JFU-%1b21bf%';
-- Harapan: 0

SELECT sp.id, sp.is_published,
       to_char(sp.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS terbit_wib,
       to_char(sp.publish_end_date   AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS tutup_wib,
       sp.auto_closed_at IS NOT NULL AS ditutup_sistem
  FROM public.survey_pages sp
 WHERE sp.submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
-- Harapan: 1 baris b3b57aac-… | true | 16 Nov 15:00 | 16 Nov 10:29 | true


-- ============================================================================
-- 2. UJI (otomatis dibatalkan — tidak ada yang tersimpan)
-- ============================================================================
DO $$
DECLARE
  c_order  CONSTANT uuid        := '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
  c_s1     CONSTANT uuid        := '37881551-a1ef-4423-bb24-59664da76fe1';  -- #1 5FQ9W6SZ
  c_s2     CONSTANT uuid        := '31c117cb-09fe-4663-a5e0-b91d8905564d';  -- #2 TTE4CVA7
  c_s3     CONSTANT uuid        := 'b985efcf-dfde-4e20-9891-b94365af5656';  -- #3 ZDSN633Z
  c_ext2   CONSTANT uuid        := 'ab16f155-5d1d-4467-906c-50aec5555171';  -- source_id #2
  c_ext3   CONSTANT uuid        := '40ecc566-0a93-4637-8c09-a39dd0b4ac26';  -- source_id #3
  c_tempo  CONSTANT text        := 'JFU-INV-1b21bf-1794557540747';          -- tempo #1, dihidupkan
  c_bill2  CONSTANT text        := 'JFU-INV-1b21bf-1794799807170';          -- tempo #2, dihapus
  c_start  CONSTANT timestamptz := '2026-11-19 08:00:00+00';                -- Kam 19 Nov 15.00 WIB
  c_end    CONSTANT timestamptz := '2026-11-22 08:00:00+00';                -- Min 22 Nov 15.00 WIB
  n int;
  s record;
  p record;
  b record;
  u record;
BEGIN
  -- ── 0. Pagar ──────────────────────────────────────────────────────────────
  IF now() >= c_start THEN
    RAISE EXCEPTION 'Sudah lewat Kam 19 Nov 15.00 WIB — jangan dijalankan; tanggalnya perlu diputuskan ulang.';
  END IF;

  PERFORM 1 FROM public.form_submissions fs
   WHERE fs.id = c_order
     AND fs.submission_status = 'slot_cancelled'
     AND fs.payment_status    = 'expired'
     AND fs.start_date        = DATE '2026-11-16'
     AND fs.total_cost        = 2053500
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order 1b21bfec tidak lagi seperti 16 Nov (slot_cancelled/expired/16 Nov/2053500) — berhenti, cek ulang.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices     WHERE form_submission_id = c_order AND status IN ('paid', 'completed'))
  OR EXISTS (SELECT 1 FROM public.transactions WHERE form_submission_id = c_order AND status IN ('paid', 'completed')) THEN
    RAISE EXCEPTION 'Ada tagihan LUNAS di order ini — berhenti.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.doku_webhook_events WHERE invoice_number IN (c_tempo, c_bill2)) THEN
    RAISE EXCEPTION 'Ada notifikasi DOKU untuk % / % — berhenti, cek pembayarannya dulu.', c_tempo, c_bill2;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices     WHERE schedule_id = c_s3)
  OR EXISTS (SELECT 1 FROM public.transactions WHERE schedule_id = c_s3) THEN
    RAISE EXCEPTION 'Jadwal #3 ZDSN633Z ternyata punya tagihan — berhenti.';
  END IF;

  IF (SELECT count(*) FROM public.invoices     WHERE schedule_id = c_s2) <> 1
  OR (SELECT count(*) FROM public.transactions WHERE schedule_id = c_s2) <> 1 THEN
    RAISE EXCEPTION 'Tagihan jadwal #2 bukan tepat 1 invoice + 1 transaksi — berhenti.';
  END IF;

  IF (SELECT count(*) FROM public.invoices
       WHERE payment_id = c_tempo AND schedule_id = c_s1 AND is_tempo
         AND status = 'expired' AND amount = 2053500) <> 1
  OR (SELECT count(*) FROM public.transactions
       WHERE payment_id = c_tempo AND schedule_id = c_s1
         AND status = 'expired' AND amount = 2053500) <> 1 THEN
    RAISE EXCEPTION 'Tagihan tempo % bukan lagi 1 invoice + 1 transaksi expired Rp 2.053.500 — berhenti.', c_tempo;
  END IF;

  -- ── 1. Hapus tagihan #2 (transaksi dulu, lalu invoice) ────────────────────
  DELETE FROM public.transactions
   WHERE payment_id = c_bill2 AND schedule_id = c_s2
     AND status NOT IN ('paid', 'completed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 1: transaksi #2 terhapus % baris, harus 1.', n; END IF;

  DELETE FROM public.invoices
   WHERE payment_id = c_bill2 AND schedule_id = c_s2
     AND status NOT IN ('paid', 'completed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 1: invoice #2 terhapus % baris, harus 1.', n; END IF;

  -- ── 2. Hapus jadwal #2 & #3 ───────────────────────────────────────────────
  DELETE FROM public.ad_schedules
   WHERE id IN (c_s2, c_s3)
     AND submission_id = c_order
     AND source_table  = 'form_submissions_extend'
     AND coalesce(payment_status, '') NOT IN ('paid', 'completed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'Langkah 2: jadwal terhapus % baris, harus 2.', n; END IF;

  -- ── 3. Hidupkan & pindahkan #1 (trigger menyalin ke ordinal 1 + halaman) ──
  UPDATE public.form_submissions
     SET start_date        = DATE '2026-11-19',
         end_date          = DATE '2026-11-22',
         submission_status = 'scheduled',
         payment_status    = 'pending',
         slot_booked_by    = 'admin'
   WHERE id = c_order
     AND submission_status = 'slot_cancelled';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 3: order terubah % baris, harus 1.', n; END IF;

  -- ── 4. Hidupkan tagihan tempo #1 — invoice DAN transaksi ──────────────────
  UPDATE public.invoices
     SET status            = 'pending',
         billed_start_date = (SELECT a.start_date FROM public.ad_schedules a WHERE a.id = c_s1)
   WHERE payment_id = c_tempo AND schedule_id = c_s1 AND is_tempo AND status = 'expired';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 4: invoice tempo terubah % baris, harus 1.', n; END IF;

  UPDATE public.transactions
     SET status            = 'pending',
         billed_start_date = (SELECT a.start_date FROM public.ad_schedules a WHERE a.id = c_s1)
   WHERE payment_id = c_tempo AND schedule_id = c_s1 AND status = 'expired';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 4: transaksi tempo terubah % baris, harus 1.', n; END IF;

  -- ── 5. Asersi (`IS NOT TRUE` = NULL ikut gagal, tidak lolos diam-diam) ────
  IF (SELECT count(*) FROM public.ad_schedules WHERE submission_id = c_order) <> 1 THEN
    RAISE EXCEPTION 'Asersi: order harus tinggal 1 jadwal.';
  END IF;

  SELECT * INTO s FROM public.ad_schedules WHERE id = c_s1;
  IF (s.ordinal = 1 AND s.booking_id = '5FQ9W6SZ'
      AND s.status = 'scheduled' AND s.payment_status = 'pending'
      AND s.start_date = c_start AND s.end_date = c_end AND s.duration = 3
      AND s.slot_booked_by = 'admin' AND s.cancelled_by IS NULL
      AND s.air_on_credit_at IS NOT NULL
      AND s.total_cost = 2053500 AND s.subtotal = 1850000 AND s.ppn_amount = 203500
      AND s.voucher_code = 'JFUEDO' AND s.winner_count = 5 AND s.prize_per_winner = 100000
     ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi jadwal #1 gagal: status=% bayar=% mulai=% selesai=% slot=% batal_oleh=% kredit=% total=%',
      s.status, s.payment_status, s.start_date, s.end_date, s.slot_booked_by,
      s.cancelled_by, s.air_on_credit_at IS NOT NULL, s.total_cost;
  END IF;

  SELECT * INTO p FROM public.survey_pages WHERE submission_id = c_order;
  IF (p.is_published AND p.publish_start_date = c_start AND p.publish_end_date = c_end
      AND p.auto_closed_at IS NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi halaman gagal: terbit=% mulai=% selesai=% auto_closed=%',
      p.is_published, p.publish_start_date, p.publish_end_date, p.auto_closed_at;
  END IF;

  SELECT * INTO b FROM public.schedule_billing(c_s1) x WHERE x.payment_id = c_tempo;
  IF (b.status = 'pending' AND b.amount = 2053500 AND b.billed_start_date = c_start
      AND NOT b.is_stale AND NOT b.is_expired AND NOT b.is_superseded) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi schedule_billing gagal: status=% amount=% ditagih=% stale=% expired=% superseded=%',
      b.status, b.amount, b.billed_start_date, b.is_stale, b.is_expired, b.is_superseded;
  END IF;

  SELECT * INTO u FROM public.authoritative_payment_url(c_s1);
  IF (u.reason = 'live' AND u.payment_id = c_tempo AND u.payment_url IS NOT NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi /bayar/ gagal: reason=% payment_id=%', u.reason, u.payment_id;
  END IF;

  IF (SELECT count(*) FROM public.invoices
       WHERE form_submission_id = c_order AND status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'Asersi: order harus punya tepat 1 invoice pending (tempo #1).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices
              WHERE payment_id = c_bill2 OR extend_id IN (c_ext2, c_ext3))
  OR EXISTS (SELECT 1 FROM public.transactions
              WHERE payment_id = c_bill2 OR extend_id IN (c_ext2, c_ext3)) THEN
    RAISE EXCEPTION 'Asersi: masih ada tagihan milik jadwal #2/#3.';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (sengaja dibatalkan): 5FQ9W6SZ % → % WIB %/%, halaman % → % WIB, /bayar/ % % Rp %, jadwal tersisa 1',
    to_char(s.start_date AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI'),
    to_char(s.end_date   AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI'),
    s.status, s.payment_status,
    to_char(p.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI'),
    to_char(p.publish_end_date   AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI'),
    u.reason, u.payment_id, b.amount;
END $$;
-- Harapan: ERROR "UJI LULUS (sengaja dibatalkan): 5FQ9W6SZ Thu 19 Nov 15:00 →
-- Sun 22 Nov 15:00 WIB scheduled/pending, halaman 19 Nov 15:00 → 22 Nov 15:00
-- WIB, /bayar/ live JFU-INV-1b21bf-1794557540747 Rp 2053500, jadwal tersisa 1".


-- ============================================================================
-- 3. APPLY (sorot dari BEGIN sampai COMMIT, lalu Run)
-- ============================================================================
BEGIN;

-- Snapshot ke skema backup (memori backup-schema-snapshot-rule): CTAS tidak
-- mewarisi RLS, jadi hak akses dicabut dan RLS dinyalakan manual.
CREATE TABLE IF NOT EXISTS backup.ops_5fq9w6sz_fs_20261116 AS
  SELECT * FROM public.form_submissions WHERE id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
CREATE TABLE IF NOT EXISTS backup.ops_5fq9w6sz_sched_20261116 AS
  SELECT * FROM public.ad_schedules WHERE submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
CREATE TABLE IF NOT EXISTS backup.ops_5fq9w6sz_inv_20261116 AS
  SELECT * FROM public.invoices WHERE form_submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
CREATE TABLE IF NOT EXISTS backup.ops_5fq9w6sz_txn_20261116 AS
  SELECT * FROM public.transactions WHERE form_submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
CREATE TABLE IF NOT EXISTS backup.ops_5fq9w6sz_page_20261116 AS
  SELECT * FROM public.survey_pages WHERE submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
REVOKE ALL ON backup.ops_5fq9w6sz_fs_20261116,  backup.ops_5fq9w6sz_sched_20261116,
              backup.ops_5fq9w6sz_inv_20261116, backup.ops_5fq9w6sz_txn_20261116,
              backup.ops_5fq9w6sz_page_20261116
  FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.ops_5fq9w6sz_fs_20261116    ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_5fq9w6sz_sched_20261116 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_5fq9w6sz_inv_20261116   ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_5fq9w6sz_txn_20261116   ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_5fq9w6sz_page_20261116  ENABLE ROW LEVEL SECURITY;

-- Badan yang SAMA dengan blok UJI; bedanya hanya baris terakhir (NOTICE).
DO $$
DECLARE
  c_order  CONSTANT uuid        := '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
  c_s1     CONSTANT uuid        := '37881551-a1ef-4423-bb24-59664da76fe1';  -- #1 5FQ9W6SZ
  c_s2     CONSTANT uuid        := '31c117cb-09fe-4663-a5e0-b91d8905564d';  -- #2 TTE4CVA7
  c_s3     CONSTANT uuid        := 'b985efcf-dfde-4e20-9891-b94365af5656';  -- #3 ZDSN633Z
  c_ext2   CONSTANT uuid        := 'ab16f155-5d1d-4467-906c-50aec5555171';  -- source_id #2
  c_ext3   CONSTANT uuid        := '40ecc566-0a93-4637-8c09-a39dd0b4ac26';  -- source_id #3
  c_tempo  CONSTANT text        := 'JFU-INV-1b21bf-1794557540747';          -- tempo #1, dihidupkan
  c_bill2  CONSTANT text        := 'JFU-INV-1b21bf-1794799807170';          -- tempo #2, dihapus
  c_start  CONSTANT timestamptz := '2026-11-19 08:00:00+00';                -- Kam 19 Nov 15.00 WIB
  c_end    CONSTANT timestamptz := '2026-11-22 08:00:00+00';                -- Min 22 Nov 15.00 WIB
  n int;
  s record;
  p record;
  b record;
  u record;
BEGIN
  -- ── 0. Pagar ──────────────────────────────────────────────────────────────
  IF now() >= c_start THEN
    RAISE EXCEPTION 'Sudah lewat Kam 19 Nov 15.00 WIB — jangan dijalankan; tanggalnya perlu diputuskan ulang.';
  END IF;

  PERFORM 1 FROM public.form_submissions fs
   WHERE fs.id = c_order
     AND fs.submission_status = 'slot_cancelled'
     AND fs.payment_status    = 'expired'
     AND fs.start_date        = DATE '2026-11-16'
     AND fs.total_cost        = 2053500
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order 1b21bfec tidak lagi seperti 16 Nov (slot_cancelled/expired/16 Nov/2053500) — berhenti, cek ulang.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices     WHERE form_submission_id = c_order AND status IN ('paid', 'completed'))
  OR EXISTS (SELECT 1 FROM public.transactions WHERE form_submission_id = c_order AND status IN ('paid', 'completed')) THEN
    RAISE EXCEPTION 'Ada tagihan LUNAS di order ini — berhenti.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.doku_webhook_events WHERE invoice_number IN (c_tempo, c_bill2)) THEN
    RAISE EXCEPTION 'Ada notifikasi DOKU untuk % / % — berhenti, cek pembayarannya dulu.', c_tempo, c_bill2;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices     WHERE schedule_id = c_s3)
  OR EXISTS (SELECT 1 FROM public.transactions WHERE schedule_id = c_s3) THEN
    RAISE EXCEPTION 'Jadwal #3 ZDSN633Z ternyata punya tagihan — berhenti.';
  END IF;

  IF (SELECT count(*) FROM public.invoices     WHERE schedule_id = c_s2) <> 1
  OR (SELECT count(*) FROM public.transactions WHERE schedule_id = c_s2) <> 1 THEN
    RAISE EXCEPTION 'Tagihan jadwal #2 bukan tepat 1 invoice + 1 transaksi — berhenti.';
  END IF;

  IF (SELECT count(*) FROM public.invoices
       WHERE payment_id = c_tempo AND schedule_id = c_s1 AND is_tempo
         AND status = 'expired' AND amount = 2053500) <> 1
  OR (SELECT count(*) FROM public.transactions
       WHERE payment_id = c_tempo AND schedule_id = c_s1
         AND status = 'expired' AND amount = 2053500) <> 1 THEN
    RAISE EXCEPTION 'Tagihan tempo % bukan lagi 1 invoice + 1 transaksi expired Rp 2.053.500 — berhenti.', c_tempo;
  END IF;

  -- ── 1. Hapus tagihan #2 (transaksi dulu, lalu invoice) ────────────────────
  DELETE FROM public.transactions
   WHERE payment_id = c_bill2 AND schedule_id = c_s2
     AND status NOT IN ('paid', 'completed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 1: transaksi #2 terhapus % baris, harus 1.', n; END IF;

  DELETE FROM public.invoices
   WHERE payment_id = c_bill2 AND schedule_id = c_s2
     AND status NOT IN ('paid', 'completed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 1: invoice #2 terhapus % baris, harus 1.', n; END IF;

  -- ── 2. Hapus jadwal #2 & #3 ───────────────────────────────────────────────
  DELETE FROM public.ad_schedules
   WHERE id IN (c_s2, c_s3)
     AND submission_id = c_order
     AND source_table  = 'form_submissions_extend'
     AND coalesce(payment_status, '') NOT IN ('paid', 'completed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'Langkah 2: jadwal terhapus % baris, harus 2.', n; END IF;

  -- ── 3. Hidupkan & pindahkan #1 (trigger menyalin ke ordinal 1 + halaman) ──
  UPDATE public.form_submissions
     SET start_date        = DATE '2026-11-19',
         end_date          = DATE '2026-11-22',
         submission_status = 'scheduled',
         payment_status    = 'pending',
         slot_booked_by    = 'admin'
   WHERE id = c_order
     AND submission_status = 'slot_cancelled';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 3: order terubah % baris, harus 1.', n; END IF;

  -- ── 4. Hidupkan tagihan tempo #1 — invoice DAN transaksi ──────────────────
  UPDATE public.invoices
     SET status            = 'pending',
         billed_start_date = (SELECT a.start_date FROM public.ad_schedules a WHERE a.id = c_s1)
   WHERE payment_id = c_tempo AND schedule_id = c_s1 AND is_tempo AND status = 'expired';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 4: invoice tempo terubah % baris, harus 1.', n; END IF;

  UPDATE public.transactions
     SET status            = 'pending',
         billed_start_date = (SELECT a.start_date FROM public.ad_schedules a WHERE a.id = c_s1)
   WHERE payment_id = c_tempo AND schedule_id = c_s1 AND status = 'expired';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Langkah 4: transaksi tempo terubah % baris, harus 1.', n; END IF;

  -- ── 5. Asersi (`IS NOT TRUE` = NULL ikut gagal, tidak lolos diam-diam) ────
  IF (SELECT count(*) FROM public.ad_schedules WHERE submission_id = c_order) <> 1 THEN
    RAISE EXCEPTION 'Asersi: order harus tinggal 1 jadwal.';
  END IF;

  SELECT * INTO s FROM public.ad_schedules WHERE id = c_s1;
  IF (s.ordinal = 1 AND s.booking_id = '5FQ9W6SZ'
      AND s.status = 'scheduled' AND s.payment_status = 'pending'
      AND s.start_date = c_start AND s.end_date = c_end AND s.duration = 3
      AND s.slot_booked_by = 'admin' AND s.cancelled_by IS NULL
      AND s.air_on_credit_at IS NOT NULL
      AND s.total_cost = 2053500 AND s.subtotal = 1850000 AND s.ppn_amount = 203500
      AND s.voucher_code = 'JFUEDO' AND s.winner_count = 5 AND s.prize_per_winner = 100000
     ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi jadwal #1 gagal: status=% bayar=% mulai=% selesai=% slot=% batal_oleh=% kredit=% total=%',
      s.status, s.payment_status, s.start_date, s.end_date, s.slot_booked_by,
      s.cancelled_by, s.air_on_credit_at IS NOT NULL, s.total_cost;
  END IF;

  SELECT * INTO p FROM public.survey_pages WHERE submission_id = c_order;
  IF (p.is_published AND p.publish_start_date = c_start AND p.publish_end_date = c_end
      AND p.auto_closed_at IS NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi halaman gagal: terbit=% mulai=% selesai=% auto_closed=%',
      p.is_published, p.publish_start_date, p.publish_end_date, p.auto_closed_at;
  END IF;

  SELECT * INTO b FROM public.schedule_billing(c_s1) x WHERE x.payment_id = c_tempo;
  IF (b.status = 'pending' AND b.amount = 2053500 AND b.billed_start_date = c_start
      AND NOT b.is_stale AND NOT b.is_expired AND NOT b.is_superseded) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi schedule_billing gagal: status=% amount=% ditagih=% stale=% expired=% superseded=%',
      b.status, b.amount, b.billed_start_date, b.is_stale, b.is_expired, b.is_superseded;
  END IF;

  SELECT * INTO u FROM public.authoritative_payment_url(c_s1);
  IF (u.reason = 'live' AND u.payment_id = c_tempo AND u.payment_url IS NOT NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi /bayar/ gagal: reason=% payment_id=%', u.reason, u.payment_id;
  END IF;

  IF (SELECT count(*) FROM public.invoices
       WHERE form_submission_id = c_order AND status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'Asersi: order harus punya tepat 1 invoice pending (tempo #1).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices
              WHERE payment_id = c_bill2 OR extend_id IN (c_ext2, c_ext3))
  OR EXISTS (SELECT 1 FROM public.transactions
              WHERE payment_id = c_bill2 OR extend_id IN (c_ext2, c_ext3)) THEN
    RAISE EXCEPTION 'Asersi: masih ada tagihan milik jadwal #2/#3.';
  END IF;

  RAISE NOTICE 'OK: 5FQ9W6SZ % → % WIB %/%, /bayar/ % % Rp %; #2 TTE4CVA7 & #3 ZDSN633Z terhapus.',
    to_char(s.start_date AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI'),
    to_char(s.end_date   AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI'),
    s.status, s.payment_status, u.reason, u.payment_id, b.amount;
END $$;

COMMIT;


-- ============================================================================
-- 4. VERIFY
-- ============================================================================
SELECT a.ordinal, a.booking_id, a.status, a.payment_status, a.slot_booked_by,
       a.cancelled_by, a.air_on_credit_at IS NOT NULL                        AS kredit,
       to_char(a.start_date AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI') AS mulai_wib,
       to_char(a.end_date   AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI') AS selesai_wib,
       a.total_cost, a.voucher_code, a.winner_count, a.prize_per_winner
  FROM public.ad_schedules a
 WHERE a.submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee'
 ORDER BY a.ordinal;
-- Harapan: 1 baris — 1 | 5FQ9W6SZ | scheduled | pending | admin | NULL | true |
--          Thu 19 Nov 15:00 | Sun 22 Nov 15:00 | 2053500 | JFUEDO | 5 | 100000

SELECT sp.is_published,
       to_char(sp.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS terbit_wib,
       to_char(sp.publish_end_date   AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS tutup_wib,
       sp.auto_closed_at
  FROM public.survey_pages sp
 WHERE sp.submission_id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee';
-- Harapan: true | 19 Nov 15:00 | 22 Nov 15:00 | NULL

SELECT payment_id, amount, status, is_stale, is_expired, is_superseded,
       to_char(billed_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS ditagih_untuk_wib
  FROM public.schedule_billing('37881551-a1ef-4423-bb24-59664da76fe1');
-- Harapan: 3 baris. JFU-INV-1b21bf-1794557540747 | 2053500 | pending | false |
--          false | false | 19 Nov 15:00. Dua lainnya (checkout 12 Nov & manual
--          13 Nov) cancelled + is_stale true — riwayat, tidak bisa dibayar.

SELECT reason, payment_id, payment_url IS NOT NULL AS ada_link
  FROM public.authoritative_payment_url('37881551-a1ef-4423-bb24-59664da76fe1');
-- Harapan: live | JFU-INV-1b21bf-1794557540747 | true


-- ============================================================================
-- 5. ROLLBACK (hanya kalau perlu — SEBELUM Kam 19 Nov 15.00 WIB, dan selama
--    tagihan tempo belum dibayar/diperbarui; R2 menjawab UPDATE 0 = BERHENTI)
-- ============================================================================
-- Hapus awalan `-- ` lalu jalankan sebagai satu blok.
--
-- BEGIN;
-- -- R1. #1 kembali batal di 16–19 Nov. Trigger: ordinal 1 → cancelled,
-- --     cancelled_by 'admin', rate_locked_at NULL; trg_close_survey_page
-- --     menutup jendela halaman (lalu R1b mengembalikan nilainya persis).
-- UPDATE public.form_submissions
--    SET start_date = DATE '2026-11-16', end_date = DATE '2026-11-19',
--        submission_status = 'slot_cancelled', payment_status = 'expired',
--        slot_booked_by = NULL
--  WHERE id = '1b21bfec-2b6f-437e-aafc-6d7e83d5dfee'
--    AND submission_status = 'scheduled' AND payment_status = 'pending';
-- -- Harapan: UPDATE 1
-- -- R1b. Jendela halaman persis seperti sebelum APPLY.
-- UPDATE public.survey_pages sp
--    SET publish_start_date = b.publish_start_date,
--        publish_end_date   = b.publish_end_date,
--        auto_closed_at     = b.auto_closed_at
--   FROM backup.ops_5fq9w6sz_page_20261116 b
--  WHERE sp.id = b.id;
-- -- Harapan: UPDATE 1
-- -- R2. Tagihan tempo #1 kembali expired, ditagih untuk 16 Nov.
-- UPDATE public.invoices i
--    SET status = b.status, billed_start_date = b.billed_start_date
--   FROM backup.ops_5fq9w6sz_inv_20261116 b
--  WHERE i.id = b.id
--    AND i.payment_id = 'JFU-INV-1b21bf-1794557540747' AND i.status = 'pending';
-- -- Harapan: UPDATE 1 (UPDATE 0 = sudah dibayar/diperbarui → ROLLBACK; dan tanya dulu)
-- UPDATE public.transactions t
--    SET status = b.status, billed_start_date = b.billed_start_date
--   FROM backup.ops_5fq9w6sz_txn_20261116 b
--  WHERE t.id = b.id
--    AND t.payment_id = 'JFU-INV-1b21bf-1794557540747' AND t.status = 'pending';
-- -- Harapan: UPDATE 1
-- -- R3. Kembalikan jadwal #2 & #3 lalu tagihan #2. booking_id ikut kembali.
-- --     Trigger INSERT menimpa tiga kolom: rate_locked_at (disetel ulang di
-- --     bawah), updated_at (= sekarang) dan cancelled_by #2 (jadi NULL —
-- --     kosmetik: penyebab batalnya tidak tampil).
-- INSERT INTO public.ad_schedules
--   SELECT * FROM backup.ops_5fq9w6sz_sched_20261116
--    WHERE id IN ('31c117cb-09fe-4663-a5e0-b91d8905564d', 'b985efcf-dfde-4e20-9891-b94365af5656');
-- -- Harapan: INSERT 0 2
-- UPDATE public.ad_schedules a
--    SET rate_locked_at = b.rate_locked_at
--   FROM backup.ops_5fq9w6sz_sched_20261116 b
--  WHERE a.id = b.id
--    AND a.id IN ('31c117cb-09fe-4663-a5e0-b91d8905564d', 'b985efcf-dfde-4e20-9891-b94365af5656');
-- -- Harapan: UPDATE 2
-- INSERT INTO public.invoices
--   SELECT * FROM backup.ops_5fq9w6sz_inv_20261116
--    WHERE payment_id = 'JFU-INV-1b21bf-1794799807170';
-- -- Harapan: INSERT 0 1
-- INSERT INTO public.transactions
--   SELECT * FROM backup.ops_5fq9w6sz_txn_20261116
--    WHERE payment_id = 'JFU-INV-1b21bf-1794799807170';
-- -- Harapan: INSERT 0 1
-- COMMIT;
