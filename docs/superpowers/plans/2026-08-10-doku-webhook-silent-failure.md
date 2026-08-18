# Webhook DOKU: hentikan kegagalan tulis yang tak terlihat

> ✅ **Kode selesai & terverifikasi lokal 2026-08-10 — BELUM di-deploy, `sql/54` BELUM diterapkan ke prod.**
> Urutan wajib: **terapkan `sql/54` dulu, baru deploy kodenya.** `webhook.js` menulis ke
> `doku_webhook_events`; kalau tabelnya belum ada, pencatatan gagal (ditelan, tidak
> menjatuhkan webhook) dan kita kehilangan pembatas retry serta banner admin.
> Jalur uang — perlakukan seperti rilis Task 11/13, jangan diselipkan diam-diam.

## Masalahnya

**2026-08-10**, invoice `JFU-INV-d7a41f-1786333513279` (Nur Fitriana / UMRI, Rp 499.500, VA BSI)
dibayar pukul 13.26 WIB. DOKU mencatat notifikasi **TERKIRIM & SUKSES** pukul 14.03 WIB, tapi
`invoices`, `transactions`, dan `form_submissions` tidak berubah sama sekali. Order tersangkut
"Menunggu channel" sampai ditemukan manual dan direkonsiliasi tangan lewat SQL.

Sudah dicoret dengan bukti (live-tail Cloudflare + resend dari dashboard DOKU): bukan masalah
deploy (kode prod identik dengan lokal), bukan secret, bukan bentuk payload channel BSI, bukan CPU
limit (`cpuTime: 7ms`, `outcome: ok`).

**Penyebab sebenarnya, dan lebih luas dari dugaan awal.** Semua tulis ke database di
`functions/api/doku/webhook.js` lewat `fetch` mentah ke PostgREST, dan **tidak satu pun memeriksa
`res.ok`**:

| Lokasi lama | Masalah |
|---|---|
| STEP 1, PATCH `transactions` | respons di-`json()` tanpa cek status; kalau PostgREST balas objek error, `.length` jadi `undefined` → dianggap "tidak ada transaksi" → diam-diam lanjut ke jalur invoice |
| STEP 2, PATCH `invoices` | responsnya cuma di-`console.log`; array kosong (0 baris cocok) tampak sama seperti sukses |
| STEP 5, PATCH `form_submissions` / `_extend` | responsnya **tidak dibaca sama sekali** — 401/409/500 lewat tanpa jejak |
| Kunci Supabase | `SERVICE_ROLE_KEY \|\| VITE_ANON_KEY \|\| ANON_KEY` — kalau service key hilang, semua tulis gagal RLS diam-diam sambil tetap balas 200 |

`fetch` tidak melempar error pada HTTP 4xx/5xx, jadi blok `catch (dbError)` **hampir tidak pernah
kena**. Webhook bisa "berhasil" tanpa menulis apa pun lalu balas `{success:true}` + HTTP 200 — DOKU
melihat 200, tidak pernah retry, pembayaran hilang permanen.

**Tidak ada jaring pengaman platform.** Cloudflare Workers Logs **dan** Logpush keduanya tidak
tersedia untuk project Pages (dikonfirmasi 2026-08-10: `pages/projects/jakpatforuniv-submit` tidak
punya field `observability`; tabel perbandingan resmi `migrate-from-pages` menandai keduanya ❌ untuk
Pages). **Bukan soal izin akun — memang tidak ada tombolnya.** Rekomendasi awal "aktifkan
Observability" karena itu gugur, diganti logging aplikasi ke Supabase.

## Yang dibangun

### 1. `multi-step-form/sql/54_doku_webhook_events.sql` — jejak permanen

Satu baris per notifikasi DOKU yang lolos autentikasi: `invoice_number`, `doku_status`,
`app_status`, `payment_channel`, `amount`, `outcome`, `http_status`, `error_message`,
`raw_payload jsonb`, `resolved_at`, `resolved_by`. Tiga index; RLS admin-only baca + resolve,
`service_role` menulis, `anon` dicabut eksplisit (`raw_payload` memuat PII pembeli).
Sengaja **tanpa foreign key** — baris yatim justru yang paling wajib bisa mendarat.

**Nomor `54`, bukan `50`.** `50`–`53` sudah diklaim rencana yang disetujui tapi belum ditulis
(`reward_pools`=50, Task 11=51-52, Task 13=53). Mengambil `50` berarti menggeser tiga rencana untuk
keempat kalinya; `54` tidak menyentuh apa pun, dan migrasi-migrasi itu saling independen.

**Kenapa tabel baru, bukan kolom di `invoices`/`transactions`** — ditimbang dan ditolak:

1. **Wadahnya justru bagian yang sedang rusak.** Yang dicatat adalah "PATCH ke
   `invoices`/`transactions` gagal". Menulis penandanya ke baris yang sama lewat jalur yang sama akan
   gagal karena sebab yang sama. Di insiden 10 Agustus ketiga baris itu memang tidak tersentuh.
2. **`no_submission_found` tidak punya baris untuk ditulisi** — padahal itu kasus terburuk (uang
   diterima untuk sesuatu yang tak bisa dicocokkan). Terukur ada **17 invoice tanpa baris
   `transactions`** (jalur invoice manual admin), jadi pencarian dua-tahap memang bisa meleset.
3. Kolom-per-invoice bersifat *last-write-wins* → riwayat percobaan hilang.
4. `raw_payload` (~2KB) membebani tabel yang dibaca tiap kali dashboard dibuka, dan menambah kolom
   yang harus diperhitungkan trigger `guard_payment_columns()` (`sql/33`).

Tabel lain sudah dicek: `payments` (0 baris) milik domain bayaran kreator sisi mission,
`doku_payouts` untuk pencairan bukan penerimaan. Volume ~92 transaksi/bulan.

### 2. `functions/api/doku/webhook.js` — dikeraskan

- **`sbFetch(url, init, label)`** membungkus semua panggilan PostgREST; melempar error berisi label +
  HTTP status + potongan body kalau `!res.ok`. Ini yang akhirnya membuat blok `catch` berfungsi.
- **`sbPatchExpectingRows()`** untuk PATCH yang wajib mengubah baris (`invoices`, `form_submissions`,
  `form_submissions_extend`) — array kosong = 0 baris cocok = error. PATCH `transactions` sengaja
  tetap toleran terhadap 0 baris: itu Skenario B yang sah.
- **`resolveSupabase()` fail-closed** — ketiadaan `SUPABASE_SERVICE_ROLE_KEY` jadi error, bukan turun
  diam-diam ke anon key.
- Fase tulis dipisah jadi **`processPaymentUpdate()`** (STEP 0–5, logikanya tidak berubah) supaya
  orkestrasi outcome terbaca.
- Semua nomor invoice di URL kini lewat `encodeURIComponent` (dulu hanya STEP 0).
- Efek sekunder (banner `survey_pages`, `voucher_redemptions`) tetap menelan errornya sendiri —
  disengaja, supaya kegagalannya tidak membuat pembayaran yang sudah tercatat lunas ikut di-retry.

**Taksonomi outcome:**

| outcome | Kapan | Balas | Alert |
|---|---|---|---|
| `ok` | semua tulis terverifikasi | 200 | — |
| `write_failed` | ada tulis gagal / 0 baris berubah | **500** (retry) → 200 setelah 5 kegagalan | ya, hanya percobaan pertama |
| `amount_mismatch` | STEP 0 menolak | 200 | ya |
| `no_submission_found` | invoice tak dikenal | 200 — retry tidak menolong | ya |
| `forwarded_jm` | invoice `JM-*` diteruskan | 200 | — |
| `payout` | notifikasi payout | 200 | — |

Pembatas retry menghitung `write_failed` yang belum diselesaikan untuk invoice itu. Kalau query
hitungnya sendiri gagal (Supabase mati total) → anggap 0 → tetap minta retry.

### 3. `functions/api/doku/_webhook-alert.js` — email admin

Resend, pola sama dengan `send-invoice-ready-email.js`; penerima dari `ADMIN_EMAILS`. Isi email
memuat nomor invoice, outcome, pesan error, dan langkah pemulihan spesifik per outcome.

**Sengaja tidak menyentuh Supabase sama sekali** — kegagalan yang dilaporkannya sering kali adalah
"Supabase tidak bisa ditulis", jadi pemberitahuan yang ikut bergantung padanya akan mati persis saat
paling dibutuhkan. Ini satu-satunya lapisan yang bertahan di skenario terburuk.

### 4. `src/components/transactions/WebhookFailuresBanner.tsx` — panel admin

Banner merah di atas halaman **Keuangan** (`TransactionsPage`), di luar tab supaya uang yang
tersangkut terlihat dari mana pun. Query langsung ke Supabase dengan sesi admin (pola sama dengan
`TransactionsPage.tsx:44-45`), dijaga policy RLS — tidak perlu endpoint baru. Bisa dibuka jadi daftar
berisi invoice, waktu, outcome, pesan error, saran tindakan, dan tombol **Tandai selesai**.
Merender `null` kalau tidak ada masalah, dan diam saja kalau `sql/54` belum diterapkan.

## Verifikasi yang sudah dijalankan

`npm run typecheck` — nol error di keempat file yang disentuh (63 error lain sudah ada sebelumnya, di
`google-*`, `workers/`, dll). `npx eslint` keempat file — bersih. `npm run build` — sukses.

**Fault-injection lokal** lewat `wrangler pages dev` + mock PostgREST yang perilakunya disetel, dan
payload Jokul bertanda tangan HMAC sah:

| # | Skenario | Harapan | Hasil |
|---|---|---|---|
| 1 | Supabase balas 500 | HTTP 500, `write_failed`, log menyebut panggilan yang gagal | ✅ `STEP 0 SELECT invoices.amount gagal — HTTP 500: {...}`, percobaan 1/5 |
| 2 | sudah 5× gagal | HTTP 200 (retry berhenti) | ✅ |
| 3 | semua SELECT balas `[]` | HTTP 200, `no_submission_found` | ✅ |
| 4 | jalur normal | HTTP 200, `ok`, STEP 1–5 jalan | ✅ `Found form_submission_id` → `Invoice PATCH berhasil` → `payment_status to paid` |

Sebelum perubahan ini, skenario 1–3 **semuanya** membalas `200 {"success":true}`.

## Sisa yang belum dikerjakan

1. **Terapkan `sql/54` ke prod** lewat SQL Editor, jalankan blok verifikasi di dalam filenya
   (termasuk uji `anon` tidak bisa membaca `raw_payload`). **Sebelum deploy.**
2. **Deploy**, lalu uji jalur audit + alert di produksi tanpa menyentuh uang sungguhan: POST webhook
   bertanda tangan sah dengan `invoice_number` yang tidak ada → harus 200, satu baris
   `no_submission_found`, satu email ke product@jakpat.net, banner muncul, tombol Tandai selesai
   menghilangkannya.
3. **Jalur bahagia uang sungguhan** — order berikutnya yang dibayar harus `outcome = 'ok'` dan tiga
   tabel sinkron.
4. **Retry DOKU sungguhan belum pernah kita amati.** Setelah balasan 500 pertama muncul di alam
   liar, cek `doku_webhook_events` untuk invoice itu. Kalau tidak ada percobaan kedua dalam ~1 jam,
   artinya DOKU tidak retry pada non-2xx; nilai perubahan status HTTP gugur dan pemulihan bersandar
   pada email + banner + tombol "Kirim Ulang Notifikasi". **Catat hasilnya apa pun jawabannya.**

## Risiko yang diterima sadar

- **Balasan 500 belum teruji terhadap DOKU** (poin 4 di atas). Paling buruk: kembali ke perilaku hari
  ini, tapi kini dengan baris audit dan email. Tidak ada regresi. Reversibel instan: jadikan
  `write_failed` membalas 200.
- **`raw_payload` memuat PII.** Perlindungannya setara `form_submissions`: RLS admin-only + grant
  `anon` dicabut. **Tanpa cron retensi — sengaja**, mengingat insiden `sql/48` (cron dijadwalkan
  sebelum endpointnya ada, 3 email hangus permanen). Pembersihan menyusul setelah pola datanya
  terlihat.
- **Cek `res.ok` bisa memunculkan kegagalan yang selama ini tersembunyi.** Kalau ada PATCH yang rutin
  balas non-2xx tanpa kita sadari, ia akan mulai memicu 500 + email. Itu memang tujuannya — tapi
  siapkan diri untuk gelombang alert pertama pasca-deploy dan **periksa isinya sebelum menyimpulkan
  ada yang rusak**.

## Bukan bagian dari rencana ini

- Migrasi `jakpatforuniv-submit` dari Pages ke Workers (menyentuh seluruh situs — proyek sendiri;
  itu satu-satunya jalan membuka Workers Logs & Logpush).
- Endpoint inquiry status ke DOKU untuk rekonsiliasi proaktif (belum ada di codebase).
- Cron pembersih retensi `doku_webhook_events`.
