-- ============================================================================
-- OPS: Setel Halaman & Submission testing "SADA" sebagai DIBATALKAN (Cancelled)
--
-- Tujuan:
-- 1. Mengubah status order/submission "SADA" menjadi 'cancelled' (Dibatalkan).
-- 2. Menarik dan membatalkan halaman tayang di `survey_pages` (is_published = false,
--    is_hidden = true, tanggal tayang dinolkan).
-- 3. Membatalkan jadwal tayang di `ad_schedules` (status = 'cancelled',
--    slot_booked_by = NULL, slot_reserved_at = NULL) sehingga SELURUH slot
--    produksi yang dipakai langsung terbebas.
-- 4. Membatalkan tagihan/transaksi yang masih pending (jika ada).
--
-- Catatan:
-- - Menggunakan blok DO $$ PL/pgSQL murni (tidak memicu peringatan RLS di Supabase).
-- - Tabel `invoices` tidak memiliki kolom `updated_at`, jadi hanya set status.
--
-- Jalankan di Supabase SQL Editor sebagai postgres.
-- ============================================================================

DO $$
DECLARE
    v_ids UUID[];
    v_active_pages INTEGER;
    v_active_schedules INTEGER;
BEGIN
    -- 1. Identifikasi ID submission SADA milik akun testing
    SELECT array_agg(id) INTO v_ids
    FROM public.form_submissions
    WHERE title ILIKE '%SADA%'
      AND (full_name ILIKE '%Production House%' OR email ~* '@jakpat\.(net|com)$');

    IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Tidak ditemukan submission SADA milik akun testing — transaksi dibatalkan.';
    END IF;

    IF array_length(v_ids, 1) > 2 THEN
        RAISE EXCEPTION 'Ditemukan % baris yang cocok (terlalu banyak) — dibatalkan demi keamanan.', array_length(v_ids, 1);
    END IF;

    RAISE NOTICE 'Target terverifikasi: % submission ditemukan.', array_length(v_ids, 1);

    -- 2. Batalkan Halaman di `survey_pages`
    --    - Unpublish (is_published = false)
    --    - Sembunyikan dari listing & API mobile (is_hidden = true)
    --    - Kosongkan tanggal tayang
    UPDATE public.survey_pages
    SET is_published = false,
        is_hidden = true,
        publish_start_date = NULL,
        publish_end_date = NULL,
        updated_at = NOW()
    WHERE submission_id = ANY(v_ids);

    -- 3. Batalkan Jadwal di `ad_schedules`
    --    - Status 'cancelled' membebaskan kuota slot di fetchSlotAvailability() & get_extend_slot_occupancy()
    --    - Kosongkan slot_booked_by & slot_reserved_at
    UPDATE public.ad_schedules
    SET status = 'cancelled',
        review_status = 'cancelled',
        slot_booked_by = NULL,
        slot_reserved_at = NULL,
        updated_at = NOW()
    WHERE submission_id = ANY(v_ids);

    -- 4. Batalkan Order di `form_submissions`
    --    - submission_status = 'cancelled' (menampilkan badge "Dibatalkan" di UI)
    --    - status = 'cancelled' (paritas legacy status)
    --    - Kosongkan tanggal reservasi induk
    UPDATE public.form_submissions
    SET submission_status = 'cancelled',
        status = 'cancelled',
        start_date = NULL,
        end_date = NULL,
        slot_booked_by = NULL,
        slot_reserved_at = NULL,
        admin_notes = COALESCE(admin_notes || E'\n', '') || '[ADMIN 2026-09-03] Order dan halaman testing dibatalkan.',
        updated_at = NOW()
    WHERE id = ANY(v_ids);

    -- 5. Batalkan invoice & transaksi yang masih pending (jika ada)
    --    Catatan: tabel `invoices` tidak memiliki kolom `updated_at`
    UPDATE public.invoices
    SET status = 'cancelled'
    WHERE form_submission_id = ANY(v_ids)
      AND status = 'pending';

    UPDATE public.transactions
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE form_submission_id = ANY(v_ids)
      AND status = 'pending';

    -- 6. Verifikasi hasil perubahan
    SELECT count(*) INTO v_active_pages
    FROM public.survey_pages
    WHERE submission_id = ANY(v_ids)
      AND is_published = true;

    IF v_active_pages > 0 THEN
        RAISE EXCEPTION 'Gagal: Masih ada % halaman yang berstatus published.', v_active_pages;
    END IF;

    SELECT count(*) INTO v_active_schedules
    FROM public.ad_schedules
    WHERE submission_id = ANY(v_ids)
      AND status IN ('waiting_payment', 'paid', 'scheduled', 'live');

    IF v_active_schedules > 0 THEN
        RAISE EXCEPTION 'Gagal: Masih ada % jadwal yang aktif.', v_active_schedules;
    END IF;

    RAISE NOTICE 'Sukses: Submission dan halaman SADA berhasil disetel sebagai DIBATALKAN.';
END $$;
