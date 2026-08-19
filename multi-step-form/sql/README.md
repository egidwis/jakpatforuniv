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

## Tabrakan nomor yang diketahui

| nomor | berkas | keterangan |
|---|---|---|
| 22 | `22_add_redirect_url` + `22_update_get_batch_rewards` | objek tak berhubungan, urutan antar keduanya tidak berpengaruh |
| 23 | `23_add_display_order` + `23_add_payment_channel` | idem |
| 31 | `31_add_is_hidden` + `31_profiles_biodata` | idem |
| 59 | `59_secure_transactions_update_rls` + `59b_survey_analyses` | **sudah dipisah** — `59b` mengikuti konvensi `60b` |
| 60 | `60_billing_staleness` + `60b_ad_completed_notifications` | sudah memakai konvensi akhiran sejak awal |

Tiga tabrakan pertama lahir sebelum konvensi akhiran ada dan **sengaja
dibiarkan**: tidak ada urutan yang mengikat di antara pasangannya, dan mengganti
nama berkas yang sudah lama diterapkan hanya memindahkan kebingungan.

`add_extra_ad_column.sql` tidak bernomor — ia mendahului skema penomoran. Sudah
diterapkan (kolom `survey_pages.is_extra_ad` ada di produksi).

## Status terap — Task 11 & 13 (51–66)

Diverifikasi langsung ke produksi (`zewuzezbmrmpttysjvpg`) 2026-08-19 dengan
memeriksa objek yang dibuat masing-masing berkas, bukan dari catatan.

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
| `62_slot_cancelled_axis` | sumbu `cancelled` di `airing_status_of`/`review_status_of` | ✅ |
| `63_schedule_extra_ad` | Extra Ad jadi properti jadwal + aturan Kilat 3 lapis | ✅ |
| `64_repair_page_extra_ad_mirror` | perbaikan cermin `survey_pages.is_extra_ad` | ✅ |
| `65_fix_ad_completed_notifications` | email "iklan selesai" yang tak pernah terkirim | ✅ |
| `66_fix_form_submission_and_billing_policies` | tutup policy `true` + samakan kepemilikan tagihan | ✅ diterapkan 2026-08-19 |

Berkas di bawah 51 tidak dicatat statusnya satu per satu: aplikasi tidak akan
berjalan tanpanya, jadi keberadaannya sudah terbukti setiap hari. Kalau ragu,
periksa objeknya di `information_schema` — jangan berasumsi dari nomor.
