-- ============================================================================
-- 85 — tagihan BASI ikut dianggap mati, dan satu sumber untuk "link mana yang
--      berwenang hari ini"
-- ============================================================================
-- Dua bagian, satu migrasi, karena keduanya menjawab pertanyaan yang sama dari
-- dua sisi: BAGIAN A untuk uang yang sudah terlanjur masuk, BAGIAN B untuk
-- orang yang belum sempat membayar.
--
-- ⚠️ NOMOR 85 DIPAKAI DUA KALI. Berkas ini (branch fix/link-bayar-berwenang,
--    diterapkan ke produksi 8 Sep 2026) bertetangga dengan
--    `85_add_ai_prescreening_to_submissions.sql` yang datang lewat `main`
--    (diterapkan 10 Sep 2026). Keduanya lahir di branch paralel yang sama-sama
--    melihat `84` sebagai nomor tertinggi.
--
--    Objeknya TIDAK berhubungan — yang satu jalur uang, yang satu kolom
--    `form_submissions.ai_prescreening` — jadi urutan terapnya tidak mengikat,
--    dan karena keduanya sudah dijalankan, tidak ada yang diganti nama
--    (presedennya `61`; lihat "Tabrakan nomor yang diketahui" di sql/README.md).
--
--    Yang berubah karena ini adalah ATURANNYA: nomor migrasi baru diambil
--    sesudah `git fetch`, bukan dari isi folder lokal. `86` masih kosong dan
--    tetap dipesan untuk pelebaran `create_ad_schedule()` di Phase 4.
--
-- ── Kejadiannya ───────────────────────────────────────────────────────────
-- Admin membatalkan pesanan karena salah setup jadwal, menjadwalkan tanggal
-- baru, lalu peneliti membayar lewat link invoice jadwal LAMA. Kelas yang sama
-- tercatat sebagai insiden af004b84 (2 Sep 2026).
--
-- sql/80 sudah menutup varian "tagihannya DIBATALKAN": statusnya berubah jadi
-- `cancelled`, dan `deadBillOutcome` di webhook.js mengenalinya. Yang TIDAK
-- tertutup adalah varian "tanggalnya PINDAH" — di situ status barisnya tetap
-- `pending`, jadi webhook memprosesnya sebagai pembayaran normal.
--
-- `is_stale` (sql/60 → 82) dan `is_superseded` (sql/53) sudah menghitung
-- keadaan itu dengan benar. Yang belum ada cuma: (a) nilai outcome untuk
-- mencatatnya, dan (b) jalan bagi webhook untuk MEMBACA vonis itu tanpa
-- menghitungnya ulang di JavaScript.
--
-- ⚠️ URUTAN DEPLOY: migrasi ini HARUS mendarat SEBELUM webhook.js versi baru
-- dideploy — peringatan yang sama dengan sql/77 dan sql/80, dan alasannya sama.
-- Kalau terbalik, setiap penolakan mencoba INSERT nilai outcome yang belum
-- diizinkan, PostgREST membalas 400, `recordWebhookEvent` menelannya (memang
-- sengaja tidak melempar) — dan penolakannya tidak tercatat sama sekali.
--
-- Idempoten & aman diulang. Nol perubahan data.
-- ============================================================================


-- ============================================================================
-- BAGIAN A — outcome `paid_on_stale_bill`
-- ============================================================================
-- Sifatnya MELONGGARKAN constraint (menambah nilai yang diizinkan), jadi tidak
-- ada baris lama yang bisa jadi tidak sah.
--
-- Kenapa nilai SENDIRI, bukan menumpang `paid_on_dead_bill`: keduanya butuh
-- tindakan admin yang BERBEDA. `paid_on_dead_bill` = tagihannya sudah dicabut,
-- jadi pertanyaannya "refund atau terbitkan ulang?". `paid_on_stale_bill` =
-- tagihannya masih hidup di mata DOKU tapi jadwalnya sudah pindah/tersalip,
-- jadi pertanyaannya "pindahkan uangnya ke tagihan yang benar?". Menggabungkan
-- keduanya membuat antrean admin tidak bisa dipilah.

ALTER TABLE public.doku_webhook_events
  DROP CONSTRAINT IF EXISTS doku_webhook_events_outcome_check;

ALTER TABLE public.doku_webhook_events
  ADD CONSTRAINT doku_webhook_events_outcome_check CHECK (outcome IN (
    -- ── sudah ada sejak sql/54 ──────────────────────────────────────────────
    'ok',                   -- semua tulis terverifikasi          → 200
    'write_failed',         -- ada tulis gagal / 0 baris berubah  → 500 (retry), 200 setelah 5x
    'amount_mismatch',      -- STEP 0 menolak                     → 200
    'no_submission_found',  -- invoice tak dikenal                → 200 (retry tidak menolong)
    'forwarded_jm',         -- invoice JM-* diteruskan            → 200
    'payout',               -- notifikasi payout                  → 200
    -- ── sql/77: request yang tidak pernah sampai ke fase tulis ──────────────
    'rejected_auth',        -- ditolak di gerbang autentikasi     → 401
    'rejected_payload',     -- lolos auth, badannya tak terbaca   → 400
    'handler_crashed',      -- error tak terduga di handler       → 500 (retry)
    -- ── sql/80: uang sah, tapi tagihannya sudah DICABUT ────────────────────
    'paid_on_dead_bill',    -- tagihan cancelled/expired/failed   → 200, NOL tulisan
    -- ── sql/85: uang sah, tagihannya hidup, tapi sudah TIDAK BERWENANG ─────
    'paid_on_stale_bill'    -- jadwalnya pindah / tagihan tersalip → 200, NOL tulisan
  ));

COMMENT ON COLUMN public.doku_webhook_events.outcome IS
  'Nasib satu notifikasi DOKU. ok/write_failed/amount_mismatch/no_submission_found/'
  'forwarded_jm/payout = request sudah lolos autentikasi. rejected_auth/'
  'rejected_payload/handler_crashed (sql/77) = ditolak sebelum fase tulis; '
  'ADA-nya baris ini berarti DOKU menelepon dan kita yang menolak — bedakan dari '
  'TIDAK ADA baris sama sekali, yang berarti DOKU tidak pernah menelepon. '
  'paid_on_dead_bill (sql/80) = uangnya SAH dan sudah diterima DOKU, tapi '
  'tagihannya sudah dibatalkan/kedaluwarsa, jadi jadwalnya SENGAJA tidak '
  'disentuh dan barisnya menunggu keputusan admin. '
  'paid_on_stale_bill (sql/85) = uangnya SAH, tagihannya bahkan masih `pending`, '
  'tapi jadwalnya sudah PINDAH TANGGAL / tagihannya sudah TERSALIP yang lunas — '
  'jadwal juga TIDAK disentuh; bedanya dengan paid_on_dead_bill ada pada '
  'tindakan admin yang dibutuhkan (pindahkan uang, bukan refund/terbitkan ulang).';

-- ⚠️ SAMA SEPERTI sql/80: INI MENUKAR KEGAGALAN BERISIK DENGAN KEGAGALAN SUNYI
-- DI BUKU. Nol tulisan berarti uangnya ada di DOKU sementara buku kita tidak
-- mencatatnya sebagai pemasukan jadwal mana pun. Antreannya:
--
--   select received_at, invoice_number, amount, error_message
--     from public.doku_webhook_events
--    where outcome in ('paid_on_dead_bill', 'paid_on_stale_bill')
--      and resolved_at is null
--    order by received_at desc;


-- ============================================================================
-- BAGIAN B — `authoritative_payment_url()`: SATU ATURAN, JANGAN DUA
-- ============================================================================
-- Link perantara `/bayar/<ad_schedules.id>` menggantikan URL DOKU mentah di
-- email, WhatsApp, salinan admin, dan tombol di dalam aplikasi. Ia harus
-- menjawab "tagihan mana yang berwenang untuk jadwal ini, SEKARANG".
--
-- ⚠️ Pertanyaan itu sudah punya rumah: `live` di `schedule_billing_summary()`
-- (sql/83), yang dicerminkan `isLiveInvoice()` di billingCompare.ts. Pages
-- Function di-bundle sendiri-sendiri sehingga impor lintas berkas GAGAL — jadi
-- resolver tidak bisa memakai cerminan TypeScript-nya, dan kalau ia menulis
-- ulang predikatnya di JavaScript itu jadi definisi KETIGA. Fungsi ini yang
-- menahannya tetap satu: ia dibangun DI ATAS `schedule_billing()`, memakai
-- predikat `live` yang sama persis, dan resolver hanya menuruti jawabannya.
--
-- ── `reason` adalah kontraknya, bukan hiasan ─────────────────────────────────
--   'live'      → ada tagihan yang masih boleh dibayar; payment_url terisi
--   'paid'      → sudah lunas
--   'cancelled' → jadwalnya dibatalkan admin
--   'stale'     → tanggalnya pindah, atau tagihannya tersalip yang lunas
--   'expired'   → lewat tenggat bayar (14.00 WIB hari tayang / batas 7 hari)
--   'none'      → jadwalnya ada, tagihannya belum pernah terbit
--   'no_url'    → tagihannya hidup tapi tidak menyimpan URL (baris warisan)
--   'not_found' → `p_schedule_id` bukan jadwal mana pun
--
-- ⚠️ TIDAK ADA NOMINAL, JUDUL, NAMA, ATAU EMAIL di nilai baliknya, dan itu
-- disengaja. Halaman resolver terbuka TANPA LOGIN (link email wajib bekerja
-- saat sesi peneliti sudah mati), jadi apa pun yang keluar dari sini bisa
-- dipanen dengan menebak UUID. `payment_url` sendiri adalah kapabilitas
-- pembawa yang setara dengan URL DOKU yang hari ini dikirim mentah lewat
-- email — jadi ambangnya TIDAK turun; sisanya tidak boleh ikut.
-- ============================================================================

DROP FUNCTION IF EXISTS public.authoritative_payment_url(uuid);

CREATE FUNCTION public.authoritative_payment_url(p_schedule_id uuid)
 RETURNS TABLE(
   payment_url text,
   payment_id  text,
   is_group    boolean,
   is_lead     boolean,
   reason      text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sched AS (
    SELECT id, status FROM ad_schedules WHERE id = p_schedule_id
  ),
  ev AS (
    SELECT * FROM schedule_billing(p_schedule_id)
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
  payable AS (
    SELECT * FROM live
     WHERE payment_status_rank(status) = 1 AND payment_url IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1
  ),
  -- Anggota grup dibaca dari `invoices`, bukan dari `ev`: `schedule_billing`
  -- berlingkup SATU jadwal, jadi ia tidak bisa melihat saudara-saudaranya.
  grp AS (
    SELECT i.schedule_id, a.start_date, a.ordinal
      FROM invoices i
      LEFT JOIN ad_schedules a ON a.id = i.schedule_id
     WHERE i.payment_id = (SELECT p.payment_id FROM payable p)
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
    (SELECT p.payment_id  FROM payable p),
    (SELECT count(*) > 1 FROM grp),
    -- Jadwal tunggal SELALU lead-nya sendiri. `false` di sini akan melempar
    -- pembayar solo ke halaman invoice tanpa alasan.
    coalesce((SELECT g.schedule_id FROM lead g) = p_schedule_id, true),
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM sched)                        THEN 'not_found'
      WHEN EXISTS (SELECT 1 FROM payable)                          THEN 'live'
      -- Lunas menang atas semua sisanya: uang yang sudah masuk tidak pernah
      -- basi, tidak pernah kedaluwarsa (sql/83), dan tidak perlu link.
      WHEN EXISTS (SELECT 1 FROM live WHERE payment_status_rank(status) = 3)
                                                                   THEN 'paid'
      WHEN EXISTS (SELECT 1 FROM live WHERE payment_status_rank(status) = 1)
                                                                   THEN 'no_url'
      WHEN (SELECT s.status FROM sched s) = 'cancelled'            THEN 'cancelled'
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_stale OR is_superseded) THEN 'stale'
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_expired)              THEN 'expired'
      WHEN NOT EXISTS (SELECT 1 FROM ev)                           THEN 'none'
      -- Sisanya: ada tagihan, semuanya sudah mati karena STATUS
      -- (cancelled/expired/failed) tanpa jadwalnya ikut batal.
      ELSE 'expired'
    END;
$function$;

REVOKE ALL ON FUNCTION public.authoritative_payment_url(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authoritative_payment_url(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.authoritative_payment_url(uuid) IS
  'Tagihan mana yang berwenang menagih jadwal ini SEKARANG. Dipakai resolver '
  '/bayar/<ad_schedules.id>, yang terbuka tanpa login — jadi nilai baliknya '
  'sengaja tidak memuat nominal, judul, nama, atau email. Predikat "hidup"-nya '
  'menyalin `live` di schedule_billing_summary() (sql/83); jangan pernah '
  'menulis ulang predikat itu di JavaScript.';


-- ============================================================================
-- Verifikasi
-- ============================================================================
--
-- (1) Constraint menerima nilai baru — jalankan SEBELUM deploy webhook.js:
--       insert into public.doku_webhook_events (outcome, http_status, error_message)
--       values ('paid_on_stale_bill', 200, 'uji constraint sql/85') returning id;
--       delete from public.doku_webhook_events where error_message = 'uji constraint sql/85';
--
-- (2) Dan MASIH menolak yang ngawur:
--       insert into public.doku_webhook_events (outcome, http_status) values ('ngawur', 200);
--       -- harapan: ERROR doku_webhook_events_outcome_check
--
-- (3) Resolver sepakat dengan ringkasan — nol baris berarti dua definisi
--     "hidup" itu masih satu. Ini uji yang paling penting di berkas ini:
--       select a.id, r.reason, s.open_count
--         from ad_schedules a
--         cross join lateral authoritative_payment_url(a.id) r
--         cross join lateral schedule_billing_summary(a.id) s
--        where (r.reason = 'live') <> (s.open_count > 0);
--     (Selisih yang SAH cuma satu: tagihan hidup tanpa `payment_url`, yang
--      dijawab 'no_url'. Kecualikan dengan `and r.reason <> 'no_url'`.)
--
-- (4) Jadwal yang tidak ada tetap menjawab satu baris, bukan nol:
--       select * from authoritative_payment_url('00000000-0000-0000-0000-000000000000');
--       -- harapan: satu baris, reason = 'not_found'
--
-- (5) Grup: setiap anggota menyebut payment_id yang SAMA, dan tepat SATU
--     anggota yang is_lead:
--       select r.payment_id, count(*) as anggota, count(*) filter (where r.is_lead) as lead
--         from ad_schedules a
--         cross join lateral authoritative_payment_url(a.id) r
--        where r.is_group group by r.payment_id;
--       -- harapan: lead = 1 di setiap baris
-- ============================================================================
