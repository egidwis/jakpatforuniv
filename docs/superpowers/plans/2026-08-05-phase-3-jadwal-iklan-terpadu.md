# Phase 3 — Papan "Schedule" di dashboard admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ✅ SELESAI DI BRANCH — 2026-08-08. Sisa: adu visual + deploy.
>
> Task 9A (`sql/46`) diterapkan & diverifikasi, papan Schedule jalan bertab
> **Agenda · Iklan · Kilat**, drawer digabung, **Page Calendar sudah dipensiunkan**
> (`824890f`), dan **Task 9B + 12 (copy) menyusul** (`e91f52f`..`433153c`).
>
> **Yang tersisa sebelum branch ini layak merge — dua, keduanya butuh manusia:**
>
> 1. **Adu visual papan Schedule di browser.** Pembandingnya sudah tidak ada di
>    layar; kalau ada yang janggal, rujuk `git show` pada commit sebelum `824890f`.
> 2. **`SELECT cron_activate_extends();`** — satu-satunya verifikasi Task 8 yang
>    belum jalan, karena ia **menulis**. Catat status 2 jadwal yang sedang berjalan
>    sebelum dan sesudah.
>
> Sesudah itu: merge ke `main` → deploy → **baru** Task 11 (rencana terpisah), lalu
> Phase 4. Urutan itu diputuskan 2026-08-08; alasannya di
> [`README.md`](README.md) §"Urutan rilis yang berlaku".
>
> Status berjalan selalu di [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md).
>
> ⚠️ **Bagian di bawah ditulis 2026-08-05 dan sebagian sudah TIDAK BERLAKU.**
> Koreksinya ada di kotak berikutnya. Jangan mengeksekusi dari file ini tanpa
> membacanya.

> ### 🔴 Yang berubah sejak file ini ditulis
>
> **1. Judulnya sendiri sudah salah.** Bukan "tab Jadwal Iklan terpadu sebagai tempat
> kerja". Pembagiannya jadi tiga permukaan dengan peran berbeda — keputusan pemilik
> produk 2026-08-07:
>
> | Permukaan | Perannya |
> |---|---|
> | **Submissions** | **tempat kerja** — review → jadwal → bayar dalam satu drawer |
> | **Schedule** | **papan pantau** — nol aksi, hanya baca + deep-link |
> | **Pages** | kelola halaman (task terpisah, belum dikerjakan) |
>
> Alasannya perilaku, bukan simetri model data: rute review manual adalah satu
> percakapan dengan peneliti dari feedback sampai tagihan.
>
> **2. Task 9 dipecah — dan kini keduanya selesai.** 9A (cermin dapat sumbu kedua,
> `sql/46`) selesai 2026-08-08 pagi; **9B** (tulis ulang `deriveOrderUiState`/
> `airingPeriods` di dashboard **peneliti**) selesai 2026-08-08 sore, `433153c`.
> Nol migrasi — RLS `ad_schedules` sudah menampung peneliti sejak `sql/46`. Aturan
> dua sumbunya tinggal di berkas baru `status/scheduleAxes.ts`, dan
> `ProgressTracker.tsx` dihapus karena kehabisan pemanggil.
>
> **3. "Alihkan `SchedulingPage` lebih kecil" — SALAH, dan sebaliknya juga salah.**
> `SchedulingPage` bukan "kalender halaman": tanggal yang diplotnya berasal dari
> `form_submissions.start_date/end_date`, dan perpanjangan **memang** sudah jadi baris
> sendiri lewat query ketiga ke `form_submissions_extend`. Yang benar-benar tidak bisa
> dilakukannya: menampilkan order tanpa tanggal, membedakan empat keadaan yang runtuh,
> dan menyaring apa pun (`const filteredEvents = events;`).
>
> **4. Menghapusnya membuang satu kemampuan nyata.** Membuat halaman untuk order yang
> **belum lunas**, dan prop `paymentStatus` yang mematikan tombol publish di
> `PageBuilderModal`. Keduanya harus dipindahkan lebih dulu — rinciannya di progress doc.
>
> **5. `sql/46` dipakai Task 9A.** `reward_pools` (8B-2) bergeser ke `sql/47`.

## Context

Phase 3 mengganti cara admin melihat jadwal iklan: dari beberapa permukaan yang
masing-masing membaca sumbernya sendiri, jadi **satu papan pantau yang membaca satu
tabel** (`ad_schedules`). Rencana Phase 2 menyebutnya "menyusut jadi mapper biasa" —
dan itu memang benar, **tapi hanya setelah Task 9A.**

Fondasinya sudah siap dan sudah diverifikasi di produksi 2026-08-05:

| | |
|---|---|
| `ad_schedules` | **881 baris**, satu baris = satu jendela tayang, termasuk jadwal pertama |
| Ketepatan waktu iklan regular | 15.00 WIB, **0 baris menyimpang** dari 872 |
| Ketepatan waktu Kilat | gelombang 08/11/14/17 WIB, **0 baris menyimpang** (Task 8D, `sql/45`) |
| Paritas dengan sumber lama | selisih **0** di kedua arah |
| Pembaca hari ini | **nol** — tabel ini belum dibaca siapa pun |

Baris terakhir itu yang membuat Phase 3 berisiko rendah di sisi data: apa pun yang salah
di tab baru **tidak bisa merusak alur lama**, karena alur lama tidak lewat sana.

## Yang menghalangi, dan kenapa ia bukan sekadar urutan

`ad_schedules.status` menyalin `form_submissions.submission_status`, dan kolom itu masih
memuat **dua sumbu sekaligus**: sumbu review (`in_review`/`approved`/`rejected`/`spam`) dan
sumbu tayang (`paid`/`scheduled`/`live`/`completed`). Cermin karena itu harus menjatuhkan
setiap nilai sumbu-review ke satu nilai. Terukur 2026-08-05:

| `status` di cermin | Aslinya di sumber | Baris |
|---|---|---|
| `waiting_payment` | `in_review` | **393** |
| `waiting_payment` | `approved` | **97** |
| `waiting_payment` | `slot_reserved` | **40** |
| `waiting_payment` | `waiting_payment` | 1 |
| `live` | `live` | 167 |
| `scheduled` | `scheduled` | 58 |
| `paid` | `paid` | 30 |
| `cancelled` | `spam` 70 + `rejected` 5 | 75 |
| `completed` | `completed` | 8 |

**531 dari 869 baris — 61% — runtuh jadi satu keranjang `waiting_payment`.**

Tab terpadu yang dibangun sebelum Task 9 tidak akan bisa membedakan "belum direview" dari
"sudah disetujui" dari "slot sudah dipesan". Itu bukan kekurangan kosmetik: di layar
penjadwalan, justru itu informasi yang paling dicari admin. Membangun tab-nya dulu lalu
memperbaiki status belakangan berarti mendesain ulang kolom, filter, dan warna chip-nya dua
kali.

**Jadi Task 9 dikerjakan lebih dulu, dan ia bagian dari pekerjaan ini — bukan syarat
administratif.**

## Keputusan branch (2026-08-05, pemilik produk)

**Task 9–12 dan Phase 3 dikerjakan di `feat/dashboard-soft-dna-navbar`.**

Rencana Phase 2 semula melarang menumpang branch itu. Larangan itu dicabut karena tidak
bisa dipatuhi: file yang harus ditulis ulang Task 9 —
`src/components/status/deriveOrderUiState.ts`, `airingPeriods.ts`,
`status/SchedulePhase.tsx` — **hanya ada di sana**, dan memang lahir di sana.

**Konsekuensi yang diterima sadar:** revamp visual dan sisa Phase 2 jadi **satu unit
rilis**. Tidak bisa lagi di-revert sendiri-sendiri. Sekali branch ini dideploy, keduanya
tayang bersamaan.

### ✅ Langkah pertama, wajib: bawa `main` masuk ke branch — SELESAI 2026-08-05

> **Sudah dikerjakan.** Merge dijalankan 2026-08-05 sore dan berlangsung persis seperti
> diperkirakan di bawah: nol konflik kode, dua konflik dokumentasi, keduanya diselesaikan
> dengan versi `main`. `git log --oneline HEAD..main` sekarang kosong.
>
> **Baseline pasca-merge: `tsc -p tsconfig.app.json` = 74 error.** (Sebelum merge: 75 di
> branch, 76 di `main`. Yang hilang persis satu `TS6133 'isKilat' is declared but its value
> is never read` — kode mati yang ikut terbersihkan saat `SubmissionDetailSheet.tsx`
> dipecah.) **74 adalah baseline yang dipakai Task 9 ke atas.** `vite build` hijau, ketiga
> test harness lolos.
>
> Dua pembersihan struktural ikut dituntaskan di sesi yang sama — lihat "Titik sentuh yang
> berubah" di bawah.
>
> Bagian di bawah ini disimpan apa adanya sebagai catatan prosedur.

Branch ini tertinggal **18 commit** dari `main` (per 2026-08-05) — termasuk seluruh Task
8B-1, 8C, 8D, dan `sql/43`/`44`/`45`. Bekerja di atasnya tanpa menarik `main` dulu berarti
membangun di atas fondasi yang sudah usang.

```bash
git switch feat/dashboard-soft-dna-navbar
git merge main
```

**Uji kering sudah dijalankan 2026-08-05. Hasilnya:**

- **Seluruh kode merge bersih** — nol konflik di `src/`, `functions/`, `sql/`.
- **Tepat dua berkas konflik, keduanya dokumentasi:**
  `docs/jadwal-iklan-progress.md` dan
  `docs/superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`.

Penyebabnya diketahui dan tidak berbahaya: branch ini masih memegang dua commit dokumentasi
8C lama (`03ab5d2`, `6ea61a0`) yang **sengaja tidak ikut** dipindah ke `main`, sementara
versi `main` sudah ditulis ulang dan jauh lebih mutakhir.

**Resolusinya: ambil versi `main` untuk kedua berkas itu, tanpa digabung.**

```bash
git checkout --theirs docs/jadwal-iklan-progress.md
git checkout --theirs docs/superpowers/plans/2026-08-03-jadwal-iklan-redesign.md
git add docs/
git commit
```

> ⚠️ Jangan mencoba menggabung isi kedua berkas itu baris demi baris. Versi branch adalah
> potret 2026-08-04 dari pekerjaan yang sudah selesai; versi `main` sudah memuat hasil
> verifikasi produksi 8B-1/8C/8D. Menggabungnya hanya menghidupkan kembali informasi yang
> sudah kedaluwarsa.

Sesudah merge, **jalankan gate sebelum menulis kode apa pun** — supaya kalau ada yang
rusak, penyebabnya jelas merge-nya, bukan pekerjaan baru:

```bash
cd multi-step-form
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
npx vite build
```

Baseline branch **pasca-merge = 74** (diukur 2026-08-05, sesudah merge + kedua pembersihan
di bawah). Yang penting **tidak bertambah**, bukan angkanya sama. Kalau bertambah, adu
daftar error-nya baris demi baris sebelum lanjut:

```bash
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS" \
  | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/err_sesudah.txt
# bandingkan dengan daftar yang sama sebelum merge, pakai `comm`
```

> Root `tsconfig.json` isinya `{"files": [], "references": [...]}`, jadi `npx tsc --noEmit`
> **selalu** lapor 0 dan tidak membuktikan apa pun. Selalu pakai `-p tsconfig.app.json`.

### Titik sentuh yang berubah sesudah merge (2026-08-05)

Dua pembersihan struktural dikerjakan bersamaan dengan merge, supaya Task 9/10 tidak
membaca kode yang menyesatkan. Alamat lama yang tercatat di rencana Phase 2 **sudah tidak
berlaku**:

| Yang dicari | Alamat lama | Alamat sekarang |
|---|---|---|
| "Mark as Paid" (Task 10) | `SubmissionDetailSheet.tsx:~982` | `submissions/tabs/PaymentTab.tsx` (246 baris) |
| Tab Reservasi | `SubmissionDetailSheet.tsx:847` | `submissions/tabs/ReservationTab.tsx` |
| `copyToClipboard`, `formatDate` | lokal di `SubmissionDetailSheet.tsx` | diekspor dari `submissions/types.ts` |
| formatter uang mana pun | 4 `formatIDR` + 5 `formatRupiah` tersebar | `src/utils/currency.ts` saja |

`SubmissionDetailSheet.tsx` sekarang 330 baris (cangkang saja), turun dari 1365. Kelima tab
pindah ke `src/components/submissions/tabs/`. Pemecahannya nol perubahan perilaku —
dibuktikan dengan mengadu isi kedua sisi setelah baris import/export dibuang.

⚠️ Satu perubahan perilaku yang disengaja menyentuh **`SchedulePhase.tsx`**, berkas yang
Task 9 tulis ulang: fungsi lokal bernama `formatRupiah` di sana ternyata berbadan
`style: 'currency'` — bentuk `formatIDR`, bukan `formatRupiah`. Seluruh 13 call site
diganti ke `formatIDR` bersama. Efek nyatanya hanya pembulatan nilai non-bulat, dan kolom
uang semuanya `bigint`.

---

## Urutan pekerjaan

Task 9 → 10 → 12 → Phase 3, dengan Task 11 menyusul setelah tab-nya hidup. Rinciannya per
task ada di [`2026-08-03-jadwal-iklan-redesign.md`](2026-08-03-jadwal-iklan-redesign.md);
di sini hanya urutan dan alasannya.

### 1. Task 9 — pisahkan status order dari status jadwal ⬅️ **mulai dari sini**

Yang membuka 531 baris di atas. Bagian frontend tersulit di seluruh Phase 2;
`deriveOrderUiState` ditulis ulang. Kerjakan dengan QA khusus, jangan digabung dengan task
lain dalam satu commit.

Titik sentuh utama: `src/components/status/deriveOrderUiState.ts`,
`src/components/status/airingPeriods.ts`, `src/components/status/SchedulePhase.tsx`,
`src/components/submissions/lifecycle.ts` (`deriveLifecycle`).

⚠️ Jebakan yang sudah memakan waktu berkali-kali: **`form_submissions.status` BUKAN kolom
status** — isinya jenjang pendidikan peneliti. Yang dibaca `deriveLifecycle` sebagai
`status` sebenarnya `submission_status` yang di-alias ulang di `supabase.ts:1365`.

### 2. Task 10 — satukan aturan waktu & pembayaran

Cutoff 13.00/14.00 WIB seragam untuk semua jadwal; `transactions`/`invoices` pakai
`schedule_id`; **"Mark as Paid" jadi per-jadwal** (sekarang order-level, dan bisa menandai
lunas order yang tidak punya jadwal sama sekali — 3 dari 522 order terukur begitu).

Bisa dikerjakan sebelum atau sesudah Phase 3, **tapi sebelum lebih murah**: tab terpadu
akan memuat aksi pembayaran, dan memindahkannya ke per-jadwal setelah tab jadi berarti
membongkar UI yang baru dibuat.

### 3. Task 12 — istilah

Semua kartu jadi "Jadwal Iklan 1 / 2 / 3", tanpa kata "extend"/"perpanjangan" di UI.
Kerjakan **sebelum** tab dibangun supaya labelnya tidak ditulis dua kali.

⚠️ **Berhenti di batas API.** Nama field publik (`period_batch`, `batch_status`,
`can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut
berganti — itu kontrak dengan platform pengundian dan aplikasi Jakpat.

### 4. Phase 3 — tab-nya sendiri

Baru di sini `ad_schedules` benar-benar dibaca untuk pertama kalinya.

**Permukaan admin yang ada hari ini** (semuanya membaca sumber lama, bukan `ad_schedules`):

| Permukaan | Berkas | Isinya sekarang |
|---|---|---|
| Nav admin | `src/components/InternalDashboardWithLayout.tsx:195` | label **"Ads Schedule"** |
| Halaman Ads Schedule | `src/pages/dashboard/SchedulingPage.tsx` | kalender iklan + toggle **Iklan \| Kilat** |
| Papan Kilat | `src/components/KilatScheduleBoard.tsx` | 4 gelombang × Senin–Jumat, lintas order |
| Daftar order | `src/components/InternalDashboard.tsx` | toggle Regular Ads / Kilat (baris ~1040) |
| Pembayaran jadwal | `src/components/SchedulePaymentView.tsx` | — |
| Halaman iklan | `src/components/PublishPageManagement.tsx` | — |

**Yang harus diputuskan di awal sesi berikutnya** (belum diputuskan, dan menentukan bentuk
seluruh task):

- [ ] **Tab baru, atau `SchedulingPage` yang dialihkan sumbernya?** Mengalihkan sumber
      lebih kecil dan langsung memberi nilai; tab baru memberi ruang untuk bentuk yang
      berbeda tapi meninggalkan dua permukaan yang harus dijaga sepakat untuk sementara.
- [ ] **Kilat: satu papan bersama iklan regular, atau tetap toggle terpisah?**
      `ad_schedules` sekarang bisa menyajikan keduanya dalam satu query
      (`distribution_type` + `kilat_slot_hour`), jadi ini murni keputusan UX — bukan lagi
      batasan data.
- [ ] **Apakah tab ini menulis, atau baca-saja dulu?** Baca-saja jauh lebih aman: sampai
      Task 11, `ad_schedules` masih **read-model satu arah** dan tidak punya trigger balik
      ke tabel sumber. Menulis langsung ke sana hari ini akan hilang diam-diam.

**Aturan yang tidak boleh dilanggar saat membaca `ad_schedules`:**

> ⚠️ **Jangan membaca jam tayang Kilat dari `start_date` tanpa mengecek `kilat_slot_hour`.**
> Order Kilat yang gelombangnya belum ditugaskan sengaja mendarat di **00.00 WIB** — itu
> penanda "belum dijadwalkan", bukan jadwal pukul nol. 3 dari 9 order Kilat berjadwal ada
> di keadaan itu. Iklan regular selalu 15.00 WIB (`airing_instant_of_date()`); Kilat lewat
> `kilat_instant_of()`. Dua helper, dua aturan, jangan ditukar.

### 5. Task 11 — pindahkan pembaca, lalu contract

Dikerjakan **setelah** tab hidup dan stabil satu siklus rilis. `fetchSlotAvailability`
runtuh jadi satu query; `form_submissions_extend` disisakan sebagai **view** kompatibilitas
sebelum tabel aslinya disentuh — bukan sesudah.

Sisa pembaca serverless tinggal dua (8B-1 sudah melepas `respondents.js`):
`functions/api/storage-cleanup.js:74` dan `functions/api/doku/webhook.js:497,516`.

---

## Verifikasi

Gate kode di setiap commit (lihat perintahnya di "Langkah pertama" di atas): jumlah error
**tidak bertambah** dari baseline branch, dan `npx vite build` lolos.

Untuk tab-nya sendiri, satu uji lebih berharga dari semua yang lain:

**Adu tab baru dengan permukaan lama, order demi order.** `SchedulingPage` dan
`KilatScheduleBoard` masih membaca `form_submissions` **langsung**, jadi keduanya adalah
pembanding independen yang tidak ikut berubah. Untuk survei yang sama, tanggal, jam, dan
status harus sama persis di kedua tempat. Pola ini yang membuktikan 8B-1 dan 8D benar, dan
ia berlaku lagi di sini.

Selain itu:

- [ ] Order Kilat tampil di gelombangnya (08/11/14/17), bukan 15.00
- [ ] Order Kilat tanpa gelombang tampil sebagai **"belum dijadwalkan"**, bukan "00.00"
- [ ] Survei dengan perpanjangan tampil sebagai **beberapa baris berurut**, bukan satu
- [ ] Order tanpa tanggal sama sekali (83 order berhadiah) tidak hilang diam-diam dari layar
- [ ] Sesudah Task 9: keempat keadaan yang dulu runtuh (`in_review`/`approved`/
      `slot_reserved`/`waiting_payment`) bisa dibedakan di layar

## Di luar cakupan

- **`reward_pools` (`sql/46`, Task 8B-2)** — prasyarat **Phase 4**, bukan Phase 3.
  ⛔ Pertanyaan yang wajib dijawab lebih dulu: di mana pool tinggal untuk **83 order** yang
  sudah mendanai hadiah tapi belum punya tanggal sama sekali (`start_date IS NULL`,
  sehingga `period_batch` tidak bisa dihitung).
- **Phase 4 & 5** — "jadwalkan iklan lagi" dan Kilat untuk dashboard user.
- **⚠️ Hadiah order Kilat tidak pernah sampai ke platform pengundian.** Ke-11 order Kilat
  punya `prize_per_winner > 0`, tapi Kilat tidak pernah punya halaman iklan — sedangkan
  `/api/respondents` Mode 1 hanya melisting halaman terbit dan Mode 2 dicari lewat slug
  halaman. Kalau responden Kilat memang ikut diundi, ada lubang di sana. **Butuh keputusan
  produk, bukan migrasi.**
- **Design-system dashboard** ([`2026-07-30-design-system-dashboard.md`](2026-07-30-design-system-dashboard.md))
  — belum dieksekusi dan bersinggungan; lihat "Hubungan dengan rencana lain" di
  [`README.md`](README.md).
