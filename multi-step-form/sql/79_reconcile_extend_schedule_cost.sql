-- ─────────────────────────────────────────────────────────────────────────────
-- sql/79 — jadwal perpanjangan yang lupa mencatat harganya sendiri
--
-- GEJALA. `2DADYPA5` ("Hubungan sosial dan kebahagiaan - Studi 2", jadwal ke-2)
-- berstatus `live` dan `payment_status = 'paid'` — uangnya benar-benar masuk,
-- Rp 999.000 lewat QRIS, `paid_at` 2026-09-01 06:51 — sementara
-- `ad_schedules.total_cost` untuk jadwal itu masih **0**, `subtotal` dan
-- `ppn_amount` masih NULL.
--
-- SEBABNYA — sql/78, dan ini yang membuatnya sunyi. `ad_schedules` punya RLS
-- aktif tanpa satu pun policy UPDATE, jadi tulisan `total_cost`/`subtotal`/
-- `ppn_amount` dari `InvoiceForm` (browser, JWT admin) menyentuh NOL BARIS dan
-- pulang tanpa error. Webhook DOKU tidak terpengaruh sama sekali — ia memakai
-- `service_role` yang melewati RLS — jadi status pembayarannya berpindah dengan
-- benar sementara nominalnya tidak pernah tercatat. Itulah kenapa barisnya
-- tampak "lunas Rp 0": dua penulis, satu lolos satu tidak.
--
-- Jendelanya: sejak `sql/76` mencabut view `form_submissions_extend`
-- (2026-08-30) sampai `sql/78` dipasang (2026-09-02).
--
-- ARAHNYA: CATATAN MENGIKUTI TAGIHAN. Uangnya sudah bergerak lewat `invoices`;
-- yang belum pernah benar cuma kolom yang membekukannya. Sama dengan sql/72.
--
-- ⚠️ KENAPA HANYA SATU BARIS — dan kenapa empat lainnya TIDAK ikut.
--
-- Lima jadwal extend ber-`total_cost = 0` per 2026-09-02. Menimpa kelimanya
-- akan MENGARANG angka:
--
--   2DADYPA5  tagihan LUNAS Rp 999.000 (JFU-INV-6a18c9-1788174449320)  → IKUT
--   EAKD7WPQ  satu-satunya tagihannya DIBATALKAN (Rp 444.000), jadwalnya
--             juga sudah dibatalkan → 0 memang benar, tidak pernah tertagih
--   JYTST4EE  nol baris invoices & transactions → belum pernah ditagih
--   YAWWSSKX  nol baris invoices & transactions → belum pernah ditagih
--   52HCR8SG  nol baris invoices & transactions → belum pernah ditagih
--
-- Syarat ikut, dan ketiganya harus terpenuhi:
--   1. Punya tagihan HIDUP (`paid`/`completed`, atau `pending` terbaru) —
--      tagihan `cancelled`/`expired` bukan bukti apa pun pernah ditagihkan.
--   2. Rinciannya lengkap: `amount`, `subtotal`, DAN `ppn_amount` ada, dengan
--      `amount = subtotal + ppn_amount`. Baris pra-PPN tidak bisa diverifikasi.
--   3. Cermin jadwalnya memang berbeda dari tagihan itu.
--
-- ⚠️ Nilainya DIBAKUKAN di bawah, bukan dihitung saat dijalankan — pola yang
-- sama dengan sql/72. Yang ditulis adalah nominal `invoices` yang sudah
-- diverifikasi mata, bukan hasil rumus yang bisa bergeser antara audit dan
-- eksekusi.
--
-- Idempotent: barisnya menyaring nilai LAMA yang diharapkannya (`total_cost = 0`).
-- Dijalankan dua kali, yang kedua menyentuh nol baris.
--
-- ⚠️ JALANKAN LEWAT KONEKSI LANGSUNG (SQL editor / migrasi). Lewat klien
-- ber-JWT admin pun sekarang bisa (sql/78), tapi trigger
-- `guard_extend_payment_columns` hanya melepas `service_role` dan
-- `product@jakpat.net` — koneksi langsung melewatinya karena
-- `request.jwt.claims` kosong.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── LANGKAH 1 (opsional, jalankan sendiri): audit ulang sebelum menulis ──────
--
-- Kueri ini yang dipakai memilih baris di bawah. Jalankan lebih dulu kalau
-- ingin memastikan daftarnya belum berubah sejak audit — ia juga alat yang
-- benar untuk mencari penyimpangan BARU di kemudian hari.
--
--   with live as (
--     select i.extend_id, i.status, i.amount, i.subtotal, i.ppn_amount,
--            row_number() over (
--              partition by i.extend_id
--              order by (i.status in ('paid','completed')) desc, i.created_at desc
--            ) as rk
--     from invoices i
--     where i.entity_type = 'extend'
--       and i.extend_id is not null
--       and i.status in ('paid','completed','pending')
--       and i.subtotal is not null
--       and i.ppn_amount is not null
--       and i.amount = i.subtotal + i.ppn_amount
--   )
--   select s.booking_id, s.status, s.payment_status,
--          s.total_cost, s.subtotal as s_sub, s.ppn_amount as s_ppn,
--          l.status as inv_status, l.amount, l.subtotal, l.ppn_amount
--   from ad_schedules s
--   join live l on l.extend_id = s.source_id and l.rk = 1
--   where s.source_table = 'form_submissions_extend'
--     and (s.total_cost  is distinct from l.amount
--       or s.subtotal    is distinct from l.subtotal
--       or s.ppn_amount  is distinct from l.ppn_amount)
--   order by s.created_at desc;
--
--   -- 2026-09-02: tepat SATU baris (2DADYPA5). Kalau sekarang lebih banyak,
--   -- BERHENTI dan audit dulu — sql/78 seharusnya menghentikan sumbernya.

BEGIN;

-- ── 2DADYPA5 · jadwal ke-2 "Hubungan sosial dan kebahagiaan - Studi 2" ───────
-- Tagihan JFU-INV-6a18c9-1788174449320, status `paid`, paid_at 2026-09-01 06:51
--   amount 999.000 = subtotal 900.000 + PPN 99.000  ✔ konsisten
UPDATE ad_schedules
   SET total_cost = 999000,
       subtotal   = 900000,
       ppn_amount = 99000,
       updated_at = NOW()
 WHERE source_table = 'form_submissions_extend'
   AND source_id    = '932ea479-1069-4f81-a2d9-6850c3629ab3'
   AND total_cost   = 0;          -- penjaga idempoten

COMMIT;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
--
-- 1. Barisnya sekarang setuju dengan tagihannya:
--
--    select s.booking_id, s.total_cost, s.subtotal, s.ppn_amount,
--           i.amount, i.subtotal, i.ppn_amount, i.status
--      from ad_schedules s
--      join invoices i on i.entity_type='extend' and i.extend_id = s.source_id
--     where s.booking_id = '2DADYPA5';
--    -- 999000 / 900000 / 99000 di kedua sisi
--
-- 2. Kueri audit di LANGKAH 1 sekarang pulang NOL baris.
--
-- 3. Di layar: buka order itu → Reservasi Jadwal → kartu jadwal ke-2 harus
--    memajang Rp 999.000, bukan Rp 0, dan blok "ditagih · Lunas seluruhnya"
--    harus cocok dengan angka itu.
--
-- 4. Ringkasan pendapatan tidak ikut bergeser: analitik uang membaca
--    `invoices`/`transactions`, bukan `ad_schedules.total_cost`. Migrasi ini
--    memperbaiki apa yang DILIHAT admin & peneliti, bukan apa yang dilaporkan
--    sebagai pendapatan — angka itu memang sudah benar sejak awal.
