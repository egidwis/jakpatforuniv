# Task 11 — `ad_schedules` jadi otoritatif, `form_submissions_extend` pensiun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ⬜ BELUM DIMULAI — TERKUNCI PRASYARAT
> Disetujui pemilik produk 2026-08-08. **Jangan mulai sebelum Phase 3 mendarat di `main`
> dan dideploy** — lihat §"Prasyarat sebelum mulai" di bawah. Status berjalan selalu di
> [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md).
>
> **Diperbarui 2026-08-08 sore.** Tiga prasyarat sudah lunas (Page Calendar pensiun,
> Task 9 selesai, copy Task 12 selesai) dan itu **menyusutkan dua langkah rencana ini** —
> langkah 3 kehilangan dua pemanggil frontend, langkah 5 tinggal identifier kode.
> Yang mengunci sekarang tinggal **merge + deploy**, bukan lagi pekerjaan kode.
>
> Ini rilis yang menyentuh **jalur uang** (webhook DOKU, cron tiap 15 menit). Ia sengaja
> tidak digabung dengan revamp visual di `feat/dashboard-soft-dna-navbar`.

Baseline gate: **74** error (`./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`).
Branch: **baru**, dari `main` sesudah Phase 3 mendarat — bukan `feat/dashboard-soft-dna-navbar`.

## Context

Konsep "jadwal iklan baru" dan "extend duration" hari ini bertabrakan karena modelnya
memang dua: jadwal pertama hidup di kolom `form_submissions`, jadwal ke-2 dst. di tabel
`form_submissions_extend`. Selama dua tabel itu ada, istilah "extend" tidak bisa dihapus —
ia bukan sekadar pilihan kata, ia nama tabelnya.

Rencana ini menyatukannya: **satu order punya banyak jadwal, tiap jadwal punya kode sendiri
dan pembayarannya sendiri, tapi tetap satu halaman iklan.**

```
form_submissions          ORDER — peneliti, judul, survey_url, sumbu review
      │ 1
      │ N
ad_schedules              JADWAL — booking_id, tanggal, biaya, sumbu tayang
      │ 1
      │ N
transactions / invoices   PEMBAYARAN — schedule_id

form_submissions ──1:1── survey_pages
```

Fondasinya sudah berdiri: `ad_schedules` lengkap dan terverifikasi (983 baris, dua sumbu
terpisah sejak `sql/46`, Kilat dikenali sejak `sql/45`), dan sudah punya dua pembaca (papan
Schedule + kartu jadwal di drawer). Yang tersisa adalah membalik arahnya.

### Empat keputusan (pemilik produk, 2026-08-08)

| | |
|---|---|
| Urutan rilis | **Rilis sendiri, sesudah Phase 3 mendarat.** Ini jalur uang — webhook DOKU, cron tiap 15 menit, 2 jadwal sedang menunggu bayar. Kalau digabung ke revamp visual, regresi pembayaran akan tersamar di antara ratusan perubahan tampilan |
| `booking_id` | **Kode baru, opaque, abadi.** Tidak diturunkan dari apa pun |
| Cara pindah | **Tabel jadi VIEW + `INSTEAD OF` trigger.** Seluruh pemanggil lama tetap jalan tanpa disentuh |
| Kolom jadwal di `form_submissions` | **Deprecated, tetap disinkronkan.** Tidak di-drop di rilis ini |

---

## Temuan yang membentuk rencana ini

**A. "Booking ID" SUDAH ADA dan sudah dilihat peneliti.**
[`SchedulePhase.tsx:543`](../../../multi-step-form/src/components/status/SchedulePhase.tsx#L543)
menampilkan `#` + 8 hex pertama dari UUID baris (`card.info.id`), lengkap dengan tombol
salin dan terjemahan dua bahasa (`copyOrderId`, `orderIdCopied`). Jadi ini **bukan
identifier baru** — ia menggantikan UUID terpotong yang sudah beredar di WhatsApp dan email.

Dua konsekuensi: bentuk tampilnya sebaiknya **tetap `#XXXXXXXX`** supaya peneliti tidak
merasa sistemnya berganti; dan UUID lama **harus tetap bisa dicari**, karena dukungan akan
menerima kutipan kode lama selama berbulan-bulan.

**B. Halaman iklan itu jendela yang BERPINDAH, bukan milik satu jadwal.**
`cron_activate_extends()` langkah 2 ([`sql/36:63-73`](../../../multi-step-form/sql/36_open_banner_gate.sql#L63))
menimpa `publish_start_date`/`publish_end_date`/`current_period_batch` di `survey_pages`
dengan tanggal jadwal yang **sedang tayang**, tiap 15 menit. Itulah sebabnya "1 halaman, N
jadwal" bisa bekerja. Perilaku ini wajib bertahan utuh.

**C. `survey_pages.submission_id` TIDAK unik — tapi datanya bersih.** Hanya `slug` yang
unik. Terukur: 276 halaman iklan, **0** submission punya lebih dari satu, maksimum 1. Jadi
`UNIQUE` bisa ditambahkan sekarang tanpa membersihkan apa pun.

**D. "N pembayaran per jadwal" sudah nyata, cuma belum terekspresikan.** 416 jadwal punya
tepat satu transaksi, **76 punya lebih dari satu** (percobaan bayar berulang; satu bahkan
29). Model yang diusulkan tidak menambah kemampuan baru di sini — ia menamai yang sudah ada.

**E. Endpoint publik bergantung lewat satu fungsi.** `/api/surveys` dan `/api/respondents`
tidak lagi membaca `form_submissions_extend` langsung (dihapus 8B-1), tapi keduanya
memanggil `get_batch_rewards_bulk` — dan fungsi itu membacanya. Bentuk keluaran kedua
endpoint **dibekukan kontrak pihak ketiga**, jadi fungsi itu masuk daftar uji wajib.

**F. Yang menempel di tabel itu, terhitung 2026-08-08.**

| | |
|---|---|
| Berkas aplikasi | 5 — `ExtendSection`, `PageBuilderModal`, `SchedulingPage`, `supabase.ts`, `storage-cleanup.js` |
| Webhook DOKU | `webhook.js:497`, `:516` |
| Fungsi DB | 8 — termasuk `cron_activate_extends`, `assert_no_schedule_overlap`, `get_batch_rewards_bulk`, `get_page_active_period` |
| Trigger DI tabel itu | 4 — `trg_ad_schedule_from_extend`, `trg_extend_no_overlap`, `trg_extend_period_batch`, `trg_guard_extend_payment_columns` |
| FK menunjuk ke sana | 2 — `invoices.extend_id`, `transactions.extend_id` |
| Cron aktif | `activate-extends`, tiap 15 menit |
| Baris | 12, **2 masih berjalan/akan datang, 2 menunggu pembayaran** |

---

## Langkah 1 — `sql/48`: aditif, nol perubahan perilaku

⚠️ `sql/47` **sudah diklaim** `reward_pools` (8B-2, prasyarat Phase 4). Mulai dari 48.

Seluruh isi langkah ini bisa dijalankan hari ini tanpa menyentuh satu pun alur lama.
Kalau rilis ini batal di tengah jalan, tidak ada yang perlu dibatalkan.

### 1a. `ad_schedules.booking_id`

```
kolom   booking_id TEXT NOT NULL UNIQUE
bentuk  8 karakter, alfabet 23456789ABCDEFGHJKMNPQRSTVWXYZ
tampil  #K3M9PQ7T   ← bentuk sama persis dengan yang dilihat peneliti hari ini
```

Alfabetnya membuang `0 O 1 I L U` — karakter yang tertukar saat dibacakan lewat telepon
atau disalin ulang dari tangkapan layar. 30⁸ ≈ 6,5×10¹¹; dengan laju ~17 order/hari,
peluang tabrakan tetap dapat diabaikan sepuluh tahun ke depan, dan `UNIQUE` + loop coba-lagi
menutup sisanya.

⚠️ **JANGAN turunkan dari `ordinal`.** `resync_ad_schedule_ordinals()`
([`sql/41` bagian 3](../../../multi-step-form/sql/41_ad_schedules.sql)) **menomori ulang** begitu
sebuah jadwal disisipkan dengan tanggal lebih awal. Kode turunan ordinal akan berpindah ke
jadwal lain diam-diam — dan yang berpindah adalah kode yang sudah dikutip peneliti.

Diisi lewat trigger `BEFORE INSERT` kalau NULL, lalu backfill 983 baris yang ada. Sekali
diberikan, **tidak pernah dihitung ulang**.

### 1b. `schedule_id` di `transactions` dan `invoices`

Kolom baru + FK ke `ad_schedules(id)`, di-backfill dari bentuk lama:

```
entity_type = 'extend'      → schedule_id = ad_schedules WHERE source_id = extend_id
entity_type = 'submission'  → schedule_id = ad_schedules WHERE source_id = form_submission_id
                                              AND source_table = 'form_submissions'
```

Kolom `extend_id`/`entity_type` **tidak** dibuang — pembaca lama masih memakainya, dan
`webhook.js` bercabang di atasnya. Keduanya baru pensiun setelah pemanggilnya pindah.

Ini juga **prasyarat langkah 2**: FK tidak bisa menunjuk ke view, jadi `schedule_id` harus
sudah berdiri sebelum `invoices_extend_id_fkey`/`transactions_extend_id_fkey` dilepas.

### 1c. `UNIQUE (submission_id)` di `survey_pages`

Partial unique — `WHERE submission_id IS NOT NULL`, karena 16 halaman announcement memang
tidak punya submission. Data sudah bersih (temuan C), jadi ini murni mengunci aturan yang
sudah dipatuhi.

### Verifikasi langkah 1

- [ ] `COUNT(DISTINCT booking_id) = COUNT(*)` di `ad_schedules`; nol NULL
- [ ] Nol `booking_id` mengandung `0 O 1 I L U`
- [ ] Setiap transaksi/invoice yang punya `extend_id` dapat `schedule_id`; nol yatim
- [ ] `schedule_id` NULL hanya pada baris yang jadwalnya memang tidak ada di cermin —
      hitung dan catat angkanya, jangan diasumsikan nol
- [ ] Gate tetap 74; nol perubahan frontend di langkah ini

---

## Langkah 2 — `sql/49`: tabel jadi view, `ad_schedules` jadi otoritatif

Inti rilis ini, dan satu-satunya langkah yang tidak reversibel dengan mudah.
**Jalankan sendiri, jangan dibundel dengan perubahan lain.**

### Urutannya

1. **Snapshot** — `CREATE TABLE form_submissions_extend_legacy AS SELECT * FROM form_submissions_extend`.
   Ini jaring pengaman, bukan formalitas: 12 baris, gratis, dan satu-satunya jalan pulang.
2. **Lepas 2 FK lama** (`invoices_extend_id_fkey`, `transactions_extend_id_fkey`).
   Kolomnya tetap; hanya constraint-nya yang dilepas, karena FK tidak boleh menunjuk view.
3. **Pindahkan 4 trigger** dari tabel lama ke `ad_schedules` — ini yang paling mudah
   terlewat, dan tiap satu yang tertinggal adalah penjaga yang hilang diam-diam:
   | Trigger lama | Nasib |
   |---|---|
   | `trg_ad_schedule_from_extend` | **dibuang** — datanya sudah *di* `ad_schedules`, tidak ada lagi yang perlu dicerminkan |
   | `trg_extend_no_overlap` | **pindah** ke `ad_schedules`; `assert_no_schedule_overlap` disesuaikan agar membaca satu tabel |
   | `trg_extend_period_batch` | **pindah** ke `ad_schedules` |
   | `trg_guard_extend_payment_columns` | **pindah** ke `ad_schedules`. ⚠️ Ini penjaga kolom uang (`sql/33`). Trigger biasa tidak menyala lewat view — kalau tidak dipindahkan, `INSTEAD OF` trigger jadi jalan pintas yang melewatinya |
4. **`DROP TABLE form_submissions_extend`**, lalu buat ulang sebagai view:
   ```sql
   CREATE VIEW form_submissions_extend AS
   SELECT source_id AS id, submission_id, start_date, end_date, duration,
          status AS submission_status, payment_status, ...
   FROM ad_schedules
   WHERE source_table = 'form_submissions_extend';
   ```
   ⚠️ `source_id AS id` **wajib** — nilainya harus tetap sama persis dengan id lama, karena
   `invoices.extend_id` dan `transactions.extend_id` masih memuatnya.
5. **`INSTEAD OF INSERT/UPDATE/DELETE`** di atas view, menulis ke `ad_schedules`.
   INSERT membangkitkan `source_id` baru dan `source_table='form_submissions_extend'`,
   memanggil `resync_ad_schedule_ordinals()`, dan mengembalikan `id` = `source_id`.

Sesudah ini **seluruh 5 berkas aplikasi, webhook DOKU, cron, dan 8 fungsi DB tetap jalan
tanpa satu baris pun diubah.** Itulah gunanya view.

### Verifikasi langkah 2 — jalankan SEBELUM dan SESUDAH, adu hasilnya

- [ ] `SELECT * FROM form_submissions_extend ORDER BY id` — md5 atas hasilnya **identik**
      sebelum & sesudah (pola sidik waktu `sql/46`: `EXTRACT(EPOCH …)`, bukan `::text`)
- [ ] `SELECT cron_activate_extends();` bersih, dan **2 jadwal yang sedang berjalan tidak
      berubah statusnya**
- [ ] `get_batch_rewards_bulk` — bandingkan `pg_get_function_result` **dan** keluaran nyata
      untuk survei yang sama, field demi field. Ini kontrak pihak ketiga
- [ ] `/api/surveys` dan `/api/respondents` — respons identik untuk survei yang sama
- [ ] INSERT lewat view (alur "Jadwal Iklan Baru" di drawer) → baris lahir di
      `ad_schedules`, `ordinal` benar, `booking_id` terbit, `trg_extend_no_overlap` menolak
      rentang beririsan
- [ ] UPDATE lewat view menyentuh kolom uang → **ditolak** penjaga yang dipindahkan
- [ ] Bayar ujung ke ujung lewat DOKU sandbox untuk satu jadwal ke-2 → `payment_status`
      berubah, halaman iklan berpindah ke jendela itu
- [ ] `storage-cleanup.js` jalan tanpa error

---

## Langkah 3 — pindahkan pemanggil, satu per satu

Tanpa tenggat, tanpa risiko: view menahan semuanya. Urut dari yang paling jauh dari uang.

1. ~~`SchedulingPage.tsx:478`~~ — **sudah hilang**, berkasnya dihapus `824890f`
2. ~~`supabase.ts` — pembaca jadwal pindah ke `fetchAdSchedules()`~~ — **sudah**, Task 9B.
   `fetchAdSchedules()` kini melayani tiga permukaan (papan admin, drawer, dashboard
   peneliti) dan menerima satu id maupun daftar id. `getExtendsBySubmissionIds` tinggal
   dipakai `ExtendSection.tsx` saja
3. `PageBuilderModal.tsx`
4. `storage-cleanup.js`
5. `get_page_active_period`, `assert_no_schedule_overlap`, `get_batch_rewards_bulk` (SQL)
6. `webhook.js` — **terakhir**, dan hanya setelah semua yang lain stabil. Dibuat toleran
   dua bentuk (`entity_type` lama & `schedule_id` baru) sebelum bentuk lama dicabut
7. `ExtendSection.tsx` — ditulis ulang jadi `NewSchedulePanel` (lihat langkah 5)

---

## Langkah 4 — "Tandai Lunas" jadi per jadwal (inti Task 10)

Sekarang bisa jujur, dan **buktinya sudah ada**: `invoices`/`transactions` punya
`extend_id` + `entity_type` yang terisi rapi (394 & 627 baris, `entity_type` konsisten
100%), dan sejak langkah 1b ada `schedule_id` yang eksplisit.

`updatePaymentStatus` ([`supabase.ts:679`](../../../multi-step-form/src/utils/supabase.ts#L679))
sekarang menyaring `form_submission_id` saja — jadi ia melunasi **seluruh** invoice order,
termasuk milik jadwal lain. Dipersempit jadi per `schedule_id`, lalu tombolnya pindah ke
dalam kartu jadwal, menggantikan peringatan sementara yang dipasang di Phase 3.

⚠️ Ini **footgun uang**: begitu kartu terlihat setara, admin akan mengira tombolnya
per-jadwal. Ubah tombol dan tampilan kartu **dalam commit yang sama**.

---

## Langkah 5 — istilah: sisa "extend" di IDENTIFIER (Task 12 babak dua)

**Menyusut sejak 2026-08-08.** Seluruh copy yang dibaca manusia sudah bersih
(`e91f52f`) — di layar peneliti maupun admin tidak ada lagi kata "perpanjangan"
atau "extension". Yang tertinggal justru yang memang harus menunggu file ini:
nama-nama yang menurunkan namanya dari **nama tabel**.

| Sekarang | Jadi | Kenapa harus menunggu |
|---|---|---|
| `ExtendSection.tsx` | `NewSchedulePanel.tsx` | — |
| `FormSubmissionExtend` | `AdSchedule` | ⚠️ nama `AdScheduleEntry` **sudah dipakai** untuk baris cermin. Putuskan dulu: keduanya menyatu jadi satu tipe (paling mungkin, karena sesudah langkah 2 mereka memang satu tabel), atau yang lama dapat nama lain |
| `entity_type = 'extend'` | aman diganti, internal | pembacanya `webhook.js` — pindahkan setelah langkah 3 no. 6 |
| tombol/panel `Extend` di admin | **`+ Jadwal Iklan Baru`** | tinggal label komponen, copy-nya sudah netral |

**Batas: berhenti di API.** Nama field publik (`period_batch`, `prize_per_winner`,
`winner_count`, `jakpat_id`, …) **tidak** ikut diganti — Global Constraints rencana
Phase 2. `AdScheduleEntry.periodBatch` sudah mengikuti aturan ini.

⚠️ Satu yang menyeberang ke luar: `ExtendSection.tsx:350,380` menulis nama item invoice
`'Extend Iklan (ads)'`, dan itu **terkirim ke DOKU serta tersimpan di riwayat transaksi**.
Menggantinya membuat invoice lama dan baru berbeda istilah — wajar, tapi **beri tahu
finance lebih dulu** supaya tidak dikira dua produk.

---

## Di luar cakupan

- **Membuang kolom jadwal dari `form_submissions`.** Ditandai deprecated lewat
  `COMMENT ON COLUMN` dan tetap disinkronkan. `duration` dan `total_cost` bahkan `NOT NULL`,
  jadi setiap penulis submission harus diperbaiki lebih dulu. Rilis tersendiri.
- **Membalik arah cermin untuk jadwal #1.** Sesudah rilis ini `ad_schedules` otoritatif untuk
  jadwal ke-2 dst.; jadwal #1 masih dicerminkan dari `form_submissions`. Konsekuensi yang
  diterima sadar: jadwal BARU selalu mendarat di `ad_schedules`, jadwal pertama belum.
- **`DROP VIEW form_submissions_extend`** — baru setelah langkah 3 selesai dan satu siklus
  rilis lewat tanpa keluhan.
- **Perpanjangan untuk order Kilat** — masih ditutup; butuh pemilih gelombang, bukan rentang hari.
- **Perombakan halaman Pages** — task terpisah yang sudah tercatat.

## Prasyarat sebelum mulai

- [x] **Page Calendar dipensiunkan** — `824890f` (2026-08-08). ⚠️ Prop `paymentStatus`
      di `PageBuilderModal` **tidak** dipindahkan: ia sekarang tidak punya pemanggil
      sama sekali, jadi `isUnpaid` selalu `false` dan ketiga penjaganya diam. Kalau
      Task 11 menyambungkannya lagi, turunkan dari `deriveLifecycle().isPaid` —
      **jangan** dari `form_submissions.payment_status` mentah (jebakan no. 3).
- [x] **Task 9 selesai** — `sql/46` + `433153c`. Menyusutkan langkah 3 rencana ini:
      pembaca `deriveOrderUiState`/`airingPeriods` sudah pindah, dan
      `components/ProgressTracker.tsx` sudah dihapus.
- [x] **Task 12 separuh selesai** — `e91f52f`. Langkah 5 di bawah menyusut jadi
      **identifier kode saja**; seluruh copy yang dibaca manusia sudah bersih.
- [ ] Adu visual papan Schedule di browser (butuh mata manusia)
- [ ] `SELECT cron_activate_extends();` dijalankan dengan pengawasan
- [ ] Branch `feat/dashboard-soft-dna-navbar` di-merge ke `main` dan **dideploy**
- [ ] Branch baru dari `main`

## Setelah selesai

Perbarui [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md): model relasional
final, `booking_id` sebagai identifier resmi yang dikutip peneliti, dan — di §"Jebakan" —
**`booking_id` tidak boleh diturunkan dari `ordinal` karena ordinal dinomori ulang**.
Tandai Task 10, 11, 12 di rencana Phase 2 sesuai yang benar-benar dikerjakan.
