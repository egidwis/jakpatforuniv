# Jadwal Iklan — Status Berjalan

> **Titik masuk untuk pekerjaan Jadwal Iklan.** Baca ini dulu sebelum membuka
> rencana mana pun. Diperbarui 2026-08-08.

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
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | 🟡 Task 8 ✅ · 8B-1 ✅ · 8C ✅ · 8D ✅ · **9A ✅ `sql/46`** | 🟡 **sisa Task 9B, 10–12** |
| **Phase 3** | **Papan "Schedule" di dashboard admin** | ✅ `sql/46` | 🟡 **papan sudah jalan**; sisa: adu visual dengan Page Calendar lalu pensiunkan yang lama |
| Phase 4 | Tombol "Jadwalkan Iklan Lagi" aktif di dashboard user | ⬜ | ⬜ prasyarat: `reward_pools` (8B-2, **`sql/47`** — `46` dipakai Task 9A) |

**Satu hal yang paling penting kalau kamu kembali setelah lama:** per 2026-08-05
`main` sudah di-deploy dan **DB serta kode akhirnya sejajar** — tidak ada lagi
migrasi yang jalan di produksi tanpa kodenya, dan tidak ada lagi lubang di deret
`sql/`. Yang tayang memuat Phase 0/1, jembatan + papan jadwal Kilat, Task 8B-1,
8C, dan 8D.

Sisa Phase 2 tinggal **Task 9–12**, dan sejak 2026-08-05 sore semuanya **sudah
bisa jalan**: `feat/dashboard-soft-dna-navbar` sudah menarik `main`, jadi branch
itu tidak lagi menahan apa pun. Pekerjaan Task 9–12 dan Phase 3 berlangsung DI
branch itu. Lihat §2.

⚠️ **`sql/40` dan `sql/42` mendefinisikan `ensure_survey_page()` yang sama.**
`sql/42` versinya yang benar (order Kilat tidak dapat halaman iklan). Kalau
`sql/40` dijalankan ulang kapan pun, jalankan `sql/42` lagi sesudahnya.

---

## Yang menunggu tindakan

### 00. Adu papan Schedule dengan Page Calendar, lalu pensiunkan yang lama ⬅️ paling mendesak

Papan **Schedule** sudah jalan di nav, dan **Page Calendar sengaja masih hidup di
sebelahnya** dengan label "Page Calendar (lama)". Itu bukan kelalaian: satu-satunya
cara mengadu keduanya order demi order adalah selagi keduanya bisa dibuka, dan
kesempatan itu hilang begitu yang lama dihapus.

Sisi data sudah diadu dan bersih (lihat §Phase 3 di "Yang sudah selesai"). Yang
belum: **adu visual**, dan itu butuh mata manusia.

- [ ] Survei yang sama: tanggal, jam, dan status halaman sama persis di kedua layar
- [ ] Tampilan Kilat di papan baru = `KilatScheduleBoard` lama, entri demi entri
- [ ] Klik entri dari order **bulan lampau** → drawer terbuka dan **tetap terbuka**
- [ ] Klik entri **iklan regular** → mendarat di tab Regular, bukan tab Kilat kosong
      (bug `setDistTab('kilat')` yang ditutup di `d7639df` — inilah ujinya)
- [ ] Mobile: papan terbaca di 375px, nol scroll horizontal

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

### 4. Verifikasi Task 8 yang belum dijalankan

Sudah lolos: selisih baris `0`/`0`, uji 15.00 WIB bersih, sebaran status cocok,
uji mirror hidup mengikuti dan penomoran urut `start_date`. Belum dijalankan
(§8 di `sql/41_ad_schedules.sql`):

- `(2a)`/`(2b)` ordinal ganda & lubang di rentang `2..n`
- `(4a)`/`(4b)` `period_batch` cocok dengan sumber lama
- `(7)` `SELECT cron_activate_extends();` — paling berguna dari sisanya, karena
  trigger baru ikut menyala tiap kali cron mengubah status perpanjangan
- Cek sinkron menyeluruh: bandingkan **seluruh** 856 jadwal pertama dengan
  sumbernya (query ada di §8)

---

## Yang sudah selesai

### Phase 3 — Task 9A (`sql/46`) + papan Schedule, commit `478d550`..`d7639df` (2026-08-08)

**Pembagian permukaan yang berlaku sekarang** — ini yang paling menentukan untuk
sesi berikutnya, dan ia **membatalkan** gambaran lama "tab Jadwal Iklan terpadu
sebagai tempat kerja":

| Permukaan | Perannya |
|---|---|
| **Submissions** | **tempat kerja.** Review → jadwal → bayar, semuanya dalam satu drawer |
| **Schedule** | **papan pantau.** Nol aksi, hanya baca + deep-link ke drawer |
| **Pages** | kelola halaman (perombakannya task terpisah, belum dikerjakan) |

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
Urutan wajib: **~~8B-1~~ → 8C → 9 → 10 → 11 → 12**, masing-masing rilis sendiri
(expand-and-contract). Tidak ada satu langkah pun yang mengharuskan semua lapis
berubah serentak. 8B-2 keluar dari urutan ini — ia pindah jadi prasyarat Phase 4.

| Task | Isi | Catatan |
|---|---|---|
| ~~**8B-1**~~ | ~~Satu sumber angka hadiah + top-up jadi mulus~~ | ✅ **selesai & live 2026-08-05** (`sql/44`). Risiko terbesarnya — dua agregasi batch yang bisa menyimpang — sudah hilang secara struktural, bukan ditambal. |
| **8B-2** | `reward_pools` — pool jadi milik batch, bukan milik jadwal pertama | ⏸️ **Ditunda jadi prasyarat Phase 4**, bukan bagian Phase 2. Hari ini semua yang diobatinya masih laten (10 perpanjangan seumur hidup, 0 top-up terpakai, 0 pool yatim) — Phase 4 yang membuat ketiganya hidup sekaligus. ⛔ Sebelum tabelnya dirancang, jawab dulu: **83 order sudah mendanai hadiah tanpa punya tanggal sama sekali**, sehingga kunci `(submission_id, period_batch)` tidak punya tempat untuk mereka. Nomor filenya `sql/45`. |
| ~~**8C**~~ | ~~Pensiunkan sisa fitur pengundian di dashboard~~ | ✅ **selesai & live 2026-08-05.** Dipindah ke `main` lewat cherry-pick tanpa ikut menayangkan revamp visual. Indikator "Select Winners" terbukti hilang dari bundle produksi. |
| ~~**8D**~~ | ~~`ad_schedules` mengenali Kilat~~ | ✅ **selesai & live 2026-08-05** (`sql/45`). Prasyarat Phase 3 yang pertama — sudah lunas. |
| **9** | Pisahkan status order dari status jadwal | 🚧 **Terhalang, dan sekarang ia satu-satunya penghalang Phase 2 sekaligus Phase 3.** Bagian frontend tersulit; `deriveOrderUiState` ditulis ulang. 531 dari 869 baris cermin runtuh jadi satu keranjang `waiting_payment` sampai task ini jalan — lihat §2. |
| **10** | Satukan aturan waktu & pembayaran | Cutoff 13.00/14.00 WIB berlaku seragam ke semua jadwal; `transactions`/`invoices` pakai `schedule_id`; **"Mark as Paid" jadi per-jadwal** (sekarang order-level dan bisa menandai lunas order tanpa jadwal sama sekali — 3 dari 522 order terukur begitu). |
| **11** | Pindahkan pembaca, lalu contract | ⚠️ View kompatibilitas WAJIB ada sebelum tabel aslinya disentuh, bukan sesudah. **Diperkecil oleh 8B-1:** `respondents.js` tidak lagi membaca `form_submissions_extend` sama sekali (query massalnya diganti RPC). Sisa pembaca serverless tinggal dua — `functions/api/storage-cleanup.js:74` dan `functions/api/doku/webhook.js:497,516` — plus pembaca di `src/`. |
| **12** | Istilah — semua jadi "Jadwal Iklan 1/2/3" | Berhenti di API: nama field publik (`period_batch`, `batch_status`, `can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut berganti. |

Setelah Phase 2: **Phase 3** (tab "Jadwal Iklan" terpadu di admin) menyusut jadi
mapper biasa, dan **Phase 4** (tombol "Jadwalkan Iklan Lagi" di dashboard user)
baru masuk akal dikerjakan. Dikerjakan **sebelum** Phase 2 rampung, Phase 3 justru
jadi adapter di atas dua model jadwal yang masih berbeda — persis pekerjaan yang
Phase 2 ada untuk menghapusnya. Rinciannya di §2 "Yang menunggu tindakan".

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

---

## Peta dokumen

| File | Isi |
|---|---|
| **`docs/jadwal-iklan-progress.md`** | ⬅️ file ini — titik masuk, status berjalan |
| [`superpowers/plans/README.md`](superpowers/plans/README.md) | **Indeks seluruh rencana** + statusnya; baca kalau bingung file mana yang masih berlaku |
| [`superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md`](superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md) | **Rencana Task 11** — `ad_schedules` jadi otoritatif, `form_submissions_extend` pensiun, `booking_id` lahir. Disetujui 2026-08-08, **terkunci sampai Phase 3 mendarat di `main`** |
| [`superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md`](superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md) | **Rencana Phase 3** — judulnya sudah basi; baca kotak koreksi di kepalanya sebelum mengeksekusi apa pun dari sana |
| [`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md) | Rencana Phase 2 lengkap, Task 8–12 |
| [`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md) | Checklist uji setelah deploy frontend |
| `multi-step-form/sql/36`–`46` | Migrasi; tiap file memuat pre-check, verifikasi, dan rollback-nya sendiri di bagian bawah. Deretnya **utuh** sejak 2026-08-05 — lubang di `43` sudah ditutup. `46` = Task 9A (dua sumbu); `reward_pools` bergeser ke `47` |
