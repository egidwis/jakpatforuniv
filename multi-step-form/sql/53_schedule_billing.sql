-- 53_schedule_billing.sql
-- Date: 2026-08-19  ·  Task 13 Rilis 1
--
-- Uang per JADWAL jadi angka yang bisa dihitung, bukan ditebak dari satu baris
-- transaksi terbaru. Ini fondasi "satu jadwal boleh punya beberapa tagihan".
--
-- Nol perubahan bentuk tabel selain dua kolom aditif. Reversibel penuh:
-- DROP ketiga fungsi + dua kolom dan keadaannya kembali seperti semula.
--
-- ============================================================================
-- KENAPA GABUNGAN DUA TABEL, BUKAN `invoices` SAJA
-- ============================================================================
--
-- Rencana Task 13 memutuskan "sumber kebenaran uang = invoice". Diterapkan
-- harfiah sebagai `SELECT FROM invoices` itu MENGHAPUS UANG DARI LAYAR.
-- Terukur di produksi 2026-08-19:
--
--   jadwal punya baris `transactions` .................... 518
--   jadwal punya baris `invoices` ........................ 328
--   jadwal punya transaksi tapi NOL invoice .............. 190
--     -- di antaranya sudah dibayar ...................... 79  (75 uang nyata)
--     -- nilainya ....................................... Rp 44.759.000
--
-- Dua sebabnya, dan keduanya masih hidup:
--
--   (a) SEJARAH. `create-payment.js` baru mulai menulis `invoices` pada
--       2026-07-01 (commit 36ed0eb). Sebelum itu pembayaran self-service hanya
--       lahir di `transactions`. 185 dari 190 jadwal itu berasal dari sana —
--       yang tertua 2025-05-21. `webhook.js` sudah menuliskannya sejak lama:
--       "Legacy rows may exist only in transactions."
--
--   (b) SISIPAN YANG BOLEH GAGAL DIAM-DIAM. Sisa 5 jadwal bertanggal SESUDAH
--       2026-07-01 (terbaru 2026-07-13). `create-payment.js` menyisipkan kedua
--       baris lewat `Promise.all` lalu hanya MENCATAT kalau salah satunya
--       gagal — ia tetap mengembalikan 200. Jadi "setiap transaksi punya
--       invoice" bukan invarian yang ditegakkan di mana pun, dan membangun
--       tampilan uang di atas asumsi itu akan bocor lagi.
--
-- Keputusan pemilik produk 2026-08-19: SATU `payment_id` = SATU PERISTIWA
-- TAGIHAN. Invoice tetap menang untuk nominal di mana ia ada; transaksi hanya
-- boleh MENAIKKAN status. Itu menghormati keputusan asli tanpa kehilangan
-- 190 jadwal.
--
-- ⚠️ PERCOBAAN BAYAR BERULANG TIDAK BERBAGI `payment_id` — rencana Task 13
-- menyatakan sebaliknya, dan itu SALAH. Diukur di jadwal terburuk, `3DNWE9PS`:
--
--   29 baris `transactions`, 29 `payment_id` BERBEDA, 28 di antaranya pending,
--   jumlah nominalnya Rp 9.800.000 — untuk jadwal berharga Rp 350.000.
--
-- Setiap klik "bayar" menerbitkan nomor invoice DOKU baru. Jadi melipat per
-- `payment_id` TIDAK melipat percobaan bayar; ia hanya menyatukan baris
-- invoice dengan baris transaksi pasangannya. Itu tetap perlu — tapi bukan
-- itu yang menahan penggelembungan. Yang menahannya aturan di bawah.
--
-- ============================================================================
-- PENDING DI `transactions` BUKAN TAGIHAN — ia checkout yang ditinggalkan
-- ============================================================================
--
-- Pemilahan seluruh peristiwa tagihan produksi, sesudah membuang yang mati
-- dan yang tersusul:
--
--   invoice     · paid/completed .... 336 peristiwa ... Rp 235.890.840
--   invoice     · pending ...........  56 peristiwa ... Rp  21.922.163
--   transaction · paid/completed ....  87 peristiwa ... Rp  49.336.000
--   transaction · pending ........... 121 peristiwa ... Rp 1.084.087.098   <-- (!)
--
-- Baris terakhir itu 98% dari total, dan nol rupiah di antaranya pernah
-- ditagihkan kepada siapa pun. `create-payment.js` menerbitkan baris
-- `transactions` setiap kali seseorang MEMBUKA halaman bayar; kalau ia pergi,
-- barisnya menggantung selamanya. Itu keranjang yang ditinggalkan, bukan
-- piutang.
--
-- ATURANNYA: sebuah peristiwa masuk hitungan `billed` kalau
--   (a) uangnya benar-benar masuk (rank 3) — apa pun sumbernya, ATAU
--   (b) ia berasal dari `invoices` dan masih menggantung — karena baris
--       `invoices` hanya lahir kalau ADMIN menagih.
-- Pending yang hanya ada di `transactions` tidak pernah jadi piutang.
--
-- ============================================================================
-- ALGORITMANYA SUDAH ADA — INI MEMINDAHKANNYA, BUKAN MENEMUKANNYA
-- ============================================================================
--
-- `InvoiceForm.tsx` (loadExisting) sudah menggabungkan kedua tabel ber-kunci
-- `payment_id` dengan tangga status yang sama persis. Fungsi di bawah adalah
-- aturan itu yang diangkat ke SQL supaya berhenti jadi salinan kedua. Sesudah
-- rilis ini `InvoiceForm` memanggil hasil yang sama.
--
-- ============================================================================
-- "PENDING" TIDAK SAMA DENGAN "PIUTANG" — dan datanya membuktikannya
-- ============================================================================
--
-- Terukur 2026-08-19, sebelum rilis ini:
--
--   invoice `pending` bertaut jadwal ............ 194 di 146 jadwal
--     nilainya .................................. Rp 127.859.562
--   -- yang lebih tua dari 7 hari ............... 188  (Rp 125.915.952)
--   -- yang punya `expires_at` terisi ........... 0 dari 194
--   jadwal SUDAH LUNAS tapi masih menyandang
--     invoice pending ........................... 25  (Rp 14.318.109)
--
-- `outstanding = billed - paid` apa adanya akan menagihkan Rp 127 juta yang
-- sebagian besar tidak ada, dan membuat 25 jadwal lunas tampak berutang.
-- Itu kebohongan uang baru menggantikan yang lama.
--
-- Contoh nyata, jadwal `43MG75Y5`:
--   1.900.000 completed  6 Mei         <- self-service, TANPA baris invoice
--     500.000 pending   13 Mei 05:51   <- tidak pernah dibayar
--     500.000 paid      13 Mei 06:09   <- diterbitkan ulang 18 menit kemudian
--   1.000.000 paid      18 Mei
--
-- Keputusan pemilik produk 2026-08-19: SEBUAH TAGIHAN PENDING BERHENTI JADI
-- PIUTANG KALAU ADA PEMBAYARAN LUNAS YANG LEBIH BARU DI JADWAL YANG SAMA.
-- Itu tanda ia diterbitkan ulang. Aturannya faktual — bukan ambang umur yang
-- dikarang, yang memang tidak punya dasar di data karena `expires_at` kosong
-- di 194 dari 194 baris.
--
-- ⚠️ Yang SENGAJA tidak dilakukan: menganggap pending tua otomatis mati.
-- 121 jadwal memang belum pernah membayar apa pun, dan antrean "perlu
-- ditagih" masih memuat entri Maret–Juni yang sungguh-sungguh ditagih.
-- Menyembunyikannya karena tua akan menghapus piutang sungguhan.
--
-- ============================================================================
-- STATUS `cancelled` UNTUK TAGIHAN — jalan keluar yang eksplisit
-- ============================================================================
--
-- Aturan "tersusul" merapikan sejarah secara otomatis, tapi ia hanya menyala
-- kalau ADA pembayaran lunas sesudahnya. Untuk tagihan yang memang salah
-- terbit dan tidak akan pernah dibayar, admin butuh cara membatalkannya —
-- kalau tidak, satu-satunya jalan keluar adalah membiarkannya menggantung
-- selamanya (194 baris di atas adalah akibat langsung dari ketiadaan itu).
--
-- `cancelled` sudah bernilai 2 di tangga status, jadi ia otomatis keluar dari
-- `billed`. Nol kolom baru, nol constraint: tidak ada CHECK status di
-- `invoices` maupun `transactions` (diverifikasi).
--
-- ⚠️ MEMBATALKAN TAGIHAN TIDAK MEMBATALKAN UANG YANG SUDAH TERLANJUR MASUK.
-- Link DOKU yang sudah terbit tetap bisa dibayar dari sisi bank — kami tidak
-- memanggil API pembatalan DOKU. Kalau pembayarannya sungguh datang, webhook
-- tetap mencatatnya dan tagihannya hidup lagi sebagai lunas. Itu DISENGAJA:
-- uang yang benar-benar diterima harus selalu menang atas status di layar.
--
-- ============================================================================
-- INVOKER, BUKAN DEFINER — menyimpang dari rencana, dan sengaja
-- ============================================================================
--
-- `get_extend_slot_occupancy()` (sql/52) SECURITY DEFINER karena kuota slot
-- HARUS melihat jadwal semua orang. Uang kebalikannya: ia hanya boleh
-- menampilkan milik pemanggil. Dengan INVOKER, RLS `invoices`/`transactions`
-- yang sudah ada mengerjakannya — admin melihat semua, peneliti melihat
-- miliknya, dan tidak ada pemeriksaan izin buatan tangan yang bisa meleset.
-- DEFINER di sini akan membuka seluruh riwayat uang semua orang ke siapa pun
-- yang bisa menebak satu UUID.

BEGIN;

-- ============================================================================
-- 1. Tangga status — satu definisi untuk semua
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_status_rank(p_status TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE lower(coalesce(p_status, ''))
           WHEN 'paid'      THEN 3
           WHEN 'completed' THEN 3
           WHEN 'expired'   THEN 2
           WHEN 'failed'    THEN 2
           WHEN 'cancelled' THEN 2
           WHEN 'pending'   THEN 1
           ELSE 0
         END;
$$;

COMMENT ON FUNCTION public.payment_status_rank(TEXT) IS
  'Tangga keterminalan status pembayaran: 3 lunas, 2 mati (expired/failed/'
  'cancelled), 1 menggantung, 0 tak dikenal. Saat satu payment_id muncul di '
  '`invoices` DAN `transactions`, status tertinggi yang menang. Cerminan '
  '`statusRank` di InvoiceForm.tsx — kalau salah satu berubah, ubah keduanya.';

-- ============================================================================
-- 2. Voucher jadi milik TAGIHAN, bukan order
-- ============================================================================
--
-- Sebelum ini voucher hanya ada di `form_submissions.voucher_code`, satu per
-- ORDER — jadi dua jadwal di order yang sama tidak bisa punya voucher berbeda.
--
-- ⚠️ JANGAN BACKFILL DARI `form_submissions.voucher_code`. Kolom itu isian
-- bebas yang diketik peneliti, bukan kode kupon tervalidasi: dari 131 baris
-- terisi ada '-', 'tidak ada', '111111111111', dan beberapa nomor telepon.
-- Menyalinnya ke tagihan akan membuat sampah itu tampak seperti voucher resmi.
-- Satu-satunya sumber yang sah adalah titipan sementara di `transactions.note`
-- (2 baris) yang `InvoiceForm` tulis sejak 2026-08-09 karena migrasi belum
-- boleh lahir di branch itu.

ALTER TABLE public.invoices     ADD COLUMN IF NOT EXISTS voucher_code TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS voucher_code TEXT;

COMMENT ON COLUMN public.invoices.voucher_code IS
  'Voucher yang dipakai saat MENAGIH, bukan saat memesan. Dua jadwal di order '
  'yang sama boleh berbeda. NULL = tidak ada voucher.';
COMMENT ON COLUMN public.transactions.voucher_code IS
  'Lihat invoices.voucher_code. Menggantikan titipan di kolom `note` (JSON).';

-- `note` TEXT, bukan JSONB — sebagian baris bukan JSON valid, jadi ekstraksi
-- lewat regex, bukan cast. Cast akan menggagalkan seluruh migrasi.
UPDATE public.transactions
   SET voucher_code = substring(note FROM '"voucher_code"\s*:\s*"([^"]+)"')
 WHERE voucher_code IS NULL
   AND note IS NOT NULL
   AND note LIKE '%voucher_code%';

-- ============================================================================
-- 3. `schedule_billing()` — satu baris per PERISTIWA TAGIHAN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_billing(p_schedule_id UUID)
RETURNS TABLE (
  payment_id   TEXT,
  amount       BIGINT,
  status       TEXT,
  payment_url  TEXT,
  created_at   TIMESTAMPTZ,
  source       TEXT,
  voucher_code TEXT,
  attempts     INT,
  is_superseded BOOLEAN,
  -- Hanya `transactions` yang punya kedua kolom ini; `invoices` tidak.
  -- Dipakai kartu untuk mengenali pelunasan manual (MANUAL_VERIFIED), yaitu
  -- gerbang aksi "Tandai belum lunas".
  payment_method  TEXT,
  payment_channel TEXT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH events AS (
    -- prio 1 = invoice. Ia menang untuk nominal, URL, dan voucher.
    SELECT coalesce(i.payment_id, 'inv:' || i.id::text) AS k,
           i.payment_id,
           i.amount::BIGINT                             AS amount,
           i.status,
           i.invoice_url                                AS url,
           -- `invoices.created_at` TIMESTAMP tanpa zona; nilainya UTC
           -- (diverifikasi: selisih sub-detik terhadap pasangan
           -- `transactions`-nya yang TIMESTAMPTZ). Naikkan sebelum diadu,
           -- jangan bandingkan langsung.
           (i.created_at AT TIME ZONE 'UTC')             AS created_at,
           i.voucher_code,
           NULL::TEXT                                   AS payment_method,
           NULL::TEXT                                   AS payment_channel,
           1                                            AS prio,
           'invoice'                                    AS source
      FROM invoices i
     WHERE i.schedule_id = p_schedule_id

    UNION ALL

    -- prio 2 = transaksi. Ia hanya boleh MENAIKKAN status, dan mengisi
    -- nominal/URL saat invoice-nya memang tidak ada (190 jadwal di produksi).
    --
    -- ⚠️ `payment_id` boleh NULL (7 baris). Tanpa kunci pengganti per-baris
    -- mereka semua akan melebur jadi SATU peristiwa tagihan palsu.
    SELECT coalesce(t.payment_id, 'txn:' || t.id::text) AS k,
           t.payment_id,
           t.amount::BIGINT,
           t.status,
           t.payment_url,
           t.created_at,
           t.voucher_code,
           t.payment_method,
           t.payment_channel,
           2,
           'transaction'
      FROM transactions t
     WHERE t.schedule_id = p_schedule_id
  ),
  merged AS (
    SELECT
      max(e.payment_id)                                                          AS payment_id,
      (array_agg(e.amount ORDER BY e.prio, e.created_at DESC))[1]                AS amount,
      -- status paling terminal menang; invoice jadi pemutus saat seri
      (array_agg(e.status ORDER BY payment_status_rank(e.status) DESC,
                                   e.prio, e.created_at DESC))[1]                AS status,
      (array_agg(e.url ORDER BY e.prio, e.created_at DESC)
         FILTER (WHERE e.url IS NOT NULL))[1]                                    AS payment_url,
      min(e.created_at)                                                          AS created_at,
      (array_agg(e.source ORDER BY e.prio))[1]                                   AS source,
      (array_agg(e.voucher_code ORDER BY e.prio)
         FILTER (WHERE e.voucher_code IS NOT NULL AND e.voucher_code <> ''))[1]  AS voucher_code,
      -- Percobaan bayar diturunkan DI SINI, per tagihan — bukan dari jumlah
      -- tagihan, yang sesudah rilis ini punya arti berbeda.
      count(*) FILTER (WHERE e.source = 'transaction')::INT                      AS attempts,
      -- Ambil dari baris LUNAS kalau ada — pelunasan manual yang menandai
      -- MANUAL_VERIFIED selalu baris yang lunas itu.
      (array_agg(e.payment_method ORDER BY payment_status_rank(e.status) DESC, e.created_at DESC)
         FILTER (WHERE e.payment_method IS NOT NULL))[1]                         AS payment_method,
      (array_agg(e.payment_channel ORDER BY payment_status_rank(e.status) DESC, e.created_at DESC)
         FILTER (WHERE e.payment_channel IS NOT NULL))[1]                        AS payment_channel
    FROM events e
    GROUP BY e.k
  )
  SELECT
    m.payment_id, m.amount, m.status, m.payment_url, m.created_at,
    m.source, m.voucher_code, m.attempts,
    -- Tersusul: masih menggantung, tapi ada pembayaran LUNAS yang lebih baru
    -- di jadwal yang sama. Baris seperti ini tetap ditampilkan (sejarah tidak
    -- dihapus) tapi berhenti dihitung sebagai piutang.
    (payment_status_rank(m.status) = 1
     AND EXISTS (SELECT 1 FROM merged n
                  WHERE payment_status_rank(n.status) = 3
                    AND n.created_at > m.created_at))                            AS is_superseded,
    m.payment_method, m.payment_channel
  FROM merged m
  ORDER BY m.created_at DESC;
$$;

COMMENT ON FUNCTION public.schedule_billing(UUID) IS
  'Peristiwa tagihan satu jadwal, terbaru dulu. Satu baris per payment_id, '
  'gabungan invoices + transactions. SECURITY INVOKER: RLS kedua tabel yang '
  'menentukan siapa melihat apa — jangan diubah jadi DEFINER, itu membuka '
  'riwayat uang semua orang.';

-- ============================================================================
-- 4. Ringkasan per jadwal — untuk penjaga & kepala kartu
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_billing_summary(p_schedule_id UUID)
RETURNS TABLE (
  billed        BIGINT,
  paid          BIGINT,
  outstanding   BIGINT,
  invoice_count INT,
  open_count    INT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH live AS (
    -- Hidup = uangnya masuk, ATAU ia tagihan sungguhan yang masih menunggu.
    -- Pending yang hanya ada di `transactions` sengaja TIDAK termasuk: ia
    -- checkout yang ditinggalkan (121 peristiwa, Rp 1,08 miliar di produksi),
    -- bukan sesuatu yang pernah ditagihkan kepada siapa pun.
    SELECT b.* FROM schedule_billing(p_schedule_id) b
     WHERE payment_status_rank(b.status) = 3
        OR (payment_status_rank(b.status) = 1
            AND b.source = 'invoice'
            AND NOT b.is_superseded)
  )
  SELECT
    coalesce((SELECT sum(amount) FROM live), 0)::BIGINT,
    coalesce((SELECT sum(amount) FROM live WHERE payment_status_rank(status) = 3), 0)::BIGINT,
    (coalesce((SELECT sum(amount) FROM live), 0)
   - coalesce((SELECT sum(amount) FROM live WHERE payment_status_rank(status) = 3), 0))::BIGINT,
    -- Cacah SELURUH peristiwa, termasuk yang mati & tersusul — kartu
    -- menampilkan semuanya, dan nomor #1/#2 harus cocok dengan yang terlihat.
    (SELECT count(*) FROM schedule_billing(p_schedule_id))::INT,
    -- Penjaga "Tagih Susulan": hanya tagihan yang benar-benar masih menunggu
    -- dibayar yang memblokir penerbitan tagihan berikutnya.
    (SELECT count(*) FROM live WHERE payment_status_rank(status) = 1)::INT;
$$;

COMMENT ON FUNCTION public.schedule_billing_summary(UUID) IS
  'billed = yang ditagih dan masih hidup; paid = yang masuk; outstanding = '
  'selisihnya. `open_count` menegakkan aturan SATU TAGIHAN TERBUKA PER JADWAL: '
  'peneliti hanya melihat tagihan terakhir, jadi menerbitkan tagihan kedua '
  'selagi ada yang menggantung akan menyembunyikan yang pertama dari orang '
  'yang harus membayarnya.';

-- ============================================================================
-- 5. Versi borongan — satu round-trip untuk seluruh order
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_billing_bulk(p_submission_id UUID)
RETURNS TABLE (
  schedule_id  UUID,
  -- ⚠️ `source_id` IKUT DIKEMBALIKAN dan itu bukan kelebihan data. Dashboard
  -- peneliti (`airingPeriods.ts`) mengunci petanya pada `sourceId`, bukan id
  -- `ad_schedules`. Tanpa kolom ini pemanggil harus mengambil jadwalnya lagi
  -- hanya untuk memetakan ulang — dan pemetaan itu jadi tempat keempat yang
  -- harus tahu aturan "sourceId = id form_submissions untuk ordinal 1".
  source_id    UUID,
  payment_id   TEXT,
  amount       BIGINT,
  status       TEXT,
  payment_url  TEXT,
  created_at   TIMESTAMPTZ,
  source       TEXT,
  voucher_code TEXT,
  attempts     INT,
  is_superseded BOOLEAN,
  -- Hanya `transactions` yang punya kedua kolom ini; `invoices` tidak.
  -- Dipakai kartu untuk mengenali pelunasan manual (MANUAL_VERIFIED), yaitu
  -- gerbang aksi "Tandai belum lunas".
  payment_method  TEXT,
  payment_channel TEXT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT a.id, a.source_id, b.payment_id, b.amount, b.status, b.payment_url,
         b.created_at, b.source, b.voucher_code, b.attempts, b.is_superseded,
         b.payment_method, b.payment_channel
    FROM ad_schedules a
    CROSS JOIN LATERAL schedule_billing(a.id) b
   WHERE a.submission_id = p_submission_id
   ORDER BY a.ordinal, b.created_at DESC;
$$;

COMMENT ON FUNCTION public.schedule_billing_bulk(UUID) IS
  'Semua peristiwa tagihan seluruh jadwal satu order. Dipakai kartu Jadwal & '
  'Bayar supaya tidak N round-trip. Urutan: ordinal jadwal, lalu terbaru dulu.';

-- ============================================================================
-- 6. Hak akses
-- ============================================================================
--
-- ⚠️ TIDAK MEMBERI GRANT ITU TIDAK CUKUP. Supabase memasang
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon` di skema
-- `public`, jadi fungsi baru lahir sudah bisa dipanggil `anon`. Pelajaran
-- sql/52, di mana view baru mewarisi 7 privilege untuk `anon` tanpa satu baris
-- GRANT pun. Cabut eksplisit.

REVOKE ALL ON FUNCTION public.schedule_billing(UUID)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_billing_summary(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_billing_bulk(UUID)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.schedule_billing(UUID)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_billing_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_billing_bulk(UUID)    TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- VERIFIKASI — jalankan sesudah COMMIT, adu dengan angka di kepala berkas
-- ============================================================================
--
-- (1) Tagihan susulan yang SUDAH terjadi di lapangan terbaca sebagai dua
--     tagihan, bukan satu:
--
--   SELECT a.booking_id, a.total_cost, s.*
--     FROM ad_schedules a, LATERAL schedule_billing_summary(a.id) s
--    WHERE a.booking_id IN ('76XKVW5P','43MG75Y5','F6WCSWJB','G77GXPS9');
--
--   76XKVW5P -> billed 1.531.800, paid 1.531.800, outstanding 0, count 2
--   43MG75Y5 -> billed 3.400.000, paid 3.400.000, outstanding 0, count 4,
--               open_count 0 — pending Rp 500.000 dari 13 Mei TERSUSUL, jadi
--               ia tetap tampil di daftar tapi tidak lagi jadi piutang
--   Ketiganya: `total_cost` TIDAK BOLEH bergerak sedikit pun
--
-- (2) Nol uang hilang untuk 190 jadwal yang hanya punya `transactions`:
--
--   SELECT sum(s.paid) FROM ad_schedules a, LATERAL schedule_billing_summary(a.id) s
--    WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.schedule_id = a.id)
--      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.schedule_id = a.id);
--   -> Rp 44.759.000
--
-- (3) Percobaan bayar berulang tidak menggelembungkan uang. `3DNWE9PS` punya
--     29 baris transaksi (28 pending, Rp 9.800.000) untuk jadwal Rp 350.000:
--
--   SELECT s.* FROM ad_schedules a, LATERAL schedule_billing_summary(a.id) s
--    WHERE a.booking_id = '3DNWE9PS';
--   -> billed 350.000 · paid 350.000 · outstanding 0
--
--     `schedule_billing()` tetap mengembalikan 29 baris — sejarah tidak
--     dihapus — tapi 28 di antaranya pending-tanpa-invoice, jadi nol rupiah.
--
-- (4) `XVJYPJAJ` punya DUA baris lunas Rp 1.465.200 di hari yang sama, 3 menit
--     berjarak. Ia harus tampil sebagai DUA baris — kandidat pembayaran ganda
--     sungguhan, dan layar yang menampilkannya biar admin yang menilai.
--     Melipatnya diam-diam justru menyembunyikan masalahnya.
--
-- (5) DUA INVARIAN — keduanya harus 0, dan keduanya sudah 0 saat diterapkan:
--
--   -- setiap rupiah piutang bisa ditelusuri ke tagihan terbuka yang nyata
--   SELECT count(*) FROM ad_schedules a, LATERAL schedule_billing_summary(a.id) s
--    WHERE s.outstanding <> 0 AND s.open_count = 0;                       -> 0
--
--   -- tidak ada jadwal yang menerima lebih dari yang pernah ditagihkan
--   SELECT count(*) FROM ad_schedules a, LATERAL schedule_billing_summary(a.id) s
--    WHERE s.billed < s.paid;                                             -> 0
--
--   Total piutang: Rp 1.106.009.261 -> Rp 21.922.163.
--   74 peristiwa tersusul (Rp 42.531.399) dikecualikan, tetap terlihat.
--
--   ⚠️ Empat jadwal masih menampilkan piutang di samping pembayaran lunas —
--   `V3M9285H`, `5FJ9J4Q6`, `FRZ8MNGG`, `E2VKFH37`. Itu BUKAN cacat aturan
--   ini, melainkan cacat data yang selama ini tak terlihat: `V3M9285H` punya
--   tagihan Rp 370.000 DAN Rp 3.700.000 di hari yang sama (satu nol
--   kelebihan), `5FJ9J4Q6` punya invoice kembar yang satu lunas satu
--   menggantung. Membatalkan tagihan (di bawah) adalah jalan keluarnya —
--   jangan tambal dengan aturan agregat.
--
-- (6) Batalkan tagihan (dari UI admin) -> statusnya 'cancelled', `billed`
--     berkurang senilai itu, `open_count` berkurang 1, dan barisnya TETAP
--     terlihat di daftar dengan gaya dicoret. `paid` tidak bergerak.
