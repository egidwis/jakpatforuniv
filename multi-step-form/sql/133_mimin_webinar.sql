-- ============================================================================
-- sql/133 — MIMIN MENGENAL WEBINAR
-- ============================================================================
--
-- Pembeli webinar melihat Chat Mimin di dashboard, sedangkan prompt produksi belum
-- menyebut webinar. Berkas ini MENAMBAH satu blok di akhir prompt dan tidak mengubah
-- isi lama. `ai_settings.system_prompt` menang atas prompt bawaan ChatPage.
--
-- Jalankan SESUDAH kode Fase 2 dideploy, supaya Mimin tidak menyebut menu yang belum ada.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- Harapan: panjang ± 1535, pos = 0 (belum menyebut webinar). Bila pos > 0, BERHENTI.
--
-- SELECT length(value) AS panjang, position('WEBINAR' IN value) AS pos
--   FROM public.ai_settings WHERE key = 'system_prompt';


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

UPDATE public.ai_settings
   SET value = value || E'\n\n=== WEBINAR DAN VIDEO KELAS ===\n' ||
     E'- JFU juga menjual tiket webinar dan video kelas. Daftarnya ada di menu Webinar pada dashboard dan di halaman /webinar.\n' ||
     E'- Jangan mengarang jadwal, harga, pembicara, atau kuota acara. Arahkan pengguna membaca menu Webinar.\n' ||
     E'- Untuk kendala pembelian, tiket, link gabung, atau rekaman, arahkan pengguna menghubungi admin di product@jakpat.net.\n' ||
     E'- Jangan menjanjikan, menjelaskan, atau membahas pengembalian dana webinar. Bila ditanya, arahkan ke admin.'
 WHERE key = 'system_prompt'
   AND position('WEBINAR DAN VIDEO KELAS' IN value) = 0;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- Harapan: pos > 0, dan akhir teks berisi blok webinar.
--
-- SELECT position('WEBINAR DAN VIDEO KELAS' IN value) AS pos, right(value, 200)
--   FROM public.ai_settings WHERE key = 'system_prompt';


-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- BEGIN;
-- UPDATE public.ai_settings
--    SET value = rtrim(left(value, position(E'\n\n=== WEBINAR DAN VIDEO KELAS ===' IN value) - 1))
--  WHERE key = 'system_prompt' AND position('WEBINAR DAN VIDEO KELAS' IN value) > 0;
-- COMMIT;
