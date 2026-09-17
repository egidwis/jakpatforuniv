-- ============================================================================
-- 89. Peneliti boleh MEMESAN ULANG jadwal perpanjangan yang sudah dilepas
-- ============================================================================
--
-- MASALAHNYA. Policy `"Peneliti melepas reservasinya sendiri"` mensyaratkan
-- `slot_booked_by = 'user'` di klausa USING. Itu benar untuk apa yang
-- dinamakannya — MELEPAS reservasi yang sedang dipegang.
--
-- Tapi jadwal yang SUDAH dilepas punya `slot_booked_by = NULL`: baik
-- `cancelSchedule()` maupun `releaseExpiredSlot()` mengosongkannya. Jadi
-- begitu jadwalnya lepas, peneliti kehilangan hak UPDATE atas barisnya
-- sendiri — dan pemesanan ulang gagal dengan **nol baris, tanpa galat**.
--
-- Terukur di produksi 2026-09-17, tepat sebelum berkas ini ditulis:
--
--   jadwal ordinal >=2 yang ada di layar "Reservasi Dilepas" : 9
--   di antaranya lolos USING policy lama                     : 0
--     (8 baris `slot_booked_by = NULL`, 1 baris `admin`)
--
-- Nol dari sembilan. Tanpa policy ini, `rebookSchedule()` di klien akan
-- melempar "tidak bisa dipesan ulang" untuk 100% sasarannya, dan sebabnya
-- tidak akan kelihatan di mana pun — PostgREST memulangkan array kosong, bukan
-- error. Ini kambuh KEEMPAT dari pola yang sama (lihat memori proyek:
-- "RLS UPDATE hilang = 0 baris senyap").
--
-- ⚠️ KENAPA POLICY BARU, BUKAN MELONGGARKAN YANG LAMA. Policy lama menjaga
-- transisi "dipegang → lepas"; kalau `slot_booked_by = 'user'` dicabut dari
-- USING-nya, ia juga akan mengizinkan peneliti melepas jadwal yang dipesan
-- ADMIN. Dua izin yang berbeda, dua policy — RLS meng-OR-kan policy PERMISSIVE,
-- jadi menambah yang baru tidak melemahkan yang lama.
--
-- ⚠️ YANG TIDAK DIIZINKAN DI SINI, dan sengaja:
--   * Jadwal yang sudah LUNAS — dijaga di USING dan WITH CHECK.
--   * Jadwal yang MASIH DIPEGANG (`slot_booked_by` terisi) — pemesanan ulang
--     hanya sah dari keadaan "dilepas". Peneliti TIDAK pernah bisa menukar
--     jadwal yang masih berjalan; itu tetap wewenang admin.
--   * Jadwal ordinal 1 — barisnya cermin dari `form_submissions` dan
--     ditangani `rebookSlotForSubmission`. Dibatasi lewat `source_table`.
--   * Kolom uang — `guard_extend_payment_columns()` tetap berlaku dan menolak
--     perubahan `payment_status`/`total_cost`/`subtotal`/`ppn_amount` dari
--     pemanggil non-admin. Policy ini tidak melemahkannya.
--
-- Tumpang tindih jendela tetap ditolak `trg_ad_schedules_extend_rules`
-- (`assert_schedule_window_free`), yang menyala setiap `start_date` berubah.
--
-- Idempoten: DROP POLICY IF EXISTS lebih dulu.
-- ============================================================================

DROP POLICY IF EXISTS "Peneliti memesan ulang jadwal yang sudah dilepas"
  ON public.ad_schedules;

CREATE POLICY "Peneliti memesan ulang jadwal yang sudah dilepas"
  ON public.ad_schedules
  FOR UPDATE
  USING (
    -- Hanya baris perpanjangan. Ordinal 1 punya jalurnya sendiri.
    source_table = 'form_submissions_extend'
    -- Hanya yang SUDAH lepas. `NULL` = tidak sedang dipegang siapa pun.
    AND slot_booked_by IS NULL
    AND COALESCE(payment_status, '') NOT IN ('paid', 'completed')
    AND submission_id IN (
      SELECT fs.id FROM form_submissions fs
      WHERE fs.auth_user_id = auth.uid()
         OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
    )
  )
  WITH CHECK (
    source_table = 'form_submissions_extend'
    -- Sesudah tulisan: barisnya kembali dipegang PENELITI, bukan admin.
    -- Tanpa baris ini, peneliti bisa menulis `slot_booked_by = 'admin'` dan
    -- membuat jadwalnya tidak pernah lepas sendiri lagi.
    AND slot_booked_by = 'user'
    AND slot_reserved_at IS NOT NULL
    AND COALESCE(payment_status, '') NOT IN ('paid', 'completed')
    AND submission_id IN (
      SELECT fs.id FROM form_submissions fs
      WHERE fs.auth_user_id = auth.uid()
         OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
    )
  );

COMMENT ON POLICY "Peneliti memesan ulang jadwal yang sudah dilepas"
  ON public.ad_schedules IS
  'Phase 4 (2026-09-17): peneliti memesan ulang jadwal perpanjangan yang hold-nya '
  'lepas atau dibatalkan. Melengkapi policy "melepas reservasinya sendiri", yang '
  'USING-nya mensyaratkan slot_booked_by=user sehingga tidak pernah cocok dengan '
  'baris yang sudah dilepas (slot_booked_by NULL). Tidak mengizinkan pemindahan '
  'jadwal yang masih dipegang — itu tetap wewenang admin.';

-- ============================================================================
-- VERIFIKASI (jalankan manual sesudah menerapkan)
-- ============================================================================
-- -- 1. Policy-nya ada, dan yang lama TIDAK berubah:
-- SELECT polname, polcmd FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
--  WHERE c.relname='ad_schedules' ORDER BY polcmd, polname;
-- -- diharapkan: 5 baris, termasuk DUA policy 'w' milik peneliti.
--
-- -- 2. Sasaran yang kini terjangkau (sebelumnya 0 dari 9):
-- SELECT count(*) FROM ad_schedules a
--  WHERE a.source_table='form_submissions_extend'
--    AND a.slot_booked_by IS NULL
--    AND COALESCE(a.payment_status,'') NOT IN ('paid','completed');
