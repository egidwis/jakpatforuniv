-- ─────────────────────────────────────────────────────────────────────────────
-- sql/72 — sebelas order yang mencatat harga lain dari yang ditagihkan
--
-- GEJALA. Kartu Reservasi Jadwal `#A85YGANA` memajang "Rp 288.600" tepat di
-- atas blok yang mencetak "Rp 399.600 ditagih · Lunas seluruhnya". Selisihnya
-- persis satu tier tarif: 31 pertanyaan berharga Rp 300.000/hari, bukan
-- Rp 200.000. Angka yang tercatat itu juga yang dilihat PENELITI — Fase ②
-- membaca `deriveScheduleMoney`, fungsi yang sama dengan kartu admin.
--
-- SEBABNYA. `question_count`, `duration`, `prize_per_winner`, dan
-- `winner_count` semuanya masukan harga, dan empat permukaan admin bisa
-- menyuntingnya. Sampai commit f93fc61 hanya SATU (tombol Approve) yang
-- memanggil `recomputeOrderPrice` sesudahnya; tiga sisanya menulis lalu
-- berhenti. Sementara itu `buildOrderInvoiceItems` menghitung tagihan ULANG
-- dari kolom yang baru pada detik admin menerbitkan invoice. Jadi ordernya
-- ditagih dengan tarif yang benar dan mencatat harga yang lama.
-- `#A85YGANA` membuktikannya: `review_history` kosong — ia tidak pernah lewat
-- Approve, satu-satunya jalur yang menghitung ulang.
--
-- ARAHNYA: CATATAN MENGIKUTI TAGIHAN, bukan sebaliknya. Uangnya sudah bergerak
-- lewat `invoices`; yang belum pernah benar cuma kolom yang membekukannya.
--
-- ⚠️ CARA KESEBELAS BARIS INI DIPILIH — dan kenapa 77 lainnya TIDAK ikut.
--
-- 88 jadwal punya tepat satu tagihan hidup yang nominalnya berbeda dari
-- `total_cost`. Menimpa kedelapan-puluh-delapannya akan MERUSAK data: sebagian
-- selisih itu keputusan manusia, bukan harga basi. Admin memang boleh menyunting
-- baris tagihan di `InvoiceForm`, dan lima di antaranya terbukti begitu:
--
--   88CK8M83  tercatat 377.400 = rumus; ditagih 632.700  → admin menagih lain
--   PXTS7G6S  tercatat 527.250 = rumus; ditagih 721.500  → admin menagih lain
--   9EXTRJSC  tercatat 388.500; rumus 499.500; ditagih   999.000  → nego JAK26xx
--   G77GXPS9  tercatat 388.500; rumus 499.500; ditagih 1.498.500  → nego JAK26xx
--   Y55BFFX6  tercatat 388.500; rumus 610.500; ditagih 1.609.500  → nego JAK26xx
--
-- Yang ikut hanyalah baris yang lolos SEMUA syarat berikut (diukur 2026-08-26):
--
--   1. tepat SATU tagihan hidup — cerminan `live` di `schedule_billing_summary`
--      (sql/53). Nol tagihan tidak punya pembanding; lebih dari satu memang
--      tidak harus berjumlah sama dengan harga tercatat (tagihan susulan).
--   2. era PPN penuh — `subtotal` & `ppn_amount` ADA di kedua sisi. Order
--      pra-PPN tidak menyimpan rincian, jadi tidak bisa diverifikasi.
--   3. `invoices.subtotal` SAMA PERSIS dengan tarif resmi atas kolom order itu
--      hari ini, dan `total_cost` TIDAK. Dua penghitungan yang saling bebas
--      (invoice saat terbit, tarif saat audit) sepakat; hanya kolom beku yang
--      menyimpang. Itulah tanda tangan harga basi.
--   4. PPN tagihannya konsisten — `amount = subtotal + round(subtotal × 0,11)`.
--
-- ⚠️ NILAINYA DIBAKUKAN DI SINI, BUKAN DIHITUNG SAAT DIJALANKAN. Berkas ini
-- SENGAJA tidak memuat tangga tarif: menuliskannya berarti salinan KEEMPAT dari
-- rumus yang sudah hidup di `cost-calculator.ts` dan `create-payment.js`, dan
-- salinan yang tidak pernah dipanggil siapa pun adalah salinan yang paling cepat
-- menyimpang. Tarif hanya dipakai SEBAGAI ALAT PILIH pada saat audit; yang
-- ditulis migrasi ini adalah nominal `invoices` yang sudah diverifikasi.
--
-- Idempotent: setiap baris menyaring nilai LAMA yang diharapkannya. Kalau ada
-- yang sudah berubah sejak audit, barisnya tidak cocok dan tidak tersentuh —
-- dan blok verifikasi di akhir akan menyebutnya.
--
-- ⚠️ JALANKAN LEWAT KONEKSI LANGSUNG (SQL editor / migrasi), BUKAN lewat klien
-- ber-JWT peneliti. `guard_payment_columns()` menolak perubahan
-- `total_cost/subtotal/ppn_amount` pada order lunas, dan pengecualiannya justru
-- "tidak ada claims sama sekali" — persis konteks migrasi. Penolakan itu benar
-- dan sengaja dibiarkan berdiri.
--
-- ⚠️ CUKUP MENULIS `form_submissions`. `trg_ad_schedule_from_submission`
-- terdaftar pada `UPDATE OF ... total_cost, subtotal, ppn_amount ...` dan
-- mencerminkan ketiganya ke `ad_schedules` ordinal 1 lewat
-- `sync_ad_schedule_from_submission()`. Menulis kedua tabel akan menabrak
-- cerminnya sendiri.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TEMP TABLE _reconcile (
  submission_id UUID PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  old_total     BIGINT NOT NULL,
  old_subtotal  BIGINT NOT NULL,
  old_ppn       BIGINT NOT NULL,
  new_total     BIGINT NOT NULL,
  new_subtotal  BIGINT NOT NULL,
  new_ppn       BIGINT NOT NULL
) ON COMMIT DROP;

-- booking · lama → baru · status bayar saat audit
INSERT INTO _reconcile VALUES
  -- tercatat LEBIH TINGGI dari yang ditagih (jumlah pertanyaan dikoreksi turun)
  ('6621ffe6-1c53-4dfd-88a5-8d5d860d81de'::uuid, '3NA9ZQM4', 499500, 450000, 49500, 388500, 350000, 38500),
  ('e9cb5944-3a24-4093-8621-b36d2a7fe8d9'::uuid, 'RZ8R6SWR', 666000, 600000, 66000, 610500, 550000, 60500),
  ('9478db29-8ce9-4bd2-af73-95944eb2e071'::uuid, 'YZYEQ3KV', 566100, 510000, 56100, 510600, 460000, 50600),
  -- tercatat LEBIH RENDAH dari yang ditagih (jumlah pertanyaan dikoreksi naik)
  ('eb439563-be4f-4f3d-8338-9054f82b6e1c'::uuid, '4MGKJPGN', 255300, 230000, 25300, 355200, 320000, 35200),
  ('3bb25c22-b99c-4703-b52c-c15163bb70f1'::uuid, '67RP7ZKG', 510600, 460000, 50600, 621600, 560000, 61600),
  ('130844fd-4534-4eb6-9fe9-5f2c2d4b3f89'::uuid, '6VXX3HGH', 360750, 325000, 35750, 471750, 425000, 46750),
  ('7d97d2b5-e1a0-4099-835f-1649b8945e51'::uuid, '92M8R2Y8', 266400, 240000, 26400, 366300, 330000, 36300),
  ('8187c0d7-c73e-4828-88b0-5367fa03e7ef'::uuid, 'A85YGANA', 288600, 260000, 28600, 399600, 360000, 39600),
  ('715e2b87-72bf-4bd8-aace-b99821811054'::uuid, 'ADVYPRK2', 277500, 250000, 27500, 388500, 350000, 38500),
  ('ef47a431-6ded-4e43-b43b-7a9c43cee153'::uuid, 'CB5SB36S', 222000, 200000, 22000, 388500, 350000, 38500),
  ('a9d483fb-8ec1-496b-b7de-aaf0e9f4050e'::uuid, 'QX5QPE8X', 388500, 350000, 38500, 499500, 450000, 49500);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tulisannya. Menyaring nilai LAMA — itulah yang membuatnya idempotent dan
-- yang membuat baris yang sudah bergeser sejak audit dilewati, bukan ditimpa.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE form_submissions f
   SET total_cost = r.new_total,
       subtotal   = r.new_subtotal,
       ppn_amount = r.new_ppn
  FROM _reconcile r
 WHERE f.id         = r.submission_id
   AND f.total_cost = r.old_total
   AND f.subtotal   = r.old_subtotal
   AND f.ppn_amount = r.old_ppn;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verifikasi 1 — form_submissions sudah memegang nilai baru.
-- Harapan: 11 baris `OK`, nol `MELESET`.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT r.booking_id,
       f.total_cost,
       CASE WHEN f.total_cost = r.new_total
             AND f.subtotal   = r.new_subtotal
             AND f.ppn_amount = r.new_ppn
            THEN 'OK' ELSE 'MELESET' END AS hasil
  FROM _reconcile r JOIN form_submissions f ON f.id = r.submission_id
 ORDER BY hasil, r.booking_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verifikasi 2 — cerminnya ikut bergerak TANPA ditulis langsung.
-- Kalau kolom ini masih memegang angka lama, `trg_ad_schedule_from_submission`
-- tidak menyala dan seluruh premis migrasi ini keliru. Harapan: 11 × `OK`.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT r.booking_id,
       s.total_cost,
       CASE WHEN s.total_cost = r.new_total THEN 'OK' ELSE 'CERMIN TIDAK IKUT' END AS hasil
  FROM _reconcile r
  JOIN ad_schedules s ON s.submission_id = r.submission_id AND s.ordinal = 1
 ORDER BY hasil, r.booking_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verifikasi 3 — sesudah ini, tinggal berapa jadwal yang tercatatnya masih
-- berbeda dari tagihan tunggalnya? Harapan: 77 (88 − 11), dan tidak satu pun
-- dari kesebelas booking di atas.
-- ─────────────────────────────────────────────────────────────────────────────
WITH ev AS (
  SELECT s.id AS schedule_id, b.* FROM ad_schedules s, LATERAL schedule_billing(s.id) b
), live AS (
  SELECT * FROM ev
   WHERE payment_status_rank(status) = 3
      OR (payment_status_rank(status) = 1 AND source = 'invoice'
          AND NOT is_superseded AND NOT is_stale)
), one AS (
  SELECT schedule_id, (array_agg(amount))[1] AS amount
    FROM live GROUP BY schedule_id HAVING count(*) = 1
)
SELECT count(*) AS sisa_selisih,
       count(*) FILTER (WHERE s.booking_id IN (SELECT booking_id FROM _reconcile)) AS sisa_dari_migrasi_ini
  FROM one o JOIN ad_schedules s ON s.id = o.schedule_id
 WHERE s.total_cost <> o.amount;

COMMIT;
