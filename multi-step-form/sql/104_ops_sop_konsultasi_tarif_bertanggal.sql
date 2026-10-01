-- ============================================================================
-- sql/104 — SOP Mimin "Konsultasi Pemilihan Layanan": buang angka tarif tetap
-- ============================================================================
--
-- SOP aktif ini (ai_skills 67ed9524…) menyuruh Mimin menyebut
-- "Survey Ads (mulai Rp 150.000)". Itu benar s/d 30 Nov 2026, SALAH mulai
-- 1 Des (tier terendah Rp160.000) dan 1 Jan 2027 (Rp200.000).
--
-- Sejak kode fix/admin-harga-perkenalan, ChatPage SELALU menempelkan bagian
-- "=== TARIF IKLAN (OTOMATIS DARI SISTEM) ===" ke prompt Mimin (disusun dari
-- AD_RATE_SCHEDULE, src/utils/miminPricing.ts). Berkas ini mengganti angka di
-- SOP dengan rujukan ke bagian itu — tanpa angka, supaya tidak basi lagi.
--
-- Hanya SATU frasa yang diganti (`replace`), sisa SOP tidak disentuh. Ini
-- data, bukan skema: nol DDL, nol fungsi, nol hibah.
--
-- ⚠️ URUTAN — KEBALIKAN KEBIASAAN: jalankan SETELAH kode di-push & dideploy.
-- Sebelum deploy, bagian TARIF IKLAN belum ada di prompt, dan SOP yang
-- merujuknya membuat Mimin tidak punya angka tarif SAMA SEKALI (prompt di
-- ai_settings.system_prompt tidak memuat harga — dicek 1 Okt 2026).
-- Cek dulu: tanya Mimin "berapa tarif iklan 40 soal?" → harus menjawab
-- Rp300.000/hari, normal Rp500.000, harga perkenalan s/d 30 Nov 2026.
--
-- ── CARA MENJALANKAN ────────────────────────────────────────────────────────
--
--   0. Jalankan §0 PRATINJAU (SELECT murni) — `ada_frasa_lama` harus 1.
--   1. Jalankan blok BEGIN…ROLLBACK apa adanya = DRY-RUN. Penjaga MELEMPAR
--      ERROR bila jumlah baris berubah ≠ 1, jadi "Success. No rows returned"
--      = lulus. (SQL Editor Supabase tidak menampilkan NOTICE.)
--   2. Kalau lulus: ganti HANYA baris `ROLLBACK;` paling akhir → `COMMIT;`,
--      lalu jalankan lagi.
--   3. Jalankan §3 VERIFIKASI.
--   Rollback penuh ada di §4 (dikomentari).
--
-- ── §0. PRATINJAU (jalankan terpisah, SELECT murni) ─────────────────────────
--
-- select id, name, is_active, updated_at,
--        position('Survey Ads (mulai Rp 150.000)' in sop_instructions) > 0 as ada_frasa_lama,
--        sop_instructions
--   from ai_skills
--  where id = '67ed9524-8ce4-42fb-8ebd-e48178cf22e5';
-- ============================================================================

BEGIN;

-- ── §1. GANTI FRASA ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ai_skills
     SET sop_instructions = replace(
           sop_instructions,
           'Survey Ads (mulai Rp 150.000)',
           'Survey Ads (tarif per hari mengikuti jumlah pertanyaan & tanggal order — sebut angkanya dari bagian TARIF IKLAN (OTOMATIS DARI SISTEM) beserta periodenya)'
         ),
         updated_at = now()
   WHERE id = '67ed9524-8ce4-42fb-8ebd-e48178cf22e5'
     AND position('Survey Ads (mulai Rp 150.000)' in sop_instructions) > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'sql/104 GAGAL: % baris berubah (harus 1) — SOP sudah disunting atau sudah diterapkan? Jalankan §0.', v_rows;
  END IF;
END $$;

-- ── §2. UJI (dalam transaksi yang sama) ─────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ai_skills
     WHERE sop_instructions LIKE '%mulai Rp 150.000%'
  ) THEN
    RAISE EXCEPTION 'U1 GAGAL: masih ada SOP yang menyebut "mulai Rp 150.000"';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ai_skills
     WHERE id = '67ed9524-8ce4-42fb-8ebd-e48178cf22e5'
       AND sop_instructions LIKE '%bagian TARIF IKLAN (OTOMATIS DARI SISTEM)%'
  ) THEN
    RAISE EXCEPTION 'U2 GAGAL: rujukan ke bagian TARIF IKLAN tidak tertulis';
  END IF;
END $$;

ROLLBACK;   -- ← DRY-RUN. Ganti jadi COMMIT; setelah dry-run lulus.

-- ── §3. VERIFIKASI (sesudah COMMIT) ─────────────────────────────────────────
--
-- select name, updated_at,
--        position('TARIF IKLAN (OTOMATIS DARI SISTEM)' in sop_instructions) > 0 as rujukan_baru,
--        position('mulai Rp 150.000' in sop_instructions) > 0 as frasa_lama
--   from ai_skills
--  where id = '67ed9524-8ce4-42fb-8ebd-e48178cf22e5';
--   → rujukan_baru = true, frasa_lama = false.

-- ── §4. ROLLBACK PENUH ──────────────────────────────────────────────────────
--
-- BEGIN;
-- DO $$
-- DECLARE v_rows integer;
-- BEGIN
--   UPDATE ai_skills
--      SET sop_instructions = replace(
--            sop_instructions,
--            'Survey Ads (tarif per hari mengikuti jumlah pertanyaan & tanggal order — sebut angkanya dari bagian TARIF IKLAN (OTOMATIS DARI SISTEM) beserta periodenya)',
--            'Survey Ads (mulai Rp 150.000)'
--          ),
--          updated_at = now()
--    WHERE id = '67ed9524-8ce4-42fb-8ebd-e48178cf22e5'
--      AND position('bagian TARIF IKLAN (OTOMATIS DARI SISTEM)' in sop_instructions) > 0;
--   GET DIAGNOSTICS v_rows = ROW_COUNT;
--   IF v_rows <> 1 THEN
--     RAISE EXCEPTION 'rollback sql/104: % baris berubah (harus 1)', v_rows;
--   END IF;
-- END $$;
-- COMMIT;
