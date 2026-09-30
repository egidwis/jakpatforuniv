-- ============================================================================
-- sql/103 — TARIF BERTANGGAL: kunci `created_at` + `ad_schedules.rate_locked_at`
-- ============================================================================
--
-- Mulai 1 Okt 2026 tarif iklan bergantung TANGGAL (AD_RATE_SCHEDULE di
-- cost-calculator.ts / create-payment.js). Tanggal yang dipakai untuk memilih
-- tarif sebuah jadwal disebut INSTAN TARIF, dan berkas ini membuatnya bisa
-- dipercaya. Dua hal:
--
-- ── A. `form_submissions.created_at` TIDAK BOLEH DITULIS PENELITI ────────────
--
-- Hari ini `anon`/`authenticated` punya hak INSERT+UPDATE pada kolom ini, dan
-- tidak satu pun trigger menjaganya (`protect_form_submissions`,
-- `guard_payment_columns` hanya menjaga kolom uang/status). Karena voucher
-- SUDAH dinilai pada `created_at` (voucherInstantOf), lubang ini hari ini pun
-- bisa menghidupkan voucher kedaluwarsa (JFUSUHUD). Begitu tarif ikut dikunci
-- ke tanggal order, peneliti bisa memundurkan tanggal ordernya dan memperoleh
-- tarif lama selamanya.
--
-- Nol kode aplikasi yang menulis `created_at` (di-grep 29 Sep); satu-satunya
-- penulis SQL adalah skrip ops yang dijalankan tanpa JWT — dan itu tetap boleh.
--
-- ── B. `ad_schedules.rate_locked_at` — instan tarif per jadwal ───────────────
--
-- Aturan (keputusan pemilik produk 29 Sep 2026):
--   • Jadwal PERTAMA memakai tarif saat ORDER dibuat — termasuk bila tanggalnya
--     baru dipilih belakangan (order `choose_schedule`).
--   • Perpanjangan memakai tarif saat perpanjangan DIPESAN.
--   • Jadwal yang DILEPAS (tanggal dikosongkan: hold 1 jam habis, cron sql/94,
--     prepareForReschedule) atau DIBATALKAN (status → 'cancelled' dengan review
--     tetap 'approved' = slot_cancelled / perpanjangan batal) KEHILANGAN
--     tarifnya. Saat dipesan ulang, tarifnya = tarif pada saat pemesanan ulang.
--   • Tanggal tayang dipindah (hari WIB berubah) sebelum lunas = dipesan ulang,
--     SIAPA PUN yang memindah — termasuk admin lewat ScheduleForm (keputusan
--     30 Sep 2026: bayar sesudah tarif naik mengikuti tarif baru). Tarifnya =
--     tarif pada SAAT PEMINDAHAN, bukan saat pembayaran.
--
-- Kolomnya diisi HANYA oleh trigger. NULL berarti "belum dipesan ulang sejak
-- dilepas" — pembaca memakai "sekarang" (tarif yang berlaku saat ia dipesan).
--
-- ⚠️ Kenapa kolom, bukan `slot_reserved_at`: kolom itu ditulis peneliti sendiri
-- (submitOrder.ts, ScheduleForm) dan dikosongkan setiap pelepasan — tidak bisa
-- dipercaya dan tidak bisa membedakan "pertama kali" dari "pesan ulang".
--
-- ⚠️ Kenapa cabang pembatalan menyaring `review_status = 'approved'`:
-- `airing_status_of()` memetakan 'rejected'/'spam' juga ke 'cancelled'. Order
-- yang ditolak lalu direvisi TIDAK boleh kehilangan tarif ordernya.
--
-- ⚠️ Kenapa perbandingan tanggal memakai HARI WIB, bukan instan: Kilat
-- menyimpan jam slot di `start_date`; admin yang menugaskan `kilat_slot_hour`
-- belakangan menggeser instannya tanpa memindah harinya. Itu bukan pemesanan
-- ulang.
--
-- Paid/completed tidak pernah disentuh: harganya sudah dibayar.
--
-- ── TERUKUR SEBELUM DITULIS (2026-09-29, produksi, SELECT) ──────────────────
--
--   ad_schedules ordinal-1 ... 1.108  (tanpa tanggal: 83 pending, 19 expired, 2 paid)
--   perpanjangan ............. 30     (18 paid, 12 pending)
--   `sync_ad_schedule_from_submission` = UPSERT, tanpa cabang DELETE → baris
--   ordinal-1 bertahan seumur order, jadi trigger UPDATE melihat setiap pelepasan.
--
-- ── CARA MENJALANKAN ────────────────────────────────────────────────────────
--
--   0. Jalankan §0 PRATINJAU (SELECT murni) — sebaran backfill yang akan terjadi.
--   1. Jalankan blok BEGIN…ROLLBACK apa adanya = DRY-RUN. Setiap uji MELEMPAR
--      ERROR bila gagal ("U1 GAGAL: …"), jadi "Success. No rows returned" =
--      semua uji lulus. (SQL Editor Supabase tidak menampilkan NOTICE.)
--   2. Kalau lulus: ganti HANYA baris `ROLLBACK;` paling akhir → `COMMIT;`,
--      lalu jalankan lagi. Uji §3 dibungkus SAVEPOINT dan SELALU dibatalkan
--      (`ROLLBACK TO SAVEPOINT uji`) — order sungguhan yang dipakai uji tidak
--      pernah berubah, di mode mana pun. Uji yang gagal membatalkan SEMUANYA.
--   3. Jalankan §4 VERIFIKASI; angkanya harus sama dengan §0.
--
-- ── §0. PRATINJAU (jalankan terpisah, SELECT murni) ─────────────────────────
--
-- select s.source_table,
--        case
--          when s.source_table='form_submissions' and s.start_date is null
--               and coalesce(s.payment_status,'')='expired' then 'NULL (dilepas)'
--          when s.status='cancelled' and s.review_status='approved'
--               and coalesce(s.payment_status,'') not in ('paid','completed') then 'NULL (batal)'
--          when s.source_table='form_submissions' then 'created_at order'
--          else 'created_at jadwal'
--        end as tarif_dari,
--        count(*)
--   from ad_schedules s group by 1,2 order by 1,2;
--   Rollback penuh ada di §5 (dikomentari).
--
-- ⚠️ SQL ini WAJIB diterapkan SEBELUM push kode tarif bertanggal: kode baru
-- membaca `rate_locked_at`, dan PostgREST menolak SELURUH kueri yang menyebut
-- kolom yang belum ada (pelajaran sql/99 — dashboard 400 selama ±24 jam).
-- ============================================================================

BEGIN;

-- ── §1. KUNCI created_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lock_submission_created_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
BEGIN
  -- Tanpa klaim JWT = SQL Editor / migrasi / cron → dipercaya.
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL OR coalesce(claims ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Semua pemanggil ber-JWT lain — peneliti DAN admin dashboard — tidak
  -- menentukan tanggal lahir order. Admin tetap bisa lewat SQL Editor.
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_submissions_lock_created_at ON public.form_submissions;
CREATE TRIGGER trg_form_submissions_lock_created_at
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.lock_submission_created_at();

-- ── §2. rate_locked_at ──────────────────────────────────────────────────────

ALTER TABLE public.ad_schedules ADD COLUMN IF NOT EXISTS rate_locked_at timestamptz;

COMMENT ON COLUMN public.ad_schedules.rate_locked_at IS
  'Instan tarif iklan jadwal ini (sql/103). Diisi trigger saja. NULL = dilepas/dibatalkan '
  'dan belum dipesan ulang → pembaca memakai sekarang.';

CREATE OR REPLACE FUNCTION public.maintain_schedule_rate_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  v_order_created timestamptz;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;

  IF TG_OP = 'INSERT' THEN
    -- Nilai kiriman pemanggil selalu diabaikan.
    IF NEW.source_table = 'form_submissions' THEN
      SELECT fs.created_at INTO v_order_created
        FROM form_submissions fs WHERE fs.id = NEW.source_id;
      NEW.rate_locked_at := coalesce(v_order_created, now());
    ELSE
      NEW.rate_locked_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE ─────────────────────────────────────────────────────────────────
  -- Koreksi manual dari SQL Editor (tanpa JWT) dihormati bila tanggalnya tidak
  -- ikut berubah. Pemanggil ber-JWT tidak pernah bisa menulis kolom ini.
  IF claims IS NULL
     AND NEW.rate_locked_at IS DISTINCT FROM OLD.rate_locked_at
     AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date THEN
    RETURN NEW;
  END IF;

  NEW.rate_locked_at := OLD.rate_locked_at;

  -- Harga yang sudah dibayar tidak dinilai ulang.
  IF coalesce(OLD.payment_status, '') IN ('paid', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Dilepas: tanggal dikosongkan.
  IF OLD.start_date IS NOT NULL AND NEW.start_date IS NULL THEN
    NEW.rate_locked_at := NULL;
    RETURN NEW;
  END IF;

  -- Dibatalkan: slot batal / perpanjangan batal (bukan penolakan review).
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.review_status = 'approved' THEN
    NEW.rate_locked_at := NULL;
    RETURN NEW;
  END IF;

  -- Dipindah ke hari WIB lain sebelum lunas = dipesan ulang.
  IF OLD.start_date IS NOT NULL AND NEW.start_date IS NOT NULL
     AND (OLD.start_date AT TIME ZONE 'Asia/Jakarta')::date
         IS DISTINCT FROM (NEW.start_date AT TIME ZONE 'Asia/Jakarta')::date THEN
    NEW.rate_locked_at := now();
    RETURN NEW;
  END IF;

  -- Dipesan ulang sesudah dilepas/dibatalkan: dikunci pada saat ini.
  IF NEW.rate_locked_at IS NULL
     AND NEW.start_date IS NOT NULL
     AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    NEW.rate_locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_schedules_rate_lock ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_rate_lock
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.maintain_schedule_rate_lock();

-- Hibah otomatis (memori anon-default-acl-on-new-functions): pg_default_acl
-- memberi EXECUTE ke anon DAN authenticated. Trigger tidak butuh hak itu.
REVOKE ALL ON FUNCTION public.lock_submission_created_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintain_schedule_rate_lock() FROM PUBLIC, anon, authenticated;

-- Backfill. Trigger UPDATE tidak ikut campur: tanpa JWT + tanggal tidak
-- berubah = koreksi manual yang dihormati.
UPDATE public.ad_schedules s
   SET rate_locked_at = CASE
         -- Sudah dilepas (tanggal kosong, tagihan mati) → belum dipesan ulang.
         WHEN s.source_table = 'form_submissions'
              AND s.start_date IS NULL
              AND coalesce(s.payment_status, '') = 'expired' THEN NULL
         -- Slot/perpanjangan batal yang belum lunas.
         WHEN s.status = 'cancelled' AND s.review_status = 'approved'
              AND coalesce(s.payment_status, '') NOT IN ('paid', 'completed') THEN NULL
         WHEN s.source_table = 'form_submissions' THEN fs.created_at
         ELSE s.created_at
       END
  FROM public.form_submissions fs
 WHERE fs.id = s.submission_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT source_table, (rate_locked_at IS NULL) AS dilepas, count(*) AS n
      FROM public.ad_schedules GROUP BY 1, 2 ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'backfill: % · rate NULL=% · % baris', r.source_table, r.dilepas, r.n;
  END LOOP;
END $$;

-- ── §3. UJI — dijalankan, bukan dibaca ──────────────────────────────────────
-- Dibungkus SAVEPOINT: U5/U6 memindah tanggal ORDER SUNGGUHAN dan U2 membuat
-- order uji. Semua jejak itu dibatalkan `ROLLBACK TO SAVEPOINT uji` di bawah,
-- apa pun baris terakhirnya.
SAVEPOINT uji;

-- Kandidat: jadwal pertama belum lunas, bertanggal, tidak batal, tanpa
-- perpanjangan, ordernya lahir > 1 hari lalu dan punya pemilik.
DO $$
DECLARE v_id uuid; v_sched uuid; v_owner uuid; v_paid uuid;
BEGIN
  SELECT fs.id, s.id, fs.auth_user_id INTO v_id, v_sched, v_owner
    FROM form_submissions fs
    JOIN ad_schedules s ON s.source_table = 'form_submissions' AND s.source_id = fs.id
   WHERE coalesce(fs.payment_status, '') NOT IN ('paid', 'completed')
     AND fs.start_date IS NOT NULL
     AND s.status IS DISTINCT FROM 'cancelled'
     AND fs.auth_user_id IS NOT NULL
     AND fs.created_at < now() - interval '1 day'
     AND NOT EXISTS (SELECT 1 FROM ad_schedules x
                      WHERE x.submission_id = fs.id AND x.source_table = 'form_submissions_extend')
   ORDER BY fs.created_at DESC
   LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'UJI: tidak ada kandidat order'; END IF;

  -- Ordinal-1 saja: baris perpanjangan dijaga `enforce_extend_schedule_rules`,
  -- yang bisa menolak pemindahan tanggal dan menggagalkan uji karena alasan lain.
  SELECT s.id INTO v_paid FROM ad_schedules s
   WHERE s.payment_status = 'paid' AND s.start_date IS NOT NULL
     AND s.source_table = 'form_submissions'
   ORDER BY s.created_at DESC LIMIT 1;

  PERFORM set_config('uji.order', v_id::text, true);
  PERFORM set_config('uji.sched', v_sched::text, true);
  PERFORM set_config('uji.owner', v_owner::text, true);
  PERFORM set_config('uji.paid', v_paid::text, true);
  PERFORM set_config('uji.created', (SELECT created_at::text FROM form_submissions WHERE id = v_id), true);
END $$;

-- U1 · peneliti memundurkan created_at order miliknya → ditolak diam-diam.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('uji.owner'), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('uji.owner'), true);
UPDATE form_submissions SET created_at = '2026-01-01T00:00:00+07'
 WHERE id = current_setting('uji.order')::uuid;

-- U2 · peneliti membuat order dengan created_at palsu → dipaksa now().
DO $$
DECLARE v_new uuid; v_created timestamptz;
BEGIN
  INSERT INTO form_submissions (survey_url, title, description, question_count, duration,
                                total_cost, auth_user_id, created_at)
  VALUES ('https://uji.invalid/103', 'UJI sql/103', 'uji', 40, 2, 0,
          current_setting('uji.owner')::uuid, '2026-01-01T00:00:00+07')
  RETURNING id, created_at INTO v_new, v_created;
  IF v_created < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'U2 GAGAL: created_at palsu lolos (%)', v_created;
  END IF;
  PERFORM set_config('uji.new', v_new::text, true);
  RAISE NOTICE '✓ U2 INSERT: created_at dipaksa now() (%)', v_created;
END $$;
RESET ROLE;
-- ⚠️ Klaim TIDAK BOLEH dikosongkan jadi '' — `protect_form_submissions()`
-- melakukan `current_setting(...)::json` TANPA nullif, dan ''::json meledak
-- (22P02). Uji selanjutnya berjalan sebagai "backend" (service_role): jalur
-- yang sama dengan cron/webhook, yang dipercaya semua penjaga kolom.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE v timestamptz; v_rate timestamptz;
BEGIN
  SELECT created_at INTO v FROM form_submissions WHERE id = current_setting('uji.order')::uuid;
  IF v::text IS DISTINCT FROM current_setting('uji.created') THEN
    RAISE EXCEPTION 'U1 GAGAL: created_at berubah jadi %', v;
  END IF;
  RAISE NOTICE '✓ U1 UPDATE: created_at tetap %', v;

  -- U3 · jadwal pertama order baru mewarisi created_at order.
  SELECT s.rate_locked_at INTO v_rate FROM ad_schedules s
   WHERE s.source_table = 'form_submissions' AND s.source_id = current_setting('uji.new')::uuid;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'U3 GAGAL: rate_locked_at jadwal baru NULL'; END IF;
  RAISE NOTICE '✓ U3 jadwal baru: rate_locked_at = %', v_rate;
END $$;

-- U4 · pemanggil ber-JWT mencoba menulis rate_locked_at → diabaikan.
-- (Sebagai postgres supaya RLS tidak memotong; trigger yang diuji.)
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('uji.owner'), 'role', 'authenticated')::text, true);
UPDATE ad_schedules SET rate_locked_at = '2026-01-01T00:00:00+07'
 WHERE id = current_setting('uji.sched')::uuid;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE v_rate timestamptz; v_created timestamptz;
BEGIN
  SELECT s.rate_locked_at, fs.created_at INTO v_rate, v_created
    FROM ad_schedules s JOIN form_submissions fs ON fs.id = s.source_id
   WHERE s.id = current_setting('uji.sched')::uuid;
  IF v_rate IS DISTINCT FROM v_created THEN
    RAISE EXCEPTION 'U4 GAGAL: rate_locked_at % ≠ created_at order %', v_rate, v_created;
  END IF;
  RAISE NOTICE '✓ U4 tulisan ber-JWT diabaikan: rate_locked_at = created_at order (%)', v_rate;
END $$;

-- U8 · jam tayang digeser di HARI WIB YANG SAMA (mis. admin menugaskan slot
--      Kilat / jam kustom) → bukan pemesanan ulang, tarif tetap tanggal order.
--      Dijalankan SEBELUM U9: sesudah U9 tarifnya sudah now(), jadi "tetap"
--      dan "dikunci ulang" tidak lagi bisa dibedakan.
DO $$
DECLARE v_before timestamptz; v_after timestamptz;
BEGIN
  SELECT rate_locked_at INTO v_before FROM ad_schedules WHERE id = current_setting('uji.sched')::uuid;
  UPDATE ad_schedules
     SET start_date = start_date + CASE
           WHEN extract(hour FROM start_date AT TIME ZONE 'Asia/Jakarta') >= 23
             THEN -interval '1 minute' ELSE interval '1 minute' END
   WHERE id = current_setting('uji.sched')::uuid;
  SELECT rate_locked_at INTO v_after FROM ad_schedules WHERE id = current_setting('uji.sched')::uuid;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'U8 GAGAL: geser jam di hari yang sama menilai ulang tarif (% → %)', v_before, v_after;
  END IF;
  RAISE NOTICE '✓ U8 geser jam, hari sama: rate_locked_at tetap %', v_after;
END $$;

-- U9 · tanggal tayang dipindah ke HARI LAIN sebelum lunas — jalur admin
--      `updateScheduleDates` (menulis form_submissions, disinkronkan trigger)
--      → tarif pada saat pemindahan.
UPDATE form_submissions
   SET start_date = CASE WHEN start_date = current_date + 60 THEN current_date + 61 ELSE current_date + 60 END,
       end_date   = CASE WHEN start_date = current_date + 60 THEN current_date + 62 ELSE current_date + 61 END
 WHERE id = current_setting('uji.order')::uuid;

DO $$
DECLARE v_rate timestamptz;
BEGIN
  SELECT rate_locked_at INTO v_rate FROM ad_schedules WHERE id = current_setting('uji.sched')::uuid;
  IF v_rate IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'U9 GAGAL: pindah hari sebelum lunas = % (harus now())', v_rate;
  END IF;
  RAISE NOTICE '✓ U9 pindah hari sebelum lunas: rate_locked_at = now()';
END $$;

-- U5 · dilepas (jalur releaseExpiredSlot) → NULL.
UPDATE form_submissions
   SET start_date = NULL, end_date = NULL, slot_booked_by = NULL, slot_reserved_at = NULL,
       submission_status = 'slot_reserved', payment_status = 'expired'
 WHERE id = current_setting('uji.order')::uuid;

DO $$
DECLARE v_rate timestamptz;
BEGIN
  SELECT rate_locked_at INTO v_rate FROM ad_schedules WHERE id = current_setting('uji.sched')::uuid;
  IF v_rate IS NOT NULL THEN RAISE EXCEPTION 'U5 GAGAL: pelepasan tidak mengosongkan (%)', v_rate; END IF;
  RAISE NOTICE '✓ U5 dilepas: rate_locked_at NULL';
END $$;

-- U6 · dipesan ulang (jalur rebookSlotForSubmission) → now().
UPDATE form_submissions
   SET start_date = current_date + 90, end_date = current_date + 91,
       slot_booked_by = 'user', slot_reserved_at = now(),
       submission_status = 'waiting_payment', payment_status = 'pending'
 WHERE id = current_setting('uji.order')::uuid;

DO $$
DECLARE v_rate timestamptz;
BEGIN
  SELECT rate_locked_at INTO v_rate FROM ad_schedules WHERE id = current_setting('uji.sched')::uuid;
  IF v_rate IS DISTINCT FROM now() THEN RAISE EXCEPTION 'U6 GAGAL: pesan ulang = % (harus now())', v_rate; END IF;
  RAISE NOTICE '✓ U6 dipesan ulang: rate_locked_at = now()';
END $$;

-- U7 · jadwal lunas dipindah → tarif tidak disentuh.
DO $$
DECLARE v_before timestamptz; v_after timestamptz;
BEGIN
  IF nullif(current_setting('uji.paid'), '') IS NULL THEN
    RAISE NOTICE '– U7 dilewati: tidak ada jadwal lunas bertanggal';
    RETURN;
  END IF;
  SELECT rate_locked_at INTO v_before FROM ad_schedules WHERE id = current_setting('uji.paid')::uuid;
  UPDATE ad_schedules SET start_date = start_date + interval '3 days'
   WHERE id = current_setting('uji.paid')::uuid;
  SELECT rate_locked_at INTO v_after FROM ad_schedules WHERE id = current_setting('uji.paid')::uuid;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'U7 GAGAL: jadwal lunas dinilai ulang (% → %)', v_before, v_after;
  END IF;
  RAISE NOTICE '✓ U7 jadwal lunas dipindah: rate_locked_at tetap %', v_after;
END $$;

-- Hak EXECUTE (pelajaran sql/94: verifikasi proacl, jangan percaya REVOKE).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT proname, coalesce(proacl::text, '(default)') AS acl FROM pg_proc
            WHERE proname IN ('lock_submission_created_at', 'maintain_schedule_rate_lock')
  LOOP
    IF r.acl LIKE '%anon=%' OR r.acl LIKE '%authenticated=%' OR r.acl = '(default)' THEN
      RAISE EXCEPTION 'ACL GAGAL: % → %', r.proname, r.acl;
    END IF;
    RAISE NOTICE '✓ ACL %: %', r.proname, r.acl;
  END LOOP;
END $$;

ROLLBACK TO SAVEPOINT uji;   -- jejak uji SELALU dibuang

ROLLBACK;   -- ← DRY-RUN. Ganti jadi COMMIT; setelah dry-run lulus.

-- ── §4. VERIFIKASI (sesudah COMMIT) ─────────────────────────────────────────
--
-- select tgname from pg_trigger
--  where tgname in ('trg_form_submissions_lock_created_at','trg_ad_schedules_rate_lock');
--   → 2 baris
--
-- select source_table, rate_locked_at is null as dilepas, count(*)
--   from ad_schedules group by 1,2 order by 1,2;
--   → sama dengan NOTICE backfill dry-run
--
-- -- Jadwal pertama yang tarifnya BUKAN tanggal order (harus = baris dilepas/batal saja):
-- select count(*) from ad_schedules s join form_submissions fs on fs.id = s.source_id
--  where s.source_table='form_submissions' and s.rate_locked_at is distinct from fs.created_at;

-- ── §5. ROLLBACK PENUH ──────────────────────────────────────────────────────
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_ad_schedules_rate_lock ON public.ad_schedules;
-- DROP TRIGGER IF EXISTS trg_form_submissions_lock_created_at ON public.form_submissions;
-- DROP FUNCTION IF EXISTS public.maintain_schedule_rate_lock();
-- DROP FUNCTION IF EXISTS public.lock_submission_created_at();
-- -- ⚠️ Kolom baru DIHAPUS TERAKHIR dan HANYA setelah kode yang membacanya
-- -- di-revert — PostgREST menolak seluruh kueri yang menyebut kolom hilang.
-- ALTER TABLE public.ad_schedules DROP COLUMN IF EXISTS rate_locked_at;
-- COMMIT;
