-- ============================================================================
-- ops — "Uji Webinar" (slug uji-webinar) DITANDAI ACARA UJI
-- ============================================================================
--
-- Temuan 6 Nov: acara ini dibuat lewat form untuk menguji, tetapi tercatat
-- sebagai acara sungguhan (is_test=false, is_listed=true, Rp 99.999, sedang
-- dijual). Begitu saklar masa uji dimatikan, acara ini tampil di /webinar dan
-- bisa dibeli siapa saja.
--
-- Sesudah ini: transaksinya berlabel uji, halaman noindex, tidak tampil di
-- daftar. Turunkan harga ke Rp 1.000 lewat form, lalu pakai untuk uji Fase 3
-- (Cek ke DOKU, pembatalan, refund) dan batalkan sesudahnya.
--
-- Form admin sengaja tidak punya isian is_test, jadi perubahan ini lewat ops.


-- ── DRY-RUN ── Harapan: satu baris, is_test=false, belum ada order lunas.
--
-- SELECT e.slug, e.title, e.status, e.is_test, e.is_listed, e.price,
--        (SELECT count(*) FROM public.webinar_orders o WHERE o.event_id = e.id AND o.status = 'paid') AS lunas
--   FROM public.webinar_events e WHERE e.slug = 'uji-webinar';
--
-- Bila `lunas` > 0: BERHENTI. Order lunas itu uang sungguhan untuk acara yang
-- tercatat sungguhan; bahas dulu sebelum dilabeli uji.


BEGIN;

UPDATE public.webinar_events
   SET is_test = true,
       is_listed = false
 WHERE slug = 'uji-webinar'
   AND is_test = false
   AND NOT EXISTS (SELECT 1 FROM public.webinar_orders o
                    WHERE o.event_id = webinar_events.id AND o.status = 'paid')
RETURNING slug, is_test, is_listed;

COMMIT;

-- Harapan: satu baris dikembalikan (uji-webinar, true, false). Nol baris =
-- sudah ditandai sebelumnya, atau ada order lunas (lihat dry-run).


-- ── ROLLBACK ──
--
-- UPDATE public.webinar_events SET is_test = false, is_listed = true WHERE slug = 'uji-webinar';
