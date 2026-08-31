-- ============================================================================
-- OPS (bukan migrasi skema): hapus SUBMISSION uji QRIS "Production House",
-- TAPI PERTAHANKAN baris uangnya.
--
-- Latar: 2026-08-31 notification URL produk QRIS di dashboard DOKU diperbaiki
-- (dulu menunjuk my.dokuwallet.com, bukan endpoint kita — lihat memori
-- doku-qris-notification-misrouted). Pembuktiannya butuh pembayaran QRIS
-- sungguhan Rp 1.110, invoice JFU-INV-af91c0-1788163681951. Webhook mendarat
-- 32 detik kemudian, outcome='ok' — fix terbukti.
--
-- Masalahnya: order uji itu MENGUNCI SLOT JADWAL 7–12 Sep 2026 untuk peneliti
-- asli. Itu satu-satunya alasan pembersihan ini.
--
-- BEDA DARI ops_cleanup_test_account_tegarerputra.sql: skrip itu MENGHAPUS
-- invoices+transactions. Di sini keduanya SENGAJA DIPERTAHANKAN (permintaan
-- pemilik produk: "angkanya tetap dipertahankan") — uangnya benar-benar masuk
-- ke DOKU, jadi barisnya tetap perlu ada untuk rekonsiliasi settlement.
--
-- Caranya: `form_submission_id` di kedua tabel itu NULLABLE, dan FK-nya
-- NO ACTION (memblokir) — bukan CASCADE. Jadi cukup di-NULL-kan; tidak perlu
-- dihapus. `schedule_id` tidak perlu disentuh sama sekali: FK-nya SET NULL,
-- jadi ia rontok sendiri saat ad_schedules ikut CASCADE.
--
-- Dampak ke analytics: NOL. `isInternalTestTx()` (src/utils/analytics/revenue.ts)
-- sudah mengecualikan baris ini dua kali — nominal < INTERNAL_TEST_AMOUNT_THRESHOLD
-- (10.000) DAN email cocok /@jakpat\.(net|com)$/. Jadi Rp 1.110 memang tidak
-- pernah ikut terhitung di tab Revenue, sebelum maupun sesudah skrip ini.
--
-- Cakupan terverifikasi (dihitung 2026-08-31, 1 submission):
--   form_submissions   1  <- jangkar, dihapus
--   ad_schedules       1  <- CASCADE (ordinal 1, 7 Sep → 12 Sep)  <-- TUJUAN
--   survey_pages       1  <- CASCADE (slug 'asd')
--   scheduled_ads      0
--   invoices           1  <- DIPERTAHANKAN, form_submission_id -> NULL
--   transactions       1  <- DIPERTAHANKAN, form_submission_id -> NULL
--
-- Jalankan di Supabase SQL Editor / psql sebagai postgres.
-- ============================================================================

begin;

-- Jangkar tunggal & eksplisit: satu baris, bukan pola pencarian.
create temporary table _victim on commit drop as
select id from public.form_submissions
where id = 'af91c0f3-acde-4061-b58d-fbd662ab5fbf';

-- Gerbang pengaman. Order uji ini identitasnya khas: email internal DAN
-- tagihan di bawah ambang uji. Kalau salah satu tidak cocok, jangkarnya salah.
do $$
declare n integer; email_ok integer; nominal_ok integer;
begin
  select count(*) into n from _victim;
  if n <> 1 then
    raise exception 'Jangkar harus persis 1 baris, dapat % — batal.', n;
  end if;

  select count(*) into email_ok from public.form_submissions
  where id in (select id from _victim) and email ~* '@jakpat\.(net|com)$';
  if email_ok <> 1 then
    raise exception 'Submission bukan akun internal @jakpat.net — batal.';
  end if;

  select count(*) into nominal_ok from public.invoices
  where form_submission_id in (select id from _victim) and amount < 10000;
  if nominal_ok <> 1 then
    raise exception 'Tagihannya bukan nominal uji (<10.000) — batal.';
  end if;

  raise notice 'Jangkar sah: 1 order uji internal.';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Snapshot ke skema `backup` (BUKAN `public`) — CTAS tidak mewarisi RLS,
--    dan default privileges anon hanya berlaku di `public`.
-- ---------------------------------------------------------------------------
create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table backup.del_20260831_form_submissions as
  select * from public.form_submissions where id in (select id from _victim);
create table backup.del_20260831_ad_schedules as
  select * from public.ad_schedules where submission_id in (select id from _victim);
create table backup.del_20260831_survey_pages as
  select * from public.survey_pages where submission_id in (select id from _victim);
-- Snapshot invoices/transactions BUKAN untuk restore (barisnya tidak dihapus),
-- melainkan untuk merekam `form_submission_id` aslinya sebelum di-NULL-kan.
create table backup.del_20260831_invoices as
  select * from public.invoices where form_submission_id in (select id from _victim);
create table backup.del_20260831_transactions as
  select * from public.transactions where form_submission_id in (select id from _victim);

revoke all on all tables in schema backup from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lepaskan baris uang dari induknya — DIPERTAHANKAN, bukan dihapus.
--    Ini yang membuka jalan langkah 3 tanpa mengorbankan catatan uangnya.
-- ---------------------------------------------------------------------------
update public.transactions set form_submission_id = null
where form_submission_id in (select id from _victim);

update public.invoices set form_submission_id = null
where form_submission_id in (select id from _victim);

-- ---------------------------------------------------------------------------
-- 3. Jangkar. Ini yang meng-CASCADE ad_schedules (slot 7–12 Sep terbebas),
--    survey_pages, page_respondents, survey_winners, scheduled_ads.
-- ---------------------------------------------------------------------------
delete from public.form_submissions where id in (select id from _victim);

-- ---------------------------------------------------------------------------
-- 4. Verifikasi DI DALAM transaksi — exception = ROLLBACK otomatis.
-- ---------------------------------------------------------------------------
do $$
declare sisa integer; uang integer;
begin
  select
      (select count(*) from public.form_submissions f
         where f.id in (select id from backup.del_20260831_form_submissions))
    + (select count(*) from public.ad_schedules a
         where a.submission_id in (select id from backup.del_20260831_form_submissions))
    + (select count(*) from public.survey_pages p
         where p.submission_id in (select id from backup.del_20260831_form_submissions))
  into sisa;
  if sisa <> 0 then
    raise exception 'Verifikasi gagal: % baris tersisa, rollback.', sisa;
  end if;

  -- Baris uang WAJIB masih ada. Ini pembeda utama skrip ini.
  select
      (select count(*) from public.invoices where payment_id = 'JFU-INV-af91c0-1788163681951')
    + (select count(*) from public.transactions where payment_id = 'JFU-INV-af91c0-1788163681951')
  into uang;
  if uang <> 2 then
    raise exception 'Baris uang hilang (dapat % dari 2) — rollback.', uang;
  end if;

  raise notice 'Bersih. Slot terbebas, 2 baris uang utuh.';
end $$;

commit;

-- ============================================================================
-- Rollback penuh setelah COMMIT:
--   insert into public.form_submissions select * from backup.del_20260831_form_submissions;
--   -- trigger trg_ad_schedule_from_submission bisa membuat ulang ad_schedules;
--   -- cek duplikat SEBELUM menyisipkan snapshot jadwal.
--   insert into public.survey_pages     select * from backup.del_20260831_survey_pages;
--   update public.invoices     set form_submission_id = 'af91c0f3-acde-4061-b58d-fbd662ab5fbf'
--     where payment_id = 'JFU-INV-af91c0-1788163681951';
--   update public.transactions set form_submission_id = 'af91c0f3-acde-4061-b58d-fbd662ab5fbf'
--     where payment_id = 'JFU-INV-af91c0-1788163681951';
--
-- Setelah yakin bersih (mis. 2 minggu), buang snapshot:
--   drop table backup.del_20260831_form_submissions,
--              backup.del_20260831_ad_schedules,
--              backup.del_20260831_survey_pages,
--              backup.del_20260831_invoices,
--              backup.del_20260831_transactions;
-- ============================================================================
