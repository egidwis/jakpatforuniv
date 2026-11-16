-- ============================================================================
-- OPS (sekali jalan): Hidupkan lagi Mun#07–Mun12 (Usep Suhud, UNJ) di jadwal
-- #1-nya, hapus 6 perpanjangan Rp 0, dan hidupkan tagihan tempo gabungan B
-- untuk 6 pesanan supaya /bayar/ mencetak link baru.
-- Tanggal: 2026-11-16
--
-- ⚠️ JANGAN "Run" SELURUH BERKAS SEKALIGUS. Jalankan per bagian, urut:
--    1. DRY-RUN → cocokkan dengan "Harapan"
--    2. UJI     → HARUS berakhir error "UJI LULUS (sengaja dibatalkan) …"
--                 (error itu disengaja; tidak ada yang tersimpan)
--    3. APPLY   → blok BEGIN … COMMIT; kalau ada error, jalankan ROLLBACK;
--    4. VERIFY
--    Kalau UJI dan APPLY dijalankan bersamaan, error UJI LULUS menghentikan
--    batch sebelum APPLY sempat jalan.
--
-- KONTEKS (semua jam WIB, 16 Nov)
--   12.44  tagihan tempo gabungan A JFU-INV-8c2728-1794807872125 untuk 9 order
--          (7 MUN + BET01/02), semuanya "tayang dulu" (air_on_credit_at).
--   13.11  A dibatalkan: peneliti minta MUN dan BET ditagih terpisah. Aman,
--          karena cancelInvoice tidak menyentuh jadwal.
--   13.19  terbit B JFU-INV-57caff-1794809989063 (7 MUN) dan C (BET, tidak disentuh).
--   15.00  Mun#07 tayang (email tayang terkirim, 60 responden masuk).
--   15.39–15.59  Mun11 ternyata dobel (Y9HSZVZC & PX9F4DGW). Tombol "Batalkan
--          tagihan" B sudah hilang (K8: ada anggota yang sudah tayang), jadi
--          admin membatalkan jadwal keenam MUN lalu memesan ulang. Pesan ulang
--          lahir sebagai PERPANJANGAN: Rp 0, reward 0, TANPA tayang dulu, tanpa
--          tagihan. Iklan Mun#07 berhenti, dan pesan ulangnya untuk hari ini
--          sudah lewat batas bayar 14.00.
--
--   order    jadwal #1 (dihidupkan)  perpanjangan (dihapus)  tanggal lama → baru
--   Mun#07   KH7QQM9T                SYV8KZG8                16 Nov → 16 Nov (jendela berjalan s/d 17 Nov 15.00)
--   Mun#08   PBCZQE5K                FQMJ4NS8                17 Nov → 18 Nov
--   Mun#09   GYSYXAFS                DEJA532W                18 Nov → 18 Nov
--   Mun10    Q48QAGK9                C98TGJ5B                18 Nov → 18 Nov
--   Mun11    PX9F4DGW                F7SS8YPK                20 Nov → 17 Nov
--   Mun12    DNW47C7J                CEYXEF9P                21 Nov → 18 Nov
--   (Tanggal baru = tanggal pesan ulang admin, dikonfirmasi user 16 Nov.)
--
-- YANG DILAKUKAN (satu transaksi)
--   1. Hapus 6 perpanjangan Rp 0 (tanpa tagihan). Duluan: penjaga irisan dan
--      kuota harian menolak #1 selama perpanjangannya memegang tanggal itu.
--      Kuota 16/17/18 Nov tetap 4/4/4 (sama dengan sekarang).
--   2. Hidupkan #1 lewat form_submissions (rantai trigger yang sama dengan UI):
--      jadwal ordinal 1 → scheduled, cancelled_by NULL, halaman dibuka ulang
--      di jendela barunya. air_on_credit_at (12.44) tetap → TAYANG SEBELUM
--      LUNAS seperti semula. Harga, voucher JFU-SUHUDENDYEAR, dan reward
--      5 × Rp 35.000 kembali (Rp 493.950 per order).
--   3. Hidupkan baris tagihan B milik 6 order: invoice DAN transaksi → pending,
--      billed_start_date = tanggal baru, expires_at invoice = sekarang. Link
--      DOKU B sudah mati (order_already_cancelled), jadi /bayar/ membaca
--      tempo_renewable dan mencetak link baru Rp 2.963.700 (6 × 493.950)
--      begitu salah satu link /bayar/ dibuka. Lead = Mun#07.
--
-- YANG TIDAK DISENTUH
--   · Mun11 dobel Y9HSZVZC: tetap batal, baris tagihannya tetap expired.
--   · Tagihan A (batal) dan C (BET01/02): riwayat / tetap berjalan.
--   · live_notified_at Mun#07 tetap terisi → tidak ada email "tayang" kedua.
--     Order lain dikabari cron seperti biasa saat mulai tayang.
--   · Tidak ada email tagihan otomatis. Kabari peneliti manual; link bayar
--     gabungan (lead): https://submit.jakpatforuniv.com/bayar/1ae49541-4938-4dca-b2db-82d33480be9a
--
-- PAGAR: berhenti bila sudah lewat Sel 17 Nov 15.00 WIB, bila keadaan salah
-- satu order berubah dari yang tercatat di atas, bila ada tagihan lunas, atau
-- bila ada notifikasi DOKU untuk A/B.


-- ============================================================================
-- 1. DRY-RUN (hanya SELECT)
-- ============================================================================
SELECT fs.title, a.ordinal, a.booking_id, a.source_table, a.status, a.payment_status,
       a.air_on_credit_at IS NOT NULL                                        AS kredit,
       to_char(a.start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI')   AS mulai_wib,
       a.total_cost, a.winner_count
  FROM public.ad_schedules a JOIN public.form_submissions fs ON fs.id = a.submission_id
 WHERE a.submission_id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8')
 ORDER BY fs.title, fs.created_at, a.ordinal;
-- Harapan: 13 baris. Tiap order: #1 form_submissions | cancelled | kredit true |
--          493950 | 5, lalu #2 form_submissions_extend | waiting_payment |
--          pending | kredit false | 0 | 0. Mun11 Y9HSZVZC hanya #1 (batal).

SELECT a.booking_id, i.status AS inv, t.status AS txn, i.amount,
       to_char(i.expires_at, 'DD Mon HH24:MI') AS expires_utc,
       to_char(i.billed_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon') AS ditagih
  FROM public.invoices i
  JOIN public.ad_schedules a ON a.id = i.schedule_id
  LEFT JOIN public.transactions t ON t.payment_id = i.payment_id AND t.schedule_id = i.schedule_id
 WHERE i.payment_id = 'JFU-INV-57caff-1794809989063'
 ORDER BY a.booking_id;
-- Harapan: 7 baris Rp 493.950. KH7QQM9T pending/pending; 6 lainnya expired/expired.

SELECT count(*) AS notifikasi_doku FROM public.doku_webhook_events
 WHERE invoice_number IN ('JFU-INV-57caff-1794809989063', 'JFU-INV-8c2728-1794807872125');
-- Harapan: 0


-- ============================================================================
-- 2. UJI (jalankan SENDIRI; badannya sama dengan APPLY, lalu sengaja dibatalkan)
-- ============================================================================
-- Harapan: ERROR "UJI LULUS (sengaja dibatalkan, tidak ada yang tersimpan): …"
-- Pesan lain = berhenti, kirim pesannya.
DO $$
DECLARE
  c_bill     CONSTANT text        := 'JFU-INV-57caff-1794809989063';  -- tempo gabungan B, dihidupkan
  c_bill_a   CONSTANT text        := 'JFU-INV-8c2728-1794807872125';  -- tempo gabungan A (batal 13.11), riwayat
  c_dup      CONSTANT uuid        := '8038ea02-7d9d-4667-b9ee-04bb1ff30b1e';  -- Mun11 dobel Y9HSZVZC, tetap batal
  c_deadline CONSTANT timestamptz := '2026-11-17 08:00:00+00';  -- Sel 17 Nov 15.00 WIB
  n   int;
  r   record;
  s   record;
  p   record;
  b   record;
  u   record;
  c   record;
BEGIN
  -- ── 0. Pagar ──────────────────────────────────────────────────────────────
  IF now() >= c_deadline THEN
    RAISE EXCEPTION 'Sudah lewat Sel 17 Nov 15.00 WIB: jendela Mun#07 habis dan Mun11 seharusnya sudah mulai. Jangan dijalankan; tanggalnya perlu diputuskan ulang.';
  END IF;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  SELECT * FROM (VALUES
    -- order                                  ordinal 1 (dihidupkan)                  booking     perpanjangan Rp 0 (dihapus)            booking     tgl lama          tgl baru
    ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be'::uuid, '1ae49541-4938-4dca-b2db-82d33480be9a'::uuid, 'KH7QQM9T', 'c5393336-e79c-4337-bdc1-8e1991eb77b9'::uuid, 'SYV8KZG8', DATE '2026-11-16', DATE '2026-11-16', 'Mun#07'),
    ('1f39848c-0865-4d49-be21-8135078e4f4c',       'de16850b-e07a-4be0-a8cb-8c0c5d48aefb',       'PBCZQE5K', '8a9e4143-96f5-481e-b270-c6a2c0823d7e',       'FQMJ4NS8', DATE '2026-11-17', DATE '2026-11-18', 'Mun#08'),
    ('7aeaf57a-e051-4596-bc6b-bceb14c3ef5c',       'ac168f9b-7b53-4184-9e2a-8d6f55c09faf',       'GYSYXAFS', 'c7968abd-8f39-48dd-a7d7-fb040b9dbec8',       'DEJA532W', DATE '2026-11-18', DATE '2026-11-18', 'Mun#09'),
    ('004c885b-ab34-430c-94be-0ddb5398c0c3',       'cac7a5e0-2ba3-4062-817b-2f9ca2b7321c',       'Q48QAGK9', '0d0da5bc-a0c2-4f5e-82ea-5e0a65a715d1',       'C98TGJ5B', DATE '2026-11-18', DATE '2026-11-18', 'Mun10'),
    ('f4a41039-2da6-4dd6-83bb-5095c82bf9fc',       '675e40ce-80f5-498a-b234-efa8e1780352',       'PX9F4DGW', '85c1cbb4-f00f-4dfa-ad73-49be19f54495',       'F7SS8YPK', DATE '2026-11-20', DATE '2026-11-17', 'Mun11'),
    ('57caff4e-862c-4ab7-808f-a4b1dcd8c8a8',       'bffc27b1-e18e-4702-a1e4-27a15d709f1d',       'DNW47C7J', '186c6406-21f7-4974-9564-edf1ad082213',       'CEYXEF9P', DATE '2026-11-21', DATE '2026-11-18', 'Mun12')
  ) v(order_id, s1, s1_booking, ext, ext_booking, old_date, new_date, label);

  -- Order dikunci dulu, baru diperiksa.
  PERFORM 1 FROM public.form_submissions fs
   WHERE fs.id IN (SELECT order_id FROM _m) OR fs.id = (SELECT submission_id FROM public.ad_schedules WHERE id = c_dup)
     FOR UPDATE;

  FOR r IN SELECT * FROM _m LOOP
    PERFORM 1 FROM public.form_submissions fs
     WHERE fs.id = r.order_id
       AND fs.submission_status = 'slot_cancelled'
       AND fs.start_date = r.old_date
       AND fs.duration = 1
       AND fs.total_cost = 493950 AND fs.winner_count = 5 AND fs.prize_per_winner = 35000;
    IF NOT FOUND THEN
      RAISE EXCEPTION '% tidak lagi seperti 16 Nov (slot_cancelled, mulai %, Rp 493.950, reward 5 × 35.000). Berhenti, cek ulang.', r.label, r.old_date;
    END IF;

    PERFORM 1 FROM public.ad_schedules a
     WHERE a.id = r.s1 AND a.submission_id = r.order_id AND a.ordinal = 1
       AND a.booking_id = r.s1_booking AND a.status = 'cancelled' AND a.air_on_credit_at IS NOT NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION '% jadwal #1 % bukan lagi jadwal kredit yang batal. Berhenti.', r.label, r.s1_booking;
    END IF;

    PERFORM 1 FROM public.ad_schedules a
     WHERE a.id = r.ext AND a.submission_id = r.order_id AND a.booking_id = r.ext_booking
       AND a.source_table = 'form_submissions_extend' AND a.status = 'waiting_payment'
       AND coalesce(a.total_cost, 0) = 0
       AND a.start_date = public.airing_instant_of_date(r.new_date);
    IF NOT FOUND THEN
      RAISE EXCEPTION '% perpanjangan % bukan lagi waiting_payment Rp 0 di %. Berhenti.', r.label, r.ext_booking, r.new_date;
    END IF;

    IF (SELECT count(*) FROM public.ad_schedules WHERE submission_id = r.order_id) <> 2 THEN
      RAISE EXCEPTION '% punya jadwal selain #1 dan %. Berhenti.', r.label, r.ext_booking;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices     WHERE schedule_id = r.ext)
    OR EXISTS (SELECT 1 FROM public.transactions WHERE schedule_id = r.ext) THEN
      RAISE EXCEPTION '% perpanjangan % ternyata sudah punya tagihan. Berhenti.', r.label, r.ext_booking;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices     WHERE form_submission_id = r.order_id AND status IN ('paid', 'completed'))
    OR EXISTS (SELECT 1 FROM public.transactions WHERE form_submission_id = r.order_id AND status IN ('paid', 'completed')) THEN
      RAISE EXCEPTION '% punya tagihan LUNAS. Berhenti.', r.label;
    END IF;

    IF (SELECT count(*) FROM public.invoices
         WHERE payment_id = c_bill AND schedule_id = r.s1 AND is_tempo AND amount = 493950
           AND status IN ('pending', 'expired')) <> 1
    OR (SELECT count(*) FROM public.transactions
         WHERE payment_id = c_bill AND schedule_id = r.s1 AND amount = 493950
           AND status IN ('pending', 'expired')) <> 1 THEN
      RAISE EXCEPTION '% baris tagihan B bukan lagi 1 invoice + 1 transaksi Rp 493.950 (pending/expired). Berhenti.', r.label;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices
                WHERE schedule_id = r.s1 AND is_tempo AND status = 'pending' AND payment_id <> c_bill) THEN
      RAISE EXCEPTION '% sudah punya tagihan tempo lain yang pending. Berhenti.', r.label;
    END IF;
  END LOOP;

  -- Tagihan B: tepat 7 baris (6 di atas + Mun11 dobel), dan belum pernah diperbarui /bayar/.
  IF (SELECT count(*) FROM public.invoices     WHERE payment_id = c_bill) <> 7
  OR (SELECT count(*) FROM public.transactions WHERE payment_id = c_bill) <> 7
  OR EXISTS (SELECT 1 FROM public.invoices WHERE payment_id = c_bill AND superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Tagihan gabungan % bukan lagi 7 + 7 baris yang belum diperbarui. Berhenti.', c_bill;
  END IF;

  IF EXISTS (SELECT 1 FROM public.doku_webhook_events WHERE invoice_number IN (c_bill, c_bill_a)) THEN
    RAISE EXCEPTION 'Ada notifikasi DOKU untuk % / %. Berhenti, cek pembayarannya dulu.', c_bill, c_bill_a;
  END IF;

  -- ── 1. Hapus 6 perpanjangan Rp 0 (tanpa tagihan; tidak ada trigger DELETE) ─
  -- Duluan: assert_no_schedule_overlap dan kuota harian menolak #1 selama
  -- perpanjangannya masih memegang tanggal yang sama.
  DELETE FROM public.ad_schedules a
   USING _m
   WHERE a.id = _m.ext AND a.submission_id = _m.order_id
     AND a.source_table = 'form_submissions_extend' AND a.status = 'waiting_payment';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Langkah 1: perpanjangan terhapus % baris, harus 6.', n; END IF;

  -- ── 2. Hidupkan #1 di tanggal baru (trigger menyalin ke ordinal 1 + halaman) ─
  FOR r IN SELECT * FROM _m ORDER BY new_date, label LOOP
    UPDATE public.form_submissions
       SET start_date        = r.new_date,
           end_date          = r.new_date + 1,
           submission_status = 'scheduled',
           payment_status    = 'pending',
           slot_booked_by    = 'admin'
     WHERE id = r.order_id AND submission_status = 'slot_cancelled';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Langkah 2: % terubah % baris, harus 1.', r.label, n; END IF;
  END LOOP;

  -- ── 3. Hidupkan tagihan B untuk 6 anggota — invoice DAN transaksi ─────────
  -- expires_at = semenit lalu (resolver membaca `>= now()` sebagai hidup): link DOKU grup B sudah mati (DOKU: order_already_cancelled),
  -- jadi /bayar/ wajib membaca tempo_renewable lalu mencetak link baru untuk
  -- 6 anggota. Tanpa ini baris PX9F4DGW (expires_at 23 Nov) dibaca "live" dan
  -- peneliti dilempar ke link yang ditolak DOKU.
  UPDATE public.invoices i
     SET status            = 'pending',
         billed_start_date = a.start_date,
         expires_at        = (now() - interval '1 minute') AT TIME ZONE 'UTC'
    FROM _m JOIN public.ad_schedules a ON a.id = _m.s1
   WHERE i.payment_id = c_bill AND i.schedule_id = _m.s1 AND i.is_tempo
     AND i.status IN ('pending', 'expired');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Langkah 3: invoice B terubah % baris, harus 6.', n; END IF;

  UPDATE public.transactions t
     SET status            = 'pending',
         billed_start_date = a.start_date
    FROM _m JOIN public.ad_schedules a ON a.id = _m.s1
   WHERE t.payment_id = c_bill AND t.schedule_id = _m.s1
     AND t.status IN ('pending', 'expired');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Langkah 3: transaksi B terubah % baris, harus 6.', n; END IF;

  -- ── 4. Asersi (`IS NOT TRUE` = NULL ikut gagal, tidak lolos diam-diam) ────
  FOR r IN SELECT * FROM _m LOOP
    IF (SELECT count(*) FROM public.ad_schedules WHERE submission_id = r.order_id) <> 1 THEN
      RAISE EXCEPTION 'Asersi %: harus tinggal 1 jadwal.', r.label;
    END IF;

    SELECT * INTO s FROM public.ad_schedules WHERE id = r.s1;
    IF (s.status = 'scheduled' AND s.payment_status = 'pending'
        AND s.start_date = public.airing_instant_of_date(r.new_date)
        AND s.end_date   = public.airing_instant_of_date(r.new_date + 1)
        AND s.duration = 1 AND s.slot_booked_by = 'admin' AND s.cancelled_by IS NULL
        AND s.air_on_credit_at IS NOT NULL
        AND s.total_cost = 493950 AND s.winner_count = 5 AND s.prize_per_winner = 35000
        AND s.voucher_code = 'JFU-SUHUDENDYEAR') IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % jadwal %: status=% bayar=% mulai=% slot=% batal_oleh=% kredit=% total=%',
        r.label, r.s1_booking, s.status, s.payment_status, s.start_date, s.slot_booked_by,
        s.cancelled_by, s.air_on_credit_at IS NOT NULL, s.total_cost;
    END IF;

    SELECT * INTO p FROM public.survey_pages WHERE submission_id = r.order_id;
    IF (p.is_published AND p.publish_start_date = s.start_date AND p.publish_end_date = s.end_date
        AND p.auto_closed_at IS NULL) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % halaman: terbit=% mulai=% selesai=% auto_closed=%',
        r.label, p.is_published, p.publish_start_date, p.publish_end_date, p.auto_closed_at;
    END IF;

    SELECT * INTO b FROM public.schedule_billing(r.s1) x WHERE x.payment_id = c_bill;
    IF (b.status = 'pending' AND b.amount = 493950 AND b.billed_start_date = s.start_date
        AND NOT b.is_stale AND NOT b.is_superseded) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % schedule_billing: status=% amount=% ditagih=% stale=% superseded=%',
        r.label, b.status, b.amount, b.billed_start_date, b.is_stale, b.is_superseded;
    END IF;

    SELECT * INTO u FROM public.authoritative_payment_url(r.s1);
    IF (u.reason = 'tempo_renewable' AND u.payment_id = c_bill) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % /bayar/: reason=% payment_id=% (harus tempo_renewable %)', r.label, u.reason, u.payment_id, c_bill;
    END IF;
  END LOOP;

  -- Pembaruan /bayar/ akan menagih 6 anggota sekaligus, lead = Mun#07 (mulai paling awal).
  SELECT * INTO c FROM public.tempo_renewal_candidate('1ae49541-4938-4dca-b2db-82d33480be9a');
  IF (c.old_payment_id = c_bill AND c.amount = 6 * 493950 AND c.member_count = 6
      AND c.live_payment_id IS NULL
      AND c.lead_schedule_id = '1ae49541-4938-4dca-b2db-82d33480be9a') IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi kandidat pembaruan: lama=% nominal=% anggota=% live=% lead=%',
      c.old_payment_id, c.amount, c.member_count, c.live_payment_id, c.lead_schedule_id;
  END IF;

  IF (SELECT count(*) FROM public.transactions WHERE payment_id = c_bill AND status = 'pending') <> 6 THEN
    RAISE EXCEPTION 'Asersi: transaksi B pending harus 6 (renew_tempo_bill menolak bila jumlahnya beda dari invoice).';
  END IF;

  -- Mun11 dobel tidak tersentuh.
  IF (SELECT status FROM public.ad_schedules WHERE id = c_dup) IS DISTINCT FROM 'cancelled'
  OR (SELECT status FROM public.invoices WHERE payment_id = c_bill AND schedule_id = c_dup) IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'Asersi: Mun11 dobel Y9HSZVZC ikut berubah.';
  END IF;

  -- Mun#07 sudah dikabari tayang pukul 15.00; jangan sampai email "tayang" terkirim lagi.
  IF (SELECT live_notified_at FROM public.ad_schedules WHERE id = '1ae49541-4938-4dca-b2db-82d33480be9a') IS NULL THEN
    RAISE EXCEPTION 'Asersi: live_notified_at Mun#07 hilang; cron akan mengirim email tayang kedua.';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (sengaja dibatalkan, tidak ada yang tersimpan): 6 jadwal hidup, 6 perpanjangan terhapus, tagihan B menunggu link baru Rp %.', c.amount;
END $$;


-- ============================================================================
-- 3. APPLY (jalankan SENDIRI, dari BEGIN sampai COMMIT)
-- ============================================================================
BEGIN;

-- Snapshot ke skema backup (CTAS tidak mewarisi RLS: hak akses dicabut manual).
CREATE TABLE IF NOT EXISTS backup.ops_mun07_12_fs_20261116 AS
  SELECT * FROM public.form_submissions WHERE id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8');
CREATE TABLE IF NOT EXISTS backup.ops_mun07_12_sched_20261116 AS
  SELECT * FROM public.ad_schedules WHERE submission_id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8');
CREATE TABLE IF NOT EXISTS backup.ops_mun07_12_inv_20261116 AS
  SELECT * FROM public.invoices WHERE form_submission_id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8');
CREATE TABLE IF NOT EXISTS backup.ops_mun07_12_txn_20261116 AS
  SELECT * FROM public.transactions WHERE form_submission_id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8');
CREATE TABLE IF NOT EXISTS backup.ops_mun07_12_page_20261116 AS
  SELECT * FROM public.survey_pages WHERE submission_id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8');
REVOKE ALL ON backup.ops_mun07_12_fs_20261116, backup.ops_mun07_12_sched_20261116, backup.ops_mun07_12_inv_20261116, backup.ops_mun07_12_txn_20261116, backup.ops_mun07_12_page_20261116
  FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.ops_mun07_12_fs_20261116    ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_mun07_12_sched_20261116 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_mun07_12_inv_20261116   ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_mun07_12_txn_20261116   ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_mun07_12_page_20261116  ENABLE ROW LEVEL SECURITY;

-- Badan yang SAMA dengan blok UJI; bedanya hanya baris terakhir (NOTICE).
DO $$
DECLARE
  c_bill     CONSTANT text        := 'JFU-INV-57caff-1794809989063';  -- tempo gabungan B, dihidupkan
  c_bill_a   CONSTANT text        := 'JFU-INV-8c2728-1794807872125';  -- tempo gabungan A (batal 13.11), riwayat
  c_dup      CONSTANT uuid        := '8038ea02-7d9d-4667-b9ee-04bb1ff30b1e';  -- Mun11 dobel Y9HSZVZC, tetap batal
  c_deadline CONSTANT timestamptz := '2026-11-17 08:00:00+00';  -- Sel 17 Nov 15.00 WIB
  n   int;
  r   record;
  s   record;
  p   record;
  b   record;
  u   record;
  c   record;
BEGIN
  -- ── 0. Pagar ──────────────────────────────────────────────────────────────
  IF now() >= c_deadline THEN
    RAISE EXCEPTION 'Sudah lewat Sel 17 Nov 15.00 WIB: jendela Mun#07 habis dan Mun11 seharusnya sudah mulai. Jangan dijalankan; tanggalnya perlu diputuskan ulang.';
  END IF;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  SELECT * FROM (VALUES
    -- order                                  ordinal 1 (dihidupkan)                  booking     perpanjangan Rp 0 (dihapus)            booking     tgl lama          tgl baru
    ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be'::uuid, '1ae49541-4938-4dca-b2db-82d33480be9a'::uuid, 'KH7QQM9T', 'c5393336-e79c-4337-bdc1-8e1991eb77b9'::uuid, 'SYV8KZG8', DATE '2026-11-16', DATE '2026-11-16', 'Mun#07'),
    ('1f39848c-0865-4d49-be21-8135078e4f4c',       'de16850b-e07a-4be0-a8cb-8c0c5d48aefb',       'PBCZQE5K', '8a9e4143-96f5-481e-b270-c6a2c0823d7e',       'FQMJ4NS8', DATE '2026-11-17', DATE '2026-11-18', 'Mun#08'),
    ('7aeaf57a-e051-4596-bc6b-bceb14c3ef5c',       'ac168f9b-7b53-4184-9e2a-8d6f55c09faf',       'GYSYXAFS', 'c7968abd-8f39-48dd-a7d7-fb040b9dbec8',       'DEJA532W', DATE '2026-11-18', DATE '2026-11-18', 'Mun#09'),
    ('004c885b-ab34-430c-94be-0ddb5398c0c3',       'cac7a5e0-2ba3-4062-817b-2f9ca2b7321c',       'Q48QAGK9', '0d0da5bc-a0c2-4f5e-82ea-5e0a65a715d1',       'C98TGJ5B', DATE '2026-11-18', DATE '2026-11-18', 'Mun10'),
    ('f4a41039-2da6-4dd6-83bb-5095c82bf9fc',       '675e40ce-80f5-498a-b234-efa8e1780352',       'PX9F4DGW', '85c1cbb4-f00f-4dfa-ad73-49be19f54495',       'F7SS8YPK', DATE '2026-11-20', DATE '2026-11-17', 'Mun11'),
    ('57caff4e-862c-4ab7-808f-a4b1dcd8c8a8',       'bffc27b1-e18e-4702-a1e4-27a15d709f1d',       'DNW47C7J', '186c6406-21f7-4974-9564-edf1ad082213',       'CEYXEF9P', DATE '2026-11-21', DATE '2026-11-18', 'Mun12')
  ) v(order_id, s1, s1_booking, ext, ext_booking, old_date, new_date, label);

  -- Order dikunci dulu, baru diperiksa.
  PERFORM 1 FROM public.form_submissions fs
   WHERE fs.id IN (SELECT order_id FROM _m) OR fs.id = (SELECT submission_id FROM public.ad_schedules WHERE id = c_dup)
     FOR UPDATE;

  FOR r IN SELECT * FROM _m LOOP
    PERFORM 1 FROM public.form_submissions fs
     WHERE fs.id = r.order_id
       AND fs.submission_status = 'slot_cancelled'
       AND fs.start_date = r.old_date
       AND fs.duration = 1
       AND fs.total_cost = 493950 AND fs.winner_count = 5 AND fs.prize_per_winner = 35000;
    IF NOT FOUND THEN
      RAISE EXCEPTION '% tidak lagi seperti 16 Nov (slot_cancelled, mulai %, Rp 493.950, reward 5 × 35.000). Berhenti, cek ulang.', r.label, r.old_date;
    END IF;

    PERFORM 1 FROM public.ad_schedules a
     WHERE a.id = r.s1 AND a.submission_id = r.order_id AND a.ordinal = 1
       AND a.booking_id = r.s1_booking AND a.status = 'cancelled' AND a.air_on_credit_at IS NOT NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION '% jadwal #1 % bukan lagi jadwal kredit yang batal. Berhenti.', r.label, r.s1_booking;
    END IF;

    PERFORM 1 FROM public.ad_schedules a
     WHERE a.id = r.ext AND a.submission_id = r.order_id AND a.booking_id = r.ext_booking
       AND a.source_table = 'form_submissions_extend' AND a.status = 'waiting_payment'
       AND coalesce(a.total_cost, 0) = 0
       AND a.start_date = public.airing_instant_of_date(r.new_date);
    IF NOT FOUND THEN
      RAISE EXCEPTION '% perpanjangan % bukan lagi waiting_payment Rp 0 di %. Berhenti.', r.label, r.ext_booking, r.new_date;
    END IF;

    IF (SELECT count(*) FROM public.ad_schedules WHERE submission_id = r.order_id) <> 2 THEN
      RAISE EXCEPTION '% punya jadwal selain #1 dan %. Berhenti.', r.label, r.ext_booking;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices     WHERE schedule_id = r.ext)
    OR EXISTS (SELECT 1 FROM public.transactions WHERE schedule_id = r.ext) THEN
      RAISE EXCEPTION '% perpanjangan % ternyata sudah punya tagihan. Berhenti.', r.label, r.ext_booking;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices     WHERE form_submission_id = r.order_id AND status IN ('paid', 'completed'))
    OR EXISTS (SELECT 1 FROM public.transactions WHERE form_submission_id = r.order_id AND status IN ('paid', 'completed')) THEN
      RAISE EXCEPTION '% punya tagihan LUNAS. Berhenti.', r.label;
    END IF;

    IF (SELECT count(*) FROM public.invoices
         WHERE payment_id = c_bill AND schedule_id = r.s1 AND is_tempo AND amount = 493950
           AND status IN ('pending', 'expired')) <> 1
    OR (SELECT count(*) FROM public.transactions
         WHERE payment_id = c_bill AND schedule_id = r.s1 AND amount = 493950
           AND status IN ('pending', 'expired')) <> 1 THEN
      RAISE EXCEPTION '% baris tagihan B bukan lagi 1 invoice + 1 transaksi Rp 493.950 (pending/expired). Berhenti.', r.label;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices
                WHERE schedule_id = r.s1 AND is_tempo AND status = 'pending' AND payment_id <> c_bill) THEN
      RAISE EXCEPTION '% sudah punya tagihan tempo lain yang pending. Berhenti.', r.label;
    END IF;
  END LOOP;

  -- Tagihan B: tepat 7 baris (6 di atas + Mun11 dobel), dan belum pernah diperbarui /bayar/.
  IF (SELECT count(*) FROM public.invoices     WHERE payment_id = c_bill) <> 7
  OR (SELECT count(*) FROM public.transactions WHERE payment_id = c_bill) <> 7
  OR EXISTS (SELECT 1 FROM public.invoices WHERE payment_id = c_bill AND superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Tagihan gabungan % bukan lagi 7 + 7 baris yang belum diperbarui. Berhenti.', c_bill;
  END IF;

  IF EXISTS (SELECT 1 FROM public.doku_webhook_events WHERE invoice_number IN (c_bill, c_bill_a)) THEN
    RAISE EXCEPTION 'Ada notifikasi DOKU untuk % / %. Berhenti, cek pembayarannya dulu.', c_bill, c_bill_a;
  END IF;

  -- ── 1. Hapus 6 perpanjangan Rp 0 (tanpa tagihan; tidak ada trigger DELETE) ─
  -- Duluan: assert_no_schedule_overlap dan kuota harian menolak #1 selama
  -- perpanjangannya masih memegang tanggal yang sama.
  DELETE FROM public.ad_schedules a
   USING _m
   WHERE a.id = _m.ext AND a.submission_id = _m.order_id
     AND a.source_table = 'form_submissions_extend' AND a.status = 'waiting_payment';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Langkah 1: perpanjangan terhapus % baris, harus 6.', n; END IF;

  -- ── 2. Hidupkan #1 di tanggal baru (trigger menyalin ke ordinal 1 + halaman) ─
  FOR r IN SELECT * FROM _m ORDER BY new_date, label LOOP
    UPDATE public.form_submissions
       SET start_date        = r.new_date,
           end_date          = r.new_date + 1,
           submission_status = 'scheduled',
           payment_status    = 'pending',
           slot_booked_by    = 'admin'
     WHERE id = r.order_id AND submission_status = 'slot_cancelled';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Langkah 2: % terubah % baris, harus 1.', r.label, n; END IF;
  END LOOP;

  -- ── 3. Hidupkan tagihan B untuk 6 anggota — invoice DAN transaksi ─────────
  -- expires_at = semenit lalu (resolver membaca `>= now()` sebagai hidup): link DOKU grup B sudah mati (DOKU: order_already_cancelled),
  -- jadi /bayar/ wajib membaca tempo_renewable lalu mencetak link baru untuk
  -- 6 anggota. Tanpa ini baris PX9F4DGW (expires_at 23 Nov) dibaca "live" dan
  -- peneliti dilempar ke link yang ditolak DOKU.
  UPDATE public.invoices i
     SET status            = 'pending',
         billed_start_date = a.start_date,
         expires_at        = (now() - interval '1 minute') AT TIME ZONE 'UTC'
    FROM _m JOIN public.ad_schedules a ON a.id = _m.s1
   WHERE i.payment_id = c_bill AND i.schedule_id = _m.s1 AND i.is_tempo
     AND i.status IN ('pending', 'expired');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Langkah 3: invoice B terubah % baris, harus 6.', n; END IF;

  UPDATE public.transactions t
     SET status            = 'pending',
         billed_start_date = a.start_date
    FROM _m JOIN public.ad_schedules a ON a.id = _m.s1
   WHERE t.payment_id = c_bill AND t.schedule_id = _m.s1
     AND t.status IN ('pending', 'expired');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Langkah 3: transaksi B terubah % baris, harus 6.', n; END IF;

  -- ── 4. Asersi (`IS NOT TRUE` = NULL ikut gagal, tidak lolos diam-diam) ────
  FOR r IN SELECT * FROM _m LOOP
    IF (SELECT count(*) FROM public.ad_schedules WHERE submission_id = r.order_id) <> 1 THEN
      RAISE EXCEPTION 'Asersi %: harus tinggal 1 jadwal.', r.label;
    END IF;

    SELECT * INTO s FROM public.ad_schedules WHERE id = r.s1;
    IF (s.status = 'scheduled' AND s.payment_status = 'pending'
        AND s.start_date = public.airing_instant_of_date(r.new_date)
        AND s.end_date   = public.airing_instant_of_date(r.new_date + 1)
        AND s.duration = 1 AND s.slot_booked_by = 'admin' AND s.cancelled_by IS NULL
        AND s.air_on_credit_at IS NOT NULL
        AND s.total_cost = 493950 AND s.winner_count = 5 AND s.prize_per_winner = 35000
        AND s.voucher_code = 'JFU-SUHUDENDYEAR') IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % jadwal %: status=% bayar=% mulai=% slot=% batal_oleh=% kredit=% total=%',
        r.label, r.s1_booking, s.status, s.payment_status, s.start_date, s.slot_booked_by,
        s.cancelled_by, s.air_on_credit_at IS NOT NULL, s.total_cost;
    END IF;

    SELECT * INTO p FROM public.survey_pages WHERE submission_id = r.order_id;
    IF (p.is_published AND p.publish_start_date = s.start_date AND p.publish_end_date = s.end_date
        AND p.auto_closed_at IS NULL) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % halaman: terbit=% mulai=% selesai=% auto_closed=%',
        r.label, p.is_published, p.publish_start_date, p.publish_end_date, p.auto_closed_at;
    END IF;

    SELECT * INTO b FROM public.schedule_billing(r.s1) x WHERE x.payment_id = c_bill;
    IF (b.status = 'pending' AND b.amount = 493950 AND b.billed_start_date = s.start_date
        AND NOT b.is_stale AND NOT b.is_superseded) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % schedule_billing: status=% amount=% ditagih=% stale=% superseded=%',
        r.label, b.status, b.amount, b.billed_start_date, b.is_stale, b.is_superseded;
    END IF;

    SELECT * INTO u FROM public.authoritative_payment_url(r.s1);
    IF (u.reason = 'tempo_renewable' AND u.payment_id = c_bill) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asersi % /bayar/: reason=% payment_id=% (harus tempo_renewable %)', r.label, u.reason, u.payment_id, c_bill;
    END IF;
  END LOOP;

  -- Pembaruan /bayar/ akan menagih 6 anggota sekaligus, lead = Mun#07 (mulai paling awal).
  SELECT * INTO c FROM public.tempo_renewal_candidate('1ae49541-4938-4dca-b2db-82d33480be9a');
  IF (c.old_payment_id = c_bill AND c.amount = 6 * 493950 AND c.member_count = 6
      AND c.live_payment_id IS NULL
      AND c.lead_schedule_id = '1ae49541-4938-4dca-b2db-82d33480be9a') IS NOT TRUE THEN
    RAISE EXCEPTION 'Asersi kandidat pembaruan: lama=% nominal=% anggota=% live=% lead=%',
      c.old_payment_id, c.amount, c.member_count, c.live_payment_id, c.lead_schedule_id;
  END IF;

  IF (SELECT count(*) FROM public.transactions WHERE payment_id = c_bill AND status = 'pending') <> 6 THEN
    RAISE EXCEPTION 'Asersi: transaksi B pending harus 6 (renew_tempo_bill menolak bila jumlahnya beda dari invoice).';
  END IF;

  -- Mun11 dobel tidak tersentuh.
  IF (SELECT status FROM public.ad_schedules WHERE id = c_dup) IS DISTINCT FROM 'cancelled'
  OR (SELECT status FROM public.invoices WHERE payment_id = c_bill AND schedule_id = c_dup) IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'Asersi: Mun11 dobel Y9HSZVZC ikut berubah.';
  END IF;

  -- Mun#07 sudah dikabari tayang pukul 15.00; jangan sampai email "tayang" terkirim lagi.
  IF (SELECT live_notified_at FROM public.ad_schedules WHERE id = '1ae49541-4938-4dca-b2db-82d33480be9a') IS NULL THEN
    RAISE EXCEPTION 'Asersi: live_notified_at Mun#07 hilang; cron akan mengirim email tayang kedua.';
  END IF;

  RAISE NOTICE 'OK: 6 jadwal #1 hidup (Mun#07 16 Nov, Mun11 17 Nov, Mun#08/#09/10/12 18 Nov), 6 perpanjangan Rp 0 terhapus, tagihan B % menunggu link baru Rp %.',
    c_bill, c.amount;
END $$;

COMMIT;


-- ============================================================================
-- 4. VERIFY
-- ============================================================================
SELECT fs.title, a.booking_id, a.status, a.payment_status, a.slot_booked_by,
       a.air_on_credit_at IS NOT NULL                                        AS kredit,
       to_char(a.start_date AT TIME ZONE 'Asia/Jakarta', 'Dy DD Mon HH24:MI') AS mulai_wib,
       to_char(sp.publish_end_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS halaman_tutup_wib,
       sp.auto_closed_at IS NULL                                             AS halaman_terbuka,
       a.total_cost,
       (SELECT reason FROM public.authoritative_payment_url(a.id))            AS bayar
  FROM public.ad_schedules a
  JOIN public.form_submissions fs ON fs.id = a.submission_id
  LEFT JOIN public.survey_pages sp ON sp.submission_id = a.submission_id
 WHERE a.submission_id IN ('c85fe88c-ae4f-4ff8-8f1c-9b4748ff67be', '1f39848c-0865-4d49-be21-8135078e4f4c',
     '7aeaf57a-e051-4596-bc6b-bceb14c3ef5c', '004c885b-ab34-430c-94be-0ddb5398c0c3',
     '9e9f2707-b453-4bb1-959f-1a19723dc1e0', 'f4a41039-2da6-4dd6-83bb-5095c82bf9fc',
     '57caff4e-862c-4ab7-808f-a4b1dcd8c8a8')
 ORDER BY a.start_date, fs.title;
-- Harapan: 7 baris, satu jadwal per order.
--   Mun#07 KH7QQM9T scheduled | pending | admin | true | Mon 16 Nov 15:00 | 17 Nov 15:00 | true | 493950 | tempo_renewable
--   Mun11  PX9F4DGW … Tue 17 Nov 15:00 | 18 Nov 15:00 …
--   Mun#08/#09/10/12 … Wed 18 Nov 15:00 | 19 Nov 15:00 …
--   Mun11 Y9HSZVZC cancelled | expired | … (dobel, tetap batal; bayar = bukan tempo_renewable)
-- Jendela Mun#07 sudah mulai, jadi halamannya langsung tampil lagi di feed.

SELECT * FROM public.tempo_renewal_candidate('1ae49541-4938-4dca-b2db-82d33480be9a');
-- Harapan: old_payment_id JFU-INV-57caff-1794809989063 | amount 2963700 |
--          member_count 6 | live_payment_id NULL | lead_schedule_id 1ae49541-…

-- SESUDAH VERIFY: buka https://submit.jakpatforuniv.com/bayar/1ae49541-4938-4dca-b2db-82d33480be9a
-- sekali. Halaman itu mencetak link DOKU baru Rp 2.963.700 untuk keenam order
-- (B lama → cancelled + superseded_by). Kirim link itu ke peneliti.


-- ============================================================================
-- 5. ROLLBACK (hanya kalau perlu, dan HANYA SEBELUM /bayar/ dibuka: sesudah
--    link baru dicetak, baris B sudah diganti dan blok ini berhenti sendiri)
-- ============================================================================
-- Hapus awalan `-- ` lalu jalankan sebagai satu blok.
--
-- BEGIN;
-- DO $rb$
-- BEGIN
--   IF (SELECT count(*) FROM public.invoices
--        WHERE payment_id = 'JFU-INV-57caff-1794809989063' AND status = 'pending'
--          AND superseded_by IS NULL) <> 6 THEN
--     RAISE EXCEPTION 'Tagihan B sudah diperbarui /bayar/ atau berubah. Rollback otomatis tidak aman, berhenti.';
--   END IF;
--   IF EXISTS (SELECT 1 FROM public.invoices i JOIN backup.ops_mun07_12_fs_20261116 b ON b.id = i.form_submission_id
--               WHERE i.status IN ('paid', 'completed')) THEN
--     RAISE EXCEPTION 'Ada tagihan lunas. Berhenti.';
--   END IF;
-- END $rb$;
-- -- R1. Order kembali batal di tanggal lamanya (trigger membatalkan ordinal 1
-- --     dan menutup halaman; R2 lalu mengembalikan jendela halaman persis).
-- UPDATE public.form_submissions fs
--    SET start_date = b.start_date, end_date = b.end_date,
--        submission_status = b.submission_status, payment_status = b.payment_status,
--        slot_booked_by = b.slot_booked_by
--   FROM backup.ops_mun07_12_fs_20261116 b
--  WHERE fs.id = b.id AND fs.submission_status = 'scheduled';
-- -- Harapan: UPDATE 6
-- -- R2. Jendela halaman persis seperti sebelum APPLY.
-- UPDATE public.survey_pages sp
--    SET publish_start_date = b.publish_start_date, publish_end_date = b.publish_end_date,
--        auto_closed_at = b.auto_closed_at, updated_at = b.updated_at
--   FROM backup.ops_mun07_12_page_20261116 b
--  WHERE sp.id = b.id;
-- -- R3. Baris tagihan B kembali seperti semula.
-- UPDATE public.invoices i
--    SET status = b.status, billed_start_date = b.billed_start_date, expires_at = b.expires_at
--   FROM backup.ops_mun07_12_inv_20261116 b
--  WHERE i.id = b.id AND i.payment_id = 'JFU-INV-57caff-1794809989063';
-- UPDATE public.transactions t
--    SET status = b.status, billed_start_date = b.billed_start_date, updated_at = b.updated_at
--   FROM backup.ops_mun07_12_txn_20261116 b
--  WHERE t.id = b.id AND t.payment_id = 'JFU-INV-57caff-1794809989063';
-- -- R4. Kolom jadwal #1 yang ditulis trigger, persis dari backup.
-- UPDATE public.ad_schedules a
--    SET rate_locked_at = b.rate_locked_at, cancelled_by = b.cancelled_by
--   FROM backup.ops_mun07_12_sched_20261116 b
--  WHERE a.id = b.id AND a.ordinal = 1;
-- -- R5. Enam perpanjangan Rp 0 kembali (booking_id tetap).
-- INSERT INTO public.ad_schedules
-- SELECT * FROM backup.ops_mun07_12_sched_20261116 WHERE source_table = 'form_submissions_extend';
-- -- Harapan: INSERT 0 6
-- -- R6. Trigger kunci tarif menulis ulang rate_locked_at saat INSERT; kembalikan.
-- UPDATE public.ad_schedules a
--    SET rate_locked_at = b.rate_locked_at
--   FROM backup.ops_mun07_12_sched_20261116 b
--  WHERE a.id = b.id AND a.source_table = 'form_submissions_extend';
-- -- Simpangan yang tersisa hanya updated_at (ditulis trigger_set_timestamp).
-- COMMIT;
