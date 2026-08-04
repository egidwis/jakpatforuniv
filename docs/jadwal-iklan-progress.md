# Jadwal Iklan — Status Berjalan

> **Titik masuk untuk pekerjaan Jadwal Iklan.** Baca ini dulu sebelum membuka
> rencana mana pun. Diperbarui 2026-08-04.

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
| Kilat — papan jadwal | Toggle Iklan/Kilat di Ads Schedule + tutup lubang Create Page utk Kilat | — | ⬜ **belum deploy** (`a4fc499`) |
| Phase 1B | Pemberitahuan weekend/hari libur di jalur review manual | — | ⬜ backlog, tidak memblokir |
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | 🟡 Task 8 selesai | ⬜ belum ada pembaca |
| Phase 3 | Tab "Jadwal Iklan" terpadu di dashboard admin | ⬜ | ⬜ |
| Phase 4 | Tombol "Jadwalkan Iklan Lagi" aktif di dashboard user | ⬜ | ⬜ |

**Satu hal yang paling penting kalau kamu kembali setelah lama:** frontend
sudah di-deploy dari `main` 2026-08-04 (laporan admin langsung, bukan lewat log
build independen) — Phase 0/1 dan jembatan Kilat seharusnya sudah kelihatan di
produksi. **Checklist uji ujung-ke-ujung di §0 di bawah belum dijalankan.** Di
atas commit yang sudah dideploy itu ada satu batch baru yang **belum**
di-deploy sama sekali (commit `a4fc499`): papan jadwal Kilat di halaman Ads
Schedule, plus penutupan lubang "Create Page" untuk order Kilat — lihat §0B.

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

### 0B. Papan jadwal Kilat di Ads Schedule ⬅️ baru, belum deploy

Commit `a4fc499`. Halaman **Ads Schedule** sekarang punya toggle **Iklan |
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

### 2. Verifikasi Task 8 yang belum dijalankan

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

---

## Yang belum dikerjakan

Detail lengkap tiap task ada di
[`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md).
Urutan wajib: **8B → 8C → 9 → 10 → 11 → 12**, masing-masing rilis sendiri
(expand-and-contract). Tidak ada satu langkah pun yang mengharuskan semua lapis
berubah serentak.

| Task | Isi | Catatan |
|---|---|---|
| **8B** | `reward_pools` — pool jadi milik batch, bukan milik jadwal pertama | ⚠️ **paling berisiko di seluruh Phase 2.** Tanda tangan RPC `get_batch_rewards` dibekukan (kontrak platform pengundian), dan agregasi batch ditulis **dua kali** — RPC SQL **dan** `buildBatches()` di `functions/api/respondents.js` — wajib pindah bersamaan atau dua endpoint melaporkan angka berbeda. Layak sesi kerja sendiri. |
| **8C** | Pensiunkan sisa fitur pengundian di dashboard | Tanpa perubahan skema, mandiri, dan ada **bug live** di dalamnya: indikator merah "Select Winners" di `PublishPageManagement` menyala permanen di tiap halaman berhadiah sejak Mei 2026, karena `survey_winners` sengaja berhenti terisi sejak pengundian diserahkan ke pihak ketiga. Kandidat termudah untuk dikerjakan lebih dulu. |
| **9** | Pisahkan status order dari status jadwal | 🚧 **Terhalang** — lihat di bawah. Bagian frontend tersulit; `deriveOrderUiState` ditulis ulang. Kerjakan sendiri dengan QA khusus. |
| **10** | Satukan aturan waktu & pembayaran | Cutoff 13.00/14.00 WIB berlaku seragam ke semua jadwal; `transactions`/`invoices` pakai `schedule_id`; **"Mark as Paid" jadi per-jadwal** (sekarang order-level dan bisa menandai lunas order tanpa jadwal sama sekali — 3 dari 522 order terukur begitu). |
| **11** | Pindahkan pembaca, lalu contract | ⚠️ `functions/api/respondents.js` membaca `form_submissions_extend` **langsung**. View kompatibilitas WAJIB ada sebelum tabel aslinya disentuh, bukan sesudah. |
| **12** | Istilah — semua jadi "Jadwal Iklan 1/2/3" | Berhenti di API: nama field publik (`period_batch`, `batch_status`, `can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut berganti. |

Setelah Phase 2: **Phase 3** (tab "Jadwal Iklan" terpadu di admin) menyusut jadi
mapper biasa, dan **Phase 4** (tombol "Jadwalkan Iklan Lagi" di dashboard user)
baru masuk akal dikerjakan.

---

## 🚧 Penghalang yang harus diketahui sebelum menjadwalkan Task 9

Task 9, dan sebagian Task 10 dan 12, menyasar file yang **tidak ada di `main`**:

- `src/components/status/deriveOrderUiState.ts`
- `src/components/status/airingPeriods.ts`
- `src/components/status/SchedulePhase.tsx`

Ketiganya hanya ada di branch **`feat/dashboard-soft-dna-navbar`** (17 commit di
depan `main`) — padahal rencana Phase 2 justru melarang menumpang branch itu
supaya kedua pekerjaan bisa di-revert sendiri-sendiri.

**Akibatnya:** Task 8B dan 8C aman dikerjakan dari `main` sekarang (semua
sasarannya SQL, serverless, dan dashboard admin). Task 9 ke atas menunggu branch
revamp masuk ke `main`.

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

---

## Peta dokumen

| File | Isi |
|---|---|
| **`docs/jadwal-iklan-progress.md`** | ⬅️ file ini — titik masuk, status berjalan |
| [`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md) | Rencana Phase 2 lengkap, Task 8–12 |
| [`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md) | Checklist uji setelah deploy frontend |
| `multi-step-form/sql/36`–`41` | Migrasi; tiap file memuat pre-check, verifikasi, dan rollback-nya sendiri di bagian bawah |
