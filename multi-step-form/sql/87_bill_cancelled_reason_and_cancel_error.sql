-- ============================================================================
-- 87 — `reason` berhenti berbohong, dan Cancel Order berhenti ditebak
-- ============================================================================
-- Dua bagian, satu migrasi, karena keduanya menutup satu kelas kebisuan yang
-- sama: sistem TAHU apa yang terjadi, dan tidak mengatakannya kepada siapa pun.
--
--   BAGIAN A — peneliti diberi tahu sebab yang BENAR saat link bayarnya mati
--   BAGIAN B — admin diberi tahu KENAPA Cancel Order ditolak DOKU
--
-- ⚠️ NOMOR 87, BUKAN 86. `86` tetap DIPESAN untuk pelebaran
--    `create_ad_schedule()` di Phase 4 (lihat sql/74 dan sql/README.md).
--    Nomor ini diambil sesudah `git fetch`: tertinggi di `origin/main` per
--    2026-09-10 adalah `85` — yang dipakai DUA berkas sekaligus, tabrakan yang
--    melahirkan aturan "cek remote dulu" itu sendiri.
--
-- ── URUTAN DEPLOY ───────────────────────────────────────────────────────────
-- Terapkan migrasi ini LEBIH DULU, seperti sql/77, sql/80, dan sql/85.
--
-- ⚠️ TAPI TIDAK SEPERTI KETIGANYA, urutan terbalik di sini TIDAK merusak apa
-- pun — dan itu hasil keputusan sadar, bukan kebetulan. Setiap penulisan ke
-- `doku_cancel_last_error` berdiri sebagai request TERPISAH yang gagal lunak:
--   * `recordDokuCancelError()` (supabase.ts) mencatat galatnya, tidak melempar
--   * `create-payment.js` menulisnya di PATCH sendiri, SESUDAH baris tagihan
--     ditutup — versi yang menumpang satu badan PATCH akan membuat PostgREST
--     menolak seluruhnya (400 kolom tak dikenal) dan meninggalkan tagihan
--     tersalip tetap `pending` dengan link DOKU yang mungkin masih hidup
-- Yang hilang kalau kodenya mendarat duluan cuma catatan diagnostiknya.
--
-- BAGIAN A juga aman dua arah: kode lama tidak pernah menerima `bill_cancelled`
-- dan tidak rusak karenanya; kode baru yang menerima `expired` tetap memakai
-- kalimat `expired`.
--
-- Idempoten & aman diulang. BAGIAN A nol perubahan data; BAGIAN B menambah satu
-- kolom nullable.
-- ============================================================================


-- ============================================================================
-- BAGIAN A — `bill_cancelled`: TAGIHAN yang dibatalkan ≠ JADWAL yang dibatalkan
-- ============================================================================
-- ── Kejadiannya ─────────────────────────────────────────────────────────────
-- Peneliti membuka `/bayar/<id>` untuk jadwal yang tagihannya baru dibatalkan
-- admin, dan halaman kami menjawab:
--
--     "Batas waktu pembayaran jadwal ini sudah lewat."
--
-- Itu salah DUA KALI. Salah faktanya — `expires_at` jadwal MM36J2EW masih 17
-- September saat kalimat itu muncul. Dan salah ARAH TINDAKANNYA, yang jauh
-- lebih mahal: "batas waktu lewat" menyuruh orang menjadwalkan ulang, padahal
-- yang benar adalah MENUNGGU tagihan pengganti yang memang sedang disiapkan.
-- Peneliti yang menuruti kalimat itu membuang slot yang masih dipegangnya.
--
-- ── Kenapa ladder lama jatuh ke situ ────────────────────────────────────────
-- Cabang `cancelled` di sql/85 menanyakan `sched.status`, yaitu status JADWAL.
-- Untuk tagihan yang dibatalkan tanpa jadwalnya ikut batal, tidak ada satu pun
-- cabang yang cocok — jadi ia jatuh ke penampung akhir `ELSE 'expired'`.
-- Penampung akhir yang menyamar jadi vonis: ia tidak pernah salah secara
-- teknis, dan karena itu tidak pernah terlihat salah.
--
-- ── Terukur sebelum menulis ini (produksi, 2026-09-10) ─────────────────────
--   sebaran `reason` seluruh 1.080 jadwal:
--     paid 433 · none 389 · cancelled 143 · expired 114 · live 1
--   dari 114 `expired` itu:
--     109 memang kedaluwarsa (tagihan terbaru `expired`, nol tagihan batal)
--       3 tagihan terbaru masih `pending` tapi lewat `expires_at` — juga benar
--       2 tagihan TERBARUNYA `cancelled`  ← inilah yang diperbaiki
--   keduanya: MM36J2EW (tayang 22 Sep, 3 tagihan, semuanya batal) dan
--             ZS4ZNN96 (tayang 14 Sep, 1 tagihan, batal) — dua-duanya jadwal
--             HIDUP (`slot_reserved`) yang penelitinya masih menunggu tagihan.
--
-- ⚠️ PREDIKATNYA "TAGIHAN TERBARU", BUKAN "ADA TAGIHAN YANG PERNAH DIBATALKAN".
-- Hari ini keduanya memberi jawaban IDENTIK (2 baris) — tidak ada satu pun
-- jadwal produksi yang punya tagihan batal lama di bawah tagihan mati yang
-- lebih baru. Yang dipakai tetap yang presisi, karena versi longgar akan
-- meracuni setiap vonis berikutnya seumur hidup jadwal itu: satu pembatalan di
-- bulan Maret membuat tagihan yang kedaluwarsa di bulan Desember tetap
-- dilaporkan "dibatalkan".
--
-- Letaknya SESUDAH `cancelled` (jadwal batal menang — tidak ada tagihan
-- pengganti yang akan datang untuk jadwal yang sudah tidak ada) dan SEBELUM
-- `stale`/`expired`.
--
-- Verifikasi sesudah menerapkan (harus 2 baris, keduanya di atas):
--   select s.booking_id, r.reason
--     from ad_schedules s
--     cross join lateral authoritative_payment_url(s.id) r
--    where r.reason = 'bill_cancelled';
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
  -- Peristiwa tagihan TERBARU, apa pun statusnya. Dipakai HANYA untuk
  -- membedakan "dibatalkan" dari "kedaluwarsa" — lihat catatan di kepala
  -- BAGIAN A soal kenapa ini tidak boleh jadi `EXISTS` yang longgar.
  newest AS (
    SELECT * FROM ev ORDER BY created_at DESC LIMIT 1
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
      -- ⚠️ SESUDAH `cancelled` (jadwal), SEBELUM `stale`/`expired`.
      -- Jadwalnya masih hidup dan tagihan terakhirnya DIBATALKAN → tagihan
      -- pengganti sedang disiapkan. Kalimatnya di `functions/bayar/[id].js`
      -- karena itu "tunggu", BUKAN "jadwalkan ulang".
      WHEN lower((SELECT n.status FROM newest n)) = 'cancelled'    THEN 'bill_cancelled'
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_stale OR is_superseded) THEN 'stale'
      WHEN EXISTS (SELECT 1 FROM ev WHERE is_expired)              THEN 'expired'
      WHEN NOT EXISTS (SELECT 1 FROM ev)                           THEN 'none'
      -- Sisanya: ada tagihan, semuanya sudah mati karena STATUS
      -- (expired/failed) tanpa jadwalnya ikut batal.
      ELSE 'expired'
    END;
$function$;

-- ⚠️ `anon` DICABUT DI SINI, DAN ITU MEMPERBAIKI SESUATU YANG TIDAK DISENGAJA.
--
-- Diperiksa di produksi sebelum menulis ini: fungsi versi sql/85 berdiri dengan
-- ACL `anon=X | authenticated=X | service_role=X` — padahal sql/85 hanya
-- memberi ke `authenticated, service_role`. Sebabnya `pg_default_acl`: schema
-- `public` punya default privilege yang memberi `anon` EXECUTE pada SETIAP
-- fungsi baru, dan `REVOKE ALL ... FROM PUBLIC` tidak menyentuh hibah langsung
-- ke sebuah role. Jadi berkas sql/85 di repo TIDAK mereproduksi produksi.
--
-- Nilai baliknya memuat `payment_url` — sebuah KAPABILITAS PEMBAWA, setara
-- dengan link DOKU itu sendiri. Membiarkannya bisa dipanggil dengan kunci anon
-- (yang ikut terkirim di bundel klien) berarti satu permukaan pemanenan yang
-- tidak lewat fungsi kami sama sekali: tanpa pembatasan laju, tanpa jejak.
--
-- Pencabutannya aman, dan itu diperiksa bukan diasumsikan: satu-satunya
-- pemanggil adalah `functions/bayar/[id].js`, yang memakai
-- `SUPABASE_SERVICE_ROLE_KEY` dan MENOLAK jalan tanpa kunci itu (ia membalas
-- 500, tidak pernah mundur ke anon). Nol pemanggil di `src/`.
REVOKE ALL ON FUNCTION public.authoritative_payment_url(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authoritative_payment_url(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.authoritative_payment_url(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.authoritative_payment_url(uuid) IS
  'Tagihan mana yang berwenang menagih jadwal ini SEKARANG. Dipakai resolver '
  '/bayar/<ad_schedules.id>, yang terbuka tanpa login — jadi nilai baliknya '
  'sengaja tidak memuat nominal, judul, nama, atau email. reason: live | paid | '
  'no_url | cancelled | bill_cancelled | stale | expired | none | not_found. '
  'Predikat "hidup"-nya menyalin `live` di schedule_billing_summary() (sql/83); '
  'jangan pernah menulis ulang predikat itu di JavaScript.';


-- ============================================================================
-- BAGIAN B — `invoices.doku_cancel_last_error`
-- ============================================================================
-- ── Kejadiannya ─────────────────────────────────────────────────────────────
-- Admin menekan "Batalkan Tagihan" dan mendapat toast: *berhasil, tapi link
-- pembayaran mungkin masih aktif.* Artinya `dokuCancelled: false` — DOKU
-- MENOLAK pencabutannya. Jawaban DOKU dibuang di tempat: `cancel-order.js`
-- hanya `console.error`, sementara Cloudflare Observability tidak tersedia
-- untuk Pages Functions (lihat memo `doku-webhook-silent-write-failure`).
--
-- Akibatnya bukan sekadar log yang hilang. `invoices.doku_cancelled_at` masih
-- **NOL BARIS SEUMUR HIDUP**, dan selama sebabnya tidak tersimpan, tidak ada
-- yang bisa membedakan "DOKU menolak karena pesanannya sudah lunas" dari
-- "tanda tangannya salah" dari "request_id-nya tidak dikenal". Tiga sebab,
-- tiga tindakan berbeda, satu kalimat kabur — dan itulah kenapa pembatalan
-- sudah dicoba berkali-kali tanpa satu pun kesimpulan.
--
-- ⚠️ Kolom ini menyimpan JAWABAN DOKU, bukan tafsir kami. Dipangkas 2.000
-- karakter: cukup untuk badan galat DOKU yang terpanjang, dan tetap menahan
-- baris tunggal dari membengkak kalau suatu saat DOKU memulangkan HTML.
--
-- Ia SENGAJA tidak dikosongkan saat pembatalan berikutnya berhasil —
-- `doku_cancelled_at` yang menandai keberhasilan, dan riwayat penolakan justru
-- yang paling berguna saat menelusuri ke belakang.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS doku_cancel_last_error text;

COMMENT ON COLUMN public.invoices.doku_cancel_last_error IS
  'Jawaban MENTAH DOKU saat Cancel Order ditolak (maks 2.000 karakter), atau nama exception-nya. Tidak dikosongkan saat percobaan berikutnya berhasil — keberhasilan ditandai doku_cancelled_at.';


-- ============================================================================
-- Verifikasi
-- ============================================================================
-- (1) Vonis baru mendarat tepat pada dua jadwal yang diukur — tidak lebih:
--     select s.booking_id, s.status, s.start_date, r.reason
--       from ad_schedules s
--       cross join lateral authoritative_payment_url(s.id) r
--      where r.reason = 'bill_cancelled';
--     -- harapan: MM36J2EW, ZS4ZNN96
--
-- (2) Tidak ada vonis lain yang ikut bergeser:
--     select r.reason, count(*) from ad_schedules s
--       cross join lateral authoritative_payment_url(s.id) r
--      group by 1 order by 2 desc;
--     -- harapan: paid 433 · none 389 · cancelled 143 · expired 112 · live 1
--     --          · bill_cancelled 2   (expired turun 114 → 112)
--
-- (3) `live` masih sepakat 100% dengan schedule_billing_summary() — nol baris.
--     Bentuknya SAMA PERSIS dengan verifikasi (3) di sql/85; jangan direka
--     ulang, karena selisih yang sah cuma satu ('no_url') dan itu sudah
--     dikecualikan di sana:
--     select a.id, r.reason, s.open_count
--       from ad_schedules a
--       cross join lateral authoritative_payment_url(a.id) r
--       cross join lateral schedule_billing_summary(a.id) s
--      where (r.reason = 'live') <> (s.open_count > 0)
--        and r.reason <> 'no_url';
--
-- (4) ACL-nya benar — `anon` TIDAK boleh ada di daftar:
--     select array_to_string(proacl::text[], ' | ') from pg_proc
--      where proname = 'authoritative_payment_url';
--     -- harapan: postgres=X | authenticated=X | service_role=X
--
-- (5) Kolomnya ada dan kosong:
--     select count(*) as terisi from invoices where doku_cancel_last_error is not null;
-- ============================================================================
