# Jadwal Iklan — Status Berjalan

> **Titik masuk untuk pekerjaan Jadwal Iklan.** Baca ini dulu sebelum membuka
> rencana mana pun. Diperbarui 2026-08-05.

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
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | 🟡 Task 8 ✅ · 8B-1 ✅ | 🟡 8B-1 deployed · 8C kode ada tapi belum deploy |
| Phase 3 | Tab "Jadwal Iklan" terpadu di dashboard admin | ⬜ | ⬜ **belum bisa dimulai** — lihat §3 |
| Phase 4 | Tombol "Jadwalkan Iklan Lagi" aktif di dashboard user | ⬜ | ⬜ prasyarat: `reward_pools` (8B-2) |

**Satu hal yang paling penting kalau kamu kembali setelah lama:** `main`
di-deploy 2026-08-05 dan sekarang memuat Phase 0/1, jembatan + papan jadwal
Kilat, **dan Task 8B-1** (satu sumber angka hadiah). Yang **belum** dideploy:
Task 8C — kodenya sudah jadi tapi hidup di branch `feat/dashboard-soft-dna-navbar`
bersama revamp visual, lihat §2. Dua checklist uji manual juga masih menganggur:
§0 (jembatan Kilat) dan §1 (Phase 0).

⚠️ **`sql/40` dan `sql/42` mendefinisikan `ensure_survey_page()` yang sama.**
`sql/42` versinya yang benar (order Kilat tidak dapat halaman iklan). Kalau
`sql/40` dijalankan ulang kapan pun, jalankan `sql/42` lagi sesudahnya.

---

## Yang menunggu tindakan

### 0. Uji jembatan Kilat ujung-ke-ujung ⬅️ paling mendesak

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

### 2. Task 8C: kodenya sudah jadi, tapi tersangkut di branch visual ⬅️ langkah berikutnya

Menurut urutan wajib Phase 2 (**8B → 8C → 9 → …**), yang berikutnya adalah 8C —
dan kodenya **sudah selesai** sejak 2026-08-04. Masalahnya kodenya tidak ada di
`main`. Ia hidup di `feat/dashboard-soft-dna-navbar` (commit `49f7884`,
`f872184`, `072000f`, `2128084`, `e00ccf3`, `03ab5d2`, `6ea61a0`), berselang-seling
dengan commit revamp visual — jadi tidak bisa di-cherry-pick sebersih 8B-1.

**Ini menciptakan keadaan yang paling berbahaya di seluruh papan: DB sudah maju,
kode belum.**

| | Produksi | `main` |
|---|---|---|
| `sql/43` (arsip beku `survey_winners` + rapikan RLS) | ✅ diterapkan & diverifikasi 2026-08-04 (dicek ulang 2026-08-05: komentar arsip masih terpasang) | ❌ **filenya tidak ada** — `sql/` lompat dari `42` ke `44` |
| UI 8C (indikator "Select Winners" dicopot, tombol diganti nama, modal ditandai arsip) | ❌ belum tayang | ❌ tidak ada |

Dua akibat langsung, keduanya nyata:

1. **Indikator merah "Select Winners" masih menyala permanen** di setiap halaman
   berhadiah — bug yang hidup sejak Mei 2026 dan yang justru jadi alasan 8C
   dikerjakan lebih dulu.
2. **`sql/` punya lubang di nomor 43.** Siapa pun yang mengklon `main` dan
   menjalankan migrasi berurutan akan melewatkan `sql/43` tanpa tanda apa pun.
   Ini bukan sekadar kerapian: ia satu-satunya jejak kenapa kebijakan RLS
   `survey_winners` sekarang berbentuk begitu.

Pilihannya dua, dan keduanya sah:

- **Merge `feat/dashboard-soft-dna-navbar` ke `main`** — sekalian menuntaskan
  revamp visual dan membuka jalan Task 9 (lihat §3). Paling langsung, tapi satu
  deploy membawa dua pekerjaan yang tidak berhubungan.
- **Pindahkan `sql/43` + commit UI 8C ke `main` sendiri** — lebih rapi, tapi
  commit-nya berselang-seling dengan commit visual, jadi butuh cherry-pick
  berhati-hati plus penyelesaian konflik, bukan fast-forward seperti 8B-1.

### 3. Phase 3 belum bisa dimulai — dua hal harus dijawab dulu

Phase 3 (tab "Jadwal Iklan" terpadu di admin) dibangun **di atas `ad_schedules`**,
dan tabel itu belum siap ditumpangi:

1. **`ad_schedules` tidak tahu apa-apa soal Kilat.** Tidak ada kolom
   `distribution_type` maupun `kilat_slot_hour`, jadi setiap order Kilat
   tersimpan di sana sebagai jendela tayang 15.00 WIB biasa — salah. Selama
   belum ada pembacanya ini bukan bug hidup; begitu Phase 3 membacanya, ia jadi
   bug hidup di layar admin. **Ini harus diperbaiki sebelum Phase 3, bukan
   sesudah.** (Lihat jebakan #5 di bawah.)
2. **Task 9–12 belum dikerjakan, dan Task 9 sendiri masih terhalang** file
   `src/components/status/*` yang cuma ada di branch visual. Rencana induk
   menyebut Phase 3 "menyusut jadi mapper biasa" **setelah** Phase 2 — dikerjakan
   sebelum itu, ia justru jadi adapter di atas dua model jadwal yang masih
   berbeda, yaitu persis pekerjaan yang Phase 2 ada untuk menghapusnya.

Jadi urutan yang masuk akal dari titik sekarang: **selesaikan 8C (§2) → bereskan
Kilat di `ad_schedules` → Task 9–12 → baru Phase 3.**

### 4. Uji top-up ujung ke ujung — sisa satu-satunya dari 8B-1

Sembilan dari sepuluh verifikasi 8B-1 sudah lolos di produksi (rinciannya di
"Yang sudah selesai"). Yang tersisa butuh **transaksi nyata**, tidak bisa
dibuktikan read-only. Di dashboard admin, buat perpanjangan ke batch yang
**sudah** punya pool, isi Additional Prize, lalu pastikan berurutan:

1. invoice memuat item "Additional Prize per Winner" dengan qty =
   **pool_winner_count**, bukan winner count order induk (ini bug uang yang
   ditutup commit `90364ad` — sebelum itu preview dan tagihan bisa berbeda);
2. sesudah dibayar, badge "Total Reward" di halaman publik **naik**;
3. `/api/respondents?slug=...` menunjukkan `prize_per_winner` yang sudah bertambah;
4. `requires_banner_update` menyala di dashboard admin (perilaku lama, harus
   tetap jalan).

Sampai ini dijalankan, jalur top-up sudah benar **secara pembacaan** — terbukti
lewat 43 slug yang dibandingkan dua mode — tapi belum pernah dilihat bergerak
ujung ke ujung.

### 5. Verifikasi Task 8 yang belum dijalankan

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

**Ganda-tagih Rp 425.000 — insiden lampau, data tidak disentuh.** Dua pool penuh
pernah masuk ke satu batch yang sama (Juli 2026: "Studi Pengambilan Keputusan"
Rp 50.000 + "Faktor-Faktor Psikologis" Rp 375.000); `MAX()` di agregasi menelan
yang kedua tanpa jejak. Keduanya dibuat **sebelum** `sql/37` diterapkan, dan
`sql/37` sudah menghentikan penyebabnya — tidak ada kasus baru sejak itu. Yang
belum hilang adalah **bentuk datanya**: selama tidak ada entitas pool, uang masih
bisa tertelan diam-diam. Itu yang jadi alasan ke-2 kenapa `reward_pools` (8B-2)
wajib ada sebelum Phase 4. Keputusan 2026-08-04: dicatat, **data tidak disentuh**,
refund diputuskan terpisah.

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
| **8C** | Pensiunkan sisa fitur pengundian di dashboard | 🟡 **Kode sudah jadi, tapi ada di branch visual dan belum deploy — sementara `sql/43`-nya sudah jalan di produksi.** Indikator merah "Select Winners" karena itu masih menyala permanen. Lihat §2 di "Yang menunggu tindakan" — inilah langkah berikutnya. |
| **9** | Pisahkan status order dari status jadwal | 🚧 **Terhalang** — lihat di bawah. Bagian frontend tersulit; `deriveOrderUiState` ditulis ulang. Kerjakan sendiri dengan QA khusus. |
| **10** | Satukan aturan waktu & pembayaran | Cutoff 13.00/14.00 WIB berlaku seragam ke semua jadwal; `transactions`/`invoices` pakai `schedule_id`; **"Mark as Paid" jadi per-jadwal** (sekarang order-level dan bisa menandai lunas order tanpa jadwal sama sekali — 3 dari 522 order terukur begitu). |
| **11** | Pindahkan pembaca, lalu contract | ⚠️ View kompatibilitas WAJIB ada sebelum tabel aslinya disentuh, bukan sesudah. **Diperkecil oleh 8B-1:** `respondents.js` tidak lagi membaca `form_submissions_extend` sama sekali (query massalnya diganti RPC). Sisa pembaca serverless tinggal dua — `functions/api/storage-cleanup.js:74` dan `functions/api/doku/webhook.js:497,516` — plus pembaca di `src/`. |
| **12** | Istilah — semua jadi "Jadwal Iklan 1/2/3" | Berhenti di API: nama field publik (`period_batch`, `batch_status`, `can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut berganti. |

Setelah Phase 2: **Phase 3** (tab "Jadwal Iklan" terpadu di admin) menyusut jadi
mapper biasa, dan **Phase 4** (tombol "Jadwalkan Iklan Lagi" di dashboard user)
baru masuk akal dikerjakan. Dikerjakan **sebelum** Phase 2 rampung, Phase 3 justru
jadi adapter di atas dua model jadwal yang masih berbeda — persis pekerjaan yang
Phase 2 ada untuk menghapusnya. Rinciannya di §3 "Yang menunggu tindakan".

---

## 🚧 Penghalang yang harus diketahui sebelum menjadwalkan Task 9

Task 9, dan sebagian Task 10 dan 12, menyasar file yang **tidak ada di `main`**:

- `src/components/status/deriveOrderUiState.ts`
- `src/components/status/airingPeriods.ts`
- `src/components/status/SchedulePhase.tsx`

Ketiganya hanya ada di branch **`feat/dashboard-soft-dna-navbar`** — padahal
rencana Phase 2 justru melarang menumpang branch itu supaya kedua pekerjaan bisa
di-revert sendiri-sendiri.

**Akibatnya:** Task 8B-1 aman dikerjakan dari `main` dan memang begitu caranya
(branch sendiri, `feat/jadwal-iklan-8b1`, fast-forward ke `main`, branch dihapus).
Task 9 ke atas menunggu branch revamp masuk ke `main`.

⚠️ **Branch yang sama juga menahan Task 8C** (kode + `sql/43`), jadi ia sekarang
memblokir dua hal sekaligus, bukan satu — lihat §2 di "Yang menunggu tindakan".
Selama ia belum masuk, `main` punya lubang di `sql/43` dan bug indikator
"Select Winners" masih hidup di produksi.

Sebelum menjadwalkan task Phase 2 apa pun yang menyentuh dashboard user, cek
dulu:

```bash
git ls-tree -r --name-only main -- multi-step-form/src/components/status/
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
5. **`ad_schedules` (sql/41) tidak tahu apa-apa soal Kilat.** Read-model itu
   belum punya kolom `distribution_type` maupun `kilat_slot_hour`, jadi order
   Kilat tersimpan di sana sebagai jendela tayang 15.00 WIB biasa — salah.
   Belum ada pembacanya sekarang jadi bukan bug hidup, tapi **Phase 3** (tab
   "Jadwal Iklan" terpadu) akan dibangun di atas tabel ini dan akan mewarisi
   kesalahan itu kalau tidak diperbaiki lebih dulu.
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

---

## Peta dokumen

| File | Isi |
|---|---|
| **`docs/jadwal-iklan-progress.md`** | ⬅️ file ini — titik masuk, status berjalan |
| [`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md) | Rencana Phase 2 lengkap, Task 8–12 |
| [`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md) | Checklist uji setelah deploy frontend |
| `multi-step-form/sql/36`–`44` | Migrasi; tiap file memuat pre-check, verifikasi, dan rollback-nya sendiri di bagian bawah. ⚠️ **`43` tidak ada di `main`** — sudah diterapkan ke produksi tapi filenya masih di branch visual (§2) |
