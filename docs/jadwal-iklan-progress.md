# Jadwal Iklan — Status Berjalan

> **Titik masuk untuk pekerjaan Jadwal Iklan.** Baca ini dulu sebelum membuka
> rencana mana pun. Diperbarui 2026-08-18.
>
> ✅ **Rilis Soft DNA sudah tayang (2026-08-18).** Penahanan 2026-08-09 dicabut,
> `feat/dashboard-soft-dna-navbar` di-merge (`f217d58`), dipush, dan dideploy.
> Endpoint `/api/notify-ad-live` **terbukti tayang** — probe POST tanpa kunci
> membalas `401` (gerbang menolak), bukan `405` (route hilang) seperti 10 Agustus.
>
> 🔴 **SATU LANGKAH RILIS MASIH TERTINGGAL — cron notifikasi belum dijadwalkan.**
> Diverifikasi 2026-08-18 17.15 WIB: `cron.job` masih hanya berisi
> `activate-extends`. Kodenya sudah tayang, tapi tidak ada yang memanggilnya.
> **4 order sedang tayang tanpa email**, tiga di antaranya mulai hari ini pukul
> 15.00. Perintah menghidupkannya ada di §00A — jalankan, lalu buktikan lewat
> `net._http_response`.

**Tujuan besar:** satu baris = satu jendela tayang, **termasuk jadwal pertama**.
Sekarang jadwal pertama hidup di `form_submissions` dan jadwal ke-2 dst. di
`form_submissions_extend` — dua tabel dengan tipe waktu, kosakata status, dan
aturan waktu berbeda. Itu akar bersama dari bug-bug yang selama ini ditambal
sendiri-sendiri. Setelah `ad_schedules` jadi satu-satunya sumber, admin dan user
membaca baris yang sama.

---

## Ringkasan cepat

| Fase | Isi | DB | Frontend |
|---|---|---|---|
| Phase 0 | Cabut gerbang banner, hitung perpanjangan di kuota slot, larang jadwal tumpang tindih | ✅ `sql/36`–`39` | ✅ deployed 2026-08-04 |
| Phase 1 | Auto-create + auto-publish halaman iklan dengan banner default | ✅ `sql/40` (+ `sql/42`: Kilat dikecualikan) | ✅ deployed 2026-08-04 |
| Kilat | Jembatan admin iklan→Kilat + slot 08/11/14/17 WIB hari kerja | ✅ `sql/42` | ✅ deployed 2026-08-04 |
| Kilat — papan jadwal | Toggle Iklan/Kilat di Ads Schedule + tutup lubang Create Page utk Kilat | — | ✅ deployed 2026-08-05 (`a4fc499`+`b78a7aa`) |
| Phase 1B | Pemberitahuan weekend/hari libur di jalur review manual | — | ⬜ backlog, tidak memblokir |
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | 🟡 Task 8 ✅ · 8B-1 ✅ · 8C ✅ · 8D ✅ · **9A ✅ `sql/46`** | 🟡 **9B ✅ · 12 ✅ (copy)** — sisa Task 10 & 11 |
| **Phase 3** | **Papan "Schedule" di dashboard admin** | ✅ `sql/46` | 🟡 **papan sudah jalan**; sisa: adu visual dengan Page Calendar lalu pensiunkan yang lama |
| Phase 4 | Tombol "Jadwalkan Iklan Lagi" aktif di dashboard user | ⬜ | ⬜ **sesudah Task 13** (pemilik produk 2026-08-18 — §00G). Prasyarat: `reward_pools` (8B-2, **`sql/50`** — `46` dipakai Task 9A, `47`/`48` dipakai order-flow reorder, `49` dipakai perbaikan jam tayang kustom, semua 2026-08-10) **dan harga per jadwal dari Task 13** |

🔴 **DB SEDANG MENDAHULUI KODE — dan salah satunya membakar email tiap 15 menit.**
Baca §00A sebelum melakukan apa pun. `sql/47` dan `sql/48` **sudah diterapkan ke
produksi 2026-08-10**, tapi kode yang menemaninya masih tertahan di branch. Ini
persis keadaan yang dokumen ini sebut "paling rawan di seluruh papan" (§Task 8C),
dan kali ini ia **tidak diam** — cron `notify-primary-ads-live` menandai order
sebagai "sudah dinotifikasi" padahal endpoint-nya belum ada, jadi setiap order
yang mulai tayang sebelum deploy kehilangan emailnya secara permanen.

**Kalau kamu kembali setelah lama:** per 2026-08-05 `main` sudah di-deploy dan
DB serta kode sempat sejajar — tidak ada lubang di deret `sql/`. Yang tayang
memuat Phase 0/1, jembatan + papan jadwal Kilat, Task 8B-1, 8C, dan 8D.
**Kesejajaran itu putus lagi 2026-08-10** oleh `sql/47`+`48` (lihat §00A).

Sisa Phase 2 tinggal **Task 9–12**, dan sejak 2026-08-05 sore semuanya **sudah
bisa jalan**: `feat/dashboard-soft-dna-navbar` sudah menarik `main`, jadi branch
itu tidak lagi menahan apa pun. Pekerjaan Task 9–12 dan Phase 3 berlangsung DI
branch itu. Lihat §2.

⚠️ **`sql/40` dan `sql/42` mendefinisikan `ensure_survey_page()` yang sama.**
`sql/42` versinya yang benar (order Kilat tidak dapat halaman iklan). Kalau
`sql/40` dijalankan ulang kapan pun, jalankan `sql/42` lagi sesudahnya.

---

## Yang menunggu tindakan

### 00-slot. ✅ Kontrol pelepasan slot kembali ke admin (2026-08-10) — belum diuji di browser

**Nol migrasi SQL. Seluruhnya frontend**, jadi ia tidak menambah lubang DB-mendahului-kode.

**Yang ditemukan.** Tidak ada cron, edge function, maupun worker yang melepas slot —
tidak pernah ada. Aturan "hanya reservasi mandiri (`slot_booked_by = 'user'`) yang lepas
karena waktu" sudah dijaga di **tujuh** tempat (`holdsSlot`, `deriveLifecycle`,
`deriveOrderUiState`, `isExpiredHold`, `PaymentRetryPage`, `CampaignActions`,
`create-payment.js`). Yang **tidak** menjaganya cuma `PaymentCheckoutPage` — dan justru
halaman itu satu-satunya pemanggil `releaseExpiredSlot()`. Ia bocor dua kali: cutoff 14.00
ikut masuk `Math.min` sebagai tenggat pelepasan, dan cabang `else` menghapus SEKETIKA
setiap baris yang `slot_reserved_at`-nya NULL.

Terukur di produksi tepat sebelum perbaikan:

| Populasi | Jml |
|---|---|
| Jadwal **admin** belum lunas, hold 1 jam sudah lewat | **35** (6 tayang 10–13 Agu) |
| Baris tanpa `slot_booked_by` **dan** `slot_reserved_at` | **264** (35 punya transaksi pending) |
| Jadwal **user** belum lunas — yang aturan 1 jam memang untuk mereka | **3** |
| Kerusakan yang sudah terjadi sejak April | **9** (7 tanggal terhapus, **4 terdampar**) |
| Antrean "perlu ditagih" | **17** — dan **12 di antaranya bertanggal Maret–Juni** |

**Yang berubah.**

- [`utils/slotHold.ts`](../multi-step-form/src/utils/slotHold.ts) baru — satu tempat untuk
  aturan umur reservasi, dengan 12 uji. Batas 14.00 WIB **sengaja tidak** tinggal di sana:
  ia tidak melepas slot, ia hanya membuat tanggalnya tidak terkejar (niat yang sudah
  tertulis di `status/airingPeriods.ts` dan dulu dilanggar di `PaymentCheckoutPage`).
- `PaymentCheckoutPage` — jadwal admin tidak lagi punya hitung mundur maupun pelepasan;
  layar "batas bayar lewat" tetap **membuka pembayaran**, karena order seperti itu memang
  ditagih manual lalu dijadwalkan ulang. Sekalian ditutup: `payment_status = 'expired'`
  kini dikenali sesudah reload (`releaseExpiredSlot` mengosongkan `slot_booked_by`, jadi
  aturan hold sendirian akan bilang "tidak pernah lepas" untuk baris yang sudah lepas),
  dan `expiredAt` ke DOKU tidak lagi bisa jadi `Invalid Date`.
- `releaseScheduleSlot()` — pelepasan berlingkup **satu jadwal**, semua ordinal, transaksi
  pending disaring per jadwal. Dipakai aksi **"Hapus dari list"**.
- Badge **"perlu ditagih"** di kartu jadwal + pil papan Schedule berganti nama dari "lewat
  batas bayar". Baris antrean diurut **terbaru di atas** — tanpa itu, 12 tunggakan
  Maret–Juni mengubur 4 baris yang benar-benar bisa ditagih.

⚠️ **Ini fondasi Task 13 Langkah 3, dan dokumen Task 13 sudah dikoreksi** — langkah itu kini
**menggantikan** `releaseScheduleSlot`, bukan menulis fungsi kedua di sebelahnya. Yang
tersisa di sana: tukar penautan ke `schedule_id`, dan pertahankan tanggal alih-alih
mengosongkannya (keduanya butuh Task 11).

**Belum dikerjakan:** uji manual di browser (urutannya di rencana), dan keputusan atas **4
order terdampar** peninggalan kerusakan lama — sengaja tidak dipulihkan otomatis.

### 00A. 🟡 Cron notifikasi direm sejak 2026-08-10 — hidupkan lagi SESUDAH deploy

> **Keadaan per 2026-08-18 17.15 WIB — SESUDAH deploy (diverifikasi langsung
> ke produksi):**
>
> - ✅ **Endpoint sudah tayang.** POST tanpa kunci ke
>   `https://submit.jakpatforuniv.com/api/notify-ad-live` membalas **401**
>   (gerbang rahasia menolak) — bukan lagi **405** seperti 10 Agustus. Probe ini
>   aman diulang kapan saja: gerbangnya berjalan sebelum apa pun, jadi tidak ada
>   email terkirim dan tidak ada baris tersentuh.
> - 🔴 **Rem cron MASIH terpasang.** `cron.job` tetap hanya memuat
>   `activate-extends`. Setengah rilis: yang mengerjakan sudah ada, yang
>   memanggil belum. **Ini satu-satunya langkah rilis yang belum dikerjakan.**
> - **4 order sedang tayang dengan `live_notified_at IS NULL`** — `72ec157b`
>   (15–22 Agu), `f6b905d1`, `77790fe4`, `234b70ad` (tiga terakhir mulai
>   **hari ini 15.00**). Keempatnya dikirimi email pada cron pertama setelah rem
>   dilepas. Empat email berangkat sekaligus; itu wajar, bukan tanda kebocoran.
> - ⚠️ **Opsi B di bawah sudah menjadi no-op — jangan berharap apa pun darinya.**
>   Ketiga order yang terbakar 10 Agustus (`0cdd8ab4` 8–11 Agu, `f9b73a58` dan
>   `8b7bd9c1` keduanya 9–10 Agu) **jendela tayangnya sudah lewat**, dan guard
>   fungsinya mensyaratkan `airing_instant_of_date(end_date) > now()`. Mengosongkan
>   `live_notified_at` mereka tidak akan menghasilkan email apa pun. Ketiga email
>   itu hilang permanen; kalau perlu, susulkan manual di luar sistem.
>
> Syarat urutannya — deploy dulu, baru jadwalkan — **sudah terpenuhi**: deploy
> selesai dan terbukti. Menjadwalkan sekarang aman.

**Ditemukan 2026-08-10 saat audit pra-merge.** Riwayat lengkapnya dipertahankan di
bawah karena pelajarannya masih berlaku untuk migrasi berikutnya.

`sql/48` menjadwalkan cron `notify-primary-ads-live` tiap 15 menit. Fungsinya
mem-`POST` ke `https://submit.jakpatforuniv.com/api/notify-ad-live` lewat pg_net,
lalu **langsung** menyetel `live_notified_at = now()` — tanpa menunggu respons,
karena pg_net async (ini memang desainnya, tertulis di kepala `sql/48`).

Masalahnya: **endpoint itu belum ada di produksi.** `functions/api/notify-ad-live.js`
lahir di commit `e7584b4` dan masih tertahan di branch. Terukur di
`net._http_response`:

| Waktu | Request | Status |
|---|---|---|
| 2026-08-10 02:15 UTC (09.15 WIB) | 3 POST | **405** ×3 |

`405 Method Not Allowed` = Cloudflare Pages tidak punya route itu. Nol email
terkirim. Tapi ketiga ordernya sudah ditandai `live_notified_at`, dan guard
fungsinya adalah `live_notified_at is null` — jadi **ketiga order itu tidak akan
pernah dikirimi email itu lagi**, deploy atau tidak:

- `0cdd8ab4-…` "booked by Alanda" (8–11 Agu)
- `f9b73a58-…` "JAK2693 Survey Wisata di Tempat Pasca Bencana - Model #3" (9–10 Agu)
- `8b7bd9c1-…` "Personalisasi Berbasis AI dalam Layanan Pariwisata…" (9–10 Agu)

**Dan ia masih memakan.** Dua order berikutnya mulai tayang **hari ini 2026-08-10
pukul 15.00 WIB** (`8462698a-…`, `2a0db0c3-…`), keduanya masih `live_notified_at
IS NULL`. Mereka akan ikut terbakar pada cron pertama setelah 08.00 UTC.

**Pilih satu, sekarang:**

```sql
-- A. Kalau deploy TIDAK terjadi sebelum 15.00 WIB hari ini — rem dulu:
select cron.unschedule('notify-primary-ads-live');
-- lalu setelah deploy:
select cron.schedule('notify-primary-ads-live', '*/15 * * * *',
                     $$select public.notify_primary_ads_live()$$);
```

```sql
-- B. Setelah deploy, kembalikan yang sudah terbakar supaya emailnya menyusul
--    (aman: guard fungsinya tetap menyaring jendela tayang yang masih berjalan;
--     order yang jendelanya sudah lewat tidak akan ikut terkirim).
update public.form_submissions
   set live_notified_at = null
 where id in ('0cdd8ab4-7427-4bc8-a4df-d6ad906ce888',
              'f9b73a58-6523-4c80-801c-7df7bd5fa6ed',
              '8b7bd9c1-48b6-488a-997f-ce8ebc26d57a');
```

Sesudah deploy, **buktikan jalurnya hidup** — jangan anggap selesai karena cron
`succeeded` (ia `succeeded` juga saat 405):

```sql
select id, status_code, created from net._http_response order by created desc limit 5;
-- harus 200, bukan 405 (route hilang) dan bukan 401 (CRON_NOTIFY_SECRET beda)
```

⚠️ **`401` berarti gerbang rahasianya tidak cocok.** Vault sudah terisi keduanya
(`notify_ad_live_url` + `cron_notify_secret`, diverifikasi 2026-08-10) — yang
**belum bisa diverifikasi dari sini** adalah env var `CRON_NOTIFY_SECRET` di
Cloudflare Pages produksi. Nilainya harus identik dengan isi Vault.

⚠️ Cek juga status akun **Resend** sebelum menyalahkan kode: akun sempat
suspended 2026-08-10 dan form reaktivasinya baru dikirim. `200` dari
`/api/notify-ad-live` hanya membuktikan endpoint-nya hidup, bukan emailnya sampai.

**Pelajaran yang lebih besar dari insiden ini** — dan ini yang membedakannya dari
`sql/43` (DB maju, kode belum, tapi diam): sebuah migrasi yang **menulis penanda
"sudah dikerjakan"** tidak boleh diterapkan sebelum yang mengerjakannya ada.
`sql/43` cuma menunggu; `sql/48` menghabiskan. Aturan turunannya: kalau sebuah
fungsi menandai baris sebelum tahu hasilnya, **jadwalnya menyusul deploy**, bukan
mendahuluinya — atau tanda itu dipasang dari respons, bukan dari pengiriman.

### 00B. 🟡 `sql/47` juga mendahului kodenya — dampaknya kecil dan diam

Sudah diterapkan ke produksi 2026-08-10 dan **terverifikasi benar**: `anon` tinggal
7 kolom (`criteria_responden, end_date, id, prize_per_winner, start_date,
survey_url, winner_count`), `authenticated` utuh 35 kolom.

Tapi kode yang tayang sekarang (`main`) masih memuat
`functions/api/send-to-sheets.js`, yang membaca `form_submissions` dengan
`select('*')` memakai **anon key** (`send-to-sheets.js:148`) dan masih dipanggil
dari `StepCheckout.tsx:8` lewat `sendToGoogleSheetsBackground`. Sejak `sql/47`
jalan, panggilan itu **selalu gagal**. Tidak berbahaya dan tidak perlu ditindak:
ia fire-and-forget, sinkronisasi Sheets sudah lama mati (dipanggil sebelum halaman
iklan terbit, jadi policy anon menolaknya bahkan sebelum `sql/47`), dan pemilik
produk sudah memutuskan mencabutnya 2026-08-09. Deploy branch ini menghapus
seluruh jalurnya.

Konsumen anon lainnya sudah dicek satu per satu dan **semuanya aman**:
`SurveyPage.tsx` (6 kolom), `SurveyListingPage.tsx` + `functions/api/surveys.js`
(embed `prize_per_winner, winner_count`), `respondents.js` (`criteria_responden`).

⚠️ **Yang tidak bisa diverifikasi dari luar, dan wajib dipastikan:**
`doku/webhook.js` dan `doku/create-payment.js` memakai
`SUPABASE_SERVICE_ROLE_KEY || VITE_SUPABASE_ANON_KEY` — **fallback ke anon**. Kalau
service-role key tidak terpasang di env Cloudflare, jalur uang membaca
`auth_user_id`/`voucher_code` yang kini **tidak lagi di-grant ke anon**, dan
webhook DOKU akan gagal diam-diam. Bukti tidak langsung bahwa key-nya terpasang:
10 order jadi `paid` dalam 48 jam terakhir, termasuk **sesudah** `sql/47` jalan.
Cukup meyakinkan, belum konklusif — pantau webhook pertama setelah deploy.

### 00D. ✅ Revamp visual dashboard diaudit sebelum commit (2026-08-17) — nol SQL, nol perubahan skema

Perubahan besar bertema tampilan (39 file, ~4.100 baris) diperiksa sebelum di-commit. Tiga
hal menyentuh rencana dan sembilan bug ikut ditemukan; **semuanya sudah diselesaikan di
commit yang sama.** Ringkas — detail per rencana ada di
[`docs/superpowers/plans/README.md`](superpowers/plans/README.md).

**Yang dikembalikan supaya tidak dikerjakan dua kali:**

- Sebagian **Task 13 Langkah 2** (multi-invoice per jadwal) tak sengaja ikut terbangun.
  Dikembalikan; rancangan UI-nya dicatat lengkap di rencana Task 13 supaya versi benar lahir
  di atas `schedule_id` (Task 11) dan hasilnya minimal setara.
- Alasannya bukan selera: prototipe itu **salah menghitung uang**. Diukur di produksi —
  82 sumber punya >1 baris transaksi, 33 di antaranya penjumlahannya melebihi yang
  benar-benar dibayar. Satu order nyata lunas Rp 1.150.000 tampil Rp 3.450.000; kasus
  terburuk 29 percobaan Rp 350.000 tampil Rp 10.150.000.

**Penjaga jalur uang yang dipulihkan** (keduanya dari commit `0b295bb`): penjaga lunas
di dalam query `releaseScheduleSlot` (balapan dengan webhook DOKU), dan penandaan
`slot_booked_by='admin'` saat admin memindahkan jadwal — tanpa itu slot yang baru dipindah
tetap `'user'` dan bisa ikut kadaluwarsa otomatis.

**Bug yang diperbaiki** — dua di antaranya akan lolos ke produksi karena `vite build` tidak
melakukan typecheck: `AlertTriangle` dipakai tanpa import (tab Jadwal & Bayar *crash* untuk
submission spam/rejected), dan `updateExtendScheduleDates` dipanggil dengan `endIso` di slot
`durationDays` (tanggal rusak saat memindahkan jadwal ordinal ≥2). Sisanya: badge "perlu
ditagih" yang tak pernah muncul, empat baris identitas peneliti tanpa kolom DB, dua cabang
render mati, variant Chip tak sah, dan `totalPaid` yang tak pernah ada.

**Ronde review kedua** menemukan tiga hal lagi, semuanya sudah diperbaiki:

- `PaymentSection` sempat mengecek "belum ada tagihan" SEBELUM cek lunas, sehingga jadwal
  yang dibayar di luar sistem (tanpa baris `transactions`) menampilkan ajakan "Terbitkan
  tagihan". Presedens dikembalikan seperti `PaymentBanner` lama: lunas didahulukan.
- `scheduleMoney.ts` sempat memuat **salinan ketiga** tarif voucher sebagai daftar
  hardcoded — dan daftarnya sudah tertinggal: `JFUANA`/`JFUNATALIA`/`JFUSALSA` (10%) dan
  `TEGARGANTENG` (20%) tidak ada di sana. Diganti dengan **probe dua titik** terhadap
  `calculateDiscount`; voucher proporsional dibalik otomatis, yang berbasis cap
  (`JFUFEB`/`ILKOMUNY`) dan `JFUTGRX` sengaja dilewati. Terverifikasi untuk 20 kode.
- `updateFormDetails` kini menerima `Partial`, dan "Ganti link" di dashboard peneliti hanya
  mengirim `survey_url`. Sebelumnya ia ikut menulis `title`/`question_count`/`duration` dari
  salinan lokal — persis empat kolom yang admin sunting di tab Info, jadi suntingan admin
  bisa tertimpa, termasuk dua masukan harga.

**Perubahan perilaku yang disengaja dan perlu diketahui:** `isScheduleLate` baru di
`lifecycle.ts` membuat order belum lunas yang tanggal tayangnya sudah lewat berderajat
`reserved_expired`. Terukur **336 order** akan berpindah label jadi "Slot Expired". Iklan
yang dibayar di luar sistem **tidak** terdampak — 32 baris berstatus scheduled/live/completed
terlindungi presedens stage yang menaruh live/page_scheduled/completed di atasnya.

**Gerbang typecheck:** baseline `tsc -b` **39** error sebelum, **36** sesudah — nol error
baru, dan tiga error lama ikut hilang (termasuk `ui/Dialog.tsx` yang di-*rename* jadi
`dialog.tsx` supaya cocok dengan 14 import yang semuanya huruf kecil; build Linux dulu
rawan gagal di sini). Build produksi lolos.

### 00I. 🟡 Rilis Soft DNA dideploy 2026-08-18 — hijau, kurang satu langkah

**Yang sudah terbukti.** Merge `f217d58` dipush (tip `835aea1` sesudah menyatu
dengan dua commit rekan) dan dideploy. Route Functions-nya hidup: POST tanpa kunci
ke `/api/notify-ad-live` membalas **401**, bukan **405** — pembeda yang persis
dipakai saat mendiagnosis insiden 10 Agustus.

**Yang belum.** Cron `notify-primary-ads-live` belum dijadwalkan ulang. Lihat
§00A; ini satu-satunya sisa checklist rilis.

**Yang belum bisa dibuktikan, dan jangan diklaim beres sebelum ada buktinya:**

| Hal | Kenapa belum terbukti | Bukti yang ditunggu |
|---|---|---|
| Perbaikan webhook DOKU (`sql/54`) | `doku_webhook_events` **masih 0 baris** — belum ada pembayaran masuk sejak deploy. Tabel kosong tidak membedakan "kode benar, belum ada trafik" dari "kode tidak menulis" | Satu pembayaran DOKU apa pun. Baris pertama yang muncul membuktikan jalurnya; kalau ada order jadi `paid` **tanpa** baris di sini, justru itu alarm |
| `CRON_NOTIFY_SECRET` di env Cloudflare | Balasan `401` muncul untuk dua sebab berbeda — kunci tidak diset, atau kunci salah — dan keduanya tak bisa dibedakan dari luar | `net._http_response` = **200** sesudah cron dijadwalkan. `401` di sana berarti env-nya tidak cocok dengan Vault |
| Email Resend benar-benar sampai | Akun sempat suspended 10 Agustus. `200` hanya membuktikan endpoint hidup | Satu email diterima peneliti, atau dashboard Resend |

**Commit yang menyusul rilis** (sudah tayang, di luar lingkup branch Soft DNA):
`ee7b057` dot indicator di tabel submissions · `4267c01` dot disembunyikan untuk
page completed + badge audit "tandai lunas" · `bf26145` ajakan JFU Form di helper
text input tautan manual · `d391fdd` `@fontsource/plus-jakarta-sans` dipasang.

⚠️ **Uji manual pasca-deploy masih menganggur seluruhnya** — §00F dan §00H
mencatat daftarnya, dan tidak satu pun sudah diklik. Rilis ini besar (81 commit);
sampai ada yang mengkliknya, "hijau" baru berarti build lolos, bukan flow benar.

### 00H. ✅ Tarikan `main` kedua + merge ke `main` — penahanan dicabut (2026-08-18)

**`main` bergerak lagi sesudah §00F.** Tiga commit baru (`2b0053b`, `733782f`,
`3f3c699`): import Google Form lewat tautan di Ask JFU AI, blok gambar di form
builder, promo bar JFU Form, dan **navigasi dashboard mobile-first**. Ditarik ke
branch lebih dulu supaya konfliknya diselesaikan di sana, bukan saat merge balik.

**Enam file konflik, tiga jenis penyelesaian.**

| File | Penyelesaian |
|---|---|
| `MultiStepForm`, `UnifiedHeader`, `ChatPage`, `StatusPage` | Ambil sisi branch. Perubahan `main` di keempatnya **hanya** membuang hamburger + `toggleSidebar`, dan branch sudah membuangnya lebih dulu lewat `AppNav`. Diverifikasi: `toggleSidebar`/`useOutletContext` nol kemunculan di **kedua** sisi, jadi tidak ada konsumen yang ditinggalkan |
| `StepOneMethodSelection` | Gabung. Layout accordion branch tetap; promo bar JFU Form dari `main` dibawa masuk, lalu diselaraskan ke Soft DNA dan diangkat ke i18n (5 kunci × 2 locale) — versinya di `main` memakai gradien indigo-ungu dan copy Indonesia hardcoded |
| `DashboardLayout` | Ambil sisi branch (`AppNav`) |

⚠️ **Merge ini MENGHAPUS bottom tab bar mobile yang `main` tambahkan di `2b0053b`.**
Bukan konflik teks — dua sistem navigasi utuh yang saling meniadakan: `main` =
sidebar desktop + tab bar bawah; branch = `AppNav` sticky atas + sheet mobile.
Keduanya tidak bisa hidup berdampingan apa adanya, karena hamburger `AppNav` akan
mengulang tujuan yang sama persis dengan tab bar di bawahnya.

**Keputusan pemilik produk 2026-08-18: `AppNav` saja.** Alasannya bukan umur
branch, melainkan cakupan: `AppNav` menampung switch bahasa, profil, dan sign out;
tab bar `main` hanya memindahkan halaman dan menjejalkan profil sebagai tab kelima.
Membuang `AppNav` berarti ketiga fungsi itu kehilangan rumah. **Nol destinasi
hilang** — `/dashboard`, `/dashboard/forms`, `/dashboard/chat`, profil, dan sign
out semuanya ada di `AppNav`; `/dashboard/submit` dicapai lewat kartu masuk di
`/dashboard`.

Kalau nanti tab bar diinginkan kembali (opsi hybrid: `AppNav` untuk identitas +
tab bar untuk perpindahan, hamburger mobile dilepas), markupnya masih utuh di
`git show 2b0053b -- multi-step-form/src/components/DashboardLayout.tsx`.

**Penomoran migrasi tidak bentrok.** `main` menambah `sql/58`; branch memakai
`49`/`54`/`55`. Deret `50`–`53` tetap kosong sesuai reservasi di §Peta dokumen.

**Gerbang:** `tsc -b --force` = **60 error**, identik baseline pra-merge (nol
tambahan — pakai `--force`, lihat peringatan di §00F); **14/14** uji lolos;
`npm run build` ✓.

**Seluruh migrasi 45–58 sudah ada di produksi** — diverifikasi satu per satu
2026-08-18, termasuk `sql/54` (`doku_webhook_events`) dan `sql/55` (`display_order`
NULL) yang sempat tercatat belum diterapkan. Jadi deploy ini **tidak** membawa
lubang DB-mendahului-kode baru; sebaliknya, ia menutup yang lama (§00A, §00B).

⚠️ **Belum diuji di browser.** Uji manual yang tertunda dari §00F masih berlaku,
plus dua yang baru: navigasi mobile sesudah tab bar `main` dihapus, dan promo bar
JFU Form di jalur bahasa Inggris.

### 00G. 🔒 Phase 4 ("Jadwalkan Iklan Lagi") diputuskan menunggu Task 13 (2026-08-18)

**Keputusan pemilik produk 2026-08-18: tombol swalayan baru dinyalakan SESUDAH Task 13.**
Bukan sesudah Task 11, dan bukan sesudah `reward_pools` saja seperti yang tercatat di
dokumen ini sejak 2026-08-04. Prasyaratnya diperbarui di tiga tempat: baris Phase 4 di
§"Ringkasan cepat", `[4]` di urutan rilis
[`plans/README.md`](superpowers/plans/README.md), dan roadmap Phase 4 di
[`2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md).

**Kenapa BUKAN Task 11 — ini yang paling mudah salah disimpulkan.** Task 11 langkah 2
sengaja mengubah `form_submissions_extend` jadi view dengan `INSTEAD OF` trigger supaya
seluruh penulis lama tetap jalan tanpa disentuh. Jadi kode Phase 4 yang ditulis hari ini
akan **selamat melewati Task 11 tanpa diedit**. Task 11 tidak memblokir Phase 4; ia cuma
merapikan identitas (`booking_id`) dan tautan tagihannya (`schedule_id`).

**Yang benar-benar mengunci: sistem tidak punya harga untuk jadwal ke-2.**
[`ScheduleForm.tsx:333`](../multi-step-form/src/components/schedule/ScheduleForm.tsx#L333)
menulis `total_cost: 0` saat membuat jadwal; harganya diketik admin belakangan di
`InvoiceForm`. Tidak ada satu pun jalur yang menghitungnya — `cost-calculator` hanya
melayani order pertama. Terukur di produksi 2026-08-17 atas seluruh 13 baris
`form_submissions_extend`:

| `total_cost` | Jumlah |
|---|---|
| Masuk akal (Rp 200.000 – Rp 3.191.250) | **6** |
| `0`, atau di bawah Rp 10.000 (`1.000`, `1.110`, `1.110`, `1.103`) | **7** |

Tujuh dari tiga belas bukan harga. Itu bukan data kotor yang perlu dibersihkan — itu
potret bahwa kolomnya memang diisi tangan tanpa validasi, dan **tidak ada rumus di
baliknya untuk dipakai ulang.** Task 13 yang melahirkan harga per jadwal (invoice jadi
sumber kebenaran, Extra Ad jadi sifat jadwal, voucher jadi milik tagihan).

**Lapisan kedua: keputusan hadiah yang belum pernah ditanyakan ke peneliti.**
`fetchBatchContext` ([`ScheduleForm.tsx:50`](../multi-step-form/src/components/schedule/ScheduleForm.tsx#L50))
bercabang di batch undian tujuan — jadwal yang berakhir di batch baru **wajib** mendanai
pool hadiah baru (`prize_per_winner` × `winner_count`); yang jatuh di batch berjalan pakai
`additional_prize_per_winner`. Keduanya sudah terpakai di produksi (5 baris
`is_new_month=true`; satu baris top-up Rp 10.000). Flow order utama tidak pernah
menanyakan ini karena ia selalu batch pertama. Inilah lubang yang `reward_pools` (8B-2)
obati — jadi prasyarat lama tetap berlaku, ia cuma bukan satu-satunya.

**Tiga risiko sisanya tumbuh seiring volume, bukan penghalang mutlak:**

| | |
|---|---|
| `updatePaymentStatus` ([`supabase.ts:681`](../multi-step-form/src/utils/supabase.ts#L681)) masih menyaring `form_submission_id` saja | "Tandai Lunas" melunasi **seluruh** invoice order, termasuk milik jadwal lain. Task 11 langkah 4 mempersempitnya ke `schedule_id` |
| Booking ID masih beda antara admin & peneliti | Pencarian sudah ditambal (§00E); **tampilannya belum**. Task 11 (`booking_id`) yang menyatukan |
| Perpanjangan order Kilat | Eksplisit di luar cakupan Task 11 — butuh pemilih gelombang, bukan rentang hari. Phase 4 harus menyembunyikan CTA-nya untuk order Kilat |

#### Temuan yang menghemat waktu saat Phase 4 benar-benar dikerjakan

**Separuh HILIR-nya sudah jadi, lengkap, dan sudah dua bahasa.** Begitu sebuah baris jadwal
ada tapi invoice-nya belum terbit,
[`airingPeriods.ts:230`](../multi-step-form/src/components/status/airingPeriods.ts#L230)
otomatis menjatuhkannya ke `awaiting_invoice` — chip abu-abu, label "Menunggu
Tagihan"/"Awaiting Invoice", plus kalimat SLA yang sudah ditulis di
`deriveOrderUiState.ts:292` ("slot sudah dipesan, menunggu admin menerbitkan tagihan
(maksimal 1 hari kerja)"). Sesudah admin menerbitkan tagihan, tombol "Bayar Sekarang" per
kartu muncul sendiri dan **sudah berfungsi** lewat `fetchSchedulePayments`. Yang hilang
cuma hulunya.

Konsekuensinya: ada **versi "ajukan, bukan pesan"** yang secara teknis bisa dikirim tanpa
menunggu apa pun — peneliti memilih rentang tanggal, barisnya lahir tanpa invoice, admin
memberi harga persis seperti hari ini, nol logika uang baru. Kuota slot pun sudah aman:
`fetchSlotAvailability` sudah menghitung extend
([`supabase.ts:1462`](../multi-step-form/src/utils/supabase.ts#L1462)).
**Sengaja tidak diambil 2026-08-18** — ia menambah antrean kerja manual admin alih-alih
menguranginya, dan permintaannya belum cukup besar (13 jadwal lanjutan seumur hidup, 11
order, dari 244 order selesai/tayang ≈ 4,5%). Dicatat di sini supaya kalau permintaannya
melonjak sebelum Task 13 selesai, opsi ini tidak perlu ditemukan ulang.

⚠️ **Kalau versi itu suatu saat diambil, ada satu keputusan yang wajib dijawab dulu:
siapa pemegang slotnya.** [`slotHold.ts:44`](../multi-step-form/src/utils/slotHold.ts#L44)
hanya melepas otomatis yang `slot_booked_by === 'user'`, dan lepasnya setelah 1 jam —
pengajuan yang menunggu admin sampai besok pasti kehilangan slotnya. Menandainya
`'admin'` menyelesaikan itu tapi membuka pintu peneliti menyerobot tanggal tanpa batas
waktu. Tidak ada jawaban default yang benar; ini keputusan produk.

### 00F. ✅ `main` (JFU Form) di-merge ke branch Soft DNA (2026-08-17)

**Insiden yang ditemukan saat menyiapkan merge — order produksi mati 4 hari.**
`StepCheckout` mulai mengirim `custom_form_id` sejak commit `6c42644`
(2026-08-13 15:02 WIB) dan ikut ter-deploy, tapi migrasinya tidak pernah dijalankan —
dari dua migrasi JFU Form hanya `custom_forms` yang diterapkan. PostgREST menolak
**seluruh** insert (`42703`), jadi setiap order baru gagal dengan toast "gagal menyimpan".
Order terakhir berhasil 13 Agustus 10.50 WIB; **nol order 14–17 Agustus** (laju sebelumnya
~5,4/hari). Kolomnya diterapkan & diverifikasi 2026-08-17, dan penomoran migrasinya
dibereskan di `main` lewat commit `05f921a` (`46`→`56`, `47`→`57`) — dua deret nomor sempat
tumbuh paralel, dan git **tidak** menganggap itu konflik karena nama filenya berbeda.

**Bentuk merge-nya.** `main` menyentuh 25 file, 19 di antaranya file baru (Form Builder
berdiri sendiri). Irisannya 8 file, 6 konflik. Seluruh file JFU Form masuk **identik**
dengan `main` — nol modifikasi.

**Keputusan pemilik produk: flow baru Soft DNA yang menang**, fitur `main` disisipkan ke
dalamnya. Yang perlu disesuaikan:

| Titik | Penyesuaian |
|---|---|
| `StepCheckout` | Konflik besar karena branch kita memindahkan submit ke `submitOrder.ts`. Ambil versi kita; baris `custom_form_id` dipasang di lokasi barunya |
| Rute `/dashboard/submit` | Branch kita mengalihkannya ke `submit-iklan`, dan `<Navigate>` polos **membuang query string** — `?custom_form_id=` hilang diam-diam, halaman terbuka normal tanpa prefill. Dibuatkan `RedirectPreservingQuery`; CTA "Sebar" juga diarahkan langsung ke rute kanonik |
| Entry point | `main` menambah "JFU Form" ke **sidebar** yang sudah kita hapus. Dipindahkan ke `AppNav`: item **"The Form"** yang tadinya `<span>` mati berbadge "Soon" kini `<Link>` hidup ke `/dashboard/forms`, badge jadi "Beta", desktop & mobile, dengan state aktif mencakup seluruh prefix `/dashboard/forms` |
| `StepSurveyDetails` | Gate profil (kita) + `isJfuImport`/`clearJfuOrigin` (main) dipertahankan keduanya. Tautan ganti-metode disembunyikan untuk impor JFU dengan tidak mengoper `onSwitchToGoogle` |
| `StepOneFormFields` | JSX versi kita dipakai; porting `fieldsReadOnly` (9 titik), spanduk "diisi otomatis", dan blokir keras data pribadi ke gaya kartu kita |
| `MultiStepForm` | Effect prefill dipertahankan utuh. `setCurrentStep(1)` kebetulan tetap benar — step 1 = `StepSurveyDetails` di kedua flow |

**Nomor step berbeda antar flow** — dicatat supaya tidak menjebak nanti:

| Step | main (lama) | Soft DNA (baru) |
|---|---|---|
| 1 | StepSurveyDetails | StepSurveyDetails |
| 2 | StepSchedule | **StepCheckout** |
| 3 | StepCheckout | **StepSchedule** |

**Gerbang:** `tsc -b` **nol error baru** (satu error warisan `main` di
`QuestionLogicBuilder.tsx` sekalian dibereskan); `npm run build` lolos.

⚠️ **Koreksi angka 2026-08-18.** Sesi merge mencatat "37 → 37". Perbandingannya benar —
sama-sama `tsc -b` polos, sebelum & sesudah — tapi **angka mutlaknya salah**: `tsc -b`
bersifat inkremental dan hanya melaporkan error untuk proyek yang ia bangun ulang, jadi 37
itu hasil sebagian. Diukur ulang dengan `tsc -b --force` di worktree terpisah:
`6ba4123` (tip sebelum merge) = **60**, `4893c10` (commit merge) = **60**. Nol error baru
tetap berlaku. **Pakai `--force` untuk angka gerbang**, atau angkanya akan berbeda-beda
tergantung isi cache. (Angka **75** yang tercatat di rencana Task 11 & 13 berasal dari era
pengukuran lain dan belum diadu ulang dengan metode ini.)

⚠️ **Belum diuji di browser.** Yang paling perlu diklik: CTA "Sebar via Jakpat" → prefill →
lanjut sampai bayar, dan satu order Google Form biasa untuk memastikan `custom_form_id`
NULL tidak mengganggu.

### 00E. ✅ Pencarian admin kini menemukan Booking ID jadwal ke-2 dst. (2026-08-17) — nol SQL, frontend saja

**Celahnya:** Booking ID yang dilihat peneliti adalah `ad_schedules.source_id`
([`SchedulePhase.tsx:624`](../multi-step-form/src/components/status/SchedulePhase.tsx#L624)),
dan kolom itu **berpindah tabel** — id `form_submissions` untuk jadwal ke-1, id
`form_submissions_extend` untuk jadwal ke-2 dst. Kotak pencarian admin hanya mencocokkan
`form_submissions.id`. Terukur di produksi: dari **13** Booking ID jadwal lanjutan, **nol**
yang bisa ditemukan. Peneliti mengutip kodenya ke support, admin mengetiknya, hasilnya
kosong — tanpa error, jadi tidak ada yang sadar pencariannya yang salah.

Sisi admin memang menyebut jadwal lanjutan dengan id yang berbeda dari sisi peneliti: agenda
([`ScheduleAgenda.tsx:102`](../multi-step-form/src/pages/dashboard/schedule/ScheduleAgenda.tsx#L102))
dan drawer-nya ([`ScheduleEntryDrawer.tsx:218`](../multi-step-form/src/pages/dashboard/schedule/ScheduleEntryDrawer.tsx#L218))
menampilkan `submissionId` untuk **semua** baris satu order. **Itu sengaja belum disamakan** —
lihat catatan di rencana Task 11.

**Yang diperbaiki**, seluruhnya di `getFormSubmissionsPaginated`
([`supabase.ts`](../multi-step-form/src/utils/supabase.ts)):

- Pencarian id kini juga melakukan lookup ke `ad_schedules.source_id` lalu memetakan balik ke
  `submission_id`. Satu lookup menutupi kedua bentuk sekaligus, karena baris ordinal 1 memang
  punya `source_id = submission_id`.
- Pencocokan langsung ke `form_submissions.id` **tetap dipertahankan** di sampingnya: **6
  order belum punya baris `ad_schedules`** sama sekali, dan menyerahkan pencarian sepenuhnya
  ke cermin akan menghilangkan mereka.
- Kegagalan lookup cermin **tidak menjatuhkan pencarian** — ia mengecil kembali ke perilaku
  lama dan menulis `console.warn`.

**Perubahan perilaku yang disengaja:** pencarian **id** kini melewati filter bulan.
Sebuah id menunjuk tepat satu order, jadi menyaringnya lagi per bulan tidak menyempitkan
apa pun — ia cuma menyembunyikan, dan menyembunyikan hampir semuanya: 985 order tersebar di
16 bulan, cuma 60 di bulan berjalan, jadi **~94% pencarian id akan kosong** hanya karena
admin sedang membuka bulan lain. Tanpa ini perbaikan di atas nyaris tak terasa. Pencarian
**teks** tetap terikat bulan.

**Verifikasi:**

| | |
|---|---|
| 13 Booking ID jadwal lanjutan | **13/13** memetakan ke tepat satu order yang benar (sebelumnya 0) |
| Ambiguitas prefiks 8-hex | **998 kode, 0 ambigu** — tidak ada kode yang menunjuk >1 order |
| Sintaks PostgREST | `and()` bersarang di `or=()`, rentang prefiks uuid, dan input HURUF BESAR diuji langsung ke server produksi |
| `tsc -b` | **nol error baru, nol hilang** (angka mutlak "37" yang tercatat di sini semula hasil build inkremental sebagian — lihat koreksi di §00F) |
| `npm run build` | lolos |

⚠️ **Belum diuji di browser.** Yang dikerjakan baru typecheck, build, dan simulasi SQL atas
data produksi.

**Belum dikerjakan (sadar, bukan lupa):** papan Schedule masih mencari judul + nama peneliti
saja, tanpa id sama sekali
([`ScheduleBoardPage.tsx:154`](../multi-step-form/src/pages/dashboard/ScheduleBoardPage.tsx#L154)).

### 00C. ✅ Iklan auto-publish tak lagi tenggelam ke bawah list (2026-08-13) — `sql/55` diterapkan & terverifikasi di prod

**Nol perubahan frontend.** `ensure_survey_page()` (Phase 1, `sql/40`/`42`) sengaja menyetel
`display_order = MAX(display_order) + 1` untuk setiap halaman iklan yang dibuat otomatis
saat order lunas — supaya kartu berbanner default tidak jadi yang paling mencolok di
listing. Karena Page Calendar (jalur pembuatan manual) sudah dipensiunkan (§00), hampir
semua iklan baru lewat jalur trigger ini, dan MAX+1 selalu menghasilkan angka tertinggi
baru — jadi tiap iklan baru selalu berakhir di ujung bawah pita "sudah ditempatkan"
(`orderBand()` di `src/utils/adOrdering.ts`) sampai admin sempat menyeretnya naik lewat tab
Live. Diverifikasi ke produksi sebelum fix: `MAX(display_order) = 40`, dan pemiliknya
persis halaman yang paling baru dibuat (12 Agu 21:50 WIB).

Keputusan produk 2026-08-13: konsekuensinya lebih besar daripada manfaatnya — performa
iklan pembayar bergantung pada admin sempat membuka tab Live, dan itu gampang terlupa.

**Fix:** [`sql/55_auto_page_display_order_neutral.sql`](../multi-step-form/sql/55_auto_page_display_order_neutral.sql)
— `CREATE OR REPLACE` atas `ensure_survey_page()` (basis: versi `sql/42` yang aktif di
produksi, dicocokkan lewat `pg_get_functiondef` sebelum ditulis), satu nilai yang berubah:
`display_order` balik ke `NULL` saat insert, sama seperti jalur manual `PageBuilderModal.tsx`.
Guard Kilat `sql/42` tidak disentuh. `orderBand()` sudah memperlakukan halaman non-extra-ad
ber-`display_order` NULL sebagai pita TOP, jadi tidak ada kode frontend yang perlu berubah.

✅ **Diterapkan ke database produksi 2026-08-13.** Diverifikasi lewat `pg_get_functiondef`:
`display_order` di INSERT sudah `NULL`, komentar fungsi menyebut `sql/55`, dan guard Kilat
(`IF v_sub.distribution_type = 'kilat' THEN RETURN NULL`) masih utuh — tidak tertimpa balik.

**Backfill 49 baris lama — selesai 2026-08-13.** Awalnya ditahan karena datanya tidak bisa
dibedakan mana bekas trigger murni dan mana bekas drag manual admin — dipecahkan lewat dua
sinyal yang terbukti akurat 100% (nol anomali di seluruh 49 baris):

1. `set_survey_pages_order()` menormalkan SELURUH daftar live dalam satu `UPDATE` — jadi
   baris yang berbagi `updated_at` persis sama pasti satu sesi simpan admin, dan nilainya
   pasti rentang rapat `0..N-1`. Diverifikasi: **8 klaster, 33 baris, seluruhnya rapat
   sempurna tanpa satu pun celah** — bukti kuat, bukan dugaan.
2. Sisa baris "sendirian" (`updated_at` tak dibagi baris lain) diuji kontradiksi: kalau ada
   baris LAIN yang dibuat lebih dulu tapi `display_order`-nya lebih besar/sama, baris
   "sendirian" itu **mustahil** murni trigger (`MAX+1` naik monoton) — pasti pernah
   disentuh manual. 4 dari 16 baris solo gagal uji ini dan diikutkan ke daftar dipertahankan.

Hasil: **37 baris dipertahankan** (33 klaster + 4 solo-kontradiksi — kemungkinan bekas
susunan manual admin), **12 baris di-backfill ke `NULL`** (solo, lolos uji kontradiksi; 6 di
antaranya malah `updated_at = created_at` persis — belum tersentuh apa pun sejak dibuat
trigger). `survey_pages` sekarang: 268 baris `display_order NULL`, 37 baris terisi.

### 00. Page Calendar sudah dipensiunkan ✅ (2026-08-08) — sisa: adu visual di browser

**`SchedulingPage.tsx` + `SchedulingPage.css` dihapus** atas keputusan pemilik produk
2026-08-08: papan Schedule dinilai sudah lebih dari cukup. Ikut terhapus karena
kehilangan seluruh pemanggilnya: `getScheduledPages()` dan
`getPendingSlotsWithoutPage()` di `supabase.ts` (124 baris). `react-big-calendar` +
`moment` **tidak lagi diimpor di mana pun** — kandidat pencabutan dependensi, tapi
dibiarkan dulu karena mencabut paket di tengah branch tidak sepadan risikonya.

⚠️ **Satu kemampuan hilang, dan ini catatannya supaya tidak dikira bug nanti.**
Dari Page Calendar admin bisa membuat halaman iklan untuk order yang **belum lunas**;
jalur drawer tidak bisa (`canBuildPage = isPaid || isLegacyActive`). Terukur saat
penghapusan: **10 order** ada di keadaan itu (9 `slot_reserved` + 1
`waiting_payment` yang benar-benar belum bayar). Sisanya yang tampak "belum lunas"
ternyata sudah — 10 dari 19 `slot_reserved` ber-`payment_status` lunas, dan
8 order `paid` tanpa halaman semuanya tetap terlayani drawer.

⚠️ **Penjaga `paymentStatus` di `PageBuilderModal` kini TIDAK PUNYA PEMANGGIL.**
`SchedulingPage` satu-satunya yang mengopernya. Selama tidak diisi, `isUnpaid`
selalu `false` dan ketiga penjaganya (peringatan kuning, tombol publish mati,
auto-publish ditahan) diam. Sengaja tidak dihapus — penjaganya benar dan murah —
tapi **jangan dibaca sebagai "publish order belum lunas sudah dijaga"**. Kalau
disambungkan lagi: turunkan dari `deriveLifecycle().isPaid`, **jangan** dari
`form_submissions.payment_status` mentah (lihat §Jebakan no. 3).

Yang tersisa: **adu visual di browser**, dan itu butuh mata manusia. Pembandingnya
sudah tidak ada di layar, jadi kalau ada yang janggal, rujuk `git show` pada commit
sebelum penghapusan.

Papan barunya bertab **Agenda · Iklan · Kilat** (bentuk final per 2026-08-08,
commit `08a2cd4`..`e808189`):

- [ ] **Agenda** — tanggal, jam, dan status halaman masuk akal untuk survei yang
      dikenal. Sisi data sudah diadu relasional dan nol (§4), jadi yang diuji di
      sini murni penyajiannya
- [ ] **Kilat** — kisinya rapi: 5 kolom sama lebar, judul terpotong satu baris,
      tidak ada sel yang melebar sendiri (regresi `1fr` — §Jebakan no. 13)
- [ ] **Iklan** — papan kapasitas baru, **tidak punya pembanding**. Yang bisa diadu
      cuma angkanya: cocokkan `n/4` sebuah hari dengan kalender pemesanan di wizard
      (`StepSchedule`) untuk tanggal yang sama. Kalau berbeda, `occupiesSlot()` dan
      `fetchSlotAvailability` sudah menyimpang
- [ ] Klik entri dari order **bulan lampau** → drawer terbuka dan **tetap terbuka**
- [ ] Klik entri **iklan regular** → mendarat di tab Regular, bukan tab Kilat kosong
      (bug `setDistTab('kilat')` yang ditutup di `d7639df` — inilah ujinya)
- [ ] Pil **belum dijadwalkan** dinyalakan → 37 order tanpa tanggal muncul, dan yang
      berstatus lunas benar-benar ada di sana
- [ ] Mobile: papan terbaca di 375px, nol scroll horizontal pada tab Agenda
      (tab Iklan & Kilat memang menggulung mendatar — kisinya `min-w-[900px]`/`720px`)

⚠️ **Menghapus `SchedulingPage` membuang satu kemampuan nyata — jangan dihapus
sebelum ini dipindahkan.** Dari Page Calendar admin bisa membuat halaman untuk
order yang **belum lunas** (`getPendingSlotsWithoutPage` memasukkan
`slot_reserved`/`waiting_payment`). Jalur drawer tidak bisa: `PageAction`
`disabled={!canBuildPage}` dan `canBuildPage = isPaid || isLegacyActive`.
Selain itu **hanya `SchedulingPage` yang mengoper prop `paymentStatus`** ke
`PageBuilderModal` — prop itu yang menyalakan peringatan "belum lunas" dan
**mematikan tombol publish**. Mount di `InternalDashboard.tsx:1318` tidak
mengopernya; kalau `SchedulingPage` dihapus begitu saja, penjaga itu hilang diam-diam.

### 0. Uji jembatan Kilat ujung-ke-ujung ⬅️ uji manual paling mendesak

`sql/42` sudah diterapkan **dan diverifikasi** di produksi 2026-08-04:

- kolom `kilat_slot_hour` ada;
- CHECK menolak jam di luar 8/11/14/17 (diuji dengan `= 9`, ditolak `23514`);
- guard Kilat aktif — `ensure_survey_page()` mengembalikan `NULL` untuk order
  Kilat yang seluruh prasyarat lainnya lolos;
- **nol halaman iklan menempel di order Kilat mana pun**, jadi tidak ada
  peninggalan `sql/40` yang perlu dibereskan.

Frontend commit `c554880` sudah **dideploy** 2026-08-04 (laporan admin). Yang
**belum** dijalankan: urutan uji manual di dashboard admin:
tab Regular Ads → **Jadikan Kilat** → tab Kilat → Reserve Slot (grid gelombang
08/11/14/17, hari kerja saja) → Payment → Mark as Paid.

Yang paling penting dicek: **sesudah order Kilat lunas,
`SELECT * FROM survey_pages WHERE submission_id = '<uuid>'` harus kosong.** Kalau
ada isinya, guard Kilat di `ensure_survey_page()` tidak aktif — kemungkinan besar
`sql/40` dijalankan ulang sesudah `sql/42` dan mengembalikan definisi lama.
Perbaikannya: jalankan `sql/42` bagian 2 lagi.

Sisa verifikasi ada di bagian bawah `sql/42_kilat_slots.sql`.

### 0B. Papan jadwal Kilat di Ads Schedule ⬅️ sudah deploy, uji manual belum

Commit `a4fc499`, **dideploy 2026-08-05** bersama `b78a7aa`. Halaman **Ads Schedule** sekarang punya toggle **Iklan |
Kilat**: mode Kilat menampilkan papan mingguan (4 gelombang × Senin–Jumat)
lintas semua order Kilat, dengan klik-untuk-buka-drawer ke order itu di tab
Submissions (`fetchKilatSchedule` + `KilatScheduleBoard.tsx`).

Sekalian menutup lubang nyata yang sebelumnya ada: order Kilat selalu muncul di
kalender iklan (mode Iklan) sebagai kartu "Page belum dibuat" dengan tombol
**Create Page** yang masih berfungsi. Mengkliknya insert langsung ke
`survey_pages` lewat `PageBuilderModal` — melewati guard `sql/42` sepenuhnya
(guard itu cuma hidup di trigger DB, bukan di jalur ini) dan menimpa jadwal
Kilat ke 15.00 WIB. Ditutup dua lapis: `getPendingSlotsWithoutPage` tidak lagi
menarik order Kilat, dan `PageBuilderModal.handleSave` menolak `submissionId`
berjalur Kilat sebagai sabuk pengaman kedua.

Diverifikasi: `npx tsc --noEmit` bersih (dibanding baseline sebelum perubahan
ini — nol error baru), `npx vite build` sukses. **Belum diuji manual di
browser.** Sebelum dianggap selesai:

**Insiden nyata yang mengonfirmasi lubang ini benar ada** (ditemukan
2026-08-04 lewat kanari `countKilatPagesLeak` sesaat setelah papan jadwal
dijalankan admin): satu order Kilat lunas (`e9cb5944-3a24-4093-8621-b36d2a7fe8d9`,
"JFSUHUD Pariwisata Sunda", `kilat_slot_hour` masih `null`) punya baris
`survey_pages` (`f759f097-35ab-4d1b-b54b-e4c0b7e09faf`) dengan
`is_published = false`. Dikonfirmasi lewat `select prosrc ilike '%kilat%' ...`
bahwa guard `ensure_survey_page()` masih utuh di produksi saat itu — jadi
BUKAN `sql/40` tertimpa ulang. `is_published = false` juga tidak cocok dengan
insert trigger sql/40 yang selalu `TRUE` (baris 199). **Koreksi setelah dikonfirmasi admin:** dugaan awal (tombol Create Page manual)
salah. Penyebab sebenarnya: order ini tadinya **iklan regular** dengan halaman
yang sudah terbit otomatis oleh `sql/40`. Kebijakan berubah dan order perlu
pindah ke Kilat — admin meng-unpublish halaman itu dulu (untuk lolos blokir
"halaman sudah published" di `convertDistributionType`), lalu klik **Jadikan
Kilat**. `is_published = false` + `requires_banner_update = false` cocok
persis dengan insert `sql/40` (bukan insert manual `PageBuilderModal`), dan
jeda 14 menit antara `page_created_at` dan `submission_updated_at` cocok
dengan urutan: order lunas → halaman terbit otomatis → admin unpublish →
admin konversi. Ini alur admin yang sah untuk kasus khusus (perubahan
kebijakan), bukan kesalahan — tapi `convertDistributionType` sebelumnya tidak
pernah membersihkan baris `survey_pages` yang tersisa setelah blokir
published-nya lolos, jadi baris itu tertinggal yatim piatu selamanya.

**Fix:** commit `b78a7aa` — `convertDistributionType` sekarang menghapus baris
`survey_pages` yang tersisa (kalau ada) sebagai bagian dari konversi ke Kilat.
Blokir keras untuk halaman yang **masih** published tidak berubah sama sekali
— admin tetap harus stop manual dulu, persis alur yang sudah berjalan. Opsi
"satu klik penuh" (auto-unpublish halaman yang masih live) dipertimbangkan dan
**sengaja ditolak** — itu akan menghapus blokir keras yang sengaja dipilih di
sesi perencanaan awal, dan bisa menggelapkan iklan yang sedang tayang tanpa
konfirmasi terpisah.

Baris `f759f097-...` (peninggalan dari sebelum fix ini) **sudah tidak ada** —
dicek 2026-08-05, `0` baris. Dicek sekalian: **nol** halaman iklan menempel di
order Kilat mana pun di seluruh produksi, jadi tidak ada peninggalan lain yang
tertinggal.

1. Order Kilat berjadwal aktif TIDAK lagi muncul di kalender iklan (mode Iklan)
   dalam bentuk apa pun, dan tombol Create Page pada order **regular** tanpa
   halaman tetap berfungsi seperti biasa.
2. Mode Kilat: gelombang 08.00 tampil di baris 08.00 (bukan 15.00 seperti
   kalender iklan); isi satu gelombang sampai 2/2 lalu cocokkan dengan grid di
   `KilatScheduleStep` (dua layar harus sepakat); order tanpa
   `kilat_slot_hour` muncul di baris "Tanpa Gelombang"; navigasi ke minggu
   lampau tetap menampilkan order `completed`; Sabtu/Minggu tidak dirender.
3. Klik entri dari order yang dibuat **bulan lalu** → pindah ke tab
   Submissions, sub-tab Kilat, drawer terbuka dan **tetap terbuka** (kasus yang
   gagal kalau bulan tidak ikut disetel bersama pencarian).

### 1. Jalankan checklist Phase 0

Sekarang deploy sudah terjadi, sisanya tinggal menjalankan
[`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md).
Bagian **§2, §3, §5 wajib**; sisanya kalau sempat. Checklist itu sudah dikoreksi
2026-08-04 — §8 dulu menyuruh memastikan Phase 1 *diam*, sekarang kebalikannya
karena `sql/40` sudah aktif.

Kenapa tetap penting dicek meski sudah deploy: sebelum deploy ini, yang tayang
menjual kapasitas slot yang tidak ada (perpanjangan tidak terhitung), menagih
insentif batch dua kali untuk jadwal ke-3+, dan bisa menggelapkan iklan yang
sedang berjalan saat admin melakukan reschedule — checklist ini yang
membuktikan ketiganya benar sudah tidak terjadi lagi di produksi.

### 2. Phase 3 sudah bisa dimulai — penghalangnya habis ✅

**Semua penghalang sudah hilang per 2026-08-05 sore.** `ad_schedules` mengenali
Kilat (Task 8D, `sql/45`), dan `feat/dashboard-soft-dna-navbar` **sudah menarik
`main`** (merge commit di branch itu, 2026-08-05). Branch tidak lagi tertinggal
18 commit; `git log --oneline HEAD..main` kosong.

Yang tersisa **bukan** penghalang, melainkan urutan kerja biasa: Task 9 harus
jalan sebelum Phase 3, dan alasannya bukan formalitas:

`ad_schedules.status` menyalin `submission_status`, dan kolom itu masih memuat
**dua sumbu sekaligus** (review + tayang). Akibatnya pemetaan di `sql/41` harus
menjatuhkan setiap nilai sumbu-review ke `waiting_payment`. Terukur 2026-08-05:

| `status` di cermin | Aslinya di sumber | Baris |
|---|---|---|
| `waiting_payment` | `in_review` | **393** |
| `waiting_payment` | `approved` | **97** |
| `waiting_payment` | `slot_reserved` | **40** |
| `waiting_payment` | `waiting_payment` | 1 |
| `live` / `scheduled` / `paid` / `completed` / `cancelled` | dirinya sendiri | 338 |

**531 dari 869 baris — 61% — runtuh jadi satu keranjang.** Tab "Jadwal Iklan"
terpadu yang dibangun hari ini tidak bisa membedakan "belum direview" dari "sudah
disetujui" dari "slot sudah dipesan". Itu bukan kekurangan kosmetik; itu justru
informasi yang paling dibutuhkan admin di layar penjadwalan. Memisahkan kedua
sumbu itu **adalah** Task 9.

Jadi Phase 3 dimulai begitu Task 9 jalan. Task 9 menulis ulang
`src/components/status/deriveOrderUiState.ts`, `airingPeriods.ts`, dan
`SchedulePhase.tsx` — ketiganya lahir di branch revamp visual dan tetap hanya ada
di sana.

**Diputuskan 2026-08-05: Task 9–12 dan Phase 3 dikerjakan DI branch
`feat/dashboard-soft-dna-navbar` itu sendiri**, bukan di branch baru dari `main`.
Larangan menumpang branch itu dicabut karena tidak bisa dipatuhi — file yang
ditulis ulang Task 9 memang lahir di sana. Konsekuensi yang diterima sadar: revamp
visual dan sisa Phase 2 jadi **satu unit rilis**, tidak bisa di-revert
sendiri-sendiri.

**Diputuskan 2026-08-05 juga: Phase 3 duluan, design-system dashboard
belakangan.** Task 1 design-system membalik urutan cascade `styles.css` dan
menyentuh seluruh app — terlalu berisiko-lebar untuk branch yang sudah memuat
revamp visual + sisa Phase 2. Konsekuensi diterima: recipe warna/spacing tab
Phase 3 kemungkinan ditulis ulang belakangan.

#### Yang dikerjakan sesi merge (2026-08-05 sore)

Merge `main` → branch berjalan persis seperti diperkirakan: **nol konflik kode**,
tepat **dua konflik dokumentasi** (`docs/jadwal-iklan-progress.md` dan
`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`), keduanya diselesaikan
dengan mengambil versi `main` — versi branch adalah potret pekerjaan yang sudah
selesai dan hanya akan menghidupkan kembali informasi kedaluwarsa.

Baseline setelah merge: **`tsc -p tsconfig.app.json` = 74 error** (sebelum merge
75 di branch, 76 di `main`; yang hilang persis satu `TS6133 isKilat` yang
dibersihkan bersama pemecahan berkas). `vite build` hijau, ketiga test harness
lolos. **Angka 74 ini yang jadi baseline Task 9.**

Dua pembersihan struktural ikut dituntaskan supaya Task 9/10 tidak membaca kode
yang menyesatkan:

- **Formatter uang disatukan** di `src/utils/currency.ts`. Sebelumnya ada empat
  implementasi `formatIDR` yang tidak sepakat (satu membayangi yang kanonik di
  dalam modulnya sendiri, satu lagi memakai nama `formatRupiah` padahal
  bentuknya `formatIDR` — tepat di `SchedulePhase.tsx`) plus lima salinan
  `formatRupiah`. Sekarang nol formatter uang di luar `utils/currency.ts`.
- **`SubmissionDetailSheet.tsx` dipecah** 1365 → 330 baris + lima berkas di
  `submissions/tabs/`. Relevan langsung untuk Task 10: "Mark as Paid" yang harus
  jadi per-jadwal sekarang ada di `submissions/tabs/PaymentTab.tsx` (246 baris),
  bukan di baris ~982 dari 1365.

Prosedur lengkap Phase 3 ada di
[`superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md`](superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md).
**Itu titik masuk sesi berikutnya — mulai dari Task 9.**

### 3. Uji manual yang masih menganggur

Tidak memblokir apa pun, tapi belum pernah dijalankan:

- **Jembatan Kilat ujung-ke-ujung** (§0) — urutan Jadikan Kilat → Reserve Slot →
  Payment → Mark as Paid di dashboard admin.
- **Papan jadwal Kilat di browser** (§0B) — tiga poin di akhir bagian itu.
- **Checklist Phase 0** (§1).
- **Task 8C di layar** — sudah dibuktikan di tingkat kode (lihat "Yang sudah
  selesai"), tinggal dilihat mata.

### 4. Verifikasi Task 8 — ✅ SELESAI SELURUHNYA (2026-08-08)

Semuanya **nol**:

| Periksa | Hasil |
|---|---|
| `(2a)` ordinal ganda dalam satu order | **0** |
| `(2b)` lubang di deret `1..n` | **0** |
| ordinal tidak mulai dari 1 | **0** |
| `(4b)` `period_batch` perpanjangan vs sumber | **0** |
| sinkron menyeluruh jadwal pertama (973 baris) — tanggal, durasi, biaya | **0** |
| sinkron menyeluruh perpanjangan — tanggal, durasi | **0** |
| baris cermin yatim (sumbernya sudah hilang) | **0** |
| order tanpa baris cermin | **0** |

`(4a)` tidak berlaku: **`form_submissions` tidak punya kolom `period_batch`** —
kolom itu hanya ada di `form_submissions_extend` dan `ad_schedules`. Jadwal pertama
selalu batch 1 secara definisi.

⚠️ **Cara mengukurnya sempat salah, dan salahnya persis jebakan no. 5.** Pengukuran
pertama melaporkan **16 baris menyimpang** — semuanya Kilat. Yang menyimpang bukan
datanya melainkan querynya: ia mengadu `start_date` Kilat dengan
`airing_instant_of_date()` (aturan regular, 15.00 WIB). Kilat memakai
`kilat_instant_of()`. Dengan helper yang benar hasilnya nol. **Dua jalur, dua
helper — juga saat menulis query verifikasi, bukan cuma saat menulis kode.**

**`(7)` `SELECT cron_activate_extends();` dijalankan dengan pengawasan pemilik produk,
2026-08-08 malam — nol perubahan, dan hasilnya diprediksi lebih dulu.**

Sidik jari diambil sebelum & sesudah atas `form_submissions_extend` (12 baris:
id · status · payment_status · `updated_at` sebagai epoch) dan atas seluruh
`survey_pages` milik order berjadwal ganda (jendela terbit + `current_period_batch`).
**Keduanya identik**: `f36426cd…` dan `c8b631ea…`. Cacah status tak bergeser —
1 `live`, 1 `scheduled`, 7 `completed`.

Prediksinya ditulis sebelum tombol ditekan, dan itu yang membuat ujinya berarti:
langkah 1 nol baris (satu-satunya jadwal `scheduled` lunas baru mulai 10 Agu),
langkah 2 menulis satu baris bernilai **identik** (halaman `untitled-former` sudah
sinkron), langkah 3 nol baris (yang `live` baru berakhir 10 Agu).

Sekalian terukur: cron `activate-extends` (`*/15 * * * *`) sudah jalan **6.250 kali,
100% `succeeded`**, sejak 4 Juni. Jadi yang diuji bukan "apakah ia jalan" melainkan
"apakah aman dipanggil manual" — dan jawabannya ya, ia idempoten.

> **Kenapa fungsi ini penting, karena mudah dikira sepele.** Langkah 2-nya —
> mengarahkan ulang `survey_pages.publish_start_date/end_date/current_period_batch`
> ke jadwal yang sedang tayang — adalah **satu-satunya** mekanisme yang membuat
> "1 halaman iklan, N jadwal" bekerja: halaman itu **jendela yang berpindah**, bukan
> milik satu jadwal. Tanpanya, peneliti yang membayar jadwal ke-2 tidak akan pernah
> tayang: `SurveyPage` menggerbang tampilan pada tanggal terbit yang masih menunjuk
> jendela lama, dan `current_period_batch` yang tertinggal menaruh respondennya di
> **pool hadiah yang salah**. Uang masuk, tidak ada yang keluar, dan DB berkata
> "scheduled". Cakupannya sempit — hanya order berjadwal ganda, 12 baris seumur hidup
> sistem — tapi justru itu yang membuatnya senyap.
>
> ⚠️ **Task 11 wajib mempertahankan perilaku ini utuh.** Sesudah
> `form_submissions_extend` jadi view, langkah 2 harus tetap menemukan barisnya.

---

## Yang sudah selesai

### Phase 2 Task 9B + 12 — dashboard peneliti, commit `e91f52f`..`433153c` (2026-08-08)

Nol migrasi. Seluruhnya frontend, dan **RLS-nya sudah siap sejak `sql/46`**:
policy `Owner or admin can view ad_schedules` predikatnya persis sama dengan
`getFormSubmissionsByUser` (`auth_user_id = uid` ATAU `auth_user_id IS NULL AND
email = jwt email`), jadi tidak ada order yang bisa tampil di daftar peneliti tapi
kehilangan jadwalnya.

Aturan dua sumbu tinggal di satu berkas baru,
[`status/scheduleAxes.ts`](../multi-step-form/src/components/status/scheduleAxes.ts);
`deriveOrderUiState`, `buildScheduleCards`, dan `ReviewPhase` semuanya lewat sana.

**Algoritma lama dan baru diadu berdampingan lewat SQL atas seluruh 971 order**
— pola yang sama yang membuktikan 8B-1 dan 8D. 664 identik, 307 berubah, dan
ketiga kelompoknya perbaikan:

| Jumlah | Dulu | Kini | Isinya |
|---|---|---|---|
| 237 | menunggu bayar | **menunggu review** | `in_review` yang memilih tanggal saat checkout, lalu ditagih sebelum sempat direview |
| 65 | menunggu bayar | **perlu revisi** | ditandai **spam**, tetap disuruh bayar |
| 5 | menunggu bayar | **perlu revisi** | **ditolak**, tetap disuruh bayar |

Dua jebakan yang baru ketahuan justru saat mengadu — keduanya sudah dikunci di
kode, dan urutan cabang di `orderStepOf` tidak boleh dibalik karenanya:

- **Lunas mengalahkan review.** 156 order ber-`submission_status = 'in_review'`
  tapi `payment_status = 'paid'` — sudah tayang, sudah selesai, hanya kolomnya
  tidak pernah dimajukan. Menaruh sumbu review di atas akan memundurkan ke-156
  order itu jadi "menunggu review" di layar penelitinya sendiri.
- **Tanpa tanggal = belum memilih jadwal**, apa pun kata sumbu tayang. 4 order
  `slot_reserved` tidak punya tanggal sama sekali (kejanggalan yang sudah dicatat
  `sql/46`); menyuruh mereka membayar sesuatu tanpa jendela tayang adalah jalan buntu.

**Ikut terbetulkan tanpa diminta: Kilat.** Tanggal cermin sudah instant yang benar
(gelombang 08/11/14/17 WIB), jadi `normalizeScheduleDate` yang memaksa 15.00 tidak
dipakai lagi di jalur ini — dan Mimin AI berhenti memberi tahu peneliti Kilat bahwa
iklannya mulai pukul 15.00.

Paritas kolom sebelum menukar sumber, semuanya **0 selisih**:

| Cakupan | Hasil |
|---|---|
| ordinal 1 — 974 baris × 12 kolom vs `form_submissions` | **0** |
| ordinal 2+ — 12 baris × 16 kolom vs `form_submissions_extend` | **0** |

Karena itu kartu jadwal ke-2 dst. tidak berubah sedikit pun. Nomor kartunya kini
dari `ad_schedules.ordinal` (yang dinomori ulang `resync_ad_schedule_ordinals()`),
bukan dari posisi array — jadi "Jadwal Iklan 2" di layar peneliti dan di papan admin
akhirnya baris yang sama.

**`components/ProgressTracker.tsx` dihapus.** `getCurrentStepIndex` dan
`computeEffectiveExtendStatus` kehilangan seluruh pemanggilnya. Sisanya,
`normalizeScheduleDate`, pindah ke `utils/airing-window.ts` tempat aturan waktu WIB
memang tinggal; ujinya berhenti menyalin ulang rumus itu dan kini memanggil fungsi
sungguhan — dulu keduanya bisa menyimpang tanpa satu pun uji gagal.

**Task 12 baru separuh, dan batasnya disengaja.** Yang dibaca peneliti sudah bersih
(lima kunci terjemahan; dua di antaranya dihapus karena `payExtension` tidak lagi
punya alasan ada dan `extendWaitingPaymentAlert` nol pemanggil). Yang **belum**:
identifier kode (`ExtendSection`, `FormSubmissionExtend`, `entity_type='extend'`) —
selama tabelnya masih bernama itu, menggantinya cuma memindahkan kebingungan; ia
milik Task 11 langkah 5. Dan nama item invoice `'Extend Iklan (ads)'`
([`ExtendSection.tsx:350,380`](../multi-step-form/src/components/ExtendSection.tsx))
yang terkirim ke DOKU — menunggu finance diberi tahu.

### Phase 3 — Task 9A (`sql/46`) + papan Schedule, commit `478d550`..`d7639df` (2026-08-08)

**Pembagian permukaan yang berlaku sekarang** — ini yang paling menentukan untuk
sesi berikutnya, dan ia **membatalkan** gambaran lama "tab Jadwal Iklan terpadu
sebagai tempat kerja":

| Permukaan | Perannya |
|---|---|
| **Submissions** | **tempat kerja.** Review → jadwal → bayar, semuanya dalam satu drawer |
| **Schedule** | **papan pantau.** Nol aksi, hanya baca + deep-link ke drawer |
| **Pages** | kelola halaman (perombakannya task terpisah, belum dikerjakan) |

**Sejak 2026-08-09 "tempat kerja" itu benar-benar utuh.** Menjadwalkan dan menagih
dulu melempar admin ke halaman penuh `SchedulePaymentView` (breadcrumb
`Submissions › Schedule`) — daftar order hilang, drawer tertutup. Keduanya kini
sub-tampilan **di dalam** drawer, dan berlaku untuk **semua ordinal**; sebelumnya
jadwal ke-2 dst. tidak punya jalur menyunting sama sekali. `SchedulePaymentView.tsx`
dan `ExtendSection.tsx` dihapus. Yang masih mengambil alih layar tinggal
`PageBuilderModal` — sengaja, karena ia editor dokumen dengan rail pratinjau 360px,
bukan formulir; pembagian yang sama sudah dipakai drawer papan Schedule.

Alasannya perilaku, bukan model data: rute review manual adalah **satu percakapan**
dengan peneliti dari feedback sampai tagihan. Memecahnya jadi dua station memutus
percakapan itu. Rute yang satunya — order auto-approval yang bayar sendiri lewat
DOKU — tidak pernah lewat percakapan admin sama sekali; di situ pertanyaannya
"mana yang lunas tapi halamannya belum dibuat", dan itu pertanyaan pantau.
**Dua rute, dua pintu masuk.**

**`sql/46` (Task 9A)** memberi cermin sumbu kedua:

- kolom `review_status` — sumbu review, milik ORDER, lewat `review_status_of()`
  (terjemahan harfiah `getDisplayStatus()` di `lifecycle.ts`)
- `status` jadi sumbu **tayang saja**, lewat `airing_status_of()`, dengan tiga
  nilai yang selama ini runtuh: `unscheduled` · `requested` · `slot_reserved`
- **cabang DELETE dibuang** — satu order = satu baris ordinal 1, SELALU

Yang kedua menutup lubang yang baru ketahuan saat mengukur: **87 order tidak ada
di cermin sama sekali**, karena trigger `sql/41` menghapus barisnya begitu
`start_date` jadi NULL. Cermin **896 → 983**, ordinal 1 **884 → 971**.

Verifikasi sesudah diterapkan, semuanya **0**: selisih ordinal 1, order tanpa
baris, selisih perpanjangan, `review_status` salah baris-demi-baris,
`review_status` NULL, `status` salah baris-demi-baris. **Sidik waktu tidak
berubah** (896 baris, `a4cf99aa345c397ea148528464b7dc16`) — tidak ada satu detik
pun yang bergeser.

**Papan Schedule** (`ScheduleBoardPage`) adalah **pembaca pertama** `ad_schedules`
— sampai `sql/46` tabel itu cermin satu arah tanpa satu pun pembaca di klien,
edge function, view, maupun fungsi DB. Tiga tampilan: Agenda, Bulan, Kilat
(`KilatScheduleBoard` kini di-host di sini juga).

Yang bisa dilakukannya dan Page Calendar tidak:

- menampilkan order **tanpa jadwal** — 90 entri, **4 di antaranya sudah LUNAS**
- membedakan empat keadaan yang dulu runtuh jadi `waiting_payment`
- perpanjangan sebagai baris berurut `#1`/`#2`/`#3` dengan status tayang
  masing-masing
- menyaring sama sekali (Page Calendar: `const filteredEvents = events;`)

**Drawer Submissions** digabung: tab Reservasi + Payment jadi **"Jadwal & Bayar"**,
karena aksi utama keduanya membuka `SchedulePaymentView` yang sama. `ExtendAction`
pindah ke sana, dan **pagar `!existingPage` dicabut karena itu bug** (lihat
§Jebakan no. 8).

### Phase 0 — `sql/36`–`39`, commit `05a2fa1`

- `sql/36` cabut gerbang banner dari `cron_activate_extends()`
- `sql/37` `get_schedule_batch_context` — insentif batch tidak lagi ditagih dua
  kali; `get_batch_rewards` menyaring baris parent `rejected`/`spam`
- `sql/38` larang satu survei tayang di dua jendela sekaligus
- `sql/39` **DITARIK** — tinggal helper `airing_instant_of_date()`, yang justru
  jadi fondasi semua perbandingan waktu berikutnya
- Perpanjangan kini ikut dihitung di kuota slot (`fetchSlotAvailability`)

### Kilat — `sql/42`, commit `c554880`

Jembatan admin iklan regular → JFU Kilat, plus penjadwalan slot Kilat sendiri
(gelombang push 08/11/14/17 WIB, 2 order per gelombang, Senin–Jumat) lewat kolom
baru `form_submissions.kilat_slot_hour`. Diterapkan ke DB 2026-08-04.

Sekalian menutup tiga lubang tagih di sisi admin — jalur user lewat
`/api/doku/create-payment` sudah benar sejak awal:

- invoice manual admin menagih Kilat dengan rumus regular (add-on Rp 250.000
  tidak pernah masuk, base rate dikali durasi yang tidak berarti);
- `ensure_survey_page()` menerbitkan halaman iklan untuk order Kilat yang lunas —
  kartu di feed aplikasi plus satu tempat di `display_order`, tidak dibayar
  siapa pun;
- `SchedulePaymentView` mengukur kapasitas Kilat terhadap pool iklan **regular**.

Jam Kilat sebelumnya tidak pernah tersimpan: `start_date` bertipe `DATE` dan
`updateScheduleDates()` memaku setiap jadwal ke 15.00 WIB. Karena itu kolom
terpisah, dan `updateKilatSchedule()` menulis langsung tanpa lewat fungsi itu.

### Kilat — papan jadwal di Ads Schedule, commit `a4fc499`

Detail lengkap di §0B di atas. Ringkas: toggle Iklan/Kilat di halaman Ads
Schedule (`KilatScheduleBoard.tsx` + `fetchKilatSchedule`/
`countKilatPagesLeak` di `supabase.ts`), deep-link klik-entri → drawer order di
Submissions, dan penutupan lubang "Create Page" untuk order Kilat di dua lapis
(`getPendingSlotsWithoutPage` + guard di `PageBuilderModal.handleSave`).
**Belum dideploy, belum diuji manual di browser** — hanya tsc + build.

### Phase 1 — `sql/40`, commit `7ec7c28`

Halaman iklan terbit otomatis dengan banner default saat order lunas.
`ensure_survey_page()` + trigger `trg_form_submissions_ensure_page` + indeks unik
`uq_survey_pages_submission`. Ketiganya dikonfirmasi ada di produksi 2026-08-04.

### Phase 2 Task 8 — `sql/41`, merge `b4ed204`

`ad_schedules` sebagai **read-model satu arah** (lama → baru). Nol perubahan kode
aplikasi — belum ada yang membaca maupun menulisnya.

Diterapkan & diverifikasi di produksi 2026-08-04: **866 baris** (856 jadwal
pertama + 10 perpanjangan), selisih nol di kedua sumber, penomoran urut
`start_date` tanpa lubang, dan pengangkatan DATE → 15.00 WIB benar di jalur
backfill maupun trigger.

Sebaran status hasil pemetaan: `waiting_payment` 532 · `live` 169 · `cancelled`
76 · `scheduled` 55 · `paid` 21 · `completed` 13.

### Phase 2 Task 8B-1 — `sql/44`, commit `01ef96a`..`d730571`

**Satu sumber angka hadiah.** SQL diterapkan 2026-08-04, kode di-merge ke `main`
(fast-forward) dan **dideploy 2026-08-05**.

Agregasi batch dulu ditulis **dua kali** — RPC `get_batch_rewards` (`sql/37`) untuk
Mode 2 `/api/respondents`, dan `buildBatches()` di `respondents.js` untuk Mode 1 —
dan keduanya sudah menyimpang. Sekarang `get_batch_rewards_bulk` (`sql/44`) adalah
satu-satunya implementasi; `get_batch_rewards` jadi pembungkus tipis di atasnya
dengan tanda tangan **tidak berubah sedikit pun** (kontrak platform pengundian).

Sekalian: halaman survei publik dan feed aplikasi Jakpat berhenti membaca
`form_submissions.prize_per_winner × winner_count` mentah. Kolom itu hanya pernah
memuat apa yang didanai jadwal **pertama**, jadi top-up ke batch berikutnya sampai
ke platform pengundian tapi **tidak pernah** terlihat oleh responden yang diminta
menjawab. Ditutup juga bug uang laten di `ExtendSection`: invoice top-up membangun
qty dari winner count order **induk**, padahal preview di layar sudah memakai
`poolWinnerCount` yang benar — preview dan tagihan bisa berbeda angka.

Hasil verifikasi di produksi:

| Uji | Hasil |
|---|---|
| PRE-CHECK: logika bulk vs `get_batch_rewards` hidup, seluruh submission | **0 baris beda** |
| Kontrak `pg_get_function_result` sebelum & sesudah | **string identik** |
| Pembungkus vs bulk, seluruh submission | **0 baris beda** |
| SQL vs JS lama — apa adanya / disimulasikan 10:00 WIB | **0 / 2 survei** (260 `beda_end_date`) |
| Kenetralan nilai halaman publik | **266 halaman, 0 nominal berubah, 0 kehilangan angka** |
| Hak akses `anon` (`SET LOCAL ROLE`, lalu POST `/rest/v1/rpc` dgn anon key) | **berhasil, `200`** |
| **Mode 1 vs Mode 2, blok `batches` field demi field** | **43 slug, 43 identik, 0 beda** |

Uji terakhir itu yang paling berarti: 10 survei dengan batch masih berjalan, 30
sampel lampau, plus 3 halaman pengumuman (yang benar-benar mengembalikan
`batches: []`). Sebelum perubahan ini, kesamaan itu tidak pernah dijamin.

**Yang berubah di mata konsumen API:** setiap perbedaan adalah **Mode 1
dikoreksi**, Mode 2 tidak bergerak. Yang terbesar, `can_select_winners` tidak lagi
menyala delapan jam terlalu cepat di hari terakhir tayang — sisi SQL sudah
mengangkat `end_date` ke 15.00 WIB sejak `sql/39`, sisi JS masih membacanya mentah
sebagai 00.00 UTC. Bug itu berulang **setiap hari terakhir setiap survei yang
tayang** dan tidak pernah menghasilkan keluhan, karena korbannya bukan konsumen
API melainkan responden yang diam-diam tidak ikut diundi. Pergeseran `period.*`
+8 jam menyentuh 266 batch **teksnya**, tapi 256 sudah lewat dan **tidak satu pun
tanggalnya berpindah** — inert. Dikonfirmasi pemilik produk: `can_select_winners`
belum difungsikan di dashboard pengundian, jadi tidak perlu dikabarkan ke konsumen.

**Uji top-up ujung ke ujung: LOLOS.** Dijalankan admin di dashboard produksi
2026-08-05. Ini satu-satunya dari sepuluh verifikasi yang membuktikan *tujuan*
task — sembilan lainnya membuktikan tidak ada yang rusak. Sepanjang umur sistem,
top-up hadiah belum pernah sekali pun sampai ke responden; sekarang sudah.

**Ganda-tagih Rp 425.000 — insiden lampau, data tidak disentuh.** Dua pool penuh
pernah masuk ke satu batch yang sama (Juli 2026: "Studi Pengambilan Keputusan"
Rp 50.000 + "Faktor-Faktor Psikologis" Rp 375.000); `MAX()` di agregasi menelan
yang kedua tanpa jejak. Keduanya dibuat **sebelum** `sql/37` diterapkan, dan
`sql/37` sudah menghentikan penyebabnya — tidak ada kasus baru sejak itu. Yang
belum hilang adalah **bentuk datanya**: selama tidak ada entitas pool, uang masih
bisa tertelan diam-diam. Itu yang jadi alasan ke-2 kenapa `reward_pools` (8B-2)
wajib ada sebelum Phase 4. Keputusan 2026-08-04: dicatat, **data tidak disentuh**,
refund diputuskan terpisah.

### Phase 2 Task 8C — `sql/43`, commit `e8a77a6`..`06161c1`

Pensiunkan sisa fitur pengundian di dashboard. `sql/43` sudah diterapkan
2026-08-04, tapi kodenya sempat tersangkut sebulan di branch revamp visual —
keadaan paling rawan di seluruh papan: **DB maju, kode belum.** Dibereskan
2026-08-05 dengan cherry-pick lima commit ke `main`, **tanpa** ikut menayangkan
revamp visualnya.

Cherry-pick-nya bersih karena jejak 8C ternyata cuma dua berkas sumber:
`main` memegang `PublishPageManagement.tsx` dan `SubmissionsManagerView.tsx`
**byte-identik** dengan induk commit 8C pertama, jadi patch-nya mendarat persis
seperti saat ditulis. Hasilnya juga dibuktikan byte-identik dengan versi di branch
visual — yang tayang adalah kode yang sudah ditulis dan diuji di sana, bukan
rekonstruksi.

Diverifikasi di bundle yang benar-benar tayang (2026-08-05): SHA-256 chunk di
server **identik** dengan hasil build lokal dari `main`; string `"Respondents"`
muncul 3×; string **`"Select Winners"` 0×** — indikator merah yang menyala
permanen sejak Mei 2026 benar-benar hilang dari produksi.

Typecheck justru **membaik**: 80 → **76**, nol error baru, dan keempat yang hilang
semuanya di `SubmissionsManagerView.tsx` — berkas yang 8C bersihkan.

Deret `sql/` kembali utuh: `42, 43, 44, 45`.

### Phase 2 Task 8D — `sql/45`, commit `20206a0`

`ad_schedules` mengenali Kilat. `sql/41` mengangkat setiap `DATE` ke 15.00 WIB —
benar untuk iklan regular, salah untuk Kilat, yang didorong dalam gelombang
08/11/14/17 WIB. Sembilan order Kilat berjadwal, sembilan-sembilanya tercermin
15.00 → 15.00; order yang benar-benar didorong pukul 08.00 tercatat tayang tujuh
jam kemudian.

Ditemukan lewat pertanyaan "bisakah lanjut ke Phase 3?" — bukan lewat keluhan,
karena belum ada pembacanya. Diperbaiki **sebelum** Phase 3 dibangun di atasnya,
bukan sesudah.

Diterapkan & diverifikasi di produksi 2026-08-05:

| Uji | Hasil |
|---|---|
| Jam Kilat cermin ≠ `kilat_slot_hour` | **0** |
| Iklan regular jam ≠ 15.00 WIB | **0** dari 872 |
| Iklan regular tanggal bergeser | **0** |
| Kilat tanpa gelombang bukan 00.00 WIB | **0** dari 3 |
| Total baris / selisih ordinal 1 / ordinal 2..n | **881 / 0 / 0** |
| Baris belum terstempel `distribution_type` | **0** |
| Papan jadwal admin vs cermin (9 order Kilat) | **9 cocok, 0 beda** |

Sekalian menutup lubang yang ditemukan di jalan: daftar `UPDATE OF` trigger
`trg_ad_schedule_from_submission` tidak memuat `distribution_type` maupun
`kilat_slot_hour`, jadi mengubah gelombang secara prinsip tidak membangunkan
cermin. Laten — penulisnya selalu ikut menyentuh `start_date` — tapi menganga
permanen. Dibuktikan tertutup lewat `pg_trigger.tgattr`: trigger sekarang
mendengarkan **16 kolom**, kedua kolom itu termasuk.

**Order Kilat tanpa gelombang mendarat di 00.00 WIB, bukan 08.00** — keputusan
sadar, 3 dari 9 baris. 00.00 bukan gelombang mana pun, jadi tidak bisa disangka
jadwal sungguhan dan tidak menggelembungkan kuota gelombang; barisnya tetap
terlihat admin. `kilat_slot_hour IS NULL` penandanya — **jangan baca jam dari
`start_date` tanpa mengecek kolom itu.**

> ⚠️ **Temuan di luar cakupan, belum diputuskan.** Ke-11 order Kilat punya
> `prize_per_winner > 0`, tapi Kilat tidak pernah punya halaman iklan — sehingga
> hadiahnya **tidak pernah sampai ke platform pengundian lewat jalur mana pun**
> (`/api/respondents` Mode 1 hanya melisting halaman terbit, Mode 2 dicari lewat
> slug halaman). Kalau responden Kilat memang ikut diundi, ada lubang di sana yang
> tidak bisa ditutup migrasi.

---

## Yang belum dikerjakan

Detail lengkap tiap task ada di
[`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md).
Urutan wajib: **~~8B-1~~ → 8C → 9 → 10 → 11 → 12 → 13**, masing-masing rilis sendiri
(expand-and-contract). Tidak ada satu langkah pun yang mengharuskan semua lapis
berubah serentak. 8B-2 keluar dari urutan ini — ia pindah jadi prasyarat Phase 4.

| Task | Isi | Catatan |
|---|---|---|
| ~~**8B-1**~~ | ~~Satu sumber angka hadiah + top-up jadi mulus~~ | ✅ **selesai & live 2026-08-05** (`sql/44`). Risiko terbesarnya — dua agregasi batch yang bisa menyimpang — sudah hilang secara struktural, bukan ditambal. |
| **8B-2** | `reward_pools` — pool jadi milik batch, bukan milik jadwal pertama | ⏸️ **Ditunda jadi prasyarat Phase 4**, bukan bagian Phase 2. Hari ini semua yang diobatinya masih laten (10 perpanjangan seumur hidup, 0 top-up terpakai, 0 pool yatim) — Phase 4 yang membuat ketiganya hidup sekaligus. ⛔ Sebelum tabelnya dirancang, jawab dulu: **83 order sudah mendanai hadiah tanpa punya tanggal sama sekali**, sehingga kunci `(submission_id, period_batch)` tidak punya tempat untuk mereka. Nomor filenya `sql/50` — sudah bergeser tiga kali (dari `45`, lalu `47`, lalu `49` dipakai perbaikan bug jam tayang kustom 2026-08-10); lihat baris "Peta dokumen" di bawah untuk alasannya sebelum menulis migrasinya. |
| ~~**8C**~~ | ~~Pensiunkan sisa fitur pengundian di dashboard~~ | ✅ **selesai & live 2026-08-05.** Dipindah ke `main` lewat cherry-pick tanpa ikut menayangkan revamp visual. Indikator "Select Winners" terbukti hilang dari bundle produksi. |
| ~~**8D**~~ | ~~`ad_schedules` mengenali Kilat~~ | ✅ **selesai & live 2026-08-05** (`sql/45`). Prasyarat Phase 3 yang pertama — sudah lunas. |
| ~~**9**~~ | ~~Pisahkan status order dari status jadwal~~ | ✅ **selesai 2026-08-08.** 9A = `sql/46` (cermin dapat sumbu kedua), 9B = dashboard peneliti membacanya. Diadu atas seluruh 971 order: 664 identik, 307 berubah, semuanya perbaikan. **Belum tayang** — ikut branch ini. |
| **10** | Satukan aturan waktu & pembayaran | Cutoff 13.00/14.00 WIB berlaku seragam ke semua jadwal; `transactions`/`invoices` pakai `schedule_id`; **"Mark as Paid" jadi per-jadwal** (sekarang order-level dan bisa menandai lunas order tanpa jadwal sama sekali — 3 dari 522 order terukur begitu). |
| **11** | Pindahkan pembaca, lalu contract | ⚠️ View kompatibilitas WAJIB ada sebelum tabel aslinya disentuh, bukan sesudah. **Diperkecil oleh 8B-1:** `respondents.js` tidak lagi membaca `form_submissions_extend` sama sekali (query massalnya diganti RPC). Sisa pembaca serverless tinggal dua — `functions/api/storage-cleanup.js:74` dan `functions/api/doku/webhook.js:497,516` — plus pembaca di `src/`. |
| **12** | Istilah — semua jadi "Jadwal Iklan 1/2/3" | 🟡 **Separuh, sengaja.** Copy yang dibaca peneliti & admin ✅ selesai 2026-08-08. Sisa: identifier kode (`ExtendSection`, `FormSubmissionExtend`, `entity_type='extend'`) — menunggu Task 11 langkah 5, karena selama tabelnya masih bernama itu penggantian cuma memindahkan kebingungan. Plus nama item invoice `'Extend Iklan (ads)'` yang menunggu finance. Berhenti di API: nama field publik (`period_batch`, `batch_status`, `can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut berganti. |
| **13** | Tagihan fleksibel per jadwal | ⬜ **Disetujui 2026-08-09, terkunci di belakang Task 11.** Satu jadwal boleh punya beberapa invoice: tagihan susulan jadi **piutang yang terlihat** dan **tidak pernah menghentikan iklan yang sedang tayang**. Plus **batal reservasi per jadwal** dan **`is_extra_ad` pindah ke `ad_schedules`** (hari ini ia sifat ORDER — lihat jebakan no. 17). Sumber kebenaran uang pindah dari `ad_schedules.total_cost` ke invoice, yang sekalian membunuh `hasEverPaid`. **Sejak 2026-08-18 ia juga pembuka Phase 4** — harga per jadwal yang dilahirkannya adalah yang selama ini hilang (§00G). Rencana lengkap: [`2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md`](superpowers/plans/2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md) |

Setelah Phase 2: **Phase 3** (tab "Jadwal Iklan" terpadu di admin) menyusut jadi
mapper biasa, dan **Phase 4** (tombol "Jadwalkan Iklan Lagi" di dashboard user)
baru masuk akal dikerjakan. Dikerjakan **sebelum** Phase 2 rampung, Phase 3 justru
jadi adapter di atas dua model jadwal yang masih berbeda — persis pekerjaan yang
Phase 2 ada untuk menghapusnya. Rinciannya di §2 "Yang menunggu tindakan".

⚠️ **Phase 4 menunggu Task 13, bukan Task 11** (pemilik produk 2026-08-18). Task 11
tidak memblokirnya — view kompatibilitasnya membuat kode Phase 4 selamat tanpa diedit.
Yang mengunci adalah **harga jadwal ke-2 yang belum pernah ada rumusnya**, dan itu
lahir di Task 13. Bukti + prasyarat lengkapnya di §00G.

---

## ✅ Penghalang branch — sudah selesai 2026-08-05

*(Disimpan sebagai catatan sejarah: ini penghalang yang paling sering muncul di
dokumen ini, dan berguna tahu kenapa ia akhirnya hilang.)*

Task 9, dan sebagian Task 10 dan 12, menyasar file yang tidak ada di `main`:

- `src/components/status/deriveOrderUiState.ts`
- `src/components/status/airingPeriods.ts`
- `src/components/status/SchedulePhase.tsx`

Ketiganya lahir di branch **`feat/dashboard-soft-dna-navbar`** — padahal rencana
Phase 2 semula melarang menumpang branch itu supaya kedua pekerjaan bisa
di-revert sendiri-sendiri. Larangan itu **dicabut** 2026-08-05 karena tidak bisa
dipatuhi.

Task 8B-1, 8C, dan 8D dikerjakan dari `main` lewat branch sendiri lalu
fast-forward; semuanya live dan bisa di-revert sendiri-sendiri. **Task 9 ke atas
tidak bisa begitu**, jadi arahnya dibalik: `main` yang di-merge **ke dalam**
branch revamp, bukan sebaliknya.

Merge itu dijalankan 2026-08-05 sore dan bersih di sisi kode (dua konflik
dokumentasi saja). Sejak itu branch **tidak lagi tertinggal** dari `main`, dan
seluruh sisa Phase 2 + Phase 3 berjalan di sana. Rinciannya di §2.

Kalau perlu memastikan branch masih sejajar sebelum sesi baru:

```bash
git log --oneline feat/dashboard-soft-dna-navbar..main   # harus kosong
```

---

## Jebakan yang sudah memakan waktu — jangan diulang

1. **`form_submissions.status` BUKAN kolom status.** Isinya jenjang pendidikan
   peneliti (`Mahasiswa`, `Dosen`, `Mahasiswa S2 (Master)`, …). Yang dibaca
   `deriveLifecycle` sebagai `status` sebenarnya `submission_status` yang
   di-alias ulang di `supabase.ts:1365`; kolom DB-nya dipetakan ke `education` di
   `InternalDashboard.tsx:201`.
2. **Dua tabel menyimpan tipe waktu berbeda.** `form_submissions.start_date` =
   `DATE`, `form_submissions_extend.start_date` = `TIMESTAMPTZ`. DATE berarti
   15.00 WIB pada hari itu; cast langsung mendarat di 07.00 WIB — delapan jam
   sebelum iklan tayang. Selalu lewat `airing_instant_of_date()` (`sql/39`).
3. **`payment_status` bukan bukti pembayaran.** Sebagian order dibayar di luar
   sistem dan kolomnya tetap `pending` selamanya. Jangan bangun logika uang atau
   hadiah di atasnya — filter berbasis pembayaran pernah dicoba di `sql/37` dan
   ditarik karena menghapus hadiah dari 17 survei yang halamannya sudah tayang.
4. **Rencana Phase 2 yang benar hanya versi `main`.** File senama pernah berisi
   rencana lain (restrukturisasi 5 tab admin + set `requires_banner_update` dari
   client) yang premisnya keliru dan sudah dibuang di commit `4759a79`.
5. ~~**`ad_schedules` tidak tahu apa-apa soal Kilat.**~~ **Sudah diperbaiki**
   `sql/45` (Task 8D, 2026-08-05). Yang tersisa sebagai jebakan: **jangan membaca
   jam tayang Kilat dari `ad_schedules.start_date` tanpa mengecek
   `kilat_slot_hour`.** Order yang gelombangnya belum ditugaskan sengaja mendarat
   di 00.00 WIB — itu penanda "belum dijadwalkan", bukan jadwal pukul nol.
   Untuk iklan regular jamnya tetap 15.00 WIB lewat `airing_instant_of_date()`;
   untuk Kilat lewat `kilat_instant_of()`. Dua helper, dua aturan, jangan
   ditukar.
6. **Nol selisih bisa berarti "salah jam mengukurnya".** Divergensi SQL-vs-JS di
   8B-1 cuma hidup 00.00–08.00 UTC (07.00–15.00 WIB) — diukur di luar jendela itu
   hasilnya nol, dan task ini nyaris disimpulkan "tidak ada masalah". Kalau sebuah
   pengukuran menyangkut waktu, ukur dua kali: apa adanya, **dan** dengan `NOW()`
   disimulasikan ke dalam jendela yang dicurigai.
7. **`SELECT` biasa di SQL Editor tidak membuktikan hak akses apa pun** — ia jalan
   sebagai `postgres`. Untuk membuktikan `anon`/`authenticated` benar bisa (atau
   benar tidak bisa), bungkus dengan `BEGIN; SET LOCAL ROLE anon; … ROLLBACK;`,
   atau panggil endpoint REST-nya langsung dengan anon key. Pelajaran `sql/43`,
   dipakai lagi di `sql/44`.
8. **Pagar `!existingPage` di `ExtendAction` adalah BUG, bukan kebijakan.**
   Dikonfirmasi pemilik produk 2026-08-07: punya halaman iklan tidak pernah jadi
   syarat memesan jadwal berikutnya — syaratnya cuma tidak tumpang tindih, dan
   itu sudah ditegakkan `trg_submission_no_overlap` (`sql/38`) di DB. Akibatnya
   order regular yang **lunas tapi belum punya halaman** tidak pernah bisa
   menambah jadwal. Dicabut 2026-08-08 (`456c54b`).

   ⚠️ **Pagar Kilat yang menggantikannya JANGAN ikut dicabut.** Sebelum ini order
   Kilat terhalang **dua kali tanpa sengaja** — oleh `!existingPage` (Kilat tidak
   pernah punya baris `survey_pages`, guard `sql/42`) dan oleh pembungkus
   `!isKilat` di `PageTab`. Keduanya hilang saat aksi itu pindah tab, jadi
   pagarnya kini eksplisit. Alasannya bukan cuma aturan produk:
   **`ExtendSection` tidak mengenal Kilat sama sekali** — nol kemunculan
   `distribution_type`, harganya `calculateAdCostPerDay(questionCount) × durasi`
   (rumus regular). Untuk Kilat itu berarti add-on Rp 250.000 **tidak tertagih**
   dan base rate dikali durasi yang tidak punya arti (Kilat selesai ~2 jam).
   Membukanya butuh `ExtendSection` mengenal jalur distribusi lebih dulu: bukan
   sekadar rumus harga, tapi **pemilih gelombang alih-alih rentang hari**.
9. **`sql/40` menciptakan pekerjaan berulang yang tidak punya permukaan** —
   mengganti banner generik `/default-ad-banner.jpg` dengan banner asli, setiap
   kali sebuah order lunas.

   ⚠️ **`requires_banner_update` BUKAN penandanya.** Trigger `sql/40` menyetelnya
   `FALSE` pada setiap halaman yang ia buat (produksi 2026-08-07: `true` hanya
   pada **1** baris dari 274). Siapa pun yang membangun antrean banner di atas
   flag itu akan mendapat **tab kosong** lalu menyimpulkan tidak ada pekerjaan.
   Penandanya harus `banner_url`. Batasi juga ke halaman yang **masih akan
   tayang** — 243 dari 274 halaman iklan ber-`banner_url` NULL (peninggalan
   pra-`sql/40`) dan akan membanjiri antrean itu kalau ikut dihitung.
10. **Angka produksi basi dalam hitungan jam — jangan tulis uji berbasis
    konstanta.** Order masuk belasan per hari: 954 pada 2026-08-07 jadi **971**
    pada 2026-08-08. Rencana yang menyebut "sebaran harus tepat sembilan angka
    ini" sudah salah keesokan harinya. Tulis verifikasi **relasional** — cermin
    diadu dengan sumbernya, selisih harus nol — dan pakai angka absolut hanya
    sebagai konteks. Pola yang dipakai `sql/46`.
11. **Snapshot berbasis `CREATE TEMP TABLE` tidak berguna kalau yang mengukur dan
    yang menerapkan bukan sesi yang sama.** TEMP table mati bersama koneksinya.
    Untuk membuktikan "tidak ada waktu yang bergeser" lintas sesi, pakai md5 atas
    `EXTRACT(EPOCH FROM …)` — bebas sesi **dan** bebas setelan TimeZone (`::text`
    ikut berubah mengikuti TimeZone sesi; epoch tidak). Pola yang dipakai
    `sql/46` §6(4)/§7(5).
12. **`.in()` dengan daftar id yang tumbuh akan mati di panjang URL — dan matinya
    berbunyi `400`, bukan `414`.** PostgREST menaruh filter di query string, jadi
    `submission_id=in.(…)` berisi 954 UUID = **±35 KB URL**. Terukur di produksi
    2026-08-08: **600 UUID (≈22 KB) lolos, 700 (≈26 KB) ditolak**. Papan Schedule
    kena persis di sini dan **gagal memuat sejak hari pertama** — layar kosong,
    `0 order · 0 jadwal`, pesannya cuma `Bad Request` tanpa menyebut panjang sama
    sekali. Diperbaiki lewat `selectSurveyPagesByIds()` (potongan 200, paralel).

    ⚠️ **Ini lolos dari seluruh verifikasi karena verifikasinya dijalankan lewat
    SQL, bukan lewat REST.** Angka-angkanya semua benar — dan tidak satu pun
    menyentuh jalur yang benar-benar dipakai browser. Sama persis dengan jebakan
    no. 7, cuma sumbunya beda: di sana yang dilewati **hak akses**, di sini yang
    dilewati **gateway**. Untuk fitur yang membaca banyak baris, buktikan sekali
    lewat `curl` ke `/rest/v1/` dengan anon key sebelum menyatakan selesai.

    Aturan turunannya: daftar id yang **tidak pernah menyusut** (seluruh order
    sepanjang sejarah) wajib dipotong. Daftar yang disaring status aktif boleh
    utuh — ia menyusut lagi saat order selesai. `getPendingSlotsWithoutPage` (64
    id) dan peta `is_extra_ad` (317 id) masuk kategori kedua.
13. **`grid-cols-[…1fr]` + judul panjang = kisi berantakan, dan `.grid` warisan
    membunuh `gap-*`.** Dua jebakan yang selalu muncul bersamaan, dan bersama itu
    pula yang merusak papan Kilat sampai tidak terbaca:

    - `1fr` sama dengan `minmax(auto, 1fr)`. Isi yang lebih lebar dari jatahnya
      **melebarkan** trek-nya, jadi satu judul survei panjang cukup untuk membuat
      kolom hari tidak lagi sama lebar. Selalu **`minmax(0,1fr)`**.
    - `truncate` pada anak flex tidak menyala tanpa **`min-w-0`** pada anak itu —
      `min-width` bawaannya `auto`, jadi ia menolak menyusut di bawah isinya.
    - `styles.css` memuat `.grid { display:grid; gap:1.5rem }` SESUDAH Tailwind,
      jadi tiap `gap-2` di elemen ber-`class="grid"` diam-diam jadi 24px. Dodge:
      tulis **`[display:grid]`**, bukan `grid` (lihat juga jebakan `.flex`).
14. **Sumbu review tidak boleh dievaluasi lebih dulu dari "sudah lunas".**
    Kedengarannya terbalik — review kan datang pertama — tapi datanya tidak
    mengikuti urutan itu. Terukur 2026-08-08: **156 order ber-`submission_status
    = 'in_review'` tapi `payment_status = 'paid'`**, sudah tayang dan sudah
    selesai; kolom statusnya tidak pernah dimajukan siapa pun. Menaruh cabang
    review di atas cabang lunas memundurkan ke-156 order itu jadi "menunggu
    review" di dashboard penelitinya sendiri.

    Urutan yang benar ada di `orderStepOf`
    ([`status/scheduleAxes.ts`](../multi-step-form/src/components/status/scheduleAxes.ts)):
    ditolak-dan-belum-pernah-bayar → **lunas** → review → tanpa tanggal → sisanya.
    Jangan dibalik tanpa mengadu ulang kedua algoritma atas seluruh tabel.

    Aturan turunannya, dan ini yang menemukan jebakan ini: **sebelum menukar
    sumber sebuah turunan, jalankan turunan lama dan baru berdampingan lewat SQL
    atas SELURUH baris, lalu jelaskan setiap selisih satu per satu.** "Nol
    selisih" bukan targetnya — targetnya "tidak ada selisih yang tidak bisa
    kujelaskan". Pola yang sama membuktikan 8B-1, 8D, dan 9B.
15. **Satu `normalizeScheduleDate` per berkas adalah utang, bukan kemudahan.**
    Sampai Task 9B ada **lima** salinan fungsi bernama sama di pohon ini, dan
    ujinya di `airing-window.test.ts` menyalin ulang rumusnya lagi sebagai
    "equivalent" — jadi salinan mana pun boleh menyimpang tanpa satu uji pun
    gagal. Yang di `ProgressTracker.tsx` sudah dipindahkan ke
    `utils/airing-window.ts` dan ujinya kini memanggil fungsi sungguhan. **Empat
    sisanya masih ada** (`PageBuilder/PageBuilderModal.tsx`,
    `pages/public/SurveyPage.tsx`, `pages/public/SurveyListingPage.tsx`,
    `utils/adOrdering.ts`) — dan semuanya memaksa 15.00 WIB, jadi **semuanya
    salah untuk Kilat**.
16. **Jangan menaikkan `ad_schedules.total_cost` untuk menagih tambahan.** Ada
    yang akan mengembalikannya: `functions/api/doku/create-payment.js:183-203`
    menghitung ulang harga dari input pricing, membandingkannya dengan
    `total_cost`, dan kalau berbeda ia **menimpa kolomnya** dengan hitungannya
    sendiri. Jadi satu percobaan bayar self-service menurunkan angka itu balik,
    diam-diam, di jalur uang. Arti kolom itu adalah **harga saat dipesan**, bukan
    "yang ditagih" — yang ditagih hanya bisa dijawab oleh `invoices`.
    Konsekuensi turunannya: `hasEverPaid` (`supabase.ts:2212`) memakai
    `.some(paid)`, jadi **satu** invoice lunas sudah cukup membuat kartu jadwal
    mengumumkan "Lunas". Selama satu jadwal cuma punya satu tagihan itu tidak
    kelihatan; begitu ada tagihan kedua, ia menyembunyikan tagihan terbuka.
17. **`is_extra_ad` adalah sifat ORDER, bukan sifat jadwal.** Ia hidup di
    `survey_pages` — satu baris per order — dan `fetchSlotAvailability`
    (`supabase.ts:1368`) melakukan lookup per `submissionId`, sehingga setiap
    jadwal mewarisi flag induknya. Task 11 langkah 1c malah menambahkan
    `UNIQUE (submission_id)` yang mengunci sifat itu. Siapa pun yang mengira
    "jadwal #1 reguler, #2 extra" bisa diungkapkan hari ini salah baca. Sumber
    keduanya: penanda legacy `[EXTRA_AD]` di `form_submissions.admin_notes`,
    yang masih dibaca di tiga tempat. Task 13 yang memindahkannya.

    ⚠️ Konsekuensi praktisnya: **jangan menawarkan pilihan Reguler/Tambahan di
    formulir jadwal** sebelum flag itu punya rumah di `ad_schedules`. Sebuah
    toggle sempat ditulis di `ScheduleForm` pada 2026-08-09 dan dicabut hari itu
    juga — ia memindahkan kolam kuota yang dibaca kalender tanpa menyimpan apa
    pun, jadi admin memesan ke kuota tambahan sementara jadwalnya tetap dihitung
    reguler, dan kolam reguler kelebihan jual.

18. **Kolom Tailwind responsif tidak berlaku di dalam panel sempit.**
    `grid-cols-4 sm:grid-cols-7` mengukur **viewport**, bukan lebar kontainer —
    di layar desktop ia jadi 7 kolom walau hidup di drawer 480px, lalu menggulung
    mendatar. Kalender slot karena itu menerima jumlah kolom sebagai **prop**
    (`SlotCalendar`), bukan lewat breakpoint. Lebar tersempit yang harus diuji
    adalah **`DetailPane` 520px** (dipakai pada ≥1280px), bukan sheet 576px.

19. **Dari tiga kalender pemesanan, hanya satu yang menghormati batas pesan
    13.00 WIB.** `SchedulePaymentView` dan `ExtendSection` tidak pernah mengimpor
    `airing-window` sama sekali, jadi keduanya mengizinkan admin memesan slot yang
    aturannya sudah tutup; hanya `RescheduleDialog` yang memanggil
    `isBookingClosedForDate`. Tertutup 2026-08-09 dengan menyatukan ketiganya ke
    `components/schedule/SlotCalendar.tsx`. **Jangan menyalin kalender keempat** —
    aturan yang lupa ikut tersalin tidak akan terlihat sampai ada yang tayang di
    hari yang salah.

20. **Kalender slot pernah berbohong dua kali sekaligus, dan keduanya membuat hari
    tampak lebih kosong dari kenyataan.** Ditemukan & ditutup 2026-08-09.

    a. **`excludeSubmissionId` membuang SELURUH jendela milik order itu**, bukan
       hanya jadwal yang sedang dipindah. Order berjadwal banyak jadi tidak
       melihat jadwalnya sendiri: hari yang sudah dipakai jadwal #2 tampil `0/4`
       saat admin memindahkan jadwal #1 ke sana, dan penolakannya baru muncul dari
       `trg_submission_no_overlap` (sql/38) setelah tombol simpan ditekan.
       `fetchSlotAvailability` kini punya `excludeSourceId` — cocokkan dengan
       `AdScheduleEntry.sourceId`, dan **pakai itu**, bukan yang per-order.

    b. **Tile hari ke-2 dst. tidak menghitung iklan yang sedang dipesan.** Iklan
       7 hari memakai tujuh slot; kalender hanya menaikkan angka di tanggal mulai,
       jadi rentang yang akan melewati kuota tidak terlihat sampai ditolak.
       `SlotCalendar` sekarang menampilkan `terpakai + 1` di setiap hari yang
       tertutup pilihan, dan memerahkannya kalau lewat kuota. ⚠️ Yang **mengunci**
       tile tetap angka yang benar-benar terpakai — kalau tidak, hari yang baru
       saja dipilih akan mengunci dirinya sendiri.

21. **Migrasi yang MENANDAI "sudah dikerjakan" tidak boleh mendahului kode yang
    mengerjakannya.** Papan ini sudah lama tahu bahaya "DB maju, kode belum"
    (`sql/43`, tersangkut sebulan) — tapi kasus itu **diam**: ia cuma menunggu.
    `sql/48` mengajarkan varian yang lebih buas: fungsinya mem-`POST` lewat pg_net
    lalu **langsung** menyetel `live_notified_at`, tanpa menunggu respons. Saat
    diterapkan 2026-08-10 sementara `functions/api/notify-ad-live.js` masih di
    branch, tiga order ditandai "sudah dinotifikasi" atas dasar **tiga `405`**.
    Emailnya hilang permanen — bukan tertunda. Detail & pemulihannya di §00A.

    Aturannya, untuk migrasi mana pun sesudah ini: kalau sebuah fungsi terjadwal
    menulis penanda kemajuan, **`cron.schedule` menyusul deploy, bukan
    mendahuluinya** — atau penandanya dipasang dari respons (baca
    `net._http_response`), bukan dari pengiriman. Bagian aditifnya (kolom, fungsi)
    tetap aman jalan duluan; yang harus ditahan cuma penjadwalannya.

    ⚠️ **`cron.job` `succeeded` tidak membuktikan apa-apa soal hasilnya.** Job-nya
    memang sukses — yang gagal ada di `net._http_response`, tabel lain. Sama
    keluarganya dengan jebakan no. 7 (SQL Editor bukan bukti hak akses) dan no. 12
    (verifikasi SQL melewati gateway REST): **ukur di lapisan yang benar-benar
    dilewati**, bukan di lapisan yang paling gampang di-query.

22. **Jam tayang kustom (admin) hidup di TIGA tempat dengan tiga nasib berbeda —
    ✅ SUDAH DIPERBAIKI `sql/49` (2026-08-10).** `ScheduleForm` sejak 2026-08-10
    punya kontrol "Jam Tayang (WIB)" untuk kasus khusus. Ditulis di sini
    sebagai "utang yang diterima", lalu terbukti nyata di prod dalam hitungan
    jam (order `#8462698a`, admin memilih 10.00 WIB — papan Schedule tetap
    menampilkan 15.00 dan admin melaporkannya sebagai bug). Sebelum membaca jam
    tayang dari mana pun, tahu dulu mana yang menjawab pertanyaanmu:

    | Tempat | Tipe | Jam kustom |
    |---|---|---|
    | `survey_pages.publish_start_date` | TIMESTAMPTZ | tersimpan & dihormati — ini yang benar-benar menggerbang tayang di halaman iklan + feed aplikasi |
    | `form_submissions.start_date` | DATE | mustahil menyimpan jam; **tanggalnya** benar (diturunkan `toWibYmd`); jamnya kini hidup terpisah di `airing_hour_wib`/`airing_minute_wib` (`sql/49`) |
    | `ad_schedules.start_date` (cermin) | TIMESTAMPTZ | **kini benar** untuk ordinal 1 — trigger memakai `airing_hour_wib`/`airing_minute_wib` kalau diisi, baru jatuh ke Kilat lalu ke `airing_instant_of_date()` bawaan |

    Untuk **jadwal ke-2 dst. tidak pernah ada masalah**: sumbernya
    `form_submissions_extend` (TIMESTAMPTZ) dan trigger cermin menyalin apa
    adanya, jadi jamnya sampai utuh ke papan Schedule.

    **Perbaikannya** persis presedennya sendiri: **kolom jam terpisah seperti
    `kilat_slot_hour`** — `form_submissions.airing_hour_wib`/`airing_minute_wib`
    (nullable, NULL = bawaan 15.00), ditulis `updateScheduleDates()`, dicermin ke
    `ad_schedules`, dan dibaca `sync_ad_schedule_from_submission()` sebelum jatuh
    ke cabang Kilat lalu ke `airing_instant_of_date()` bawaan — sama seperti
    `sql/45` menyelesaikannya untuk Kilat. `notify_primary_ads_live()` (sql/48,
    ditulis ulang oleh `sql/49`) dan `notify-ad-live.js` (hardcode "pukul 15.00
    WIB" dihapus) ikut mengikuti prioritas yang sama. Rincian lengkap & bukti
    prod: header `sql/49_ad_schedules_custom_airing_hour.sql`.

    ⚠️ **JANGAN mengoper instant UTC ke kolom `DATE`.** Postgres meng-cast-nya di
    zona sesi (**UTC** di Supabase), jadi setiap jam WIB di bawah 07.00 **mundur
    sehari**: 12 Agu 03.00 WIB = 11 Agu 20.00 UTC → tersimpan `2026-08-11`.
    Terbukti langsung di produksi. Yang membuatnya senyap: `survey_pages` tetap
    menyimpan instant yang benar, jadi iklannya tayang di hari yang benar
    sementara **seluruh penghitung** — cermin, `trg_submission_no_overlap`,
    kuota slot, `notify_primary_ads_live` — bekerja di hari sebelumnya.
    `updateScheduleDates()` karena itu menurunkan tanggalnya lewat `toWibYmd()`.
    Invariannya dikunci uji di `airing-window.test.ts` §7 (00.00 · 03.00 · 06.59
    · 07.00 · 15.00 · 23.30).

23. **`total_cost` pada jadwal ke-2 dst. adalah angka ketikan tangan, bukan harga
    yang dihitung.** `ScheduleForm.handleSaveCreate` menulis `total_cost: 0`; nilai
    sebenarnya diketik admin belakangan di `InvoiceForm`, tanpa validasi dan tanpa
    rumus. Terukur 2026-08-17 atas seluruh 13 baris `form_submissions_extend`:
    **7 di antaranya `0` atau di bawah Rp 10.000** (`1.000`, `1.110`, `1.110`,
    `1.103`) — sisa uji coba yang tidak pernah dibersihkan, sebagian bahkan
    berstatus `paid`.

    Dua akibat langsung. **(a)** Jangan pakai kolom ini untuk statistik uang,
    laporan, atau rata-rata harga — jumlahkan invoice. Task 13 memang memindahkan
    sumber kebenaran uang ke invoice dan mengembalikan arti `total_cost` jadi
    "harga saat dipesan". **(b)** Jangan berasumsi ada rumus harga jadwal ke-2
    yang tinggal dipanggil ulang: `cost-calculator` hanya melayani order pertama.
    Ini penemuan yang menunda Phase 4 ke belakang Task 13 — lihat §00G.

---

## Peta dokumen

| File | Isi |
|---|---|
| **`docs/jadwal-iklan-progress.md`** | ⬅️ file ini — titik masuk, status berjalan |
| [`superpowers/plans/README.md`](superpowers/plans/README.md) | **Indeks seluruh rencana** + statusnya; baca kalau bingung file mana yang masih berlaku |
| [`superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md`](superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md) | **Rencana Task 11** — `ad_schedules` jadi otoritatif, `form_submissions_extend` pensiun, `booking_id` lahir. Disetujui 2026-08-08, **terkunci sampai Phase 3 mendarat di `main`** |
| [`superpowers/plans/2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md`](superpowers/plans/2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md) | **Rencana Task 13** — multi-invoice per jadwal (tagihan susulan jadi piutang), batal reservasi per jadwal, Extra Ad jadi sifat jadwal. Disetujui 2026-08-09, **terkunci sampai Task 11 mendarat & dideploy** (butuh `schedule_id`) |
| [`superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md`](superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md) | **Rencana Phase 3** — judulnya sudah basi; baca kotak koreksi di kepalanya sebelum mengeksekusi apa pun dari sana |
| [`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md) | Rencana Phase 2 lengkap, Task 8–12 |
| [`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md) | Checklist uji setelah deploy frontend |
| [`superpowers/plans/2026-08-09-order-flow-reorder.md`](superpowers/plans/2026-08-09-order-flow-reorder.md) | **Rencana reorder flow order user** — Ringkasan sebelum Jadwal, gabung layar jadwal+bayar, P0 kebocoran anon, dua email transisi. ✅ committed 2026-08-10, masuk `main` 2026-08-18. **Tidak termasuk daftar Task 8–13 di atas** — workstream terpisah yang menumpang branch yang sama |
| `multi-step-form/sql/36`–`49` | Migrasi; tiap file memuat pre-check, verifikasi, dan rollback-nya sendiri di bagian bawah. Deretnya **utuh** sejak 2026-08-05 — lubang di `43` sudah ditutup. `46` = Task 9A (dua sumbu); `47`/`48` dipakai reorder flow order (P0 anon + email transisi); `49` dipakai perbaikan bug jam tayang kustom ordinal 1 (**bukan** `reward_pools` — tabrakan nomor ditemukan 2026-08-10, dua kali). `reward_pools` bergeser jadi `sql/50` |
| `multi-step-form/sql/54` | **Di luar alur Jadwal Iklan.** `doku_webhook_events` — jejak permanen notifikasi DOKU, dari insiden webhook 2026-08-10 ([rencananya](superpowers/plans/2026-08-10-doku-webhook-silent-failure.md)). Sengaja mengambil `54` dan bukan `50`, supaya tiga rencana yang sudah mengklaim `50`–`53` (`reward_pools`, Task 11, Task 13) tidak perlu bergeser untuk keempat kalinya — migrasi-migrasi itu saling independen, jadi urutan penerapan tidak jadi soal. **Nomor bebas berikutnya untuk pekerjaan Jadwal Iklan tetap `50`.** |
