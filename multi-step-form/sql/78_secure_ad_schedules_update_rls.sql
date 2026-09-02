-- 78_secure_ad_schedules_update_rls.sql
-- Date: 2026-09-02
--
-- WHY: `ad_schedules` punya RLS aktif (relrowsecurity=true) tapi HANYA dua
-- policy — "Service role full access ad_schedules" (ALL, service_role) dan
-- "Owner or admin can view ad_schedules" (SELECT, authenticated). **Nol policy
-- UPDATE.** GRANT UPDATE ke `authenticated` ada, jadi izin tabelnya lolos dan
-- yang menolak adalah RLS-nya — diam-diam, sebagai "0 baris cocok".
--
-- KAPAN INI MULAI MENGGIGIT: selama penulisnya masih view `form_submissions_extend`,
-- tulisan admin masuk lewat view itu dan tidak pernah menyentuh policy tabel ini.
-- `sql/73`–`76` memindahkan semua penulis ke `ad_schedules` langsung dan
-- `sql/76` mencabut view-nya (2026-08-30). Sejak itu SETIAP tulisan admin dari
-- browser ke tabel ini menyentuh nol baris.
--
-- Terukur di produksi 2026-09-02 — pembatalan extend TERAKHIR yang berhasil
-- bertanggal 2026-08-29 10:15, sehari sebelum view-nya dicabut. Dan dari 13
-- baris extend, tiga yang lahir sesudah tanggal itu semuanya ber-`total_cost`
-- 0 — termasuk `2DADYPA5` yang sudah LUNAS lewat QRIS: webhook (service_role)
-- berhasil menulis status pembayarannya, tapi tulisan `total_cost` dari
-- InvoiceForm sebelumnya tidak pernah mendarat.
--
-- CONSEQUENCE — semua ini gagal tanpa satu pun error, hanya untuk jadwal
-- ordinal ≥2 (ordinal 1 menulis `form_submissions`, yang policy-nya lengkap):
--   * cancelSchedule()            → "Jadwal ini sudah lunas atau sudah
--                                    dibatalkan" padahal ia pending. Inilah
--                                    gejala yang dilaporkan (#EAKD7WPQ).
--   * markScheduleAsPaid()        → baris uangnya berpindah, cermin jadwalnya
--                                    tidak: kartu tetap "menunggu pembayaran".
--   * unmarkScheduleAsPaid()      → sama, arah sebaliknya.
--   * updateExtendScheduleDates() → tanggal baru tidak pernah tersimpan.
--   * InvoiceForm (extend)        → `total_cost`/`subtotal`/`ppn_amount` jadwal
--                                    ke-2 dst. tidak pernah tercatat.
--
-- ⚠️ INI KAMBUHAN KETIGA DARI POLA YANG SAMA. `sql/24` melengkapi `invoices`,
-- `sql/59` melengkapi `transactions` — keduanya ditemukan dengan cara yang
-- persis sama: sebuah tulisan yang "berhasil" tanpa mengubah apa pun. Kalau
-- suatu tabel diberi RLS dan sebuah layar admin menulisinya, periksa
-- policy-nya SEBELUM percaya pada tulisan yang tidak melempar.
--
-- SCOPE: aditif. Meniru "Admin Update Invoices"/"Admin Update Transactions"
-- persis — identitas admin yang sama, bentuk USING/WITH CHECK yang sama.
-- SELECT peneliti tidak disentuh: peneliti TIDAK pernah menulis tabel ini dari
-- browser (jalur mereka lewat Pages Function ber-service_role), jadi memberi
-- mereka UPDATE hanya akan memperluas permukaan tanpa ada yang memakainya.

BEGIN;

DROP POLICY IF EXISTS "Admin Update ad_schedules" ON public.ad_schedules;

CREATE POLICY "Admin Update ad_schedules"
  ON public.ad_schedules
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'product@jakpat.net')
  WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

COMMIT;

-- ── Verifikasi ────────────────────────────────────────────────────────────
--
-- 1. Policy-nya berdiri:
--
--    select policyname, cmd from pg_policies
--    where tablename = 'ad_schedules' order by cmd;
--    -- harus memuat satu baris cmd='UPDATE'
--
-- 2. Buktikan dari sudut pandang admin, lalu batalkan — inilah uji yang
--    membedakan "0 baris karena tidak ada yang cocok" dari "0 baris karena
--    ditolak RLS", dan yang gagal sebelum migrasi ini:
--
--    begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"email":"product@jakpat.net","role":"authenticated"}';
--      update ad_schedules set updated_at = now()
--       where booking_id = 'EAKD7WPQ' returning id, booking_id;
--      -- sebelum migrasi: 0 baris. sesudah: 1 baris.
--    rollback;
--
-- 3. Di layar: buka order dengan jadwal ke-2 yang belum dibayar → ⋯ →
--    "Batalkan Jadwal". Kartunya harus berubah jadi dibatalkan, dan kuota
--    tanggal itu bebas kembali.
