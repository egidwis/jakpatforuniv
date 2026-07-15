# Runbook Pasca-Patch Keamanan Pembayaran

> Konteks: commit `e9e9b8f` menambal insiden produksi (semua "pembayaran" ternyata
> baris simulasi palsu + halaman sukses statis hard-coded) dan 4 celah kritis
> (payout tanpa auth, webhook DOKU bisa dipalsukan, harga ditentukan browser,
> user bisa menandai dirinya lunas). Kode sudah di-merge; langkah-langkah di bawah
> adalah bagian **operasional** yang harus dijalankan manusia, **urut — jangan diacak**.

## 1. Deploy sekarang juga (Patch 0 aktif begitu live)

```
git push
cd multi-step-form
npm run deploy
```

Deploy ini **aman dilakukan sebelum env var baru di-set**: webhook masih mode
warn-only (tanpa `DOKU_WEBHOOK_SECRET` ia hanya mencatat warning, tidak menolak),
dan middleware admin memakai `VITE_SUPABASE_URL`/anon key yang sudah ada. Tiap jam
sebelum deploy, user baru masih bisa "membayar" palsu — jangan ditunda.

## 2. Smoke test produksi (±5 menit)

- Submit survey baru → harus **mendarat di halaman pembayaran DOKU sungguhan**,
  dan di DB muncul baris `transactions` dengan `payment_method='doku'`.
- Buka `/payment-success?id=<submission yang belum lunas>` → harus tampil
  **"Menunggu Pembayaran" + badge PENDING**, bukan "Berhasil". Ini bukti file
  statis palsu sudah tidak melayani route itu.
- `curl -X POST https://submit.jakpatforuniv.com/api/doku/sac/payout -d '{}'`
  → harus **401**. (Sebelum patch: endpoint ini memproses payout siapa pun.)
- Login sebagai `product@jakpat.net` → `/internal-dash` → Transactions → Wallet:
  saldo & riwayat harus tetap tampil (bukti header `Authorization` terkirim dan
  lolos gerbang admin).

## 3. Env var Cloudflare Pages

Settings → Environment variables, scope **Production**:

| Nama | Isi |
|---|---|
| `DOKU_WEBHOOK_SECRET` | string acak — generate: `openssl rand -hex 32` |
| `WEBHOOK_ENFORCE_SECRET` | `true` sejak 2026-07-15 (mulai `false`, flip di langkah 4) |
| `ADMIN_EMAILS` | `product@jakpat.net` (opsional, ada fallback di kode) |

Penting: env var Pages hanya berlaku untuk **deployment berikutnya** — setelah
menambah, deploy ulang sekali.

## 4. Dashboard DOKU — rollout secret 2 tahap

> **STATUS (2026-07-15):** ✅ **ENFORCED** (`WEBHOOK_ENFORCE_SECRET = "true"`).
> Warn-only ditahan beberapa jam untuk mengumpulkan bukti; setelah log DOKU bersih
> dari `[webhook] MISSING SECRET` di semua notifikasi yang dipakai, flip dilakukan.
> Bukti sebelum flip: notifikasi **Checkout/Jokul** (QRIS success) membawa `?k=`
> valid & diproses 200; tidak ada `[webhook] MISSING SECRET`. Sejak titik ini
> webhook tanpa secret valid ditolak 401 di baris pertama handler. **Reversibel
> instan**: kalau ada notifikasi sah tembus 401, balik `wrangler.toml` ke `"false"`
> + `npm run deploy`.

1. Ubah Notification URL menjadi
   `https://submit.jakpatforuniv.com/api/doku/webhook?k=<secret dari langkah 3>`.
2. Sambil di dashboard DOKU, **cek juga** apakah ada konfigurasi redirect/email
   lama yang menunjuk `/payment-failed` atau `/success` — dua route itu sudah
   dihapus; kalau ada, arahkan ke `/payment-success?id=...` (React) atau halaman
   retry.
3. Pantau log Functions (Cloudflare dashboard → Pages → jakpatforuniv-submit →
   Functions logs, atau `npx wrangler pages deployment tail`). Tunggu sampai
   **tidak ada lagi** baris `[webhook] MISSING SECRET` pada notifikasi DOKU asli
   — artinya semua notifikasi sudah membawa `?k=`.
3a. **PENTING — cek `?k=` di SEMUA field Notification URL, bukan cuma Checkout.**
   Gerbang `?k=` dicek paling atas (sebelum deteksi format), jadi berlaku untuk
   ketiga format yang diterima handler ini:
   - **Jokul** (Checkout: QRIS/VA/e-wallet) — validasi internal HMAC-SHA256 penuh.
   - **SNAP** (Sub-Account / SAC) — validasi X-PARTNER-ID = Client ID.
   - **SNAP B2B** (Payout / disbursement) — validasi X-CLIENT-KEY = Client ID.
   SNAP & SNAP B2B biasanya dikonfigurasi dari **field Notification URL yang
   terpisah** di dashboard DOKU. Kalau hanya field Checkout yang diberi `?k=`,
   maka setelah flip notifikasi SNAP/B2B akan ditolak 401 di gerbang atas dan
   status payout/VA gagal ter-update. Sebelum flip: pastikan tiap field yang
   menunjuk `/api/doku/webhook` sudah membawa `?k=`, **atau** konfirmasi bahwa
   metode SNAP/payout otomatis memang tidak dipakai produksi (endpoint `sac/*`
   adalah tools admin — kalau tidak aktif, notifikasi SNAP B2B tidak muncul).
   Tunggu sampai log menampilkan minimal satu contoh sukses (tanpa `MISSING
   SECRET`) dari **tiap metode yang benar-benar dipakai**, bukan cuma QRIS.
4. Baru set `WEBHOOK_ENFORCE_SECRET=true` + deploy ulang. Sejak titik ini webhook
   tanpa secret ditolak 401 di baris pertama handler, sebelum penyerang sempat
   memilih cabang format terlemah. Flip ini satu baris & reversibel instan —
   kalau ada notifikasi sah tembus 401, balik ke `"false"` + deploy.

**Jangan balik urutannya** — kalau enforcement dinyalakan sebelum Notification
URL diganti, pembayaran sah akan gagal tercatat.

## 5. Supabase SQL Editor — jalankan `sql/33_lock_payment_columns.sql`

File-nya lengkap dengan blok verifikasi dan rollback di bawah. Setelah dijalankan,
uji empat hal:

- **Harus GAGAL** (error dari trigger): dari console browser sebagai user biasa,
  `supabase.from('form_submissions').update({payment_status:'paid'}).eq('id','<id sendiri>')`.
  Juga menurunkan status / mengubah `total_cost` pada submission yang sudah `paid`.
- **Harus TETAP JALAN** sebagai user biasa: reschedule dari `/dashboard/status`,
  slot kedaluwarsa di halaman checkout (`payment_status` → `expired`), dan
  reschedule-edit lewat StepCheckout termasuk perubahan harga pada submission
  yang belum lunas.
- **Harus TETAP JALAN** sebagai admin: ubah status dari InternalDashboard.
- Kalau ada alur yang patah tak terduga: blok rollback (`DROP TRIGGER` /
  `DROP FUNCTION`) ada di bagian bawah file — sistem kembali seperti sebelum
  trigger dipasang tanpa efek samping lain.

## 6. Pemulihan korban insiden (paling penting secara bisnis)

Jalankan di Supabase SQL Editor:

```sql
select t.payment_id, t.created_at, t.amount, fs.id, fs.email, fs.full_name,
       fs.payment_status, fs.submission_status
from transactions t
join form_submissions fs on fs.id = t.form_submission_id
where t.payment_method = 'simulation'
order by t.created_at desc;
```

Setiap baris = user yang **mengira sudah bayar padahal belum**. Karena submission
mereka masih `pending`, kirimi mereka link
`https://submit.jakpatforuniv.com/dashboard/payment/<fs.id>` — sekarang link itu
membuat pembayaran DOKU sungguhan. Di `/internal-dash` baris-baris ini tampil chip
**merah "Simulasi — bukan pembayaran nyata"**, jadi mudah dilacak mana yang sudah
ditindaklanjuti. Setelah semua dihubungi, tandai/arsipkan baris `simulation` agar
laporan transaksi bersih.

## 7. Diagnostik channel pembayaran (santai, kapan sempat)

```sql
select status, payment_method, (payment_channel is null) as channel_kosong, count(*)
from transactions
group by 1,2,3 order by 4 desc;
```

Kalau ada `completed` + `doku` + `channel_kosong=true` yang dibuat *setelah*
migrasi `23_add_payment_channel.sql`, berarti ekstraksi channel dulu meleset —
rantai fallback baru + log payload utuh di webhook akan menangkap bentuk barunya
pada pembayaran sukses berikutnya. Uji sekalian satu pembayaran sandbox QRIS dan
pastikan chip di dashboard menampilkan "QRIS".

> **HASIL (2026-07-15):** ✅ Ekstraksi channel **sehat**. 104 baris
> `completed/doku/channel_kosong=true` semuanya historis (terakhir **2026-06-25**,
> sebelum ekstraksi andal). Sejak itu **tidak ada** baris kosong baru; baris
> `channel_kosong=false` berlanjut sampai hari ini (termasuk tes QRIS `QRIS_DOKU`
> 15 Jul 03:17). 104 baris lama itu murni **kosmetik** (chip slate "DOKU · channel
> tidak tercatat" di dashboard) — **tidak perlu aksi**; backfill opsional & tidak
> sepadan. Sisa baris = legacy Mayar / simulation (Langkah 6) / pending doku.

## Risiko sisa yang sengaja belum ditutup (pekerjaan lanjutan)

1. **`question_count` masih dari client** — ekstraksi Google Form terjadi di
   browser; user teknis bisa mengaku 10 pertanyaan padahal 60 dan kena tier
   murah. Menutupnya butuh ekstraksi ulang Google Form di server.
2. **Signature SNAP belum ditegakkan** — sekarang baru di-log (`X-Signature`
   dkk). Setelah beberapa notifikasi asli terkumpul di log, HMAC SNAP BI bisa
   diimplementasikan dari payload nyata, bukan tebakan spesifikasi.
3. **Formula harga terduplikasi** di `src/utils/cost-calculator.ts` (tampilan)
   dan `functions/api/doku/create-payment.js` (otoritatif) — tak terhindarkan
   karena Pages Functions dibundel standalone. Tiap ubah tier/voucher/Kilat,
   ubah **keduanya**; komentar pengingat ada di kedua file, dan warn
   `total_cost mismatch` di log Functions akan ketahuan kalau lupa.
