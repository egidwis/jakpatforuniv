-- ============================================================================
-- OPS (bukan migrasi skema): hapus ORDER UJI #3a432277 "Untitled form" (uji
-- Push Uji Kilat, 26–27 Okt 2026), TAPI PERTAHANKAN baris uangnya.
--
-- Latar: uji Push Uji memakai pembayaran DOKU sungguhan Rp 1.110 (JFUTGRX,
-- JFU-3a432277-1792992670359). Order Kilat itu LUNAS, gelombang 26 Okt
-- 15.00 WIB, siarannya dimatikan admin 27 Okt 09.43 WIB. Halamannya masih
-- `is_published` dan order ini muncul di /api/respondents (Mode 1) sebagai
-- batch Kilat berhadiah 2 × Rp 25.000 — tim undian bisa mengira ini survei
-- asli. Itu alasan pembersihannya.
--
-- Pola = ops_cleanup_test_order_f268acfa.sql: `form_submission_id` di
-- invoices & transactions NULLABLE dengan FK NO ACTION (memblokir), jadi
-- di-NULL-kan, BUKAN dihapus — uangnya benar-benar masuk ke DOKU dan barisnya
-- perlu ada untuk rekonsiliasi settlement. `schedule_id` tidak disentuh: FK-nya
-- SET NULL dan rontok sendiri saat ad_schedules ikut CASCADE.
--
-- BEDA DARI f268acfa: SATU blok DO (atomik). Temp table `on commit drop`
-- lintas-perintah sempat 42P01 di SQL Editor (lihat catatan f268acfa).
--
-- Analytics: NOL dampak. `isInternalTestTx()` mengecualikan nominal < 10.000.
--
-- Cakupan terverifikasi (dibaca prod 27 Okt 2026, SELECT saja):
--   form_submissions    1  <- jangkar, dihapus (tegarerputra@gmail.com, kilat, paid)
--   ad_schedules        1  <- CASCADE (ordinal 1, f99bcc89, paid)
--   survey_pages        1  <- CASCADE (f43da7bc, untitled-form-3a4322)
--   page_respondents    0  <- CASCADE via survey_pages
--   reward_pools        0  <- CASCADE
--   voucher_redemptions 0  <- SET NULL
--   invoices            1  <- DIPERTAHANKAN (paid, 1.110), form_submission_id -> NULL
--   transactions        1  <- DIPERTAHANKAN (completed, 1.110), form_submission_id -> NULL
--   Trigger DELETE di tabel-tabel itu: nol.
--
-- Order uji lain milik akun ini (e0e7ae16, 6362d67e) dan 660c8c9f milik
-- product@jakpat.net TIDAK disentuh.
--
-- Jalankan UTUH di Supabase SQL Editor (tanpa JWT = penjaga kolom uang
-- melewatkannya). JANGAN lewat MCP.
--
-- ✅ SUDAH DIJALANKAN 27 Okt 2026 — terverifikasi dari produksi sesudahnya:
--   order, jadwal, halaman = 0; invoice `paid` + transaksi `completed`
--   Rp 1.110 utuh dengan form_submission_id NULL; 5 snapshot
--   `backup.del_20261027_3a432277_*` terisi dan tertutup untuk
--   anon/authenticated (ACL hanya postgres); get_batch_rewards_bulk untuk
--   order ini 0 baris (hilang dari /api/respondents); 3 order uji lain
--   (660c8c9f, 6362d67e, e0e7ae16) tak tersentuh.
--   JANGAN dijalankan ulang: jangkarnya sudah tiada, gerbang akan membatalkan.
-- ============================================================================


-- ── DRY-RUN (baca saja) ─────────────────────────────────────────────────────
-- Harapan: 1 | 1 | 1 | 0 | 1 | 1
--
-- SELECT
--   (SELECT count(*) FROM public.form_submissions WHERE id = '3a432277-917d-492e-a031-0f243f6c3568') AS order_,
--   (SELECT count(*) FROM public.ad_schedules     WHERE submission_id = '3a432277-917d-492e-a031-0f243f6c3568') AS jadwal,
--   (SELECT count(*) FROM public.survey_pages     WHERE submission_id = '3a432277-917d-492e-a031-0f243f6c3568') AS halaman,
--   (SELECT count(*) FROM public.page_respondents WHERE page_id = 'f43da7bc-2a5e-4c83-bbfb-ba4f57fedf1a') AS responden,
--   (SELECT count(*) FROM public.invoices         WHERE form_submission_id = '3a432277-917d-492e-a031-0f243f6c3568') AS inv,
--   (SELECT count(*) FROM public.transactions     WHERE form_submission_id = '3a432277-917d-492e-a031-0f243f6c3568') AS tx;


-- ── APPLY (satu blok, atomik — exception = ROLLBACK semuanya) ──────────────
do $$
declare
  v_id   constant uuid := '3a432277-917d-492e-a031-0f243f6c3568';
  v_pay  constant text := 'JFU-3a432277-1792992670359';
  n integer;
begin
  -- 0. Gerbang: jangkar persis 1, akun uji persis, tagihan nominal uji,
  --    nol responden (kalau ada responden, berhenti dan periksa dulu).
  select count(*) into n from public.form_submissions
  where id = v_id and lower(btrim(email)) = 'tegarerputra@gmail.com';
  if n <> 1 then
    raise exception 'Jangkar bukan 1 order uji tegarerputra (dapat %) — batal.', n;
  end if;

  select count(*) into n from public.invoices
  where form_submission_id = v_id and payment_id = v_pay and amount < 10000;
  if n <> 1 then
    raise exception 'Tagihan bukan nominal uji / payment_id berbeda (dapat %) — batal.', n;
  end if;

  select count(*) into n from public.page_respondents r
  join public.survey_pages p on p.id = r.page_id where p.submission_id = v_id;
  if n <> 0 then
    raise exception 'Halaman punya % responden — batal, periksa dulu.', n;
  end if;

  -- 1. Snapshot ke skema `backup` (BUKAN `public`).
  create schema if not exists backup;
  revoke all on schema backup from anon, authenticated;

  create table backup.del_20261027_3a432277_form_submissions as
    select * from public.form_submissions where id = v_id;
  create table backup.del_20261027_3a432277_ad_schedules as
    select * from public.ad_schedules where submission_id = v_id;
  create table backup.del_20261027_3a432277_survey_pages as
    select * from public.survey_pages where submission_id = v_id;
  create table backup.del_20261027_3a432277_invoices as
    select * from public.invoices where form_submission_id = v_id;
  create table backup.del_20261027_3a432277_transactions as
    select * from public.transactions where form_submission_id = v_id;

  revoke all on all tables in schema backup from anon, authenticated;

  -- 2. Lepaskan baris uang dari induknya — DIPERTAHANKAN, bukan dihapus.
  update public.transactions set form_submission_id = null where form_submission_id = v_id;
  update public.invoices     set form_submission_id = null where form_submission_id = v_id;

  -- 3. Jangkar. CASCADE: ad_schedules, survey_pages, page_respondents, reward_pools.
  delete from public.form_submissions where id = v_id;

  -- 4. Verifikasi di dalam blok.
  select (select count(*) from public.form_submissions where id = v_id)
       + (select count(*) from public.ad_schedules     where submission_id = v_id)
       + (select count(*) from public.survey_pages     where submission_id = v_id)
    into n;
  if n <> 0 then
    raise exception 'Verifikasi gagal: % baris tersisa — rollback.', n;
  end if;

  select (select count(*) from public.invoices     where payment_id = v_pay and status = 'paid'      and form_submission_id is null)
       + (select count(*) from public.transactions where payment_id = v_pay and status = 'completed' and form_submission_id is null)
    into n;
  if n <> 2 then
    raise exception 'Baris uang hilang / berubah (dapat % dari 2) — rollback.', n;
  end if;

  raise notice 'Bersih: order, jadwal, halaman #3a432277 terhapus; 2 baris uang Rp 1.110 utuh.';
end $$;


-- ── VERIFIKASI SESUDAH (baca saja) ──────────────────────────────────────────
-- Harapan: 0 | 0 | 0 | 2 | 5
--
-- SELECT
--   (SELECT count(*) FROM public.form_submissions WHERE id = '3a432277-917d-492e-a031-0f243f6c3568') AS order_,
--   (SELECT count(*) FROM public.ad_schedules     WHERE submission_id = '3a432277-917d-492e-a031-0f243f6c3568') AS jadwal,
--   (SELECT count(*) FROM public.survey_pages     WHERE submission_id = '3a432277-917d-492e-a031-0f243f6c3568') AS halaman,
--   (SELECT count(*) FROM public.invoices     WHERE payment_id = 'JFU-3a432277-1792992670359' AND form_submission_id IS NULL)
--   + (SELECT count(*) FROM public.transactions WHERE payment_id = 'JFU-3a432277-1792992670359' AND form_submission_id IS NULL) AS uang,
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema = 'backup' AND table_name LIKE 'del_20261027_3a432277_%') AS snapshot;


-- ============================================================================
-- Rollback penuh setelah dijalankan:
--   insert into public.form_submissions select * from backup.del_20261027_3a432277_form_submissions;
--   -- trigger trg_ad_schedule_from_submission membuat ulang ad_schedules ordinal 1;
--   -- cek duplikat SEBELUM menyisipkan snapshot jadwal (kolom siaran perlu disalin manual).
--   insert into public.survey_pages select * from backup.del_20261027_3a432277_survey_pages;
--   update public.invoices     set form_submission_id = '3a432277-917d-492e-a031-0f243f6c3568'
--     where payment_id = 'JFU-3a432277-1792992670359';
--   update public.transactions set form_submission_id = '3a432277-917d-492e-a031-0f243f6c3568'
--     where payment_id = 'JFU-3a432277-1792992670359';
--
-- Setelah yakin bersih (mis. 2 minggu), buang snapshot:
--   drop table backup.del_20261027_3a432277_form_submissions,
--              backup.del_20261027_3a432277_ad_schedules,
--              backup.del_20261027_3a432277_survey_pages,
--              backup.del_20261027_3a432277_invoices,
--              backup.del_20261027_3a432277_transactions;
-- ============================================================================
