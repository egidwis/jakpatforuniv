-- ============================================================================
-- sql/94 — CRON PELEPAS SLOT KEDALUWARSA
-- ============================================================================
--
-- Utang terakhir Phase 4. Sampai hari ini hold 1 jam adalah aturan yang HANYA
-- ditegakkan browser: `releaseExpiredSlot()` cuma jalan kalau peneliti KEBETULAN
-- sedang membuka halaman jadwal/bayar/retry. Tutup tab = slot ditahan selamanya.
--
-- ── DUA LINGKUP, SENGAJA DIPISAH ───────────────────────────────────────────
--
-- ⚠️ JANGAN DISATUKAN. Ini jebakan yang sudah tertulis di supabase.ts:3485.
--
--   ORDER    → `form_submissions` (ordinal 1). Tanggalnya tinggal di baris order.
--   SCHEDULE → `ad_schedules`     (ordinal >=2). Tanggalnya milik jadwal itu.
--
-- Memakai lingkup ORDER untuk order berjadwal banyak akan mematikan tagihan
-- jadwal SAUDARANYA. Karena itu dua fungsi, bukan satu dengan percabangan.
--
-- ── CERMIN `releaseExpiredSlot()`, BUKAN TAFSIR BARU ────────────────────────
--
--   hanya `slot_booked_by='user'` ....... slotHold.ts — admin tak pernah lepas
--   lewat `slot_reserved_at + 60 menit` . SLOT_HOLD_MS
--   LEWATI yang sudah lunas ............. supabase.ts:3429 (race webhook DOKU)
--   form_submissions: kosongkan tanggal, payment_status='expired',
--                     submission_status='slot_reserved' ... supabase.ts:3434
--   transactions pending → expired ...... supabase.ts:3449
--
-- ⚠️ PENJAGA LUNAS ADA DI DALAM `WHERE`, BUKAN SELECT TERPISAH.
-- Versi klien membaca dulu lalu menulis — dua langkah, ada jendela race dengan
-- webhook DOKU. Jendela itu justru MELEBAR saat cron jalan tiap 10 menit tanpa
-- penonton. Dalam SQL ia bisa dihilangkan sama sekali.
--
-- ⚠️ `payment_status` BUKAN bukti pembayaran (memori proyek): sebagian order
-- dibayar di luar sistem. Karena itu penjaga lunas membaca `transactions` dan
-- `invoices` JUGA, bukan hanya kolom status barisnya sendiri.
--
-- ── KONSEKUENSI YANG DISENGAJA ─────────────────────────────────────────────
--
-- Cron ini MENAMBAH peluang `paid_on_dead_bill`. Hari ini slot kedaluwarsa
-- sering tak pernah ditandai `expired`, jadi pembayaran telat diam-diam
-- diterima sebagai normal. Sesudah ini ia ditolak dan dialarmkan — dan itu
-- PERBAIKAN: uang yang mendarat untuk slot yang sudah lepas memang harus
-- berhenti di meja manusia, bukan menggerakkan jadwal yang tanggalnya sudah
-- diberikan ke orang lain.
--
-- ── TERUKUR SEBELUM DITULIS (2026-09-18, produksi) ─────────────────────────
--
--   kandidat ORDER ............ 8   (4 spam, 2 in_review, 1 cancelled, 1 nyata)
--   di antaranya bertanggal depan  0   → NOL yang sedang memakan kuota
--   transactions pending ...... 0
--   invoices pending .......... 0
--   baris lunas tersentuh ..... 0
--   kandidat SCHEDULE ......... 0   (nol ordinal>=2 punya slot_reserved_at)
--
-- Jadi jalan pertamanya membereskan 8 baris basi dan tidak menyentuh satu pun
-- uang hidup. Nilai sebenarnya ada di DEPAN: sejak Phase 4, `create_ad_schedule`
-- menulis `slot_booked_by='user'` + `slot_reserved_at=NOW()` untuk peneliti,
-- jadi ordinal>=2 ber-hold akan mulai lahir — nolnya hari ini cuma karena
-- fiturnya baru hidup kemarin.
--
-- ⚠️ SECURITY DEFINER + JWT kosong. `pg_cron` jalan sebagai `postgres` tanpa
-- `request.jwt.claims`, dan `guard_payment_columns()` serta
-- `protect_form_submissions()` sama-sama memulangkan NEW untuk klaim NULL —
-- pintu resmi yang sama dipakai `create_ad_schedule`. Diverifikasi dari
-- `pg_get_functiondef`, bukan dari berkas sql.
-- ============================================================================
--
-- ── HASIL PENERAPAN — 2026-09-18, TERVERIFIKASI ────────────────────────────
--
-- Fungsi dibuat, dry-run diperiksa pemilik produk, cron dipasang (jobid 6).
-- Jalan pertama: `succeeded` dalam 176 ms, "1 row".
--
--   dry-run cocok dengan prediksi ... 8/8 PERSIS, nol tak terduga
--   sesudah cron: dilepas ........... 8   (start_date NULL, hold kosong)
--   kandidat tersisa ................ 0
--   baris lunas rusak ............... 0
--
-- Sidik jari global sesudahnya — semuanya UTUH:
--   606 order lunas · 178 jadwal live · 11 jadwal bertanggal depan ·
--   375 halaman terbit · 5 transaksi pending · 6 invoice pending
--
-- ⚠️ Kedelapan transaksinya SUDAH `expired` sebelum cron lahir
-- (Rp 1.571.000, mati sejak lama), dan `invoices` nol baris. Jadi jalan
-- pertama ini TIDAK memicu `paid_on_dead_bill` untuk siapa pun — ia hanya
-- merapikan `form_submissions`. Jalan-jalan berikutnya yang akan menyentuh
-- reservasi hidup.
--
-- ── TIGA CACAT YANG TERTANGKAP SEBELUM DIJADWALKAN ─────────────────────────
--
-- Ketiganya wujud dari jebakan yang sama: plpgsql tidak memeriksa nama kolom
-- saat CREATE, hanya saat BERJALAN.
--
--   1. `survey_pages.form_submission_id` tidak ada — namanya `submission_id`
--      → information_schema
--   2. `invoices.updated_at` tidak ada sama sekali
--      → information_schema
--   3. `submission_id` AMBIGU antara kolom tabel & parameter OUT (42702);
--      fungsinya gagal TOTAL saat dipanggil
--      → hanya ketahuan dari DRY-RUN, tidak dari CREATE
--
-- Nomor 3 itu alasan langkah dry-run tidak boleh dilewati: dua yang pertama
-- bisa dicegah dengan membaca katalog, yang ketiga hanya dengan menjalankan.
-- ============================================================================

BEGIN;

-- ⚠️ DROP DULU. `CREATE OR REPLACE` TIDAK bisa mengubah nama kolom OUT
-- ("cannot change name of input parameter"), dan versi pertama berkas ini
-- sempat diterapkan dengan nama lama `submission_id`/`schedule_id`. Tanpa DROP,
-- penerapan ulang gagal di mesin yang sudah menjalankan versi itu.
DROP FUNCTION IF EXISTS public.cron_release_expired_slots();
DROP FUNCTION IF EXISTS public.release_expired_order_slots();
DROP FUNCTION IF EXISTS public.release_expired_schedule_slots();

-- ── 1. LINGKUP ORDER ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_expired_order_slots()
RETURNS TABLE (lepas_submission_id uuid, tindakan text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH lepas AS (
    UPDATE form_submissions fs
       SET start_date        = NULL,
           end_date          = NULL,
           slot_booked_by    = NULL,
           slot_reserved_at  = NULL,
           submission_status = 'slot_reserved',
           payment_status    = 'expired',
           updated_at        = NOW()
     WHERE fs.slot_booked_by = 'user'
       AND fs.slot_reserved_at IS NOT NULL
       AND fs.slot_reserved_at < NOW() - interval '60 minutes'
       AND fs.start_date IS NOT NULL
       -- Penjaga lunas BERLAPIS, semuanya di dalam WHERE yang sama.
       AND COALESCE(fs.payment_status,'') NOT IN ('paid','completed','expired')
       AND NOT EXISTS (SELECT 1 FROM transactions t
                        WHERE t.form_submission_id = fs.id
                          AND t.status IN ('paid','completed','settled'))
       AND NOT EXISTS (SELECT 1 FROM invoices i
                        WHERE i.form_submission_id = fs.id
                          AND i.status IN ('paid','completed','settled'))
    RETURNING fs.id
  )
  SELECT array_agg(id) INTO v_ids FROM lepas;

  IF v_ids IS NULL THEN RETURN; END IF;

  -- Tagihan yang masih pending ikut mati. Hanya `pending` — status lain
  -- (paid/expired/cancelled) sudah punya artinya sendiri.
  UPDATE transactions SET status = 'expired', updated_at = NOW()
   WHERE form_submission_id = ANY(v_ids) AND status = 'pending';

  -- ⚠️ `invoices` TIDAK punya `updated_at` (diverifikasi information_schema
  -- 18 Sep) — menyebutnya di sini akan lolos CREATE lalu meledak saat cron
  -- BERJALAN. Persis jebakan sql/93 kemarin.
  UPDATE invoices SET status = 'expired'
   WHERE form_submission_id = ANY(v_ids) AND status = 'pending';

  /*
    Halaman iklan ikut dikosongkan (non-fatal di klien, sama di sini).

    ⚠️ `sp.` WAJIB. Tanpa alias, `submission_id` ambigu antara kolom tabel dan
    parameter OUT fungsi ini — plpgsql menolaknya SAAT BERJALAN (42702), bukan
    saat CREATE. Karena itu kolom OUT-nya pun dinamai `lepas_*`.
  */
  UPDATE survey_pages sp
     SET publish_start_date = NULL, publish_end_date = NULL, updated_at = NOW()
   WHERE sp.submission_id = ANY(v_ids);

  RETURN QUERY SELECT unnest(v_ids), 'slot_dilepas'::text;
END;
$$;

-- ── 2. LINGKUP SCHEDULE ─────────────────────────────────────────────────────
-- Perpanjangan TIDAK mengosongkan tanggal seperti lingkup ORDER: jadwal tanpa
-- tanggal tidak punya arti (`create_ad_schedule` mewajibkannya). Yang dilepas
-- adalah HOLD-nya, dan jadwalnya ditandai batal — persis yang dilakukan
-- `cancelSchedule()`. Peneliti memesan lagi lewat JadwalBaruPage.
CREATE OR REPLACE FUNCTION public.release_expired_schedule_slots()
RETURNS TABLE (lepas_schedule_id uuid, tindakan text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH lepas AS (
    UPDATE ad_schedules s
       SET status           = 'cancelled',
           payment_status   = 'expired',
           slot_booked_by   = NULL,
           slot_reserved_at = NULL,
           updated_at       = NOW()
     WHERE s.slot_booked_by = 'user'
       AND s.slot_reserved_at IS NOT NULL
       AND s.slot_reserved_at < NOW() - interval '60 minutes'
       AND s.ordinal >= 2
       AND COALESCE(s.payment_status,'') NOT IN ('paid','completed','expired')
       AND COALESCE(s.status,'') NOT IN ('paid','live','completed','cancelled','slot_cancelled')
       AND NOT EXISTS (SELECT 1 FROM transactions t
                        WHERE t.schedule_id = s.id
                          AND t.status IN ('paid','completed','settled'))
       AND NOT EXISTS (SELECT 1 FROM invoices i
                        WHERE i.schedule_id = s.id
                          AND i.status IN ('paid','completed','settled'))
    RETURNING s.id
  )
  SELECT array_agg(id) INTO v_ids FROM lepas;

  IF v_ids IS NULL THEN RETURN; END IF;

  UPDATE transactions t SET status = 'expired', updated_at = NOW()
   WHERE t.schedule_id = ANY(v_ids) AND t.status = 'pending';

  UPDATE invoices i SET status = 'expired'
   WHERE i.schedule_id = ANY(v_ids) AND i.status = 'pending';

  RETURN QUERY SELECT unnest(v_ids), 'jadwal_dibatalkan'::text;
END;
$$;

-- ── 3. PEMBUNGKUS UNTUK CRON ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_release_expired_slots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order int;
  v_sched int;
BEGIN
  SELECT count(*) INTO v_order FROM release_expired_order_slots();
  SELECT count(*) INTO v_sched FROM release_expired_schedule_slots();

  IF v_order > 0 OR v_sched > 0 THEN
    RAISE LOG 'cron_release_expired_slots: % order, % jadwal dilepas', v_order, v_sched;
  END IF;
END;
$$;

-- ⚠️ HIBAH OTOMATIS DARI pg_default_acl — CABUT DUA PERAN, BUKAN SATU.
--
-- Terukur 18 Sep: `pg_default_acl` untuk objtype 'f' di `public` memberi
-- `=X/` kepada **anon DAN authenticated**. Versi pertama berkas ini hanya
-- mencabut `anon` (mengikuti §00Z), dan hasilnya terbaca di `proacl` sesudah
-- diterapkan:
--
--     authenticated=X/postgres   ← MASIH ADA
--
-- Artinya SETIAP peneliti yang login bisa memanggil tiga fungsi ini. Ketiganya
-- SECURITY DEFINER dan menulis tabel uang, jadi satu panggilan bisa melepas
-- slot & mematikan tagihan milik ORANG LAIN — fungsinya tidak memfilter per
-- pemilik, ia memang dirancang untuk cron.
--
-- §00Z menyebut `anon` karena kasus waktu itu memang anon. Aturannya yang
-- benar: cabut dari SETIAP peran yang muncul di `pg_default_acl`, lalu
-- VERIFIKASI lewat `proacl` — berkas sql BUKAN ACL produksi.
REVOKE ALL ON FUNCTION public.release_expired_order_slots()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_schedule_slots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_release_expired_slots()     FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================================
-- PENJADWALAN — SENGAJA TERPISAH. Jangan jalankan bersama blok di atas.
-- Jalankan HANYA sesudah dry-run di bawah diperiksa pemilik produk.
-- `jobname` sama = upsert, jadi aman diulang (pola sql/48).
-- ============================================================================
--
-- SELECT cron.schedule('release-expired-slots', '*/10 * * * *',
--                      $$SELECT public.cron_release_expired_slots()$$);
--
-- ============================================================================
-- DRY-RUN — jalankan ini DULU, tanpa menulis apa pun.
-- ============================================================================
--
-- BEGIN;
--   SELECT 'ORDER' AS lingkup, * FROM release_expired_order_slots();
--   SELECT 'SCHEDULE' AS lingkup, * FROM release_expired_schedule_slots();
-- ROLLBACK;   -- ⚠️ ROLLBACK, bukan COMMIT.
--
-- ============================================================================
-- VERIFIKASI ACL — WAJIB, berkas sql bukan ACL produksi.
-- Harapan: HANYA postgres & service_role. Kalau `anon` atau `authenticated`
-- muncul, REVOKE di atas tidak kena dan siapa pun bisa memanggilnya.
-- ============================================================================
--
-- SELECT p.proname, array_to_string(p.proacl,' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public'
--   AND p.proname LIKE '%expired_%slots%' ORDER BY p.proname;
--
-- ============================================================================
-- ROLLBACK migrasi
-- ============================================================================
--
-- SELECT cron.unschedule('release-expired-slots');
-- DROP FUNCTION IF EXISTS public.cron_release_expired_slots();
-- DROP FUNCTION IF EXISTS public.release_expired_schedule_slots();
-- DROP FUNCTION IF EXISTS public.release_expired_order_slots();
