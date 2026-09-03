-- ============================================================================
-- OPS (sekali jalan, SUDAH DITERAPKAN 2026-09-03) — order af004b84
-- "Geopark Kebumen and Sustainable Tourism"
--
-- Peneliti membayar Rp 444.000 lewat link DOKU milik jadwal yang sudah
-- dibatalkan 20 menit sesudah tagihannya terbit. Webhook STEP 5 mencoba
-- menghidupkan kembali jadwal batal itu (`status='scheduled'`), ditolak
-- penjaga irisan sql/75 (P0001), lalu membalas HTTP 500 tiga kali.
--
-- Berkas ini rekaman, bukan migrasi. Jangan dijalankan ulang.
-- Perbaikan kelasnya ada di sql/80–82 + penjaga webhook `paid_on_dead_bill`.
-- ============================================================================

-- 1. Pindahkan pembayaran lunas ke jadwal yang hidup (ordinal 3 saat itu).
--
--    ⚠️ `schedule_id = null` WAJIB ikut. `trg_derive_schedule_id` memang menyala
--    pada `UPDATE OF extend_id`, tapi baris pertama `derive_schedule_id()`
--    adalah `IF NEW.schedule_id IS NOT NULL THEN RETURN NEW; END IF;` — tanpa
--    mengosongkannya, `extend_id` berubah dan `schedule_id` tidak, dan barisnya
--    menunjuk dua jadwal berbeda. Mengosongkannya juga membuat pemetaannya
--    DITURUNKAN oleh trigger, bukan di-hardcode.
update invoices     set extend_id = '0159f80b-079f-4367-9d90-e8ec5801a973',
                        schedule_id = null
 where payment_id = 'JFU-INV-af004b-1788319498664';
update transactions set extend_id = '0159f80b-079f-4367-9d90-e8ec5801a973',
                        schedule_id = null
 where payment_id = 'JFU-INV-af004b-1788319498664';

-- GERBANG: hasilnya harus schedule_id = 4bae5af9-…, bukan NULL.
-- NULL = trigger gagal → JANGAN teruskan ke langkah 4 (lihat peringatan di sana).

-- 2. Batalkan tagihan kembar (setara tombol "Batalkan tagihan" → cancelInvoice()).
update invoices     set status = 'cancelled'
 where payment_id = 'JFU-INV-af004b-1788321629458' and status = 'pending';
update transactions set status = 'cancelled'
 where payment_id = 'JFU-INV-af004b-1788321629458' and status = 'pending';

-- 3. Lunaskan jadwalnya. Aman: OLD.status='waiting_payment' dan tanggal tidak
--    berubah, jadi cabang irisan di enforce_extend_schedule_rules tidak menyala.
update ad_schedules set payment_status = 'paid', status = 'scheduled'
 where id = '4bae5af9-ef2d-4982-9d2a-b19d7013201c';

-- 4. Hapus jadwal #2 (EAKD7WPQ) — murni salah input admin: iklan dijadwalkan
--    7 hari (4–11 Sep, artefak bug yang diperbaiki 153f68a) dengan harga 1 hari.
--
--    ⚠️ URUTAN 1 → 4 MENGIKAT. invoices_schedule_id_fkey dan
--    transactions_schedule_id_fkey keduanya ON DELETE SET NULL. Menghapus baris
--    ini sebelum langkah 1 membuat schedule_id baris …664 jadi NULL TANPA SATU
--    PUN ERROR — dan schedule_billing() membaca schedule_id, jadi Rp 444.000
--    lenyap dari setiap papan jadwal, diam-diam.
--
--    Snapshot lebih dulu, ke skema `backup` bukan `public` (aturan sql/61:
--    CTAS tidak mewarisi RLS, default privileges anon hanya di `public`).
create table if not exists backup.ad_schedules_deleted
  (like public.ad_schedules including defaults);
alter table backup.ad_schedules_deleted enable row level security;

insert into backup.ad_schedules_deleted
select * from public.ad_schedules
 where id = '010ee84a-2525-4402-90a1-4378d38e70a8';

delete from public.ad_schedules
 where id = '010ee84a-2525-4402-90a1-4378d38e70a8';

-- 5. Nomori ulang lewat fungsi yang sudah disanksikan sistem — jangan tulis
--    UPDATE ordinal sendiri, itu berarti memilih aturan urutan KEDUA yang akan
--    berbeda hasilnya pada pemindahan tanggal berikutnya.
--    ad_schedules_ordinal_key DEFERRABLE INITIALLY DEFERRED, jadi 3→2 tidak
--    perlu nilai antara.
select resync_ad_schedule_ordinals('af004b84-c40d-45e6-98a0-2000ee2e0c1e');

-- 6. Tutup 3 event webhook (setara tombol "Tandai selesai").
--    Sesudah baris jadwalnya hilang, INI rekaman insidennya.
update doku_webhook_events
   set resolved_at = now(), resolved_by = 'product@jakpat.net'
 where invoice_number = 'JFU-INV-af004b-1788319498664'
   and outcome = 'write_failed' and resolved_at is null;

-- ── Hasil terverifikasi 2026-09-03 ──────────────────────────────────────────
--   ad_schedules : #1 7AX5JAZH (31 Agu, paid) · #2 DSTSANY2 (4–5 Sep, scheduled/paid)
--   invoices     : …834 paid · …664 paid → schedule 4bae5af9 · …458 cancelled
--   pendapatan   : Rp 999.000, terhitung SEKALI
--   yatim        : NOL baris schedule_id NULL di seluruh invoices/transactions
