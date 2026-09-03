-- ============================================================================
-- 81 — Kedaluwarsakan tagihan `pending` yang link DOKU-nya sudah lama mati
-- ============================================================================
-- DUA ALASAN, DAN YANG KEDUA JAUH LEBIH BESAR.
--
-- 1. Prasyarat gerbang "batalkan jadwal" (Bagian 6a): tanpa ini, 11 jadwal
--    kehilangan aksi "Batalkan Jadwal" karena tagihan renta mereka masih
--    terbaca hidup. (Angka "75" yang sempat ditulis di sini SALAH — ia dihitung
--    dari jadwal ber-invoice `pending`, bukan dari `openInvoice` yang menyaring
--    lagi lewat isSuperseded/isStale.)
-- 2. PIUTANG. Dari Rp 18.772.750 piutang berjalan, Rp 18.162.250 — 97%, 40
--    baris — berasal dari tagihan yang link DOKU-nya SUDAH MATI. Angka piutang
--    di setiap papan hari ini hampir seluruhnya fiksi. Sesudah migrasi ini ia
--    turun ke ~Rp 610.500, yaitu satu tagihan yang memang masih hidup.
--    ⚠️ Ini perubahan angka yang FINANCE AKAN LIHAT. Kabari mereka: ini
--    pembetulan pencatatan, bukan piutang yang hilang.
--
-- Terukur di produksi 2026-09-03:
--   183 invoice `pending`, 182 di antaranya sudah lewat 7 hari — yang paling
--   tua 29 Des 2025. `payment_due_date` yang kita kirim ke DOKU dipatok
--   60*24*7 = 7 hari (payment.ts:142), jadi link-link itu SUDAH MATI di sisi
--   DOKU. Yang tidak pernah mati adalah status di database kita.
--
-- Kenapa menggantung selamanya: TIDAK ADA yang mengedaluwarsakannya. `cron.job`
-- hanya berisi activate-extends dan dua notifier; satu-satunya yang membalik
-- status `pending` adalah cancelSchedule() dan cancelInvoice() — keduanya
-- dipicu manusia. Dan `isLiveInvoice` (billingCompare.ts) sama sekali tidak
-- sadar kedaluwarsa: ia hanya membaca isPaid/isPending/isSuperseded/isStale.
-- Jadi `openInvoice != null` untuk jadwal-jadwal ini, selamanya.
--
-- Sebaran jadwal yang terdampak (invoice sasaran, per status jadwal):
--   requested 76 · live 33 · slot_reserved 21 · cancelled 25 · paid 13 ·
--   scheduled 9 · completed 2 · unscheduled 2
--
-- ⚠️ `expired` DI SINI BERARTI "LINK BAYARNYA KEDALUWARSA", BUKAN "UANGNYA
-- TIDAK PERNAH DATANG". Sebagian order dibayar di luar sistem dan barisnya
-- tetap `pending` selamanya. Migrasi ini TIDAK mengubah satu pun baris `paid`/
-- `completed`, tidak menyentuh `ad_schedules`, dan tidak mengurangi pendapatan
-- yang sudah tercatat — ia hanya berhenti berpura-pura link mati masih bisa
-- dibayar.
--
-- Sekali jalan. Yang mencegahnya kambuh adalah sql/83 (`schedule_billing` +
-- `_bulk` + `_summary` menjawab `is_expired`, dan `isLiveInvoice` jadi
-- cerminannya lagi) plus Bagian 3 — `invoices.expires_at` mulai ditulis untuk
-- tagihan ADMIN, bukan cuma tagihan swalayan.
--
-- ⚠️ MIGRASI INI KODENYA SUDAH TAYANG LEBIH DULU (deploy 2026-09-03), jadi
-- selama ia belum diterapkan gerbang 6a sedang mencabut aksi "Batalkan Jadwal"
-- dari 11 jadwal hidup. Ini kebalikan jebakan biasa "DB mendahului kode" —
-- di sini KODE yang mendahului DB, dan akibatnya terlihat di meja admin.
-- ============================================================================

-- 1. Snapshot dulu — 400 baris berubah status, dan satu-satunya jalan pulang
--    adalah tahu persis baris mana. Skema `backup`, bukan `public` (sql/61).
create table if not exists backup.bills_expired_by_sql81 (
  tbl          text        not null,
  row_id       uuid        not null,
  payment_id   text,
  old_status   text        not null,
  created_at   timestamptz,
  expired_at   timestamptz not null default now(),
  primary key (tbl, row_id)
);
alter table backup.bills_expired_by_sql81 enable row level security;

insert into backup.bills_expired_by_sql81 (tbl, row_id, payment_id, old_status, created_at)
select 'invoices', id, payment_id, status, created_at
  from public.invoices
 where status = 'pending'
   and expires_at is null
   and created_at < now() - interval '7 days'
on conflict do nothing;

insert into backup.bills_expired_by_sql81 (tbl, row_id, payment_id, old_status, created_at)
select 'transactions', id, payment_id, status, created_at
  from public.transactions
 where status = 'pending'
   and created_at < now() - interval '7 days'
on conflict do nothing;

-- 2. Kedaluwarsakan.
--
--    `expires_at is null` sengaja HANYA di invoices: baris yang SUDAH punya
--    expires_at ditulis oleh create-payment.js, yang memang mengelola umurnya
--    sendiri — jangan ditimpa. `transactions` belum punya kolom itu sama
--    sekali, jadi syaratnya cukup umur baris.
update public.invoices
   set status = 'expired'
 where status = 'pending'
   and expires_at is null
   and created_at < now() - interval '7 days';

update public.transactions
   set status = 'expired'
 where status = 'pending'
   and created_at < now() - interval '7 days';

-- ============================================================================
-- Verifikasi:
--
--   -- tidak ada lagi tagihan renta yang mengaku hidup
--   select count(*) from public.invoices
--    where status='pending' and created_at < now() - interval '7 days';   -- harapan: 0 (kecuali yang punya expires_at sendiri)
--
--   -- pendapatan TIDAK berubah
--   select sum(amount) from public.transactions where status in ('paid','completed');
--
--   -- jalan pulang, kalau ternyata keliru:
--   -- update public.invoices i set status = b.old_status
--   --   from backup.bills_expired_by_sql81 b
--   --  where b.tbl='invoices' and b.row_id = i.id and i.status='expired';
-- ============================================================================
