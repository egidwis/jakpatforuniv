-- ============================================================================
-- ops — "Uji Video Kelas" (slug uji-video-kelas) DITANDAI ACARA UJI (Fase 5B)
-- ============================================================================
--
-- Gerbang 5B butuh satu Video kelas tanpa sesi live untuk dibeli akun uji
-- (tegar@jakpat.net). Acaranya dibuat lewat form admin dengan judul
-- "Uji Video Kelas" dan jenis "Video kelas", lalu file ini dijalankan SEBELUM
-- halamannya diterbitkan.
--
-- Sesudah ini:
--   * selama masa uji, /webinar/uji-video-kelas terbuka (hanya acara is_test
--     atau link pratinjau yang terbuka; _access.js);
--   * transaksinya berlabel Uji di halaman Transaksi dan tidak dihitung pendapatan;
--   * halamannya noindex dan tidak tampil di daftar /webinar.
--
-- Form admin sengaja tidak punya isian is_test, jadi perubahan ini lewat ops.
-- Tidak ada perubahan skema.


-- ── DRY-RUN ── Harapan: tepat satu baris, offer_kind=replay, is_test=false,
--    tanpa order lunas. Bila slug-nya lain (judul berbeda), ganti di semua query.
--
-- SELECT e.slug, e.title, e.status, e.offer_kind, e.is_test, e.is_listed, e.price,
--        (SELECT count(*) FROM public.webinar_orders o WHERE o.event_id = e.id AND o.status = 'paid') AS lunas
--   FROM public.webinar_events e WHERE e.slug = 'uji-video-kelas';
--
-- Bila `lunas` > 0: BERHENTI. Order lunas itu uang sungguhan; bahas dulu
-- sebelum dilabeli uji.


BEGIN;

UPDATE public.webinar_events
   SET is_test = true,
       is_listed = false
 WHERE slug = 'uji-video-kelas'
   AND offer_kind = 'replay'
   AND is_test = false
   AND NOT EXISTS (SELECT 1 FROM public.webinar_orders o
                    WHERE o.event_id = webinar_events.id AND o.status = 'paid')
RETURNING slug, offer_kind, is_test, is_listed;

COMMIT;

-- Harapan: satu baris dikembalikan (uji-video-kelas, replay, true, false).
-- Nol baris = sudah ditandai, jenisnya belum Video kelas (simpan dulu pilihan
-- jenisnya di form), atau ada order lunas (lihat dry-run).


-- ── VERIFIKASI (baca saja) ──
--
-- SELECT slug, offer_kind, status, is_test, is_listed FROM public.webinar_events
--  WHERE slug = 'uji-video-kelas';


-- ── ROLLBACK ──
--
-- UPDATE public.webinar_events SET is_test = false, is_listed = true WHERE slug = 'uji-video-kelas';
