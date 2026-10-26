# Migrasi SQL — urutan terap

Berkas di folder ini **diterapkan manual** lewat Supabase SQL Editor. Tidak ada
`supabase migrate`, tidak ada tabel pelacak, dan tidak ada CI yang menjalankannya.
Berkas ini adalah satu-satunya catatan urutannya.

## Aturan

1. **Terapkan menaik menurut nomor.** `59` sebelum `59b` sebelum `60` sebelum `60b`.
   Huruf akhiran = "menyusul di nomor yang sama", bukan varian yang boleh dipilih.
2. **Nomor boleh bolong.** `10` dan `17` tidak pernah ada di repo ini.
   `50` **sudah terisi** sejak 2026-09-11 — `50_reward_pools.sql`, persis objek
   yang nomornya dipesan sejak 2026-08-10. **`86` masih dipesan** — untuk
   pelebaran `create_ad_schedule()` di Phase 4 (penjadwalan swalayan). Per
   2026-09-11 `86` masih kosong.

   Per **2026-09-18** nomor bebas berikutnya **`96`**. ⚠️ Jangan percaya angka ini
   begitu saja — ia basi segera setelah ada yang menambah berkas; jalankan
   `git fetch` dan perintah `git ls-tree` di aturan 3 sebelum mengambil nomor.

   ⚠️ **`95` BERTABRAKAN — dua berkas, keduanya sudah di produksi 2026-09-18:**

   | Berkas | Isi |
   |---|---|
   | `95_ad_schedules_notifications.sql` | Notifikasi tayang & selesai per-jadwal (`ad_schedules.live_notified_at`, `notify_primary_ads_live/completed`) |
   | `95_kilat_punya_halaman.sql` | Phase 5 — `ensure_survey_page()` mencakup Kilat |

   Tidak diganti nama (aturan 3: keduanya sudah dijalankan). Terapkan **notifikasi
   dulu, baru Kilat** bila membangun ulang dari nol — keduanya tidak saling
   menyentuh objek, jadi urutannya hanya soal konsistensi dengan produksi.

   **Persis tabrakan `85` terulang**, dan sebabnya sama: langkah `git ls-tree`
   dilewati. `95_ad_schedules_notifications.sql` sudah mendarat di `main` lewat
   commit `e41b053` beberapa jam lebih dulu, tapi penulis `95_kilat_punya_halaman.sql`
   hanya melihat `94` sebagai tertinggi di working tree-nya. Kalau aturan 3 terasa
   bertele-tele: ini kali kedua dalam sebulan.
3. **Nomor baru mengambil angka tertinggi + 1.** Kalau angka itu sudah dipakai
   dan sudah diterapkan ke produksi, pakai akhiran huruf (`60b`) — jangan
   mengganti nama berkas yang sudah dijalankan orang lain.

   ⚠️ **"Tertinggi" berarti tertinggi di SELURUH remote, bukan di working tree
   Anda.** Sebelum mengambil nomor, jalankan `git fetch` lalu
   `git ls-tree --name-only origin/main multi-step-form/sql/ | tail`. Tabrakan
   `85` (di bawah) lahir persis karena langkah ini dilewati di **dua** branch
   sekaligus: masing-masing melihat `84` sebagai tertinggi, dan keduanya benar
   menurut pandangannya sendiri. Git tidak menolak — nama berkasnya berbeda,
   jadi merge-nya bersih dan tabrakannya baru terlihat saat ada yang membaca
   folder ini.
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
| 85 | `85_stale_bill_and_authoritative_url` + `85_add_ai_prescreening_to_submissions` | objek tak berhubungan (jalur uang vs kolom `form_submissions.ai_prescreening`); **keduanya sudah di produksi** per 2026-09-10, jadi tidak diganti nama |

Tiga tabrakan pertama lahir sebelum konvensi akhiran ada dan **sengaja
dibiarkan**: tidak ada urutan yang mengikat di antara pasangannya, dan mengganti
nama berkas yang sudah lama diterapkan hanya memindahkan kebingungan. Tabrakan
`61` menyusul setelahnya dan dibiarkan atas alasan yang sama — keduanya sudah
dijalankan, jadi mengganti nama hanya memutus jejak.

**Tabrakan `85` beda kelasnya, dan itu yang perlu diingat.** Empat yang di atas
lahir dari sejarah — konvensi akhirannya memang belum ada. `85` lahir dari **dua
branch yang berjalan paralel** dan sama-sama mengambil "84 + 1":

- `85_stale_bill_and_authoritative_url` — branch `fix/link-bayar-berwenang`,
  diterapkan ke produksi 8 Sep
- `85_add_ai_prescreening_to_submissions` — `main`, diterapkan 10 Sep

Keduanya sudah dijalankan sebelum branch-nya bertemu, jadi mengganti nama salah
satunya sekarang justru memutus jejak — persis alasan yang berlaku untuk `61`.
Yang berubah bukan berkasnya, melainkan **Aturan 3**: nomor diambil sesudah
`git fetch`, bukan dari isi folder lokal.

⚠️ **Urutan terapnya tidak mengikat di sini** (objeknya tak berhubungan), tapi
jangan menyimpulkan itu berlaku untuk tabrakan berikutnya. Kalau dua berkas
bernomor sama menyentuh objek yang sama, salah satunya **wajib** diberi akhiran
huruf sebelum dijalankan — dan itu hanya mungkin kalau tabrakannya ketahuan
sebelum diterapkan.

`add_extra_ad_column.sql` tidak bernomor — ia mendahului skema penomoran. Sudah
diterapkan (kolom `survey_pages.is_extra_ad` ada di produksi).

`ops_cleanup_test_account_tegarerputra.sql`, `ops_cleanup_test_order_af91c0.sql`,
`ops_fix_order_af004b84_dead_bill_payment.sql`, dan `ops_cancel_test_submission_sada.sql`
**bukan migrasi**. Mereka skrip operasional sekali pakai untuk perbaikan/pembersihan
data testing dan insiden; jangan dijalankan sebagai bagian dari urutan migrasi.

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
| `77` | Penolakan webhook ikut dicatat, bukan cuma yang lolos. ⚠️ **`doku_webhook_events_outcome_check` adalah allowlist** — menambah nilai `outcome` di JavaScript tanpa migrasi = INSERT ditolak 400 = penolakannya sendiri gagal dicatat, persis kebutaan yang sink ini dibuat untuk menutup |
| `80` | Uang yang mendarat di tagihan **mati** dicatat tapi **tidak menggerakkan jadwal** (`paid_on_dead_bill`). Insiden `af004b84`: tagihan terbit 10.25, jadwalnya dibatalkan 10.44, dibayar 20.10 keesokan harinya |
| `81` | Menutup 182 tagihan `pending` yang link DOKU-nya sudah lama mati. Piutang berjalan **Rp 18.772.750 → Rp 610.500**; nol baris lunas tersentuh. ⚠️ Sekali jalan — **tidak ada cron** yang melakukan ini terus-menerus, jadi `pending` basi akan menumpuk lagi |
| `82` | `is_stale` akhirnya melihat jadwal yang **mati**, bukan cuma yang **pindah** — `cancelSchedule()` mempertahankan tanggalnya, jadi sebelum ini pembatalan tak terlihat oleh vonis basi |
| `83` | Umur link jadi bagian vonis: `expires_at` + `is_expired` masuk `schedule_billing*()`. ⚠️ Mencatat juga bahwa **`transactions` tidak punya `expires_at`** — jangan menambahkannya lewat objek `shared` di `buildInvoiceRows`, INSERT-nya akan ditolak 400 dan membatalkan seluruh tagihan |
| `84` | `invoices.doku_request_id` + `doku_cancelled_at`. `request_id` yang pulang dari DOKU **wajib** disimpan: Cancel Order API menuntutnya sebagai `original_request_id`, jadi tagihan tanpa nilai itu tidak bisa dimatikan selamanya |
| `85` | `authoritative_payment_url()` — satu tempat yang menjawab "tagihan mana yang berwenang untuk jadwal ini", dipakai resolver `/bayar/<id>`. Plus outcome `paid_on_stale_bill`, sengaja **dipisah** dari `paid_on_dead_bill` karena tindakan adminnya berbeda: pindahkan uangnya vs kembalikan |
| `87` | `reason` berhenti berbohong: `bill_cancelled` memisahkan **tagihan** yang dibatalkan dari **jadwal** yang dibatalkan — sebelumnya keadaan itu jatuh ke `ELSE 'expired'` dan peneliti disuruh menjadwalkan ulang slot yang masih dipegangnya (2 jadwal produksi, keduanya hidup). Plus `invoices.doku_cancel_last_error`: jawaban DOKU saat Cancel Order ditolak akhirnya tersimpan, bukan menguap ke `console` sebuah Pages Function. ⚠️ Ia juga **mencabut hibah `anon`** yang datang diam-diam dari `pg_default_acl` — sql/85 tidak pernah memberikannya, dan tidak ada satu pun pemanggil anon |
| `101` | **Ops, sekali jalan.** Menutup 4 invoice + 4 transaksi tagihan gabungan JFU-INV-15f4ac sebagai `cancelled`. Tanpa ini, "Tandai Lunas" membalik baris mati itu jadi `paid`, yaitu **Rp 1.542.900 pendapatan tanpa uang**. Tutup baris uang yang mati sebagai `cancelled`, jangan `expired`. ✅ diterapkan 2026-09-29 |
| `102` | **Tayang sebelum lunas + tagihan tempo.** Izin tayang dipisah dari uang: `ad_schedules.air_on_credit_*` + `slot_booked_by='admin'`, dengan penjaga admin-only. `invoices.is_tempo` tidak pernah `is_expired`, karena utang ≠ link hidup. `authoritative_payment_url()` mendapat reason `tempo_renewable` (diperiksa **sebelum** `live`) dan `bill_expired`. RPC `renew_tempo_bill` / `adopt_superseded_tempo_payment` hanya untuk `service_role`, dan unique index menjamin satu tempo `pending` per jadwal. ⚠️ Tujuh fungsi disalin dari `pg_get_functiondef` produksi; snapshot-nya di `backup.fn_defs_102`. ✅ diterapkan & diverifikasi 2026-09-29, `proacl` tanpa `anon` |
| `125` | **Tutup reservasi mandiri.** Tabel `"JFU_self_booking_closures"` (WAJIB dikutip; satu baris = satu masa tutup, cermin tabel libur sql/122: anon/authenticated baca 4 kolom, tulis service_role via `/api/admin/self-booking`) + `form_submissions.self_booking_closed_at` = cap "jadwal oleh tim" yang ditulis trigger, permanen. `trg_01_self_booking` (BEFORE, jalan sebelum penilai Kilat/kuota, sesudah `trg_00` sql/124): INSERT `approved` peneliti → cap + tanpa jadwal; INSERT `waiting_payment` saat ditutup → `approved` + cap (tab basi); peneliti tak bisa mengubah cap atau mengisi tanggal saat ditutup/bercap; perpanjangan (`source_table='form_submissions_extend'`) ditolak saat ditutup. HINT `self_booking_closed`. Independen dari 123/124 (tidak menyentuh `create_ad_schedule`). Jalur Iklan lock.js = service_role → dijaga lock.js sendiri. Diuji di PGlite (16 kasus + blok uji Langkah 4 + rollback). ✅ diterapkan 2026-10-22 (diverifikasi: trigger di kedua tabel, `proacl` hanya postgres+service_role, hibah 4 kolom anon/authenticated, 0 baris saklar, 0 order bercap) |
| `126` | **Dokumentasi saja.** `COMMENT ON COLUMN ad_schedules.source_table`: `'form_submissions_extend'` adalah **label** perpanjangan (ordinal ≥2, `source_id` = uuid acak dari `create_ad_schedule`), **bukan** nama tabel — tabel/view-nya sudah dicabut di `73`–`76`, salinannya hanya di skema `backup`. Label sengaja tidak diganti (CHECK, unique key, 13 fungsi, md5 `123`, trigger `125`); di kode diwakili `EXTENSION_SOURCE_TABLE`. Nol perubahan perilaku; independen, boleh kapan saja. ✅ diterapkan 2026-10-22 |
| `123` | **Satu pintu jadwal, bagian 1 (menambah).** `create_ad_schedule` (signature tetap) memulihkan bentuk gelombang Kilat sql/119 E1; fungsi pintu `door_lock_kilat_wave` / `door_create_extension` / `door_release_slot` / `door_cancel_schedule` (service_role saja) + `_schedule_door_act_as` (postgres saja) yang memasang klaim peneliti sehingga trigger menilai tulisan pintu sebagai peneliti. Hanya menambah — kode lama tetap jalan. Wajib SEBELUM Push A. ✅ diterapkan & terverifikasi 2026-10-25 (ACL persis, md5 `create_ad_schedule` = `c728873e…`) |
| `124` | **Satu pintu jadwal, bagian 2 (menutup).** Trigger `trg_00_schedule_door` menolak tulisan kolom jadwal dari browser peneliti (HINT `schedule_door_only`); dua policy peneliti `ad_schedules` dicabut; `survey_pages` pemilik jadi SELECT saja; EXECUTE `create_ad_schedule` / `set_survey_pages_order` / `cron_activate_extends` / `resync_ad_schedule_ordinals` dicabut dari browser; anon tak menulis tabel jadwal. HANYA SESUDAH Push A live + egidwis dikabari; sesudahnya revert kode ke pra-Push A tidak aman. ✅ diterapkan & terverifikasi 2026-10-26 (Langkah 3a/3b/3c sesuai, Langkah 4 `UJI_LULUS — 7 kasus`, nol galat log; policy ALL pemilik `survey_pages` sengaja diturunkan ke SELECT — keputusan user, audit nol tulis peneliti) |
| `127` | **Ops, sekali jalan.** Backfill siaran satu gelombang Kilat lunas (#a4582981 Wisata Kopi, 15 Okt) yang jatuh di celah antara backfill U8 `118` dan rilis toggle siaran (Push A) — pola U8, `*_by = 'backfill'`, jendela undian tidak berubah. ✅ diterapkan & terverifikasi 2026-10-26 (sisa gelombang lampau belum ditandai = 0) |
| `128` | **Satu pembatalan pesanan peneliti.** `door_cancel_order` (service_role saja, via `/api/schedules/lock` aksi `cancel-order`): pemilik + belum lunas + status ∈ daftar `cancelOrder` lama + tanpa perpanjangan hidup → `cancelled`, hold `slot_booked_by` dilepas (cron `94` tak bisa menghidupkannya lagi), riwayat `actor: researcher`, transactions + invoices non-tempo `pending` → `cancelled`, satu transaksi. Dipakai kartu dashboard DAN Jadwal & Bayar ordinal 1 (dulu `slot_cancelled` tanpa pelaku). `door_cancel_schedule` tidak diubah → md5 pra-cek `124` tetap. Langkah 2b menutup tagihan zombie #6d5c6775 & #101abf8e (link DOKU sudah kedaluwarsa). Wajib SEBELUM kode `cancel-order` dideploy; independen dari `124`. Diuji di PGlite (20 kasus + kontrol cacat lama + 2b + rollback). ✅ diterapkan & terverifikasi 2026-10-26 (`proacl` hanya postgres+service_role, 4 baris zombie → `cancelled`, cek 3d zombie = 0, md5 `door_cancel_schedule` tetap `5e1bdd56…`) |
| `129` | **Penyebab jadwal batal.** Kolom `ad_schedules.cancelled_by` (`admin` / `researcher` / `expired`, CHECK) milik trigger `trg_zz_cancelled_by` (BEFORE, paling akhir): saat status masuk `cancelled` → hold peneliti ≥55 mnt = `expired`, tanpa JWT / service_role / email admin = `admin`, selebihnya `researcher`; tetap batal = nilai lama; keluar batal = NULL. Ordinal 1 ikut lewat upsert sinkron (DO UPDATE SET tak menyebut kolomnya). Kartu `slot_cancelled` / `cancelled` + baris admin "Peneliti melihat" memilih kalimat per penyebab; NULL (27 baris lama) = netral. Backfill #6362d67e = `researcher`. ⚠️ WAJIB SEBELUM deploy kode — `fetchAdSchedules` memilih kolom ini, tanpanya seluruh kueri 400. Independen dari `124`/`128`. Diuji di PGlite (17 kasus + kontrol tanpa trigger + rollback). ✅ diterapkan & terverifikasi 2026-10-26 (kolom + CHECK + trigger aktif, tak ada trigger sesudah `trg_zz`, backfill #6362d67e; uji cepat Push A: batal peneliti ordinal 1 → `researcher`, batal admin perpanjangan → `admin`) |
| `ops_drop_tabel_arsip` | **Ops, sekali jalan.** DROP `scheduled_ads` (dipensiunkan `09`, 51 baris basi) dan `survey_winners` (beku sejak `43`, 267 baris; pengundian sudah di platform pihak ketiga dan datanya sudah dipindah). Bukti nol pemakai: kode, objek database, dan log REST 3×24 jam (±275 rb permintaan, 0 ke kedua tabel). `RESTRICT`, bukan `CASCADE`; pra-cek sidik md5 isi tabel. ⚠️ Sesudahnya `08`, `09`, `15`, `43`, `add_extra_ad_column` (bagian 2), dan snapshot `survey_winners` di `ops_cleanup_test_account_tegarerputra` tidak boleh diputar ulang. ✅ diterapkan 2026-10-15 (diverifikasi: kedua tabel NULL, 0 policy yatim, form_submissions 1.162 & survey_pages 491 utuh) |
| `117` | **Fondasi gelombang Kilat swalayan (Phase 5 R2).** Gelombang baru hanya 11.00/15.00 WIB (CHECK tetap menerima 8/14/17 demi riwayat). Kuota 2 per gelombang ditegakkan trigger AFTER di `ad_schedules` untuk **semua** penulis, termasuk admin (HINT `kilat_wave_full`). Klaim gelombang oleh **peneliti** divalidasi trigger `validate_kilat_wave_claim`: Senin–Jumat, bukan libur aktif, H-2 jam, `end = start + 1`, `duration` dipaksa 1, dan peneliti tak boleh mengubah `distribution_type`. Penjaga irisan membaca jam gelombang. Tabel `operational_holidays` (tulis hanya `service_role`), RPC `get_kilat_wave_occupancy`, dan cron pelepas ikut meng-NULL-kan `kilat_slot_hour`. Diuji di PGlite (20 kasus + mutan); tiga fungsi disalin dari `pg_get_functiondef` produksi 15 Okt (md5 di Langkah 1a). ✅ diterapkan & diverifikasi 15 Okt 2026 |
| `118` | **Undian & halaman buta jenis + kolom siaran Kilat (Phase 5 R4).** `get_batch_rewards_bulk` membaca jendela ordinal 1 dari cermin `ad_schedules` (gelombang Kilat & jam kustom Iklan, bukan 15.00 terpatok) dengan satu rumus `airing_window_start/_end` untuk kedua kaki; kontrak keluaran tetap, hanya `start_date/end_date` 20 order lama yang bergeser (daftar di 1d/3c, snapshot `backup.r118_rewards_before`). `compute_extend_period_batch` → bulan WIB. `ensure_survey_page`: halaman Kilat baru berjendela, bukan `publish_end_date` NULL. Kolom `ad_schedules.broadcast_*` + penjaga (hanya `service_role`; pindah tanggal me-reset) + backfill 17 gelombang lampau. RPC `service_role` `kilat_broadcast_start/_end/_undo` (satu arah, boleh terlambat, batal hanya tanpa responden). Diuji di PGlite (20 kasus); tiga fungsi disalin dari `pg_get_functiondef` produksi 15 Okt (md5 di 1a). ✅ diterapkan & diverifikasi 15 Okt 2026 (10 fungsi md5 = berkas; snapshot 1e tidak dibuat) |
| `119` | **Extend Kilat: pesan gelombang lagi (Phase 5 R8).** `create_ad_schedule` (signature tetap, `CREATE OR REPLACE`): penolakan Kilat peneliti dicabut; untuk Kilat jam gelombang diturunkan dari jam WIB `p_start_date` (wajib 11/15 tepat, HINT `kilat_wave_invalid`), `end` dipaksa +24 jam, `duration` 1, `kilat_slot_hour` ditulis (dulu NULL, juga untuk admin); cutoff 13.00 tak berlaku untuk Kilat. Trigger baru `validate_kilat_extend_claim` di baris perpanjangan — padanan K4 sql/117 untuk peneliti (dua policy UPDATE peneliti di `ad_schedules`), plus larangan peneliti mengubah `distribution_type`. `cron_activate_extends` langkah 2 memakai `airing_window_start/_end` (dulu menimpa jangkar toggle siaran gelombang perpanjangan tiap 15 menit). Diuji di PGlite (13 kelompok kasus + 6 mutan); dua fungsi disalin dari `pg_get_functiondef` produksi 16 Okt (md5 di 1a). ⬜ belum diterapkan — wajib sebelum Push A |
| `120` (egidwis) | **Booking jadwal tidak bisa menulis status lunas.** `create_ad_schedule` memaksa `waiting_payment`/`pending` untuk pemanggil ber-JWT selain service_role; trigger baru `trg_ad_schedules_guard_airing`; `guard_payment_columns` menolak INSERT `form_submissions` berstatus lunas/tayang. ✅ live (dicek 21 Okt). ⚠️ Badannya disalin dari sql/88, jadi **E1 sql/119 (Kilat di `create_ad_schedule`) tertimpa** — penolakan "order Kilat belum bisa dijadwalkan sendiri" hidup lagi; perlu dipulihkan sebelum Push A |
| `121` (egidwis) | **Tulisan JFU Form hanya lewat service_role** (`/api/forms/save`, `/upload`, `/submit`). ✅ live (dicek 21 Okt) |
| `122` | **Mode libur admin + jendela pesan Kilat 3 hari kerja.** `operational_holidays` → `"JFU_operational_holidays"` (WAJIB dikutip; satu baris = satu masa libur, `holiday_date` = tanggal WIB nyala toggle) + kolom `label_en` (≤160, terjemahan otomatis, hibah SELECT eksplisit). Kedua trigger klaim dan RPC okupansi membaca `holiday_date <= gelombang` → Kilat tutup total untuk peneliti selama libur (HINT `kilat_admin_away`; RPC pakai LATERAL supaya baris tidak berganda). `form_submissions.forced_manual_reason` ('admin_away') = Kilat otomatis yang dikirim saat libur jadi jalur manual permanen — tanpa trigger penjaga (alasan di kepala berkas). `kilat_last_bookable_date()` + HINT `kilat_wave_too_far`: peneliti hanya memesan 3 hari kerja mulai hari ini; admin tetap bebas. Diuji di PGlite (41 cek + mutan `=`/tanpa jendela tertangkap; rollback memulihkan md5). Tiga fungsi disalin dari `pg_get_functiondef` produksi 21 Okt (md5 di 1a, dicek ulang di dalam transaksi). ⬜ belum diterapkan — wajib sebelum uji lokal mode libur & Push A |

⚠️ **Predikat "tagihan hidup" hidup di SQL, dan itu disengaja.** `live` di
`schedule_billing_summary()` disalin **verbatim** ke `authoritative_payment_url()`
(`85`) karena Pages Function di-bundle sendiri-sendiri sehingga impor lintas
berkas gagal. Sisi TypeScript (`isLiveInvoice`) mencerminkannya, tidak
menurunkannya ulang. Tiga salinan yang menyimpang menentukan apakah uang
sungguhan menggerakkan jadwal — kalau salah satunya diubah, ubah ketiganya.

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
| `50` | `reward_pools` — kolam hadiah jadi **baris**, bukan agregasi yang dihitung ulang di dua fungsi. Menyimpan hadiah **per pemenang** (total kolam = turunan); `period_batch` NOT NULL, jadi 97 order berhadiah **tanpa** `end_date` sengaja di luar tabel. ⚠️ Rilis A Phase 4: menanam tabel + backfill 900 baris **tanpa** mengalihkan `get_batch_rewards*`/`get_schedule_batch_context` — pengalihan itu wajib serentak, jadi dipisah |
| `51` | `booking_id` + `schedule_id` — identitas yang bisa diucapkan manusia |
| `52` | `form_submissions_extend` jadi VIEW di atas `ad_schedules` |
| `62` | Pembatalan slot oleh admin punya nama sendiri di sumbu tayang |
| `63` | Extra Ad pindah dari ORDER ke JADWAL + aturan tiga lapis **Kilat tidak punya kuota iklan tambahan** (trigger pembersih, CHECK, dan penolakan di RPC) |
| `64` | Perbaikan cermin `survey_pages.is_extra_ad` |
| `60b` → `65` | Email "iklan selesai" — `60b` memasangnya, `65` membuatnya benar-benar terkirim |
| `69` | Sumbu review dibereskan: `cancelled` akhirnya berarti *dibatalkan*, `dismissed_at` untuk *disembunyikan pemiliknya*, dan `review_history` akhirnya punya kolom (sebelumnya setiap penulisannya gagal diam-diam) |
| `70` | `review_status` jadwal ke-2 dst. ikut induknya — penyebabnya `sync_ad_schedule_from_submission()`, bukan view-nya |
| `73` | **Langkah *contract* Task 11**: empat fungsi berhenti membaca view `form_submissions_extend` — `cron_activate_extends`, `get_batch_rewards_bulk`, `get_page_active_period`, `get_schedule_batch_context`. Nol fungsi tersisa yang mengaksesnya, jadi `DROP VIEW` tinggal menunggu sisi kode |
| `74` | RPC `create_ad_schedule()` menggantikan INSERT lewat view. Memikul lima aturan `extend_view_insert()` — terutama **warisan `is_extra_ad` dari ordinal 1**. Wewenangnya LEBIH KETAT dari view yang digantikan: admin/`service_role` saja |
| `75` | Tiga penjaga `extend_view_update()` pindah dari VIEW ke TABEL (`assert_schedule_window_free`, sumbu review ikut induk, `resync_ad_schedule_ordinals`). **Inilah yang membuat `DROP VIEW` aman** — tanpa ini, menggeser tanggal jadwal ke-2 berhenti divalidasi tumpang tindihnya |
| `76` | **Task 11 selesai**: view `form_submissions_extend` dicabut, beserta tiga fungsi trigger `extend_view_insert/update/delete` yang jadi yatim. Sekalian menutup lubang RLS — view itu memberi `authenticated` GRANT tulis penuh lewat trigger `SECURITY DEFINER` yang nol memeriksa kepemilikan. Jalur pemulihan lengkap ada di dalam berkasnya |

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

## Status terap (50–87)

Diverifikasi langsung ke produksi (`zewuzezbmrmpttysjvpg`) dengan memeriksa objek
yang dibuat masing-masing berkas, bukan dari catatan — `51`–`66` pada 2026-08-19,
`61_custom_mission_requests` dan `67`–`72` pada 2026-08-26, `73`–`76` pada 2026-08-30,
`77`–`85` dan `87` pada 2026-09-10.

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
| `73_move_functions_off_extend_view` | 4 fungsi pindah dari view `form_submissions_extend` ke `ad_schedules` | ✅ diterapkan 2026-08-30 — 7 sidik jari identik sebelum/sesudah |
| `74_create_ad_schedule_rpc` | RPC `create_ad_schedule()` — pengganti INSERT lewat view | ✅ diterapkan 2026-08-30 — gerbang non-admin & warisan `is_extra_ad` diuji hidup |
| `75_extend_rules_move_to_table` | penjaga jendela + sumbu review + resync ordinal jadi trigger `ad_schedules` | ✅ diterapkan 2026-08-30 — tumpang tindih terbukti ditolak lewat tulisan langsung |
| `76_drop_extend_view` | view `form_submissions_extend` + 3 fungsi trigger yatim dicabut | ✅ diterapkan 2026-08-30 — `to_regclass` NULL, paritas 1006=1006 utuh, 7 trigger `ad_schedules` lengkap |
| `77_webhook_log_rejections` | outcome penolakan masuk allowlist `doku_webhook_events_outcome_check` | ✅ diverifikasi 2026-09-10 |
| `78_secure_ad_schedules_update_rls` | policy UPDATE `ad_schedules` (admin saja) | ✅ diverifikasi 2026-09-10 — 1 policy UPDATE terdaftar |
| `79_reconcile_extend_schedule_cost` | **migrasi data** — biaya jadwal perpanjangan yang tercatat nol | ✅ diterapkan 2026-09-02 (tidak membuat objek; verifikasinya lewat jumlah baris, bukan `information_schema`) |
| `80_webhook_paid_on_dead_bill` | outcome `paid_on_dead_bill` | ✅ diverifikasi 2026-09-10 |
| `81_expire_zombie_pending_bills` | **migrasi data** — 182 tagihan `pending` yang sudah lewat umur | ✅ diterapkan 2026-09-03 — piutang Rp 18.772.750 → Rp 610.500, nol baris lunas tersentuh |
| `82_stale_recognizes_cancelled_schedule` | `schedule_billing()` mengenal jadwal yang dibatalkan | ✅ diverifikasi 2026-09-10 |
| `83_billing_knows_expiry` | `expires_at` + `is_expired` masuk vonis tagihan | ✅ diverifikasi 2026-09-10 |
| `84_doku_request_id_and_cancellation` | `invoices.doku_request_id`, `invoices.doku_cancelled_at` | ✅ diverifikasi 2026-09-10 — kedua kolom ada |
| `85_stale_bill_and_authoritative_url` | `authoritative_payment_url()` + outcome `paid_on_stale_bill` | ✅ diterapkan 2026-09-08 — sepakat 100% dengan `schedule_billing_summary()` di ±1.060 jadwal, nol selisih |
| `85_add_ai_prescreening_to_submissions` | `form_submissions.ai_prescreening` (JSONB) | ✅ diterapkan 2026-09-10 — lihat tabrakan nomor `85` di atas |
| `50_reward_pools` | tabel `reward_pools` + backfill 900 baris | ✅ diterapkan 2026-09-11 — **900 baris**, nol order tak bertanggal bocor, 2 policy, 4 constraint, **nol selisih** dengan `get_batch_rewards` di seluruh 900 pool; ACL `postgres \| authenticated \| service_role` — **`anon` tercabut**. ⚠️ Fungsi hadiah **belum** dialihkan ke tabel ini (disengaja, lihat kepala berkas) |
| `86_create_ad_schedule_self_serve` | `create_ad_schedule()` melebar ke pemilik order + `assert_daily_ad_quota_free()` | ⬜ **ditulis 2026-09-11, BELUM diterapkan** — plpgsql terbukti parse (blok `DO`); penjaga kuota MENOLAK 12 Sep (4/4), MELOLOSKAN 20 Sep (0/4) |
| `87_bill_cancelled_reason_and_cancel_error` | `reason = 'bill_cancelled'` + `invoices.doku_cancel_last_error` | ✅ diterapkan 2026-09-10 — `bill_cancelled` mendarat tepat 2 jadwal (`ZS4ZNN96`, `MM36J2EW`), `expired` 114 → 112, sisanya nol bergeser; `live` masih sepakat 100% dengan `schedule_billing_summary()` (nol selisih); ACL `postgres \| authenticated \| service_role` — **`anon` tercabut** |

⚠️ **`79` dan `81` tidak membuat objek apa pun.** Keduanya migrasi data, jadi
"ada di produksi" tidak bisa dijawab lewat `information_schema` seperti baris
lain di tabel ini — yang tercatat di kolom kanan adalah **hasil ukurnya saat
dijalankan**. Menjalankan ulang keduanya aman (idempoten lewat penyaringan nilai
lama yang diharapkan), tapi tidak akan menghasilkan apa-apa.

⚠️ **`doku_cancelled_at` masih 0 baris seumur hidup** (per 2026-09-10). Kolomnya
ada sejak `84`, tapi Cancel Order API DOKU **belum pernah sekali pun terbukti
berhasil** — tiga percobaan pertama batal karena sebab di luar API-nya. Jangan
membaca keberadaan kolomnya sebagai bukti bahwa pencabutan link bekerja; yang
menutup kasusnya adalah resolver `/bayar/<id>` (`85`), yang tidak bergantung
padanya sama sekali.

⚠️ **Kenapa ia masih 0 baris belum pernah bisa dijawab** — dan `87` yang
membukanya. Sampai migrasi itu, jawaban DOKU atas setiap penolakan dibuang di
tempat (`console.error` di sebuah Pages Function, yang tidak punya
Observability), jadi "DOKU menolak karena pesanannya sudah lunas", "tanda
tangannya salah", dan "`request_id` tidak dikenal" — tiga sebab dengan tiga
tindakan berbeda — sampai ke admin sebagai satu kalimat kabur yang sama.
`87` sudah diterapkan (2026-09-10), jadi mulailah dari:

```sql
select payment_id, doku_cancel_last_error
  from invoices
 where doku_cancel_last_error is not null
 order by created_at desc limit 10;
```

Berkas di bawah 51 tidak dicatat statusnya satu per satu: aplikasi tidak akan
berjalan tanpanya, jadi keberadaannya sudah terbukti setiap hari. Kalau ragu,
periksa objeknya di `information_schema` — jangan berasumsi dari nomor.
