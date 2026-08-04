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
| Phase 0 | Cabut gerbang banner, hitung perpanjangan di kuota slot, larang jadwal tumpang tindih | ✅ `sql/36`–`39` | ⬜ **belum deploy** |
| Phase 1 | Auto-create + auto-publish halaman iklan dengan banner default | ✅ `sql/40` | ⬜ **belum deploy** |
| Phase 1B | Pemberitahuan weekend/hari libur di jalur review manual | — | ⬜ backlog, tidak memblokir |
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | 🟡 Task 8 selesai | ⬜ belum ada pembaca |
| Phase 3 | Tab "Jadwal Iklan" terpadu di dashboard admin | ⬜ | ⬜ |
| Phase 4 | Tombol "Jadwalkan Iklan Lagi" aktif di dashboard user | ⬜ | ⬜ |

**Satu hal yang paling penting kalau kamu kembali setelah lama:** DB sudah di
`sql/41` sementara frontend produksi masih di `9ea82ef`. Tiga bug Phase 0 masih
hidup di layar walau perbaikannya sudah ada di `main` (`b4ed204`). Deploy dari
`main` menutup celah itu — lihat "Yang menunggu tindakan" di bawah.

---

## Yang menunggu tindakan

### 1. Deploy frontend dari `main` ⬅️ paling mendesak

`origin/main` = `b4ed204`. Rollback frontend = `9ea82ef`.

Setelah deploy, jalankan
[`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md).
Bagian **§2, §3, §5 wajib**; sisanya kalau sempat. Checklist itu sudah dikoreksi
2026-08-04 — §8 dulu menyuruh memastikan Phase 1 *diam*, sekarang kebalikannya
karena `sql/40` sudah aktif.

Kenapa mendesak: yang tayang sekarang menjual kapasitas slot yang tidak ada
(perpanjangan tidak terhitung), menagih insentif batch dua kali untuk jadwal
ke-3+, dan bisa menggelapkan iklan yang sedang berjalan saat admin melakukan
reschedule.

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

---

## Peta dokumen

| File | Isi |
|---|---|
| **`docs/jadwal-iklan-progress.md`** | ⬅️ file ini — titik masuk, status berjalan |
| [`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md) | Rencana Phase 2 lengkap, Task 8–12 |
| [`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md) | Checklist uji setelah deploy frontend |
| `multi-step-form/sql/36`–`41` | Migrasi; tiap file memuat pre-check, verifikasi, dan rollback-nya sendiri di bagian bawah |
