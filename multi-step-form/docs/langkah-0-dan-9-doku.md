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

**Ada dua cara. Pakai Cara A.**

---

### Cara A — lewat dashboard admin (disarankan)

Tombol **"Batalkan Tagihan"** di dashboard admin **sudah memanggil Cancel Order
hari ini**. Ia bukan kode baru: `cancelInvoice()` → `killDokuLink()` →
`/api/doku/cancel-order` sudah live sejak `sql/84`, dan terbukti jalan — 14
tagihan yang terbit dalam 24 jam terakhir sudah menyimpan `doku_request_id`.

Cara ini **lebih baik daripada naskah terpisah**, bukan cuma lebih mudah: ia
menguji jalur nyata sampai ujung — gerbang admin di `_middleware.js`, pencarian
`doku_request_id`, panggilan ke DOKU, DAN tulisan `doku_cancelled_at` ke
database. Naskah di Cara B hanya menguji API DOKU-nya sendiri.

#### ⚠️ Sebelum mulai: JANGAN membatalkan tagihan peneliti sungguhan

Saat ini ada **10 tagihan `pending` milik peneliti sungguhan** yang punya
`doku_request_id` — semuanya tampak "bisa dibatalkan" di layar. Membatalkan
salah satunya berarti mematikan link bayar orang yang sedang menunggu.

**Terbitkan tagihan uji Anda sendiri.** Nominal kecil (mis. Rp 10.000) pada
order uji, bukan order peneliti.

#### Langkahnya

1. **Terbitkan tagihan uji** dari dashboard admin pada order uji. Catat
   `payment_id`-nya (format `JFU-INV-…`).

2. **Buka link DOKU-nya di browser.** Pastikan halamannya **HIDUP**.
   Ini kondisi awal — tanpa memastikannya, "menolak" sesudahnya tidak
   membuktikan apa pun.

3. **Klik "Batalkan Tagihan"** pada tagihan itu, dan **baca toast-nya**.
   Toast-nya sudah dirancang menjawab pertanyaan Langkah 0 secara langsung:

   | Toast | Artinya |
   |---|---|
   | 🟢 *"Link bayarnya sudah **dinonaktifkan di DOKU**."* | DOKU mengonfirmasi. Lanjut ke langkah 4. |
   | 🟠 *"…tapi link DOKU-nya **MUNGKIN MASIH BISA DIBAYAR** (alasan)"* | DOKU menolak. **Salin alasannya persis** — itu datanya. |
   | 🟠 *"Tidak ada yang berubah…"* | Salah sasaran: tagihannya sudah dibayar/dibatalkan. Ulangi dengan tagihan uji yang baru. |

4. **Buka lagi URL yang sama di browser.** ⚠️ **Inilah ujiannya.** Toast hijau
   pun belum membuktikan apa-apa — yang membuktikan cuma halaman DOKU yang
   menolak.

5. **Pastikan di database** angka yang selama ini nol akhirnya terisi:

   ```sql
   select payment_id, status, doku_cancelled_at
     from invoices
    where doku_cancelled_at is not null
    order by doku_cancelled_at desc;
   ```

   Satu baris di sini = angka "0 baris seumur hidup" akhirnya patah.

6. **Klik "Batalkan Tagihan" sekali lagi** pada tagihan yang sama. Ini menguji
   penolakan "sudah dibatalkan": harus jadi toast oranye berisi alasan, bukan
   layar yang rusak.

#### Cara membaca hasilnya

| Yang terlihat di browser (langkah 4) | Artinya |
|---|---|
| Halaman **menolak** | ✅ Langkah 0 HIJAU. Rencana A boleh dideploy utuh. |
| Halaman **masih hidup**, walau toast hijau | ⛔ Langkah 0 MERAH — dan ini temuan besar, bukan kegagalan uji. DOKU membalas 200 tanpa benar-benar mematikan link. Langkah 3 tidak punya dasar; link perantara (Langkah 4–8) jadi SATU-SATUNYA pertahanan. Deploy Langkah 4–8 saja, dan **naikkan** prioritas Langkah 2 (penjaga webhook), bukan turunkan. |

#### Yang perlu dicatat, apa pun hasilnya

Tiga penolakan yang sudah diantisipasi `cancel-order.js`. Kalau salah satunya
muncul, salin **kalimat persisnya** dari toast:

1. tagihan yang sudah **dibayar**
2. tagihan yang sudah **kedaluwarsa**
3. **kanal kartu** (tidak didukung DOKU)

Kalimat aslinya yang menentukan apakah terjemahan kita ke admin sudah benar.

---

### Cara B — naskah terpisah, untuk sandbox

Pakai ini **hanya kalau** Anda tidak mau menyentuh DOKU produksi sama sekali,
atau ingin menangkap **badan jawaban mentah** DOKU untuk ketiga penolakan (Cara
A hanya memperlihatkan kalimat yang sudah diterjemahkan).

Butuh kredensial **sandbox** DOKU. Ini akun TERPISAH dari produksi: Client-Id
dan Secret-Key-nya berbeda. `.env` di repo ini berisi kredensial **produksi**
(`VITE_DOKU_ENV=production`), jadi menukar `DOKU_ENV` saja tidak cukup — dan
menjalankan uji ini dengan kredensial produksi akan mematikan link pembayaran
peneliti sungguhan. Naskahnya menolak jalan kalau mendeteksi itu.

```bash
export DOKU_CLIENT_ID='BRN-xxxx-sandbox'
export DOKU_SECRET_KEY='SK-xxxx-sandbox'
export DOKU_PROBE_CONFIRM_SANDBOX=1

node scripts/doku-cancel-order-probe.mjs create
#   → cetak payment_url. BUKA DI BROWSER, pastikan HIDUP.

node scripts/doku-cancel-order-probe.mjs cancel
#   → cetak jawaban mentah DOKU. BUKA LAGI URL YANG SAMA.

node scripts/doku-cancel-order-probe.mjs cancel
#   → sekali lagi, untuk melihat penolakan "sudah dibatalkan"
```

⚠️ Cara B **tidak** menguji gerbang admin, pencarian `doku_request_id`, maupun
tulisan `doku_cancelled_at`. Ia hanya menjawab "apakah API DOKU-nya sendiri
bekerja". Kalau Cara A sudah hijau, Cara B tidak perlu dijalankan.

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
