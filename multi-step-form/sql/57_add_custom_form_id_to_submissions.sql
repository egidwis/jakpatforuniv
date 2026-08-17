-- 57_add_custom_form_id_to_submissions.sql
--
-- ⚠️ DINOMORI ULANG 2026-08-17 — dulu `47_add_custom_form_id_to_submissions.sql`.
-- Alasannya sama dengan `56_custom_forms.sql`: nomor 47 sudah dipakai
-- `47_restrict_anon_form_submissions.sql` di branch Soft DNA. Isi SQL tidak
-- diubah.
--
-- 🔴 FILE INI PERNAH MENJADI INSIDEN PRODUKSI — baca sebelum menulis migrasi
-- berikutnya. `StepCheckout.tsx` mulai mengirim `custom_form_id` di payload
-- insert `form_submissions` sejak commit `6c42644` (2026-08-13 15:02 WIB) dan
-- ikut ter-deploy, TAPI migrasi ini tidak pernah dijalankan. PostgREST menolak
-- seluruh insert karena nama kolomnya tak dikenal (`42703`), sehingga SETIAP
-- order baru gagal — peneliti cuma melihat toast "gagal menyimpan". Order
-- terakhir yang berhasil masuk 2026-08-13 10:50 WIB; nol order selama empat
-- hari sesudahnya. Diterapkan dan diverifikasi 2026-08-17.
--
-- Pelajarannya: `46_custom_forms.sql` (kini 56) dijalankan, yang ini terlewat.
-- Kalau satu fitur butuh lebih dari satu migrasi, jalankan seluruhnya sebelum
-- kodenya di-deploy — jangan sebagian.
--
-- Traces a form_submissions row back to the JFU-built custom_forms row it
-- was launched from (via the "Sebar via Jakpat" CTA on /dashboard/forms).
-- Nullable: only submissions launched from a JFU form set it; Google-Form
-- and pre-existing rows stay NULL. FK is ON DELETE SET NULL so deleting a
-- custom_forms row never blocks/cascades into paid submission history.
--
-- Idempotent: safe to re-run. Run this in the Supabase SQL Editor.

alter table public.form_submissions
  add column if not exists custom_form_id uuid references public.custom_forms(id) on delete set null;

create index if not exists idx_form_submissions_custom_form_id
  on public.form_submissions(custom_form_id);

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- select column_name, data_type from information_schema.columns
--  where table_name = 'form_submissions' and column_name = 'custom_form_id';

-- ============================================================================
-- Rollback
-- ============================================================================
-- alter table public.form_submissions drop column if exists custom_form_id;
