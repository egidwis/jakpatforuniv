-- ============================================================================
-- 50 — `reward_pools`: satu baris = satu kolam hadiah untuk satu BATCH
-- ============================================================================
-- Nomor `50` dipesan sejak 2026-08-10 (lihat kepala sql/49 dan Aturan 2 di
-- sql/README.md) dan sengaja tidak pernah dipakai ulang. Ini pengisinya.
--
-- ⚠️ RILIS SENDIRI. Berkas ini adalah Rilis A dari Phase 4 dan mendarat
-- SENDIRIAN, sebelum satu baris kode aplikasi pun berubah. Ia tidak mengubah
-- perilaku apa pun hari ini: tabel baru + backfill, nol fungsi yang disentuh.
-- `get_schedule_batch_context()` dan `get_batch_rewards*()` BELUM dialihkan ke
-- tabel ini — pengalihan itu pekerjaan terpisah yang butuh keduanya berubah
-- BERSAMAAN (lihat "Kenapa pengalihannya tidak di sini" di bawah).
--
-- ── Kenapa tabel ini ada ───────────────────────────────────────────────────
-- Hari ini "berapa hadiah batch ini" tidak disimpan di mana pun. Ia DIHITUNG
-- ULANG, dengan agregasi yang sama persis, di dua fungsi berbeda:
--
--   get_batch_rewards / get_batch_rewards_bulk  (sql/37, sql/44)
--   get_schedule_batch_context                  (sql/37)
--
-- keduanya memakai `MAX(NULLIF(prize,0)) + SUM(additional)`. sql/37 menuliskan
-- sendiri kenapa keduanya wajib sepakat: *"otherwise the admin funding a
-- schedule sees one prize while respondents are shown another for the same
-- batch."* Dua salinan aritmetika yang harus sepakat selamanya adalah utang
-- yang menunggu ditagih — dan Phase 4 menambah penulis KETIGA (peneliti,
-- swalayan) ke kolam yang sama.
--
-- ── Bentuk kolomnya: prize_per_winner, BUKAN total pool ────────────────────
-- Keputusan pemilik produk 2026-09-11. Yang disimpan adalah hadiah PER
-- PEMENANG plus jumlah pemenang; total kolam adalah TURUNAN
-- (`(prize + topups) * winner_count`), tidak pernah disimpan.
--
-- ⚠️ Ini menutup jebakan yang hampir terjadi saat menulis berkas ini. Rencana
-- Phase 4 mencatat backfill "e9cb5944 (Rp 50.000)" dan "8c9c00a6 (Rp 70.000)".
-- Produksi berkata lain: keduanya `prize_per_winner` 25.000 dan 35.000 dengan
-- `winner_count` 2 — angka rencana itu TOTAL KOLAM (25.000 × 2, 35.000 × 2).
-- Menuliskannya ke kolom `prize_per_winner` akan MELIPATGANDAKAN hadiah per
-- responden. Kolom di sini karenanya menyalin nama dan satuan yang sudah
-- dipakai `form_submissions` dan `ad_schedules`, supaya salah-baca satuan
-- tidak punya tempat untuk hidup.
--
-- ── Yang TIDAK di-backfill, dan kenapa ─────────────────────────────────────
-- `period_batch` NOT NULL, jadi order tanpa `end_date` tidak punya batch dan
-- tidak masuk. Diukur 2026-09-11: **97 order** berhadiah tanpa batch, dua di
-- antaranya LUNAS — `e9cb5944` dan `8c9c00a6`, order yang justru disebut
-- rencana sebagai sasaran backfill.
--
-- Keputusan pemilik produk 2026-09-11: **lewati**, jangan menebak tanggalnya.
-- Batch adalah bulan kalender `TO_CHAR(end_date,'YYYY-MM')`; mengarang
-- `end_date` untuk order lunas berarti mengarang bulan undiannya, dan itu
-- keputusan layanan, bukan keputusan migrasi. Keduanya sudah tercatat sebagai
-- isu layanan terpisah di rencana Phase 4. Begitu tanggalnya diisi manusia,
-- baris poolnya lahir lewat jalan normal — berkas ini idempoten dan boleh
-- dijalankan ulang, tapi TIDAK perlu dijalankan ulang untuk itu.
--
-- ⚠️ Karena itu `reward_pools` BUKAN cermin lengkap semua hadiah yang pernah
-- dijanjikan. Ia cermin lengkap semua hadiah yang punya BATCH. Pembaca yang
-- butuh "semua hadiah" tetap harus menengok order tak bertanggal.
--
-- ── Backfill: 900 baris, bukan 896 ─────────────────────────────────────────
-- Diukur ke produksi 2026-09-11. Baris induk yang memenuhi syarat: **896**.
-- Tapi 896 itu MELEWATKAN empat kolam nyata, karena jadwal ke-2 sebuah survei
-- bisa mendarat di batch yang induknya tidak tempati:
--
--   6a18c955  pool 2026-09  (induk 2026-05)  100.000 × 5  completed, paid
--   bd90a9e7  pool 2026-09  (induk 2026-08)   25.000 × 2  completed, paid
--   de7574e3  pool 2026-09  (induk 2026-07)   50.000 × 2  LIVE,      paid
--   b672d1ae  pool 2026-08  (induk 2026-09)   25.000 × 2  waiting_payment
--
-- Tiga sudah dibayar dan satu sedang tayang: kolam yang sudah dijanjikan ke
-- responden. Melewatkannya berarti tabel ini lahir langsung tidak sepakat
-- dengan `get_batch_rewards`, cacat yang persis ingin dihapus.
--
-- Jadi backfill membaca DUA kaki, seperti kedua fungsi yang ada:
--   kaki 1 — baris induk (`form_submissions`), batch dari `end_date`
--   kaki 2 — jadwal ke-2 dst. (`ad_schedules`), batch dari `period_batch`
-- Total kunci gabungan: **900** (896 + 4 yang hanya ada di kaki 2; 2 kunci
-- lain dari kaki 2 memang berbagi batch dengan induknya).
--
-- Saat sebuah kunci dimiliki KEDUA kaki, hadiah dasarnya diambil dari yang
-- bukan nol (`MAX(NULLIF(...))`) dan top-up DIJUMLAHKAN — aritmetika yang sama
-- persis dengan `get_batch_rewards`, supaya tabel ini lahir sudah sepakat
-- dengan fungsi yang sudah hidup.
--
-- ⚠️ NOL top-up di seluruh produksi hari ini (`additional_prize_per_winner`
-- semuanya 0, diukur 2026-09-11). Kolomnya tetap ada karena sql/37 dan sql/44
-- sudah menjumlahkannya dan Phase 4 akan memakainya; ia kolom masa depan yang
-- backfill-nya kebetulan nol, bukan kolom mati.
--
-- ── Kenapa pengalihan fungsi TIDAK ada di berkas ini ───────────────────────
-- `get_batch_rewards`, `get_batch_rewards_bulk`, dan `get_schedule_batch_context`
-- WAJIB berubah bersamaan — sql/37 memperingatkan bahwa dua permukaan yang tidak
-- sepakat akan menunjukkan hadiah berbeda untuk satu batch. Melipat pengalihan
-- itu ke sini akan membuat Rilis A berhenti jadi "tabel baru + backfill" dan
-- mulai mengubah angka yang dilihat responden lewat platform undian
-- (`functions/api/respondents.js`, `functions/api/surveys.js`).
-- Rilis A sengaja tidak menyentuhnya. Tabel ini ditanam dulu, dibuktikan
-- sepakat dengan fungsi lama lewat blok verifikasi di bawah, baru dialihkan.
--
-- ── Catatan RLS/ACL ────────────────────────────────────────────────────────
-- ⚠️ `pg_default_acl` di database ini memberi `anon=arwdDxt` pada SETIAP tabel
-- baru di schema `public` (diverifikasi 2026-09-11: dua entri, pemberi
-- `postgres` dan `supabase_admin`, `defaclobjtype='r'`). `REVOKE ALL FROM
-- PUBLIC` TIDAK mencabut hibah langsung ke sebuah role. Jadi pencabutan
-- `anon` di bawah ditulis EKSPLISIT — pola yang pertama kali dipakai sql/87.
--
-- Idempoten: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING. Backfill
-- tidak pernah menimpa baris yang sudah ada, jadi menjalankan ulang tidak bisa
-- mengembalikan nilai yang sudah disunting manusia.
--
-- Jalankan di Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ============================================
-- 1. Tabel
-- ============================================
CREATE TABLE IF NOT EXISTS public.reward_pools (
  submission_id                UUID        NOT NULL
                               REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  -- Bulan kalender, `TO_CHAR(end_date,'YYYY-MM')` — ekspresi yang sama dengan
  -- compute_extend_period_batch() (sql/19) dan kedua fungsi hadiah (sql/37).
  period_batch                 TEXT        NOT NULL,

  -- Hadiah PER PEMENANG. Total kolam adalah turunan, tidak disimpan.
  prize_per_winner             INTEGER     NOT NULL DEFAULT 0,
  winner_count                 INTEGER     NOT NULL DEFAULT 0,
  -- Akumulasi top-up: dijumlahkan, bukan ditimpa (lihat SUM di sql/37).
  additional_prize_per_winner  INTEGER     NOT NULL DEFAULT 0,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (submission_id, period_batch),

  CONSTRAINT reward_pools_period_batch_format
    CHECK (period_batch ~ '^\d{4}-\d{2}$'),
  CONSTRAINT reward_pools_nonnegative
    CHECK (prize_per_winner >= 0 AND winner_count >= 0
           AND additional_prize_per_winner >= 0)
);

COMMENT ON TABLE public.reward_pools IS
  'Satu baris = satu kolam hadiah untuk satu batch (bulan kalender) sebuah survei. '
  'Menyimpan hadiah PER PEMENANG; total kolam adalah turunan '
  '(prize_per_winner + additional_prize_per_winner) * winner_count. '
  'Hanya memuat batch yang punya tanggal — order tanpa end_date tidak punya batch '
  'dan sengaja tidak masuk (97 order per 2026-09-11). Ditambahkan sql/50.';

COMMENT ON COLUMN public.reward_pools.prize_per_winner IS
  'Hadiah dasar per pemenang. BUKAN total kolam — satuan yang sama dengan '
  'form_submissions.prize_per_winner dan ad_schedules.prize_per_winner.';
COMMENT ON COLUMN public.reward_pools.additional_prize_per_winner IS
  'Akumulasi top-up per pemenang. DIJUMLAHKAN antar jadwal dalam batch yang sama, '
  'mengikuti SUM() di get_batch_rewards (sql/37). Nol di seluruh produksi per 2026-09-11.';

CREATE INDEX IF NOT EXISTS idx_reward_pools_batch
  ON public.reward_pools (period_batch);

-- ============================================
-- 2. Backfill — dua kaki, sama seperti get_batch_rewards
-- ============================================
-- ⚠️ ON CONFLICT DO NOTHING: baris yang sudah ada TIDAK ditimpa. Kalau berkas
-- ini dijalankan ulang setelah ada penyuntingan manusia, penyuntingan itu
-- menang. Yang hilang cuma kesempatan mengisi ulang, dan itu memang yang
-- diinginkan.
INSERT INTO public.reward_pools AS rp (
  submission_id, period_batch,
  prize_per_winner, winner_count, additional_prize_per_winner
)
WITH occupants AS (
  -- Kaki 1 — jadwal PERTAMA (baris induk).
  -- rejected/spam tidak pernah tayang dan tidak menjanjikan apa pun — filter
  -- yang sama persis dengan sql/37, dan SENGAJA bukan filter pembayaran:
  -- sebagian order dibayar di luar sistem dan `payment_status` tetap 'pending'
  -- selamanya (dikonfirmasi pemilik produk 2026-08-03, lihat kepala sql/37).
  SELECT
    fs.id                                AS submission_id,
    TO_CHAR(fs.end_date, 'YYYY-MM')      AS period_batch,
    COALESCE(fs.prize_per_winner, 0)     AS prize,
    COALESCE(fs.winner_count, 0)         AS wc,
    0                                    AS additional
  FROM public.form_submissions fs
  WHERE fs.end_date IS NOT NULL
    AND COALESCE(fs.prize_per_winner, 0) > 0
    AND fs.submission_status NOT IN ('rejected', 'spam')

  UNION ALL

  -- Kaki 2 — jadwal KE-2 dst. Batch diambil dari `period_batch` jadwalnya
  -- sendiri, bukan dari induknya: empat kolam produksi mendarat di batch yang
  -- induknya tidak tempati (lihat daftar di kepala berkas).
  SELECT
    a.submission_id,
    a.period_batch,
    COALESCE(a.prize_per_winner, 0),
    COALESCE(a.winner_count, 0),
    COALESCE(a.additional_prize_per_winner, 0)
  FROM public.ad_schedules a
  WHERE a.ordinal >= 2
    AND a.period_batch IS NOT NULL
    AND a.status <> 'cancelled'
    AND (COALESCE(a.prize_per_winner, 0) > 0
         OR COALESCE(a.additional_prize_per_winner, 0) > 0)
)
SELECT
  o.submission_id,
  o.period_batch,
  -- NULLIF supaya baris berhadiah 0 tidak menutupi baris yang benar-benar
  -- mendanai kolam — aritmetika identik dengan get_batch_rewards (sql/37).
  COALESCE(MAX(NULLIF(o.prize, 0)), 0)::INTEGER,
  COALESCE(MAX(NULLIF(o.wc, 0)), 0)::INTEGER,
  COALESCE(SUM(o.additional), 0)::INTEGER
FROM occupants o
GROUP BY o.submission_id, o.period_batch
ON CONFLICT (submission_id, period_batch) DO NOTHING;

-- ============================================
-- 3. RLS — baca untuk pemilik order, tulis hanya lewat service_role
-- ============================================
ALTER TABLE public.reward_pools ENABLE ROW LEVEL SECURITY;

-- Peneliti melihat kolam ordernya sendiri. Pola kepemilikan yang sama dengan
-- "Users can view own extends" (sql/19).
DROP POLICY IF EXISTS "Users can view own reward pools" ON public.reward_pools;
CREATE POLICY "Users can view own reward pools"
  ON public.reward_pools
  FOR SELECT
  TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.form_submissions WHERE auth_user_id = auth.uid()
    )
  );

-- Admin melihat semuanya. Gerbang email yang sama dengan sql/78.
DROP POLICY IF EXISTS "Admin view reward pools" ON public.reward_pools;
CREATE POLICY "Admin view reward pools"
  ON public.reward_pools
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- ⚠️ SENGAJA NOL POLICY INSERT/UPDATE/DELETE untuk `authenticated`.
-- Tanpa policy, RLS menolak — jadi tulisan hanya mungkin lewat `service_role`
-- (yang melewati RLS) atau fungsi SECURITY DEFINER. Ini pelajaran sql/75:
-- membuka policy INSERT untuk `authenticated` adalah lubang yang ditutup di
-- sana, dan Phase 4 tidak butuh peneliti menulis tabel ini langsung.

-- ============================================
-- 4. Hak akses — cabut `anon` EKSPLISIT
-- ============================================
-- Lihat catatan pg_default_acl di kepala berkas: tanpa dua baris REVOKE ini,
-- tabel lahir dengan `anon=arwdDxt` meski berkasnya tidak pernah memberikannya.
REVOKE ALL ON TABLE public.reward_pools FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_pools FROM anon;
GRANT SELECT ON TABLE public.reward_pools TO authenticated;
GRANT ALL    ON TABLE public.reward_pools TO service_role;

COMMIT;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- Jalankan SESUDAH COMMIT. Angka yang diharapkan diukur ke produksi
-- 2026-09-11; kalau ada yang berbeda, JANGAN lanjut ke Rilis B sebelum
-- selisihnya dijelaskan.
--
-- 1) Jumlah baris — harus 900 (896 dari induk + 4 yang hanya ada di jadwal ke-2)
--
-- SELECT COUNT(*) AS pools FROM reward_pools;
--
-- 2) Keempat kolam "hanya jadwal ke-2" benar-benar masuk
--
-- SELECT LEFT(submission_id::text,8) AS sid8, period_batch,
--        prize_per_winner, winner_count
-- FROM reward_pools
-- WHERE LEFT(submission_id::text,8) IN ('6a18c955','bd90a9e7','de7574e3','b672d1ae')
-- ORDER BY sid8, period_batch;
--
-- ⚠️ Diharapkan **8 baris, bukan 4**. Saringan di atas mencocokkan ORDER, dan
-- keempat order ini masing-masing juga punya baris batch INDUK-nya sendiri —
-- itulah justru sebabnya mereka menarik: dua batch berbeda untuk satu survei.
-- Yang dibuktikan verifikasi ini adalah kehadiran baris batch KEDUA:
--   6a18c955 | 2026-09 | 100000 | 5   (induknya 2026-05)
--   b672d1ae | 2026-08 |  25000 | 2   (induknya 2026-09)
--   bd90a9e7 | 2026-09 |  25000 | 2   (induknya 2026-08)
--   de7574e3 | 2026-09 |  50000 | 2   (induknya 2026-07)
-- Diukur sesudah terap 2026-09-11: kedelapan baris ada, nilainya persis ini.
--
-- 3) 🔴 GERBANG UTAMA — tabel baru WAJIB sepakat dengan fungsi yang sudah hidup.
--    Nol baris = sepakat. Baris apa pun di sini berarti responden dan admin
--    bisa melihat hadiah berbeda untuk satu batch; itu pemblokir Rilis B.
--
-- SELECT rp.submission_id, rp.period_batch,
--        rp.prize_per_winner + rp.additional_prize_per_winner AS pool_says,
--        gbr.prize_per_winner                                  AS function_says,
--        rp.winner_count AS pool_wc, gbr.winner_count AS function_wc
-- FROM reward_pools rp
-- JOIN LATERAL get_batch_rewards(rp.submission_id) gbr
--   ON gbr.period_batch = rp.period_batch
-- WHERE gbr.prize_per_winner IS DISTINCT FROM
--         (rp.prize_per_winner + rp.additional_prize_per_winner)
--    OR gbr.winner_count IS DISTINCT FROM rp.winner_count;
--
--    ✅ DIUKUR 2026-09-11 (dry-run SELECT sebelum berkas ini diterapkan):
--    **nol baris** — tabel ini sepakat dengan get_batch_rewards untuk SELURUH
--    900 pool. Itu angka yang diharapkan saat verifikasi dijalankan.
--
--    ⚠️ Kalau kelak ADA baris, satu sebab di antaranya sah: get_batch_rewards
--    hanya menghitung jadwal ke-2 yang `payment_status='paid'`, sementara
--    tabel ini memuat juga yang belum lunas (pertanyaannya "sudah
--    dijanjikan?", bukan "sudah dibayar?" — lihat sql/37). `b672d1ae`
--    (2026-08, waiting_payment) adalah satu-satunya baris produksi hari ini
--    yang bisa berbeda karena sebab itu — ia TIDAK muncul di dry-run hanya
--    karena get_batch_rewards tidak memulangkan baris apa pun untuk batch itu,
--    sehingga JOIN-nya menjatuhkannya alih-alih menyelisihinya. Selisih di
--    luar sebab ini adalah ketidaksepakatan sungguhan.
--
-- 4) Order tak bertanggal memang TIDAK masuk (diharapkan 0 baris)
--
-- SELECT COUNT(*) AS dateless_leaked
-- FROM reward_pools rp
-- JOIN form_submissions fs ON fs.id = rp.submission_id
-- WHERE fs.end_date IS NULL;
--
-- 5) `anon` benar-benar tercabut (diharapkan: tidak ada 'anon=' di relacl)
--
-- SELECT relname, relacl::text FROM pg_class WHERE relname = 'reward_pools';
