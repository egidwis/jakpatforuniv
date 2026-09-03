-- ============================================================================
-- OPS (bukan migrasi skema): hapus JADWAL testing "SADA #2" (booking_id: JYTST4EE)
-- Tujuan: Membebaskan slot tayang tanggal 8–14 September 2026 di production
--         yang terkunci oleh pesanan pengujian akun "Production House".
--
-- Latar:
-- Di papan Schedule (Agenda & Kalender), entri "#JYTST4EE SADA #2"
-- mengunci slot tayang pukul 15.00 WIB setiap hari dari Selasa, 8 Sep 2026
-- sampai Senin, 14 Sep 2026 (7 hari tayang).
--
-- Karena statusnya sudah lunas (paid / completed), UI dashboard admin secara
-- sengaja tidak menyediakan tombol "Batalkan Jadwal" (guard cancelSchedule:
-- "Jadwal yang sudah lunas tidak bisa dibatalkan dari sini").
--
-- Penanganan Keuangan (invoices & transactions):
-- Sesuai preseden ops_cleanup_test_order_af91c0.sql dan ops_fix_order_af004b84:
-- FK `schedule_id` pada tabel `invoices` dan `transactions` disetel ON DELETE SET NULL.
-- Catatan pembayaran (jika ada) tetap aman di database untuk rekonsiliasi settlement,
-- namun relasinya ke baris jadwal dilepas sehingga slot jadwal langsung terbebas.
--
-- Jalankan di Supabase SQL Editor sebagai postgres.
-- ============================================================================

-- ── LANGKAH 0 (OPSIONAL): AUDIT SEBELUM EKSEKUSI ─────────────────────────────
-- Jalankan kueri ini secara terpisah terlebih dahulu untuk melihat data:
/*
SELECT
    s.id AS schedule_id,
    s.booking_id,
    s.ordinal,
    s.start_date,
    s.end_date,
    s.status,
    s.payment_status,
    s.total_cost,
    fs.id AS submission_id,
    fs.title,
    fs.full_name,
    fs.email
FROM public.ad_schedules s
JOIN public.form_submissions fs ON fs.id = s.submission_id
WHERE s.booking_id = 'JYTST4EE';
*/


-- ── LANGKAH UTAMA: HAPUS JADWAL #JYTST4EE ────────────────────────────────────

BEGIN;

-- 1. Jangkar: pilih baris jadwal berdasarkan booking_id
CREATE TEMPORARY TABLE _victim_schedule ON COMMIT DROP AS
SELECT
    s.id,
    s.submission_id,
    s.booking_id,
    s.ordinal
FROM public.ad_schedules s
WHERE s.booking_id = 'JYTST4EE';

-- 2. Gerbang Pengaman:
--    - Pastikan persis 1 baris jadwal yang cocok.
--    - Pastikan data milik akun testing (Production House / @jakpat.net / judul SADA).
DO $$
DECLARE
    v_count INTEGER;
    v_identity_ok INTEGER;
BEGIN
    SELECT count(*) INTO v_count FROM _victim_schedule;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Jangkar harus persis 1 baris jadwal, ditemukan % baris — transaksi dibatalkan.', v_count;
    END IF;

    SELECT count(*) INTO v_identity_ok
    FROM public.form_submissions fs
    JOIN _victim_schedule v ON v.submission_id = fs.id
    WHERE fs.title ILIKE '%SADA%'
       OR fs.email ~* '@jakpat\.(net|com)$'
       OR fs.full_name ILIKE '%Production House%';

    IF v_identity_ok <> 1 THEN
        RAISE EXCEPTION 'Keamanan: Jadwal ini bukan milik akun/order pengujian "Production House" / "SADA" — transaksi dibatalkan.';
    END IF;

    RAISE NOTICE 'Gerbang aman: 1 jadwal pengujian terverifikasi (#JYTST4EE).';
END $$;

-- 3. Snapshot ke skema `backup` (BUKAN `public` — aman dari RLS dan PostgREST)
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS backup.del_20260903_ad_schedules (
    LIKE public.ad_schedules INCLUDING DEFAULTS
);
ALTER TABLE backup.del_20260903_ad_schedules ENABLE ROW LEVEL SECURITY;

INSERT INTO backup.del_20260903_ad_schedules
SELECT * FROM public.ad_schedules
WHERE id IN (SELECT id FROM _victim_schedule);

-- 4. Hapus baris jadwal dari ad_schedules
--    (FK schedule_id pada invoices & transactions otomatis jadi NULL)
DELETE FROM public.ad_schedules
WHERE id IN (SELECT id FROM _victim_schedule);

-- 5. Resync ordinals untuk jadwal lain dari submission yang sama (jika ada)
DO $$
DECLARE
    v_sub_id UUID;
BEGIN
    SELECT submission_id INTO v_sub_id FROM _victim_schedule LIMIT 1;
    IF v_sub_id IS NOT NULL THEN
        PERFORM public.resync_ad_schedule_ordinals(v_sub_id);
    END IF;
END $$;

-- 6. Verifikasi di dalam transaksi — jika masih ada, otomatis rollback
DO $$
DECLARE
    v_remaining INTEGER;
BEGIN
    SELECT count(*) INTO v_remaining
    FROM public.ad_schedules
    WHERE booking_id = 'JYTST4EE';

    IF v_remaining <> 0 THEN
        RAISE EXCEPTION 'Verifikasi gagal: baris ad_schedules #JYTST4EE masih ada (% baris) — rollback.', v_remaining;
    END IF;

    RAISE NOTICE 'Sukses: Jadwal #JYTST4EE berhasil dihapus. Slot 8–14 September 2026 terbebas.';
END $$;

COMMIT;


-- ── LANGKAH OPSIONAL: JIKA INGIN MENGHAPUS SELURUH SUBMISSION "SADA" ─────────
-- Jika order/submission "SADA" secara keseluruhan adalah order dummy/testing
-- dan ingin dibersihkan sepenuhnya beserta seluruh halaman dan jadwalnya:
/*
BEGIN;

CREATE TEMPORARY TABLE _victim_sub ON COMMIT DROP AS
SELECT id FROM public.form_submissions
WHERE title = 'SADA'
  AND (full_name ILIKE '%Production House%' OR email ~* '@jakpat\.(net|com)$');

-- Putus hubungan dengan baris uang agar tidak memblokir penghapusan FK
UPDATE public.transactions SET form_submission_id = NULL
WHERE form_submission_id IN (SELECT id FROM _victim_sub);

UPDATE public.invoices SET form_submission_id = NULL
WHERE form_submission_id IN (SELECT id FROM _victim_sub);

-- Hapus submission (akan CASCADE menghapus survey_pages dan ad_schedules)
DELETE FROM public.form_submissions
WHERE id IN (SELECT id FROM _victim_sub);

COMMIT;
*/
