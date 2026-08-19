-- 65_fix_ad_completed_notifications.sql
-- Date: 2026-08-19  ·  perbaikan sql/60_ad_completed_notifications
--
-- `notify_primary_ads_completed()` TIDAK PERNAH MENGIRIM SATU EMAIL PUN sejak
-- dipasang, dan tidak ada yang tahu karena ia juga tidak pernah gagal.
--
-- ============================================================================
-- BUG 1 — SARINGANNYA HURUF BESAR
-- ============================================================================
--
--   WHERE fs.submission_status IN ('APPROVED', 'PUBLISHED', 'COMPLETED')
--     AND fs.payment_status = 'PAID'
--
-- Kosakata sistem ini huruf kecil: 'approved', 'paid', 'live', 'completed'.
-- Terukur 2026-08-19: saringan itu cocok dengan **0 baris**. Cron-nya berjalan
-- tiap hari 08.10 UTC, lolos tanpa error, dan tidak mengirim apa pun.
--
-- 'PUBLISHED' bahkan bukan nilai yang pernah ada di kolom itu, dalam huruf apa
-- pun — jadi menurunkannya jadi huruf kecil saja tidak cukup, daftarnya memang
-- salah. Diganti pendekatan `notify_primary_ads_live()`: JANGAN menyebut daftar
-- status yang boleh, sebutkan yang TIDAK boleh. Status baru terus lahir di
-- proyek ini ('slot_cancelled' lahir kemarin di sql/62); daftar-izin akan diam-
-- diam berhenti mengenali order yang sah setiap kali itu terjadi.
--
-- ⚠️ Diamnya bug ini yang paling mahal. Ia tidak muncul di `cron.job_run_details`
-- (job-nya sukses), tidak di `net._http_response` (tidak ada permintaan), dan
-- tidak di log endpoint (tidak pernah dipanggil). Satu-satunya gejalanya adalah
-- email yang tidak datang.
--
-- ============================================================================
-- BUG 2 — JAM BERAKHIRNYA DIHITUNG DENGAN RUMUS YANG BEDA
-- ============================================================================
--
-- Versi lama memakai `airing_instant_of_date(end_date)` untuk SEMUA order.
-- Itu benar hanya untuk iklan reguler berjam bawaan. Untuk order berjam tayang
-- kustom dan untuk Kilat, jam berakhirnya lain — dan `notify_primary_ads_live()`
-- sudah memuat peringatannya dengan tepat:
--
--     "Urutan cabang SAMA PERSIS dengan sync_ad_schedule_from_submission() —
--      menyimpang di sini berarti email bisa terkirim padahal papan Schedule
--      sendiri masih bilang belum tayang, atau sebaliknya."
--
-- Fungsi 'completed' menyimpang. Di sini ia diselaraskan: custom -> kilat ->
-- bawaan, urutan yang sama dengan mirror dan dengan notifikasi 'live'.
-- Hari ini menyentuh 1 order berjam kustom dan 14 order Kilat.
--
-- ============================================================================
-- BUG 3 — TIDAK ADA BATAS MUNDUR, JADI SETIAP GANGGUAN JADI BLAST
-- ============================================================================
--
-- Terukur sebelum perbaikan: **181 order** memenuhi syarat sekaligus, 166 di
-- antaranya berakhir lebih dari 7 hari lalu, 101 lebih dari 30 hari, yang
-- tertua **26 Mei 2026**. Memperbaiki Bug 1 tanpa ini akan mengirim 181 email
-- "penayangan iklanmu baru selesai" dalam satu jalannya cron — kalimat yang
-- bohong untuk iklan yang berakhir tiga bulan lalu, dan volume yang membahayakan
-- reputasi pengirim Brevo.
--
-- Batas mundur 7 hari membuat gangguan berikutnya tidak bisa berubah jadi blast:
-- cron mati seminggu tetap menyusul, cron mati sebulan hanya mengirim minggu
-- terakhir. Emailnya tetap jujur menyebut "baru selesai".

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. TUNGGAKAN DIBUNGKAM DULU — SEBELUM saringannya diperbaiki
-- ─────────────────────────────────────────────────────────────────────────
--
-- Keputusan pemilik produk 2026-08-19: tunggakan **ditandai sudah dinotifikasi
-- tanpa dikirimi email**. Hanya iklan yang berakhir SESUDAH perbaikan ini yang
-- mendapat email.
--
-- DUA ANGKA, dan keduanya benar — jangan tertukar:
--
--   181  order yang AKAN DIKIRIMI EMAIL kalau Bug 1 diperbaiki sendirian
--        (punya email, status bukan batal/tolak, berakhir <90 hari)
--   531  baris yang DITANDAI di sini
--
-- Saringannya sengaja LEBIH LEBAR daripada syarat kirim. Yang ditandai adalah
-- "setiap order lunas yang jendelanya sudah berakhir", tanpa peduli status atau
-- ada tidaknya email. Alasannya: status bisa berubah belakangan. Order batal
-- yang dihidupkan lagi, atau order tanpa email yang emailnya diisi admin, akan
-- mendadak memenuhi syarat dan menerima email "penayangan baru selesai" untuk
-- iklan yang berakhir bulan lalu. Menandai lebih lebar membuat pertanyaannya
-- tidak bisa ditanyakan ulang.
--
-- 350 selisihnya tetap tidak akan pernah dikirimi email dengan cara apa pun;
-- menandainya hanya membuat itu tertulis, bukan tersirat.
--
-- Urutannya disengaja: bungkam dulu, baru perbaiki fungsinya. Dalam satu
-- transaksi urutan itu tidak mengubah hasil, tapi ia mengubah apa yang terjadi
-- kalau migrasi ini setengah jalan dijalankan orang lain per bagian. Karena
-- keduanya satu transaksi, TIDAK ADA jendela di mana saringan yang benar hidup
-- tanpa peredamnya.
--
-- `now()` dipakai sebagai penanda "dilewati oleh sql/65", bukan klaim bahwa
-- emailnya terkirim hari ini. Kolomnya memang cuma penanda anti-kirim-ulang.

UPDATE form_submissions fs
SET completed_notified_at = now()
WHERE lower(fs.payment_status) = 'paid'
  AND fs.end_date IS NOT NULL
  AND fs.completed_notified_at IS NULL
  AND (
        CASE
          WHEN fs.airing_hour_wib IS NOT NULL
            THEN airing_instant_of_custom(fs.end_date, fs.airing_hour_wib, fs.airing_minute_wib)
          WHEN fs.distribution_type = 'kilat'
            THEN kilat_instant_of(fs.end_date, fs.kilat_slot_hour)
          ELSE airing_instant_of_date(fs.end_date)
        END
      ) <= now();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Fungsinya
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_primary_ads_completed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
  rec      record;
  v_end    timestamptz;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_ad_completed_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;

  -- Cadangan URL DIPERTAHANKAN, beda dari `notify_primary_ads_live()` yang
  -- gagal-tertutup. Alasannya terukur, bukan selera: `notify_ad_completed_url`
  -- TIDAK ADA di vault (2026-08-19 hanya ada `cron_notify_secret` dan
  -- `notify_ad_live_url`), jadi menghapus cadangannya akan mematikan fitur ini
  -- untuk kedua kalinya — kali ini dengan cara yang berbeda.
  --
  -- Kalau suatu saat rahasianya didaftarkan, ia otomatis menang atas cadangan
  -- ini dan baris ini boleh dibuang.
  IF v_url IS NULL THEN
    v_url := 'https://jakpatforuniv.com/api/notify-ad-completed';
  END IF;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_primary_ads_completed: vault secret cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  FOR rec IN
    SELECT fs.id, fs.email, fs.full_name, fs.title, fs.end_date,
           fs.distribution_type, fs.kilat_slot_hour,
           fs.airing_hour_wib, fs.airing_minute_wib
    FROM public.form_submissions fs
    WHERE lower(fs.payment_status) = 'paid'
      AND fs.end_date IS NOT NULL
      AND fs.email IS NOT NULL
      AND fs.completed_notified_at IS NULL
      -- Daftar-TOLAK, bukan daftar-izin: status baru terus lahir, dan
      -- daftar-izin akan diam-diam berhenti mengenali order yang sah.
      AND lower(fs.submission_status) NOT IN ('rejected','spam','cancelled','slot_cancelled')
  LOOP
    -- Urutan cabang SAMA PERSIS dengan sync_ad_schedule_from_submission() dan
    -- notify_primary_ads_live(). Menyimpang di sini berarti email "sudah
    -- selesai" terkirim padahal papan Schedule masih bilang tayang.
    IF rec.airing_hour_wib IS NOT NULL THEN
      v_end := airing_instant_of_custom(rec.end_date, rec.airing_hour_wib, rec.airing_minute_wib);
    ELSIF rec.distribution_type = 'kilat' THEN
      v_end := kilat_instant_of(rec.end_date, rec.kilat_slot_hour);
    ELSE
      v_end := airing_instant_of_date(rec.end_date);
    END IF;

    -- Belum berakhir → lewati, jangan tandai. Ia akan dijemput cron berikutnya.
    IF v_end > now() THEN
      CONTINUE;
    END IF;

    -- Berakhir terlalu lama → tandai TANPA mengirim. Inilah yang mencegah
    -- gangguan panjang berubah jadi blast, dan yang menjaga kalimat "baru
    -- selesai" tetap jujur.
    IF v_end < now() - INTERVAL '7 days' THEN
      UPDATE public.form_submissions
        SET completed_notified_at = now()
        WHERE id = rec.id;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url     := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'submission_id', rec.id,
        'email',         rec.email,
        'full_name',     rec.full_name,
        'title',         rec.title
      ),
      timeout_milliseconds := 5000
    );

    -- ⚠️ DITANDAI TANPA MEMERIKSA HASIL — sengaja, dan ini memang batasnya.
    -- `net.http_post` asinkron: ia memulangkan request_id, jawabannya mendarat
    -- di `net._http_response` belakangan, jadi tidak ada status yang bisa
    -- diperiksa di transaksi ini. Pola yang sama dipakai
    -- `notify_primary_ads_live()`.
    --
    -- Konsekuensinya nyata dan sudah pernah terjadi (insiden sql/48,
    -- 2026-08-10): kalau endpointnya mati, ordernya tetap ditandai dan
    -- emailnya hilang permanen. Yang menahannya hari ini cuma satu hal —
    -- endpointnya sudah tayang. Kalau pola ini mau dibuat aman, tempatnya
    -- tabel antrean + penyapu yang membaca `net._http_response`, bukan tambalan
    -- di sini.
    UPDATE public.form_submissions
      SET completed_notified_at = now()
      WHERE id = rec.id;
  END LOOP;
END;
$$;

COMMIT;

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
--
--   -- 0 — tidak ada lagi tunggakan yang menunggu dikirim
--   SELECT count(*) FROM form_submissions fs
--   WHERE lower(fs.payment_status)='paid' AND fs.end_date IS NOT NULL
--     AND fs.completed_notified_at IS NULL
--     AND airing_instant_of_date(fs.end_date) <= now();
--
--   -- 531 — tunggakan yang dibungkam (bukan 181; lihat "DUA ANGKA" di atas)
--   SELECT count(*) FROM form_submissions WHERE completed_notified_at IS NOT NULL;
--
--   -- 7 — masih tayang, akan dapat email saat berakhir nanti
--   SELECT count(*) FROM form_submissions fs
--   WHERE lower(fs.payment_status)='paid' AND fs.completed_notified_at IS NULL
--     AND fs.end_date IS NOT NULL
--     AND airing_instant_of_date(fs.end_date) > now();
--
--   -- Uji sungguhan baru bisa dilakukan saat ada iklan yang berakhir.
--   -- Untuk memaksanya lebih cepat: kosongkan completed_notified_at SATU order
--   -- yang berakhir <7 hari lalu, lalu `SELECT notify_primary_ads_completed();`
--   -- dan periksa net._http_response (retensinya pendek — periksa segera).
