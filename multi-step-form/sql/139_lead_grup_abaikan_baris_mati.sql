-- ============================================================================
-- sql/139 — Lead tagihan gabungan memilih anggota HIDUP
-- Tanggal: 2026-11-16 · branch fix/tempo-terbit-ulang
--
-- ⚠️ JANGAN "Run" SELURUH BERKAS. Jalankan per bagian, atau pakai
--    139_lead_grup_abaikan_baris_mati_APPLY.sql (isinya hanya bagian APPLY, aman di-Run utuh).
--    Terapkan SEBELUM branch ini di-push ke main (push main = deploy).
--
-- KENAPA
--   Satu pesanan bisa dikeluarkan dari tagihan gabungan dengan membatalkan
--   jadwalnya sebelum tayang: barisnya jadi expired tapi payment_id-nya tetap
--   (insiden Mun11 dobel, 16 Nov 2026). authoritative_payment_url memilih lead
--   dari SEMUA baris grup, jadi bila yang dikeluarkan itu tayang paling awal,
--   /bayar/ semua anggota hidup terlempar ke halaman invoice (bukan lead).
--   fetchInvoiceGroups() (supabase.ts) kini memilih lead dari anggota hidup;
--   aturan ini WAJIB kembar dengannya.
--
-- YANG BERUBAH: hanya CTE grp (kolom is_live) dan lead (disaring is_live,
--   fallback semua bila tak ada yang hidup). is_group, payable, reason: sama.
-- ROLLBACK: badan lama persis (md5 359f8d8acaecb879d3a210dff4a6508e, = sql/102).


-- ============================================================================
-- 1. DRY-RUN (hanya SELECT): grup yang lead-nya akan PINDAH
-- ============================================================================
WITH g AS (
  SELECT i.payment_id, i.status,
         lower(coalesce(i.status, '')) NOT IN ('expired', 'failed', 'cancelled') AS is_live,
         row_number() OVER (PARTITION BY i.payment_id
                            ORDER BY a.start_date ASC NULLS LAST, a.ordinal ASC NULLS FIRST) AS rn
    FROM public.invoices i
    LEFT JOIN public.ad_schedules a ON a.id = i.schedule_id
   WHERE i.payment_id IS NOT NULL
)
SELECT payment_id, count(*) AS anggota, count(*) FILTER (WHERE is_live) AS hidup,
       string_agg(status, ',' ORDER BY rn) AS status_urut_tayang
  FROM g
 GROUP BY payment_id
HAVING count(*) > 1 AND bool_or(is_live) AND bool_or(rn = 1 AND NOT is_live)
 ORDER BY payment_id;
-- Harapan: 0 baris (diperiksa 16 Nov 2026 18.45 WIB) — migrasi ini PENCEGAHAN.
-- Baris yang muncul = tagihan yang lead-nya pindah ke anggota hidup; tidak ada
-- yang lain yang berubah.

SELECT md5(prosrc) AS md5_sekarang, proacl::text AS acl
  FROM pg_proc WHERE oid = 'public.authoritative_payment_url(uuid)'::regprocedure;
-- Harapan: 359f8d8acaecb879d3a210dff4a6508e | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}


-- ============================================================================
-- 2. APPLY (jalankan SENDIRI, dari BEGIN sampai COMMIT)
-- ============================================================================
BEGIN;

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
    SELECT i.schedule_id, a.start_date, a.ordinal,
           -- ── sql/139 ── baris mati = pesanan yang DIKELUARKAN dari tagihan
           -- (jadwalnya dibatalkan sebelum tayang). Cermin `DEAD_PAYMENT_STATUSES`
           -- dan `isDead` di `fetchInvoiceGroups()` (supabase.ts).
           lower(coalesce(i.status, '')) NOT IN ('expired', 'failed', 'cancelled') AS is_live
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
  --
  -- ⚠️ sql/139: lead dipilih dari anggota HIDUP. Anggota yang dikeluarkan tetap
  -- ber-payment_id sama; kalau ia yang paling awal, ia merebut kursi lead dan
  -- tombol bayar semua anggota hidup terlempar ke halaman invoice. Seluruh
  -- anggota mati = riwayat → semua dihitung, seperti dulu. `is_group` SENGAJA
  -- tetap menghitung semua baris: follower diarahkan ke halaman invoice, jangan
  -- pernah ke link DOKU grup yang mungkin menagih total lama.
  lead AS (
    SELECT schedule_id FROM grp
     WHERE is_live OR NOT EXISTS (SELECT 1 FROM grp g2 WHERE g2.is_live)
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

-- Asersi di dalam transaksi: gagal = seluruh blok batal.
DO $$
DECLARE
  v_md5 text;
  v_acl text;
BEGIN
  SELECT md5(prosrc), proacl::text INTO v_md5, v_acl
    FROM pg_proc WHERE oid = 'public.authoritative_payment_url(uuid)'::regprocedure;
  IF v_md5 = '359f8d8acaecb879d3a210dff4a6508e' THEN
    RAISE EXCEPTION 'sql/139: badan fungsi tidak berubah.';
  END IF;
  -- CREATE OR REPLACE mempertahankan ACL; dibuktikan, bukan dipercaya
  -- (memori: hibah otomatis anon pada fungsi BARU di public).
  IF v_acl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION 'sql/139: ACL berubah jadi %', v_acl;
  END IF;
  RAISE NOTICE 'sql/139 OK: md5 % , ACL tetap.', v_md5;
END $$;

COMMIT;


-- ============================================================================
-- 3. VERIFY
-- ============================================================================
SELECT md5(prosrc) <> '359f8d8acaecb879d3a210dff4a6508e' AS berubah, proacl::text AS acl
  FROM pg_proc WHERE oid = 'public.authoritative_payment_url(uuid)'::regprocedure;
-- Harapan: true | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

-- Contoh nyata: grup Mun#07 (tanpa anggota mati) — tidak berubah.
SELECT reason, payment_id, is_group, is_lead
  FROM public.authoritative_payment_url('1ae49541-4938-4dca-b2db-82d33480be9a');
-- Harapan: live | JFU-INV-c85fe8-1794826746218 | true | true


-- ============================================================================
-- 4. ROLLBACK (hapus awalan `-- ` lalu jalankan sebagai satu blok)
-- ============================================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.authoritative_payment_url(p_schedule_id uuid)
--  RETURNS TABLE(payment_url text, payment_id text, is_group boolean, is_lead boolean, reason text)
--  LANGUAGE sql
--  STABLE
--  SET search_path TO 'public'
-- AS $function$
--   WITH sched AS (
--     SELECT id, status, start_date, slot_booked_by FROM ad_schedules WHERE id = p_schedule_id
--   ),
--   ev AS (
--     SELECT * FROM schedule_billing(p_schedule_id)
--   ),
--   -- ── TAMBAHAN sql/102 ──
--   -- Dibaca dari invoices langsung: schedule_billing sengaja tidak lagi
--   -- menandai baris tempo kedaluwarsa (utang ≠ link), dan kolom is_tempo tidak
--   -- ikut di signature-nya.
--   tempo_dead AS (
--     SELECT i.payment_id
--       FROM invoices i
--      WHERE i.schedule_id = p_schedule_id
--        AND i.is_tempo
--        AND i.status = 'pending'
--        AND i.expires_at IS NOT NULL
--        AND (i.expires_at AT TIME ZONE 'UTC') < now()
--      ORDER BY i.created_at DESC
--      LIMIT 1
--   ),
--   -- Predikat `live` sql/83, disalin UTUH. Kalau yang di sana berubah, yang di
--   -- sini WAJIB ikut — dan uji `authoritative_payment_url` yang menangkapnya.
--   live AS (
--     SELECT * FROM ev
--      WHERE payment_status_rank(status) = 3
--         OR (payment_status_rank(status) = 1 AND source = 'invoice'
--             AND NOT is_superseded AND NOT is_stale AND NOT is_expired)
--   ),
--   -- Yang boleh DIBAYAR: hidup, belum lunas, dan punya URL. Terbaru menang —
--   -- sesudah Langkah 3 tagihan lama sudah dimatikan saat penyalipnya terbit,
--   -- jadi normalnya himpunan ini beranggota nol atau satu.
--   -- ⚠️ sql/102: tagihan tempo yang link-nya mati BUKAN payable.
--   payable AS (
--     SELECT * FROM live l
--      WHERE payment_status_rank(l.status) = 1 AND l.payment_url IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM tempo_dead t WHERE t.payment_id = l.payment_id)
--      ORDER BY l.created_at DESC
--      LIMIT 1
--   ),
--   -- Peristiwa tagihan TERBARU, apa pun statusnya. Dipakai HANYA untuk
--   -- membedakan "dibatalkan" dari "kedaluwarsa" — lihat catatan di kepala
--   -- BAGIAN A soal kenapa ini tidak boleh jadi `EXISTS` yang longgar.
--   newest AS (
--     SELECT * FROM ev ORDER BY created_at DESC LIMIT 1
--   ),
--   -- Tagihan yang dijawab resolver: yang payable, atau tempo yang perlu
--   -- diperbarui (sql/102) — supaya is_group/is_lead tetap terjawab untuknya.
--   answer AS (
--     SELECT coalesce((SELECT p.payment_id FROM payable p),
--                     (SELECT t.payment_id FROM tempo_dead t)) AS payment_id
--   ),
--   -- Anggota grup dibaca dari `invoices`, bukan dari `ev`: `schedule_billing`
--   -- berlingkup SATU jadwal, jadi ia tidak bisa melihat saudara-saudaranya.
--   grp AS (
--     SELECT i.schedule_id, a.start_date, a.ordinal
--       FROM invoices i
--       LEFT JOIN ad_schedules a ON a.id = i.schedule_id
--      WHERE i.payment_id = (SELECT x.payment_id FROM answer x)
--   ),
--   -- Aturan lead IDENTIK dengan `fetchInvoiceGroups()` (supabase.ts): tanggal
--   -- tayang paling awal dulu, yang tak bertanggal di BELAKANG, lalu ordinal.
--   -- Kartu peneliti sudah memakai aturan ini untuk memutuskan siapa yang
--   -- memegang tombol bayar; resolver tidak boleh punya pendapat sendiri.
--   --
--   -- ⚠️ ARAH NULL-nya BEDA di dua kolom, dan keduanya menyalin TypeScript:
--   --   start_date → `startDate ? t : MAX_SAFE_INTEGER`  = NULLS LAST
--   --   ordinal    → `a.ordinal ?? 0`, dan ordinal asli mulai dari 1
--   --                                                    = NULLS FIRST
--   -- Menyeragamkannya jadi NULLS LAST terlihat lebih rapi dan LANGSUNG SALAH:
--   -- baris warisan (invoices.schedule_id NULL → ordinal NULL) akan berpindah
--   -- dari depan ke belakang, dan "siapa pemegang tombol bayar" ikut berpindah.
--   lead AS (
--     SELECT schedule_id FROM grp
--      ORDER BY start_date ASC NULLS LAST, ordinal ASC NULLS FIRST
--      LIMIT 1
--   )
--   SELECT
--     (SELECT p.payment_url FROM payable p),
--     (SELECT x.payment_id  FROM answer x),
--     (SELECT count(*) > 1 FROM grp),
--     -- Jadwal tunggal SELALU lead-nya sendiri. `false` di sini akan melempar
--     -- pembayar solo ke halaman invoice tanpa alasan.
--     coalesce((SELECT g.schedule_id FROM lead g) = p_schedule_id, true),
--     CASE
--       WHEN NOT EXISTS (SELECT 1 FROM sched)                        THEN 'not_found'
--       -- ── TAMBAHAN sql/102 ── SEBELUM `live`, lihat kepala blok ini.
--       WHEN EXISTS (SELECT 1 FROM tempo_dead)                       THEN 'tempo_renewable'
--       WHEN EXISTS (SELECT 1 FROM payable)                          THEN 'live'
--       -- Lunas menang atas semua sisanya: uang yang sudah masuk tidak pernah
--       -- basi, tidak pernah kedaluwarsa (sql/83), dan tidak perlu link.
--       WHEN EXISTS (SELECT 1 FROM live WHERE payment_status_rank(status) = 3)
--                                                                    THEN 'paid'
--       WHEN EXISTS (SELECT 1 FROM live WHERE payment_status_rank(status) = 1)
--                                                                    THEN 'no_url'
--       WHEN (SELECT s.status FROM sched s) = 'cancelled'            THEN 'cancelled'
--       -- ⚠️ SESUDAH `cancelled` (jadwal), SEBELUM `stale`/`expired`.
--       -- Jadwalnya masih hidup dan tagihan terakhirnya DIBATALKAN → tagihan
--       -- pengganti sedang disiapkan. Kalimatnya di `functions/bayar/[id].js`
--       -- karena itu "tunggu", BUKAN "jadwalkan ulang".
--       WHEN lower((SELECT n.status FROM newest n)) = 'cancelled'    THEN 'bill_cancelled'
--       WHEN EXISTS (SELECT 1 FROM ev WHERE is_stale OR is_superseded) THEN 'stale'
--       -- ── TAMBAHAN sql/102 ──
--       -- Tagihannya mati, tapi jadwal ini SENDIRI belum lewat batas bayarnya
--       -- (cutoff 14.00 = satu jam sebelum tayang) dan bukan hold peneliti yang
--       -- memang lepas sendiri. Menyuruhnya "jadwalkan ulang" salah arah.
--       WHEN EXISTS (SELECT 1 FROM ev WHERE is_expired)
--            AND (SELECT s.start_date FROM sched s) > now() + interval '1 hour'
--            AND COALESCE((SELECT s.slot_booked_by FROM sched s), '') <> 'user'
--                                                                    THEN 'bill_expired'
--       WHEN EXISTS (SELECT 1 FROM ev WHERE is_expired)              THEN 'expired'
--       WHEN NOT EXISTS (SELECT 1 FROM ev)                           THEN 'none'
--       -- Sisanya: ada tagihan, semuanya sudah mati karena STATUS
--       -- (expired/failed) tanpa jadwalnya ikut batal.
--       ELSE 'expired'
--     END;
-- $function$;
-- COMMIT;
