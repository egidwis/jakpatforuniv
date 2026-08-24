-- ============================================================================
-- OPS (bukan migrasi skema): hapus data testing akun "GANTENG"
-- Tujuan: membersihkan halaman Schedule dari jadwal testing supaya slot yang
-- terlihat kosong memang benar-benar kosong untuk peneliti asli.
--
-- Kartu customer "GANTENG" (24 order) sebenarnya gabungan DUA kelompok baris,
-- karena CustomerDetailSheet menggabungkan order yatim lewat email/telepon:
--   A. 16 baris terikat akun  auth_user_id = fa1ff5d4-f717-4c50-9618-5b98787747c3
--                             (email tegarerputra@gmail.com, 1 pakai @yahoo.com)
--   B.  8 baris YATIM         auth_user_id IS NULL + email tegarerputra@yahoo.com
--                             (order testing 2025, semua payment_status='paid')
-- 16 + 8 = 24, persis seperti di UI.
--
-- !! PERINGATAN: nomor HP 085728008840 juga dipakai akun LAIN
--    (auth_user_id b55f9aac-8ddc-40a7-97ad-3ed9d670529e = "Production House" /
--    product@jakpat.net). Skrip ini SENGAJA tidak menjangkar ke nomor HP,
--    jadi akun itu tidak tersentuh. Jangan ubah jangkar jadi phone_number.
--
-- Cakupan terverifikasi (dihitung 2026-08-20, untuk 24 submission):
--   form_submissions        24  <- jangkar, dihapus terakhir
--   form_submissions_extend  6  <- TIDAK punya FK, harus dihapus manual
--   ad_schedules            30  <- CASCADE dari form_submissions
--   survey_pages             3  <- CASCADE dari form_submissions
--   invoices                28  <- FK NO ACTION, MEMBLOKIR, hapus duluan
--   transactions            36  <- FK NO ACTION, MEMBLOKIR, hapus duluan
--   page_respondents         0  (CASCADE dari survey_pages)
--   survey_winners           0  (CASCADE dari survey_pages)
--   scheduled_ads            0  (CASCADE dari form_submissions)
--   voucher_redemptions      0  (SET NULL)
--   JM_campaigns / JM_creator_wallet / custom_forms  0
--
-- Catatan: 6 baris ad_schedules ordinal>1 bersumber dari form_submissions_extend
-- tapi FK-nya lewat submission_id, jadi tetap ikut CASCADE. Baris extend-nya
-- sendiri tidak punya FK sama sekali - kalau tidak dihapus manual mereka jadi
-- yatim dan bisa memunculkan jadwal hantu lagi.
--
-- Jalankan di Supabase SQL Editor / psql sebagai postgres.
-- ============================================================================

begin;

-- Jangkar tunggal, dipakai ulang di semua langkah.
create temporary table _victim_submissions on commit drop as
select id
from public.form_submissions
where
  -- (A) order yang terikat akun GANTENG
  auth_user_id = 'fa1ff5d4-f717-4c50-9618-5b98787747c3'
  -- (B) order yatim lama milik orang yang sama; hapus baris ini kalau hanya
  --     mau membersihkan kelompok (A) - hasilnya 16 order, bukan 24.
  or (auth_user_id is null and lower(email) = 'tegarerputra@yahoo.com');

create temporary table _victim_pages on commit drop as
select id
from public.survey_pages
where submission_id in (select id from _victim_submissions);

-- Gerbang pengaman: berhenti kalau jangkar salah menjaring akun lain.
do $$
declare n integer; bocor integer;
begin
  select count(*) into n from _victim_submissions;
  if n = 0 then
    raise exception 'Nol submission cocok - jangkar salah, batal.';
  end if;
  if n > 30 then
    raise exception 'Terlalu banyak (% baris) - dugaan jangkar salah, batal.', n;
  end if;

  -- Akun Production House TIDAK boleh ikut terhapus.
  select count(*) into bocor
  from public.form_submissions
  where id in (select id from _victim_submissions)
    and auth_user_id = 'b55f9aac-8ddc-40a7-97ad-3ed9d670529e';
  if bocor > 0 then
    raise exception 'Jangkar menjaring % baris akun Production House, batal.', bocor;
  end if;

  raise notice 'Akan menghapus % form_submissions milik akun testing GANTENG.', n;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Snapshot ke skema `backup` (BUKAN `public`).
--    CTAS tidak mewarisi RLS, dan default privileges anon hanya berlaku di
--    `public` - menaruh snapshot berisi PII di `public` = membocorkannya ke
--    Data API.
-- ---------------------------------------------------------------------------
create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table backup.del_20260820_form_submissions as
  select * from public.form_submissions where id in (select id from _victim_submissions);
create table backup.del_20260820_form_submissions_extend as
  select * from public.form_submissions_extend where submission_id in (select id from _victim_submissions);
create table backup.del_20260820_ad_schedules as
  select * from public.ad_schedules where submission_id in (select id from _victim_submissions);
create table backup.del_20260820_survey_pages as
  select * from public.survey_pages where submission_id in (select id from _victim_submissions);
create table backup.del_20260820_invoices as
  select * from public.invoices where form_submission_id in (select id from _victim_submissions);
create table backup.del_20260820_transactions as
  select * from public.transactions where form_submission_id in (select id from _victim_submissions);
create table backup.del_20260820_page_respondents as
  select * from public.page_respondents where page_id in (select id from _victim_pages);
create table backup.del_20260820_survey_winners as
  select * from public.survey_winners where page_id in (select id from _victim_pages);

revoke all on all tables in schema backup from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Anak dengan FK ON DELETE NO ACTION - kalau tidak dihapus duluan, langkah 4
--    gagal dengan "violates foreign key constraint".
-- ---------------------------------------------------------------------------
delete from public.transactions
where form_submission_id in (select id from _victim_submissions);

delete from public.invoices
where form_submission_id in (select id from _victim_submissions);

-- ---------------------------------------------------------------------------
-- 3. Baris perpanjangan - tidak ada FK ke form_submissions sama sekali, jadi
--    tidak ikut CASCADE dan harus dihapus eksplisit.
-- ---------------------------------------------------------------------------
delete from public.form_submissions_extend
where submission_id in (select id from _victim_submissions);

-- ---------------------------------------------------------------------------
-- 4. Jangkar. Ini yang meng-CASCADE ad_schedules, survey_pages,
--    page_respondents, survey_winners, dan scheduled_ads.
-- ---------------------------------------------------------------------------
delete from public.form_submissions
where id in (select id from _victim_submissions);

-- ---------------------------------------------------------------------------
-- 5. Verifikasi DI DALAM transaksi. Asersi ini melempar exception (= otomatis
--    ROLLBACK) kalau masih ada sisa, jadi aman dijalankan sebagai satu blok.
-- ---------------------------------------------------------------------------
do $$
declare sisa integer; kontrol integer;
begin
  select
      (select count(*) from public.form_submissions f
         where f.id in (select id from backup.del_20260820_form_submissions))
    + (select count(*) from public.ad_schedules a
         where a.submission_id in (select id from backup.del_20260820_form_submissions))
    + (select count(*) from public.survey_pages p
         where p.submission_id in (select id from backup.del_20260820_form_submissions))
    + (select count(*) from public.form_submissions_extend e
         where e.submission_id in (select id from backup.del_20260820_form_submissions))
    + (select count(*) from public.invoices i
         where i.form_submission_id in (select id from backup.del_20260820_form_submissions))
    + (select count(*) from public.transactions t
         where t.form_submission_id in (select id from backup.del_20260820_form_submissions))
  into sisa;
  if sisa <> 0 then
    raise exception 'Verifikasi gagal: masih ada % baris tersisa, rollback.', sisa;
  end if;

  select count(*) into kontrol from public.form_submissions
  where auth_user_id = 'b55f9aac-8ddc-40a7-97ad-3ed9d670529e';
  if kontrol = 0 then
    raise exception 'Kontrol gagal: akun Production House ikut terhapus, rollback.';
  end if;

  raise notice 'Verifikasi bersih. Production House utuh: % baris.', kontrol;
end $$;

select
  (select count(*) from public.form_submissions f
     where f.id in (select id from backup.del_20260820_form_submissions))              as sisa_submissions,
  (select count(*) from public.ad_schedules a
     where a.submission_id in (select id from backup.del_20260820_form_submissions))   as sisa_ad_schedules,
  (select count(*) from public.survey_pages p
     where p.submission_id in (select id from backup.del_20260820_form_submissions))   as sisa_survey_pages,
  (select count(*) from public.form_submissions_extend e
     where e.submission_id in (select id from backup.del_20260820_form_submissions))   as sisa_extend,
  (select count(*) from public.invoices i
     where i.form_submission_id in (select id from backup.del_20260820_form_submissions)) as sisa_invoices,
  (select count(*) from public.transactions t
     where t.form_submission_id in (select id from backup.del_20260820_form_submissions)) as sisa_transactions,
  -- kontrol: akun Production House harus utuh (bukan 0)
  (select count(*) from public.form_submissions
     where auth_user_id = 'b55f9aac-8ddc-40a7-97ad-3ed9d670529e')                      as kontrol_prod_house_utuh;

commit;
-- rollback;  -- <- pakai ini kalau kolom sisa_* di atas tidak semuanya 0

-- ============================================================================
-- Rollback penuh setelah COMMIT (kalau ternyata salah hapus):
--   insert into public.form_submissions        select * from backup.del_20260820_form_submissions;
--   insert into public.form_submissions_extend select * from backup.del_20260820_form_submissions_extend;
--   insert into public.survey_pages            select * from backup.del_20260820_survey_pages;
--   insert into public.ad_schedules            select * from backup.del_20260820_ad_schedules;
--   insert into public.invoices                select * from backup.del_20260820_invoices;
--   insert into public.transactions            select * from backup.del_20260820_transactions;
-- Urutan penting (induk dulu). Trigger trg_ad_schedule_from_submission bisa
-- membuat ulang baris ad_schedules saat form_submissions disisipkan; cek
-- duplikat setelah restore.
--
-- Setelah yakin bersih (mis. 2 minggu), buang snapshot:
--   drop table backup.del_20260820_form_submissions,
--              backup.del_20260820_form_submissions_extend,
--              backup.del_20260820_ad_schedules,
--              backup.del_20260820_survey_pages,
--              backup.del_20260820_invoices,
--              backup.del_20260820_transactions,
--              backup.del_20260820_page_respondents,
--              backup.del_20260820_survey_winners;
-- ============================================================================
