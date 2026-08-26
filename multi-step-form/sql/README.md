# Migrasi SQL — urutan terap

Berkas di folder ini **diterapkan manual** lewat Supabase SQL Editor. Tidak ada
`supabase migrate`, tidak ada tabel pelacak, dan tidak ada CI yang menjalankannya.
Berkas ini adalah satu-satunya catatan urutannya.

## Aturan

1. **Terapkan menaik menurut nomor.** `59` sebelum `59b` sebelum `60` sebelum `60b`.
   Huruf akhiran = "menyusul di nomor yang sama", bukan varian yang boleh dipilih.
2. **Nomor boleh bolong.** `10`, `17`, dan `50` tidak pernah ada di repo ini.
   `50` sengaja **dipesan** untuk `reward_pools` yang belum ditulis — bukan berkas
   hilang. Jangan memakai ulang nomornya.
3. **Nomor baru mengambil angka tertinggi + 1.** Kalau angka itu sudah dipakai
   dan sudah diterapkan ke produksi, pakai akhiran huruf (`60b`) — jangan
   mengganti nama berkas yang sudah dijalankan orang lain.
4. **`sql/` BUKAN sumber kebenaran RLS produksi.** Terbukti 2026-08-19: tiga
   policy `USING (true)` / `WITH CHECK (true)` hidup di `form_submissions`
   tanpa ada satu pun di folder ini — dibuat langsung lewat dashboard. Sebelum
   menyimpulkan izin sebuah tabel, baca `pg_policies`, bukan berkas di sini.
   (`sql/66` menutup ketiganya.)
5. **Satu berkas ditarik sebagian.** Judul `39` berbunyi *"RETRACTED — do not
   run"*, tapi yang ditarik cuma `UPDATE`-nya (normalisasi jam yang lahir dari
   salah baca hasil `UNION`, dan sempat terlanjur dijalankan). Yang tersisa di
   berkas itu hanya dua helper — `airing_instant_of_date()` dan
   `to_airing_instant()` — dan keduanya **dipakai** `sql/38`, `41`, dan `45`.
   Berkasnya inert dan aman dijalankan ulang; yang tidak boleh adalah
   menghidupkan lagi `UPDATE`-nya.
6. **Migrasi yang membetulkan uang menulis nominal, bukan rumus.** Nol berkas di
   folder ini memuat tangga tarif iklan — tarif hidup di
   `src/utils/cost-calculator.ts` dan salinan otoritatifnya di
   `functions/api/doku/create-payment.js`. `sql/71` dan `sql/72` memakai tarif
   sebagai alat **memilih** baris saat audit, lalu menulis angka yang sudah
   diverifikasi per baris. Menyalin tangga tarif ke SQL akan melahirkan sumber
   kebenaran ketiga.

## Tabrakan nomor yang diketahui

| nomor | berkas | keterangan |
|---|---|---|
| 22 | `22_add_redirect_url` + `22_update_get_batch_rewards` | objek tak berhubungan, urutan antar keduanya tidak berpengaruh |
| 23 | `23_add_display_order` + `23_add_payment_channel` | idem |
| 31 | `31_add_is_hidden` + `31_profiles_biodata` | idem |
| 59 | `59_secure_transactions_update_rls` + `59b_survey_analyses` | **sudah dipisah** — `59b` mengikuti konvensi `60b` |
| 60 | `60_billing_staleness` + `60b_ad_completed_notifications` | sudah memakai konvensi akhiran sejak awal |
| 61 | `61_extend_legacy_to_backup_schema` + `61_custom_mission_requests` | objek tak berhubungan (skema `backup` vs tabel baru); **keduanya sudah di produksi**, jadi tidak diganti nama |

Tiga tabrakan pertama lahir sebelum konvensi akhiran ada dan **sengaja
dibiarkan**: tidak ada urutan yang mengikat di antara pasangannya, dan mengganti
nama berkas yang sudah lama diterapkan hanya memindahkan kebingungan. Tabrakan
`61` menyusul setelahnya dan dibiarkan atas alasan yang sama — keduanya sudah
dijalankan, jadi mengganti nama hanya memutus jejak.

`add_extra_ad_column.sql` tidak bernomor — ia mendahului skema penomoran. Sudah
diterapkan (kolom `survey_pages.is_extra_ad` ada di produksi).

`ops_cleanup_test_account_tegarerputra.sql` **bukan migrasi**. Ia skrip
pembersihan sekali pakai untuk satu akun; jangan dijalankan sebagai bagian dari
urutan.

## Rantai bacaan

Nomornya urutan **terap**, bukan urutan **baca**. Dua rantai di bawah ini
mengelompokkan berkas yang saling menimpa, supaya keadaan hari ini bisa
ditemukan tanpa membaca tujuh puluh berkas. Di dalam satu rantai, **berkas
bernomor lebih besar menang** — yang lebih tua dibiarkan berdiri sebagai
catatan kenapa keputusannya berubah.

### Jalur uang

| berkas | yang ia tetapkan |
|---|---|
| `24` | RLS penuh untuk `invoices` (sebelumnya terbaca & tertulis oleh anon key) |
| `33` | `guard_payment_columns()` — allowlist transisi, bukan pembekuan kolom. ⚠️ Ia **sengaja meloloskan** koneksi tanpa klaim JWT: itulah pintu resmi bagi migrasi pembetul uang seperti `71`/`72` |
| `34` | PPN 11% **di atas** subtotal. `amount`/`total_cost` tetap berarti grand total; `subtotal`/`ppn_amount` NULL = order era pra-PPN, bukan data rusak |
| `35` | `voucher_redemptions` — satu kali per akun, ditulis webhook DOKU (`service_role`) |
| `53` | Uang jadi milik **JADWAL**, bukan order. `payment_status_rank()` + `schedule_billing*()` adalah definisi kanonik "tagihan hidup"; sisi TS **mencerminkannya** (`isLiveInvoice`), tidak menurunkannya ulang |
| `54` | `doku_webhook_events` — jejak webhook DOKU + banner Keuangan |
| `59` | UPDATE `transactions` khusus admin (paritas dengan `24`) |
| `60` | Tagihan basi dinilai **saat dibaca**: `billed_start_date` + `is_stale`. Menutup balapan admin ↔ peneliti saat tanggal tayang bergeser |
| `66` | Menutup tiga policy `true` + menyamakan kepemilikan tagihan |
| `71` | Rekonsiliasi 5 faktur `paid` tanpa `paid_at` — 3 dibatalkan, 2 di-backfill. Bukan sapuan rata: batch-nya benar, yang hilang jejaknya |
| `72` | Rekonsiliasi 11 order yang **mencatat** harga lain dari yang **ditagihkan**. Arahnya catatan mengikuti tagihan; 77 selisih lain sengaja ditinggal karena sebagiannya keputusan manusia |

⚠️ **`payment_status` bukan bukti pembayaran.** Sebagian order dibayar di luar
sistem dan kolomnya tetap `pending` selamanya. Untuk pertanyaan uang, baca
`invoices`/`transactions` lewat `schedule_billing_summary()`.

### Jadwal iklan & Kilat

| berkas | yang ia tetapkan |
|---|---|
| `38` | Satu survei tidak boleh tayang di dua jendela sekaligus |
| `39` | Helper waktu: sebuah DATE di `form_submissions` berarti **15.00 WIB** hari itu. Sisanya inert (lihat Aturan 5) |
| `40` | Halaman iklan dibuat **dan diterbitkan otomatis** saat tagihan lunas — sebabnya halaman milik order survei praktis tidak pernah lahir sebagai draft |
| `41` | `ad_schedules`: satu baris = satu jendela tayang, termasuk jendela **pertama**. Admin dan peneliti akhirnya membaca baris yang sama |
| `42` | **Kilat**: kolom `kilat_slot_hour`, empat gelombang 08/11/14/17 WIB hari kerja, dua order per gelombang — plus Kilat dikecualikan dari halaman iklan |
| `45` | `ad_schedules` berhenti memaku Kilat ke 15.00 dan membaca `kilat_slot_hour` |
| `46` | Dua sumbu terpisah: **review** (`in_review/approved/rejected/spam`) vs **tayang** (`waiting_payment/paid/scheduled/live/completed`) |
| `48` | Notifikasi "iklan mulai tayang" (pg_cron). ⚠️ Cron-nya menyala sebelum endpoint-nya dideploy — 3 order kehilangan email; verifikasinya di `net._http_response`, bukan `cron.job` |
| `49` | Jam tayang kustom untuk jadwal ordinal 1 akhirnya sampai ke `ad_schedules` |
| `51` | `booking_id` + `schedule_id` — identitas yang bisa diucapkan manusia |
| `52` | `form_submissions_extend` jadi VIEW di atas `ad_schedules` |
| `62` | Pembatalan slot oleh admin punya nama sendiri di sumbu tayang |
| `63` | Extra Ad pindah dari ORDER ke JADWAL + aturan tiga lapis **Kilat tidak punya kuota iklan tambahan** (trigger pembersih, CHECK, dan penolakan di RPC) |
| `64` | Perbaikan cermin `survey_pages.is_extra_ad` |
| `60b` → `65` | Email "iklan selesai" — `60b` memasangnya, `65` membuatnya benar-benar terkirim |
| `69` | Sumbu review dibereskan: `cancelled` akhirnya berarti *dibatalkan*, `dismissed_at` untuk *disembunyikan pemiliknya*, dan `review_history` akhirnya punya kolom (sebelumnya setiap penulisannya gagal diam-diam) |
| `70` | `review_status` jadwal ke-2 dst. ikut induknya — penyebabnya `sync_ad_schedule_from_submission()`, bukan view-nya |

⚠️ **`sync_ad_schedule_from_submission()` ditulis ulang utuh oleh ENAM berkas** —
`41`, `45`, `46`, `49`, `51`, `70`. `CREATE OR REPLACE` mengganti seluruh badan,
jadi menyalin dari berkas yang salah akan menghidupkan lagi cabang lama — pernah
terjadi: badan `sql/49` disalin saat `51` yang berlaku, dan cabang penghapus
jadwal hidup kembali. Baca `pg_get_functiondef()` di produksi dulu, jangan
berkasnya.

⚠️ **Trigger-nya hanya menyala untuk kolom yang terdaftar.**
`trg_ad_schedule_from_submission` berbunyi `AFTER INSERT OR UPDATE OF <19 kolom>`
— dan `updated_at` **tidak** ada di daftar itu (diperiksa lewat
`pg_get_triggerdef()`, 2026-08-26). Menyentuh `updated_at` untuk memaksa re-sync
tidak melakukan apa-apa; sentuh kolom yang terdaftar, mis.
`submission_status = submission_status`.

⚠️ **`ad_schedules.status` tidak bisa dipercaya sebagai jam dinding.** Terukur
2026-08-26: **seluruh 177** baris berstatus `live` jendelanya sudah lewat — nol
yang benar-benar tayang. Kolom itu maju saat ditulis dan tidak pernah mundur
sendiri. Untuk pertanyaan "sedang tayang atau tidak", tanggal menang atas kolom.

## Status terap (51–72)

Diverifikasi langsung ke produksi (`zewuzezbmrmpttysjvpg`) dengan memeriksa objek
yang dibuat masing-masing berkas, bukan dari catatan — `51`–`66` pada 2026-08-19,
`61_custom_mission_requests` dan `67`–`72` pada 2026-08-26.

| berkas | isi | ada di produksi |
|---|---|---|
| `51_booking_id_and_schedule_id` | `booking_id`, `schedule_id` + trigger penurunnya | ✅ |
| `52_extend_becomes_view` | `form_submissions_extend` jadi VIEW | ✅ |
| `53_schedule_billing` | `payment_status_rank`, `schedule_billing*` | ✅ |
| `54_doku_webhook_events` | jejak webhook DOKU + banner Keuangan | ✅ |
| `55_auto_page_display_order_neutral` | urutan halaman iklan | ✅ |
| `56_custom_forms` | `custom_forms`, `form_responses` | ✅ |
| `57_add_custom_form_id_to_submissions` | `form_submissions.custom_form_id` | ✅ |
| `58_add_header_image_to_custom_forms` | `custom_forms.header_image_url` | ✅ |
| `59_secure_transactions_update_rls` | UPDATE `transactions` khusus admin | ✅ |
| `59b_survey_analyses` | tabel `survey_analyses` (JFU AI Analyzer) | ✅ |
| `60_billing_staleness` | `billed_start_date`, `is_stale` | ✅ |
| `60b_ad_completed_notifications` | `notify_primary_ads_completed()` | ✅ |
| `61_extend_legacy_to_backup_schema` | pindah `extend_legacy` ke skema `backup` | ✅ |
| `61_custom_mission_requests` | tabel `custom_mission_requests` (Misi & Aksi Khusus) | ✅ |
| `62_slot_cancelled_axis` | sumbu `cancelled` di `airing_status_of`/`review_status_of` | ✅ |
| `63_schedule_extra_ad` | Extra Ad jadi properti jadwal + aturan Kilat 3 lapis | ✅ |
| `64_repair_page_extra_ad_mirror` | perbaikan cermin `survey_pages.is_extra_ad` | ✅ |
| `65_fix_ad_completed_notifications` | email "iklan selesai" yang tak pernah terkirim | ✅ |
| `66_fix_form_submission_and_billing_policies` | tutup policy `true` + samakan kepemilikan tagihan | ✅ diterapkan 2026-08-19 |
| `67_respondent_analytics` | `get_respondent_analytics()` — tab Responden jadi satu request | ✅ diterapkan 2026-08-24 |
| `68_campaign_link_clicks` | `campaign_link_clicks` + `increment_campaign_click()`; ⚠️ log **mulai dari nol** 2026-08-24, 44 klik lama tidak bisa dibangkitkan ulang | ✅ diterapkan 2026-08-24 |
| `69_review_axis_cleanup` | `dismissed_at`, `review_history`, `airing_status_of('cancelled')` | ✅ diterapkan 2026-08-25 |
| `70_extend_review_status_follows_parent` | `review_status` jadwal lanjutan ikut induk | ✅ diterapkan 2026-08-26 |
| `71_reconcile_paid_without_paid_at` | 5 faktur `paid` tanpa `paid_at` (3 batal, 2 backfill) — sisa **0** | ✅ diterapkan 2026-08-26 |
| `72_reconcile_stale_order_price` | 11 order yang mencatat harga lain dari yang ditagihkan | ✅ diterapkan 2026-08-26 |

Berkas di bawah 51 tidak dicatat statusnya satu per satu: aplikasi tidak akan
berjalan tanpanya, jadi keberadaannya sudah terbukti setiap hari. Kalau ragu,
periksa objeknya di `information_schema` — jangan berasumsi dari nomor.
