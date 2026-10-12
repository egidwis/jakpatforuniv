# Periode undian ganda di `/api/respondents` — laporan ke tim undian + filter `?period_batch=`

> **Status: ⬜ DITUNDA SADAR (2026-10-07).** Dijalankan setelah Phase 5 (Kilat) selesai
> atau hampir selesai, karena Kilat juga menyentuh pemilihan pemenang undian (lihat
> §"Titik singgung dengan Phase 5"). Semua angka di bawah diukur 2026-10-07 di produksi
> (SELECT saja). **Ukur ulang sebelum eksekusi.** Lihat §"Sebelum eksekusi".

## Latar belakang

Dashboard pemilihan undian adalah platform pihak ketiga yang membaca `/api/respondents`.
Sejak 2026-05-05 undian diserahkan ke sana (redesign Task 8C). Dashboard itu menampilkan
"Riset Psikologi Ideologi" (page `b9810e37-19c5-481b-8ba8-129e34a92a23`, order
`a87b687a-939a-442c-ac46-5020fee11c75`) sebagai **satu baris `2026-09`**. Padahal iklannya
diperpanjang ke Oktober.

### Diagnosis: sistem kita benar, konsumen melebur batch

| Lapis | Temuan |
|---|---|
| DB | Jadwal #1 (26–28 Sep) = `2026-09`. Jadwal #2, #4, #5 (1–9 Okt, lunas) = `2026-10`. Jadwal #3 batal. |
| RPC | `get_batch_rewards_bulk` / `get_batch_rewards` mengembalikan 2 batch: `2026-09` (5×100rb, closed) dan `2026-10` (5×100rb, active s/d 9 Okt 15.00 WIB) |
| Kode | `respondents.js` meneruskan semua batch apa adanya. Berkasnya identik dengan `origin/main` (terakhir diubah 18 Sep). |
| Konsumen | Menampilkan **10** pemenang (=5+5). Baris Coretax (5) menampilkan **4** (=2+2). Angka itu tidak ada di field mana pun yang kita kirim, jadi batch Oktober **sampai** ke mereka lalu dijumlahkan ke baris batch pertama. |
| Waktu | Batch Oktober sudah ada di API sejak 28 Sep 12.19 WIB (jadwal #2 lunas). Data mereka (2008 responden) paling cepat diambil 7 Okt 08.33 WIB. |

Angka responden mereka juga berbeda dari total kita: Culinary tampil 420, padahal kita
punya 429 total dan 426 di dalam jendela. Artinya mereka punya penyaringan sendiri.

### Risiko nyata: pool undian tercampur

Baris `2026-09` mereka memuat 2008 responden, padahal pool September hanya **1000**.
Mode 2 mengirim **semua** responden halaman tanpa penanda periode. Rencana awal extend
([`multi-step-form/docs/EXTEND_IMPLEMENTATION_PLAN.md`](../../../multi-step-form/docs/EXTEND_IMPLEMENTATION_PLAN.md)
§10.1 dan §10.3) menjanjikan dua hal yang **tidak pernah dibangun**:
- kolom `page_respondents.period_batch`; kolom itu tidak ada di produksi
- filter `?period_batch=`

Jadi sebagian gesekan memang dari sisi kita.

Ada 5 survei dengan dua periode (pool per periode memakai aturan pembagian di bawah):

| slug | periode → pool (pemenang) |
|---|---|
| riset-psikologi-ideologi | 09 → 1000 (5) · 10 → 1045+ (5, aktif) |
| survei-kepatuhan-pajak-berbasis-coretax-model-4 | 09 → 171 (2) · 10 → 0 (2, mulai 7 Okt) |
| atribut-persona-pemengaruh-virtual | 07 → 594 (2) · 09 → 590 (2) |
| sosial-dan-kebahagiaan | 05 → 343 (5) · 09 → 848 (5) |
| survei-persepsi-esg-terpilah-dan-kepatuhan-pascatambang | 08 → 85 (2) · 09 → 19 (2) |

Skala: 166.793 baris `page_respondents` di 427 halaman.

## Keputusan

Opsi yang dipilih: **Laporan + filter**.
- Tampilan "satu baris per periode" **hanya bisa diperbaiki konsumen**.
- Kita menambahkan filter opsional `?period_batch=YYYY-MM` di Mode 2, supaya pool tiap
  periode bisa diambil bersih.
- Kita juga menyiapkan laporan siap kirim untuk tim dashboard undian.

Dua opsi yang ditolak:
- **Laporan saja**: konsumen dibiarkan memotong responden sendiri.
- **Tambah field jumlah responden per batch di Mode 1**: mengubah daftar field yang
  dibekukan, butuh persetujuan konsumen, dan butuh RPC SQL baru.

## Batasan

- **Kontrak API beku.** Lihat
  [`2026-08-03-jadwal-iklan-redesign.md`](2026-08-03-jadwal-iklan-redesign.md) §Global
  Constraints. Nama, tipe, dan daftar field yang sudah ada tidak boleh berubah, dan tidak
  ada field baru. Yang boleh berubah hanya nilai dan perilaku.
- Tanpa param, respons harus **identik** dengan sekarang.
- Mode 1 tidak berubah. Param `period_batch` diabaikan di Mode 1, sama seperti sekarang.
- Tanpa SQL, tanpa migrasi.
- Tidak ada PII (`jakpat_id`, `e_wallet_number`) di tes, log, maupun laporan.

## Perubahan

### 1. Helper baru `multi-step-form/functions/api/_respondentPeriods.js`

Prefiks `_` membuatnya tidak dirutekan Pages, mengikuti preseden `_formParsers.js` dan
`_mail.js`. Isinya:

- `PERIOD_BATCH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/`
- `assignPeriodBatch(submittedAt, batches)` dengan aturan **batch TERAKHIR yang
  `period.start` ≤ `submitted_at`**:
  - Batch diurutkan dari salinan; input tidak dimutasi.
  - `start` null diperlakukan sebagai yang paling awal.
  - Responden sebelum jendela pertama masuk ke batch pertama.
  - Kirim telat di sela dua jendela masuk ke batch yang baru tutup. Terukur 2026-10-07:
    dari 9 kasus di 5 survei, 7 mulai mengisi di dalam jendela itu.
  - Sengaja memakai `submitted_at`, satu-satunya waktu yang dikirim API, supaya konsumen
    bisa mereproduksi pembagiannya sendiri.
- `respondentsInPeriod(respondents, batches, periodBatch)` mengembalikan subset dengan
  urutan tetap.
- Komentar menjelaskan kenapa periode diturunkan saat dibaca: kolom §10.1 tidak pernah ada.

### 2. `multi-step-form/functions/api/respondents.js` — Mode 2 saja

- **Membaca param.** `const periodBatch = url.searchParams.get('period_batch');` di
  bagian 2, di sebelah `pageId`/`slug`. Peringatan soal `const url` (insiden 18 Sep)
  tidak disentuh.
- **Validasi format.** Di awal Mode 2, sebelum kueri: format salah menghasilkan **400**
  `Invalid period_batch. Expected YYYY-MM.`
- **RPC `get_batch_rewards` gagal saat param diisi** menghasilkan **502** dengan pesan
  jelas. Tidak boleh 200 dengan 0 responden, karena itu gagal sunyi yang terbaca seperti
  "pool kosong". Tanpa param, perilaku lama (`batches: []`) tetap.
- **Saat param diisi:**
  - `batches` hanya berisi batch periode itu (array 0..1).
  - `respondents` = `respondentsInPeriod(...)`.
  - `total_respondents` = jumlah hasil filter.
  - Periode valid tapi tidak ada akan menghasilkan 200 dengan `batches: []`,
    `respondents: []`, `total_respondents: 0` (semantik filter).
- Bentuk objek respons tidak berubah sama sekali.
- Header komentar endpoint ("Two modes") ditambah satu baris tentang `period_batch`.

### 3. Tes

**`functions/api/_respondentPeriods.spec.js`** (fungsi murni). Kasusnya:
- di dalam jendela
- telat di sela jendela, masuk ke batch sebelumnya
- sebelum jendela pertama
- satu batch
- `start` null
- input tak berurutan dan tidak dimutasi
- regex menerima `2026-09` dan menolak `2026-9`, `2026-13`, `''`
- fixture Riset Psikologi: Sep 27, Sep 29 (sela), Oct 2 menghasilkan 09:2, 10:1

**`functions/api/respondentsPeriodFilter.spec.ts`** (handler sungguhan; tes baca-teks
saja tidak cukup, lihat insiden Phase 5 18 Sep):
- `vi.mock('@supabase/supabase-js')` memakai klien palsu yang chainable dan thenable
  untuk `from().select().eq().or().eq().single()`, `from().select().eq().order().range()`,
  dan `rpc()`.
- Memakai `vi.resetModules()` dan dynamic import seperti `respondentsGate.spec.ts`.
- Kasus yang diuji:
  - tanpa param: semua responden, 2 batch
  - `2026-09` → hanya Sep + sela, `batches` = [09]
  - `2026-10`
  - `2026-9` → 400
  - `2027-01` → 200 kosong
  - RPC error + param → 5xx
  - RPC error tanpa param → tetap 200 dengan `batches: []`
  - `Object.keys` respons dan respondent identik dengan dan tanpa param (kunci kontrak)
  - Mode 1 dengan param = Mode 1 tanpa param

`respondentsGate.spec.ts` yang ada harus tetap hijau.

### 4. Dokumentasi

Di [`EXTEND_IMPLEMENTATION_PLAN.md`](../../../multi-step-form/docs/EXTEND_IMPLEMENTATION_PLAN.md)
§10.1 dan §10.3, tambahkan catatan status:
- kolom `period_batch` tidak pernah dibuat
- filter diturunkan dari jendela batch
- bentuk respons nyata (`survey`/`batches`/`total_respondents`/`respondents`)
- filter hanya berlaku di Mode 2

### 5. Laporan untuk tim dashboard undian

Teks siap kirim dalam bahasa Indonesia. Tanpa PII dan tanpa nama peneliti. Isinya:
- **Masalah:** `batches[]` bisa berisi lebih dari satu periode, tapi dashboard
  menampilkan periode batch pertama dan menjumlahkan `winner_count`. Disertai contoh JSON
  Mode 1 Riset Psikologi vs tampilan mereka.
- **Yang diharapkan:**
  - satu baris per `(page_id, period_batch)`
  - hadiah dan pemenang diambil per batch, jangan dijumlah
  - pool diambil lewat `GET /api/respondents?slug=…&period_batch=YYYY-MM`, atau dibagi
    sendiri dengan aturan `submitted_at` yang sama
- **Tabel survei berperiode ganda** (diukur ulang saat eksekusi). Minta mereka memastikan
  pool periode yang lebih awal tidak terlewat dan undian antar periode tidak tercampur.
- **Catatan `can_select_winners`:** ini sinyal kesiapan, bukan izin, jadi mereka perlu
  menyimpan sendiri catatan batch yang sudah diundi. Item ini ditandai "sampaikan nanti"
  di redesign §"Perlu dikomunikasikan", dan pemicunya sudah tiba.

> ⚠️ Bagian laporan **tidak bergantung pada kode**. Kalau undian satu periode mendesak
> (undian berjalan sekitar minggu pertama bulan berikutnya, lihat `sql/108`), laporan
> boleh dikirim lebih dulu dengan workaround "bagi sendiri berdasarkan `submitted_at`".

## Titik singgung dengan Phase 5 (Kilat)

Diukur 2026-10-07: ada **17 halaman Kilat**, semuanya dengan **satu** batch. Tetapi
**40 dari 40** respondennya masuk **setelah** jendela batch tutup. Sebabnya,
`publish_end_date` Kilat sengaja `NULL` (sql/95), sementara jendela undian diturunkan dari
`form_submissions.end_date`.

Dengan aturan "batch terakhir yang sudah mulai", mereka tetap jatuh ke batch satu-satunya.
Tetapi begitu Kilat bisa punya lebih dari satu jadwal atau periode, aturannya perlu
dipastikan ulang. Pertanyaan yang harus dijawab Phase 5 sebelum rencana ini dieksekusi:

1. Apakah jendela batch Kilat tetap 15.00 WIB (`airing_instant_of_date`), atau mengikuti
   slot 08/11/14/17 WIB?
2. Responden Kilat yang datang setelah batch `closed`: masuk undian periode itu, periode
   berikutnya, atau tidak diundi?
3. Apakah Phase 5 mengubah `get_batch_rewards_bulk`, bentuk `batches`, atau aturan
   `can_select_winners`? Kalau ya, helper §1 harus mengikuti definisi baru itu.

## Sebelum eksekusi

- **Ukur ulang** tabel survei berperiode ganda dan pool per periode. Kueri acuannya ada
  di sesi 2026-10-07: `get_batch_rewards` per halaman, digabung dengan `page_respondents`
  memakai aturan di §1.
- **Cek `respondents.js` dan `get_batch_rewards_bulk`** (`pg_get_functiondef`) masih
  sama dengan yang dibaca di sini.
- Jawab pertanyaan §"Titik singgung dengan Phase 5".

## Eksekusi & deploy

1. Branch `fix/respondents-period-batch` dari `main`.
2. Tes dulu (TDD), lalu helper, lalu `respondents.js`. Jalankan
   `npx vitest run functions/api`.
3. `node --check functions/api/respondents.js functions/api/_respondentPeriods.js`.
4. Perbarui graph:
   `/Users/jakpat/.local/share/uv/tools/graphifyy/bin/python3 -m graphify update .`
   (tanpa `--force`).
5. Commit hanya berkas fitur ini.
6. **Deploy setelah konfirmasi:** merge ke `main`, lalu `git pull`, lalu push.
   Push ke main = deploy otomatis.

## Verifikasi

- **Lokal:** semua spec `functions/api` hijau, termasuk tes yang menjalankan handler
  sungguhan.
- **Produksi** (setelah deploy, dijalankan pemegang key; cetak angka saja, jangan pernah
  menampilkan responden):
  ```bash
  B=https://submit.jakpatforuniv.com/api/respondents
  H="X-API-Key: $JFU_RESPONDENT_API_KEY"
  curl -s -H "$H" "$B?slug=riset-psikologi-ideologi&period_batch=2026-09" | jq '{t:.total_respondents,b:[.batches[].period_batch]}'  # {t:1000,b:["2026-09"]}
  curl -s -H "$H" "$B?slug=riset-psikologi-ideologi&period_batch=2026-10" | jq '{t:.total_respondents,b:[.batches[].period_batch]}'
  curl -s -H "$H" "$B?slug=riset-psikologi-ideologi" | jq '{t:.total_respondents,b:[.batches[].period_batch]}'                      # semua, 2 batch (tak berubah)
  curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B?slug=riset-psikologi-ideologi&period_batch=2026-9"                     # 400
  ```
- **Pembanding SQL:** kueri pool per periode dijalankan ulang. Hasilnya harus sama
  dengan angka API.

## Di luar cakupan (dicatat saja)

- **Jadwal kredit.** `get_batch_rewards_bulk` masih mensyaratkan `payment_status='paid'`,
  sementara `sql/102` menayangkan jadwal kredit (`air_on_credit_at`) sebelum lunas.
  Jadwal kredit di bulan baru tidak punya batch sampai dibayar. Pada 2026-10-07 **0 baris**
  terdampak; masih laten.
- **Jumlah responden per batch di Mode 1** butuh field baru, persetujuan konsumen, dan
  RPC SQL. Tidak dipilih.
