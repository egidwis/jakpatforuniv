# Rencana: Webinar JFU — Tiket, Rekaman & Materi (berfase)

## Context

JFU akan menggelar **seri webinar untuk mahasiswa** demi branding & komunitas. Rencananya:
- Tiket dibeli dari landing page lalu dibayar lewat DOKU (QRIS).
- Sesudah acara, **rekaman + materi** juga dijual ke mahasiswa yang tidak sempat ikut live.
- Pembeli wajib login. Materi, rekaman, dan riwayat pembelian ada di menu **Webinar** di
  dashboard peneliti.
- Uang webinar masuk ke jalur **Transaksi** yang sudah ada, dengan filter Iklan / Kilat /
  Webinar.
- Homepage diubah menjadi **"dua pintu"** (Iklan Survei | Webinar).

Acara pertama < 3 minggu lagi dan tiket harus bisa dibeli minggu ini (≤ 7 Nov). Karena itu
pekerjaan dipecah menjadi fase. Setiap fase punya gerbang uji sendiri supaya tidak ada detail
yang terlewat.

## Keputusan pemilik produk (2 Nov)
- **Tujuan & format:** branding & komunitas; seri rutin; admin membuat acara sendiri tanpa
  developer.
- **Waktu:** acara pertama < 3 minggu lagi; tiket mulai dijual minggu ini.
- **Fasilitas live:** link Zoom/Meet, materi/slide, rekaman. Tanpa e-sertifikat (kehadiran
  tidak perlu dicatat).
- **Harga:** ≤ Rp 50 rb, selalu berbayar. **Harga yang diisi admin sudah termasuk PPN 11%**
  (dikonfirmasi tim keuangan, 2 Nov), jadi tidak ada tagihan tambahan.
- **Halaman fleksibel:** admin memilih halaman menjual tiket atau video kelas, dan menentukan kapan
  penjualan dibuka.
- **Cukup terbit sekali:** halaman yang terbit sebelum tanggal buka otomatis berstatus Segera hadir,
  lalu tombol beli terbuka sendiri pada tanggalnya, tanpa terbit ulang.
- **Bahas visual dulu:** sebelum membangun tampilan halaman, visual ASCII-nya dibahas bersama pemilik
  produk (lihat "Pembahasan visual ASCII").
- **Satu dashboard, satu cara masuk.** Wajib login sebelum beli, memakai cara masuk dashboard
  peneliti (Google atau email + password). Webinar menjadi menu di dalam dashboard itu.
- **Refund tidak ditawarkan secara tertulis.** Halaman, checkout, email, dan S&K webinar tidak menyebut
  refund sama sekali, termasuk kalimat "tanpa refund". Pembeli yang punya kendala diarahkan menghubungi
  admin, dan admin boleh memberi refund atas kebijakannya. Kata "refund" hanya ada di layar admin. Bila
  jadwal berubah, tiket tetap berlaku dan sudah termasuk rekaman.
- **Izin rekaman sebelum jual:** izin tertulis pembicara wajib ada sebelum penjualan dibuka, dan
  pemberitahuan bahwa sesi direkam & dijual masuk S&K yang dicentang saat checkout.
- **Urutan Fase 2:** jalur beli lebih dulu, lalu form admin.
- **Verifikasi email tetap mati**, seperti kondisi produksi hari ini (37 dari 37 pendaftar email 60 hari
  terakhir langsung terkonfirmasi, nol email konfirmasi terkirim). Pembeli baru langsung lanjut ke checkout.
- **Kontak admin untuk pembeli:** `product@jakpat.net`.
- **Pengelola acara pertama:** satu akun, `product@jakpat.net`.
- **Isi daftar:** `/webinar` menampilkan Segera hadir, sedang dijual, habis, dan Video kelas. Section
  homepage hanya tiket mendatang. Acara lewat tanpa Video kelas hilang dari daftar, tetapi URL-nya tetap
  hidup. Menu Webinar di dashboard menampilkan daftar yang sama dengan `/webinar`, dengan tampilan dashboard.
- **Rekaman + materi dijual:** mulai dijual setelah rekaman terbit, harga sama dengan tiket live,
  akses selama layanan JFU tersedia, video di YouTube *unlisted*. Batasan diterima: pembeli bisa mendapatkan link
  YouTube dalam dua klik.
- **Kontak lanjutan:** hanya dengan centang izin (UU PDP).
- **Keuangan:** gabung ke jalur Transaksi, dengan filter produk Iklan / Kilat / Webinar.
- **Homepage:** dua pintu.
- **Alur** mempertimbangkan alur bayar Iklan/Kilat yang sudah ada dan pola umum platform
  ticketing.

## Pilihan saya (koreksi bila keliru)
- **QRIS saja dulu.** E-wallet sekali-ketuk menyusul karena butuh aktivasi di DOKU.
- **1 order = 1 tiket = 1 akun.** Satu akun hanya boleh punya satu tiket live per acara. Beli
  banyak tiket sekaligus dan pilihan jenis tiket di luar lingkup.
- **Kuota & tahanan:** kuota per acara. Kursi ditahan 40 menit, link DOKU berumur 30 menit.
  - Bayar telat selalu diterima.
  - Lewat kuota atau bayar dobel → tiket tetap terbit dan admin dapat alarm.
- **Penjualan tiket tutup saat acara mulai** (`sales_close_at`, default `starts_at`).
- **Prefix invoice `WBN-<8>-<13 digit>`** (26 karakter; batas DOKU 30 karakter selama kanal
  kartu aktif).
- **Halaman acara publik dirender server** (apex & `submit.`). Checkout ada di dashboard.
- **Dua tabel, satu buku:** detail tiket di `webinar_orders`; uang dicatat di `transactions`
  (`entity_type='webinar'`), dan barisnya baru lahir saat lunas. Tidak ada baris di `invoices`.
- **Dana masuk sub-akun JFU** (`DOKU_SAC_JFU_ID`), bisa dialihkan lewat env
  `DOKU_SAC_WEBINAR_ID`.
- **Pengelola = akun `product@jakpat.net`.** Hanya akun ini yang bisa membuka `/internal-dash`
  (`InternalDashboardWithLayout.tsx:231-232`). Endpoint admin tetap memakai `ADMIN_EMAILS`.
- **Halaman acara memakai cara kerja Pages, bukan tabel Pages.** Rinciannya ada di bagian
  "Cara admin mengisi halaman pembelian".
- **1 halaman = 1 video + 1 berkas materi.** Kelas berisi banyak video di luar lingkup.
- **Satu kolom harga.** Saat halaman berubah menjadi Video kelas, harganya ikut terbawa (sama dengan
  tiket) dan boleh diubah; perubahan hanya berlaku untuk pembelian baru.

## Alur pembelian (acuan semua fase)

### Peta alur pembeli tiket

```
 Poster / IG / WA / homepage JFU / menu Webinar di dashboard
              │
              ▼
┌─────────────────────────────────────────┐
│ 1. HALAMAN ACARA  /webinar/<slug>       │
│    Tanpa login. Poster, jadwal WIB,     │
│    pembicara, harga, sisa kursi.        │
└─────────────────────────────────────────┘
              │
      Keadaan penjualan?
              ├─ Segera hadir ──► tanpa tombol beli; tombol muncul sendiri
              │                   pada tanggal buka
              ├─ Ditutup / batal ► pemberitahuan, tanpa tombol beli
              ├─ Kursi habis ───► "Rekaman bisa dibeli setelah acara"
              │
              ▼ Dijual
        [ Beli tiket ]
              │
      Sudah login?
              ├─ Belum ─┐
              │         ▼
              │  ┌──────────────────────────────┐
              │  │ 2. MASUK / DAFTAR            │
              │  │    Google, atau email +      │
              │  │    password. Tanpa verifikasi│
              │  │    email. Lalu kembali       │
              │  │    otomatis ke halaman beli. │
              │  └──────────────────────────────┘
              │         │
              ▼ Sudah   ▼
      Sudah punya tiket?
              ├─ Ya ──────────────► langsung ke halaman tiket
              ▼ Belum
      Profil lengkap?
              ├─ Belum ──► isi profil dulu (akun Google baru) ─┐
              ▼ Sudah                                          │
┌─────────────────────────────────────────┐ ◄──────────────────┘
│ 3. KONFIRMASI  (di dashboard)           │
│    Ringkasan acara, harga termasuk PPN. │
│    "E-tiket dikirim ke <email>"         │
│    [ ] Setuju S&K (wajib)               │
│    [ ] Izin kontak lanjutan (opsional)  │
│    "Ada kendala? Hubungi admin"         │
└─────────────────────────────────────────┘
              │
        [ Bayar ]
              │  Kursi ditahan 40 menit, link DOKU berumur 30 menit
              ├─ Kursi penuh ditahan ► "Coba lagi beberapa menit"
              ▼
┌───────────────────────┐      ┌─────────────────────────┐
│ 4. HALAMAN TUNGGU     │      │ 5. DOKU (tab baru)      │
│ Hitung mundur, cek    │ ───► │ Bayar QRIS dalam        │
│ status tiap 5 detik.  │      │ 30 menit                │
│ Boleh ditutup.        │      └─────────────────────────┘
└───────────────────────┘                  │
              │                            │
              ├─ Keluar, link masih hidup ► "Lanjutkan bayar" (link sama)
              ├─ 30 menit habis ──────────► "Pesan lagi" (tagihan baru)
              │                            │
              ▼                            ▼ Lunas
┌─────────────────────────────────────────────────────────┐
│ 6. TIKET TERBIT (otomatis, tanpa browser pembeli)       │
│    Sumber: notifikasi DOKU. Cadangan: 60 detik sesudah  │
│    bayar, sistem bertanya ke DOKU saat halaman terbuka. │
│    Halaman tunggu berubah menjadi tiket.                │
│    Email: e-tiket + kwitansi PDF + link gabung pribadi. │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ 7. LINK GABUNG  /webinar/gabung/<kode>  (tanpa login)   │
│    Lebih dari 30 menit sebelum acara: hitung mundur +   │
│    kalender.                                            │
│    30 menit sebelum sampai selesai: langsung ke Zoom.   │
└─────────────────────────────────────────────────────────┘
              │ Acara selesai
              ▼
┌─────────────────────────────────────────────────────────┐
│ 8. MENU WEBINAR  (dashboard, wajib login)               │
│    Rekaman, materi, riwayat pembelian.                  │
│    Belum terbit: "Rekaman segera tersedia".             │
└─────────────────────────────────────────────────────────┘
```

Sumber pola: **[K]** alur bayar Iklan/Kilat yang sudah ada, **[T]** pola umum platform
ticketing, **[B]** baru.

1. **Halaman acara, tanpa login [T].** Poster, jadwal WIB, pembicara, harga (sudah termasuk PPN),
   sisa kursi, dan kalimat "Tidak bisa hadir? Tiket sudah termasuk rekaman". Harga terlihat sebelum
   diminta login.
2. **Masuk atau daftar [K].** Halaman login dashboard peneliti yang sama, lalu kembali otomatis
   ke halaman beli.
3. **Konfirmasi data [K].** Satu halaman di dashboard. Data peserta adalah data profil, jadi tidak
   ada form kedua; profil yang belum lengkap memakai gerbang yang sama dengan alur iklan. Lalu
   centang izin kontak (opsional), centang S&K, dan satu kalimat "Ada kendala? Hubungi admin".
4. **Klik Bayar [K].** Kursi ditahan dan tagihan terbit dalam satu klik (tidak ada langkah
   "Kunci" terpisah karena tidak ada tanggal yang dipilih). DOKU terbuka di tab baru; halaman
   tetap terbuka dengan hitung mundur dan memeriksa status tiap 5 detik. Sama dengan Jadwal &
   Bayar.
5. **Bayar QRIS di DOKU [K]**, dalam 30 menit.
6. **Tiket terbit dari notifikasi DOKU, bukan dari browser [K].** Webhook menerbitkan tiket dan
   mencatat uang dalam satu transaksi database, lalu mengirim email e-tiket + kwitansi PDF.
   Pembeli boleh langsung menutup browser.
7. **Hari H, tanpa login [T/K].** Email berisi satu link pribadi `/webinar/gabung/<kode>`.
   Sebelum acara: hitung mundur + kalender. Saat acara: langsung ke Zoom. Polanya sama dengan
   link perantara `/bayar/` dan link gabung per peserta di Luma.
8. **Sesudah acara.** Link yang sama mengarah ke menu Webinar (login): rekaman, materi, riwayat
   pembelian.
9. **Yang tidak ikut live.** Setelah admin mengubah halaman menjadi Video kelas, tombolnya berganti
   "Beli rekaman" dan URL-nya tetap. Langkah 2–6 sama, tanpa kuota. Videonya ada di menu Webinar.

### Saat tidak mulus

| Keadaan | Yang dilihat pembeli |
|---|---|
| Terbit, tanggal buka belum ditentukan | "Segera hadir", tanpa tombol beli. Tanggal acara dan harga tampil bila sudah diisi |
| Terbit, tanggal buka belum tiba | "Segera hadir · Dibuka <tanggal> WIB"; tombol beli muncul otomatis pada waktunya |
| Ditutup admin | Tulisan "Penjualan ditutup" |
| Keluar sebelum bayar, link masih hidup | "Lanjutkan bayar" dengan link yang sama |
| Link sudah habis (30 menit) | "Pesan lagi"; tagihan baru |
| Kuota penuh, sebagian masih ditahan | "Kursi sedang ditahan pembeli lain, coba lagi beberapa menit" |
| Kuota benar-benar habis | "Kursi live habis. Rekaman bisa dibeli setelah acara" |
| Sudah punya akses, klik beli lagi | Langsung ke tiket atau videonya. Pemegang tiket tidak perlu membeli rekaman |
| Sudah bayar, notifikasi DOKU belum datang | "Memeriksa pembayaran"; setelah 60 detik sistem bertanya ke DOKU lalu menerbitkan tiket |
| Login dengan akun lain, menu Webinar kosong | "Kamu masuk sebagai <email>. Cek e-tiket untuk melihat akun yang dipakai saat membeli" |
| Link Zoom belum diisi admin | Halaman gabung: "Link sedang disiapkan" (tidak perlu kirim ulang email) |
| Acara selesai, rekaman belum terbit | "Rekaman segera tersedia" |
| Acara batal | Halaman acara & link gabung memberi tahu dan menyertakan kontak admin, tanpa kata refund |
| Tiket dinonaktifkan admin | Riwayat & link gabung: "Tiket tidak aktif. Hubungi admin bila ada pertanyaan" |
| Jadwal berubah | Pemberitahuan lewat email; tiket tetap berlaku dan sudah termasuk rekaman |
| Daftar baru dengan email | Langsung masuk dan kembali ke halaman beli, tanpa verifikasi email |
| Membuka dari browser bawaan Instagram/TikTok | Pemberitahuan: pindah ke Chrome/Safari untuk memakai Google, atau pakai email & password |

## Cara admin mengisi halaman pembelian

**Keputusan:** admin mengisi lewat menu baru **Webinar** di `/internal-dash`. Cara kerjanya sama
dengan Pages (editor, unggah gambar, draft, pratinjau, terbitkan), tetapi datanya disimpan di
`webinar_events`. Menunya terpisah dari Pages karena nanti juga berisi peserta, refund, dan siaran.

### Yang dipakai ulang dari Pages
- **`src/components/PageBuilder/BlockEditor.tsx`** untuk deskripsi. Formatnya tetap JSON Tiptap.
- **`src/components/PageBuilder/BannerPicker.tsx`** untuk poster dan foto pembicara.
- **Pola layar `PageBuilderModal`:** kanvas kiri, pengaturan kanan, bar bawah. Modalnya sendiri
  tidak dipakai karena 950 barisnya terikat order, jadwal, dan Extra Ad.
- **Pola `/api/admin/content` + `contentGate.js`:** daftar kolom yang diizinkan dan diuji.
- **Node & mark yang didukung `SurveyPage.tsx:760-939`** menjadi acuan renderer server.
- **Page berdiri sendiri untuk promosi di aplikasi Jakpat** (lihat Fase 2).

### Kenapa tidak memakai tabel `survey_pages` (diperiksa di produksi 2 Nov)
| Temuan | Akibat bila dipakai |
|---|---|
| Halaman tanpa order lolos ke `/api/surveys`, `/pages`, dan `/api/respondents`; 10 halaman seperti ini sedang tayang | Webinar muncul sebagai kartu survei dan masuk daftar undian, kecuali semua pembaca diberi saringan baru. Kilat sudah mengalami ini (saringan kembar di 3 tempat, sql/95, sql/130) |
| `anon` punya SELECT level tabel, dan policy publik hanya mensyaratkan `is_published = true` | Kolom baru seperti link Zoom langsung bisa dibaca siapa pun |
| `SurveyPage.tsx` adalah form responden di React | Tidak ada preview link di WA/IG dan tidak ada alur beli |
| `toAiringInstant` memaku jam ke 15.00 WIB (`PageBuilderModal.tsx:299`) | Jam webinar tersimpan salah |
| Slug dibuat ulang setiap judul diedit (`PageBuilderModal.tsx:523`) | Link di poster yang sudah disebar mati |
| `storage-cleanup.js` menghapus gambar 60 hari setelah `publish_end_date` | Gambar halaman rekaman hilang, padahal rekaman dijual selamanya |

### Dua pilihan utama di form
**Halaman ini menjual:** Tiket webinar atau Video kelas. Isian yang tidak relevan disembunyikan.
- Halaman yang sama bisa berubah dari Tiket ke Video kelas. URL tetap, jadi link lama tetap hidup.
- Kelas tanpa sesi live langsung dibuat sebagai Video kelas, tanpa tanggal, kuota, dan Zoom.
- Pilihan ini hanya menentukan yang dijual di halaman publik. Tiket yang sudah terjual dan hak
  tontonnya tidak berubah.
- Mengganti pilihan selalu meminta pilihan penjualan lagi, supaya penjualan tidak terbuka tanpa
  sengaja. Bila masih ada tiket untuk acara yang belum lewat, form memperingatkan.
- Mengganti pilihan juga mengosongkan `sales_open_at` dan `sales_close_at`. Tanpa ini, tanggal tutup
  tiket yang sudah lewat membuat Video kelas langsung tampil ditutup.

**Penjualan dibuka:** berlaku untuk tiket maupun video. Admin hanya menekan **Terbitkan** sekali.
Segera hadir bukan pilihan atau tahap terbit tersendiri, melainkan keadaan yang dihitung sistem.

| Pilihan admin | Yang dilihat pengunjung sesudah terbit |
|---|---|
| Pada tanggal, dan tanggalnya belum tiba | **"Segera hadir · Dibuka <tanggal> WIB"**, tanpa tombol beli |
| Pada tanggal, dan tanggalnya sudah tiba | Tombol beli aktif dengan sendirinya, tanpa terbit ulang dan tanpa cron |
| Sekarang | Tombol beli langsung aktif |
| Belum ditentukan | "Segera hadir", tanpa tombol beli. Tanggalnya bisa diisi kapan saja lewat Simpan perubahan |

Sesudah terbit, admin juga bisa menekan **Tutup penjualan**, dan halaman menampilkan "Penjualan
ditutup". Tutup bisa dibatalkan dengan memilih tanggal buka lagi.

Draft berbeda dari Segera hadir: Draft tidak tampil sama sekali, kecuali lewat link pratinjau.

Tombol di form menjelaskan akibatnya sebelum ditekan, misalnya "Terbitkan — Segera hadir sampai 10
Nov, 10.00 WIB". Daftar acara admin menampilkan keadaan yang sama dengan yang dilihat pengunjung.

### Isian form
Yang dipakai sistem menjadi kolom; yang hanya dibaca manusia bebas ditulis di editor. "Dijual"
berarti penjualan dibuka Sekarang atau Pada tanggal. Isian "dijual" sudah wajib lengkap saat
diterbitkan walaupun tanggalnya masih jauh, karena tombol beli nanti terbuka tanpa admin menekan apa
pun.

| Isian | Belum ditentukan / Ditutup | Tiket dijual | Video dijual | Dipakai di |
|---|---|---|---|---|
| Judul, ringkasan (maks. 160 karakter), poster 16:9 | Wajib | Wajib | Wajib | Halaman, preview link WA/IG, kartu homepage |
| Deskripsi (editor bebas) | Opsional | Wajib | Wajib | Isi halaman |
| Pembicara: nama, jabatan, foto opsional | Opsional | Minimal 1 | Minimal 1 | Halaman, e-tiket |
| Harga (sudah termasuk PPN 11%) | Opsional | Wajib | Wajib | Halaman, checkout, Transaksi |
| Mulai (tanggal & jam WIB), durasi | Opsional | Wajib | – | Halaman, e-tiket, kalender, link gabung |
| Kuota | – | Wajib | – | Sisa kursi, batas jual |
| Link Zoom/Meet | – | Boleh menyusul | – | Hanya link gabung; tidak pernah tampil di halaman |
| Link YouTube | – | – | Wajib + "Terbitkan rekaman" | Hanya pemutar di dashboard pembeli |
| Durasi video, materi | – | – | Opsional | Halaman (durasi), dashboard pembeli (materi) |
| Tanggal buka | – | Bila memilih Pada tanggal | Bila memilih Pada tanggal | Segera hadir, tombol beli |
| Tanggal tutup | – | Opsional (default: saat acara mulai) | Opsional (default: tidak tutup) | Keadaan tombol beli |
| Tampil di daftar (`is_listed`) | Default ya | Default ya | Default ya | `/webinar`, homepage |

URL dibuat otomatis dari judul.

### Memasukkan rekaman acara yang sudah selesai
1. Daftar acara menandai acara selesai yang rekamannya kosong ("Rekaman belum diisi").
2. Di bagian Rekaman, admin menempel link YouTube dalam bentuk apa pun: `youtu.be`, `watch?v=`,
   `/live/`, `/embed/`, `/shorts/`, `studio.youtube.com/video/...`, atau ID polos.
   `src/utils/youtube.ts` mengambil ID-nya, lalu pemutar yang sama dengan milik pembeli muncul di
   form untuk memastikan videonya benar.
3. Opsional: isi durasi video dan unggah materi.
4. Admin menekan "Terbitkan rekaman" dan wajib mencentang: video Unlisted, sematan diizinkan, ada
   izin tertulis pembicara, wajah/nama peserta sudah dipotong. Peserta live langsung bisa menonton
   dan menerima email.
5. Admin mengatur halaman: ubah ke Video kelas dengan pilihan penjualan, atau biarkan supaya
   rekaman hanya untuk peserta.

Aturannya:
- Hanya ID yang disimpan. Server menolak nilai selain format ID YouTube.
- Link boleh diganti kapan saja, dan pembeli langsung mendapat video baru (untuk kasus link bocor).
  Mengosongkannya ditolak setelah rekaman terbit.
- Video kelas hanya bisa dijual bila rekamannya sudah diterbitkan.
- Status Unlisted tidak bisa dicek tanpa YouTube Data API, jadi dijaga lewat centang. Video yang
  telanjur Public bisa ditonton gratis oleh siapa pun.
- oEmbed tidak dipakai: responsnya untuk video unlisted tidak terdokumentasi, dan tanpa CORS. Bukti
  video benar adalah pemutar di form.

### Aturan form (ditegakkan server)
- **Simpan & terbitkan:** ditolak bila isian wajib untuk pilihan yang dipilih masih kosong, dan
  pesannya menyebut yang kurang. CHECK database ikut menjaga isian yang menyangkut uang (Fase 1).
- **Pratinjau:** `/webinar/<slug>?pratinjau=<preview_token>` memakai renderer yang sama, dengan
  banner "Pratinjau", `noindex`, dan tombol beli mati. Link ini bisa dikirim ke pembicara.
- **Waktu:** input WIB diubah lewat `toAiringStartIso(ymd, jam, menit)`, bukan jam perangkat.
- **Tanggal buka:** harus sebelum tanggal tutup. Untuk tiket, juga harus sebelum acara mulai. Boleh
  diubah sesudah terbit; memajukannya ke tanggal yang sudah lewat langsung membuka penjualan, dan
  form memperingatkan hal itu.
- **URL:** otomatis dari judul selama draft, lalu terkunci sejak pertama terbit. Format dicek, dan
  `gabung` ditolak karena dipakai rute link gabung.
- **Harga:** satu kolom, sudah termasuk PPN 11%, minimal Rp 1.000. Form menampilkan rinciannya,
  misalnya Rp 50.000 = Rp 45.045 + PPN Rp 4.955. Perubahan hanya berlaku untuk order baru; order
  pending tetap memakai nominal link-nya.
- **Kuota:** bila angkanya diubah, tidak boleh di bawah tiket lunas + kursi yang sedang ditahan. Aturan ini
  tidak berlaku saat angkanya tidak diubah, supaya acara yang telanjur lewat kuota tetap bisa dikoreksi.
- **Tanggal:** boleh diubah, tetapi tidak boleh dikosongkan bila sudah ada tiket. Bila sudah ada
  tiket terjual, form mengingatkan untuk memberi tahu peserta.
- **Hapus:** hanya draft tanpa order. Selain itu memakai "Batalkan acara" dengan konfirmasi.
- **Gambar:** masuk bucket `webinar-public`. Tab RECENT disembunyikan karena file-nya milik halaman
  survei dan bisa terhapus `storage-cleanup.js`, walaupun masih dipakai webinar.

## Peta fase

| Fase | Isi | Target | Gerbang lulus |
|---|---|---|---|
| 0 | Persiapan & setelan di luar kode | Sen–Sel 2–3 Nov | redirect & email Supabase + cek DOKU beres |
| 1 | Data & jalur uang (SQL + webhook) | Rab 4 Nov | sql/131 diterapkan, tes hijau |
| 2 | Form acara, beli tiket (login) + e-tiket | Kam–Jum 5–6 Nov (cadangan Sab 7) | uji beli produksi lulus → acara 1 terbit (lewat form, atau ops SQL bila form belum siap) → buka jual |
| 3 | Operasional acara | 9–13 Nov | peserta, CSV, e-tiket ulang, dan siaran jalan tanpa developer |
| 4 | Keuangan di halaman Transaksi | 9–13 Nov | total per produk = kueri SQL |
| 5 | Rekaman, materi & jual rekaman | sebelum H+1 | pembeli bisa menonton, non-pembeli tidak |
| 6 | Homepage dua pintu | sebelum hari H (tidak memblokir) | mockup disetujui |
| 7 | Sesudah acara pertama | backlog | — |

## Pembahasan visual ASCII (pengingat wajib)

**Sebelum membangun tampilan apa pun, Claude mengingatkan pemilik produk dan membahas visual ASCII-nya
bersama. Kode tampilan fase itu baru ditulis setelah visualnya disetujui.** Setiap layar dibuat dalam
versi HP dan desktop, termasuk keadaan pentingnya.

| Fase | Layar yang dibahas | Waktu pembahasan |
|---|---|---|
| 2 | Admin: daftar acara, form acara | Sebelum mulai Fase 2 (≤ Rab 4 Nov) |
| 2 | Landing page: `/webinar`, halaman acara (Segera hadir, dibuka, habis, ditutup), halaman gabung, section webinar sementara di homepage | Sebelum mulai Fase 2 |
| 2 | Dashboard peneliti: login/daftar (pemberitahuan browser bawaan), checkout, tiket, menu Webinar ("Tiket saya" + kartu "Webinar & kelas") | Sebelum mulai Fase 2 |
| 3 | Admin: peserta, refund, siaran | Sebelum mulai Fase 3 |
| 4 | Admin: Transaksi dengan filter produk dan kartu ringkasan | Sebelum mulai Fase 4 |
| 5 | Admin: bagian Rekaman. Landing page: halaman Video kelas. Dashboard peneliti: menu Webinar lengkap, pemutar, checkout rekaman | Sebelum mulai Fase 5 |
| 6 | Landing page: homepage dua pintu. ASCII dibahas dulu, lalu mockup | Sebelum mockup Fase 6 |

Fase 0, 1, dan 7 tidak memerlukan pembahasan ini. Fase 7 menyusul bila butirnya mengubah tampilan.

---

## Fase 0 — Persiapan
- **Builder:**
  - Branch `feat/webinar-tiket` dari `main`.
  - Salin rencana ini ke `docs/superpowers/plans/2026-11-02-webinar-jfu.md` dan catat di
    README plans.
  - Pecah Fase 1–2 menjadi tugas rinci (skill `writing-plans`) sebelum menulis kode.
  - Cek batas kirim provider email (`MAIL_PROVIDER`) dibanding perkiraan volume e-tiket + siaran.
- **Pemilik produk:**
  - Supabase Auth → URL Configuration: Redirect URLs harus mengizinkan
    `https://submit.jakpatforuniv.com/dashboard/**` (supaya login kembali ke checkout).
  - Dashboard DOKU:
    - QRIS aktif untuk Checkout.
    - Notification URL produk QRIS = `/api/doku/webhook?k=…`.
      **Wajib:** invoice `WBN-` tanpa `?k=` yang benar ditolak 401, terlepas dari `WEBHOOK_ENFORCE_SECRET`.
  - **Izin tertulis pembicara** untuk merekam & menjual, wajib sebelum penjualan acara 1 dibuka.
  - **Setelan Zoom/Meet:** kapasitas dan batas durasi paket cukup untuk acara, dan Waiting Room menyala,
    karena link rapat terlihat oleh pembeli sesudah dialihkan dan bisa disebar.
  - Konten acara 1, untuk diisi sendiri lewat form di Fase 2: judul, ringkasan maks. 160 karakter,
    deskripsi, pembicara + foto, tanggal-jam, harga, kuota (sedikit di bawah kapasitas Zoom, karena host
    memakai kursi dan pembayaran telat tetap menerbitkan tiket), poster 16:9, dan link Zoom.
  - Tanya tim keuangan: sub-akun. PPN sudah dikonfirmasi (harga termasuk PPN 11%).

## Fase 1 — Data & jalur uang

### SQL `multi-step-form/sql/131_webinar.sql`
Nomor diambil sesudah `git fetch`. Berkas memuat blok dry-run + rollback, diuji di PGlite
dengan constraint produksi disalin ke prelude, dan dijalankan pemilik produk di SQL Editor.

- **`webinar_events`:**
  - Isi: `slug` unik (CHECK format, bukan `gabung`), `title`, `summary`, `description_blocks`
    jsonb (JSON Tiptap), `speakers` jsonb (`[{name, title, photo_url}]`), `poster_url`.
  - Waktu: `starts_at`, `duration_minutes`, `sales_open_at`, `sales_close_at`.
  - Harga & kuota: `price`, `quota`.
  - Tayang: `status` (draft/published/cancelled), `offer_kind` ('live' | 'replay'), `sales_mode`
    ('coming_soon' | 'open' | 'closed'), `is_listed`, `is_test`.
  - Rekaman: `youtube_video_id` (CHECK format ID), `recording_minutes`, `recording_published_at`,
    `materials_path`.
  - Lainnya: `meeting_url`, `preview_token`, `published_at`, cap waktu.
  - Waktu, harga, dan kuota boleh kosong selama belum dijual. CHECK "siap dijual" berlaku untuk
    `status='published'` + `sales_mode='open'`: `price >= 1000`; tiket wajib punya `starts_at`,
    `duration_minutes`, dan `quota > 0`; video wajib punya `youtube_video_id` dan
    `recording_published_at`.
- **`webinar_orders`:**
  - Relasi: `event_id` ON DELETE RESTRICT; `kind` ('live' | 'replay'); `auth_user_id` ON DELETE SET NULL
    (baris uang tidak ikut hilang kalau akun dihapus).
  - Snapshot pembeli: email + biodata (nama, WA, kampus, jurusan, status, referral).
  - Izin kontak: `marketing_consent`, `consent_at`, `consent_version`.
  - Bukti S&K: `terms_version`, `terms_accepted_at`, diisi saat order dibuat.
  - Invoice: `invoice_number` unik, **ditulis sebelum DOKU dipanggil**.
  - Uang (snapshot, harga sudah termasuk PPN): `amount` = harga, `subtotal` =
    `round(amount / 1.11)`, `ppn_rate` = 0.11, `ppn_amount` = `amount - subtotal`. Hasilnya menjaga
    invarian `subtotal + ppn_amount = amount` yang berlaku di `transactions` produksi (nol selisih).
  - Status: `status` (pending/paid/expired/cancelled/refunded), `hold_until`,
    `payment_expires_at`.
  - Pembayaran: `doku_request_id`, `payment_url`, `payment_channel`, `paid_at`,
    `paid_via` ('webhook' | 'status_check' | 'admin'), `last_status_check_at`.
  - Tiket: `ticket_code`, `join_token` (acak, tak bisa ditebak). Kehadiran tidak dicatat: pemindai email
    dan preview WA ikut membuka link, jadi angkanya tidak bisa diandalkan.
  - Alarm: `alarm_outcome`, diisi `webinar_mark_paid`. Inilah sumber "alarm masih terbuka" bagi webhook dan
    sync.
  - Email: `ticket_email_claimed_at`, `ticket_email_sent_at`, `ticket_email_error`,
    `recording_email_sent_at`; cap waktu.
  - Unique index: satu pending per akun per acara (`status='pending'`, jika dua permintaan datang bersamaan
    yang kedua memakai order pertama).
- **Hak akses:** RLS ON **tanpa policy**, plus `REVOKE ALL` dari `anon`/`authenticated`.
  Semua akses lewat Function ber-service_role. Ini menutup kelas bug "UPDATE 0 baris senyap".
- **Bucket `webinar-public`:** terbuka lewat URL, batas 5 MB, hanya gambar. Satu policy: baca, tulis,
  dan hapus lewat Storage API hanya untuk `product@jakpat.net`, jadi isinya tidak bisa didaftar
  atau diubah akun lain. Bucket `page-uploads` tidak dipakai (lihat "Temuan sampingan").
- **Bucket `webinar-materials`:** privat. Admin mengunggah; pembeli mengunduh lewat signed URL dari
  Function.
- **`webinar_offer_state(event)`:** satu-satunya aturan keadaan penjualan, dipakai halaman publik,
  `events.js`, daftar admin, dan `webinar_reserve_seat`.
  - Keadaan dihitung saat dibaca, bukan disimpan, jadi tidak perlu terbit ulang atau cron:
    `sales_mode='open'` + `sales_open_at` di masa depan → Segera hadir dengan tanggal; sudah tiba atau
    kosong → dijual; `sales_mode='coming_soon'` → Segera hadir tanpa tanggal; `closed` → ditutup.
  - Pilihan admin Sekarang = `open` + `sales_open_at` kosong, Pada tanggal = `open` + tanggalnya,
    Belum ditentukan = `coming_soon`, Tutup penjualan = `closed`.
  - `sales_close_at` kosong berarti tiket tutup saat `starts_at`, dan video tidak tutup.
  - Urutan yang menang: batal → ditutup admin → lewat tanggal tutup / acara mulai → belum dibuka → kuota
    habis → dijual. Fungsi juga mengembalikan sisa detik sampai tanggal buka, dihitung dari jam server.
- **`webinar_reserve_seat(...)`**, berurutan (urutan diperbaiki saat Fase 1, 3 Nov):
  1. Kunci baris acara (`FOR UPDATE`). Urutan lock selalu acara → order, juga di `webinar_mark_paid`, supaya
     tidak deadlock.
  2. Tolak akun yang sudah punya akses dan arahkan ke ordernya: halaman tiket → sudah punya tiket paid;
     halaman video → sudah punya tiket atau rekaman paid. Dicek sebelum kuota, supaya pemilik tiket di acara
     yang habis dibawa ke tiketnya.
  3. `webinar_offer_state` harus dijual, atau habis/ditahan. `kind` diambil dari `offer_kind`, bukan dari
     browser.
  4. Pakai ulang order pending ber-`kind` sama yang link-nya masih hidup (`payment_expires_at > now()`), walau
     kuota penuh, karena kursi itu miliknya sendiri. `payment_expires_at` diisi saat order dibuat. Bila
     `payment_url` masih kosong dan order berumur kurang dari 2 menit, jawabannya "sedang disiapkan". Lebih lama
     dari itu dianggap panggilan DOKU gagal, supaya pembeli tidak terkunci 30 menit.
  5. Bila tidak ada: tandai pending lama `expired`, hitung ulang kuota, lalu insert order pending dengan snapshot
     harga dan bukti S&K.
- **`webinar_mark_paid(invoice, amount, channel, via)`**, satu transaksi database, dipakai
  webhook dan cek status DOKU:
  1. Kunci acara lalu order. Tidak ada → `webinar_not_found`, nol tulisan.
  2. Nominal beda → `amount_mismatch`, nol tulisan.
  3. Sudah paid atau refunded → idempoten, nol tulisan; outcome = `alarm_outcome` yang tersimpan, atau `ok`.
  4. Acara sudah batal → uang tetap dicatat dan order menjadi paid, tetapi `alarm_outcome` =
     `webinar_paid_on_cancelled`, supaya admin menghubungi pembelinya.
  5. Selain itu: order menjadi paid (uangnya sudah masuk), `ticket_code` terbit, dan **satu baris
     `transactions`** di-insert: `entity_type='webinar'`, `form_submission_id` & `schedule_id` NULL,
     `payment_id`=invoice, `status='completed'`, `subtotal`/`ppn_*`, `doku_request_id`, dan `note` JSON
     `{ items, memo, buyer, is_test }` (bentuk `parseTransactionNote` yang sudah ada).
  6. Bayar dobel dicek per akun per acara lintas `kind`. Lewat kuota dan bayar dobel disimpan ke
     `alarm_outcome`.
  7. Kembalikan outcome: `ok`, `webinar_over_quota`, `webinar_duplicate_paid`, atau
     `webinar_paid_on_cancelled`.
- **Pengaman buku:** partial unique index `transactions(payment_id) where entity_type='webinar'`. Hari ini
  `payment_id` tidak punya unique index sama sekali. Baris iklan tidak tersentuh.
- **Hibah ketiga fungsi:** `REVOKE` dari `PUBLIC`, `anon`, `authenticated`; `GRANT` ke
  `service_role`; verifikasi `proacl`.
- **CHECK `doku_webhook_events.outcome`** ditambah **hanya outcome alarm**:
  `webinar_over_quota`, `webinar_duplicate_paid`, `webinar_not_found`, `webinar_paid_on_cancelled`.
  - Sukses = `ok` (kalau nama baru, setiap penjualan muncul di banner kegagalan admin).
  - Nominal beda = `amount_mismatch`; gagal tulis = `write_failed`.
  - Daftar nilai lama disalin dari produksi (`pg_get_constraintdef`).

### Kenapa aman menulis ke `transactions` (diperiksa 2 Nov)
- **Skema:** kolom `entity_type` sudah ada (`submission` 873, `extend` 43) tanpa CHECK;
  `form_submission_id` & `schedule_id` boleh NULL.
- **Trigger:** `derive_schedule_id` tidak berbuat apa pun tanpa FK; dua penjaga meloloskan
  `service_role`.
- **Fungsi SQL:** ketujuh fungsi yang menyentuh tabel ini berlingkup order, jadwal, atau
  `payment_id` tertentu; tidak ada sapuan global.
- **RLS:** "Admin View All" sudah mencakup; peneliti tidak bisa membaca baris tanpa order.
- **Pembaca di aplikasi:** hampir semua menyaring per order/jadwal/payment. Yang tidak:
  - `src/utils/analytics/fetchRevenueData.ts:101,108` → **wajib mengecualikan
    `entity_type='webinar'` sebelum penjualan pertama**. Kalau tidak, total pendapatan naik
    tanpa masuk rincian mana pun.
  - `src/components/CustomersPage.tsx:48` → aman (peta per order), tapi kena batas 1.000 baris
    (Fase 4).
  - `src/components/TransactionsPage.tsx:88` → `form_submissions!inner` menyembunyikan baris
    webinar sampai diubah di Fase 4.

### Webhook (`functions/api/doku/webhook.js` + baru `functions/api/doku/_webinar.js`)
- **Titik cabang:** di tempat `processPaymentUpdate` dipanggil (±L570–586), bukan sesudah
  router JM. `WBN-` → `processWebinarPayment()`, dengan `paymentChannel` (L521–530) ikut
  diteruskan. Fungsi memanggil RPC `webinar_mark_paid`, mengembalikan `{outcome, errorMessage}`,
  dan melempar error saat RPC gagal. Dengan begitu batas retry, pencatatan, dan alarm yang sudah
  ada terpakai ulang.
- **Helper privat** (`resolveSupabase`, `sbFetch`) diteruskan sebagai parameter. Jalur iklan
  tidak di-refactor.
- **Alarm terbuka:** notifikasi ulang untuk order yang punya `alarm_outcome` mengulang outcome itu,
  bukan `ok`, karena `recordWebhookEvent` menutup semua alarm invoice saat menerima `ok`
  (`webhook.js:1620-1633`).
- **FAILED/EXPIRED** → order `expired`, hanya bila masih pending.
- **E-tiket** dikirim selama `ticket_email_sent_at is null`, bukan berdasarkan "order baru saja
  paid". Sebelum mengirim, klaim atomik lewat `ticket_email_claimed_at` (UPDATE bersyarat, klaim kedaluwarsa
  sesudah 10 menit), supaya webhook dan sync tidak mengirim dua kali. Gagal kirim → `ticket_email_error` +
  alarm email ke admin, karena DOKU tidak mengulang sesudah menerima 200.
- **Alarm & kuitansi:** `needsAlert` (L620–624) ditambah outcome webinar. Blok kuitansi/Kilat
  (L646–669) dilewati untuk `WBN-`.
- **`_webhook-alert.js`:** kalimat dan saran khusus webinar.
- **`src/components/transactions/WebhookFailuresBanner.tsx` (L32–80):** label untuk outcome baru.

### Tes & gerbang
- **E-tiket awal:** `_webinar-ticket-email.js` sudah dibuat di Fase 1 supaya klaim atomik bisa diuji; kwitansi PDF
  ditambahkan di Fase 2.
- **Tes:** `functions/api/doku/webhookWebinar.spec.js` memanggil `onRequest` sungguhan,
  mengikuti pola `webhook.spec.js`. Kasus yang diuji:
  - sukses, notifikasi ulang (idempoten), bayar telat pada order expired;
  - nominal beda, order tidak ditemukan, lewat kuota, bayar dobel;
  - gagal tulis → 500;
  - bayar sesudah acara batal, notifikasi ulang untuk order refunded;
  - alarm dari jalur sync tidak tertutup oleh notifikasi `ok` berikutnya;
  - webhook dan sync bersamaan hanya mengirim satu e-tiket.
  - Tes iklan & JM yang sudah ada harus tetap hijau.
- **PGlite:**
  - `webinar_mark_paid` benar-benar dijalankan (nama kolom plpgsql tidak dicek saat CREATE) dan
    terbukti menulis tepat satu baris `transactions`.
  - `subtotal + ppn_amount = amount` untuk semua harga Rp 1.000–50.000.
  - Keempat pilihan penjualan × kedua jenis halaman di `webinar_offer_state` dan CHECK "siap dijual",
    termasuk tepat sebelum dan sesudah tanggal buka tanpa baris acara ditulis ulang, dan terbit dengan
    tanggal mendatang tapi isian belum lengkap (tertolak).
- **Gerbang:** vitest hijau, lalu pemilik produk menerapkan sql/131 + kueri verifikasinya
  (termasuk bukti `set local role anon` tertolak).

## Fase 2 — Form acara, beli tiket (login dulu) + e-tiket → buka jual

> **Ingatkan pemilik produk:** bahas visual ASCII admin, landing page, dan dashboard peneliti sebelum
> fase ini dimulai.

**Urutan kerja:** (1) paginasi `transactions`, (2) halaman publik, login, checkout, e-tiket, dan legal, (3)
uji beli produksi dengan acara dari ops SQL, (4) form admin, (5) section homepage. Urutan penulisan bagian
di bawah bukan urutan kerja.

### Paginasi `transactions` (sebelum penjualan pertama)
`CustomersPage.tsx:48` dan `TransactionsPage.tsx:88` memakai `.range()`. Produksi berisi 916 baris, dan tiket
webinar ikut terhitung di `CustomersPage`, jadi batas 1.000 baris bisa tercapai sesudah sekitar 84 baris baru.
Dikerjakan sebagai commit terpisah.

### Form acara di dashboard admin (sesudah jalur beli lulus uji)
Isi dan aturannya mengikuti bagian "Cara admin mengisi halaman pembelian". Fase 2 mengerjakan Tiket
dengan keempat pilihan penjualan. Pilihan Video kelas dan bagian Rekaman baru muncul di Fase 5, ketika
pembelian dan pemutar videonya sudah ada.
- **Layar:**
  - `src/components/webinar-admin/WebinarAdminPage.tsx`: daftar acara (poster, tanggal,
    terjual/kuota, keadaan penjualan) dan tombol "Buat Acara".
  - `src/components/webinar-admin/WebinarEventForm.tsx`: form + Pratinjau, Simpan Draft, Terbitkan
    (sekali, untuk semua pilihan penjualan). Sesudah terbit tombolnya menjadi Simpan perubahan dan
    Tutup penjualan.
  - Layout: cek `styles.css` untuk tiap utility responsif.
- **Menu:** `src/components/InternalDashboardWithLayout.tsx`, yaitu tipe `Page`, `menuGroups`
  (sesudah Pages), dan cabang render.
- **Komponen lama, hanya prop tambahan:** `BlockEditor` dan `BannerPicker` mendapat `uploadBucket`
  (default `page-uploads`); `BannerPicker` juga `pathPrefix` dan `hideRecent`. Pemakai lama tidak
  berubah.
- **Backend:** `functions/api/admin/webinar.js` + `functions/api/admin/webinarGate.js` (pola
  `contentGate.js`):
  - Hanya kolom di daftar izin yang boleh ditulis.
  - `poster_url` dan `meeting_url` wajib `https`.
  - `description_blocks` maksimal 500 KB dan menolak gambar `data:`, karena `BlockEditor` mengizinkan
    base64 sementara renderer server membuangnya.
  - Setiap tulisan meminta baris balik; nol baris dianggap galat.
- **Tes:** `webinarGate.spec.js` dan tes handler untuk aturan URL, kuota, isian wajib per pilihan
  penjualan, dan hapus.

### Halaman publik `functions/webinar/[[path]].js` (preseden `functions/bayar/[id].js`)
- **Rute:**
  - `/webinar` → daftar acara, mengikuti keputusan "Isi daftar". Halaman memuat `canonical` ke apex.
  - `/webinar/<slug>` → detail + meta OG + keadaan tombol sesuai tabel "Saat tidak mulus".
    Tombol "Beli tiket" → `https://submit.jakpatforuniv.com/dashboard/webinar/beli/<slug>`.
  - `/webinar/gabung/<join_token>` → link perantara:
    - Lebih dari 30 menit sebelum acara: hitung mundur + kalender.
    - Sejak 30 menit sebelum acara sampai selesai: 302 ke `meeting_url`. Belum diisi → "Link sedang
      disiapkan".
    - Sesudah acara: arahkan ke `/dashboard/webinar`.
    - Tiket refunded/acara batal: kalimat pemberitahuan + kontak admin, tanpa kata refund. Tidak
      menampilkan nominal, email, atau data pribadi lain.
- **Aturan render:**
  - Semua isi dari DB di-escape (cegah XSS).
  - HTML halaman acara dan `events.js` tidak di-cache lama, supaya Segera hadir tidak tertinggal
    setelah tanggal buka. Halaman yang sedang terbuka menghitung mundur dari sisa detik kiriman server,
    bukan dari jam perangkat, lalu memuat ulang sekali. Sesudah itu tidak memuat ulang lagi, supaya jam HP
    yang salah tidak menimbulkan reload berulang. Checkout tetap ditentukan `webinar_reserve_seat`, bukan
    oleh tampilan.
  - `functions/webinar/_render-blocks.js` mengubah JSON Tiptap menjadi HTML dengan daftar izin:
    heading, paragraph, list, blockquote, hr, image, hardBreak; mark bold, italic, strike,
    underline, link. `href` hanya http/https/mailto; `src` hanya https. Node atau mark di luar daftar
    (`StarterKit` juga menghasilkan `code` dan `codeBlock`) tetap menampilkan teksnya sebagai teks biasa,
    supaya isi tidak hilang. Tesnya mencakup `<script>` di teks dan `javascript:` di link.
  - Kolom publik lewat satu konstanta `PUBLIC_EVENT_COLUMNS`, juga untuk `events.js`.
    `meeting_url` dan `preview_token` tidak pernah masuk. Tes memanggil handler dengan acara yang
    berisi link Zoom, lalu memastikan nilainya tidak ada di HTML.
  - URL gambar ditulis absolut: `https://submit.jakpatforuniv.com/cdn/webinar-public/...`. Proxy
    `functions/cdn/[[path]].js` sudah menerima bucket apa pun.
  - `params.path ?? []` untuk `/webinar` polos.
  - Aset `/homepage/...` dan link Beranda ditulis absolut. `href="/"` di `submit.` membuka
    aplikasi React, bukan homepage.
- **`functions/_middleware.js` (root):** di apex, `/webinar`, `/webinar/*`, dan
  `/api/webinar/*` diteruskan ke `next()`.

### Penyesuaian halaman login/daftar (satu halaman untuk semua produk)
Tidak ada halaman baru dan kolom form daftar tidak berubah. `PrivateRoute` sudah membawa tujuan
lewat `state.from`, dan login password sudah kembali ke sana. Yang disesuaikan:
- **Tujuan login Google:** `src/pages/LoginPage.tsx:44` meneruskan `from` ke
  `signInWithGoogle(redirectTo)` (`src/utils/supabase.ts:172`). Hari ini selalu ke `/dashboard`.
- **Setelah daftar:** verifikasi email mati, jadi `signUp` langsung menghasilkan sesi dan `LoginPage` kembali
  ke `from`. Toast "cek email Anda untuk verifikasi" (`LoginPage.tsx:97-98`) menyesatkan, jadi diganti. Uji
  bahwa pendaftar kembali ke halaman beli, bukan ke `/dashboard`.
- **Pesan galat:** `LoginPage.tsx:102` menampilkan pesan mentah Supabase berbahasa Inggris.
  Terjemahkan minimal: password salah dan email sudah terdaftar.
- **Browser bawaan aplikasi:** deteksi Instagram/Facebook/TikTok/LINE, lalu tampilkan di atas
  tombol Google: pindah ke Chrome/Safari (salin link + intent Chrome di Android), atau pakai email
  & password. Dipasang juga di halaman acara. Sistem hari ini belum menangani ini sama sekali.
- **Teks netral:**
  - `authSignupSubtitle` ("Daftar untuk memasang survei…") menjadi kalimat satu akun untuk semua
    layanan JFU. Versi EN ikut diubah.
  - Banner `DashboardLayout.tsx:82` ("…agar bisa memasang survei") dinetralkan.
  - Bila `from` mengarah ke `/dashboard/webinar/`, tampilkan baris konteks "Masuk atau daftar untuk
    melanjutkan pembelian tiket webinar".

### Keamanan endpoint (mengikuti pola gerbang `functions/api/admin` dan `schedules/lock.js`)
- **Pemilik order = `auth_user_id` saja.** Fallback email seperti `owns()` di `lock.js` tidak disalin: verifikasi email
  mati, jadi siapa pun bisa mendaftar memakai email orang lain.
- **Identitas dan biodata dibaca server** dari sesi dan profil. `p_auth_user_id`, `p_buyer_email`, dan `p_buyer` tidak
  pernah diambil dari body.
- **Setiap endpoint punya gerbang tersendiri + spec:** daftar kolom yang boleh ditulis, nol baris dianggap galat, dan
  endpoint admin mengecek `ADMIN_EMAILS` lewat `/auth/v1/user`.
- **Cegah kursi diborong:** akun gratis tanpa verifikasi bisa menahan kursi 40 menit per akun. Pasang batas laju
  Cloudflare pada `/api/webinar/checkout`, dan batas order pending per IP/akun di endpoint.
- **Link gabung:** respons `/webinar/gabung/<token>` memakai `Referrer-Policy: no-referrer` dan `noindex`.

### Checkout di dashboard (React, `PrivateRoute`, mobile-first)
- **`/dashboard/webinar/beli/:slug`** (pola tampilan & perilaku Jadwal & Bayar):
  - Ringkasan acara & harga, dengan keterangan "sudah termasuk PPN 11%".
  - Data peserta = profil, tidak ada form kedua. Kolomnya sudah cocok (nama, WA, kampus, jurusan,
    status). Profil yang belum lengkap, misalnya akun Google baru, memakai gerbang
    `ProfileCompletionSheet` yang sama dengan alur iklan (`StepSurveyDetails.tsx:183`). Saat bayar,
    datanya disalin sebagai snapshot ke order.
  - Centang izin kontak (opsional, default kosong), centang S&K (termasuk pemberitahuan sesi direkam &
    dijual), dan kalimat "Ada kendala? Hubungi admin" dengan alamat `product@jakpat.net`.
  - Baris jelas "E-tiket dikirim ke <email>. Salah alamat? Hubungi admin", karena tanpa verifikasi email
    salah ketik tidak terdeteksi sistem. Alamatnya email akun dari sesi, jadi mengubah profil tidak
    mengubah tujuan e-tiket.
  - Petunjuk QRIS di HP yang sama: screenshot QR → scan dari galeri. "Setelah bayar, tiket
    otomatis masuk email; kamu boleh menutup halaman ini."
  - Tombol Bayar memakai pola `JadwalDanBayarPage.tsx:481-489`: `window.open('about:blank')`
    lebih dulu, cadangan tab yang sama, dan `createInFlightGate` supaya klik ganda tidak
    menerbitkan link kedua.
  - Hitung mundur + polling 5 detik. Setelah lunas, halaman berubah menjadi tiket.
  - Layout: cek `styles.css` untuk tiap utility responsif (jebakan cascade Tailwind).
- **`functions/api/webinar/checkout.js` (POST, Bearer):**
  - Validasi sesi mengikuti `caller()` di `functions/api/schedules/lock.js`. Email dan user id
    diambil dari sesi, bukan dari form.
  - RPC `webinar_reserve_seat`; harga dihitung di server dari DB.
  - Terbitkan link lewat `dokuRequest` (`functions/api/doku/_helpers.js`) dengan:
    `payment_due_date: 30`, `payment_method_types: ['QRIS']`, `line_items` (satu baris sebesar
    harga, tanpa baris PPN), SAC, dan `callback_url` → `/dashboard/webinar/tiket/<orderId>`.
  - Simpan `doku_request_id`, `payment_url`, dan `payment_expires_at` (cek baris berubah).
- **`functions/api/doku/dueDate.spec.js`:**
  - Ikut memindai `../webinar`.
  - Kunci daftar berdasarkan path relatif (`webinar/checkout.js`), karena nama `checkout.js`
    sudah dipakai.
  - Masukkan ke `FIXED_LIFETIME_ISSUERS` + tes yang mematok umur 30 menit.
- **`functions/api/webinar/my.js` (GET, Bearer):** order milik akun + data acara + link gabung
  untuk order paid. `meeting_url` mentah tidak pernah dikirim ke browser.
- **`functions/api/webinar/sync.js` (POST, Bearer, hanya pemilik):** jaring pengaman bila DOKU
  tidak menelepon. Sistem hari ini belum pernah memakai Check Status API.
  - Dipanggil halaman tiket saat order masih pending lebih dari 60 detik (dokumentasi DOKU
    melarang lebih cepat), dibatasi `last_status_check_at`.
  - `dokuRequest(env, 'GET', '/orders/v1/status/<invoice>')`. SUCCESS + nominal cocok →
    `webinar_mark_paid(..., 'status_check')` → kirim e-tiket.
  - Bila hasilnya alarm, sync menulis baris `doku_webhook_events` dan mengirim alarm yang sama dengan webhook,
    supaya kasusnya tetap muncul di banner admin.
- **`/dashboard/webinar/tiket/:orderId`:** keadaan pending (hitung mundur + "Lanjutkan bayar"),
  expired ("Pesan lagi"), paid (tiket, tombol Gabung, kalender). Bila order paid tetapi e-tiket belum
  terkirim, `my.js` mencoba mengirim lagi lewat klaim yang sama. `payment_url` hanya dikirim untuk order
  pending yang link-nya masih hidup.
- **Menu "Webinar" di `src/components/AppNav.tsx`** (desktop & mobile) → `/dashboard/webinar`, berisi dua
  bagian:
  - **"Tiket saya":** bila kosong, menyebut akun yang sedang dipakai.
  - **"Webinar & kelas":** isi sama dengan `/webinar` (data dari `events.js`, aturan "Isi daftar" dan keadaan
    penjualan tidak ditulis ulang), dengan tampilan kartu dashboard. Kartu membuka detail di
    `/webinar/<slug>`; tombol beli langsung ke `/dashboard/webinar/beli/<slug>`. Acara yang sudah dimiliki
    akun (dari `my.js`) berlabel "Sudah punya" dan mengarah ke tiketnya. Video kelas otomatis ikut tampil
    begitu dijual di Fase 5.
- **Satu entri di `PRODUCTS` (`src/components/CreateOrderCards.tsx`)**, yang memang dirancang
  sebagai satu-satunya daftar produk dashboard. Warna aksennya ditambah satu untuk webinar.
- **`src/utils/analytics/fetchRevenueData.ts`:** kecualikan `entity_type='webinar'`.
- **Penjaga lama:** pastikan `payLinkNoRawFallback.spec.ts` tetap hijau.
- **Chat Mimin:** pembeli webinar melihat Mimin di dashboard, sedangkan `ai_settings.system_prompt` belum
  mengenal webinar. Tambahkan lewat berkas SQL, sesudah deploy: pertanyaan soal webinar diarahkan ke kontak
  admin, Mimin tidak menjanjikan atau menjelaskan refund, dan tidak mengarang jadwal atau harga acara.

### E-tiket & kwitansi
`functions/api/doku/_webinar-ticket-email.js`, lewat `functions/api/_mail.js::sendMail()`:
- Isi: judul, tanggal-jam WIB, pembicara, kode tiket, link `/webinar/gabung/<join_token>`,
  tombol Google Calendar, tombol ke dashboard, dan kalimat "masuk dengan akun <email>".
- Lampiran: **kwitansi PDF memakai `generateReceiptPdf`** dari `_payment-receipt.js`. Tambahkan
  prefix `WBN-` ke `shortDocCode` lalu ekspor fungsinya. Formatnya sudah Subtotal + PPN (11%) + Total, tetapi
  teks "Deskripsi Pesanan / Survei" dan "Jadwal Tayang" terpaku (L231-232), jadi labelnya dijadikan parameter
  dengan default nilai lama. Kwitansi iklan tidak berubah.
- Pembeli juga tetap menerima email "Pesanan Berhasil" dari DOKU.

### Homepage, legal, dan data acara
- **Homepage (pintu masuk sementara):**
  - Menu "Webinar" + section "Webinar Mendatang" di `public/homepage/index.html`, hanya tiket mendatang.
  - Kartu acara dari `functions/api/webinar/events.js` (CORS terbuka).
  - Kunci teks ID/EN ditambahkan di `translations.js`.
- **Legal:**
  - `public/homepage/terms-conditions.html`, bagian baru Webinar: tiket, harga sudah termasuk PPN 11%,
    jadwal berubah tiket tetap berlaku, sesi direkam & dijual, larangan menyebarkan link, kendala hubungi
    admin. Tidak menyebut refund.
  - **§4 "Pembayaran dan Pengembalian Dana" yang sudah tayang berlaku umum** dan menjanjikan pengembalian
    70–100% (L111-130). Judul §4.2 dipersempit menjadi khusus layanan iklan survei, supaya tidak terbaca
    berlaku untuk tiket. Isi kebijakan iklan tidak berubah.
  - `public/homepage/privacy-policy.html`: data pembeli webinar dan kontak berizin.
- **Ops SQL `sql/ops_webinar_uji.sql`:**
  - Acara uji (`is_test`, `is_listed=false`, Rp 1.110).
  - Kueri daftar peserta (sampai Fase 3).
  - Cadangan acara 1 berstatus `draft`, hanya dipakai bila form belum siap.
- **Promosi di aplikasi Jakpat (opsional, tanpa kode):** buat Page berdiri sendiri dengan Redirect
  URL ke `/webinar/<slug>`.
  - `functions/api/surveys.js:293-294` mengirim `use_external_browser: true`, jadi halaman
    seharusnya terbuka di browser luar dan login Google tidak terblokir WebView.
  - Perilaku di aplikasi belum diuji, jadi coba sekali sebelum diandalkan.

### Gerbang rilis (urutan mengikat)
1. sql/131 sudah diterapkan.
2. Merge ke `main` → `git pull` → push (= deploy) → `graphify update .`.
3. Uji di produksi dengan membeli acara uji memakai **akun baru**, lewat dua jalur:
   - Daftar dengan Google dari Chrome di HP, lalu bayar QRIS di HP yang sama.
   - Buka dari browser bawaan Instagram (pemberitahuan pindah browser muncul), lalu daftar dengan email
     & password.

   Lulus bila semua ini terpenuhi:
   - Kedua jalur kembali ke halaman beli, bukan ke dashboard iklan.
   - Peneliti iklan yang sudah punya akun tetap bisa masuk seperti biasa dan mendarat di
     `/dashboard`.
   - Ada baris `doku_webhook_events` ber-outcome `ok`.
   - Order berstatus paid dan tepat satu baris `transactions` ber-`entity_type='webinar'`.
   - E-tiket + kwitansi masuk ke inbox; link gabung berfungsi.
   - Dashboard menampilkan tiketnya; sisa kursi berkurang.
   - Check Status DOKU menjawab sesuai dokumentasi untuk order uji.
   - Total Analytics tidak berubah.
   - Sumber HTML halaman acara tidak memuat link Zoom.
   - Kwitansi acara uji: Subtotal Rp 1.000, PPN (11%) Rp 110, Total Rp 1.110.
   - Acara uji dicoba di keempat pilihan penjualan: halaman menampilkan keadaan yang benar, dan
     checkout menolak order selama penjualan belum dibuka.
   - Acara uji diterbitkan sekali dengan tanggal buka beberapa menit ke depan: tampil Segera hadir,
     lalu tombol beli aktif sendiri pada waktunya tanpa admin menekan apa pun.
4. Pemilik produk mengisi acara 1 lewat form, mengecek Pratinjau, menentukan tanggal buka, lalu
   menerbitkannya sekali.

Kalau langkah 3 belum lulus: acara 1 boleh diterbitkan dengan penjualan Belum ditentukan, supaya
tampil Segera hadir dan promosi tetap jalan. Jangan memakai Pada tanggal dalam keadaan ini, karena
penjualan akan terbuka sendiri walaupun uji belum lulus.
Kalau waktu habis, tiga hal ini boleh digeser ke Sabtu/Senin, sesuai urutan kerja: section homepage (cukup
menu saja), tampilan daftar tiket, dan form acara. Bila form belum siap, acara 1 masuk lewat ops SQL, dan
setiap koreksi isi butuh developer sampai form siap.

## Fase 3 — Operasional acara (9–13 Nov)

> **Ingatkan pemilik produk:** bahas visual ASCII halaman peserta, refund, dan siaran sebelum fase ini
> dimulai.

- **Di menu Webinar admin** (form acara sudah ada sejak Fase 2):
  - Daftar peserta, termasuk status izin kontak.
  - Ekspor CSV, kirim ulang e-tiket, tombol "Cek ke DOKU" untuk order pending.
  - Tandai refund (khusus admin, atas kebijakan admin): order & baris `transactions` menjadi `refunded` dalam
    satu transaksi, dan akses tiket/rekaman berakhir. Uangnya dikembalikan manual di luar sistem. Pembeli hanya
    melihat "Tiket tidak aktif".
  - Batalkan acara: juga mematikan link DOKU order pending lewat `cancelDokuOrder`
    (`functions/api/doku/_doku-cancel.js`), supaya tidak ada yang membayar acara batal.
  - Siaran "pengingat" dan "perubahan jadwal/pembatalan" ke peserta live yang paid. Dikirim
    bertahap per batch dari UI supaya aman dari batas subrequest Cloudflare. Templat pembatalan menyertakan
    kontak admin, tanpa kata refund.
- **Backend:** aksi baru di `functions/api/admin/webinar.js` + `webinarGate.js` + tes gerbang.
- **Gerbang:** pemilik produk bisa melihat peserta, mengekspor CSV, mengirim ulang e-tiket, dan
  mengirim siaran tanpa bantuan developer.

## Fase 4 — Keuangan di halaman Transaksi (9–13 Nov)

> **Ingatkan pemilik produk:** bahas visual ASCII filter produk dan kartu ringkasan sebelum tampilan
> fase ini dibangun. Paginasi tidak perlu menunggu pembahasan ini.

Temuan: `src/components/TransactionsPage.tsx` hanya punya filter cari, bulan, tahun, dan status.
**Belum ada filter produk**, dan Kilat belum dibedakan dari Iklan.

- **Paginasi:** sudah selesai di awal Fase 2.
- **Customers:** `get_customer_profiles` mengambil semua profil, jadi pembeli webinar ikut muncul di halaman
  Customers. Tambah filter "Customer Iklan" (punya order) sebagai tampilan bawaan.
- **Transaksi uji:** baris dengan `is_test` di `note` tampil berlabel "Uji" dan tidak dihitung pendapatan.
- **Baris webinar tampil:** `form_submissions!inner` menjadi embed biasa + saringan
  `form_submission_id not null OR entity_type='webinar'` (3 baris yatim yang sudah ada tetap
  tersembunyi). Judul & nama pembeli dibaca dari `note`. Tidak perlu endpoint atau policy baru.
- **Aturan produk satu pintu `productOfTransaction()`:**
  - Webinar bila `entity_type='webinar'`.
  - Kilat bila `ad_schedules.distribution_type` (fallback ke
    `form_submissions.distribution_type`) = `'kilat'`. Ini aturan yang sama dengan
    `_kilat-paid-alert.js:138` dan dikunci tes. FK `transactions.schedule_id` → `ad_schedules`
    sudah ada.
  - Selain itu Iklan.
- **Tampilan:**
  - Filter "Produk" (Semua/Iklan/Kilat/Webinar).
  - Kartu ringkasan pendapatan per produk untuk periode terpilih.
  - CSV ditambah kolom Produk.
  - Label `refunded` di `transactionStatusChip`; refunded tidak dihitung pendapatan.
  - Detail baris webinar tanpa aksi khusus iklan (dipastikan dengan tes).
- **Analytics:** tentukan apakah webinar masuk Analytics sebagai produk tersendiri. Bila ya, cek
  ambang uji Rp 10.000 di `src/utils/analytics/revenue.ts`, karena tiket bisa di bawah angka itu.
- **Gerbang:** total per produk untuk Okt–Nov sama dengan kueri SQL verifikasi.

## Fase 5 — Rekaman, materi & jual rekaman (sebelum H+1)

> **Ingatkan pemilik produk:** bahas visual ASCII bagian Rekaman, halaman Video kelas, dan menu Webinar
> lengkap sebelum fase ini dimulai.

- **Tanpa migrasi baru:** kolom rekaman dan bucket `webinar-materials` sudah ada sejak sql/131.
- **Form admin:** pilihan Video kelas dan bagian Rekaman mulai muncul, mengikuti "Memasukkan rekaman
  acara yang sudah selesai".
- **Email "Rekaman & materi tersedia — buka di dashboard":** dikirim bertahap memakai siaran Fase 3
  dan dicatat per order di `recording_email_sent_at`, jadi tidak terkirim dobel.
- **Pemutar satu komponen `YoutubePlayer.tsx`,** dipakai form admin dan dashboard pembeli:
  - Embed `youtube-nocookie.com` dengan `referrerpolicy="strict-origin-when-cross-origin"`. Pemutaran
    gagal (Error 153) bila browser tidak mengirim Referer. Header produksi sudah sesuai dan dashboard
    tidak punya CSP (diperiksa 2 Nov).
  - Kalimat cadangan bila video tidak tampil: matikan pemblokir iklan atau coba browser lain.
- **Parser `src/utils/youtube.ts`:** semua bentuk link di atas + ID polos, dikunci tes.
- **Menu Webinar lengkap:**
  - "Webinar & kelas" dari Fase 2 tetap ada, kini termasuk Video kelas.
  - Tiket mendatang: tombol Gabung.
  - Rekaman & materi: `YoutubePlayer`; materi lewat signed URL 10 menit dari
    `/api/webinar/material`.
  - Riwayat pembelian: acara, jenis, nominal, status, tanggal, no. invoice.
  - Kartu "Tiket webinarmu" di beranda dashboard bila akun punya tiket, supaya pembeli yang
    masuk langsung tidak tersesat di halaman order iklan yang kosong.
- **ID YouTube hanya dikirim API ke akun yang berhak**, tidak pernah lewat email atau halaman
  publik.
- **Jual rekaman:**
  - Halaman berjenis Video kelas menampilkan tombol "Beli rekaman".
  - Alurnya checkout yang sama dengan `kind='replay'`: tanpa kuota, harga dari kolom `price` yang
    sama, dan melewati `webinar_mark_paid` yang sama.
  - Checkout memakai kalimat yang sama: "Ada kendala? Hubungi admin". Tidak ada teks refund.
  - Pembeli menerima email "Rekamanmu siap" + kwitansi.
- **Hak akses:** peserta live otomatis berhak atas rekaman; akses berlaku selama layanan JFU tersedia. Order
  refunded kehilangan akses.
- **Penanganan kebocoran:**
  - Unggah ulang video (ID baru), lalu ganti ID-nya di admin.
  - Pantau YouTube Studio → Sumber trafik.
  - Watermark permanen di video.
- **Legal:**
  - Izin pembicara dan pemberitahuan rekaman sudah beres sejak sebelum penjualan dibuka (Fase 0 & 2).
  - Potong wajah/nama peserta di sesi tanya-jawab (UU PDP).
  - S&K rekaman: penggunaan pribadi, dilarang disebar, kendala hubungi admin. Tidak menyebut refund.
- **Gerbang:**
  - Pembeli live dan pembeli rekaman bisa menonton.
  - Akun ketiga tanpa pembelian tidak melihat apa pun.
  - Email dan halaman publik bebas dari ID YouTube.
  - Acara uji berubah dari Tiket ke Video kelas: URL tetap, pemegang tiket tetap punya akses dan
    tidak bisa membeli lagi.
  - Video kelas baru tanpa sesi live bisa dibuat, dijual, dan ditonton.
  - Video unlisted sungguhan terputar di Chrome Android dan Safari iPhone.

## Fase 6 — Homepage dua pintu (sebelum hari H; tidak memblokir penjualan)
- **Alur kerja:** **ingatkan pemilik produk untuk membahas visual ASCII homepage** → eksplorasi desain
  + mockup (skill `impeccable`) → disetujui pemilik produk → dibangun.
- **Isi:** hero "teman riset mahasiswa" dengan dua pintu (Iklan Survei | Webinar), menu baru,
  section webinar dipindah ke struktur baru, teks ID/EN.
- **Jaga:** CTA iklan tetap paling jelas bagi peneliti. Cek di apex maupun `submit.`.
- **Gerbang:** mockup disetujui; uji di mobile; jalur klik iklan & webinar berjalan di kedua
  domain.

## Fase 7 — Sesudah acara pertama (backlog)
- Pengingat otomatis H-1 (pg_cron + pg_net → Function). Endpoint dideploy **sebelum** cron
  dinyalakan (pelajaran insiden sql/48).
- Sapuan otomatis Check Status untuk pembeli yang sudah bayar tapi tidak kembali ke halaman.
- Ukur corong: kunjungan halaman acara → checkout → order → lunas, untuk menilai dampak wajib
  login.
- E-wallet sekali-ketuk (DANA/ShopeePay/OVO) setelah diaktifkan di DOKU.
- Kode promo/early-bird, beli banyak tiket, paket satu seri (all-access), versi EN halaman
  webinar, laporan "tahu dari mana".
- Pindah ke Cloudflare Stream bila kebocoran YouTube terbukti nyata.
- Menambah admin webinar selain `product@jakpat.net`.
- Tombol "Ingatkan saya" di halaman Segera hadir. Sementara itu, tautan IG/WA bisa ditulis di
  deskripsi.
- Cek otomatis status Unlisted lewat YouTube Data API.
- Kelas berisi banyak video dan banyak berkas materi.

## Kebutuhan DOKU (ringkas)
- **Tidak ada integrasi atau kredensial baru:** akun, Client-Id/Secret, SAC, dan notification
  URL tetap sama.
- **Field request:** `payment_method_types` dan `line_items` valid menurut dokumentasi
  Checkout. Jumlah `line_items` wajib sama dengan `order.amount`.
- **Nomor invoice** maksimal 30 karakter selama kanal kartu kredit aktif.
- **Format notifikasi QRIS:** 108 notifikasi QRIS di produksi memakai format Jokul dengan
  `order.invoice_number`, jadi cabang `WBN-` aman.
- **Kedaluwarsa:** DOKU tidak pernah mengirim notifikasi FAILED/EXPIRED, jadi kedaluwarsa
  dihitung saat dibaca, tanpa cron. Baris `transactions` hanya lahir saat lunas, jadi order yang
  ditinggalkan tidak menambah "pending" di buku.
- **Check Status API:** `GET /orders/v1/status/{invoice_number}`, tanpa Digest, hanya setelah 60
  detik sejak pembayaran. Pertama kali dipakai di sistem ini, jadi dibuktikan di gerbang rilis.
- **Uji di produksi** dengan nominal kecil, karena sandbox DOKU adalah akun terpisah.

## Temuan sampingan (di luar webinar, belum dikerjakan)
- **File di bucket `page-uploads` bisa dihapus atau ditimpa akun biasa.**
  - Policy "Admins can do everything on page-uploads" berlaku untuk semua akun yang login. Pendaftaran
    akun terbuka untuk umum.
  - Bukti 2 Nov: `EXPLAIN DELETE` dengan peran akun biasa meloloskan filter RLS. Penghapusan
    sungguhan tidak dicoba.
  - Bucket berisi 190 banner dan 89.766 bukti responden.
  - Perbaikan: migrasi tersendiri yang membatasi policy itu ke email admin, sesudah semua pemakai
    bucket diperiksa. Unggah responden memakai policy INSERT tersendiri tanpa upsert
    (`SurveyPage.tsx:620`).

## Verifikasi
- `npx vitest run`: tes baru memanggil handler sungguhan; tes iklan & JM tetap hijau.
- PGlite untuk setiap migrasi (perilaku + rollback).
- `tsc -p tsconfig.app.json` + grep TS2304/TS2552 kosong untuk setiap perubahan React.
- `npx wrangler pages dev dist` (butuh `.dev.vars`) untuk uji Function lokal, karena
  `npm run dev` tidak menjembatani Function baru.
- Gerbang produksi di setiap fase, seperti tertulis di masing-masing fase.
