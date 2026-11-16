-- ============================================================================
-- sql/135b — WEBINAR: NYALAKAN CRON EMAIL OTOMATIS (Fase 3) — BAGIAN B
-- ============================================================================
--
-- Jalankan SESUDAH:
--   1. sql/135 (Bagian A) diterapkan, dan
--   2. kode Fase 3 sudah dideploy, sehingga POST /api/notify-webinar menjawab
--      401 tanpa ?k= (bukan 404 / halaman SPA).
--
-- Pelajaran insiden sql/48: cron yang jalan sebelum endpoint-nya ada
-- "membakar" notifikasi. Di sini antrean tidak terbakar (baris tetap queued
-- sampai Function mencatat hasilnya), tetapi urutan ini tetap dipegang.
--
-- Rahasia `?k=` memakai vault `cron_notify_secret` yang sudah dipakai
-- notify-ad-live, jadi env CRON_NOTIFY_SECRET di Cloudflare tidak berubah.


-- ── LANGKAH 1 — DRY-RUN ─────────────────────────────────────────────────────
--
-- 1a. Fungsi tick ada (sql/135). Harapan: 1.
-- SELECT count(*) FROM pg_proc WHERE proname = 'webinar_notify_tick';
--
-- 1b. Rahasia bersama ada; URL webinar belum. Harapan: cron_notify_secret saja.
-- SELECT name FROM vault.decrypted_secrets WHERE name IN ('cron_notify_secret', 'webinar_notify_url');
--
-- 1c. Endpoint hidup. Dari terminal (harapan HTTP 401, bukan 404/200 HTML):
--   curl -i -X POST https://submit.jakpatforuniv.com/api/notify-webinar


-- ── LANGKAH 2 — TERAPKAN ────────────────────────────────────────────────────

SELECT vault.create_secret(
  'https://submit.jakpatforuniv.com/api/notify-webinar',
  'webinar_notify_url'
);

-- Tiap menit. Tick hanya memanggil Function bila ada antrean atau H-1 jatuh
-- tempo, jadi menit yang kosong tidak memanggil apa pun.
SELECT cron.schedule('webinar-notify', '* * * * *', $$select public.webinar_notify_tick()$$);


-- ── LANGKAH 3 — VERIFIKASI ──────────────────────────────────────────────────
--
-- 3a. Job terdaftar dan aktif.
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'webinar-notify';
--
-- 3b. Job benar-benar berjalan (tunggu 2 menit). Harapan: status succeeded.
-- SELECT status, return_message, start_time FROM cron.job_run_details
--  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'webinar-notify')
--  ORDER BY start_time DESC LIMIT 5;
--
-- 3c. Sesudah ada email yang diantrekan: Function menjawab 200. Yang dibaca
--     net._http_response, BUKAN cron.job (pelajaran sql/48).
-- SELECT id, status_code, left(content, 200) AS isi, created FROM net._http_response
--  ORDER BY created DESC LIMIT 5;


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- SELECT cron.unschedule('webinar-notify');
-- DELETE FROM vault.secrets WHERE name = 'webinar_notify_url';
