# Langkah 0 & 9 — dua hal yang harus dikerjakan manusia

Dua gerbang tersisa dari Rencana A (link pembayaran yang bisa dipanggil pulang).
Kode dan migrasinya sudah siap; `sql/85` bahkan sudah live di produksi. Yang
menahan deploy cuma dua berkas ini.

---

## Langkah 0 — buktikan Cancel Order benar-benar mematikan link

**Kenapa ini gerbang, bukan formalitas.** `invoices.doku_cancelled_at` masih
**nol baris seumur hidup sistem ini**. Seluruh strategi pencabutan (Langkah 3:
`killDokuLink` di empat titik de-otorisasi) bertumpu pada API yang belum pernah
sekali pun terbukti bekerja. Kalau ternyata ia tidak mematikan apa pun, kita
akan mengira link sudah dicabut padahal masih menagih — keadaan yang lebih
berbahaya daripada tahu ia hidup.

### Yang dibutuhkan

Kredensial **sandbox** DOKU. Ini akun TERPISAH dari produksi: Client-Id dan
Secret-Key-nya berbeda. `.env` di repo ini berisi kredensial **produksi**
(`VITE_DOKU_ENV=production`), jadi menukar `DOKU_ENV` saja tidak cukup — dan
menjalankan uji ini dengan kredensial produksi akan mematikan link pembayaran
peneliti sungguhan.

### Langkahnya

```bash
export DOKU_CLIENT_ID='BRN-xxxx-sandbox'
export DOKU_SECRET_KEY='SK-xxxx-sandbox'
export DOKU_PROBE_CONFIRM_SANDBOX=1

node scripts/doku-cancel-order-probe.mjs create
#   → cetak payment_url

#   ⚠️ BUKA payment_url DI BROWSER. Pastikan halamannya HIDUP.
#      Tanpa memastikan kondisi awal, "menolak" sesudahnya tidak
#      membuktikan apa pun.

node scripts/doku-cancel-order-probe.mjs cancel
#   → cetak jawaban mentah DOKU

#   ⚠️ BUKA LAGI URL YANG SAMA. Inilah ujiannya.

node scripts/doku-cancel-order-probe.mjs cancel
#   → sekali lagi, untuk melihat penolakan "sudah dibatalkan"
```

### Cara membaca hasilnya

| Yang terlihat di browser sesudah cancel | Artinya |
|---|---|
| Halaman **menolak** | ✅ Langkah 0 HIJAU. Rencana A boleh dideploy utuh. |
| Halaman **masih hidup** | ⛔ Langkah 0 MERAH — dan ini temuan besar, bukan kegagalan uji. Langkah 3 tidak punya dasar; link perantara (Langkah 4–8) jadi SATU-SATUNYA pertahanan. Deploy Langkah 4–8 saja, dan naikkan prioritas Langkah 2 (penjaga webhook), bukan turunkan. |

**⚠️ HTTP 200 bukan bukti.** Satu-satunya bukti adalah halaman DOKU yang menolak
di browser. Ini catatan yang sudah ditulis di plan sejak awal dan belum pernah
dikerjakan; jangan diselesaikan dengan membaca status code.

### Yang perlu dicatat, apa pun hasilnya

Tiga penolakan yang sudah diantisipasi `cancel-order.js` — salin **kode dan
kalimat persisnya** dari jawaban DOKU untuk masing-masing:

1. tagihan yang sudah **dibayar**
2. tagihan yang sudah **kedaluwarsa**
3. **kanal kartu** (tidak didukung DOKU)

Ketiganya harus mendarat ke admin sebagai kalimat yang bisa ditindaklanjuti,
bukan sebagai crash. Kalimat aslinya yang menentukan apakah terjemahan kita
sudah benar.

---

## Langkah 9 — satu pertanyaan ke DOKU

**Latar belakangnya.** Di dashboard DOKU, Pengaturan Kadaluarsa → Batas Waktu
saat ini **0 Jam 0 Menit** (belum disetel). Sementara itu sistem kami selalu
mengirim `payment.payment_due_date` sendiri di setiap request, dihitung dari
jadwal tayang yang dibiayai tagihan itu.

Yang tidak kami ketahui: kalau nilai dashboard disetel, ia **melengkapi** atau
**menimpa** nilai yang kami kirim? Jawabannya menentukan tindakan yang
berlawanan, jadi ini tidak boleh ditebak.

### Draf pesan

> Selamat siang, Tim DOKU.
>
> Kami ingin memastikan satu hal soal Pengaturan Kadaluarsa (Expiry Settings) di
> dashboard merchant, untuk produk Checkout.
>
> Saat ini setiap request `POST /checkout/v1/payment` dari sistem kami selalu
> menyertakan `payment.payment_due_date` dengan nilai yang kami hitung sendiri
> per transaksi (berbeda-beda, mengikuti jadwal layanan yang dibayar).
>
> Pertanyaannya: **nilai "Batas Waktu" di Pengaturan Kadaluarsa dashboard itu
> berlaku sebagai DEFAULT untuk request yang tidak mengirim
> `payment.payment_due_date`, atau ia MENIMPA nilai yang kami kirim lewat API?**
>
> Kami menanyakannya karena kedua kemungkinan itu menuntut tindakan yang
> berlawanan: kalau ia hanya default, kami ingin menyetelnya sebagai jaring
> pengaman; kalau ia menimpa nilai API, menyetelnya justru akan merusak aturan
> kedaluwarsa per-transaksi yang sudah kami bangun.
>
> Dua pertanyaan susulan yang berkaitan:
>
> 1. Fitur **Recover Abandoned Cart** — benarkah ia memberi pelanggan akses ke
>    halaman pembayaran yang sudah kedaluwarsa (sampai 3 kali)? Kalau ya, apakah
>    ia bisa mengabaikan `payment_due_date` yang kami kirim?
> 2. **Cancel Order** (`POST /checkout/v3/cancellations`) — sesudah berhasil,
>    apakah halaman pembayarannya langsung menolak pembayaran baru, atau ada
>    jeda propagasi? Dan kanal pembayaran apa saja yang TIDAK bisa dibatalkan
>    lewat endpoint ini?
>
> Terima kasih banyak.

### Cara menindaklanjuti jawabannya

| Jawaban DOKU | Tindakan |
|---|---|
| Hanya **default** | Setel dashboard ke **7 hari (10.080 menit)** = `MAX_INVOICE_MINUTES`. Jaring pengaman untuk endpoint masa depan yang lupa mengirim field-nya. |
| **Menimpa** nilai API | **Jangan disentuh.** Menyetelnya akan mematahkan aturan cutoff 14.00 WIB. Biarkan 0 Jam 0 Menit. |

**⚠️ Terlepas dari jawabannya: jangan menyalakan Recover Abandoned Cart.** Fitur
itu (sekarang mati) memberi pelanggan akses ke halaman yang sudah kedaluwarsa —
ia membatalkan aturan cutoff yang baru saja dibangun.
