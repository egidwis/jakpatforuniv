-- ============================================================================
-- sql/128 — SATU PEMBATALAN PESANAN OLEH PENELITI (door_cancel_order)
-- ============================================================================
--
-- Sampai berkas ini, peneliti punya DUA tombol "Batalkan Pesanan" dengan hasil
-- yang berbeda (diukur 26 Okt 2026):
--
--   Kartu order dashboard   `cancelOrder()` browser → `cancelled`, riwayat
--                           `actor: researcher` ditulis TERPISAH (boleh gagal
--                           diam-diam). Tagihan TIDAK disentuh, padahal tombolnya
--                           tampil saat tagihan sudah terbit → #6d5c6775 dan
--                           #101abf8e menyisakan transactions + invoices
--                           `pending` (Rp 3.596.400). Hold `slot_booked_by =
--                           'user'` juga tidak dilepas, jadi cron sql/94 akan
--                           MENGHIDUPKAN order itu lagi jadi `slot_reserved`.
--   Halaman Jadwal & Bayar  door_cancel_schedule → `slot_cancelled` tanpa
--                           pelaku. Kartu lalu berbunyi "Tim Jakpat membatalkan
--                           tanggal tayang…" untuk pembatalan oleh peneliti,
--                           dan langkah 1 & 2 tetap hidup.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   F1  door_cancel_order(actor, email, submission) — BARU, service_role saja,
--       dipanggil /api/schedules/lock aksi `cancel-order`. Dalam SATU
--       transaksi, dengan klaim peneliti (_schedule_door_act_as, sql/123):
--         • form_submissions → `cancelled`, hold dilepas (slot_booked_by &
--           slot_reserved_at NULL), tanggal TETAP (riwayat), payment_status
--           TETAP, review_history + {action: cancelled, actor: researcher};
--         • transactions `pending` order ini → `cancelled`;
--         • invoices `pending` non-tempo order ini → `cancelled`.
--       Link DOKU dimatikan KLIEN lebih dulu (killDokuLinksForSchedule), sama
--       dengan cancelSchedule — DOKU dulu, database kemudian.
--
--       Syarat (nol baris → NULL, tanpa tulisan apa pun):
--         • pemilik baris (policy pemilik, sama dengan door_cancel_schedule);
--         • status ∈ daftar `cancelOrder()` lama: in_review, pending,
--           rejected, approved, slot_reserved, waiting_payment;
--         • belum lunas (payment_status, transactions, invoices — penjaga
--           berlapis cron sql/94);
--         • tidak punya perpanjangan yang masih hidup — pesanan dengan jadwal
--           lain yang berjalan bukan "batal seluruhnya".
--
--   door_cancel_schedule TIDAK diubah. `cancel` tetap dipakai pelepasan hold
--   habis (handleExpired) dan rollback JadwalBaruPage, dan `slot_cancelled`
--   kembali berarti "tim melepas tanggalnya saja". md5 pra-cek sql/124 tetap
--   berlaku.
--
--   Penjaga yang dilewati tulisan ini dengan klaim peneliti (dibaca prod 26
--   Okt): guard_review_decision (pemilik boleh `cancelled` + review_history),
--   guard_payment_columns, guard_self_booking, guard_transaction_columns_for_
--   owner & guard_invoice_columns_for_owner (pemilik boleh pending →
--   cancelled; tagihan tempo DITOLAK, karena itu dikecualikan),
--   guard_paid_status_transition. guard_schedule_door (sql/124) melewatkan
--   `jfu.schedule_door = on`.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 → 2 → 3 SEBELUM kode `cancel-order` dideploy (klien baru
--   memanggil fungsi ini; tanpanya pembatalan gagal 400). Tidak bergantung
--   pada sql/124 — boleh sebelum atau sesudahnya.
--   Langkah 2b (data) boleh kapan saja.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Fungsi baru belum ada, fondasi sql/123 ada. Harapan: baru = 0,
--     act_as = 1.
--
-- SELECT
--   (SELECT count(*) FROM pg_proc WHERE proname = 'door_cancel_order') AS baru,
--   (SELECT count(*) FROM pg_proc WHERE proname = '_schedule_door_act_as') AS act_as;
--
-- 1b. Tagihan zombie yang ditutup Langkah 2b. Harapan: 4 baris (2 transactions
--     + 2 invoices), semuanya `pending`, order #6d5c6775 & #101abf8e,
--     expires_at invoice sudah lewat (link DOKU sudah mati sendiri).
--
-- SELECT 'transactions' AS tabel, t.id, t.status, t.amount, t.payment_id, NULL::timestamptz AS expires_at
-- FROM public.transactions t JOIN public.form_submissions fs ON fs.id = t.form_submission_id
-- WHERE t.status = 'pending' AND fs.submission_status = 'cancelled'
-- UNION ALL
-- SELECT 'invoices', i.id, i.status, i.amount, i.payment_id, i.expires_at
-- FROM public.invoices i JOIN public.form_submissions fs ON fs.id = i.form_submission_id
-- WHERE i.status = 'pending' AND fs.submission_status = 'cancelled';


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

CREATE FUNCTION public.door_cancel_order(p_actor uuid, p_email text, p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  PERFORM _schedule_door_act_as(p_actor, p_email);

  -- ⛔ survey_pages tidak disentuh (sql/99): trg_form_submissions_close_page
  -- menutup jendela halamannya begitu status keluar dari "tayang".
  UPDATE form_submissions fs
  SET submission_status = 'cancelled',
      slot_booked_by    = NULL,
      slot_reserved_at  = NULL,
      review_history    = COALESCE(fs.review_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action',    'cancelled',
        'actor',     'researcher',
        'notes',     'Peneliti membatalkan pesanannya sendiri.',
        'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
      updated_at        = NOW()
  WHERE fs.id = p_submission_id
    AND (fs.auth_user_id = p_actor
         OR (fs.auth_user_id IS NULL
             AND lower(COALESCE(fs.email, '')) = lower(btrim(p_email))))
    AND fs.submission_status IN ('in_review', 'pending', 'rejected', 'approved',
                                 'slot_reserved', 'waiting_payment')
    AND COALESCE(fs.payment_status, '') NOT IN ('paid', 'completed')
    AND NOT EXISTS (SELECT 1 FROM transactions t
                     WHERE t.form_submission_id = fs.id
                       AND t.status IN ('paid', 'completed', 'settled'))
    AND NOT EXISTS (SELECT 1 FROM invoices i
                     WHERE i.form_submission_id = fs.id
                       AND i.status IN ('paid', 'completed', 'settled'))
    AND NOT EXISTS (SELECT 1 FROM ad_schedules a
                     WHERE a.submission_id = fs.id
                       AND a.source_table = 'form_submissions_extend'
                       AND COALESCE(a.status, '') <> 'cancelled')
  RETURNING fs.id INTO v_id;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Satu tagihan hidup di DUA tabel — keduanya ditutup di transaksi yang sama.
  -- `cancelled`, bukan `expired`: tagihan ini dimatikan dengan sengaja, dan
  -- baris `expired` pernah dibalik jadi `paid` oleh Tandai Lunas (sql/101).
  UPDATE transactions
     SET status = 'cancelled', updated_at = NOW()
   WHERE form_submission_id = v_id AND status = 'pending';

  -- Tagihan tempo hanya boleh diubah admin (guard_invoice_columns_for_owner);
  -- order tempo berstatus `scheduled` sehingga tak lolos syarat di atas, jadi
  -- pengecualian ini hanya jaring kedua. `invoices` tak punya updated_at.
  UPDATE invoices
     SET status = 'cancelled'
   WHERE form_submission_id = v_id AND status = 'pending'
     AND NOT COALESCE(is_tempo, false);

  RETURN v_id;
END;
$function$;

-- pg_default_acl memberi anon & authenticated EXECUTE ke setiap fungsi baru.
REVOKE ALL ON FUNCTION public.door_cancel_order(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.door_cancel_order(uuid, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- LANGKAH 2b — DATA: tutup tagihan zombie dua order batal (satu transaksi)
-- ============================================================================
--
-- #6d5c6775 (Rp 1.776.000) dan #101abf8e (Rp 1.820.400) dibatalkan peneliti
-- dari kartu dashboard 7 & 14 Okt; tagihannya tertinggal `pending`. Link DOKU
-- keduanya sudah lewat expires_at (9 & 17 Okt), jadi tidak ada yang perlu
-- dibatalkan di DOKU. Tanpa JWT (SQL Editor) → penjaga pemilik dilewati.

BEGIN;

UPDATE public.transactions
   SET status = 'cancelled', updated_at = NOW()
 WHERE id IN ('33c952d5-4388-4539-baf1-ed261c1dc88e', 'c9372e49-2c0c-4e53-bda0-e07c5e37e643')
   AND status = 'pending';

UPDATE public.invoices
   SET status = 'cancelled'
 WHERE id IN ('ba2b3c92-b733-4460-80bd-881316b81245', '1bb88933-4c61-43a8-9089-01ac199c17d2')
   AND status = 'pending';

-- Nol tagihan pending tersisa pada DUA order ini, atau batal seluruhnya.
-- Sengaja tidak global: pembatalan lewat kartu lama sebelum kode baru
-- dideploy boleh melahirkan zombie baru — itu dicek ulang di 3d, bukan di sini.
DO $cek$
DECLARE v_n int;
BEGIN
  SELECT (SELECT count(*) FROM public.transactions
           WHERE status = 'pending'
             AND form_submission_id IN ('6d5c6775-9447-49d0-b152-a1a20b0c9bb1', '101abf8e-2a3f-4a13-a447-b60353219d40'))
       + (SELECT count(*) FROM public.invoices
           WHERE status = 'pending'
             AND form_submission_id IN ('6d5c6775-9447-49d0-b152-a1a20b0c9bb1', '101abf8e-2a3f-4a13-a447-b60353219d40'))
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'sql/128 2b: harapan 0 tagihan pending pada order batal, dapat %', v_n;
  END IF;
END
$cek$;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Hanya service_role (dan pemilik postgres) yang bisa memanggil.
--     Harapan: proacl memuat postgres & service_role saja — TANPA anon /
--     authenticated.
--
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'door_cancel_order';
--
-- 3b. Uji perilaku tanpa jejak (ROLLBACK di akhir). Ganti :sub dengan order
--     uji MILIK akun uji yang masih `approved`/`waiting_payment` dan belum
--     lunas, :actor & :email dengan auth_user_id & email pemiliknya.
--     Harapan: baris 1 = id order; status cancelled; slot_booked_by NULL;
--     review_history terakhir actor = researcher; tagihan pending = 0.
--
-- BEGIN;
-- SELECT public.door_cancel_order(':actor'::uuid, ':email', ':sub'::uuid);
-- SELECT submission_status, slot_booked_by, review_history -> -1 AS terakhir
--   FROM public.form_submissions WHERE id = ':sub';
-- SELECT count(*) FROM public.transactions WHERE form_submission_id = ':sub' AND status = 'pending';
-- ROLLBACK;
--
-- 3c. Bukan pemilik → NULL, nol tulisan. Harapan: NULL.
--
-- BEGIN;
-- SELECT public.door_cancel_order(gen_random_uuid(), 'bukan@pemilik.test', ':sub'::uuid);
-- ROLLBACK;
--
-- 3d. Sesudah kode baru dideploy: nol tagihan non-tempo `pending` pada order
--     batal. Harapan: 0. Lebih dari 0 = pembatalan lewat kartu lama di celah
--     rilis; tutup barisnya dengan pola 2b.
--
-- SELECT (SELECT count(*) FROM public.transactions t JOIN public.form_submissions fs ON fs.id = t.form_submission_id
--          WHERE t.status = 'pending' AND fs.submission_status = 'cancelled')
--      + (SELECT count(*) FROM public.invoices i JOIN public.form_submissions fs ON fs.id = i.form_submission_id
--          WHERE i.status = 'pending' AND NOT COALESCE(i.is_tempo, false) AND fs.submission_status = 'cancelled') AS zombie;


-- ============================================================================
-- ROLLBACK — hanya bila perlu
-- ============================================================================
--
-- Fungsi: kode `cancel-order` harus di-revert DULU (tanpa fungsi ini tombol
-- batal peneliti gagal 400).
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.door_cancel_order(uuid, text, uuid);
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Data 2b: kembalikan empat baris ke `pending` (link DOKU-nya tetap mati).
--
-- BEGIN;
-- UPDATE public.transactions SET status = 'pending', updated_at = NOW()
--  WHERE id IN ('33c952d5-4388-4539-baf1-ed261c1dc88e', 'c9372e49-2c0c-4e53-bda0-e07c5e37e643')
--    AND status = 'cancelled';
-- UPDATE public.invoices SET status = 'pending'
--  WHERE id IN ('ba2b3c92-b733-4460-80bd-881316b81245', '1bb88933-4c61-43a8-9089-01ac199c17d2')
--    AND status = 'cancelled';
-- COMMIT;
