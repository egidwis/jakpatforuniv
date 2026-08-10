# Reorder Flow Order + Perbaikan Hasil Audit

> ## ✅ SELESAI — commit di `feat/dashboard-soft-dna-navbar` 2026-08-10, belum di-merge
> Disimpan sebagai catatan sejarah. Jangan dieksekusi ulang. Indeks seluruh
> rencana ada di [`README.md`](README.md).
>
> **Catatan pasca-eksekusi (baca sebelum apa pun di bawah):**
> - Dikerjakan sebagai **dua commit** di `feat/dashboard-soft-dna-navbar`:
>   `090c062` (P0 keamanan, `sql/47`) dan `e7584b4` (reorder flow + P1/P2 +
>   dua email transisi, `sql/48`). Bukan branch terpisah — plan ini
>   menumpang branch yang sama dengan Task 9–12/Phase 3 (lihat
>   [`README.md`](README.md) §"Keputusan branch yang berlaku sekarang").
> - **Tabrakan nomor migrasi ditemukan saat eksekusi**: dokumen ini ditulis
>   sebelum tahu bahwa `sql/47` sudah dipesan untuk `reward_pools` (8B-2,
>   prasyarat Phase 4) di `docs/jadwal-iklan-progress.md`. P0 di sini
>   memakai `sql/47` untuk hal yang sama sekali berbeda (grant kolom anon)
>   karena ditulis lebih dulu dan diterapkan ke prod lebih dulu.
>   `reward_pools` sudah digeser ke **`sql/49`** di dokumen itu — kalau kamu
>   mengerjakan 8B-2, pastikan nomor filenya `49`, bukan `47`.
> - **Email transisi** direalisasikan beda dari draft awal di Bagian 3:
>   bukan trigger DB langsung, tapi pg_cron (job `notify-primary-ads-live`,
>   tiap 15 menit) + pg_net memanggil endpoint Cloudflare baru
>   (`functions/api/notify-ad-live.js`), karena `form_submissions.submission_status`
>   sengaja tidak pernah maju sendiri ke `'live'` — tidak ada hook DB alami.
>   URL + secret disimpan di Supabase Vault, bukan kolom biasa. Detail
>   lengkap di memory sesi `order-flow-reorder-implemented`.
> - Verifikasi 6 skenario di bagian "Verifikasi" di bawah dilakukan lewat
>   **code-trace**, bukan klik manual di browser (tidak ada tool browser di
>   sesi yang mengerjakan ini). Klik manual masih jadi PR sebelum merge.
> - Fallback API key Resend di `functions/api/send-submission-email.js:7`
>   **belum dihapus** — menunggu konfirmasi `RESEND_API_KEY` benar-benar ada
>   di env Cloudflare produksi. ⚠️ Kuncinya **sudah ada di `main`** sejak lama,
>   bukan dibawa branch ini, jadi merge tidak membocorkan apa pun yang baru —
>   tapi ia sudah telanjur di riwayat git dan harus **dirotasi**, bukan sekadar
>   dihapus dari berkas.
>
> **Koreksi hasil audit pra-merge 2026-08-10 — tiga hal di bawah menyimpang
> dari badan dokumen ini:**
>
> 1. 🔴 **`sql/48` diterapkan ke prod sebelum endpoint-nya dideploy, dan ia
>    membakar penandanya.** Cron `notify-primary-ads-live` sudah jalan
>    2026-08-10 02:15 UTC: **3 POST, ketiganya `405`** (route belum ada di
>    produksi), tapi ketiga order sudah ditandai `live_notified_at` — jadi
>    emailnya hilang permanen. Dua order lagi jatuh tempo 2026-08-10 15.00 WIB.
>    Penanganan lengkap + SQL pemulihannya ada di
>    [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md) §00A.
>    **Bukan cacat kode** — `notify_primary_ads_live()` berperilaku persis
>    seperti tertulis; yang salah adalah **urutan rilisnya**.
> 2. **`send-to-sheets.js` DIHAPUS, tidak dipindah ke service_role.** Bagian P0
>    di bawah (§"Dua endpoint…" no. 2) menulis rencana lama: "pakai
>    `SUPABASE_SERVICE_ROLE_KEY` … sekaligus menghidupkannya kembali". Yang
>    dieksekusi kebalikannya — pemilik produk memutuskan 2026-08-09 sinkronisasi
>    Sheets dicabut, jadi `send-to-sheets.js` ikut terhapus bersama
>    `mock-sheets.js` dan `src/utils/sheets-service.ts`. Baca §P0 no. 2 sebagai
>    catatan sejarah, bukan sebagai keadaan sekarang.
> 3. **Guard draft diimplementasikan separuh — dan separuh yang hilang memang
>    tidak diperlukan.** §"Yang ikut selesai" no. 1 meminta dua hal: validasi
>    tanggal, **dan** memundurkan `currentStep` ke langkah Jadwal bila tanggalnya
>    tidak sah. Yang ada di kode
>    ([MultiStepForm.tsx:103-123](../../../multi-step-form/src/components/MultiStepForm.tsx#L103-L123))
>    hanya validasinya (`isBookingClosedForDate`, mengosongkan
>    `startDate`/`endDate`/`startTime`). Rewind langkahnya jadi mubazir setelah
>    reorder: Jadwal kini **langkah terakhir** dan tanggal langsung dipakai di
>    detik yang sama ia dipilih, jadi tidak ada lagi layar lanjutan yang bisa
>    ditinggali dengan tanggal kosong. Kalau urutan step dibalik lagi kapan pun,
>    rewind itu harus dihidupkan.

## Context

Audit flow order user (2026-08-09) dilakukan dua lapis: lapis teknis (bug, keamanan, integritas
data — diverifikasi ke kode **dan** database produksi) dan lapis pengalaman (menelusuri layar
sebagai peneliti yang hendak memesan iklan). Beberapa dugaan awal terbantah dan dibuang; yang
tersisa di sini hanya yang terbukti.

Inti perubahan: **urutan flow dibalik** menjadi `Detail Survei → Ringkasan → Pilih Jadwal →
Countdown → DOKU` sesuai usulan pemilik produk. Ini bukan penataan kosmetik — ia menutup tiga
cacat sekaligus secara struktural (lihat Bagian 1). Fokus utama pengerjaan ada pada **copy tiap
layar**, karena keluhan utamanya adalah flow terasa patah-patah, bukan kurang fitur.

Keputusan produk yang sudah final dan tidak diperdebatkan lagi:
- **Jendela bayar 1 jam dipertahankan** — hanya kejelasannya yang diperbaiki, bukan durasinya.
- **Kilat tidak dikerjakan** — pintu masuknya (voucher `JFUSUHUD`) berakhir ~16 Agu 2026, setelah
  itu label "Segera Hadir" jadi jujur dengan sendirinya.
- **Jumlah responden tidak pernah dijanjikan.** Angka rata-rata boleh dipakai sebagai gambaran
  historis, tidak sebagai target.

---

## P0 — Kebocoran data pribadi pemesan (independen, bisa jalan duluan) 🔴

Tidak berkaitan dengan reorder; dipisah supaya tidak tersandera olehnya.

**Bukti produksi:** role `anon` punya grant `SELECT` di **seluruh 34 kolom** `form_submissions`,
dipasangkan policy `"Allow anon read published survey submissions"` yang membuka setiap order
dengan halaman iklan terbit. Terukur: **277 order terekspos, semuanya lengkap dengan email dan
nomor HP**; 32 di antaranya termasuk `admin_notes` internal. Anon key ada di bundle frontend
publik.

**Yang benar-benar dibutuhkan publik** (sudah ditelusuri seluruh konsumen anon):
`SurveyPage.tsx:187` (halaman iklan `/pages/:slug`) → `survey_url, start_date, end_date,
prize_per_winner, winner_count, criteria_responden`; `SurveyListingPage.tsx:45` dan
`functions/api/surveys.js:153` → `prize_per_winner, winner_count`; `functions/api/respondents.js`
→ `criteria_responden` (utamanya sudah pakai service_role). Tidak satu pun bersifat pribadi.

**Perbaikan** — migrasi `sql/47_restrict_anon_form_submissions.sql`:
```sql
REVOKE SELECT ON public.form_submissions FROM anon;
GRANT  SELECT (id, survey_url, start_date, end_date,
               prize_per_winner, winner_count, criteria_responden)
  ON public.form_submissions TO anon;
```
Policy RLS tidak disentuh. Grant `authenticated` tidak diubah.

### Dua endpoint yang harus ditangani bersamaan

Keduanya memakai `select('*')` dengan anon key, jadi setelah migrasi mereka **error izin kolom**,
bukan sekadar kosong. Keputusan pemilik produk: hapus yang mati, amankan yang hidup.

1. **`functions/api/form-data.js` → HAPUS.** Tidak punya satu pun pemanggil di seluruh kode, tapi
   masih hidup sebagai endpoint publik tanpa autentikasi yang mengembalikan satu baris penuh
   (termasuk email & nomor HP) hanya berbekal ID — jalur bocor kedua di samping P0.
2. ⛔ **TIDAK DIEKSEKUSI SEPERTI INI — endpoint ini akhirnya DIHAPUS, bukan diamankan.**
   Lihat koreksi no. 2 di kepala dokumen. Paragraf di bawah ditinggalkan apa adanya karena
   alasannya masih berguna (ia menjelaskan kenapa sinkronisasi Sheets memang sudah mati).
   **`functions/api/send-to-sheets.js` → pakai `SUPABASE_SERVICE_ROLE_KEY`** (pola yang sudah
   dipakai `respondents.js` & `doku/create-payment.js`). **Catatan: sinkronisasi Sheets ini
   sebenarnya sudah lama mati** — ia dipanggil tepat setelah order dibuat, padahal trigger
   `trg_form_submissions_ensure_page` baru membuat halaman survei **AFTER UPDATE** status
   pembayaran. Jadi saat fungsi itu jalan, order belum punya halaman terbit → policy anon menolak →
   404 "Form data not found", dan karena dipanggil *fire-and-forget* dari checkout, gagalnya tak
   pernah terlihat. Beralih ke service_role sekaligus menghidupkannya kembali.

---

## Bagian 1 — Reorder flow

### Struktur baru

| Lama | Baru |
|---|---|
| 1 Detail Survei → 2 Jadwal → 3 Review → bayar | 1 Detail Survei → 2 Ringkasan → 3 Jadwal & Bayar → DOKU → sukses |

Percabangan auto/manual pindah ke **satu titik**: akhir Ringkasan. Jalur otomatis lanjut ke
Jadwal; jalur manual berhenti dengan pesan menunggu verifikasi.

```
              /dashboard/submit-iklan                    /dashboard/payment/:id      /payment-success
        ┌──────────────┬──────────────┐          ┌───────────────────────────┐      ┌──────────┐
        │ ① Detail     │ ② Ringkasan  │          │ ③ Jadwal & Bayar          │      │  Sukses  │
   ────▶│    Survei    │─────────────▶│─────────▶│  Fase A ──kunci──▶ Fase B │─────▶│          │
        └──────────────┴──────┬───────┘  otomatis└───────────────────────────┘ DOKU └──────────┘
                              │                        ▲         │
                       manual │                        └─────────┘
                              ▼                     kedaluwarsa: kalender
                    ┌──────────────────────┐        aktif lagi DI TEMPAT
                    │ "Menunggu verifikasi │        (tanpa lempar balik)
                    │  maks. 2 hari kerja" │
                    └──────────────────────┘
                     kabar lewat email saat
                        tagihan terbit
```

### Langkah 3 = satu layar, dua fase (pilih jadwal + countdown menyatu)

Layar jadwal dan layar countdown digabung secara **pengalaman**, tetapi countdown **tetap punya
route sendiri** (`/dashboard/payment/:submissionId`). Route itu wajib dipertahankan karena punya
dua pintu masuk "kembali setelah pergi", yang tidak bisa dilayani state wizard (draft sudah dihapus
setelah submit): auto-redirect saat user punya order `waiting_payment`
([MultiStepForm.tsx:184](multi-step-form/src/components/MultiStepForm.tsx#L184)) dan CTA "Bayar
Sekarang" di kartu order ([deriveOrderUiState.ts:152](multi-step-form/src/components/status/deriveOrderUiState.ts#L152)).

- **Fase A (pilih)** — kalender aktif + ringkasan biaya. CTA "Kunci Jadwal & Lanjut Bayar" menulis
  baris order, lalu `navigate('/dashboard/payment/:id', { replace: true })`. Batas route ini jatuh
  tepat saat baris order lahir — sebelum itu belum ada ID untuk dialamati.
- **Fase B (bayar)** — kalender **mengatup di tempat** menjadi satu baris ringkasan ("Tayang 12 Agu,
  15.00 WIB"), timer dan tombol bayar muncul di bawahnya. Kerangka kartu & header dipertahankan
  supaya terasa satu gerakan, bukan pergantian halaman.
- **Masuk kembali** (dua pintu di atas) mendarat langsung di Fase B — perilaku sekarang, tidak berubah.

**Keuntungan utamanya ada di pemulihan saat kedaluwarsa.** Sekarang: countdown habis →
`releaseExpiredSlot` → user klik "Pilih Tanggal Lain" → `prepareForReschedule` menulis ke DB →
menaruh draft di localStorage → melempar balik ke wizard. Itu jalur yang dulu memicu insiden survei
tertimpa dan yang menulis ke DB sebelum user mengonfirmasi apa pun. Setelah menyatu, kedaluwarsa
cukup **mengembalikan Fase A di layar yang sama** (kalender aktif lagi + pesan "slot dilepas"), dan
tanggal baru meng-`update` baris yang sudah ada — tanpa draft localStorage, tanpa lempar balik.

> Catatan: ini menyederhanakan kasus "slot habis saat di layar bayar", **bukan** semua reschedule.
> Reschedule dari kartu order yang sudah jadi tetap lewat `prepareForReschedule`.

### Yang ikut selesai tanpa diperbaiki terpisah

1. **Bug `startDate` terhapus** — [MultiStepForm.tsx:99-110](multi-step-form/src/components/MultiStepForm.tsx#L99-L110)
   memulihkan `currentStep` dari draft tapi **selalu mengosongkan** `startDate`/`endDate` setiap
   mount. User kembali ke step Review tanpa tanggal, lalu ditolak validasi dengan toast *"Tanggal
   dan waktu mulai iklan belum dipilih"* — persis yang dilaporkan. Setelah reorder, tidak ada lagi
   jeda panjang antara memilih tanggal dan memakainya.
   **Tetap tambahkan guard**: saat draft dipulihkan, validasi tanggal (masih ≥ hari ini, belum lewat
   cutoff 13.00 WIB via `isBookingClosedForDate`); bila tidak valid, kosongkan **dan mundurkan
   `currentStep` ke langkah Jadwal** — jangan tinggalkan user di Ringkasan dengan field wajib kosong.
2. **Voucher membatalkan jadwal diam-diam** — saat slot dipilih, voucher sudah diketahui, jadi
   pengguna `ILKOMUNY`/`JFUFEB` tidak pernah melihat pemilih slot sama sekali.
3. **Ketersediaan slot dicek pada momen paling segar** → lebih sedikit kejutan "slot penuh".

### Catatan implementasi

- **Satu tulisan ke database.** Ringkasan tetap layar klien murni. Baris `form_submissions` ditulis
  di titik kunci-jadwal (jalur otomatis) atau di titik konfirmasi Ringkasan (jalur manual). Jangan
  menulis dua kali — tidak boleh ada order setengah jadi bila user kabur.
- **Flow reschedule perlu disesuaikan**: `prepareForReschedule` kini melempar user ke
  `currentStep: 2` dengan asumsi step 2 = Jadwal ([StatusPage.tsx:242](multi-step-form/src/pages/dashboard/StatusPage.tsx#L242),
  [PaymentCheckoutPage.tsx:249](multi-step-form/src/pages/PaymentCheckoutPage.tsx#L249)) — arahkan
  ke langkah Jadwal yang baru.
- **Stepper `UnifiedHeader`** menduplikasi `isAutoApprovalPath` untuk menggambar langkah; ikut
  disesuaikan (otomatis 3 langkah, manual 2). Reuse `isAutoApprovalPath()` di
  [utils/review-path.ts](multi-step-form/src/utils/review-path.ts), jangan tulis ulang predikatnya.
- **Antisipasi tembok slot penuh di akhir**: tampilkan indikator ringkas ketersediaan di langkah
  Detail Survei (mis. "3 dari 4 slot minggu ini terisi") memakai `fetchSlotAvailability` yang sudah ada.

---

## Bagian 2 — Copy tiap layar (fokus utama)

Prinsipnya: **tiap layar ditutup dengan menyebut apa yang terjadi berikutnya, dan dibuka dengan
menegaskan apa yang barusan selesai.** Itu yang membuat flow terasa mengalir. Semua string baru
masuk `src/i18n/translations.ts` (id + en) — jangan hardcode.

### Langkah 1 — Detail Survei

Petunjuk di kolom **durasi** (jangkar historis, bukan janji):
> Rata-rata iklan di JFU menjangkau sekitar **200 responden per hari tayang**. Ini gambaran dari
> iklan sebelumnya, bukan jaminan — hasil tiap survei berbeda tergantung topik dan kriteria
> respondenmu.

Petunjuk di kolom **hadiah** (menjelaskan peran, bukan cuma nominal):
> Hadiah ini diundi ke responden yang mengisi surveimu. Fungsinya menaikkan minat mengisi, jadi
> survei yang lebih panjang biasanya perlu hadiah lebih besar.

CTA: **"Lanjut ke Ringkasan"** (bukan "Lanjut" polos).

### Langkah 2 — Ringkasan

Judul: **"Periksa pesananmu"**
Sub: *"Belum ada pembayaran di langkah ini — kamu masih bisa mengubah detail survei."*

CTA bercabang, masing-masing dengan kalimat penuntun di bawahnya:
- **Jalur otomatis** → tombol **"Lanjut Pilih Jadwal Tayang"**
  *"Setelah ini kamu pilih tanggal tayang, lalu menyelesaikan pembayaran."*
- **Jalur manual** → tombol **"Kirim untuk Diperiksa"**
  *"Tim kami memeriksa surveimu maksimal 2 hari kerja. Kami kabari lewat email begitu tagihan siap
  — belum ada pembayaran sekarang."*

Banner voucher verifikasi-manual **ditulis ulang** (versi sekarang tidak pernah menyebut jadwal):
> Voucher **{KODE}** perlu diverifikasi tim kami dulu. Karena itu pesananmu masuk antrean
> pengecekan (maks. 2 hari kerja) dan **jadwal tayang dipilih setelah verifikasi selesai**, bukan
> sekarang. Belum ada pembayaran di tahap ini.

### Langkah 3 — Pilih Jadwal Tayang *(hanya jalur otomatis)*

Judul: **"Pilih kapan iklanmu tayang"**
Sub: *"Iklan mulai tayang pukul 15.00 WIB di tanggal yang kamu pilih, lalu berjalan {durasi} hari."*
Catatan cutoff: *"Pemesanan untuk hari ini ditutup pukul 13.00 WIB."*
CTA: **"Kunci Jadwal & Lanjut Bayar"**
Penuntun di bawah CTA: *"Slot ditahan 1 jam setelah dikunci supaya kamu sempat menyelesaikan
pembayaran."*

### Fase B — countdown (di layar yang sama)

> Jadwal terkunci — **{tanggal}**, mulai 15.00 WIB.

Label timer **dinamis** sesuai tenggat yang sedang mengejar:
- normal → *"Slot ditahan — sisa {mm:ss}"*
- saat batas 14.00 WIB yang lebih dulu → *"Batas bayar hari ini (14.00 WIB) — sisa {mm:ss}"*

Keadaan kedaluwarsa — kalender aktif kembali **di tempat**, dengan pesan:
> Waktu pembayaran habis dan slot tanggal **{X}** sudah dilepas. Detail surveimu masih tersimpan —
> tinggal pilih tanggal lain di bawah ini.

### Penutup — halaman sukses setelah DOKU

Ini penutup sesungguhnya dari seluruh perjalanan order: DOKU **hanya** mengarah ke
`/payment-success`, `/payment-failed` tidak pernah jadi tujuan callback.

**Copy & perilaku baru — saat lunas:**
> ### Pembayaran diterima
> Iklan survei **{judul}** tayang **{tanggal mulai}** pukul **15.00 WIB**, dan berjalan
> **{N} hari** sampai {tanggal selesai}.

Tombol utama: **"Lihat Order Saya"** → `/dashboard`, bukan lagi "tutup halaman ini".

**Saat status belum lunas (webhook menyusul):** auto-poll 5 detik, judul *"Sedang mengonfirmasi
pembayaranmu"* bukan "Menunggu Pembayaran". **Detail transaksi**: baris **"Jadwal tayang"**
dihitung dari jendela tanggal (lihat Bagian 3), bukan kolom `duration` mentah.

---

## Bagian 3 — Perbaikan menyertai

### Email — peta sebenarnya (hasil cross-check, mengoreksi audit awal)

| Momen | Email? | Pengirim |
|---|---|---|
| User submit (**semua** jalur) | ✅ "Terima kasih… akan kami review" | Sistem kita (Resend) |
| Admin setujui + terbitkan tagihan | ❌ | — |
| User klik "Bayar Sekarang" | ✅ instruksi pembayaran | **DOKU** |
| Pembayaran diterima (webhook) | ❌ | — |
| Iklan mulai tayang | ❌ | — |

**Cacat lebih serius dari sekadar email dobel:** di jalur otomatis user hanya menerima satu email
dari kita — tetapi isinya salah untuk mereka (menjanjikan review yang tak pernah terjadi).

**Rancangan target:**
- **Jalur otomatis**: _tidak ada_ email submit → DOKU saat bayar → email **"iklan mulai tayang"**.
- **Jalur manual**: email submit (dibatasi ke jalur ini) → email **"disetujui, tagihan siap"** →
  DOKU saat bayar → email **"iklan mulai tayang"**.

*(Lihat catatan pasca-eksekusi di kepala dokumen ini untuk bagaimana kedua email baru itu benar-benar
direalisasikan — beda mekanisme dari yang dibayangkan di sini.)*

**Bersih-bersih menyertai:**
- `src/utils/email.ts` kode mati (hanya `console.log`, tanpa importer) — dihapus.
- 🔑 Kunci API Resend ter-hardcode di `send-submission-email.js:7` — fallback-nya **belum**
  dihapus, menunggu konfirmasi env var. Endpoint BARU (`send-invoice-ready-email.js`,
  `notify-ad-live.js`) ditulis bersih tanpa fallback ini sejak awal.

**Tombol "Hapus" yang berpura-pura berhasil.** `form_submissions` punya RLS aktif tetapi **nol
policy DELETE**. `.delete()` selalu mengenai 0 baris tanpa error, lalu UI menampilkan toast sukses
— order muncul lagi saat refresh.
→ Diganti soft-delete `submission_status = 'cancelled'`, dan `deleteFormSubmission()` melempar
error saat 0 baris.

**Durasi yang bertentangan dengan tanggalnya.** 18 dari 992 baris `ad_schedules` punya `duration`
yang tidak cocok dengan jendela `start_date → end_date`.
→ Dihitung lewat `airingDaysOf()`/`airingDayCount()`, bukan kolom `duration` mentah, di kartu
schedule DAN halaman sukses. `BookingSection` **tetap** memakai `duration` — harga memang dihitung
dari durasi yang dipesan.

**i18n halaman sukses.** Seluruh copy `PaymentSuccess.tsx` dipindah ke `translations.ts` (id + en)
sekalian dengan penulisan ulang copy-nya.

---

## Verifikasi

**P0** (uji sebelum & sesudah):
`curl "$URL/rest/v1/form_submissions?select=email,phone_number&limit=5" -H "apikey: $ANON"` harus
berubah dari mengembalikan data menjadi kosong/error. Regresi wajib: halaman listing survei publik
dan `/pages/:slug` tetap menampilkan hadiah; `/api/surveys` dan `/api/respondents` tetap normal;
user login masih melihat seluruh detail ordernya.

**Reorder + copy** — telusuri sebagai peneliti, dua jalur penuh:
1. *Otomatis*: Google Form tanpa PII → Ringkasan → Jadwal → countdown → DOKU → halaman sukses.
2. *Manual*: entri manual **atau** voucher `ILKOMUNY` → berhenti di Ringkasan dengan pesan tunggu,
   **tanpa** pernah menampilkan pemilih slot.
3. *Regresi bug draft*: di langkah Jadwal/Ringkasan, reload tab → pastikan tidak terdampar di
   Ringkasan dengan tanggal kosong.
4. *Kedaluwarsa di layar bayar*: biarkan timer habis → kalender harus aktif kembali **di layar yang
   sama** dengan pesan slot dilepas, dan memilih tanggal baru meng-update order yang sama.
5. *Masuk kembali*: tutup tab saat countdown berjalan → buka `/dashboard` → CTA "Bayar Sekarang"
   harus mendarat langsung di Fase B dengan sisa waktu yang benar.
6. *Reschedule dari kartu order*: pastikan mendarat di langkah Jadwal.

**Seluruhnya**: `npm run typecheck`, `npm run build`, lalu `graphify update .`.

Diukur ulang 2026-08-10 di puncak branch (`e7584b4`), dan **dua perintah memberi dua
angka** — sebut perintahnya kalau mengutip angkanya:

| Perintah | Hasil | Pembanding |
|---|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | **62** | baseline pasca-merge 74 (progress doc §2) |
| `npm run typecheck` (= `tsc -b`, ikut proyek node) | **63** | — |
| `npx vite build` | **hijau** | — |

Semuanya pre-existing (`TS6133` variabel tak terpakai di worker/util lama); **nol
error baru**. Angkanya **turun** dari baseline, bukan naik.

---

## Di luar cakupan — sudah diverifikasi, jangan dikerjakan

| Dugaan | Hasil |
|---|---|
| Reschedule bikin order "limbo" | Salah. Order jatuh ke state `choose_schedule` normal, tampil di "Butuh Aksi", pulih satu klik. |
| Harga client vs server bisa beda diam-diam | Aman. `create-payment.js` menghitung ulang dari DB, mengoreksi DB saat berbeda, lalu menagih nilai server. |
| Order Kilat menyimpan durasi salah | Terbantah data: 19 order Kilat semuanya `duration = 1`; 0 dari 16 baris `ad_schedules` Kilat drift. |
| Kilat "Segera Hadir" menyesatkan | Selesai sendiri setelah voucher berakhir ~16 Agu 2026. |
| Jendela bayar 1 jam terlalu ketat | Keputusan produk: dipertahankan. |
