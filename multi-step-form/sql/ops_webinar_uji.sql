-- ============================================================================
-- ops — ACARA DUMMY UNTUK UJI WEBINAR
-- ============================================================================
--
-- Rp 1.110 = Subtotal Rp 1.000 + PPN Rp 110. `is_test` membuat transaksinya
-- berlabel uji dan tidak dihitung pendapatan (Fase 4). Link Zoom sengaja kosong,
-- supaya halaman gabung menampilkan "Link sedang disiapkan".
--
-- Aman dijalankan ulang: slug yang sudah ada tidak ditimpa. Sebelum Fase 2
-- dideploy, acara ini tidak terlihat di mana pun.


-- ── BUAT ACARA (jalankan sekali) ────────────────────────────────────────────

BEGIN;

INSERT INTO public.webinar_events (
  slug, title, summary, description_blocks, speakers,
  starts_at, duration_minutes, price, quota,
  status, offer_kind, sales_mode, is_listed, is_test, published_at
) VALUES (
  'uji-webinar-jfu',
  '[UJI] Olah Data SPSS untuk Skripsi',
  'Acara dummy untuk menguji alur tiket webinar JFU. Jangan dibeli selain oleh tim.',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ini acara dummy untuk pengujian."}]}]}'::jsonb,
  '[{"name":"Pembicara Uji","title":"Tim JFU"}]'::jsonb,
  now() + interval '14 days', 90, 1110, 25,
  'published', 'live', 'open', false, true, now()
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- Harapan: state = on_sale, seats_left = 25.
--
-- SELECT slug, public.webinar_offer_state(e) FROM public.webinar_events e
--  WHERE slug = 'uji-webinar-jfu';


-- ── ALAT UJI (jalankan seperlunya, masing-masing tanpa BEGIN) ───────────────
--
-- Tampilkan di daftar /webinar dan dashboard (publik bisa melihatnya):
-- UPDATE public.webinar_events SET is_listed = true WHERE slug = 'uji-webinar-jfu';
--
-- Sembunyikan lagi:
-- UPDATE public.webinar_events SET is_listed = false WHERE slug = 'uji-webinar-jfu';
--
-- Segera hadir tanpa tanggal:
-- UPDATE public.webinar_events SET sales_mode = 'coming_soon', sales_open_at = NULL WHERE slug = 'uji-webinar-jfu';
--
-- Segera hadir, terbuka sendiri 5 menit lagi:
-- UPDATE public.webinar_events SET sales_mode = 'open', sales_open_at = now() + interval '5 minutes' WHERE slug = 'uji-webinar-jfu';
--
-- Dijual sekarang:
-- UPDATE public.webinar_events SET sales_mode = 'open', sales_open_at = NULL WHERE slug = 'uji-webinar-jfu';
--
-- Ditutup admin:
-- UPDATE public.webinar_events SET sales_mode = 'closed' WHERE slug = 'uji-webinar-jfu';
--
-- Daftar peserta:
-- SELECT o.status, o.buyer_name, o.buyer_email, o.invoice_number, o.ticket_code, o.paid_at, o.paid_via, o.alarm_outcome
--   FROM public.webinar_orders o JOIN public.webinar_events e ON e.id = o.event_id
--  WHERE e.slug = 'uji-webinar-jfu' ORDER BY o.created_at;
--
-- Akhiri uji: acara dibatalkan, bukan dihapus. Order dan baris uang dipertahankan.
-- UPDATE public.webinar_events SET status = 'cancelled', is_listed = false WHERE slug = 'uji-webinar-jfu';
