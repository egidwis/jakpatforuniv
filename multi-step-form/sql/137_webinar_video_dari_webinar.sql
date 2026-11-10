-- ============================================================================
-- sql/137 — WEBINAR: VIDEO KELAS "DARI WEBINAR" (PENGHUBUNG)
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-11-02-webinar-jfu.md, "Iterasi 10 Nov (7)".
--
-- Webinar dan Video kelas menjadi dua produk terpisah. Jenis halaman ditentukan
-- saat dibuat dan tidak bisa diubah (fitur ubah jenis Fase 5B dicabut). Video
-- kelas boleh mencatat webinar asalnya, supaya:
--   * pemegang tiket webinar itu tidak membeli rekamannya dua kali
--     (checkout menjawab already_owned dan membawa ke tiketnya);
--   * halaman webinar yang sudah lewat menunjuk ke Video kelasnya.
--
-- ── YANG BERUBAH ────────────────────────────────────────────────────────────
--
--   webinar_events.source_event_id   uuid NULL → webinar_events(id), NO ACTION.
--                                    Acara terbit memang tidak pernah dihapus
--                                    (hapus hanya untuk draft tanpa order).
--   CHECK webinar_events_source_is_replay
--                                    hanya Video kelas yang boleh punya sumber,
--                                    dan sumbernya bukan dirinya sendiri.
--   UNIQUE INDEX webinar_events_source_unique
--                                    satu webinar paling banyak satu Video kelas.
--
-- ── KEPUTUSAN YANG MUDAH SALAH DIBACA ───────────────────────────────────────
--
--   * Syarat "sumber = webinar live yang terbit" TIDAK ditegakkan di sini,
--     melainkan di /api/admin/webinar (butuh membaca baris lain). CHECK hanya
--     menjaga yang bisa dijaga per baris.
--   * Hak akses: webinar_events sudah RLS tanpa policy dan REVOKE dari
--     anon/authenticated (sql/131), jadi kolom baru ikut tertutup. Diverifikasi
--     di langkah 3c.
--   * Terapkan SEBELUM kode di-push: kode baru membaca kolom ini lewat
--     PUBLIC_EVENT_COLUMNS, jadi tanpa kolomnya SEMUA halaman webinar galat.
--     Push ke main = deploy otomatis.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- 1a. Kolom belum ada. Harapan: 0.
--
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'webinar_events' AND column_name = 'source_event_id';
--
-- 1b. Tidak ada baris Video kelas hasil "ubah jenis" Fase 5B (Video kelas yang
--     masih punya jadwal live). Harapan: 0, 0.
--     Bila tidak 0: pilihan "Halaman ini menjual" sempat dipakai. Kabari
--     developer dulu sebelum lanjut.
--
-- SELECT (SELECT count(*) FROM public.webinar_events WHERE offer_kind = 'replay') AS video_kelas,
--        (SELECT count(*) FROM public.webinar_events
--          WHERE offer_kind = 'replay' AND (starts_at IS NOT NULL OR quota IS NOT NULL OR meeting_url IS NOT NULL)) AS video_kelas_berjadwal;


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

ALTER TABLE public.webinar_events
  ADD COLUMN source_event_id uuid REFERENCES public.webinar_events(id),
  ADD CONSTRAINT webinar_events_source_is_replay CHECK (
    source_event_id IS NULL
    OR (offer_kind = 'replay' AND source_event_id <> id)
  );

CREATE UNIQUE INDEX webinar_events_source_unique
  ON public.webinar_events (source_event_id)
  WHERE source_event_id IS NOT NULL;

COMMENT ON COLUMN public.webinar_events.source_event_id IS
  'Video kelas: webinar asal rekamannya (sql/137). Pemegang tiket live lunas acara ini tidak perlu membeli (checkout → already_owned). Satu webinar paling banyak satu Video kelas.';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Kolom + FK. Harapan: 1 baris uuid, dan satu FK ke webinar_events.
--
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'webinar_events' AND column_name = 'source_event_id';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.webinar_events'::regclass
--    AND conname IN ('webinar_events_source_event_id_fkey', 'webinar_events_source_is_replay');
--
-- 3b. Index unik. Harapan: 1 baris dengan WHERE (source_event_id IS NOT NULL).
--
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'webinar_events_source_unique';
--
-- 3c. Tetap tertutup untuk browser. Harapan: false, false.
--
-- SELECT has_column_privilege('anon', 'public.webinar_events', 'source_event_id', 'SELECT') AS anon,
--        has_column_privilege('authenticated', 'public.webinar_events', 'source_event_id', 'SELECT') AS authenticated;


-- ============================================================================
-- ROLLBACK (hanya bila perlu, dan SEBELUM kode baru di-push: kode baru membaca
-- kolom ini. Bila kode baru sudah tayang, revert kodenya dulu.)
-- ============================================================================
--
-- BEGIN;
-- DROP INDEX IF EXISTS public.webinar_events_source_unique;
-- ALTER TABLE public.webinar_events DROP CONSTRAINT IF EXISTS webinar_events_source_is_replay;
-- ALTER TABLE public.webinar_events DROP COLUMN IF EXISTS source_event_id;
-- COMMIT;
