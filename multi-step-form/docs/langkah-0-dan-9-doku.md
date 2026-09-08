# Langkah 0 & 9

Dua gerbang terakhir Rencana A (link pembayaran yang bisa dipanggil pulang).
Kode dan migrasinya sudah siap; `sql/85` bahkan sudah live di produksi.

| | Status |
|---|---|
| **Langkah 0** — buktikan Cancel Order mematikan link | ⛔ **Satu-satunya yang menahan deploy.** Butuh Anda: terbitkan tagihan uji, batalkan dari dashboard, buka link-nya di browser |
| **Langkah 9** — setelan kadaluarsa dashboard DOKU | ✅ **Diputuskan 2026-09-08: dibiarkan kosong selamanya.** Tidak jadi ditanyakan ke DOKU |

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

## Langkah 9 — DIPUTUSKAN, tidak jadi ditanyakan ke DOKU

**Keputusan pemilik produk (2026-09-08): "Batas Waktu" di Pengaturan Kadaluarsa
dashboard DOKU DIBIARKAN `0 Jam 0 Menit` — selamanya — supaya kedaluwarsa murni
diatur sistem ini.**

### Kenapa pertanyaannya jadi tidak perlu

Rencana semula menanyakan ke DOKU apakah nilai dashboard itu sekadar *default*
untuk request tanpa `payment.payment_due_date`, atau *menimpa* nilai API.
Jawabannya menentukan dua tindakan yang berlawanan.

Keputusan ini menutup keduanya sekaligus, dan itu yang membuatnya lebih tegas
daripada rencana semula: **membiarkannya kosong benar di KEDUA kemungkinan.**

| Kalau ternyata… | Membiarkan kosong berarti… |
|---|---|
| ia hanya **default** | tidak ada yang berubah — tidak ada satu pun request kami yang mengandalkannya |
| ia **menimpa** nilai API | kita tidak pernah merusak aturan cutoff 14.00 WIB |

Menyetelnya hanya berguna di satu dari dua kemungkinan; mengosongkannya aman di
dua-duanya. Tidak ada informasi dari DOKU yang bisa mengubah itu.

### ⚠️ Yang hilang, dan penggantinya

Nilai dashboard tadinya direncanakan jadi **jaring pengaman** untuk endpoint masa
depan yang lupa mengirim `payment.payment_due_date`. Dengan dashboard dikosongkan
selamanya, jaring itu tidak ada: endpoint baru yang lupa akan melahirkan link
yang umurnya ditentukan DOKU, bukan kami — membatalkan seluruh aturan cutoff
14.00 WIB **tanpa satu pun error**. Kegagalannya sunyi: link-nya terbit,
terlihat normal, dan baru terasa salah berminggu-minggu kemudian saat seseorang
membayar jadwal yang sudah lewat.

Jaringnya dipindahkan ke **`functions/api/doku/dueDate.spec.js`**. Ia memindai
seluruh berkas di `functions/api/doku/` dan menuntut: setiap berkas yang
memanggil `/checkout/v1/payment` WAJIB mengirim `payment_due_date` di dalam
objek `payment`-nya, dengan lantai default 60 menit yang sama. Daftar
penerbitnya dikunci, jadi menambah endpoint baru adalah tindakan **sadar** —
orang yang menambahkannya harus lewat berkas itu, dan karena itu membaca
alasannya.

Sengaja tes **sumber**, bukan tes unit: yang perlu dijaga bukan perilaku dua
endpoint yang sudah ada — itu sudah benar — melainkan endpoint yang **belum
ditulis**. Diverifikasi merah dengan menaruh endpoint pura-pura yang lupa
mengirim field-nya.

### Yang TETAP berlaku

⚠️ **Jangan menyalakan Recover Abandoned Cart.** Fitur itu (sekarang mati)
memberi pelanggan akses ke halaman pembayaran yang sudah kedaluwarsa sampai 3
kali — ia membatalkan aturan cutoff yang baru saja dibangun. Ini terpisah dari
setelan Batas Waktu dan tidak ikut diputuskan di atas.

### Kalau suatu saat tetap ingin bertanya

Dua hal yang masih belum kita ketahui dan tidak terjawab oleh keputusan ini —
keduanya soal perilaku, bukan setelan:

1. **Cancel Order** — sesudah berhasil, apakah halaman pembayarannya langsung
   menolak, atau ada jeda propagasi? Dan kanal apa saja yang tidak bisa
   dibatalkan? (Langkah 0 akan menjawab sebagian dari ini secara empiris.)
2. **Recover Abandoned Cart** — benarkah ia bisa mengabaikan `payment_due_date`
   yang kami kirim? Selama fiturnya mati, ini tidak mendesak.
