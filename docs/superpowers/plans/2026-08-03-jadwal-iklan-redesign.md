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

Ketentuan layanan: **user boleh memakai reward yang sama selama reward itu belum
didistribusikan.** Pemilik pool semestinya batch, tapi model sekarang menaruhnya di
jadwal pertama (`form_submissions.prize_per_winner`). Ini akar dari tiga masalah yang
sudah ditambal sendiri-sendiri di Phase 0.

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

**Agregasi batch ditulis dua kali dan keduanya harus ikut pindah:** `get_batch_rewards`
(SQL, dipanggil dari `functions/api/respondents.js:252`) dan reimplementasinya di
`respondents.js` sekitar baris 157-174 (`buildBatches()`). Kalau hanya satu yang dipindah,
halaman publik dan dashboard akan menampilkan angka berbeda untuk order yang sama.

- [ ] Buat tabel `reward_pools` + migrasi data dari `form_submissions.prize_per_winner`
      per `(submission_id, period_batch)`
- [ ] Tulis ulang `get_batch_rewards` untuk membaca dari `reward_pools`
- [ ] **Bekukan tanda tangan RPC `get_batch_rewards`** — nama dan daftar kolom kembalian
      tidak boleh berubah, hanya isinya
- [ ] Tulis ulang `buildBatches()` di `respondents.js` supaya sumbernya sama dengan RPC
- [ ] Hapus `fetchBatchContext`/`get_schedule_batch_context` dan pemanggilnya di
      `ExtendSection.tsx`
- [ ] Uji: jadwal baru di batch yang **sama** dan belum didistribusikan → invoice tidak
      memuat item insentif, total hadiah di halaman publik tidak berubah
- [ ] Uji: jadwal di batch **baru** → insentif ditagih
- [ ] Uji: bandingkan angka dari `get_batch_rewards` vs render `respondents.js` untuk
      order yang sama → harus identik
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
- [x] Tandai `survey_winners` sebagai arsip di skema (komentar) dan di UI modal (`sql/43`, commit `2128084`+`e00ccf3` — **migrasi ditulis, belum diterapkan ke DB**, lihat `docs/jadwal-iklan-progress.md` §2)

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
| ~~`sql/42_reward_pools.sql`~~ `sql/44_reward_pools.sql` | 8B | Tabel `reward_pools`, tulis ulang `get_batch_rewards`. Nomor dikoreksi 2026-08-04 — `42` sudah dipakai Kilat (`sql/42_kilat_slots.sql`, commit `c554880`) dan `43` sudah dipakai Task 8C (`sql/43_survey_winners_archive.sql`) |

### Dimodifikasi (menurut task)
| File | Task |
|---|---|
| `functions/api/respondents.js` | 8B, 11 |
| `functions/api/doku/webhook.js` | 10 |
| `src/components/ExtendSection.tsx` | 8B, 12 |
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
| `get_batch_rewards` berubah bentuk tanpa sengaja | Tinggi dampaknya (kontrak pihak ketiga) | Uji kontrak eksplisit: bandingkan kolom+tipe sebelum/sesudah Task 8B |
| Dua implementasi agregasi batch (SQL + JS) berbeda hasil | Sedang | Task 8B eksplisit memindah keduanya, uji banding angka |
| `deriveOrderUiState` regresi tampilan dashboard user | Sedang — ini bagian tersulit | Task 9 dikerjakan sendiri, QA manual sebelum lanjut task lain |
| Migrasi berhenti di tengah jalan | Rendah (by design) | Expand-and-contract: setiap task rilis sendiri, trigger dua arah menjaga kompatibilitas selama transisi |

---

## Verifikasi (per task, bukan di akhir)

- **Task 8:** bandingkan jumlah baris `ad_schedules` dengan `form_submissions`
  ber-`start_date` + `form_submissions_extend`; nol selisih. Ubah tanggal lewat alur
  lama → baris `ordinal = 1` ikut berubah.
- **Task 8B:** buat jadwal kedua yang berakhir di batch yang **sama** dan belum
  didistribusikan → invoice **tidak** memuat item insentif, total hadiah di halaman
  publik tidak berubah. Buat jadwal di batch **baru** → insentif ditagih. Bandingkan
  angka `get_batch_rewards` vs `respondents.js` untuk order yang sama → identik. Uji
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
  — Task 8B hanya boleh mengubah isi fungsinya (membaca `reward_pools`), tidak boleh
  mengubah kolom yang dikembalikan.
- Agregasi batch ditulis dua kali dan melayani pihak ketiga yang sama lewat dua mode
  berbeda: RPC SQL untuk Mode 2, `buildBatches()` JS untuk Mode 1. Kalau hanya satu yang
  dipindah, dua endpoint akan melaporkan angka berbeda untuk survei yang sama.
- **`can_select_winners` TIDAK berubah makna.** Definisinya tetap "batch ini sudah bisa
  diundi karena tidak punya jadwal lain yang aktif". Tapi field itu sinyal KESIAPAN,
  bukan IZIN — batch yang sudah diundi lalu dibuka kembali (jadwal baru ditambahkan)
  akan membuat field ini `true` lagi untuk batch yang sudah pernah diundi. Aman selama
  platform pengundian menyimpan sendiri catatan batch mana yang sudah diundi.
- Keputusan "batch tetap = bulan" melindungi kontrak ini: `period_batch` yang dikirim ke
  pihak ketiga tetap berformat `YYYY-MM`.

### Perlu dikonfirmasi ke platform pengundian (satu hal, murah)

**Apakah mereka menyimpan sendiri catatan batch mana yang sudah diundi?**
`can_select_winners` adalah sinyal kesiapan ("batch sudah tutup"), bukan izin ("belum
pernah diundi"). Selama mereka melakukan deduplikasi di sisinya, tidak ada yang perlu
diubah di sini. Ini satu-satunya item yang butuh koordinasi eksternal untuk Phase 2 —
sisanya (perubahan skema, penyatuan tabel) tidak terlihat dari luar selama bentuk JSON
dijaga.

---

## Urutan & pemisahan commit

Task 8 → 8B → 8C → 9 → 10 → 11 → 12, masing-masing rilis sendiri (expand-and-contract).
Jangan menumpang branch revamp visual yang sedang berjalan — bercabang dari `main`,
seperti pola Phase 0/1 (`feat/jadwal-iklan`).

Task 9 (frontend tersulit) dan Task 8B (kontrak API paling berisiko) masing-masing layak
sesi kerja sendiri dengan QA terpisah, jangan digabung task lain di commit yang sama.
