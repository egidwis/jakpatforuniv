-- ============================================================================
-- 102 — TAYANG SEBELUM LUNAS + TAGIHAN TEMPO
-- ============================================================================
--
-- Rencana: /Users/jakpat/.claude/plans/sprightly-floating-tiger.md (K1–K10).
--
-- Ringkasnya: admin boleh menayangkan jadwal yang belum dibayar ("kredit")
-- TANPA menyentuh baris uang. Utangnya ditagih lewat TAGIHAN TEMPO — tagihan
-- tanpa tanggal jatuh tempo. Link DOKU di baliknya tetap berumur 7 hari, dan
-- diperbarui otomatis saat `/bayar/<jadwal>` dibuka (tanpa login).
--
-- ── Yang ditambahkan / diubah ──────────────────────────────────────────────
--   1. Kolom  ad_schedules.air_on_credit_{at,by,note}
--             invoices.is_tempo, invoices.superseded_by
--   2. Index  satu tagihan tempo `pending` per jadwal
--   3. Guard  kolom kredit hanya admin (ad_schedules, BARU)
--             kolom tempo + status tagihan tempo (guard_invoice_columns_for_owner)
--   4. schedule_billing()            — baris tempo TIDAK PERNAH `is_expired`
--   5. authoritative_payment_url()   — reason `tempo_renewable` & `bill_expired`
--   6. cron_activate_extends()       — perpanjangan kredit ikut diangkat
--   7. notify_primary_ads_live/_completed() — jadwal kredit ikut diberi email
--   8. trg_close_page_on_extend_unpaid()    — unmark jadwal kredit tidak menutup halaman
--   9. mark_schedules_on_credit()    — RPC admin, satu-satunya penulis kolom kredit
--  10. tempo_renewal_candidate() / renew_tempo_bill() — RPC service_role untuk /bayar/
--
-- ── Yang SENGAJA tidak diubah ──────────────────────────────────────────────
--   • cron pelepas slot (sql/94), penjaga kuota, penjaga jendela: jadwal kredit
--     selalu `slot_booked_by='admin'` (ditulis mark_schedules_on_credit), dan
--     ketiganya hanya melepas hold `'user'`.
--   • Signature schedule_billing / authoritative_payment_url: TIDAK berubah,
--     jadi schedule_billing_summary & schedule_billing_bulk tidak perlu di-DROP.
--
-- ⚠️ URUTAN RILIS: jalankan berkas ini SEBELUM kode di-push ke main. Push ke
-- main = deploy otomatis; kode baru membaca kolom yang dibuat di sini
-- (pelajaran sql/99: dashboard 400 selama ±24 jam).
--
-- ⚠️ Semua badan fungsi disalin dari pg_get_functiondef PRODUKSI 28 Sep 2026,
-- bukan dari berkas sql lama. Definisi aslinya disimpan ke
-- backup.fn_defs_102 di Langkah 2 — rollback memulihkannya dari sana.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (jalankan dulu, baca hasilnya)
-- ============================================================================
-- 1a. Kolom baru BELUM ada (harapan: nol baris):
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND ((table_name = 'ad_schedules' AND column_name LIKE 'air_on_credit%')
--      OR (table_name = 'invoices' AND column_name IN ('is_tempo','superseded_by')));
--
-- 1b. Fungsi yang akan diganti ada semua (harapan: 8 baris):
-- SELECT proname FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace
--    AND proname IN ('schedule_billing','authoritative_payment_url','cron_activate_extends',
--                    'notify_primary_ads_live','notify_primary_ads_completed',
--                    'trg_close_page_on_extend_unpaid','guard_invoice_columns_for_owner',
--                    'sync_ad_schedule_from_submission')
--  ORDER BY 1;
--
-- 1c. Nama fungsi/trigger baru belum dipakai (harapan: nol baris):
-- SELECT proname FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace
--    AND proname IN ('mark_schedules_on_credit','tempo_renewal_candidate',
--                    'renew_tempo_bill','guard_air_on_credit_columns',
--                    'adopt_superseded_tempo_payment');
--
-- 1d. Snapshot belum ada (harapan: nol baris):
-- SELECT to_regclass('backup.fn_defs_102');


-- ============================================================================
-- LANGKAH 2 — MIGRASI
-- ============================================================================
BEGIN;

-- ── 0. Snapshot definisi fungsi yang akan ditimpa (untuk rollback) ─────────
CREATE TABLE backup.fn_defs_102 AS
  SELECT p.proname::text AS proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('schedule_billing','authoritative_payment_url','cron_activate_extends',
                       'notify_primary_ads_live','notify_primary_ads_completed',
                       'trg_close_page_on_extend_unpaid','guard_invoice_columns_for_owner');
REVOKE ALL ON backup.fn_defs_102 FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.fn_defs_102 ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF (SELECT count(*) FROM backup.fn_defs_102) <> 7 THEN
    RAISE EXCEPTION 'Snapshot fungsi tidak lengkap (% dari 7) — dibatalkan.',
      (SELECT count(*) FROM backup.fn_defs_102);
  END IF;
END $$;


-- ── 1. Kolom ────────────────────────────────────────────────────────────────
ALTER TABLE public.ad_schedules
  ADD COLUMN air_on_credit_at   timestamptz,
  ADD COLUMN air_on_credit_by   text,
  ADD COLUMN air_on_credit_note text;

COMMENT ON COLUMN public.ad_schedules.air_on_credit_at IS
  'sql/102: admin mengizinkan jadwal ini tayang SEBELUM lunas. Terisi = kredit. '
  'Tidak pernah dikosongkan lagi (K9: tayang tanpa bayar tidak bisa ditarik lewat '
  'jalur tagihan). Hanya ditulis mark_schedules_on_credit().';
COMMENT ON COLUMN public.ad_schedules.air_on_credit_by IS
  'sql/102: email admin yang menandai kredit.';
COMMENT ON COLUMN public.ad_schedules.air_on_credit_note IS
  'sql/102: catatan admin saat menandai kredit.';

-- ⚠️ HANYA di invoices. `transactions` punya skema berbeda — menaruh kolom ini
-- di objek `shared` pada buildInvoiceRows membuat INSERT transaksi ditolak 400
-- (jebakan yang sama dengan expires_at).
ALTER TABLE public.invoices
  ADD COLUMN is_tempo      boolean NOT NULL DEFAULT false,
  ADD COLUMN superseded_by text;

COMMENT ON COLUMN public.invoices.is_tempo IS
  'sql/102: tagihan tempo — tanpa tanggal jatuh tempo. expires_at-nya hanya umur '
  'link DOKU; lewat darinya TIDAK menghapus utang (schedule_billing.is_expired '
  'selalu false) dan /bayar/ memperbaruinya.';
COMMENT ON COLUMN public.invoices.superseded_by IS
  'sql/102: payment_id pengganti saat tagihan tempo diperbarui renew_tempo_bill(). '
  'Terisi = dibatalkan KARENA PEMBARUAN, bukan oleh admin — jangan dihitung '
  'sebagai tagihan batal di metrik.';


-- ── 2. Satu tagihan tempo pending per jadwal ───────────────────────────────
-- Pengaman terakhir balapan pembaruan: dua /bayar/ yang dibuka bersamaan tidak
-- boleh meninggalkan dua link hidup untuk satu jadwal.
CREATE UNIQUE INDEX invoices_one_pending_tempo_per_schedule
  ON public.invoices (schedule_id)
  WHERE status = 'pending' AND is_tempo AND schedule_id IS NOT NULL;


-- ── 3a. Kolom kredit hanya admin ───────────────────────────────────────────
-- Tanpa ini peneliti bisa menulis air_on_credit_at pada perpanjangan miliknya
-- sendiri lewat policy "Peneliti melepas reservasinya sendiri", dan
-- cron_activate_extends akan menayangkannya gratis.
CREATE OR REPLACE FUNCTION public.guard_air_on_credit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
BEGIN
  -- Tanpa klaim = koneksi langsung (SQL Editor, migrasi) → boleh.
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN RETURN NEW; END IF;

  IF coalesce(claims ->> 'role', '') = 'service_role'
     OR lower(coalesce(claims ->> 'email', '')) = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.air_on_credit_at IS NOT NULL
       OR NEW.air_on_credit_by IS NOT NULL
       OR NEW.air_on_credit_note IS NOT NULL THEN
      RAISE EXCEPTION 'Kolom tayang-sebelum-lunas hanya bisa diisi admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.air_on_credit_at   IS DISTINCT FROM OLD.air_on_credit_at
     OR NEW.air_on_credit_by   IS DISTINCT FROM OLD.air_on_credit_by
     OR NEW.air_on_credit_note IS DISTINCT FROM OLD.air_on_credit_note THEN
    RAISE EXCEPTION 'Kolom tayang-sebelum-lunas hanya bisa diubah admin.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_ad_schedules_guard_credit
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_air_on_credit_columns();


-- ── 3b. guard_invoice_columns_for_owner — disalin dari produksi ────────────
-- Tambahan: is_tempo & superseded_by beku untuk peneliti, dan peneliti tidak
-- boleh mengubah STATUS tagihan tempo sama sekali (K8: utang tempo hanya
-- lunas atau dibatalkan admin).
CREATE OR REPLACE FUNCTION public.guard_invoice_columns_for_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
  jwt_role  text;
  jwt_email text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN RETURN NEW; END IF;

  jwt_role  := coalesce(claims ->> 'role', '');
  jwt_email := lower(coalesce(claims ->> 'email', ''));

  IF jwt_role = 'service_role' OR jwt_email = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  IF NEW.amount             IS DISTINCT FROM OLD.amount
     OR NEW.paid_at           IS DISTINCT FROM OLD.paid_at
     OR NEW.doku_cancelled_at IS DISTINCT FROM OLD.doku_cancelled_at
     OR NEW.payment_id        IS DISTINCT FROM OLD.payment_id
     OR NEW.schedule_id       IS DISTINCT FROM OLD.schedule_id
     OR NEW.form_submission_id IS DISTINCT FROM OLD.form_submission_id
     OR NEW.expires_at        IS DISTINCT FROM OLD.expires_at
     -- ── TAMBAHAN sql/102 ──
     OR NEW.is_tempo          IS DISTINCT FROM OLD.is_tempo
     OR NEW.superseded_by     IS DISTINCT FROM OLD.superseded_by
  THEN
    RAISE EXCEPTION 'Kolom tagihan ini hanya bisa diubah admin; peneliti hanya boleh mencatat doku_cancel_last_error atau mematikan tagihannya sendiri.';
  END IF;

  -- ── TAMBAHAN sql/102 ──
  IF OLD.is_tempo AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Tagihan tempo hanya bisa diubah admin.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (COALESCE(OLD.status,'') = 'pending'
            AND NEW.status IN ('expired','cancelled')) THEN
      RAISE EXCEPTION
        'Peneliti hanya boleh mematikan tagihan yang masih pending (jadi % → % ditolak).',
        COALESCE(OLD.status,'(null)'), COALESCE(NEW.status,'(null)');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


-- ── 4. schedule_billing — disalin dari produksi ────────────────────────────
-- Perubahannya: `is_tempo` dibawa dari invoices; baris tempo TIDAK PERNAH
-- `is_expired`, dan tidak jadi `is_stale` hanya karena jadwalnya dibatalkan
-- (K6 — pindah tanggal tetap membuatnya basi). Utang tempo tetap utang walau link DOKU-nya lewat
-- 7 hari — kalau tidak, piutang, state kartu admin, dan tombol bayar peneliti
-- lenyap setiap kali link habis. Yang peduli pada umur LINK hanya resolver
-- (authoritative_payment_url, di bawah).
CREATE OR REPLACE FUNCTION public.schedule_billing(p_schedule_id uuid)
 RETURNS TABLE(payment_id text, amount bigint, status text, payment_url text, created_at timestamp with time zone, source text, voucher_code text, attempts integer, is_superseded boolean, payment_method text, payment_channel text, billed_start_date timestamp with time zone, is_stale boolean, expires_at timestamp with time zone, is_expired boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sched AS (SELECT start_date, status FROM ad_schedules WHERE id = p_schedule_id),
  events AS (
    SELECT coalesce(i.payment_id, 'inv:' || i.id::text) AS k, i.payment_id,
           i.amount::BIGINT AS amount, i.status, i.invoice_url AS url,
           (i.created_at AT TIME ZONE 'UTC') AS created_at,
           i.voucher_code, NULL::TEXT AS payment_method, NULL::TEXT AS payment_channel,
           i.billed_start_date, 1 AS prio, 'invoice' AS source,
           i.expires_at,
           i.is_tempo
      FROM invoices i WHERE i.schedule_id = p_schedule_id
    UNION ALL
    SELECT coalesce(t.payment_id, 'txn:' || t.id::text), t.payment_id,
           t.amount::BIGINT, t.status, t.payment_url, t.created_at,
           t.voucher_code, t.payment_method, t.payment_channel,
           t.billed_start_date, 2, 'transaction',
           NULL::TIMESTAMPTZ,
           false
      FROM transactions t WHERE t.schedule_id = p_schedule_id
  ),
  merged AS (
    SELECT
      max(e.payment_id) AS payment_id,
      (array_agg(e.amount ORDER BY e.prio, e.created_at DESC))[1] AS amount,
      (array_agg(e.status ORDER BY payment_status_rank(e.status) DESC,
                                   e.prio, e.created_at DESC))[1] AS status,
      (array_agg(e.url ORDER BY e.prio, e.created_at DESC)
         FILTER (WHERE e.url IS NOT NULL))[1] AS payment_url,
      min(e.created_at) AS created_at,
      (array_agg(e.source ORDER BY e.prio))[1] AS source,
      (array_agg(e.voucher_code ORDER BY e.prio)
         FILTER (WHERE e.voucher_code IS NOT NULL AND e.voucher_code <> ''))[1] AS voucher_code,
      count(*) FILTER (WHERE e.source = 'transaction')::INT AS attempts,
      (array_agg(e.payment_method ORDER BY payment_status_rank(e.status) DESC, e.created_at DESC)
         FILTER (WHERE e.payment_method IS NOT NULL))[1] AS payment_method,
      (array_agg(e.payment_channel ORDER BY payment_status_rank(e.status) DESC, e.created_at DESC)
         FILTER (WHERE e.payment_channel IS NOT NULL))[1] AS payment_channel,
      (array_agg(e.billed_start_date ORDER BY e.prio)
         FILTER (WHERE e.billed_start_date IS NOT NULL))[1] AS billed_start_date,
      (array_agg(e.expires_at ORDER BY e.prio)
         FILTER (WHERE e.expires_at IS NOT NULL))[1] AS expires_at,
      bool_or(e.is_tempo) AS is_tempo
    FROM events e GROUP BY e.k
  )
  SELECT m.payment_id, m.amount, m.status, m.payment_url, m.created_at,
         m.source, m.voucher_code, m.attempts,
         (payment_status_rank(m.status) = 1
          AND EXISTS (SELECT 1 FROM merged n
                       WHERE payment_status_rank(n.status) = 3
                         AND n.created_at > m.created_at)) AS is_superseded,
         m.payment_method, m.payment_channel,
         m.billed_start_date,
         (payment_status_rank(m.status) <> 3
          AND m.billed_start_date IS NOT NULL
          AND (
            ((SELECT start_date FROM sched) IS NOT NULL
             AND m.billed_start_date <> (SELECT start_date FROM sched))
            -- ── TAMBAHAN sql/102 ── K6: iklan tempo yang dihentikan di tengah
            -- tayang, utangnya tetap penuh. Pembatalan jadwal tidak membuat
            -- tagihan tempo basi; pindah tanggal tetap membuatnya basi.
            OR ((SELECT status FROM sched) = 'cancelled' AND NOT m.is_tempo)
          )) AS is_stale,
         m.expires_at,
         (payment_status_rank(m.status) <> 3
          AND m.expires_at IS NOT NULL
          AND m.expires_at < now()
          -- ── TAMBAHAN sql/102 ── utang tempo tidak pernah kedaluwarsa.
          AND NOT m.is_tempo) AS is_expired
    FROM merged m ORDER BY m.created_at DESC;
$function$;


-- ── 5. authoritative_payment_url — disalin dari produksi ───────────────────
-- Tambahan:
--   • `tempo_dead`: tagihan tempo pending yang link DOKU-nya sudah lewat.
--     Diperiksa SEBELUM `live` — sejak langkah 4 baris itu terbaca hidup, dan
--     resolver TIDAK BOLEH mengembalikan URL DOKU yang sudah mati. Reason-nya
--     `tempo_renewable`; functions/bayar/[id].js yang memperbaruinya.
--   • `bill_expired`: tagihan mati, tapi jadwal ini sendiri masih bisa dikejar
--     (belum lewat cutoff-nya, dan bukan hold peneliti). Kasus tagihan gabungan
--     yang mati karena cutoff anggota lain, atau link 7 hari yang habis untuk
--     jadwal jauh hari. Kalimatnya menyuruh menunggu, bukan menjadwalkan ulang.
CREATE OR REPLACE FUNCTION public.authoritative_payment_url(p_schedule_id uuid)
 RETURNS TABLE(payment_url text, payment_id text, is_group boolean, is_lead boolean, reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sched AS (
    SELECT id, status, start_date, slot_booked_by FROM ad_schedules WHERE id = p_schedule_id
  ),
  ev AS (
    SELECT * FROM schedule_billing(p_schedule_id)
  ),
  -- ── TAMBAHAN sql/102 ──
  -- Dibaca dari invoices langsung: schedule_billing sengaja tidak lagi
  -- menandai baris tempo kedaluwarsa (utang ≠ link), dan kolom is_tempo tidak
  -- ikut di signature-nya.
  tempo_dead AS (
    SELECT i.payment_id
      FROM invoices i
     WHERE i.schedule_id = p_schedule_id
       AND i.is_tempo
       AND i.status = 'pending'
       AND i.expires_at IS NOT NULL
       AND (i.expires_at AT TIME ZONE 'UTC') < now()
     ORDER BY i.created_at DESC
     LIMIT 1
  ),
  -- Predikat `live` sql/83, disalin UTUH. Kalau yang di sana berubah, yang di
  -- sini WAJIB ikut — dan uji `authoritative_payment_url` yang menangkapnya.
  live AS (
    SELECT * FROM ev
     WHERE payment_status_rank(status) = 3
        OR (payment_status_rank(status) = 1 AND source = 'invoice'
            AND NOT is_superseded AND NOT is_stale AND NOT is_expired)
  ),
  -- Yang boleh DIBAYAR: hidup, belum lunas, dan punya URL. Terbaru menang —
  -- sesudah Langkah 3 tagihan lama sudah dimatikan saat penyalipnya terbit,
  -- jadi normalnya himpunan ini beranggota nol atau satu.
  -- ⚠️ sql/102: tagihan tempo yang link-nya mati BUKAN payable.
  payable AS (
    SELECT * FROM live l
     WHERE payment_status_rank(l.status) = 1 AND l.payment_url IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tempo_dead t WHERE t.payment_id = l.payment_id)
     ORDER BY l.created_at DESC
     LIMIT 1
  ),
  -- Peristiwa tagihan TERBARU, apa pun statusnya. Dipakai HANYA untuk
  -- membedakan "dibatalkan" dari "kedaluwarsa" — lihat catatan di kepala
  -- BAGIAN A soal kenapa ini tidak boleh jadi `EXISTS` yang longgar.
  newest AS (
    SELECT * FROM ev ORDER BY created_at DESC LIMIT 1
  ),
  -- Tagihan yang dijawab resolver: yang payable, atau tempo yang perlu
  -- diperbarui (sql/102) — supaya is_group/is_lead tetap terjawab untuknya.
  answer AS (
    SELECT coalesce((SELECT p.payment_id FROM payable p),
                    (SELECT t.payment_id FROM tempo_dead t)) AS payment_id
  ),
  -- Anggota grup dibaca dari `invoices`, bukan dari `ev`: `schedule_billing`
  -- berlingkup SATU jadwal, jadi ia tidak bisa melihat saudara-saudaranya.
  grp AS (
    SELECT i.schedule_id, a.start_date, a.ordinal
      FROM invoices i
      LEFT JOIN ad_schedules a ON a.id = i.schedule_id
     WHERE i.payment_id = (SELECT x.payment_id FROM answer x)
  ),
  -- Aturan lead IDENTIK dengan `fetchInvoiceGroups()` (supabase.ts): tanggal
  -- tayang paling awal dulu, yang tak bertanggal di BELAKANG, lalu ordinal.
  -- Kartu peneliti sudah memakai aturan ini untuk memutuskan siapa yang
  -- memegang tombol bayar; resolver tidak boleh punya pendapat sendiri.
  --
  -- ⚠️ ARAH NULL-nya BEDA di dua kolom, dan keduanya menyalin TypeScript:
  --   start_date → `startDate ? t : MAX_SAFE_INTEGER`  = NULLS LAST
  --   ordinal    → `a.ordinal ?? 0`, dan ordinal asli mulai dari 1
  --                                                    = NULLS FIRST
  -- Menyeragamkannya jadi NULLS LAST terlihat lebih rapi dan LANGSUNG SALAH:
  -- baris warisan (invoices.schedule_id NULL → ordinal NULL) akan berpindah
  -- dari depan ke belakang, dan "siapa pemegang tombol bayar" ikut berpindah.
  lead AS (
    SELECT schedule_id FROM grp
     ORDER BY start_date ASC NULLS LAST, ordinal ASC NULLS FIRST
     LIMIT 1
  )
  SELECT
    (SELECT p.payment_url FROM payable p),
    (SELECT x.payment_id  FROM answer x),
    (SELECT count(*) > 1 FROM grp),
    -- Jadwal tunggal SELALU lead-nya sendiri. `false` di sini akan melempar
    -- pembayar solo ke halaman invoice tanpa alasan.
    coalesce((SELECT g.schedule_id FROM lead g) = p_schedule_id, true),
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM sched)                        THEN 'not_found'
      -- ── TAMBAHAN sql/102 ── SEBELUM `live`, lihat kepala blok ini.
      WHEN EXISTS (SELECT 1 FROM tempo_dead)                       THEN 'tempo_renewable'
      WHEN EXISTS (SELECT 1 FROM payable)                          THEN 'live'
      -- Lunas menang atas semua sisanya: uang yang sudah masuk tidak pernah
      -- basi, tidak pernah kedaluwarsa (sql/83), dan tidak perlu link.
      WHEN EXISTS (SELECT 1 FROM live WHERE payment_status_rank(status) = 3)
                                                                   THEN 'paid'
      WHEN EXISTS (SELECT 1 FROM live WHERE payment_status_rank(status) = 1)
                                                                   THEN 'no_url'
      WHEN (SELECT s.status FROM sched s) = 'cancelled'            THEN 'cancelled'
      -- ⚠️ SESUDAH `cancelled` (jadwal), SEBELUM `stale`/`expired`.
      -- Jadwalnya masih hidup dan tagihan terakhirnya DIBATALKAN → tagihan
      -- pengganti sedang disiapkan. Kalimatnya di `functions/bayar/[id].js`
      -- karena itu "tunggu", BUKAN "jadwalkan ulang".
      WHEN lower((SELECT n.status FROM newest n)) = 'cancelled'    THEN 'bill_cancelled'
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_stale OR is_superseded) THEN 'stale'
      -- ── TAMBAHAN sql/102 ──
      -- Tagihannya mati, tapi jadwal ini SENDIRI belum lewat batas bayarnya
      -- (cutoff 14.00 = satu jam sebelum tayang) dan bukan hold peneliti yang
      -- memang lepas sendiri. Menyuruhnya "jadwalkan ulang" salah arah.
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_expired)
           AND (SELECT s.start_date FROM sched s) > now() + interval '1 hour'
           AND COALESCE((SELECT s.slot_booked_by FROM sched s), '') <> 'user'
                                                                   THEN 'bill_expired'
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_expired)              THEN 'expired'
      WHEN NOT EXISTS (SELECT 1 FROM ev)                           THEN 'none'
      -- Sisanya: ada tagihan, semuanya sudah mati karena STATUS
      -- (expired/failed) tanpa jadwalnya ikut batal.
      ELSE 'expired'
    END;
$function$;


-- ── 6. cron_activate_extends — disalin dari produksi ───────────────────────
CREATE OR REPLACE FUNCTION public.cron_activate_extends()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- 1. Aktifkan jadwal yang jendelanya sudah mulai.
  --    review_status ikut disegarkan dari induk — padanan tambahan sql/70 di
  --    extend_view_update(), dan SENGAJA hanya untuk baris yang bertransisi,
  --    persis selingkup perilaku lama.
  --    sql/102: jadwal kredit (tayang sebelum lunas) ikut diangkat.
  UPDATE ad_schedules a
  SET status = 'live',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.status = 'scheduled'
    AND (a.payment_status = 'paid' OR a.air_on_credit_at IS NOT NULL)
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 2. Arahkan halaman survei ke jadwal yang sedang tayang.
  UPDATE survey_pages sp
  SET publish_start_date  = a.start_date,
      publish_end_date    = a.end_date,
      current_period_batch = a.period_batch
  FROM ad_schedules a
  WHERE a.source_table = 'form_submissions_extend'
    AND a.submission_id = sp.submission_id
    AND a.status = 'live'
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 3. Tutup jadwal yang jendelanya sudah lewat.
  UPDATE ad_schedules a
  SET status = 'completed',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.status = 'live'
    AND a.end_date <= NOW();
END;
$function$;


-- ── 7a. notify_primary_ads_live — disalin dari produksi ────────────────────
-- sql/102: jadwal kredit ikut. Tanpa ini iklan tempo tayang tanpa email, dan
-- email "iklan tayang" hilang selamanya kalau pembayarannya menyusul setelah
-- iklannya selesai.
CREATE OR REPLACE FUNCTION public.notify_primary_ads_live()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_url text;
  v_secret text;
  rec record;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_ad_live_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'notify_primary_ads_live: vault secrets notify_ad_live_url/cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  FOR rec IN
    SELECT s.id AS schedule_id,
           s.submission_id,
           s.ordinal,
           s.booking_id,
           s.start_date,
           s.end_date,
           fs.email,
           fs.full_name,
           fs.title
    FROM public.ad_schedules s
    JOIN public.form_submissions fs ON fs.id = s.submission_id
    WHERE (lower(s.payment_status) = 'paid' OR s.air_on_credit_at IS NOT NULL)
      AND s.start_date IS NOT NULL
      AND s.end_date IS NOT NULL
      AND s.live_notified_at IS NULL
      AND fs.email IS NOT NULL
      AND lower(coalesce(s.status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
      AND lower(coalesce(fs.submission_status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
  LOOP
    -- Hanya kirim jika waktu sekarang sudah berada dalam rentang tayang
    IF rec.start_date > now() OR rec.end_date <= now() THEN
      CONTINUE;
    END IF;

    -- Batas 7 hari lampau untuk mencegah spamming order lama
    IF rec.start_date < now() - INTERVAL '7 days' THEN
      UPDATE public.ad_schedules
        SET live_notified_at = now()
        WHERE id = rec.schedule_id;
      IF rec.ordinal = 1 THEN
        UPDATE public.form_submissions
          SET live_notified_at = now()
          WHERE id = rec.submission_id AND live_notified_at IS NULL;
      END IF;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'id', rec.submission_id,
        'schedule_id', rec.schedule_id,
        'booking_id', rec.booking_id,
        'ordinal', rec.ordinal,
        'email', rec.email,
        'full_name', rec.full_name,
        'title', rec.title,
        'start_date', rec.start_date,
        'end_date', rec.end_date
      ),
      timeout_milliseconds := 5000
    );

    UPDATE public.ad_schedules
      SET live_notified_at = now()
      WHERE id = rec.schedule_id;

    IF rec.ordinal = 1 THEN
      UPDATE public.form_submissions
        SET live_notified_at = now()
        WHERE id = rec.submission_id AND live_notified_at IS NULL;
    END IF;
  END LOOP;
END;
$function$;


-- ── 7b. notify_primary_ads_completed — disalin dari produksi ───────────────
CREATE OR REPLACE FUNCTION public.notify_primary_ads_completed()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_url    text;
  v_secret text;
  rec      record;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_ad_completed_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;

  IF v_url IS NULL THEN
    v_url := 'https://submit.jakpatforuniv.com/api/notify-ad-completed';
  END IF;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_primary_ads_completed: vault secret cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  FOR rec IN
    SELECT s.id AS schedule_id,
           s.submission_id,
           s.ordinal,
           s.booking_id,
           s.start_date,
           s.end_date,
           fs.email,
           fs.full_name,
           fs.title
    FROM public.ad_schedules s
    JOIN public.form_submissions fs ON fs.id = s.submission_id
    WHERE (lower(s.payment_status) = 'paid' OR s.air_on_credit_at IS NOT NULL)
      AND s.end_date IS NOT NULL
      AND fs.email IS NOT NULL
      AND s.completed_notified_at IS NULL
      AND lower(coalesce(s.status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
      AND lower(coalesce(fs.submission_status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
  LOOP
    -- Belum berakhir -> lewati
    IF rec.end_date > now() THEN
      CONTINUE;
    END IF;

    -- Berakhir terlalu lama (> 7 hari) -> tandai tanpa kirim
    IF rec.end_date < now() - INTERVAL '7 days' THEN
      UPDATE public.ad_schedules
        SET completed_notified_at = now()
        WHERE id = rec.schedule_id;
      IF rec.ordinal = 1 THEN
        UPDATE public.form_submissions
          SET completed_notified_at = now()
          WHERE id = rec.submission_id AND completed_notified_at IS NULL;
      END IF;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url     := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'submission_id', rec.submission_id,
        'schedule_id',   rec.schedule_id,
        'booking_id',    rec.booking_id,
        'ordinal',       rec.ordinal,
        'email',         rec.email,
        'full_name',     rec.full_name,
        'title',         rec.title,
        'start_date',    rec.start_date,
        'end_date',      rec.end_date
      ),
      timeout_milliseconds := 5000
    );

    UPDATE public.ad_schedules
      SET completed_notified_at = now()
      WHERE id = rec.schedule_id;

    IF rec.ordinal = 1 THEN
      UPDATE public.form_submissions
        SET completed_notified_at = now()
        WHERE id = rec.submission_id AND completed_notified_at IS NULL;
    END IF;
  END LOOP;
END;
$function$;


-- ── 8. trg_close_page_on_extend_unpaid — disalin dari produksi ─────────────
-- sql/102: jadwal kredit tidak ditutup saat payment_status keluar dari lunas.
-- "Tandai Belum Lunas" pada perpanjangan kredit mengembalikannya ke kredit,
-- dan iklannya memang berhak tayang (K9).
CREATE OR REPLACE FUNCTION public.trg_close_page_on_extend_unpaid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.payment_status IN ('paid', 'completed'), FALSE)
     AND NOT COALESCE(NEW.payment_status IN ('paid', 'completed'), FALSE)
     -- ── TAMBAHAN sql/102 ──
     AND NEW.air_on_credit_at IS NULL
  THEN
    -- Hanya bila jendela halaman MEMANG milik perpanjangan ini — persis
    -- seperti yang ditulis cron_activate_extends langkah 2. Jendela milik
    -- jadwal lain tidak disentuh.
    -- TANPA auto_closed_at: ensure_survey_page akan membukanya dengan tanggal
    -- ordinal 1, padahal jendela ini milik perpanjangan. Membukanya lagi
    -- adalah tugas cron_activate_extends begitu jadwal ini live+paid lagi.
    UPDATE survey_pages sp
       SET publish_end_date = now(),
           updated_at       = now()
     WHERE sp.submission_id = NEW.submission_id
       AND sp.publish_start_date = OLD.start_date
       AND sp.publish_end_date   = OLD.end_date
       AND sp.publish_end_date   > now();
  END IF;

  RETURN NULL;
END;
$function$;


-- ── 9. mark_schedules_on_credit — satu-satunya penulis kolom kredit ────────
-- Dipanggil dashboard admin SESUDAH baris tagihan tempo tertulis. Atomik per
-- jadwal; hasilnya dilaporkan per jadwal (pola settleGroupAsPaid).
--
--   ordinal 1 : form_submissions.submission_status → 'scheduled',
--               slot_booked_by → 'admin'. payment_status TIDAK disentuh.
--               order_is_airable() (sql/99) menerima 'scheduled', jadi
--               trg_ensure_survey_page melahirkan halamannya.
--   ordinal ≥2: ad_schedules.status → 'scheduled', slot_booked_by → 'admin'.
--               cron_activate_extends (langkah 6) mengangkatnya.
--
-- ⚠️ slot_booked_by='admin' BUKAN kosmetik. Cron pelepas slot (sql/94),
-- penjaga kuota, penjaga jendela, hitung mundur, dan tombol batal peneliti
-- semuanya hanya menyentuh hold 'user'. Tanpa ini jadwal kredit yang dipesan
-- sendiri oleh peneliti dilepas cron — tanggal dikosongkan, halaman yang
-- sedang tayang ditutup.
--
-- ⚠️ REVIEW TIDAK BOLEH DILOMPATI: hanya order yang sudah lolos review
-- (approved / slot_reserved / waiting_payment / scheduled) yang boleh kredit.
CREATE OR REPLACE FUNCTION public.mark_schedules_on_credit(p_schedule_ids uuid[], p_note text DEFAULT NULL)
RETURNS TABLE(schedule_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_email  text;
  r        record;
BEGIN
  v_email := lower(coalesce(v_claims ->> 'email', ''));
  IF v_claims IS NOT NULL
     AND v_email <> 'product@jakpat.net'
     AND coalesce(v_claims ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Hanya admin yang bisa menayangkan jadwal sebelum lunas.';
  END IF;

  FOR r IN
    SELECT a.id, a.source_table, a.source_id, a.status, a.payment_status,
           a.start_date, a.review_status
      FROM ad_schedules a
     WHERE a.id = ANY(p_schedule_ids)
     ORDER BY a.id
       FOR UPDATE
  LOOP
    schedule_id := r.id;

    IF coalesce(r.payment_status, '') IN ('paid', 'completed') THEN
      outcome := 'already_paid'; RETURN NEXT; CONTINUE;
    END IF;
    IF r.start_date IS NULL THEN
      outcome := 'no_date'; RETURN NEXT; CONTINUE;
    END IF;

    -- 'live' ikut diterima dan DIPERTAHANKAN: menerbitkan ulang tagihan tempo
    -- untuk iklan yang sedang tayang tidak boleh memundurkannya ke 'scheduled'.
    IF r.source_table = 'form_submissions' THEN
      UPDATE form_submissions fs
         SET submission_status = CASE WHEN fs.submission_status = 'live' THEN 'live' ELSE 'scheduled' END,
             slot_booked_by    = 'admin'
       WHERE fs.id = r.source_id
         AND fs.submission_status IN ('approved', 'slot_reserved', 'waiting_payment', 'scheduled', 'live');
      IF NOT FOUND THEN
        outcome := 'not_eligible'; RETURN NEXT; CONTINUE;
      END IF;
    ELSE
      UPDATE ad_schedules a
         SET status         = CASE WHEN a.status = 'live' THEN 'live' ELSE 'scheduled' END,
             slot_booked_by = 'admin',
             updated_at     = now()
       WHERE a.id = r.id
         AND coalesce(a.review_status, '') = 'approved'
         AND a.status IN ('requested', 'slot_reserved', 'waiting_payment', 'scheduled', 'live');
      IF NOT FOUND THEN
        outcome := 'not_eligible'; RETURN NEXT; CONTINUE;
      END IF;
    END IF;

    -- Sesudah sync_ad_schedule_from_submission (ordinal 1) — trigger itu
    -- tidak menyebut kolom kredit, jadi nilainya tidak tertimpa.
    UPDATE ad_schedules a
       SET air_on_credit_at   = coalesce(a.air_on_credit_at, now()),
           air_on_credit_by   = coalesce(a.air_on_credit_by, nullif(v_email, '')),
           air_on_credit_note = coalesce(nullif(btrim(p_note), ''), a.air_on_credit_note)
     WHERE a.id = r.id;

    outcome := 'ok'; RETURN NEXT;
  END LOOP;
END;
$function$;


-- ── 10a. tempo_renewal_candidate — apa yang harus dilakukan /bayar/? ───────
-- Dipanggil functions/bayar/[id].js (service_role) begitu resolver menjawab
-- `tempo_renewable`. Satu baris:
--   live_payment_id/live_url terisi → sudah ada link tempo hidup, pakai itu
--                                     (idempoten: jangan cetak yang kedua).
--   old_payment_id terisi           → perbarui: cetak link DOKU senilai
--                                     `amount` lalu panggil renew_tempo_bill.
-- Nominal = Σ porsi baris lama yang masih pending — BUKAN harga hari ini (K10).
CREATE OR REPLACE FUNCTION public.tempo_renewal_candidate(p_schedule_id uuid)
RETURNS TABLE(
  old_payment_id     text,
  amount             bigint,
  member_count       integer,
  live_payment_id    text,
  live_url           text,
  lead_submission_id uuid,
  lead_schedule_id   uuid,
  customer_name      text,
  customer_email     text,
  customer_phone     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mine AS (
    SELECT i.payment_id, i.invoice_url, i.expires_at, i.created_at
      FROM invoices i
     WHERE i.schedule_id = p_schedule_id
       AND i.is_tempo
       AND i.status = 'pending'
     ORDER BY i.created_at DESC
     LIMIT 1
  ),
  live AS (
    SELECT m.payment_id, m.invoice_url FROM mine m
     WHERE m.expires_at IS NULL OR (m.expires_at AT TIME ZONE 'UTC') >= now()
  ),
  dead AS (
    SELECT m.payment_id FROM mine m
     WHERE m.expires_at IS NOT NULL AND (m.expires_at AT TIME ZONE 'UTC') < now()
  ),
  rows_ AS (
    SELECT i.amount, i.schedule_id, i.form_submission_id, a.start_date, a.ordinal
      FROM invoices i
      LEFT JOIN ad_schedules a ON a.id = i.schedule_id
     WHERE i.payment_id = (SELECT d.payment_id FROM dead d)
       AND i.status = 'pending'
       AND i.is_tempo
  ),
  lead AS (
    -- Aturan lead yang sama dengan authoritative_payment_url().
    SELECT r.schedule_id, r.form_submission_id FROM rows_ r
     ORDER BY r.start_date ASC NULLS LAST, r.ordinal ASC NULLS FIRST
     LIMIT 1
  )
  SELECT
    (SELECT d.payment_id FROM dead d),
    (SELECT coalesce(sum(r.amount), 0)::bigint FROM rows_ r),
    (SELECT count(*)::int FROM rows_ r),
    (SELECT l.payment_id FROM live l),
    (SELECT l.invoice_url FROM live l),
    (SELECT ld.form_submission_id FROM lead ld),
    (SELECT ld.schedule_id FROM lead ld),
    fs.full_name, fs.email, fs.phone_number
  FROM (SELECT 1) one
  LEFT JOIN form_submissions fs ON fs.id = (SELECT ld.form_submission_id FROM lead ld);
$function$;


-- ── 10b. renew_tempo_bill — tulis link baru & tutup yang lama, ATOMIK ──────
-- Dipanggil SESUDAH link DOKU baru tercetak. Dalam satu transaksi:
--   1. kunci baris tempo lama yang masih pending (FOR UPDATE);
--   2. buktikan Σ invoice = Σ transaksi = p_amount (nominal yang ditagih DOKU);
--   3. tutup yang lama: invoices & transactions → 'cancelled' + superseded_by;
--   4. salin barisnya dengan payment_id/URL/umur baru, is_tempo = true.
--
-- ⚠️ 'cancelled', BUKAN 'expired', juga untuk transactions:
-- markScheduleAsPaid mengubah baris 'pending' DAN 'expired' jadi 'paid'. Baris
-- lama yang ditutup 'expired' akan terhitung lagi sebagai pendapatan pada
-- "Tandai Lunas" berikutnya — sekali per pembaruan.
--
-- ⚠️ TUTUP DULU, BARU SALIN. Unique index invoices_one_pending_tempo_per_schedule
-- diperiksa per pernyataan; menyalin sebelum menutup menabraknya.
--
-- Balapan: pemanggil kedua menunggu kunci, lalu mendapati baris lamanya sudah
-- 'cancelled' → outcome 'already_renewed' + link pemenang. Pemanggilnya wajib
-- membatalkan link DOKU yatimnya sendiri lewat Cancel Order.
CREATE OR REPLACE FUNCTION public.renew_tempo_bill(
  p_old_payment_id  text,
  p_new_payment_id  text,
  p_invoice_url     text,
  p_expires_at      timestamptz,
  p_doku_request_id text,
  p_amount          bigint
)
RETURNS TABLE(outcome text, payment_id text, invoice_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
-- Kolom keluaran `payment_id`/`invoice_url` sama nama dengan kolom tabel.
#variable_conflict use_column
DECLARE
  v_inv_ids  uuid[];
  v_txn_ids  uuid[];
  v_inv_sum  bigint;
  v_txn_sum  bigint;
  v_sched    uuid[];
BEGIN
  IF p_old_payment_id IS NULL OR p_new_payment_id IS NULL OR p_invoice_url IS NULL THEN
    RAISE EXCEPTION 'renew_tempo_bill: argumen wajib kosong.';
  END IF;

  -- 1. Kunci. Pemanggil kedua berhenti di sini sampai yang pertama commit,
  --    lalu mengevaluasi ulang `status = 'pending'` pada baris terbaru.
  SELECT array_agg(i.id ORDER BY i.id), coalesce(sum(i.amount), 0), array_agg(i.schedule_id)
    INTO v_inv_ids, v_inv_sum, v_sched
    FROM (SELECT * FROM invoices
           WHERE invoices.payment_id = p_old_payment_id
             AND invoices.status = 'pending'
             AND invoices.is_tempo
           ORDER BY invoices.id
             FOR UPDATE) i;

  IF v_inv_ids IS NULL THEN
    -- Kalah balapan, atau memang tidak ada lagi yang perlu diperbarui.
    RETURN QUERY
      SELECT 'already_renewed'::text, i.payment_id, i.invoice_url
        FROM invoices i
       WHERE i.is_tempo
         AND i.status = 'pending'
         AND i.schedule_id IN (SELECT o.schedule_id FROM invoices o
                                WHERE o.payment_id = p_old_payment_id)
       ORDER BY i.created_at DESC
       LIMIT 1;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'nothing_to_renew'::text, NULL::text, NULL::text;
    END IF;
    RETURN;
  END IF;

  SELECT array_agg(t.id ORDER BY t.id), coalesce(sum(t.amount), 0)
    INTO v_txn_ids, v_txn_sum
    FROM (SELECT * FROM transactions
           WHERE transactions.payment_id = p_old_payment_id
             AND transactions.status = 'pending'
           ORDER BY transactions.id
             FOR UPDATE) t;

  -- 2. Nominal. Meleset = jangan tulis apa pun; link DOKU baru akan dibatalkan
  --    pemanggil. Lebih baik halaman galat daripada link yang ditolak webhook
  --    STEP 0 (amount_mismatch) SESUDAH uang peneliti masuk.
  IF v_inv_sum <> p_amount
     OR v_txn_sum <> p_amount
     OR coalesce(array_length(v_txn_ids, 1), 0) <> array_length(v_inv_ids, 1) THEN
    RAISE EXCEPTION 'renew_tempo_bill: nominal/baris tidak cocok (invoice %, transaksi % × %, DOKU %).',
      v_inv_sum, v_txn_sum, coalesce(array_length(v_txn_ids, 1), 0), p_amount;
  END IF;

  -- 3. Tutup yang lama.
  UPDATE invoices
     SET status = 'cancelled', superseded_by = p_new_payment_id
   WHERE id = ANY(v_inv_ids);

  UPDATE transactions
     SET status = 'cancelled', updated_at = now()
   WHERE id = ANY(v_txn_ids);

  -- 4. Salin. invoices.created_at & expires_at bertipe TANPA zona dan diisi
  --    jam UTC oleh seluruh kode lain — ikuti konvensinya.
  INSERT INTO invoices (
    form_submission_id, invoice_url, payment_id, amount, status,
    created_at, expires_at, entity_type, extend_id,
    subtotal, ppn_rate, ppn_amount, schedule_id, voucher_code,
    billed_start_date, doku_request_id, is_tempo
  )
  SELECT i.form_submission_id, p_invoice_url, p_new_payment_id, i.amount, 'pending',
         (now() AT TIME ZONE 'UTC'), (p_expires_at AT TIME ZONE 'UTC'), i.entity_type, i.extend_id,
         i.subtotal, i.ppn_rate, i.ppn_amount, i.schedule_id, i.voucher_code,
         i.billed_start_date, p_doku_request_id, true
    FROM invoices i
   WHERE i.id = ANY(v_inv_ids);

  INSERT INTO transactions (
    form_submission_id, payment_id, payment_method, amount, status,
    payment_url, note, entity_type, extend_id,
    subtotal, ppn_rate, ppn_amount, schedule_id, voucher_code,
    billed_start_date, doku_request_id
  )
  SELECT t.form_submission_id, p_new_payment_id, 'doku', t.amount, 'pending',
         p_invoice_url, t.note, t.entity_type, t.extend_id,
         t.subtotal, t.ppn_rate, t.ppn_amount, t.schedule_id, t.voucher_code,
         t.billed_start_date, p_doku_request_id
    FROM transactions t
   WHERE t.id = ANY(v_txn_ids);

  RETURN QUERY SELECT 'renewed'::text, p_new_payment_id, p_invoice_url;
END;
$function$;


-- ── 10c. adopt_superseded_tempo_payment — bayar telat ke link yang diganti ──
-- Peneliti membuka link tempo lama (VA/QRIS sudah terbit), `/bayar/` sempat
-- memperbaruinya, lalu uangnya masuk ke link LAMA. Tanpa ini webhook menahannya
-- sebagai `paid_on_dead_bill` sementara link penggantinya masih menagih — dan
-- peneliti bisa membayar dua kali.
--
-- Yang dilakukan, dalam SATU transaksi:
--   1. ikuti rantai `superseded_by` sampai tagihan pengganti TERAKHIR;
--   2. syarat adopsi: pengganti itu masih `pending` seluruhnya, dan menaungi
--      jadwal yang PERSIS sama dengan tagihan lama (kalau ada anggota yang
--      keluar di antaranya, nominal lama menagih jadwal yang sudah batal —
--      itu keputusan manusia, jadi TIDAK diadopsi);
--   3. tutup pengganti (`cancelled`, superseded_by = yang lama), lalu hidupkan
--      lagi baris lama ke `pending` — webhook lalu melunasinya lewat jalur biasa.
-- Tutup DULU baru hidupkan: unique index satu-tempo-pending-per-jadwal.
--
-- `not_adoptable` / `not_superseded` = webhook jatuh ke `paid_on_dead_bill`
-- seperti sebelumnya (alert admin). Pemanggil WAJIB membatalkan link DOKU
-- pengganti lewat `successor_request_id`.
CREATE OR REPLACE FUNCTION public.adopt_superseded_tempo_payment(p_old_payment_id text)
RETURNS TABLE(outcome text, successor_payment_id text, successor_request_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_succ  text;
  v_next  text;
  v_hops  int := 0;
  v_old_sched  uuid[];
  v_succ_sched uuid[];
  v_req   text;
BEGIN
  SELECT i.superseded_by INTO v_succ
    FROM invoices i
   WHERE i.payment_id = p_old_payment_id
     AND i.is_tempo AND i.status = 'cancelled' AND i.superseded_by IS NOT NULL
   LIMIT 1;
  IF v_succ IS NULL THEN
    RETURN QUERY SELECT 'not_superseded'::text, NULL::text, NULL::text; RETURN;
  END IF;

  LOOP
    SELECT i.superseded_by INTO v_next
      FROM invoices i
     WHERE i.payment_id = v_succ AND i.status = 'cancelled' AND i.superseded_by IS NOT NULL
     LIMIT 1;
    EXIT WHEN v_next IS NULL OR v_hops > 50;
    v_succ := v_next; v_hops := v_hops + 1;
  END LOOP;

  -- Kunci pengganti; hanya yang masih pending yang boleh diambil alih.
  PERFORM 1 FROM invoices i WHERE i.payment_id = v_succ FOR UPDATE;
  IF EXISTS (SELECT 1 FROM invoices i WHERE i.payment_id = v_succ AND i.status <> 'pending') THEN
    RETURN QUERY SELECT 'not_adoptable'::text, v_succ, NULL::text; RETURN;
  END IF;

  SELECT array_agg(DISTINCT i.schedule_id ORDER BY i.schedule_id) INTO v_old_sched
    FROM invoices i WHERE i.payment_id = p_old_payment_id;
  SELECT array_agg(DISTINCT i.schedule_id ORDER BY i.schedule_id) INTO v_succ_sched
    FROM invoices i WHERE i.payment_id = v_succ;
  IF v_old_sched IS DISTINCT FROM v_succ_sched THEN
    RETURN QUERY SELECT 'not_adoptable'::text, v_succ, NULL::text; RETURN;
  END IF;

  SELECT i.doku_request_id INTO v_req FROM invoices i WHERE i.payment_id = v_succ LIMIT 1;

  UPDATE invoices SET status = 'cancelled', superseded_by = p_old_payment_id
   WHERE payment_id = v_succ AND status = 'pending';
  UPDATE transactions SET status = 'cancelled', updated_at = now()
   WHERE payment_id = v_succ AND status = 'pending';

  UPDATE invoices SET status = 'pending', superseded_by = NULL
   WHERE payment_id = p_old_payment_id AND status = 'cancelled';
  UPDATE transactions SET status = 'pending', updated_at = now()
   WHERE payment_id = p_old_payment_id AND status = 'cancelled';

  RETURN QUERY SELECT 'adopted'::text, v_succ, v_req;
END;
$function$;


-- ── 11. Hibah fungsi ───────────────────────────────────────────────────────
-- ⚠️ pg_default_acl memberi anon DAN authenticated EXECUTE ke setiap fungsi
-- baru di public; REVOKE FROM PUBLIC saja tidak mencabutnya.
REVOKE ALL ON FUNCTION public.guard_air_on_credit_columns()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_schedules_on_credit(uuid[], text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tempo_renewal_candidate(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_tempo_bill(text, text, text, timestamptz, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adopt_superseded_tempo_payment(text)                FROM PUBLIC, anon, authenticated;

-- Dashboard admin memanggil lewat sesi login (authenticated); gerbang admin
-- ada DI DALAM fungsinya.
GRANT EXECUTE ON FUNCTION public.mark_schedules_on_credit(uuid[], text) TO authenticated, service_role;
-- Hanya Pages Function /bayar/ (service_role).
GRANT EXECUTE ON FUNCTION public.tempo_renewal_candidate(uuid)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_tempo_bill(text, text, text, timestamptz, text, bigint) TO service_role;
-- Hanya webhook DOKU (service_role).
GRANT EXECUTE ON FUNCTION public.adopt_superseded_tempo_payment(text)                TO service_role;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (sesudah COMMIT)
-- ============================================================================
-- 3a. Hibah (harapan: anon TIDAK muncul di keempatnya; authenticated hanya di
--     mark_schedules_on_credit):
-- SELECT proname, proacl FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace
--    AND proname IN ('guard_air_on_credit_columns','mark_schedules_on_credit',
--                    'tempo_renewal_candidate','renew_tempo_bill',
--                    'adopt_superseded_tempo_payment');
--
-- 3b. Tidak ada perilaku yang berubah untuk data lama (harapan: 0 dan 0):
-- SELECT count(*) FILTER (WHERE air_on_credit_at IS NOT NULL) AS kredit,
--        (SELECT count(*) FROM invoices WHERE is_tempo) AS tempo
--   FROM ad_schedules;
--
-- 3c. Resolver untuk order audit masih menjawab seperti sebelumnya
--     (WH265TVZ: live; tiga lainnya: paid atau bill_cancelled):
-- SELECT s.booking_id, r.reason
--   FROM ad_schedules s, authoritative_payment_url(s.id) r
--  WHERE s.booking_id IN ('J8AXQVCF','QE8KND8B','RWJJAARF','WH265TVZ');
--
-- 3d. UJI PERILAKU — SELURUHNYA DI-ROLLBACK. Pilih satu jadwal ordinal 1
--     yang `approved`/`waiting_payment`, bertanggal, milik akun uji. Ganti
--     <JADWAL_UJI> dan <PENELITI_UUID>/<PENELITI_EMAIL>.
--
-- BEGIN;
--   -- (i) peneliti ditolak menulis kolom kredit (harapan: ERROR)
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"role":"authenticated","sub":"<PENELITI_UUID>","email":"<PENELITI_EMAIL>"}', true);
--   UPDATE ad_schedules SET air_on_credit_at = now() WHERE id = '<JADWAL_UJI>';
-- ROLLBACK;
--
-- BEGIN;
--   -- (ii) peneliti tidak bisa memanggil RPC admin (harapan: ERROR)
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"role":"authenticated","sub":"<PENELITI_UUID>","email":"<PENELITI_EMAIL>"}', true);
--   SELECT * FROM mark_schedules_on_credit(ARRAY['<JADWAL_UJI>'::uuid], 'uji');
-- ROLLBACK;
--
-- BEGIN;
--   -- (iii) admin: kredit membuka halaman, uang tidak tersentuh, cron tidak melepas
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"role":"authenticated","email":"product@jakpat.net"}', true);
--   SELECT * FROM mark_schedules_on_credit(ARRAY['<JADWAL_UJI>'::uuid], 'uji');  -- harapan: ok
--   RESET ROLE;
--   SELECT a.status, a.payment_status, a.slot_booked_by, a.air_on_credit_at IS NOT NULL AS kredit,
--          fs.submission_status, fs.payment_status AS fs_pay
--     FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id
--    WHERE a.id = '<JADWAL_UJI>';
--   -- harapan: scheduled / pending / admin / true / scheduled / pending
--   SELECT sp.publish_start_date, sp.publish_end_date FROM survey_pages sp
--     JOIN ad_schedules a ON a.submission_id = sp.submission_id WHERE a.id = '<JADWAL_UJI>';
--   -- harapan: satu baris halaman, jendela terbuka
--   SELECT * FROM release_expired_order_slots();                -- harapan: jadwal uji TIDAK ada
--   SELECT * FROM schedule_billing('<JADWAL_UJI>');             -- harapan: sama seperti sebelum
-- ROLLBACK;
--
-- BEGIN;
--   -- (iv) tempo: utang tetap dihitung sesudah link lewat, resolver minta pembaruan
--   INSERT INTO invoices (form_submission_id, payment_id, invoice_url, amount, status,
--                         expires_at, schedule_id, is_tempo)
--   SELECT a.submission_id, 'UJI-TEMPO-1', 'https://example.invalid', 1110, 'pending',
--          (now() - interval '1 minute') AT TIME ZONE 'UTC', a.id, true
--     FROM ad_schedules a WHERE a.id = '<JADWAL_UJI>' AND a.ordinal = 1;
--   INSERT INTO transactions (form_submission_id, payment_id, amount, status, payment_url, payment_method)
--   SELECT a.submission_id, 'UJI-TEMPO-1', 1110, 'pending', 'https://example.invalid', 'doku'
--     FROM ad_schedules a WHERE a.id = '<JADWAL_UJI>';
--   SELECT * FROM schedule_billing_summary('<JADWAL_UJI>');  -- harapan: outstanding ≥ 1110
--   SELECT reason FROM authoritative_payment_url('<JADWAL_UJI>'); -- harapan: tempo_renewable
--   SELECT * FROM tempo_renewal_candidate('<JADWAL_UJI>');   -- harapan: old=UJI-TEMPO-1, amount 1110
--   SELECT * FROM renew_tempo_bill('UJI-TEMPO-1','UJI-TEMPO-2','https://example.invalid/2',
--                                  now() + interval '7 days', 'req-uji', 1110);  -- harapan: renewed
--   SELECT * FROM renew_tempo_bill('UJI-TEMPO-1','UJI-TEMPO-3','https://example.invalid/3',
--                                  now() + interval '7 days', 'req-uji', 1110);  -- harapan: already_renewed, UJI-TEMPO-2
--   SELECT payment_id, status, superseded_by, is_tempo FROM invoices
--    WHERE payment_id LIKE 'UJI-TEMPO-%' ORDER BY created_at;
--   -- harapan: UJI-TEMPO-1 cancelled → UJI-TEMPO-2 ; UJI-TEMPO-2 pending, tempo
--   SELECT payment_id, status FROM transactions WHERE payment_id LIKE 'UJI-TEMPO-%';
--   -- harapan: UJI-TEMPO-1 cancelled (BUKAN expired) ; UJI-TEMPO-2 pending
--   SELECT reason FROM authoritative_payment_url('<JADWAL_UJI>'); -- harapan: live
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK (hanya kalau perlu)
-- ============================================================================
-- ⚠️ Pulihkan FUNGSI dulu (badan aslinya tidak menyebut kolom baru), baru
-- buang kolom. Urutan terbalik gagal karena fungsi baru masih merujuk kolom.
--
-- BEGIN;
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT def FROM backup.fn_defs_102 LOOP
--     EXECUTE r.def;
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS public.adopt_superseded_tempo_payment(text);
-- DROP FUNCTION IF EXISTS public.renew_tempo_bill(text, text, text, timestamptz, text, bigint);
-- DROP FUNCTION IF EXISTS public.tempo_renewal_candidate(uuid);
-- DROP FUNCTION IF EXISTS public.mark_schedules_on_credit(uuid[], text);
-- DROP TRIGGER  IF EXISTS trg_ad_schedules_guard_credit ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS public.guard_air_on_credit_columns();
-- DROP INDEX    IF EXISTS public.invoices_one_pending_tempo_per_schedule;
-- ALTER TABLE public.invoices     DROP COLUMN IF EXISTS is_tempo, DROP COLUMN IF EXISTS superseded_by;
-- ALTER TABLE public.ad_schedules DROP COLUMN IF EXISTS air_on_credit_at,
--                                 DROP COLUMN IF EXISTS air_on_credit_by,
--                                 DROP COLUMN IF EXISTS air_on_credit_note;
-- COMMIT;
--
-- ⚠️ Rollback sesudah ada tagihan tempo / jadwal kredit sungguhan membuang
-- penandanya: jadwal kredit kembali terbaca "scheduled + pending" biasa
-- (tetap tayang), dan tagihan tempo terbaca tagihan biasa yang kedaluwarsa.
-- Catat dulu barisnya:
--   SELECT id, booking_id, air_on_credit_at FROM ad_schedules WHERE air_on_credit_at IS NOT NULL;
--   SELECT payment_id, schedule_id, status FROM invoices WHERE is_tempo;
--
-- Snapshot boleh di-DROP setelah fitur tenang satu siklus rilis:
-- DROP TABLE backup.fn_defs_102;
