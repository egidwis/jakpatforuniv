-- ============================================================================
-- OPS (bukan migrasi skema): hapus ORDER UJI #f268acfa "Untitled form" (uji
-- cepat Push A, 26 Okt 2026), TAPI PERTAHANKAN baris uangnya.
--
-- Latar: uji cepat Push A memakai pembayaran DOKU sungguhan Rp 1.110
-- (JFU-f268acfa-1792980234274, webhook `ok`). Order itu LUNAS, memegang
-- kuota iklan 2–4 Nov 2026 15.00 WIB, dan halamannya SUDAH TERBIT — tanpa
-- pembersihan ini "Untitled form" tayang di feed aplikasi Jakpat 2 Nov dan
-- memakan satu slot harian dari peneliti asli. Itu satu-satunya alasannya.
--
-- Pola sama dengan ops_cleanup_test_order_af91c0.sql: `form_submission_id`
-- di invoices & transactions NULLABLE dengan FK NO ACTION (memblokir), jadi
-- di-NULL-kan, BUKAN dihapus — uangnya benar-benar masuk ke DOKU dan barisnya
-- perlu ada untuk rekonsiliasi settlement. `schedule_id` tidak disentuh: FK-nya
-- SET NULL dan rontok sendiri saat ad_schedules ikut CASCADE
-- (`derive_schedule_id` tidak menimpanya — ia berhenti bila schedule_id sudah
-- terisi).
--
-- Analytics: NOL dampak. `isInternalTestTx()` mengecualikan nominal < 10.000
-- apa pun email-nya.
--
-- BEDA DARI af91c0: akun uji ini `tegarerputra@gmail.com` (bukan @jakpat),
-- jadi gerbangnya = email persis + nominal uji + jangkar satu baris.
--
-- Cakupan terverifikasi (dibaca prod 26 Okt 2026, SELECT saja):
--   form_submissions   1  <- jangkar, dihapus
--   ad_schedules       2  <- CASCADE (ordinal 1 lunas 2–4 Nov  <-- TUJUAN;
--                            ordinal 2 perpanjangan batal, cancelled_by admin)
--   survey_pages       1  <- CASCADE (is_published, 2–4 Nov)
--   page_respondents   0  <- CASCADE via survey_pages
--   reward_pools       0  <- CASCADE
--   voucher_redemptions 0 <- SET NULL
--   invoices           1  <- DIPERTAHANKAN (paid), form_submission_id -> NULL
--   transactions       1  <- DIPERTAHANKAN (completed), form_submission_id -> NULL
--   Trigger DELETE di tabel-tabel itu: nol.
--
-- Lima order uji lain milik akun ini (e0e7ae16, 6362d67e, 28ed0179,
-- a9f8f78d, 08ef25ac) TIDAK disentuh — tidak satu pun menahan kuota.
--
-- Jalankan UTUH di Supabase SQL Editor (tanpa JWT = penjaga kolom uang
-- melewatkannya). JANGAN lewat MCP.
--
-- ✅ SUDAH DIJALANKAN 26 Okt 2026 — terverifikasi dari produksi sesudahnya:
--   order, 2 jadwal, 1 halaman = 0; invoice `paid` + transaksi `completed`
--   Rp 1.110 utuh dengan form_submission_id & schedule_id NULL; 5 snapshot
--   `backup.del_20261026_f268acfa_*` terisi 1/2/1/1/1 dan tertutup untuk
--   anon/authenticated; 5 order uji lain tak tersentuh.
--   JANGAN dijalankan ulang: jangkarnya sudah tiada, gerbang akan membatalkan.
--
-- ⚠️ Editor sempat melaporkan `42P01 relation "_victim" does not exist` —
--   `create temporary table … on commit drop` tidak bisa diandalkan bila editor
--   menjalankan perintah satu per satu (tabelnya hilang di commit pertama).
--   Untuk ops berikutnya pakai SATU blok DO (atomik) atau CTE, bukan temp table
--   lintas-perintah.
-- ============================================================================


-- ── DRY-RUN (baca saja) ─────────────────────────────────────────────────────
-- Harapan: 1 | 2 | 1 | 1 | 1, dan baris uang paid/completed Rp 1.110.
--
-- SELECT
--   (SELECT count(*) FROM public.form_submissions WHERE id = 'f268acfa-f31e-463e-a014-d868264702ca') AS order_,
--   (SELECT count(*) FROM public.ad_schedules     WHERE submission_id = 'f268acfa-f31e-463e-a014-d868264702ca') AS jadwal,
--   (SELECT count(*) FROM public.survey_pages     WHERE submission_id = 'f268acfa-f31e-463e-a014-d868264702ca') AS halaman,
--   (SELECT count(*) FROM public.invoices         WHERE form_submission_id = 'f268acfa-f31e-463e-a014-d868264702ca') AS inv,
--   (SELECT count(*) FROM public.transactions     WHERE form_submission_id = 'f268acfa-f31e-463e-a014-d868264702ca') AS tx;


-- ── APPLY ───────────────────────────────────────────────────────────────────
begin;

-- Jangkar tunggal & eksplisit: satu baris, bukan pola pencarian.
create temporary table _victim on commit drop as
select id from public.form_submissions
where id = 'f268acfa-f31e-463e-a014-d868264702ca';

-- Gerbang pengaman: jangkar satu baris, akun uji persis, tagihan nominal uji.
do $$
declare n integer; email_ok integer; nominal_ok integer;
begin
  select count(*) into n from _victim;
  if n <> 1 then
    raise exception 'Jangkar harus persis 1 baris, dapat % — batal.', n;
  end if;

  select count(*) into email_ok from public.form_submissions
  where id in (select id from _victim) and lower(btrim(email)) = 'tegarerputra@gmail.com';
  if email_ok <> 1 then
    raise exception 'Order bukan milik akun uji tegarerputra@gmail.com — batal.';
  end if;

  select count(*) into nominal_ok from public.invoices
  where form_submission_id in (select id from _victim) and amount < 10000;
  if nominal_ok <> 1 then
    raise exception 'Tagihannya bukan nominal uji (<10.000) — batal.';
  end if;

  raise notice 'Jangkar sah: 1 order uji tegarerputra.';
end $$;

-- 1. Snapshot ke skema `backup` (BUKAN `public`) — CTAS tidak mewarisi RLS,
--    dan default privileges anon hanya berlaku di `public`.
create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table backup.del_20261026_f268acfa_form_submissions as
  select * from public.form_submissions where id in (select id from _victim);
create table backup.del_20261026_f268acfa_ad_schedules as
  select * from public.ad_schedules where submission_id in (select id from _victim);
create table backup.del_20261026_f268acfa_survey_pages as
  select * from public.survey_pages where submission_id in (select id from _victim);
-- Untuk merekam `form_submission_id` asli sebelum di-NULL-kan, bukan restore.
create table backup.del_20261026_f268acfa_invoices as
  select * from public.invoices where form_submission_id in (select id from _victim);
create table backup.del_20261026_f268acfa_transactions as
  select * from public.transactions where form_submission_id in (select id from _victim);

revoke all on all tables in schema backup from anon, authenticated;

-- 2. Lepaskan baris uang dari induknya — DIPERTAHANKAN, bukan dihapus.
update public.transactions set form_submission_id = null
where form_submission_id in (select id from _victim);

update public.invoices set form_submission_id = null
where form_submission_id in (select id from _victim);

-- 3. Jangkar. CASCADE: ad_schedules (kuota 2–4 Nov terbebas), survey_pages
--    (halaman keluar dari feed), page_respondents, reward_pools.
delete from public.form_submissions where id in (select id from _victim);

-- 4. Verifikasi DI DALAM transaksi — exception = ROLLBACK otomatis.
do $$
declare sisa integer; uang integer;
begin
  select
      (select count(*) from public.form_submissions where id = 'f268acfa-f31e-463e-a014-d868264702ca')
    + (select count(*) from public.ad_schedules     where submission_id = 'f268acfa-f31e-463e-a014-d868264702ca')
    + (select count(*) from public.survey_pages     where submission_id = 'f268acfa-f31e-463e-a014-d868264702ca')
  into sisa;
  if sisa <> 0 then
    raise exception 'Verifikasi gagal: % baris tersisa, rollback.', sisa;
  end if;

  -- Baris uang WAJIB masih ada & tetap lunas.
  select
      (select count(*) from public.invoices     where payment_id = 'JFU-f268acfa-1792980234274' and status = 'paid')
    + (select count(*) from public.transactions where payment_id = 'JFU-f268acfa-1792980234274' and status = 'completed')
  into uang;
  if uang <> 2 then
    raise exception 'Baris uang hilang / berubah (dapat % dari 2) — rollback.', uang;
  end if;

  raise notice 'Bersih. Kuota 2–4 Nov terbebas, halaman keluar dari feed, 2 baris uang utuh.';
end $$;

commit;


-- ── VERIFIKASI SESUDAH (baca saja) ──────────────────────────────────────────
-- Harapan: 0 | 0 | 0 | 2 (baris uang, form_submission_id NULL).
--
-- SELECT
--   (SELECT count(*) FROM public.form_submissions WHERE id = 'f268acfa-f31e-463e-a014-d868264702ca') AS order_,
--   (SELECT count(*) FROM public.ad_schedules     WHERE submission_id = 'f268acfa-f31e-463e-a014-d868264702ca') AS jadwal,
--   (SELECT count(*) FROM public.survey_pages     WHERE submission_id = 'f268acfa-f31e-463e-a014-d868264702ca') AS halaman,
--   (SELECT count(*) FROM public.invoices WHERE payment_id = 'JFU-f268acfa-1792980234274' AND form_submission_id IS NULL)
--   + (SELECT count(*) FROM public.transactions WHERE payment_id = 'JFU-f268acfa-1792980234274' AND form_submission_id IS NULL) AS uang;


-- ============================================================================
-- Rollback penuh setelah COMMIT:
--   insert into public.form_submissions select * from backup.del_20261026_f268acfa_form_submissions;
--   -- trigger trg_ad_schedule_from_submission membuat ulang ad_schedules ordinal 1;
--   -- cek duplikat SEBELUM menyisipkan snapshot jadwal (ordinal 2 perlu disisip manual).
--   insert into public.survey_pages select * from backup.del_20261026_f268acfa_survey_pages;
--   update public.invoices     set form_submission_id = 'f268acfa-f31e-463e-a014-d868264702ca'
--     where payment_id = 'JFU-f268acfa-1792980234274';
--   update public.transactions set form_submission_id = 'f268acfa-f31e-463e-a014-d868264702ca'
--     where payment_id = 'JFU-f268acfa-1792980234274';
--
-- Setelah yakin bersih (mis. 2 minggu), buang snapshot:
--   drop table backup.del_20261026_f268acfa_form_submissions,
--              backup.del_20261026_f268acfa_ad_schedules,
--              backup.del_20261026_f268acfa_survey_pages,
--              backup.del_20261026_f268acfa_invoices,
--              backup.del_20261026_f268acfa_transactions;
-- ============================================================================
