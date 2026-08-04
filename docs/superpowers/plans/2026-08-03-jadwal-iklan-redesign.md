# Jadwal Iklan — Phase 2: Satukan Model Jadwal (`ad_schedules`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status file ini, 2026-08-03:** file ini awalnya berjudul "Jadwal Iklan Redesign: Bug
> Fix + Admin Tab Restructure" dan berisi rencana lain. Rencana itu **digantikan penuh**
> setelah penelusuran kode menemukan premisnya keliru di titik terpenting — lihat
> `~/.claude/plans/composed-doodling-bonbon.md` untuk narasi lengkap koreksinya. File ini
> ditulis ulang supaya berdiri sendiri sebagai rencana eksekusi Phase 2, tanpa perlu
> membuka dokumen itu.

## Status rilis sejauh ini

| Fase | Isi | Status |
|---|---|---|
| Phase 0 | Cabut gerbang banner dari cron, hitung perpanjangan di kuota slot, 3 perbaikan kecil | ✅ **live di produksi** (`sql/36`–`39`, commit `05a2fa1`) |
| Phase 1 | Auto-create + auto-publish halaman iklan dengan banner default | ✅ **live di produksi** (`sql/40`, commit `7ec7c28`) |
| Phase 1B | Beri tahu jalur review-manual soal weekend/hari libur admin | ⬜ Backlog, tidak memblokir Phase 2 — beda file (`StepCheckout.tsx`, `airing-window.ts`) |
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | ⬜ **Rencana ini** |
| Phase 3 | Tab "Jadwal Iklan" terpadu di admin | ⬜ Setelah Phase 2 — butuh baris data yang setara, bukan adapter |
| Phase 4 | Aktifkan **"jadwalkan iklan lagi" di dashboard user** | ⬜ Roadmap — lihat di bawah. **Prasyarat: `reward_pools` (Task 8B-2)** |
| Phase 5 | Aktifkan **Kilat di dashboard user** | ⬜ Roadmap — setelah Phase 4 |

### Roadmap Phase 4 & 5 (ditambahkan 2026-08-04)

Sampai hari ini perpanjangan hanya bisa dibuat admin: `ExtendSection.handleCreate`
meng-hardcode `slot_booked_by: 'admin'`, dan tidak ada pintu masuknya di dashboard user.
Akibatnya seluruh sistem top-up hadiah **belum pernah dipakai user** — 10 perpanjangan
sepanjang sejarah, `additional_prize_per_winner` masih 0 di semua baris (terukur 2026-08-04).

- **Phase 4 — "jadwalkan iklan lagi" untuk user.** Membuka jalur perpanjangan mandiri:
  pilih tanggal → sistem mengenali batch tujuan → invoice → bayar. **Prasyaratnya
  `reward_pools` (Task 8B-2)**, karena begitu jalur ini terbuka, tiga lubang laten di
  Task 8B-2 berubah dari "belum pernah terjadi" jadi rutin sekaligus.
- **Phase 5 — Kilat untuk user.** Slot Kilat (8/11/14/17 WIB, 2 kuota/slot, Senin–Jumat)
  sekarang hanya bisa dipesan lewat jembatan admin. Membukanya ke user menumpang alur yang
  sama dengan Phase 4, jadi ia menyusul, bukan paralel.

Keduanya pekerjaan produk, bukan bagian Phase 2 — dicatat di sini supaya urutan prasyarat
(`reward_pools` → Phase 4 → Phase 5) tidak hilang.

**Goal:** Satu baris = satu jendela tayang, **termasuk jadwal pertama**. Saat ini
`form_submissions` (jadwal pertama) dan `form_submissions_extend` (jadwal ke-2 dst.) adalah
dua tabel dengan skema, aturan waktu, dan kolom status yang berbeda-beda — itulah akar dari
tiga bug yang sudah ditambal terpisah di Phase 0 (kuota slot, insentif dobel, jendela
tertimpa). Setelah `ad_schedules` ada, admin dan user membaca baris yang sama, dan
restrukturisasi tab di Phase 3 menyusut jadi mapper biasa.

## Kenapa ini tidak bisa dikerjakan sekaligus

Cakupan pembaca/penulis yang harus ikut pindah:

| Lapis | Titik sentuh |
|---|---|
| SQL | `cron_activate_extends`, `get_page_active_period`, `get_batch_rewards` (`sql/37_batch_pool_context.sql`), trigger `compute_extend_period_batch`, RLS (`sql/21`), kolom PPN (`sql/34`), proteksi kolom bayar (`sql/33`) |
| Serverless | `functions/api/doku/webhook.js` (percabangan `entity_type`, baris ~488-491), `functions/api/respondents.js`, `functions/api/storage-cleanup.js` |
| Penulis jadwal | `src/utils/supabase.ts` (`fetchSlotAvailability`, `updateScheduleDates`), `SchedulePaymentView.tsx`, `PageBuilder/PageBuilderModal.tsx`, alur checkout, `ExtendSection.tsx` |
| Dashboard user | `StatusPage`, `ProgressTracker`, `deriveOrderUiState.ts`, `airingPeriods.ts` (`buildScheduleCards`), `status/SchedulePhase.tsx` |
| Dashboard admin | `SchedulingPage` (kalender), `PublishPageManagement`, `InternalDashboard`, `SubmissionDetailSheet`, `submissions/CampaignActions.tsx` |

Karena itu pakai pola **expand-and-contract**: tabel baru hidup berdampingan, pembaca
dipindah satu per satu, tabel lama baru dilepas di akhir. Tidak ada satu langkah pun yang
mengharuskan semua lapis berubah serentak, dan setiap task di bawah bisa dirilis sendiri.

## Global Constraints

- **Bentuk API keluar tidak boleh berubah.** Dua endpoint publik pihak ketiga:
  `/api/surveys` (aplikasi Jakpat) dan `/api/respondents` (platform pengundian). Nama,
  tipe, dan daftar field yang sudah ada **tidak boleh berubah** — nilai dan perilaku di
  baliknya boleh. Field publik yang dibekukan: `period_batch` (tetap format `YYYY-MM`),
  `batch_status`, `can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`.
- **`distributed_at` TIDAK dibuat.** Pengundian dilakukan platform pihak ketiga; sistem
  ini tidak pernah tahu kapan sebuah pool benar-benar dibagikan, jadi kolom itu hanya
  akan jadi tebakan yang terlihat otoritatif. Konsekuensinya dicatat sadar di Task 8B
  poin 3 — jangan mencoba menutupnya dengan menambah kolom itu kembali.
- **Jangan normalisasi nilai `jakpat_id` yang tersimpan.** Kalau ada perbaikan duplikat
  huruf besar/spasi, lewat indeks unik fungsional pada `(page_id, lower(btrim(jakpat_id)))`
  — bukan menulis ulang datanya. Platform pengundian mencocokkan `jakpat_id` apa adanya.
- **Kerjakan di branch sendiri, bercabang dari `main`.** Pola yang sama dipakai Phase 0/1
  (`feat/jadwal-iklan`, sudah di-merge & dihapus). Jangan menumpang branch revamp visual
  yang sedang berjalan (`feat/dashboard-soft-dna-navbar`) — keduanya tidak berhubungan dan
  perlu bisa di-revert sendiri-sendiri.
- `npm run build` harus lolos setelah tiap task. Tidak ada test runner selain
  `jakpat-id.test.ts` dan `airing-window.test.ts` (dijalankan lewat esbuild+node, lihat
  CLAUDE.md).
- Working directory untuk semua perintah: `/Users/jakpat/GarCode/jakpatforuniv/multi-step-form`

---

## Task 8: Buat `ad_schedules` + backfill (expand)

**File baru:** `multi-step-form/sql/41_ad_schedules.sql`

Kolom: `id`, `submission_id`, `ordinal` (1 = jadwal pertama), `start_date`, `end_date`,
`duration`, `status` (siklus tayang saja:
`waiting_payment|paid|scheduled|live|completed|cancelled`), `payment_status`,
`prize_per_winner`, `winner_count`, `additional_prize_per_winner`, `is_new_period`,
`period_batch`, `total_cost`, `subtotal`, `ppn_amount`, `voucher_code`, `slot_booked_by`,
`slot_reserved_at`, `admin_notes`, `created_at`, `updated_at`. `UNIQUE (submission_id, ordinal)`.
Pertahankan trigger penghitung `period_batch` yang sudah ada.

Backfill: `form_submissions` yang punya `start_date` → `ordinal = 1`; lalu
`form_submissions_extend` diurut `start_date` → `ordinal = 2..n`.

**Kunci keamanannya:** selama transisi, trigger dua arah menjaga
`form_submissions.start_date/end_date/duration/payment_status` tetap mencerminkan baris
`ordinal = 1`. Semua pembaca lama terus bekerja tanpa diubah, dan migrasi bisa dihentikan
di titik mana pun tanpa merusak produksi.

- [ ] Tulis skema + trigger dua arah + backfill di `sql/41_ad_schedules.sql`
- [ ] Pre-check: `SELECT COUNT(*) FROM form_submissions WHERE start_date IS NOT NULL` vs
      jumlah baris `ad_schedules ordinal=1` setelah backfill — harus sama
- [ ] Pre-check: jumlah baris `form_submissions_extend` vs `ad_schedules ordinal>1` — harus
      sama
- [ ] Uji trigger dua arah: ubah tanggal lewat alur lama (`updateScheduleDates`) → baris
      `ordinal = 1` di `ad_schedules` ikut berubah

---

## Task 8B: Reward pool jadi milik batch, bukan milik jadwal

> **Dipecah dua, 2026-08-04.** Task ini semula satu paket: buat `reward_pools`, tulis ulang
> `get_batch_rewards` **dan** `buildBatches()`, hapus `get_schedule_batch_context`. Rencana
> ini juga mensyaratkan satu hal dikerjakan lebih dulu — **ukur divergensi dua agregasi
> batch di produksi**. Pengukuran itu (read-only, 2026-08-04) mengubah bentuk task:
> masalahnya nyata, tapi `reward_pools` bukan obatnya. Yang rusak bukan tempat penyimpanan
> angka, melainkan **siapa yang membacanya**.
>
> - **Task 8B-1 — konvergensi + memuluskan top-up.** Dikerjakan sekarang. Tanpa perubahan
>   skema.
> - **Task 8B-2 — `reward_pools`.** **Ditunda, jadi prasyarat Phase 4** (bukan bagian
>   Phase 2).

### Baseline pengukuran (2026-08-04, read-only, jadi acuan resmi)

| Yang diukur | Hasil |
|---|---|
| Perpanjangan sepanjang sejarah | **10** (7 dibayar) |
| `additional_prize_per_winner` terpakai | **0 — belum pernah sekali pun** |
| Selisih SQL vs JS pada jam pengukuran (14:17 UTC) | 0 |
| Selisih SQL vs JS disimulasikan **10:00 WIB** | **2 survei** |
| Batch multi-baris (kelas divergensi ke-2) | 6, empat punya jendela historis s/d 12 hari |
| Halaman terbit | 273 (266 bersurvei + 7 pengumuman) |
| Halaman terbit dengan **lebih dari satu** batch | **0** — semuanya tepat satu |
| Nominal berubah bila halaman publik pindah ke agregat | **0 dari 266** |
| Order berhadiah tapi belum berjadwal | **83** (25 sejak Juli) |
| Pool dibayar lalu jadwalnya dibatalkan | 0 |

> ⚠️ **Nol selisih itu artefak jam, bukan bukti aman.** Divergensi terbesar hanya hidup
> 00:00–08:00 UTC (07:00–15:00 WIB), karena sisi SQL mengangkat `end_date` ke 15:00 WIB
> lewat `airing_instant_of_date()` sementara sisi JS membacanya mentah sebagai 00:00 UTC.
> Mengukurnya di luar jendela itu memberi **nol palsu** — jebakan yang hampir membuat task
> ini disimpulkan "tidak ada masalah". Ukur dua kali: apa adanya, dan dengan `NOW()`
> disimulasikan ke 03:00 UTC.

### Task 8B-1 — satu sumber angka hadiah, dan top-up jadi mulus

Agregasi batch ditulis **dua kali** dan keduanya sudah berbeda:

| | SQL `get_batch_rewards` (`sql/37`) | JS `buildBatches()` (`respondents.js:111`) |
|---|---|---|
| Dipakai | Mode 2 (detail) | Mode 1 (daftar) |
| Akhir tayang parent | `airing_instant_of_date()` → **15:00 WIB** | `end_date` mentah → **00:00 UTC** |
| Batch masih aktif? | `BOOL_OR(aktif AND baris.end > NOW())` **per baris** | `(∃ aktif) AND (MAX(end) > NOW())` **per batch** |
| Parent `rejected`/`spam` | dibuang | ikut dihitung |
| Tanggal parent kosong | tanpa fallback | fallback ke `publish_*_date` |

Dan **empat pembaca lain** tidak memakai satu pun dari keduanya — mereka membaca
`form_submissions.prize_per_winner × winner_count` mentah, sehingga top-up **tak pernah
terlihat**:

| Pembaca | Titik | Perlakuan di 8B-1 |
|---|---|---|
| Halaman survei publik | `src/pages/public/SurveyPage.tsx:866` | ✅ dipindah ke agregat batch |
| Feed aplikasi Jakpat | `functions/api/surveys.js:130,168,172` | ✅ dipindah ke agregat batch |
| Listing survei internal | `src/pages/public/SurveyListingPage.tsx:87` | ⬜ dibiarkan — bukan janji ke responden, satu RPC massal tak sepadan |
| Dashboard admin "Reward: Rp X × N" | `PublishPageManagement` | ⬜ dibiarkan — layar admin, bukan janji publik |

Alur top-up hari ini, dan apa yang 8B-1 tutup:

| # | Langkah | Status |
|---|---|---|
| 1 | Bikin top-up | ⚠️ admin-only (`slot_booked_by:'admin'` di-hardcode) → **Phase 4** |
| 2 | Batch tujuan dikenali | ✅ server-side (`get_schedule_batch_context`, `sql/37`) |
| 3 | Masuk invoice | ⚠️ masuk, **qty salah sumber** → **8B-1** |
| 4 | Bayar via DOKU | ✅ |
| 5 | Naik di API pengundian | ✅ `SUM(add_p)` |
| 6 | Naik di **halaman publik** | ❌ tidak pernah → **8B-1** |
| 7 | Naik di **feed aplikasi Jakpat** | ❌ tidak pernah → **8B-1** |

Bug uang laten di langkah 3: `ExtendSection.tsx:891` **menampilkan** `poolWinnerCount` yang
benar dari RPC, tapi baris 350 membangun invoice dengan `currentWinnerCount` — jumlah
pemenang order **induk**, bukan pool batch tujuan. Belum pernah meledak karena top-up belum
pernah dipakai; **harus tertutup sebelum Phase 4 membukanya untuk user.**

- [ ] `sql/44_batch_rewards_bulk.sql`: `get_batch_rewards_bulk(UUID[])` dengan logika
      `sql/37` **persis** (hanya `submission_id` ditambahkan ke kembalian), lalu
      `get_batch_rewards` jadi pembungkus tipis di atasnya — satu implementasi di seluruh
      sistem. **Tanpa perubahan skema, tanpa satu baris data tersentuh.**
- [ ] **Bekukan tanda tangan RPC `get_batch_rewards`** — nama, argumen, dan daftar kolom
      kembalian tidak boleh berubah
- [ ] Mode 1 `respondents.js` memanggil RPC yang sama dengan Mode 2; `buildBatches()`
      (111-176) dan pengambilan extends massal (92-108) dihapus
- [ ] `ExtendSection.initializePaymentItems` memakai `poolWinnerCount` untuk qty item
      "Additional Prize per Winner" (fallback `currentWinnerCount` hanya bila RPC diam)
- [ ] `SurveyPage.tsx` + `functions/api/surveys.js` membaca agregat batch, bukan kolom
      mentah
- [ ] Uji: `/api/respondents` Mode 1 vs Mode 2 untuk survei yang sama → blok `batches`
      identik field demi field
- [ ] Uji kontrak: `pg_get_function_result('get_batch_rewards'::regproc)` sebelum & sesudah
      → string identik
- [ ] Uji value-neutrality: 266 halaman bersurvei → **0** nominal berubah
- [ ] Uji hak akses `anon` lewat `SET LOCAL ROLE` di dalam `BEGIN…ROLLBACK` (SELECT biasa
      di SQL Editor jalan sebagai `postgres`, tidak membuktikan apa pun — pelajaran `sql/43`)
- [ ] Uji top-up ujung ke ujung: invoice pakai qty pool → dibayar → badge "Total Reward" di
      halaman publik **naik** → `/api/respondents` ikut naik → `requires_banner_update`
      menyala

**Yang berubah di mata konsumen API.** Mode 1 mulai menjawab sama dengan Mode 2; setiap
perbedaan adalah **Mode 1 dikoreksi**, Mode 2 tidak bergerak. Bentuk respons tidak berubah
sama sekali.

| Perubahan | Terukur |
|---|---|
| `can_select_winners` tak lagi menyala 8 jam terlalu cepat di hari terakhir | 2 survei @10:00 WIB; 13 order masih akan melewatinya |
| `can_select_winners` tak lagi tertahan baris tak-aktif yang berakhir belakangan | 6 batch multi-baris |
| `period.start`/`period.end` batch parent bergeser +8 jam (00:00 UTC → 15:00 WIB) | 266 batch **teksnya**, tapi 256 sudah lewat dan tanggalnya tidak pernah pindah — inert, lihat "Dampak ke API keluar" |
| Parent `rejected`/`spam` tak lagi menyumbang hadiah | 0 halaman terbit |
| Fallback ke `publish_*_date` hilang | 0 halaman terbit |
| Nominal di halaman publik & feed | **0 berubah hari ini** |

Satu perbedaan sengaja **tidak** disamakan: bila `end_date` parent `NULL`,
`get_batch_rewards` memancarkan batch ber-`period_batch: null` sementara `buildBatches()`
melewatinya. Nol baris di produksi; menyamakannya = mengubah perilaku `get_batch_rewards` =
melanggar pembekuan kontrak.

### Task 8B-2 — `reward_pools` (DITUNDA, prasyarat Phase 4)

**Kenapa ditunda.** Skema yang ada sudah cukup **selama pool selalu satu angka yang bisa
diturunkan dari baris jadwal yang masih hidup.** Hari ini itu benar: 10 perpanjangan
seumur hidup sistem, 0 top-up terpakai, 0 pool yatim. Dikerjakan sekarang, `reward_pools`
menyelesaikan masalah yang belum ada sambil menanggung masalah desain yang belum terjawab.

**Kapan ia jadi penting — tiga pemicu, semuanya dibuka Phase 4:**

1. **Pool harus hidup lebih lama dari jadwal yang mendanainya.** Batalkan jadwal,
   kontribusinya hilang dari agregat — padahal uangnya sudah dibayar dan hadiahnya sudah
   dijanjikan ke responden yang sudah menjawab. Terukur: **0 kasus**. Laten, tapi terbuka
   permanen.
2. **Dua pool penuh di satu batch.** `MAX()` menelan yang kedua diam-diam. **Sudah terjadi
   dua kali** — Rp 425.000, Juli 2026 ("Studi Pengambilan Keputusan" Rp 50.000 +
   "Faktor-Faktor Psikologis" Rp 375.000), keduanya dibuat sebelum `sql/37` diterapkan.
   `sql/37` menghentikan penyebabnya, tapi bentuk datanya masih memungkinkan uang tertelan
   tanpa jejak. Dengan tabel pool, pembayaran kedua wajib diputuskan eksplisit: top-up,
   atau ditolak. **Keputusan 2026-08-04: dicatat, data tidak disentuh.**
3. **Mencatat bahwa batch sudah dibayarkan.** `can_select_winners` murni inferensi
   (`NOT has_active`) — lihat poin 3 di daftar lubang di bawah. Tidak ada tempat untuk
   menandai pool sudah dibagikan selama tidak ada entitas pool.

Ketiganya laten **justru karena** top-up cuma bisa lewat admin dan belum pernah dipakai.
Begitu "jadwalkan iklan lagi" dibuka untuk user (Phase 4), frekuensinya naik dari nol jadi
rutin, dan ketiganya berubah dari laten jadi hidup sekaligus.

> **⛔ Masalah desain yang wajib dijawab sebelum tabelnya dirancang.** **83 order sudah
> mendanai hadiah tapi belum punya tanggal sama sekali** (25 di antaranya sejak Juli 2026)
> — `start_date IS NULL`, sehingga `period_batch` tidak bisa dihitung. Kunci
> `(submission_id, period_batch)` tidak punya tempat untuk mereka. Ini bukan detail
> implementasi: ia menentukan apakah kuncinya boleh nullable, apakah pool dibuat saat bayar
> atau saat jadwal ditetapkan, dan apa yang terjadi pada 83 baris itu saat backfill.

Rancangan yang sudah disepakati sejauh ini (tetap berlaku, tinggal dieksekusi saat Phase 4
mendekat):

**Tabel baru `reward_pools`:** kunci `(submission_id, period_batch)`, berisi
`prize_per_winner`, `winner_count`, akumulasi top-up, `created_at`. `period_batch` tetap
diturunkan dari bulan `end_date` — janji "pemenang diumumkan setiap akhir bulan" di
halaman iklan tetap berlaku.

**Aturan penagihan berhenti jadi turunan kalender, jadi turunan keberadaan pool:**

| Kondisi batch tujuan | Perlakuan |
|---|---|
| Sudah ada pool untuk batch itu | jadwal menempel; insentif **tidak** ditagih. Top-up opsional. |
| Belum ada pool | wajib pool baru; insentif ditagih. |

> Sebagian besar nilainya sudah diambil di Phase 0 (`get_schedule_batch_context` RPC,
> `sql/37`) — bukan alternatif, lanjutannya. Yang tersisa untuk `reward_pools`: pool jadi
> entitas yang bisa ditunjuk, top-up punya tempat tinggal, dan agregasi `MAX()` ganda di
> `get_batch_rewards` (poin 4 di bawah) hilang karena angkanya bersumber tunggal.

Ini menghapus `fetchBatchContext()`/RPC `get_schedule_batch_context` sepenuhnya, termasuk
pemanggilnya di `ExtendSection.tsx` (`initializePaymentItems`) yang sekarang memutuskan
item "Respondent's Incentive (New Batch)" darinya.

**Tiga lubang tertutup, satu sengaja dibiarkan terbuka:**

1. Membatalkan jadwal pertama tidak lagi merusak basis akumulasi jadwal berikutnya —
   basisnya milik batch.
2. Ganda-tagih insentif hilang secara struktural (bukan lagi kondisi yang dihitung ulang
   tiap kali).
3. **Tetap terbuka — keputusan sadar.** `can_select_winners` masih `NOT has_active` murni
   hasil inferensi; menambah jadwal baru ke batch yang pemenangnya sudah diundi akan
   membuka kembali batch itu diam-diam. `distributed_at` tidak dibuat (lihat Global
   Constraints) karena pengundian ada di pihak ketiga. Mitigasinya di sisi mereka — lihat
   "Perlu dikonfirmasi" di bawah.
4. Di `get_batch_rewards` (`sql/37_batch_pool_context.sql`), baris parent difilter
   `submission_status NOT IN ('rejected','spam')` — tapi order yang dibatalkan **setelah**
   halamannya terbit tetap menyumbang hadiah yang tidak pernah dibayar. Setelah pool jadi
   tabel sendiri, angkanya bersumber tunggal dan bug ini hilang bersamanya.

Agregasi batch tidak lagi ditulis dua kali saat 8B-2 dikerjakan — 8B-1 sudah menyatukannya
jadi satu implementasi (`get_batch_rewards_bulk`, `sql/44`). Konsekuensinya 8B-2 cukup
mengubah **isi** satu fungsi, bukan dua tempat yang harus dijaga tetap sepakat.

- [ ] **Jawab dulu:** di mana pool tinggal untuk 83 order berhadiah tanpa `start_date`
- [ ] Buat tabel `reward_pools` (`sql/45`) + migrasi data dari
      `form_submissions.prize_per_winner` per `(submission_id, period_batch)`
- [ ] Tulis ulang isi `get_batch_rewards_bulk` untuk membaca dari `reward_pools`
- [ ] **Bekukan tanda tangan RPC `get_batch_rewards`** — nama dan daftar kolom kembalian
      tidak boleh berubah, hanya isinya
- [ ] Hapus `fetchBatchContext`/`get_schedule_batch_context` dan pemanggilnya di
      `ExtendSection.tsx`
- [ ] Uji: jadwal baru di batch yang **sama** dan belum didistribusikan → invoice tidak
      memuat item insentif, total hadiah di halaman publik tidak berubah
- [ ] Uji: jadwal di batch **baru** → insentif ditagih
- [ ] Uji: order yang **dibatalkan setelah halamannya terbit** → tidak lagi menyumbang
      hadiah
- [ ] Uji kontrak: panggil `get_batch_rewards` dengan payload sama sebelum & sesudah task
      ini → daftar kolom dan tipe respons identik, hanya nilai yang boleh berbeda

---

## Task 8C: Pensiunkan sisa fitur pengundian di dashboard ini

Tidak ada backfill maupun perubahan skema di sini — murni pembersihan, salah satunya
cukup mendesak. Konteks: pengundian dulu dilakukan dari dashboard admin tapi tidak
akurat (data diambil manual dari database lain); sejak 2026-05-05 diserahkan ke platform
pihak ketiga. `survey_winners` yang berhenti terisi adalah serah terima yang disengaja.

1. **Indikator pemenang di dashboard sudah salah sejak Mei.**
   `PublishPageManagement` menghitung `current_winners_count` dari `survey_winners` yang
   beku, lalu `needsWinners = expectedWinners > 0 && currentWinners < expectedWinners`.
   Untuk setiap halaman berhadiah sejak Mei, `currentWinners` selalu 0 → indikator merah
   "Select Winners" menyala permanen. Copot indikatornya.
2. **Ganti judul tombol "Select Winners".** Layar di baliknya (`SubmissionsManagerView`)
   tidak menyentuh `survey_winners` sama sekali — hanya menampilkan responden.
3. **Tandai `survey_winners` sebagai arsip beku** di skema dan di modal "Daftar
   Pemenang", supaya jelas isinya berhenti di Mei 2026.
4. **Constraint `UNIQUE(page_id, jakpat_id)` dibiarkan apa adanya** — aturan "satu
   responden menang sekali" ditegakkan pihak ketiga, dan tabel ini tidak lagi ditulis.

- [x] Copot indikator "Select Winners" yang salah dari `PublishPageManagement` (2026-08-04, commit `49f7884`)
- [x] Ganti nama tombol sesuai fungsinya (menampilkan responden, bukan memilih pemenang) (commit `49f7884`+`f872184`)
- [x] Tandai `survey_winners` sebagai arsip di skema (komentar) dan di UI modal (`sql/43`, commit `2128084`+`e00ccf3` — **diterapkan & diverifikasi di produksi 2026-08-04**: anon 0 / user biasa 0 / admin 267)

---

## Task 9: Pisahkan status order dari status jadwal

`form_submissions.submission_status` sekarang memuat status review
(`in_review`/`approved`/`rejected`/`spam`) **dan** status tayang
(`paid`/`scheduled`/`live`/`completed`) di satu kolom — akar struktural kenapa "status
jadwal 1" tak bisa dipisahkan dari "status order".

Setelah Task 8: status tayang jadi milik `ad_schedules.status`, dan
`form_submissions.submission_status` menyusut jadi status review saja. Selama transisi
kolom lama tetap dicerminkan trigger dari Task 8.

**Ini bagian frontend tersulit dari seluruh Phase 2** — `getCurrentStepIndex` dan
`deriveOrderUiState` di `src/components/status/deriveOrderUiState.ts` ditulis ulang
untuk membaca `ad_schedules`. Kerjakan sebagai task tersendiri dengan QA khusus dashboard
user, jangan digabung dengan task lain.

- [ ] Trigger dua arah: `submission_status` lama tetap sinkron selama transisi
- [ ] Tulis ulang `getCurrentStepIndex`/`deriveOrderUiState` membaca `ad_schedules`
- [ ] QA manual dashboard user: bandingkan tampilan order yang sama sebelum/sesudah,
      tidak boleh ada perubahan yang terlihat

---

## Task 10: Satukan aturan waktu & pembayaran

Konsekuensi langsung dari "semua jadwal setara" — sekarang aturannya berbeda diam-diam:

- Tahan slot 1 jam dan cutoff bayar 13.00/14.00 WIB hanya berlaku untuk jadwal pertama;
  `buildScheduleCards` menetapkan `deadline: null` untuk perpanjangan. Setelah
  penyatuan, berlakukan `src/utils/airing-window.ts` seragam ke semua jadwal.
- `transactions`/`invoices`: `entity_type` + `extend_id` → `schedule_id` yang menunjuk
  `ad_schedules`. Backfill nilai `'submission'`/`'extend'` lama; pembaca harus toleran
  dua bentuk selama transisi, termasuk `webhook.js` yang bercabang di baris ~488-491.
- **"Mark as Paid" jadi per-jadwal.** Sekarang ia order-level
  (`SubmissionDetailSheet.tsx:~982`) dan dialognya menyatakan menandai *semua*
  invoice/transaksi terkait lunas. Begitu kartu terlihat setara, admin akan mengira
  tombolnya per-jadwal — footgun uang, ubah bersamaan dengan tampilan kartu.

  **Alasan kedua (ditemukan saat uji Phase 0):** tombolnya sekarang tidak melihat apakah
  order punya jadwal sama sekali — order non-auto-approval reguler masuk dengan
  `start_date`/`end_date` NULL, jadi admin bisa menandainya lunas sebelum ada tanggal
  ("pembayaran yatim"). Menjadikan tombol per-jadwal menutup ini secara struktural: sebuah
  jadwal selalu punya tanggal. Terukur 2026-08-03: 3 dari 522 order lunas tanpa jadwal —
  jarang, jadi tidak perlu penjaga terpisah sebelum task ini; cukup dipastikan Task 10
  tidak melewatkan kasusnya.

- [ ] Terapkan cutoff waktu seragam dari `airing-window.ts` ke semua jadwal (bukan hanya
      jadwal pertama)
- [ ] Tambah `schedule_id` di `transactions`/`invoices`, backfill dari `entity_type`
- [ ] `webhook.js` toleran kedua bentuk (`entity_type` lama & `schedule_id` baru) selama
      transisi
- [ ] "Mark as Paid" jadi per-jadwal; verifikasi tidak ada lagi jalur yang menandai lunas
      tanpa jadwal

---

## Task 11: Sederhanakan pembaca, lalu contract

Pindahkan pembaca ke `ad_schedules` satu per satu (SQL → serverless → dashboard user →
dashboard admin). Setelah semuanya pindah dan stabil satu siklus rilis:

- `fetchSlotAvailability` (`src/utils/supabase.ts`) runtuh jadi satu query — perbaikan
  Phase 0 yang menggabungkan dua sumber jadi tidak perlu lagi;
- `get_page_active_period` tidak lagi punya dua jalur (parent vs extend);
- `form_submissions_extend` disisakan sebagai **view** kompatibilitas, baru dihapus
  setelah satu siklus rilis tanpa keluhan. **`respondents.js` membaca tabel ini
  langsung** (sekitar baris 96-100) — view wajib ada sebelum tabel aslinya disentuh,
  bukan sesudah;
- kolom jadwal di `form_submissions` ditandai deprecated (jangan buru-buru di-drop — ada
  data historis dan integrasi yang belum tentu terpetakan).

- [ ] Pindahkan `fetchSlotAvailability` ke satu query atas `ad_schedules`
- [ ] Pindahkan `get_page_active_period` (SQL)
- [ ] Buat view kompatibilitas `form_submissions_extend`, verifikasi `respondents.js`
      tetap jalan tanpa perubahan
- [ ] Tandai kolom jadwal lama di `form_submissions` sebagai deprecated (komentar skema)
- [ ] Setelah satu siklus rilis tanpa keluhan: hapus tabel `form_submissions_extend` asli

---

## Task 12: Istilah

Setelah modelnya setara, istilahnya menyusul: semua kartu jadi "Jadwal Iklan 1 / 2 / 3",
tanpa kata "extend" atau "perpanjangan" di UI. Identifier kode ikut (`ExtendSection` →
`ScheduleSection`, `FormSubmissionExtend` → `AdSchedule`, dst).

**Batas: berhenti di API.** Nama field publik (`period_batch`, `batch_status`,
`can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut
diganti — lihat Global Constraints. `entity_type = 'extend'` aman diganti karena internal.

Catatan operasional: nama item invoice ("Extend Iklan (ads)") ikut terkirim ke DOKU dan
tersimpan di riwayat transaksi. Mengubahnya membuat invoice lama dan baru berbeda istilah
— wajar, tapi beri tahu finance agar tidak dikira dua produk.

- [ ] Ganti istilah UI (Indonesia) dan identifier kode (Inggris) secara konsisten
- [ ] Verifikasi tidak ada field API publik yang ikut berganti nama
- [ ] Beri tahu finance soal nama item invoice yang berubah

---

## File Map

### Baru
| File | Task | Tujuan |
|---|---|---|
| `sql/41_ad_schedules.sql` | 8 | Tabel `ad_schedules` + backfill + trigger dua arah |
| `sql/44_batch_rewards_bulk.sql` | **8B-1** | `get_batch_rewards_bulk(UUID[])`; `get_batch_rewards` jadi pembungkusnya. Tanpa perubahan skema |
| ~~`sql/42_reward_pools.sql`~~ ~~`sql/44_reward_pools.sql`~~ `sql/45_reward_pools.sql` | **8B-2** (ditunda) | Tabel `reward_pools`, tulis ulang isi agregasi. Nomor dikoreksi dua kali: `42` dipakai Kilat (`sql/42_kilat_slots.sql`, commit `c554880`), `43` dipakai Task 8C (`sql/43_survey_winners_archive.sql`), `44` dipakai 8B-1 |

### Dimodifikasi (menurut task)
| File | Task |
|---|---|
| `functions/api/respondents.js` | 8B-1, 11 |
| `functions/api/surveys.js` | 8B-1 |
| `src/pages/public/SurveyPage.tsx` | 8B-1 |
| `functions/api/doku/webhook.js` | 10 |
| `src/components/ExtendSection.tsx` | 8B-1, 8B-2, 12 |
| `src/utils/supabase.ts` (`fetchSlotAvailability`, `updateScheduleDates`) | 10, 11 |
| `src/components/status/deriveOrderUiState.ts` | 9 |
| `src/components/PublishPageManagement.tsx` | 8C |
| `src/components/SubmissionsManagerView.tsx` | 8C |
| `src/components/submissions/SubmissionDetailSheet.tsx` | 10 |

### Referensi (tidak berubah, dipakai untuk memverifikasi kesetaraan)
| File | Relevansi |
|---|---|
| `src/components/status/airingPeriods.ts` | `buildScheduleCards()` — pola kartu yang ditiru Phase 3 |
| `src/utils/airing-window.ts` | Sumber tunggal aturan waktu WIB, dipakai Task 10 |
| `sql/37_batch_pool_context.sql` | Versi `get_batch_rewards` saat ini, jadi basis Task 8B |

---

## Risk Assessment

| Risiko | Kemungkinan | Mitigasi |
|---|---|---|
| `respondents.js` membaca `form_submissions_extend` langsung, terputus saat tabel diganti | Tinggi kalau urutan salah | View kompatibilitas WAJIB ada sebelum tabel asli disentuh (Task 11) |
| `get_batch_rewards` berubah bentuk tanpa sengaja | Tinggi dampaknya (kontrak pihak ketiga) | Uji kontrak eksplisit: bandingkan kolom+tipe sebelum/sesudah Task 8B-1 |
| Dua implementasi agregasi batch (SQL + JS) berbeda hasil | **Terbukti terjadi** (2 survei @10:00 WIB, 6 batch multi-baris) | Task 8B-1 menghapus implementasi JS-nya; sesudah itu risikonya hilang, bukan dikelola |
| `deriveOrderUiState` regresi tampilan dashboard user | Sedang — ini bagian tersulit | Task 9 dikerjakan sendiri, QA manual sebelum lanjut task lain |
| Migrasi berhenti di tengah jalan | Rendah (by design) | Expand-and-contract: setiap task rilis sendiri, trigger dua arah menjaga kompatibilitas selama transisi |

---

## Verifikasi (per task, bukan di akhir)

- **Task 8:** bandingkan jumlah baris `ad_schedules` dengan `form_submissions`
  ber-`start_date` + `form_submissions_extend`; nol selisih. Ubah tanggal lewat alur
  lama → baris `ordinal = 1` ikut berubah.
- **Task 8B-1:** `/api/respondents` Mode 1 vs Mode 2 untuk survei yang sama → blok
  `batches` identik field demi field. Uji kontrak
  `pg_get_function_result('get_batch_rewards'::regproc)` sebelum/sesudah → string identik.
  Value-neutrality halaman publik → 0 dari 266 nominal berubah. Uji `anon` lewat
  `SET LOCAL ROLE` dalam `BEGIN…ROLLBACK`. Uji top-up ujung ke ujung: qty invoice =
  pool winner count → dibayar → badge "Total Reward" naik di halaman publik dan di API.
  **Perbandingan SQL vs JS dijalankan dua kali** — apa adanya dan dengan `NOW()`
  disimulasikan ke 03:00 UTC (di luar jendela itu hasilnya nol palsu).
- **Task 8B-2 (ditunda):** buat jadwal kedua yang berakhir di batch yang **sama** dan belum
  didistribusikan → invoice **tidak** memuat item insentif, total hadiah di halaman
  publik tidak berubah. Buat jadwal di batch **baru** → insentif ditagih. Uji
  order yang dibatalkan setelah halamannya terbit → tidak lagi menyumbang hadiah. Uji
  kontrak: payload sama sebelum/sesudah → kolom & tipe respons identik.
- **Task 8C:** indikator "Select Winners" tidak lagi menyala permanen di halaman
  berhadiah pasca-Mei; tombol bernama sesuai fungsinya; modal "Daftar Pemenang"
  menyatakan dirinya arsip.
- **Task 9:** bandingkan tampilan dashboard user untuk order yang sama sebelum/sesudah —
  tidak boleh ada perubahan yang terlihat.
- **Task 10:** uji pembayaran end-to-end di staging untuk jadwal pertama **dan** jadwal
  lanjutan, lewat DOKU maupun Mark as Paid. Cutoff waktu seragam untuk semua jadwal.
- **Task 11:** setelah tiap pembaca dipindah, bandingkan dashboard user sebelum/sesudah —
  nol perubahan terlihat. `respondents.js` tetap jalan sebelum tabel asli dihapus.
- **Task 12:** grep untuk "extend"/"perpanjangan" di teks UI — nol hasil. Field API
  publik tidak berganti nama.

---

## Dampak ke API keluar (kontrak dengan pihak ketiga)

Di sinilah kontrak pihak ketiga benar-benar berisiko — lebih hati-hati dari Phase 0/1.

- `respondents.js` membaca **`form_submissions_extend` secara langsung**. View
  kompatibilitas (Task 11) wajib ada sebelum tabelnya disentuh, bukan sesudah.
- Mode 2 memanggil RPC `get_batch_rewards`. **Bekukan tanda tangan dan daftar kolomnya**
  — Task 8B-1/8B-2 hanya boleh mengubah isi fungsinya, tidak boleh mengubah kolom yang
  dikembalikan.
- Agregasi batch ditulis dua kali dan melayani pihak ketiga yang sama lewat dua mode
  berbeda: RPC SQL untuk Mode 2, `buildBatches()` JS untuk Mode 1. **Task 8B-1 menghapus
  yang JS.** Efek sampingnya di Mode 1 semuanya koreksi.
- **Pergeseran `period.start`/`period.end` +8 jam: tidak perlu dikabarkan.** Angka "266
  batch" yang sempat dicatat di sini menghitung baris yang **teksnya** beda, bukan yang
  **perilakunya** beda — dan itu menyesatkan. Terukur 2026-08-04:

  | | |
  |---|---|
  | Total batch di halaman terbit | 266 |
  | **Sudah lewat** (`end_date < NOW()`) | **256** |
  | Masih berjalan | 10 |
  | Tanggal **UTC** bergeser karena +8 jam | **0** |
  | Tanggal **WIB** bergeser karena +8 jam | **0** |

  Pergeserannya 00:00 UTC → 08:00 UTC, alias 07:00 WIB → 15:00 WIB: **tanggalnya tidak
  pernah pindah, di zona mana pun.** Untuk 256 batch yang sudah lewat, batch itu tertutup
  sebelum maupun sesudah perubahan — tidak ada keputusan yang bisa berubah karenanya.
  Cek log 30 hari `/api/respondents` **dicoret**, bukan diparkir: tujuannya cuma memutuskan
  perlu-tidaknya mengabari, dan itu sudah terjawab di poin berikutnya.
- **`can_select_winners` TIDAK berubah makna.** Definisinya tetap "batch ini sudah bisa
  diundi karena tidak punya jadwal lain yang aktif". Tapi field itu sinyal KESIAPAN,
  bukan IZIN — batch yang sudah diundi lalu dibuka kembali (jadwal baru ditambahkan)
  akan membuat field ini `true` lagi untuk batch yang sudah pernah diundi. Aman selama
  platform pengundian menyimpan sendiri catatan batch mana yang sudah diundi.
- **Dikonfirmasi product owner 2026-08-04: `can_select_winners` BELUM FUNGSIONAL di
  dashboard pengundian.** Ia hanya ditampilkan `true`/`false` dan tidak mempengaruhi proses
  admin JFU memilih pemenang. Dua akibatnya, dan keduanya penting:

  1. **Bug 8 jam itu tidak pernah menggigit.** Kekhawatiran bahwa responden yang menjawab
     antara 07:00–15:00 WIB di hari terakhir bisa sudah di luar undian **tidak pernah
     terjadi** — tidak ada yang mengundi berdasarkan sinyal itu. Angkanya diperbaiki
     sebelum ada yang mempercayainya.
  2. **Ketepatannya baru mulai berarti saat mereka mewujudkannya jadi fungsional.** Di
     titik itulah peringatan "kesiapan, bukan izin" di poin sebelumnya harus sampai ke
     developer dashboard pengundian — bukan sekarang.
- Keputusan "batch tetap = bulan" melindungi kontrak ini: `period_batch` yang dikirim ke
  pihak ketiga tetap berformat `YYYY-MM`.

### Perlu dikomunikasikan ke developer dashboard pengundian — tapi NANTI

**Apakah mereka menyimpan sendiri catatan batch mana yang sudah diundi?**
`can_select_winners` adalah sinyal kesiapan ("batch sudah tutup"), bukan izin ("belum
pernah diundi"). Selama mereka melakukan deduplikasi di sisinya, tidak ada yang perlu
diubah di sini. Ini satu-satunya item yang butuh koordinasi eksternal untuk Phase 2 —
sisanya (perubahan skema, penyatuan tabel) tidak terlihat dari luar selama bentuk JSON
dijaga.

**Waktunya bukan sekarang.** Field itu belum fungsional di sisi mereka (dikonfirmasi
2026-08-04), jadi pertanyaan ini belum punya konsekuensi. Ia jadi mendesak tepat pada saat
mereka mulai memakainya untuk memutuskan sesuatu — itulah pemicu untuk mengangkat obrolan
ini, bukan tanggal di kalender. **Tidak ada satu pun rilis Phase 2 yang menunggu jawabannya.**

---

## Urutan & pemisahan commit

Task 8 → **8B-1** → 8C → 9 → 10 → 11 → 12, masing-masing rilis sendiri
(expand-and-contract). **Task 8B-2 keluar dari urutan ini** — ia prasyarat Phase 4, bukan
bagian Phase 2. Jangan menumpang branch revamp visual yang sedang berjalan — bercabang dari
`main`, seperti pola Phase 0/1 (`feat/jadwal-iklan`).

Task 9 (frontend tersulit) dan Task 8B-1 (kontrak API paling berisiko) masing-masing layak
sesi kerja sendiri dengan QA terpisah, jangan digabung task lain di commit yang sama.

Urutan commit di dalam Task 8B-1:

| # | Pesan | File |
|---|---|---|
| 1 | `docs(jadwal-iklan): pecah Task 8B, reward_pools jadi prasyarat Phase 4, roadmap Phase 4/5` | file ini |
| 2 | `feat(sql): 44 — get_batch_rewards_bulk, satu implementasi agregasi batch` | `sql/44_batch_rewards_bulk.sql` |
| 3 | `fix(api): Mode 1 /api/respondents pakai RPC yang sama dengan Mode 2` | `functions/api/respondents.js` |
| 4 | `fix(extend): invoice top-up pakai winner count pool, bukan order induk` | `ExtendSection.tsx` |
| 5 | `feat(public): halaman survei & feed Jakpat baca agregat batch` | `SurveyPage.tsx`, `functions/api/surveys.js` |
| 6 | `docs(jadwal-iklan): 8B-1 selesai + hasil verifikasi produksi` | `docs/jadwal-iklan-progress.md` |

Commit 2 **diterapkan ke produksi** sebelum commit 3/5, karena keduanya memanggil fungsi
yang dibuatnya; dengan urutan ini tidak pernah ada jendela di mana kode memanggil fungsi
yang belum ada. Body commit 3 memuat tabel "Yang berubah di mata konsumen API" —
pergeseran 8 jam itu akan dipertanyakan orang lain, dan alasannya harus ada di riwayat git.

> **Koreksi 2026-08-04, sesudah commit 3 ditulis.** Body commit itu menutup dengan "utang
> yang belum lunas: cek log 30 hari… tidak nol berarti mereka harus dikabari". Utang itu
> **sudah lunas dan jawabannya tidak perlu mengabari** — lihat "Dampak ke API keluar".
> Riwayat git sengaja tidak ditulis ulang: pernyataan di commit itu bersyarat dan benar
> pada saat ditulis; yang berubah adalah salah satu syaratnya sudah terjawab.
