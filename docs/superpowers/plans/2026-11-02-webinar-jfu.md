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
- **Isi `/webinar` mengikuti ritme satu-dua acara per bulan (3 Nov):** bukan grid, melainkan satu hero + bagian yang
  hanya muncul bila ada isinya. Hero: tiket dijual dengan acara terdekat → kursi habis yang acaranya belum mulai →
  Segera hadir terdekat → Video kelas terbaru → keadaan kosong. Acara mendatang lainnya tampil di "Webinar berikutnya",
  Video kelas di "Video kelas"; bagian tanpa isi tidak ditampilkan.
- **Sisa kursi** hanya tampil saat sisa ≤ 20.
- **Layar admin (3 Nov):** berbahasa Indonesia kecuali nama menu. Draft tersimpan otomatis; acara terbit lewat Simpan
  perubahan. Daftar acara memperingatkan link Zoom kosong bila acara mulai dalam 3 hari.
- **⚠️ Hosting Video kelas diputuskan di awal Fase 5 (3 Nov):** Developer Policies YouTube III.F.3.1 melarang menarik bayaran untuk
  menonton di pemutar YouTube tersemat, jadi rencana YouTube unlisted di bawah bertentangan dengan aturan itu. Usulan
  pengganti: Cloudflare Stream dengan signed URL. Tidak menahan penjualan tiket; bagian YouTube di rencana ini menunggu
  keputusan pemilik produk sebelum Fase 5.
- **Kalimat izin kontak:** "Saya setuju dihubungi JFU lewat email/WhatsApp tentang webinar berikutnya" (opsional, tidak
  tercentang).
- **Pengujian memakai acara dummy** `uji-webinar-jfu` dari `sql/ops_webinar_uji.sql`; konten acara 1 menyusul.
- **Landing dan dashboard konsisten lewat satu sumber (3 Nov):** `functions/api/webinar/_view.js` menghitung urutan hero,
  label keadaan, kalimat, sisa kursi, harga, dan "Yang kamu dapat". Halaman publik memanggilnya langsung; dashboard
  menerima hasilnya dari `events.js` dan hanya merender, tanpa aturan sendiri. Spec mengunci keduanya. Yang berbeda hanya
  bingkai, tujuan tombol, dan "Sudah punya". Navbar halaman publik menulis "Dashboard", karena server tidak tahu status
  login; akun yang belum masuk diarahkan ke login oleh `PrivateRoute`.
- **"Yang kamu dapat" otomatis dari jenis halaman:** tiket = sesi live, materi PPT, rekaman; Video kelas = materi PPT dan
  rekaman video webinar. Karena dijanjikan, materi wajib diunggah sebelum Video kelas bisa dijual (form admin, Fase 5).
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
| Durasi video | – | – | Opsional | Halaman |
| Materi PPT | – | Boleh menyusul | Wajib | Dashboard pembeli; dijanjikan di halaman |
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
3. Unggah materi PPT (wajib bila dijual sebagai Video kelas). Opsional: isi durasi video.
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
- **Cegah kursi diborong:** akun gratis tanpa verifikasi bisa menahan kursi 40 menit per akun. Satu pending per akun
  dijaga index; batas per IP lewat aturan rate limiting Cloudflare pada `/api/webinar/checkout` (setelan pemilik produk).
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
- **Pintu sekunder di beranda, bukan kartu produk (3 Nov):** satu baris di kaki `CreateOrderCards`, bergaya sama dengan
  "Chat Mimin": "Webinar: <judul> · <tanggal>". Hanya muncul bila ada tiket atau video yang sedang dijual dan `is_listed`;
  selain itu tidak ada sama sekali. Isinya mengikuti pemilihan hero `_view.js`. Tidak masuk `PRODUCTS`.
- **Baris tiket di kolom utama:** satu baris per tiket untuk acara yang belum lewat (maks. 2), di atas "My Order". Akun tanpa
  tiket tidak melihatnya.
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
  - **Email ke peserta otomatis dengan templat tetap** (diubah 6 Nov): pengingat H-1 lewat cron; email jadwal
    berubah dan pembatalan terkirim sendiri bersama aksi admin. Rinciannya ada di lampiran "Iterasi 6 Nov".
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

> **⚠️ WAJIB DIBAHAS PERTAMA: hosting Video kelas.** Pemilik produk menunda keputusannya ke awal Fase 5 (3 Nov). YouTube
> Developer Policies III.F.3.1 melarang menarik bayaran untuk menonton di pemutar tersemat; usulan pengganti Cloudflare Stream
> + signed URL. Semua rincian YouTube di fase ini menunggu keputusan itu.
>
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
- ~~Pengingat otomatis H-1~~: dipindah ke Fase 3 (6 Nov). Cron tetap dinyalakan **sesudah** endpoint dideploy.
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

---

## Lampiran — Iterasi 6 Nov: Fase 3 (peserta, refund, email otomatis)

### Context
Pemilik produk menyatakan uji Fase 2 lulus (6 Nov) dan meminta lanjut ke Fase 3.

**Tujuan Fase 3:** acara bisa dijalankan tanpa developer.
- Admin bisa melihat dan mengekspor peserta.
- Admin bisa membantu pembeli: kirim ulang e-tiket, cek pembayaran ke DOKU, dan refund.
- Peserta dikabari secara otomatis.

**Email ke peserta otomatis (permintaan pemilik produk, 6 Nov).** Polanya mengikuti notifikasi iklan/Kilat,
bukan tombol kirim manual. Notifikasi iklan/Kilat punya dua jenis:
- **Berdasarkan waktu:** pg_cron + pg_net memanggil Function yang dijaga `?k=CRON_NOTIFY_SECRET`
  (`notify-ad-live.js`, sql/48).
- **Ikut aksi admin:** email terkirim sebagai bagian dari aksinya (`notify-schedule-change.js`,
  `notify-review-result.js`).

Bedanya, satu email iklan hanya untuk satu peneliti, sedangkan satu email webinar untuk banyak peserta. Karena
itu email webinar dikirim lewat antrean di database, bertahap.

### Keputusan pemilik produk (6 Nov)
- **Halaman peserta terpisah,** dibuka dari tombol "Peserta (n)" di kartu acara. Form acara tidak diubah.
- **Email ke peserta otomatis dengan templat tetap.** Admin tidak bisa mengubah teksnya (teks lengkap di bawah).
  - **Pengingat H-1:** satu-satunya pengingat, dikirim lewat cron.
  - **Jadwal berubah:** terkirim sendiri saat admin menyimpan jadwal baru untuk acara yang sudah ada tiketnya.
  - **Pembatalan:** terkirim sendiri saat admin membatalkan acara.
  - **E-tiket:** tetap seperti sekarang, dikirim lewat webhook.
- **Refund:**
  - Tiket langsung tidak aktif, dan kursinya kembali bisa dibeli.
  - Pembeli **tidak** menerima email. Admin mengabari sendiri.

### Keputusan saya (koreksi bila keliru)
- **Penerima email otomatis:** semua tiket live yang lunas, apa pun status izin kontaknya. Ini email layanan
  atas tiket yang sudah dibeli, bukan promosi. Tiket yang sudah di-refund tidak menerima.
- **Pengingat H-1:**
  - Dikirim sekali, 24 jam sebelum acara mulai. Batas terakhirnya 3 jam sebelum mulai; lewat dari itu,
    pengingat dilewati.
  - Pembeli yang lunas kurang dari 6 jam sebelumnya tidak menerimanya, karena e-tiketnya baru masuk.
  - Pengingat dilewati bila email jadwal baru terkirim kurang dari 12 jam sebelumnya.
  - Bila jadwal berubah, pengingat dijadwalkan ulang mengikuti jadwal yang baru.
- **Antrean basi:**
  - Bila jadwal berubah lagi, email jadwal sebelumnya yang masih antre dibatalkan.
  - Bila acara dibatalkan, pengingat dan email jadwal yang masih antre ikut dibatalkan.
  - Email pembatalan hanya terkirim sekali per acara.
- **Gagal kirim:**
  - Galat sementara, termasuk batas harian Cloudflare, diulang otomatis paling banyak 3 kali dengan jeda minimal
    5 menit.
  - Alamat yang ditolak permanen (bounce) tidak diulang.
  - Sisanya tampil "gagal" dengan tombol **Kirim ulang yang gagal**.
- **Nama di layar:** "Email otomatis", bukan "Siaran", karena kata "siaran" sudah dipakai Kilat (sql/130).
- **Refund:** wajib disertai catatan yang hanya terlihat admin. Refund bersifat final dan tidak bisa dibatalkan
  dari layar.
- **Ubah email e-tiket:** ada di dialog Kirim ulang e-tiket, karena checkout menjanjikan "Salah alamat? Hubungi
  admin". Alamat baru juga dipakai untuk email otomatis berikutnya.
- **Uji lokal:** `dev:full` memakai database PRODUKSI, jadi aksi berikut ditolak di localhost dengan `local_test`:
  - kirim ulang e-tiket, Cek ke DOKU, refund, dan Kirim ulang yang gagal;
  - simpan jadwal dan batalkan acara, khusus untuk acara yang sudah ada pesertanya.

  Tujuannya supaya laptop tidak menghasilkan email ke peserta sungguhan. Halaman peserta tetap bisa dilihat di
  lokal.
- **Cakupan peserta:** hanya tiket live. Pembeli rekaman menyusul di Fase 5.

### Temuan produksi 6 Nov (SELECT lewat MCP, baca saja)
- **Check Status DOKU belum pernah berjalan sejak fix 27fc3e5.** `last_status_check_at` terakhir masih
  5 Nov 05:47:03, yaitu klaim yang rusak. Ini dibuktikan lewat langkah Cek ke DOKU di gerbang Fase 3.
- **"Uji Webinar" (`uji-webinar`) tercatat sebagai acara sungguhan.**
  - Datanya: `is_test=false`, `is_listed=true`, Rp 99.999, sedang dijual, mulai 9 Nov 10.00 WIB.
  - Risikonya: begitu saklar masa uji dimatikan, acara ini tampil di `/webinar` dan bisa dibeli.
  - Penanganannya: ops SQL menandainya sebagai acara uji. Sesudah itu acara ini dipakai untuk uji batal + refund,
    lalu dibatalkan.
- **Baris `transactions` WBN-B8F3AAA2 (3 Nov, Rp 1.110, uji) tidak punya order.** Order-nya terhapus oleh
  `ops_webinar_reset_uji_tegar.sql`.
  - Dicatat untuk Fase 4.
  - Skrip reset itu jangan dipakai lagi. Refund menggantikannya, karena akun bisa membeli ulang sesudah refund.
- **Sudah tersedia di produksi:**
  - Empat cron: activate-extends, notify-primary-ads-live, notify-primary-ads-completed, release-expired-slots.
  - pg_net dan vault `cron_notify_secret`.
  - `transactions` tidak punya CHECK pada status, dan kedua trigger penjaganya meloloskan service_role. Jadi
    `refunded` bisa ditulis.
- **Batas pengiriman:**
  - Workers Free mengizinkan 50 subrequest per permintaan, jadi satu panggilan antrean dibatasi paling banyak 30.
  - Kuota harian Cloudflare Email belum diketahui (akun baru dimulai kecil). **Cek di dashboard sebelum acara
    pertama.**

### Visual (HP 375 px + desktop; disetujui lewat pilihan 6 Nov)

**C3. Kartu acara di daftar.** Tombol "Peserta (n)" ditambahkan untuk acara terbit dan batal, tidak untuk draft.
`n` = tiket lunas. Di desktop poster tetap di kiri; di HP tombolnya boleh turun baris.
```
┌───────────────────────────────────┐
│ Olah Data SPSS untuk Skripsi [UJI]│
│ Sel, 17 Nov 2026 · 08.30 WIB      │
│ ● Dijual  Terjual 12 / 25         │
│ [Peserta (12)] [Edit] [Pratinjau] │
│                               [⋯] │
└───────────────────────────────────┘
```

**C4. Halaman Peserta, tampilan HP**
```
← Semua acara
Olah Data SPSS untuk Skripsi    [UJI]
Sel, 17 Nov 2026 · 08.30 WIB · ● Dijual
┌───────────┬───────────┬───────────┐
│ Lunas     │ Ditahan   │ Izin      │
│ 12 / 25   │ 2         │ kontak 8  │
└───────────┴───────────┴───────────┘
Pendapatan Rp 588.000
EMAIL OTOMATIS
  E-tiket         12/12 terkirim
  Pengingat H-1   dijadwalkan
                  Sen, 16 Nov · 08.30 WIB
  Jadwal berubah  10 Nov 09.12
                  11 terkirim · 1 gagal
                  [Kirim ulang yang gagal]
(Lunas 12) (Belum bayar 3) (Refund 1) →
[🔍 Cari nama, email, kode tiket    ]
┌───────────────────────────────────┐
│ Putra Kurniawan       ✓ E-tiket   │
│ tegar@jakpat.net                  │
│ UIU · 7F3A91B2C4 · Izin ✓         │
├───────────────────────────────────┤
│ Sari Wulandari   ⚠ E-tiket gagal  │
│ sari@gmial.com                    │
│ UGM · 91B2C47F3A · Izin –         │
├───────────────────────────────────┤
│ Bima Pratama      ⚠ Bayar dobel   │
│ bima@ui.ac.id                     │
│ UI · C47F3A91B2 · Izin ✓          │
└───────────────────────────────────┘
───────────────────────────────────── (menempel)
[         Ekspor CSV (12)           ]
```

**C4. Halaman Peserta, tampilan desktop (≥ 1024 px).** Klik baris membuka panel detail C5 di kanan.
```
← Semua acara                                                 [Ekspor CSV (12)]
Olah Data SPSS untuk Skripsi  [UJI]
Sel, 17 Nov 2026 · 08.30 WIB · ● Dijual
┌─────────────┬─────────────┬──────────────┬───────────────┐
│ Lunas       │ Ditahan     │ Izin kontak  │ Pendapatan    │
│ 12 / 25     │ 2           │ 8            │ Rp 588.000    │
└─────────────┴─────────────┴──────────────┴───────────────┘
Email otomatis
  E-tiket          12/12 terkirim
  Pengingat H-1    dijadwalkan Sen, 16 Nov · 08.30 WIB
  Jadwal berubah   10 Nov 09.12 · 11 terkirim · 1 gagal   [Kirim ulang yang gagal]
(Lunas 12) (Belum bayar 3) (Refund 1)              [🔍 Cari nama, email, kode   ]
┌────────────────────────────────────────────────────────────────────────────┐
│ Nama                Email e-tiket      Kampus  Kode tiket  E-tiket   Izin  │
│ Putra Kurniawan     tegar@jakpat.net   UIU     7F3A91B2C4  ✓         ✓   ⋯ │
│ Sari Wulandari      sari@gmial.com     UGM     91B2C47F3A  ⚠ Gagal   –   ⋯ │
│ Bima Pratama ⚠Dobel bima@ui.ac.id      UI      C47F3A91B2  ✓         ✓   ⋯ │
└────────────────────────────────────────────────────────────────────────────┘
Chip Belum bayar:  Dewi Lestari · Menunggu bayar, sisa 12 mnt   [Cek ke DOKU]
                   Andi Saputra · Kedaluwarsa 5 Nov 14.10       [Cek ke DOKU]
Chip Refund:       Rina Putri · Refund 7 Nov · "Bentrok jadwal kuliah"
Acara batal:       banner "Acara dibatalkan · email pembatalan 12/12 terkirim"
```
Baris Pengingat H-1 menampilkan salah satu keadaan ini:
- dijadwalkan `<waktu>`
- sedang dikirim x/y
- x/y terkirim, ditambah jumlah yang gagal bila ada
- dilewati: `<alasan>`
- tidak ada penerima
- terlewat
- tanda "—" bila acara sudah lewat atau batal

**C5. Detail peserta.** Tampil sebagai panel di kanan (desktop) atau lembar dari bawah (HP).
```
┌ Putra Kurniawan ──────────────── ● Lunas ┐
│ ⚠ Bayar dobel: akun ini punya 2 tiket     │ ← hanya bila ada alarm
│   lunas. Hubungi pembeli, lalu tandai     │
│   refund salah satunya.                   │
│ Email e-tiket  tegar@jakpat.net           │
│ Akun           tegar@jakpat.net           │
│ WhatsApp       0812 3456 7890             │
│ Kampus         UIU · Teknik · Mahasiswa   │
│ Izin kontak    Ya · 5 Nov, 12.40 WIB      │
│ Kode tiket     7F3A91B2C4                 │
│ Invoice        WBN-E1642A9A-1793856539227 │
│ Dibayar        Rp 49.000 · QRIS           │
│                5 Nov, 12.47 WIB           │
│ Voucher        –                          │
│ Email          E-tiket ✓ 5 Nov 12.48      │
│                Pengingat H-1 ✓ 16 Nov     │
│ [Kirim ulang e-tiket] [Salin link gabung] │
│ ───────────────────────────────────────── │
│ Tandai refund…                    (merah) │
└───────────────────────────────────────────┘
```
- **Order belum bayar:** panel menampilkan invoice, waktu order dibuat, batas link bayar, waktu terakhir dicek ke
  DOKU, dan tombol [Cek ke DOKU]. Kemungkinan hasilnya:
  - "Belum dibayar di DOKU (10.15 WIB)"
  - "Lunas — tiket terbit, e-tiket dikirim"
  - "Baru saja dicek, coba lagi sesudah 1 menit"
  - "DOKU tidak menjawab, coba lagi sebentar"
- **Order refund:** panel menampilkan "Refund 7 Nov, 10.02 WIB oleh product@jakpat.net · Catatan: …", tanpa
  tombol aksi.

**C6. Kirim ulang e-tiket**
```
┌ Kirim ulang e-tiket? ─────────────────────┐
│ E-tiket + kwitansi PDF dikirim ke:        │
│ [tegar@jakpat.net                       ] │
│ Alamat baru juga dipakai email otomatis   │
│ berikutnya untuk peserta ini.             │
│                      [Kembali] [Kirim]    │
└───────────────────────────────────────────┘
```

**C7. Tandai refund** (pilihan pemilik produk 6 Nov)
```
┌ Tandai refund? ───────────────────────────┐
│ Putra Kurniawan · 7F3A91B2C4 · Rp 49.000  │
│ • Tiket langsung tidak aktif; link gabung │
│   berhenti meneruskan ke Zoom.            │
│ • Kursi kembali bisa dibeli.              │
│ • Uang dikembalikan manual di luar sistem.│
│ • Pembeli tidak menerima email; kabari    │
│   sendiri.                                │
│ • Tidak bisa dibatalkan dari layar ini.   │
│ Catatan (hanya admin)*                    │
│ [Bentrok jadwal kuliah                  ] │
│                [Kembali] [Tandai refund]  │
└───────────────────────────────────────────┘
```
Pembeli melihat "Tiket tidak aktif. Hubungi admin bila ada pertanyaan." Teks ini sudah ada di
`WebinarTicketCard`, dan link gabung sudah mengarah ke halaman tiket untuk order yang tidak lunas.

**C8. Dua dialog lama yang teksnya berubah**
```
┌ Jadwal berubah ───────────────────────────┐  ← form acara
│ Tiket sudah terjual ke 12 peserta.        │
│ Sesudah disimpan, mereka otomatis         │
│ menerima email jadwal baru. Tiket tetap   │
│ berlaku.                                  │
│   [Kembali] [Simpan & kabari peserta]     │
└───────────────────────────────────────────┘
┌ Batalkan acara ini? ──────────────────────┐  ← daftar acara
│ Olah Data SPSS untuk Skripsi              │
│ • 12 peserta otomatis menerima email      │
│   pembatalan.                             │
│ • Link bayar yang masih aktif dimatikan.  │
│ • Tindakan ini tidak bisa dibatalkan.     │
│              [Kembali] [Batalkan acara]   │
└───────────────────────────────────────────┘
```
Bila belum ada tiket terjual, baris tentang email tidak tampil.

### Teks email otomatis (templat tetap)
Aturan yang berlaku untuk ketiga templat:
- Sapaannya `Halo {nama}`. Bila nama kosong, dipakai "Kak".
- Jadwal ditulis dalam WIB, lengkap dengan jam selesai.
- Kontak admin: product@jakpat.net.
- Tidak ada kata refund atau "pengembalian dana".
- Link Zoom tidak pernah dicantumkan. Yang dipakai hanya link gabung pribadi.

**Pengingat H-1**. Subjek: `Pengingat: {judul} · {Sel, 17 Nov, 08.30 WIB}`
> Halo {nama}, ini pengingat untuk webinar yang kamu ikuti.
> **{judul}** · Jadwal: Selasa, 17 November 2026 · 08.30–10.00 WIB · Pembicara: {nama, jabatan · …} · Kode tiket: {kode}
> [Gabung ke webinar]
> Ruang dibuka 30 menit sebelum acara. Link ini milikmu pribadi, jadi jangan disebarkan.
> Tambahkan ke Google Calendar · Buka menu Webinar
> Tidak bisa hadir? Tiketmu sudah termasuk rekaman, yang tersedia di menu Webinar setelah acara.
> Ada kendala? Hubungi admin di product@jakpat.net.

**Jadwal berubah**. Subjek: `Jadwal baru: {judul}`
> Halo {nama}, jadwal webinar **{judul}** berubah. Ini jadwal terbarunya:
> Jadwal: Kamis, 19 November 2026 · 13.00–14.30 WIB · Kode tiket: {kode}
> Tiketmu tetap berlaku untuk jadwal baru ini dan sudah termasuk rekaman. Kamu tidak perlu melakukan apa pun.
> [Gabung ke webinar]
> Link gabungmu tetap sama. Tambahkan jadwal baru ke Google Calendar
> Ada kendala? Hubungi admin di product@jakpat.net.

**Pembatalan**. Subjek: `Webinar dibatalkan: {judul}`. Tanpa tombol gabung dan tanpa tautan kalender.
> Halo {nama}, mohon maaf, webinar **{judul}** yang dijadwalkan Selasa, 17 November 2026 · 08.30–10.00 WIB dibatalkan.
> Untuk pertanyaan tentang tiketmu (kode {kode}), hubungi admin di product@jakpat.net.
> Terima kasih atas pengertianmu.

### Data: `sql/135_webinar_operasional.sql`
Berkas ini dijalankan pemilik produk sendiri di SQL Editor; MCP hanya dipakai untuk SELECT.
- **Susunan berkas** mengikuti sql/131 dan sql/134: dry-run, terapkan, verifikasi, lalu rollback.
- **Diuji di PGlite** dengan constraint dan badan fungsi produksi disalin ke prelude. `net.http_post` dan vault
  diganti stub.

**Bagian A: dijalankan sebelum kode di-push**
- **`webinar_orders`:**
  - Kolom baru `refunded_at`, `refunded_by`, dan `refund_note`.
  - CHECK baru: order berstatus refunded wajib punya `refunded_at` dan `refund_note`. Dry-run memastikan belum
    ada baris refunded di produksi.
- **Tabel `webinar_broadcasts`:**
  - Kolom: `id`; `event_id` (FK CASCADE); `kind` (reminder_day | schedule_change | cancellation);
    `event_starts_at`, yaitu jadwal acara saat email masuk antrean; `recipient_total`; `skipped_reason`;
    `created_by` (email admin, NULL = cron); `created_at`.
  - Unik: satu reminder_day per kombinasi acara + jadwal, dan satu cancellation per acara.
- **Tabel `webinar_broadcast_deliveries`:**
  - PK (`broadcast_id`, `order_id`).
  - Kolom: `email`; `status` (queued | sending | sent | failed | skipped); `attempts`; `claimed_at`;
    `retry_after`; `sent_at`; `error`.
  - FK CASCADE ke broadcast dan order, supaya ops yang menghapus order uji tidak terblokir.
- **Hak akses kedua tabel:** RLS ON tanpa policy, `REVOKE ALL` dari PUBLIC/anon/authenticated, `GRANT` ke
  service_role.
- **Hak akses fungsi:**
  - Semua fungsi SECURITY INVOKER, kecuali tick.
  - `REVOKE EXECUTE` dari PUBLIC, anon, dan authenticated; `GRANT` ke service_role.
  - Verifikasi lewat `proacl`, karena pg_default_acl memberi hak otomatis ke setiap fungsi baru.
- **Fungsi `webinar_mark_refunded(order_id, note, admin_email)`:**
  1. Kunci acara, lalu order (urutan yang sama dengan mark_paid).
  2. Hanya order `paid` yang diproses. Order yang sudah refunded idempoten; status lain dijawab `not_paid`.
  3. Ubah order menjadi refunded dan isi kolom refund.
  4. Ubah baris `transactions` (`payment_id` = invoice, `entity_type='webinar'`, `completed`) menjadi
     `refunded`. Bila yang berubah bukan tepat 1 baris, RAISE supaya seluruhnya di-rollback.

  Kursi kembali dengan sendirinya, karena `webinar_offer_state` hanya menghitung order `paid`.
- **Fungsi `webinar_enqueue_broadcast(event_id, kind, created_by)`:**
  1. Kunci acara dan cek keadaannya sesuai jenis email.
  2. Tandai antrean basi `skipped`.
  3. Sisipkan broadcast + deliveries (`queued`) untuk semua tiket live yang lunas.

  Untuk reminder_day, penerimanya hanya yang lunas minimal 6 jam sebelumnya. Bila email jadwal baru terkirim
  kurang dari 12 jam sebelumnya, broadcast dicatat dengan `skipped_reason`.
- **Fungsi `webinar_enqueue_due_reminders()`:** cari acara terbit (live) yang mulai antara 3 dan 24 jam lagi dan
  belum punya reminder_day untuk jadwalnya, lalu masukkan ke antrean.
- **Fungsi `webinar_claim_deliveries(limit)`:**
  1. Tandai `skipped` untuk order yang tidak lagi lunas, serta pengingat/email jadwal milik acara yang batal.
  2. Baris `sending` yang basi lebih dari 10 menit menjadi failed sementara.
  3. Ambil baris `queued`, ditambah baris `failed` dengan `retry_after <= now()` dan `attempts < 3`. Pakai
     `FOR UPDATE SKIP LOCKED`.
  4. Ubah yang terambil menjadi `sending` dengan token `claimed_at`, lalu kembalikan data penerima (email terbaru
     dari order) dan data acara.
- **Fungsi `webinar_record_deliveries(token, results)`:**
  - Mencatat hasil sent atau failed. `retry_after` hanya diisi untuk galat sementara.
  - Hanya menyentuh baris `sending` yang tokennya cocok.
- **Fungsi `webinar_retry_broadcast(broadcast_id)`:** baris failed yang order-nya masih lunas dikembalikan ke
  queued, dengan `attempts` di-reset ke 0.
- **Fungsi `webinar_notify_tick()`:**
  - SECURITY DEFINER, `search_path` public, extensions, vault (pola sql/48).
  - Menjalankan enqueue_due_reminders.
  - Bila ada pekerjaan, memanggil `net.http_post(<webinar_notify_url>?k=<cron_notify_secret>)` dengan timeout
    30 detik.

**Bagian B: dijalankan sesudah deploy, saat endpoint sudah hidup (pelajaran insiden sql/48)**
- `vault.create_secret('https://submit.jakpatforuniv.com/api/notify-webinar', 'webinar_notify_url')`.
- `cron.schedule('webinar-notify', '* * * * *', 'select public.webinar_notify_tick()')`.
- Verifikasi: baris `cron.job` ada, lalu `net._http_response` terbaru bernilai 200. Jangan berhenti di cron.job.

**Ops `sql/ops_webinar_uji_webinar_jadi_uji.sql`** (dengan dry-run + rollback):
- Ubah `uji-webinar` menjadi `is_test=true` dan `is_listed=false`.
- Harganya diturunkan ke Rp 1.000 lewat form.

### Server
- **`functions/api/notify-webinar.js` (baru, dipanggil cron):**
  - Menerima POST. `?k=` harus sama dengan `CRON_NOTIFY_SECRET`; bila tidak, 401. Pola sama dengan
    `notify-ad-live.js`.
  - Menjalankan `dispatchWebinarNotifications`.
- **`functions/api/webinar/_notify.js` (baru):**
  - `dispatchWebinarNotifications({ env, sb, limit: 20 })`: klaim, render, kirim lewat `sendMail` (4 paralel),
    lalu catat hasilnya.
  - Galat permanen (`permanent_bounces`, atau 4xx untuk alamat) tidak diulang.
  - Dipakai oleh cron, oleh aksi simpan jadwal dan batal (`waitUntil`, batch pertama langsung dikirim), dan oleh
    Kirim ulang yang gagal.
- **`functions/api/webinar/_notify-email.js` (baru):**
  - `buildWebinarNotifyEmail({ kind, event, recipient })` menghasilkan teks persis seperti di atas.
  - `escapeHtml` dan `googleCalendarUrl` diekspor dari `_webinar-ticket-email.js`, ditambah
    `formatWibRange(starts_at, duration_minutes)`.
  - meeting_url tidak pernah dibaca.
- **`functions/api/webinar/_checkStatus.js` (baru):**
  - Inti `sync.js` dipindah ke `checkOrderAtDoku({ env, sb, order, statusFilter, now, waitUntil })`.
  - `sync.js` (pemilik order, `status=eq.pending`) dan admin (`status=in.(pending,expired,cancelled)`) memakai
    inti yang sama.
  - Aturan 60 detik dan klaim `last_status_check_at` tidak berubah.
- **`functions/api/doku/_webinar.js`:**
  - `deliverWebinarTicket({ …, resend })`: mode resend tidak mensyaratkan `ticket_email_sent_at=is.null`.
  - Sukses selalu mengosongkan `ticket_email_claimed_at`. Dengan begitu klaim berarti "sedang mengirim", dan klik
    ganda tetap menghasilkan satu email.
  - `accountEmailOf` diekspor.
- **`functions/api/admin/webinar.js`:**
  - Aksi baru ditaruh di `_webinarOps.js`; helper `db`/`refuse` dipindah ke `_webinarDb.js`.

  | Aksi | Isi |
  |---|---|
  | `participants` | Acara + order live, tanpa `payment_url`/`doku_request_id`. `join_url` hanya untuk order lunas. Paginasi per 1000 baris. Disertai broadcast dan deliveries |
  | `participant` | Satu order + email akun (`/auth/v1/admin/users`) |
  | `resend-ticket` | Hanya order lunas dengan acara yang tidak batal. Email baru opsional: PATCH dengan filter `id=eq.` saja, dan barisnya wajib kembali tepat 1. Lalu `deliverWebinarTicket(resend)` |
  | `check-order` | `checkOrderAtDoku` untuk pending/expired/cancelled |
  | `refund` | RPC `webinar_mark_refunded`; `not_paid` → 409 |
  | `email-retry` | RPC `webinar_retry_broadcast`, lalu dispatch lewat `waitUntil` |

  - `save`: sesudah tulisan berhasil, bila jadwal berubah dan sudah ada tiket terjual, masukkan
    `schedule_change` ke antrean dan jalankan dispatch.
  - `cancel`: saat acara berpindah dari published ke cancelled dan sudah ada tiket terjual, masukkan
    `cancellation` ke antrean (unik per acara) dan jalankan dispatch.
  - Di localhost (`webinarLocalOpen`): aksi tulis Fase 3 dijawab 403 `local_test`, begitu juga save jadwal dan
    cancel bila sudah ada tiket terjual.
- **`functions/api/admin/webinarGate.js`:** validasi `orderId` dan `broadcastId` (UUID), `note` (3–500
  karakter), dan `email` (format benar, maksimal 254 karakter).

### Klien
- **`src/utils/webinarParticipants.ts`** (fungsi murni):
  - pengelompokan per chip, statistik, dan pencarian;
  - label e-tiket, alarm, dan belum bayar;
  - status baris "Email otomatis";
  - baris CSV.
- **`src/utils/webinarAdminApi.ts`:** fungsi bertipe untuk aksi-aksi baru.
- **Komponen baru di `src/components/webinar-admin/`:** `WebinarParticipantsPage`, `WebinarParticipantSheet`
  (memakai `ui/sheet`), `WebinarEmailStatus`, `WebinarResendDialog`, dan `WebinarRefundDialog`.
- **Komponen yang diubah:**
  - `WebinarAdminPage`: view `{ kind: 'participants', id }`.
  - `WebinarEventList`: tombol Peserta dan teks dialog Batalkan acara (C8).
  - `WebinarEventForm`: teks dialog Jadwal berubah (C8).
- **CSV** lewat `downloadCsv` (`src/utils/csv.ts`, dengan BOM dan kutip ganda):
  - Kolom: Nama, Email e-tiket, WhatsApp, Kampus, Jurusan, Status, Referral, Izin kontak, Waktu izin (WIB), Kode
    tiket, Invoice, Status order, Harga, Diskon, Voucher, Dibayar (WIB), Kanal, E-tiket terkirim (WIB), Catatan
    refund.
  - Isinya mengikuti chip dan pencarian yang sedang aktif.
  - Nama berkas: `peserta-<slug>-<YYYY-MM-DD>.csv`.
- **Tata letak:** grep `styles.css` untuk setiap utility responsif baru. Jebakan cascade ini sudah kambuh 5 kali.

### Tes
- **`functions/api/admin/webinarOps.spec.js`.** Handler sungguhan dipanggil, dan fetch dirute per URL.
  - Akun bukan admin mendapat 401 tanpa satu pun panggilan REST.
  - Setiap aksi beserta penolakannya.
  - `local_test` di localhost.
  - `save`/`cancel` memasukkan email ke antrean hanya bila sudah ada tiket terjual, dan hanya sesudah tulisan
    berhasil.
  - PATCH email hanya memakai filter `id=eq.`.
  - Respons `participants` tidak memuat `payment_url` maupun `doku_request_id`.
- **`functions/api/webinar/notify.spec.js`:**
  - Rahasia `?k=` yang salah dijawab 401.
  - Urutan klaim → kirim → catat.
  - Galat sementara dibedakan dari galat permanen.
  - Ketiga templat:
    - nama, judul, dan jadwal WIB benar;
    - link gabung pribadi ada, kecuali di email pembatalan;
    - `<script>` di nama atau judul di-escape;
    - tidak ada kata refund atau pengembalian dana;
    - tidak ada meeting_url.
- **`functions/api/doku/webhookWebinar.spec.js`:** resend diuji dengan `postgrestTable`.
  - E-tiket bisa dikirim lagi sesudah terkirim.
  - Dua resend bersamaan menghasilkan satu email.
  - Jalur biasa tetap tidak mengirim ulang.
- **`functions/api/webinar/webinar.spec.js`:** tes sync yang lama tetap hijau sesudah refactor.
- **`src/utils/webinarParticipants.spec.ts`:** pengelompokan, statistik, CSV, dan status pengingat tepat di
  batas 24 jam dan 3 jam.
- **PGlite sql/135:**
  - Refund: order lunas, order yang sudah refund, order belum bayar, dan baris transaksi hilang (harus
    rollback).
  - Enqueue: tiap jenis email, antrean basi, serta aturan 6 jam dan 12 jam.
  - Claim: SKIP LOCKED, status skipped, `retry_after`, dan batas 3 kali.
  - Record: hanya baris dengan token yang cocok.
  - Tick: memanggil stub `net.http_post` hanya bila ada pekerjaan.
  - Hak akses: anon dan authenticated ditolak.

### Urutan kerja
0. **Commit alat uji lokal (`dev:full`)** secara terpisah, saat kamu minta. Ada 14 berkas yang belum di-commit.
1. **SQL.** Siapkan `sql/135`, uji di PGlite, dan siapkan ops SQL. Pemilik produk menjalankan **Bagian A** dan
   ops SQL.
2. **Server** beserta tesnya.
3. **Klien** beserta tesnya.
4. **Gerbang otomatis:**
   - `npx vitest run` hijau, kecuali 2 kegagalan baseline di `respondentsGate.spec.ts`;
   - `npx tsc -p tsconfig.app.json | grep -E "TS2304|TS2552"` kosong.
5. **Cek visual lokal** lewat `pnpm run dev:full`, di HP 375 px dan desktop: kartu, halaman peserta, detail,
   dialog, dan CSV. Aksi tulis harus menampilkan pesan uji lokal.
6. **Commit** saat diminta, disertai `graphify update .`. Pemilik produk push `main` (sekaligus deploy), lalu
   menjalankan **Bagian B** (cron).
7. **Gerbang Fase 3** di produksi (lihat di bawah).
8. **Catatan:** perbarui memory `webinar-jfu-plan-state` dan salinan rencana di
   `docs/superpowers/plans/2026-11-02-webinar-jfu.md`. Catat juga preferensi "email otomatis lebih disukai
   daripada tombol kirim manual".

### Gerbang Fase 3 (produksi, akun uji tegar@jakpat.net)
`uji-webinar-jfu` tetap menjadi acara uji utama. `uji-webinar` (sesudah ops SQL, harga Rp 1.000) dipakai untuk
uji yang mengakhiri acara.
1. **Daftar peserta** `uji-webinar-jfu`: order lunas tampil benar, dan CSV terbuka rapi di Sheets/Excel.
2. **Kirim ulang e-tiket:** email + PDF masuk, dan `ticket_email_sent_at` bergerak. Ubah alamat email: e-tiket
   masuk ke alamat baru. Sesudah itu kembalikan ke alamat semula.
3. **Jadwal berubah dan pengingat:** ubah jadwal `uji-webinar-jfu` menjadi kira-kira 37 jam lagi. Email Jadwal
   berubah harus masuk dalam 1 menit. Kira-kira 13 jam kemudian, Pengingat H-1 harus masuk sendiri, dan status
   "Email otomatis" ikut berubah.
4. **Cek ke DOKU:** beli tiket `uji-webinar`, lalu biarkan belum dibayar lebih dari 60 detik.
   - Cek ke DOKU harus menjawab "Belum dibayar". Ini membuktikan Check Status berjalan; `last_status_check_at`
     ikut bergerak.
   - Sesudah dibayar, order menjadi lunas dan e-tiket terkirim.
5. **Pembatalan:** batalkan `uji-webinar`. Email Pembatalan harus masuk, tanpa link gabung.
6. **Refund:** tandai refund order tersebut.
   - Di menu Webinar pembeli muncul "Tiket tidak aktif".
   - Link gabung tidak lagi meneruskan ke Zoom.
   - Angka Terjual turun.
   - SELECT menunjukkan order dan baris `transactions` berstatus `refunded`.
7. **SELECT akhir:**
   - `webinar_broadcast_deliveries` sesuai dengan email yang dikirim;
   - `net._http_response` bernilai 200;
   - tidak ada baris `sending` yang basi.

### Status per fase (6 Nov)
| Fase | Status |
|---|---|
| 0 | Bagian builder selesai. Izin pembicara, setelan Zoom, dan konten acara 1 ada di pemilik produk. Kuota email Cloudflare dicek di Fase 3 |
| 1 | Live (sql/131, 132, 134) |
| 2 | Lulus uji pemilik produk 6 Nov, masih dalam masa uji. Sisanya: Check Status (gerbang Fase 3 #4) dan `uji-webinar` sebelum rilis. Rilis di tangan pemilik produk: saklar masa uji dimatikan, rate limit, sql/133, acara 1 |
| 3 | Iterasi ini |
| 4–7 | Belum dimulai. Catatan untuk Fase 4: baris transaksi WBN-B8F3AAA2 tanpa order, dan label `refunded` |

---

## Lampiran — Iterasi 6 Nov (2): Fase 4 (pendapatan per produk, pembeli webinar di Customers)

### Context
Pemilik produk menyatakan uji produksi Fase 3 berjalan baik dan sudah menjalankan sql/135b (6 Nov). Cron
`webinar-notify` (jobid 7) jalan tiap menit, semua run sukses. Lanjut ke Fase 4.

**Masalah yang diselesaikan:**
- **Baris webinar tidak tampil di Transaksi.** Query memakai `form_submissions!inner`, jadi uang tiket tidak terlihat di
  halaman keuangan mana pun.
- **Iklan, Kilat, dan Webinar tidak bisa dibedakan** di Transaksi.
- **Status `refunded` (Fase 3) tampil sebagai teks mentah** "refunded".
- **Halaman Customers:**
  - Pembeli webinar akan tampil sebagai "Belum Paid".
  - Halaman itu juga **terpotong di 1.000 baris** tanpa galat: `form_submissions` 1.220 baris dan `get_customer_profiles`
    2.299 baris, keduanya dibaca tanpa paginasi.

**Hasil yang dituju:**
- Admin melihat pendapatan per produk per bulan, dan angkanya cocok dengan SQL.
- Baris webinar tampil berlabel Uji/Refund.
- Pembeli webinar terpisah di Customers.
- **Tanpa SQL baru.**

### Keputusan pemilik produk (6 Nov, lewat pilihan)
- **Transaksi:** pilihan "Chip + dropdown".
  - Chip filter produk menampilkan jumlah transaksi.
  - Angka rupiah per produk ada di dropdown Pendapatan.
- **Customers:** pilihan "Label + tab Webinar".
  - Akun bertiket diberi chip "Webinar".
  - Akun yang hanya membeli webinar pindah ke tab "Pembeli webinar" dan tidak dihitung "Belum Paid".
  - Datanya dari endpoint admin webinar, tanpa SQL.
  - Batas 1.000 baris ikut diperbaiki.
- **Analytics tetap khusus iklan.** `isNotWebinar` di `src/utils/analytics/fetchRevenueData.ts` tidak diubah; hanya
  komentarnya diarahkan ke Transaksi.

### Status gerbang Fase 3 di produksi (SELECT 6 Nov ±06.10 WIB)
- **Terbukti:**
  - Kirim ulang e-tiket (`ticket_email_sent_at` bergerak ke 6 Nov 05.52 WIB).
  - Beli `uji-webinar` dengan voucher: Rp 1.000, `is_test` tercatat di note.
  - Cron berjalan.
- **Belum ada jejak:**
  - Email jadwal berubah, email pembatalan, dan pengingat H-1: nol baris `webinar_broadcasts`.
  - Refund: nol order `refunded`.
  - Cek ke DOKU: `last_status_check_at` masih nilai lama 5 Nov.
- **Pengingat H-1 `uji-webinar` akan terkirim sendiri Minggu 8 Nov ±10.00 WIB** ke tegar@jakpat.net, selama acaranya belum
  dibatalkan. Inilah bukti cron.
- Tidak memblokir Fase 4. Label Refund Fase 4 baru bisa dibuktikan sesudah langkah refund gerbang Fase 3.

### Data produksi (SELECT 6 Nov)
- **`transactions`: 935 baris.** Menurut aturan produk di bawah:

  | Produk | Baris | Lunas | Nilai | Catatan |
  |---|---|---|---|---|
  | Iklan | 899 | 610 | Rp 406.055.298 | 3 di antaranya yatim tanpa order (uji Rp 1.110) dan tetap tersembunyi |
  | Kilat | 32 | 22 | Rp 12.948.150 | |
  | Webinar | 3 | 3 | Rp 3.220 | semuanya uji |

- **Kilat:** `ad_schedules.distribution_type` dan `form_submissions.distribution_type` tidak pernah berbeda (0 dari 931).
- **Embed aman:** `transactions` punya tepat satu FK ke `ad_schedules` (`schedule_id`), jadi embed
  `ad_schedules(distribution_type)` tidak ambigu.
- **CHECK `transactions_webinar_has_no_ad_order`** menjamin baris webinar tanpa order dan tanpa jadwal.
- **Baris webinar:** `payment_url` dan `schedule_id` selalu NULL, jadi tombol Download Invoice / Salin Link / Batalkan
  memang tidak muncul. Tetap dijaga eksplisit dan diuji.
- **Pembeli webinar:** baru tegar@jakpat.net (2 tiket). Akun ini punya 8 pesanan iklan yang belum dibayar, jadi tetap
  "Belum Paid" dengan chip Webinar.

### Aturan (satu pintu, fungsi murni + tes)
- **Produk** `productOfTransaction(t)`:
  - `webinar` bila `entity_type='webinar'`.
  - `kilat` bila `ad_schedules.distribution_type` = `'kilat'`; bila kolom itu kosong, dipakai
    `form_submissions.distribution_type` (aturan `_kilat-paid-alert.js:138`).
  - Selain itu `iklan`, termasuk perpanjangan.
- **Uji** `isTestTransaction(t)`: note JSON dengan `is_test === true`.
  - Hanya penanda eksplisit, yang sejauh ini baru ditulis webinar. Heuristik Rp 10.000 milik Analytics tidak dipakai, jadi
    angka iklan sama persis dengan sebelum deploy.
- **Pendapatan** = `isPaidTx` dan bukan uji.
  - Refund dan uji tidak dihitung.
  - Refund mengurangi bulan pembayaran aslinya, karena yang berubah status adalah baris yang sama.
- **Periode** dihitung menurut WIB (`toWibYmd` dari `utils/airing-window.ts`), bukan jam perangkat. Ini sama dengan kueri
  gerbang.
- **Cakupan angka:**
  - **Daftar** = periode + produk + status + cari. Footer, nilai di tombol Pendapatan, dan rincian per kategori item
    mengikuti cakupan ini.
  - **Chip produk** = periode + status + cari, tanpa produk. Angka chip = jumlah baris yang tampil saat chip itu diklik.
  - **Per produk di dropdown** memakai cakupan chip, dan produk yang aktif ditebalkan. Saat "Semua" aktif, jumlah ketiga
    produk = total.

### Visual (pilihan "Chip + dropdown", 6 Nov)
**C9. Transaksi, desktop**
```
Transaksi │ Wallet
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ November ▾ │ 2026 ▾  [🔍 Cari invoice, judul, nama, email]  PENDAPATAN Rp 12.859.349 ▾ ⚑ ⤓ ⟳ │
│ (Semua 31) (Iklan 28) (Kilat 0) (Webinar 3)                                            │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ TANGGAL    INVOICE             PESANAN                        TOTAL         STATUS  METODE │
│ 6/11/2026  WBN-C416139F-17…    Uji Webinar [Uji]              Rp 1.000      Lunas   QRIS   │
│ 06.04                          Webinar · Putra Kurniawan                                   │
│ 5/11/2026  JFU-…               Survei Kepuasan Mahasiswa      Rp 1.110.000  Lunas   QRIS   │
│ 14.21                          Sari Wulandari                                              │
│ 4/11/2026  JFU-…               Survei Gaya Belajar            Rp 910.200    Lunas   QRIS   │
│ 09.12                          Kilat · Dewi Lestari                                        │
│ 3/11/2026  WBN-…               Olah Data SPSS untuk Skripsi   Rp 49.000     Refund  QRIS   │
│                                Webinar · Rina Putri                                        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Total: 31 transaksi                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- Baris iklan tetap seperti sekarang, tanpa awalan.
- Baris Kilat/Webinar diberi awalan produk di subjudul.
- Chip [Uji] tampil di sebelah judul.
- Kolom "Survei" berganti nama menjadi "Pesanan".

**C9. Transaksi, HP 375 px.** Baris chip bisa digeser ke samping (`overflow-x-auto`, tanpa membungkus).
```
November ▾ │ 2026 ▾
[🔍 Cari invoice, judul, nama, email]
PENDAPATAN Rp 12.859.349 ▾     ⚑ ⤓ ⟳
(Semua 31) (Iklan 28) (Kilat 0) (Webi→
PESANAN                 TOTAL   STATUS
Uji Webinar [Uji]     Rp 1.000  Lunas
Webinar · Putra K. · 6/11/2026
```

**C9. Dropdown Pendapatan** (isinya menggantikan dropdown lama; rincian per kategori tetap ada)
```
┌ BREAKDOWN PENDAPATAN ───────────── [Lunas] ┐
│ Rp 12.859.349                               │
│ PER PRODUK                                  │
│ Iklan                        Rp 12.859.349  │ ← produk aktif ditebalkan
│ Kilat                        Rp 0           │
│ Webinar                      Rp 0 · 3 uji   │
│ ─────────────────────────────────────────── │
│ PER KATEGORI ITEM                           │
│ Jakpat for Universities (ads)   Rp …        │
│ Respondent's Incentive          Rp …        │
│ Transaksi uji dan refund tidak dihitung.    │
└─────────────────────────────────────────────┘
```

**C10. Detail baris webinar.** Footer tidak ditampilkan, jadi tidak ada aksi khusus iklan.
```
┌ Uji Webinar ──────────────────── [Lunas] [QRIS] [Uji] ┐
│ Putra Kurniawan · tegar@jakpat.net                     │
│ TIKET WEBINAR                                          │
│  Acara     Uji Webinar                                 │
│  Jenis     Tiket live                                  │
│  Pembeli   Putra Kurniawan · tegar@jakpat.net          │
│  ⓘ Transaksi uji — tidak dihitung pendapatan.          │
│  Peserta, e-tiket, dan refund dikelola di menu Webinar.│
│ RINCIAN ITEM                                           │
│  Tiket webinar: Uji Webinar  [Webinar]   Rp 1.000 x1   │
│  Catatan: Voucher JFUTGRX (potongan Rp98999)           │
│  TOTAL                                     Rp 1.000    │
│  DPP Rp 901 · PPN 11% Rp 99                            │
│ PEMBAYARAN                                             │
│  No. Invoice  WBN-C416139F-1793919821265  ⧉            │
│  Metode       QRIS                                     │
│  Dibuat       6 Nov 2026 06.04 WIB                     │
└────────────────────────────────────────────────────────┘
```
- **Baris refund:** chip `Refund` (ungu), ditambah kalimat "Ditandai refund di menu Webinar. Uang dikembalikan di luar
  sistem."
- **Baris iklan/Kilat:** bagian "Submission yang Dibayar" dan footernya tidak berubah.

**C11. Customers**
```
Baris:   ● Putra Kurniawan [Webinar]          ← chip untuk setiap akun yang punya tiket
           tegar@jakpat.net · UIU
Filter ⚑: Semua · VIP/VVIP · Returning · Client Baru (Paid) · Belum Paid (Rp 0) · Pembeli webinar (n)

Detail customer, bagian baru:
┌ TIKET WEBINAR (2) ──────────────────────────┐
│ Olah Data SPSS untuk Skripsi [Uji]          │
│ Sel, 17 Nov 2026 · Rp 1.110 · Lunas         │
│ Uji Webinar [Uji]                           │
│ Sen, 9 Nov 2026 · Rp 1.000 · Lunas          │
│ Peserta & refund dikelola di menu Webinar.  │
└─────────────────────────────────────────────┘
```
- **Tier `webinar` ("Pembeli webinar"):** ikon `Presentation`, sama dengan menu admin Webinar.
  - Berlaku hanya untuk akun **tanpa satu pun pesanan iklan** yang punya tiket lunas atau refund.
  - Akun yang punya pesanan iklan tetap di tier lamanya, ditambah chip Webinar.

### Server (tanpa SQL)
- **Aksi baru `buyers`:**
  - `functions/api/admin/webinarGate.js`: tambahkan `buyers` ke `WEBINAR_ADMIN_ACTIONS`.
  - `functions/api/admin/webinar.js`: tambahkan `case 'buyers'`.
  - Isinya di `functions/api/admin/_webinarOps.js`.
- **Isi aksi `buyers`:**
  - Lewat `dbAll` (`_webinarDb.js`):
    `webinar_orders?status=in.(paid,refunded)&auth_user_id=not.is.null&select=id,auth_user_id,event_id,kind,status,amount,paid_at,invoice_number&order=paid_at.desc,id.asc`
    dan `webinar_events?select=id,title,starts_at,is_test`.
  - Membalas `{ tickets: [{ order_id, auth_user_id, kind, status, amount, paid_at, invoice_number, event_title,
    event_starts_at, is_test }] }`.
  - **Tanpa data pribadi pembeli** (nama, email, WA, `join_token`, `payment_url`), karena profilnya sudah ada di Customers.
  - Hanya baca, jadi tidak masuk `LOCAL_BLOCKED_ACTIONS`.

### Klien
- **`src/components/transactions/types.ts`** (fungsi murni):
  - **Tipe `Transaction`** ditambah `entity_type`, `subtotal`, `ppn_amount`, `ad_schedules?: { distribution_type }`, dan
    `form_submissions.distribution_type`. `form_submission_id` menjadi `string | null`.
  - **`parseTransactionNote`** juga mengembalikan `isTest` dan `buyer`. Pemakai lama tidak berubah.
  - **Aturan:** `productOfTransaction`, `PRODUCT_LABELS`, `isTestTransaction`, `isRevenueTx`.
  - **Tampilan:** `transactionTitle`, `transactionPerson`, `transactionEmail`. Judul webinar diambil dari nama item dengan
    awalan `Tiket webinar: ` / `Video kelas: ` dibuang (sql/131, sql/134).
  - **Angka:**
    - `productCounts(rows)`;
    - `revenueByProduct(rows)` → `{ iklan, kilat, webinar, testCount }`;
    - `txMonthWib(t)` → `{ year, month }`.
  - **Status:** `STATUS_CHIPS.refunded = { label: 'Refund', variant: 'purple' }`; `'refunded'` masuk `STATUS_FILTER_IDS`.
  - **Gerbang aksi** dipindah ke sini supaya bisa diuji:
    - `isCancellableInvoice(t, liveIds)`, menggantikan `canCancelInvoice` di halaman;
    - `showsAdPaymentActions(t)`.

    Keduanya menolak produk webinar.
  - **CSV `transactionCsv(rows)`:**
    - Header lama dipertahankan nama dan urutannya, ditambah `Produk` dan `Uji` di ujung.
    - Kolom judul dan peneliti memakai helper tampilan.
    - Diunduh lewat `downloadCsv` (`src/utils/csv.ts`, dengan BOM).
- **`src/components/TransactionsPage.tsx`:**
  - **Query:** `form_submissions(…, distribution_type)` tanpa `!inner`, ditambah `ad_schedules(distribution_type)`, ditambah
    `.or('form_submission_id.not.is.null,entity_type.eq.webinar')`. Saringan ini menjaga 3 baris yatim tetap tersembunyi.
    Ini bacaan, jadi jebakan `or=` pada PATCH tidak berlaku.
  - **Tampilan:**
    - baris chip produk (C9);
    - periode WIB;
    - pencarian juga mencakup email, judul webinar, dan nama/email pembeli, seperti yang dijanjikan placeholder;
    - dropdown Pendapatan dengan bagian per produk (C9);
    - CSV lewat helper.
- **`TransactionListRow.tsx` dan `TransactionDetailSheet.tsx`:** judul dan subjudul lewat helper, chip [Uji], bagian
  "Tiket webinar" (C10), dan footer dijaga `showsAdPaymentActions`.
- **Customers:**
  - **`src/components/CustomersPage.tsx`:**
    - Paginasi lewat `fetchAllRows`: `form_submissions` (urut `created_at desc, id`) dan
      `supabase.rpc('get_customer_profiles').order('id')`.
    - Memanggil `getWebinarBuyers()`. Bila gagal, halaman tetap jalan dan menampilkan `toast.warning` "Data pembeli
      webinar gagal dimuat".
    - Opsi tier baru beserta jumlahnya.
  - **`src/components/customers/types.ts`:**
    - `Customer.webinarTickets`;
    - `attachWebinarTickets(customers, tickets)`, dicocokkan lewat `authUserId`;
    - `customerTier` menambah `'webinar'`.
  - **Tampilan:** `ClientStatusIcon.tsx` (TIER_CONFIG `webinar`), `CustomerListRow.tsx` (chip), dan
    `CustomerDetailSheet.tsx` (bagian C11).
- **`src/utils/webinarAdminApi.ts`:** fungsi `getWebinarBuyers()` beserta tipe `WebinarBuyerTicket`.
- **Tata letak:** grep `styles.css` untuk setiap utility responsif baru. Jangan memasangkan kelas warisan dengan
  varian responsif.

### Tes
- **`src/components/transactions/types.spec.ts`:**
  - **Produk:** webinar; Kilat lewat jadwal; Kilat lewat fallback submission; iklan; perpanjangan.
  - **Uji:** note JSON `is_test` true/false, teks biasa, JSON rusak.
  - **Pendapatan:** uji dan refund tidak dihitung, `paid` dan `completed` dihitung; jumlah per produk = total.
  - **Periode:** batas bulan WIB (31 Okt 23.30 WIB = Oktober; 1 Nov 00.30 WIB = November walau UTC masih 31 Okt).
  - **Tampilan:** judul/pembeli webinar dari note; chip `Refund`, menggantikan contoh fallback lama `'refunded'` di
    baris 49.
  - **Gerbang aksi** menolak webinar.
  - **CSV:** header lama utuh, kolom Produk/Uji di ujung.
- **`src/components/customers/types.test.ts`:**
  - Tiket menempel lewat `authUserId`.
  - Tier: tanpa pesanan + tiket → `webinar`; pesanan iklan belum bayar + tiket → `unpaid`; pesanan lunas + tiket → tier
    lama.
- **`functions/api/admin/webinar.spec.js`:**
  - `buyers`: bukan admin → 401 tanpa panggilan REST.
  - Hanya `paid`/`refunded` dengan akun.
  - Judul dan jadwal acara tergabung.
  - Respons tidak memuat `buyer_email`, `buyer_phone`, `join_token`, atau `payment_url`.
  - Paginasi lewat header Range.

### Keputusan saya (koreksi bila keliru)
- **Uji hanya dari penanda `is_test`.** Transaksi uji iklan lama tetap dihitung seperti sekarang, supaya angka iklan tidak
  bergeser.
- **CSV:** kolom lama tidak diubah dan kolom baru ditaruh di ujung, supaya spreadsheet yang sudah ada tidak bergeser.
  Ditambah BOM supaya nama ber-diakritik terbaca benar di Excel.
- **DPP/PPN** hanya ditampilkan di detail webinar. Detail iklan tidak diubah.
- **Endpoint `buyers` tanpa data pribadi**, dan boleh dipanggil dari localhost karena hanya membaca.
- **Akun tegar tetap "Belum Paid" + chip Webinar** karena punya pesanan iklan. Tab "Pembeli webinar" dibuktikan dengan akun
  kedua atau dengan pembeli sungguhan pertama.

### Urutan kerja
0. **Branch:** kerjakan di `feat/webinar-tiket`, yang saat ini sama dengan main (`6d945e4`).
1. **Helper murni dan tesnya** (transactions, customers), mulai dari tes yang gagal.
2. **Aksi `buyers`** dan spec-nya.
3. **Transaksi:** halaman, baris, dan detail.
4. **Customers:** halaman, chip, tier, dan detail.
5. **Gerbang otomatis:**
   - `npx vitest run` hijau, kecuali 2 kegagalan baseline di `respondentsGate.spec.ts`;
   - `npx tsc -p tsconfig.app.json | grep -E "TS2304|TS2552"` kosong;
   - nol galat baru di berkas yang diubah.
6. **Cek visual** di HP 375 px dan desktop, lewat harness screenshot (`scratchpad/f3`, mock `/rest/v1/*` dan
   `/api/admin/webinar` dengan data contoh). Yang dicek: chip, dropdown, detail webinar, baris refund, chip/tab/detail
   Customers.
7. **Commit** saat diminta, disertai `graphify update .`, lalu merge ke `main` untuk deploy. Tidak ada SQL.
8. **Gerbang Fase 4** di produksi, lalu perbarui memory `webinar-jfu-plan-state` dan salinan rencana di `docs/`.

### Gerbang Fase 4 (produksi)
1. **Transaksi Oktober dan November 2026:** angka chip dan per produk di dropdown sama dengan kueri ini, yang dijalankan
   saat uji (SELECT, boleh lewat MCP).
   ```sql
   with x as (
     select t.amount, t.status, to_char(t.created_at at time zone 'Asia/Jakarta','YYYY-MM') ym,
       case when t.entity_type = 'webinar' then 'Webinar'
            when coalesce(s.distribution_type, fs.distribution_type) = 'kilat' then 'Kilat' else 'Iklan' end produk,
       (t.note like '{%' and coalesce((t.note::jsonb->>'is_test')::boolean, false)) uji
     from transactions t
     left join ad_schedules s on s.id = t.schedule_id
     left join form_submissions fs on fs.id = t.form_submission_id
     where t.form_submission_id is not null or t.entity_type = 'webinar')
   select ym, produk, count(*) baris,
     count(*) filter (where status in ('paid','completed')) lunas,
     coalesce(sum(amount) filter (where status in ('paid','completed')), 0) pendapatan,
     count(*) filter (where status in ('paid','completed') and uji) uji,
     count(*) filter (where status = 'refunded') refund
   from x where ym in ('2026-10','2026-11') group by 1,2 order by 1,2;
   ```
   Acuan 6 Nov 06.10 WIB (angkanya bergerak bila ada transaksi baru):

   | Bulan | Produk | Baris | Lunas | Pendapatan | Uji |
   |---|---|---|---|---|---|
   | Okt | Iklan | 110 | 86 | Rp 48.917.700 | – |
   | Okt | Kilat | 3 | 1 | Rp 910.200 | – |
   | Nov | Iklan | 28 | 18 | Rp 12.859.349 | – |
   | Nov | Webinar | 3 | 0 | Rp 0 | 3 |
2. **Pendapatan November untuk "Semua"** sama dengan angka sebelum deploy, karena webinar uji tidak dihitung.
3. **Baris webinar:**
   - tampil dengan chip [Uji];
   - detailnya tanpa tombol;
   - CSV punya kolom Produk dan Uji, dan terbuka rapi di Sheets/Excel.
4. **Refund:** sesudah langkah refund gerbang Fase 3, barisnya berlabel Refund, tidak dihitung, dan bisa ditemukan lewat
   filter status Refund.
5. **Customers:**
   - Jumlah customer tidak lagi tertahan di sekitar 1.000 akun.
   - Total belanja satu pelanggan lama cocok dengan SQL.
   - Chip Webinar muncul di akun tegar.
   - Tab "Pembeli webinar" dibuktikan dengan akun kedua tanpa pesanan iklan yang membeli tiket uji.
6. **Analytics:** angkanya tidak berubah.

### Sesudah Fase 4
- **Sisa gerbang Fase 3:** jadwal berubah, pembatalan, refund, dan Cek ke DOKU.
- **Fase 5 dibuka dengan keputusan hosting video.** YouTube melarang menarik bayaran untuk menonton di pemutar tersemat;
  usulannya Cloudflare Stream. Sesudah itu, bahas ASCII layar Rekaman, Video kelas, dan menu Webinar lengkap.

### Status per fase (6 Nov)
| Fase | Status |
|---|---|
| 0–2 | Seperti di bawah. Rilis (saklar masa uji, rate limit, sql/133, acara 1) di tangan pemilik produk |
| 3 | Dideploy (`6d945e4`), sql/135 + 135b + ops sudah dijalankan. Gerbang produksi baru sebagian (lihat di atas) |
| 4 | Iterasi ini |
| 5–7 | Belum dimulai |

---

## Lampiran — Iterasi 6 Nov (3): Fase 5A (rekaman & materi di R2)

### Context
- **Fase 4 sudah lolos uji cepat pemilik produk.** Commit-nya `b8e6292` dan `a9c348b` masih di `feat/webinar-tiket`;
  `main` masih di `6d945e4`, jadi belum dideploy. Merge dan deploy bisa dilakukan kapan saja (tanpa SQL), terpisah dari
  Fase 5.
- **Produksi (SELECT 6 Nov):**
  - Hanya ada 2 acara uji: `uji-webinar-jfu` (1 tiket lunas) dan `uji-webinar` (1 tiket lunas). Acara 1 belum dibuat.
  - Kolom rekaman di semua acara kosong.
  - `webinar_broadcasts` masih 0 baris. Sisa gerbang Fase 3 (jadwal berubah, batal, refund, Cek ke DOKU) belum dijalankan.
    Ini tidak memblokir Fase 5.
- **Tujuan Fase 5:** sesudah acara, pemegang tiket bisa menonton rekaman dan mengunduh PPT di menu Webinar, sedangkan
  orang tanpa tiket tidak bisa. Sesudah itu rekaman dijual sebagai Video kelas.
- **Fase 5 dipecah dua:**
  - **5A (iterasi ini):** rekaman untuk pemegang tiket. Ini yang harus siap sebelum H+1 acara 1.
  - **5B (berikutnya):** jual Video kelas. ASCII-nya dibahas dulu sebelum 5B dimulai.
- **Bagian YouTube di rencana induk batal.** Aturan YouTube III.F.3(1), yang dicek ulang ke sumbernya 6 Nov, berbunyi
  "API Clients must not charge users to watch content in an embedded YouTube player".

### Keputusan hosting: Cloudflare R2 (usulan tim dev, saya setuju)
| | **R2 (dipilih)** | Stream (pembanding) |
|---|---|---|
| Biaya | ±Rp 0: gratis 10 GB tersimpan, tanpa biaya bandwidth. Satu rekaman 90 menit ±0,3–1 GB | ±$5/bulan per 1.000 menit tersimpan + $1 per 1.000 menit ditonton |
| Kualitas di HP | Satu kualitas (MP4 apa adanya). Rekaman Zoom kecil karena isinya slide, jadi biasanya lancar di 4G; di sinyal lemah bisa buffering | Kualitas turun-naik otomatis |
| Keamanan link | Link per pembeli kedaluwarsa (3 jam). Selama berlaku, MP4 bisa diunduh (IDM satu klik) lalu disebar | Lebih sulit diunduh, tetapi IDM tetap bisa, dan rekam layar tetap bisa |
| Thumbnail / durasi | Tidak otomatis. Cover memakai poster acara, durasi dibaca browser saat unggah | Otomatis |

Rencana induk sudah menerima risiko kebocoran (dulu: link YouTube bisa didapat dalam dua klik), jadi R2 sepadan untuk
1–2 acara per bulan.

Seluruh urusan penyimpanan ada di satu modul (`_recording.js`). Pindah ke Stream atau vendor DRM nanti hanya mengubah
modul itu dan pemutarnya; layar admin, aturan akses, dan data tetap (dicatat di Fase 7).

### Keputusan pemilik produk (6 Nov)
- **Video disimpan di R2.**
- **Video diunggah langsung dari form acara JFU,** bukan lewat dashboard Cloudflare.
- **Rekaman ditonton di halaman tonton terpisah** (`/dashboard/webinar/tonton/:orderId`).
- **Proteksinya "R2 + penghalang ringan", bukan DRM.**
  - **Risiko yang diterima:**
    - Pemakai IDM tetap bisa mengunduh MP4 bersih dengan satu klik.
    - Rekam layar selalu bisa.
  - **Pilihan yang dibandingkan saat memutuskan:**
    - DRM sungguhan, misalnya VdoCipher (±$129–149/tahun) atau Bunny Enterprise ($99/bulan): file terunduh tidak bisa
      diputar.
    - Stream: tetap bisa diunduh IDM.
  - DRM bisa dipertimbangkan lagi sebelum 5B bila rekaman terbukti beredar.

### Penghalang ringan (pengganti DRM)
- **Tidak ada link MP4 di halaman.** URL video hanya diambil lewat `watch.js` sesudah login, dan tidak pernah ada di HTML,
  email, atau API lain.
- **Link berlaku 3 jam,** jadi link yang disalin lalu dibagikan cepat mati. Pemutar meminta link baru saat habis dan
  melanjutkan dari detik yang sama.
- **Tombol unduh disembunyikan dan klik kanan dimatikan:** `controlsList="nodownload"` dan `onContextMenu` dicegah.
- **Watermark email pembeli:**
  - Isinya email akun pembeli + 4 karakter kode tiket, semi-transparan.
  - Pindah posisi setiap ±45 detik ke satu dari 6 titik acak. Posisinya dari `watermarkSpot(seed, tick)`, fungsi murni
    yang diuji.
  - **Fullscreen** memakai tombol layar penuh milik kita yang membesarkan pembungkus (`container.requestFullscreen()`),
    bukan elemen video, supaya watermark tetap tampil. Fullscreen bawaan dimatikan dengan `controlsList="nofullscreen"`.
  - **Batas yang diterima:** di fullscreen bawaan iPhone, watermark tidak tampil, karena Safari iPhone hanya bisa membuat
    elemen video sendiri layar penuh.
  - Watermark tidak ikut ke file yang diunduh IDM; tujuannya mencegah sebaran rekam layar.
- **Teks halaman tonton:** "Rekaman ini hanya untuk akunmu. Email-mu tampil di video sebagai penanda; jangan unduh atau
  sebarkan."

### Keputusan saya (koreksi bila keliru)
- **Materi PPT/PDF** disimpan di bucket Supabase `webinar-materials` yang sudah ada sejak sql/131 (privat, ≤ 50 MB).
  Pembeli mengunduh lewat signed URL 10 menit. Materi boleh menyusul untuk pemegang tiket, dan wajib ada sebelum Video
  kelas dijual (5B).
- **Email "Rekaman & materi tersedia"** terkirim otomatis sesudah admin menerbitkan rekaman, sekali per tiket.
  - Dikirim lewat cron per peserta dengan penanda `recording_email_sent_at` (Iterasi 4).
  - Penerimanya tiket live yang lunas.
  - Mengganti video sesudah terbit tidak mengirim email lagi.
- **Aturan unggah:**
  - Hanya MP4, maksimal 4 GB.
  - Durasi dibaca browser dari file; file yang tidak bisa dibaca browser ditolak.
  - Diunggah per bagian 50 MB, 3 bagian sekaligus, dan tiap bagian dicoba ulang 3 kali.
  - Tab tertutup berarti mulai ulang. Melanjutkan unggahan yang terputus antar-sesi tidak ada di 5A.
- **Akses rekaman** hanya untuk pemilik order (`auth_user_id`) yang order-nya lunas dan rekamannya sudah terbit:
  - order refund mendapat "Tiket tidak aktif";
  - acara yang batal tidak punya rekaman.
- **Link tonton dan penghalang unduh** mengikuti bagian "Penghalang ringan" di atas.
- **URL R2 hanya keluar dari endpoint tonton yang memeriksa sesi,** tidak pernah ada di email, halaman publik,
  `events.js`, atau `my.js`.
- **Ganti video sesudah terbit boleh.** Objek lama dihapus sesudah objek baru tersimpan. Mengosongkan rekaman yang sudah
  terbit ditolak.
- **Centang wajib sebelum terbit:**
  - izin tertulis pembicara;
  - wajah/nama peserta di sesi tanya-jawab sudah dipotong.

  Centang "video unlisted" dari rencana YouTube dibuang.
- **Uji lokal (`dev:full`, database produksi):**
  - Unggah dan pratinjau boleh.
  - "Terbitkan rekaman" ditolak (`local_test`) untuk acara yang sudah ada tiket lunasnya, karena terbit berarti email ke
    pembeli.

### Persiapan Cloudflare (tim dev, sebelum uji lokal)
1. Aktifkan R2, lalu buat bucket **privat** `jfu-webinar-recordings` tanpa public access maupun r2.dev.
2. Buat R2 API token "Object Read & Write" yang dibatasi ke bucket itu, untuk mendapatkan Access Key ID dan Secret.
3. Isi secret Pages (Production) dan `.dev.vars`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_RECORDINGS_BUCKET`.
4. Pasang CORS bucket. `ETag` wajib terbaca browser untuk menyelesaikan unggahan per bagian.
   ```json
   [{"AllowedOrigins":["https://submit.jakpatforuniv.com","http://localhost:8788"],
     "AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
   ```
5. Opsional: lifecycle "batalkan multipart yang tidak selesai sesudah 1 hari" (bawaan R2 7 hari).

### Visual (HP + desktop). Layout halaman tonton sudah dipilih 6 Nov; sisanya disetujui lewat rencana ini

**C12. Form acara admin, bagian baru "Rekaman & materi"**
- Muncul untuk acara terbit sesudah acara dimulai.
- Di HP satu kolom; di desktop berada di kolom kanan di bawah panel penjualan.
```
REKAMAN & MATERI
┌ Video rekaman ────────────────────────────────┐
│ (kosong)  [ Pilih file MP4 ]   maks. 4 GB      │
│  Tip: rekaman cloud Zoom "speaker view" 720p.  │
├───────────────── saat mengunggah ─────────────┤
│ rekaman-spss.mp4 · 412 MB                      │
│ ███████████░░░░░░░░  58% · sisa ±3 mnt  [Batal]│
│ Jangan tutup tab ini sampai selesai.           │
├───────────────── sesudah selesai ─────────────┤
│ ┌──────────── ▶ pratinjau 16:9 ────────────┐   │
│ └───────────────────────────────────────────┘  │
│ 1 jam 28 mnt · 412 MB · diunggah 18 Nov 09.12  │
│ [Ganti video]                                  │
└────────────────────────────────────────────────┘
┌ Materi (PPT/PDF) ─────────────────────────────┐
│ materi-spss.pdf · 8,2 MB  [Ganti] [Lihat]      │
└────────────────────────────────────────────────┘
┌ Terbitkan ke pemegang tiket ──────────────────┐
│ ☐ Ada izin tertulis pembicara                 │
│ ☐ Wajah/nama peserta di sesi tanya-jawab      │
│   sudah dipotong                              │
│ [Terbitkan rekaman]  → 12 peserta dapat email │
│ ── sesudah terbit ──                          │
│ ✓ Terbit 18 Nov 09.30 · email 12/12 terkirim  │
└────────────────────────────────────────────────┘
```
Status email terbitnya juga tampil di "Email otomatis" di halaman Peserta, sebagai baris "Rekaman tersedia".

**C13. Kartu tiket di menu Webinar** (tiga keadaan sesudah acara)
```
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ Olah Data SPSS    ● Selesai      │ │ Olah Data SPSS    ● Selesai      │
│ Sel, 17 Nov · 08.30 WIB          │ │ Sel, 17 Nov · 08.30 WIB          │
│ Rekaman segera tersedia          │ │ [▶ Tonton rekaman] [⤓ Materi]    │
└──────────────────────────────────┘ └──────────────────────────────────┘
   belum terbit                         terbit (tombol Materi hanya bila ada)
Refund: "Tiket tidak aktif. Hubungi admin bila ada pertanyaan." (tanpa tombol)
```

**C14. Halaman tonton `/dashboard/webinar/tonton/:orderId`** (sesuai pilihan 6 Nov)
```
HP                                   Desktop (≥1024 px)
← Webinar                            ← Webinar
┌──────────────────────────┐         ┌───────────────────────────────┐ ┌ Materi ─────────┐
│ tegar@jakpat.net·7F3A     │         │        tegar@jakpat.net·7F3A   │ │ [⤓ Unduh PPT]   │
│        ▶  (16:9)      [⛶]│         │            ▶  (16:9)       [⛶]│ │ Tentang acara   │
└──────────────────────────┘         └───────────────────────────────┘ │ Sel, 17 Nov     │
Olah Data SPSS untuk Skripsi         Olah Data SPSS untuk Skripsi      │ Dr. Sari, Dosen │
1 jam 28 mnt · Dr. Sari              1 jam 28 mnt · Dr. Sari           └─────────────────┘
[⤓ Unduh materi PPT]                 Rekaman ini hanya untuk akunmu. Email-mu tampil di
Rekaman ini hanya untuk akunmu.      video sebagai penanda; jangan unduh atau sebarkan.
Email-mu tampil di video sebagai
penanda; jangan unduh atau sebarkan.
Ada kendala? Hubungi admin di product@jakpat.net.
```
- Watermark (email·kode) semi-transparan dan berpindah posisi tiap ±45 detik.
- [⛶] adalah tombol layar penuh milik kita: yang dibesarkan pembungkusnya, jadi watermark ikut tampil.
Keadaan lain:
- belum terbit: "Rekaman segera tersedia";
- bukan pemilik: "Rekaman ini untuk pemilik tiket" + link ke `/webinar/<slug>`;
- refund: "Tiket tidak aktif…";
- gagal memuat: "Video belum bisa diputar. Coba muat ulang atau ganti jaringan".

**C15. Menu Webinar: bagian baru "Riwayat pembelian"** (di bawah "Tiket saya")
```
RIWAYAT PEMBELIAN
17 Nov · Olah Data SPSS · Tiket live · Rp 49.000 · Lunas      WBN-E1642A9A…
 3 Nov · Statistik Dasar · Tiket live · Rp 49.000 · Tidak aktif
```
Isinya hanya order lunas dan refund; refund ditulis "Tidak aktif", tanpa kata refund.

**C16. Email "Rekaman & materi tersedia"** (templat tetap, aturan sama dengan templat Fase 3)

Subjek: `Rekaman tersedia: {judul}`
> Halo {nama}, rekaman webinar **{judul}** ({Selasa, 17 November 2026}) sudah bisa ditonton.
> [Tonton rekaman] → /dashboard/webinar/tonton/{orderId}
> Materi presentasi bisa diunduh di halaman yang sama. Masuk dengan akun yang dipakai saat membeli tiket.
> Rekaman ini untuk penggunaan pribadi, jadi jangan disebarkan.
> Ada kendala? Hubungi admin di product@jakpat.net.

Email tidak memuat URL R2 dan tidak menyebut refund.

### Data: `sql/136_webinar_rekaman.sql`
Berkas ini dijalankan pemilik produk di SQL Editor **sebelum push**. Isinya dry-run, terapkan, verifikasi, rollback, dan
diuji di PGlite dengan constraint dan badan fungsi produksi disalin ke prelude.
- **`webinar_events.recording_object_key text`:**
  - CHECK format `^rekaman/[0-9a-f-]{36}/[a-z0-9-]{1,80}\.mp4$`.
  - CHECK `recording_published_at IS NULL OR recording_object_key IS NOT NULL`.
- **CHECK `webinar_events_ready_to_sell`:** cabang replay memakai `recording_object_key`, bukan `youtube_video_id`.
  Dry-run memastikan tidak ada baris yang melanggar.
- **`youtube_video_id` di-DROP** beserta CHECK formatnya (Iterasi 4).
- **Email rekaman tidak memakai antrean.** Isi broadcast (CHECK `recording_ready`, unique index, `CREATE OR REPLACE
  webinar_enqueue_broadcast`) dibuang dari berkas ini. Gantinya dijelaskan di Iterasi (4): kolom penanda,
  `schedule_changed_at`, dan sql/136b.

### Server
- **Dependensi:** tidak ada. Penanda tangan SigV4 ditulis sendiri dengan WebCrypto, karena repo punya dua lockfile (npm +
  pnpm). Hasilnya dikunci dengan contoh resmi AWS. Tidak ada binding baru di `wrangler.toml`.
- **`functions/api/webinar/_recording.js` (baru, satu-satunya modul penyimpanan):**
  - `recordingConfig(env)`: bila secret kurang, aksi rekaman dijawab 503 "Penyimpanan rekaman belum diatur".
  - `objectKey(eventId, fileName)`.
  - Presign: `presignGet(key, seconds)` dan `presignPart(key, uploadId, partNumber)`.
  - Multipart: `createMultipart`, `completeMultipart`, `abortMultipart`.
  - Objek: `headObject` dan `deleteObject`.
  - Semua galat dilempar dengan label.
- **Aksi admin baru** (`webinarGate.js` untuk daftar aksi dan validasi, `webinar.js` untuk switch, isi di
  `_webinarRecording.js` baru):

  | Aksi | Isi |
  |---|---|
  | `recording-upload-start` | `{id, fileName, size}`: MP4 dan ≤ 4 GB. Buat multipart, balas `{key, uploadId, partSize}` |
  | `recording-part-urls` | `{id, key, uploadId, partNumbers[≤20]}`: presigned PUT 2 jam. Key wajib berawalan `rekaman/<id>/` |
  | `recording-upload-complete` | `{id, key, uploadId, parts[{partNumber, etag}], minutes}`: lalu HEAD untuk cek ukuran, lalu PATCH `recording_object_key` dan `recording_minutes` dengan filter `id=eq.` saja dan baris wajib kembali. Sesudahnya objek lama dihapus |
  | `recording-upload-abort` | Batalkan multipart |
  | `recording-preview` | Presigned GET 1 jam untuk pratinjau admin |
  | `materials-save` | `{id, path}`: path wajib `<id>/…` di `webinar-materials` dan berkasnya ada. Lalu PATCH `materials_path` |
  | `recording-publish` | `{id, confirmations}`: wajib ada key dan dua centang. Isi `recording_published_at` sekali; email dikirim cron per peserta (Iterasi 4). Di localhost: 403 `local_test` bila sudah ada tiket lunas |

  `list`/`get` menambah `has_recording`, `recording_minutes`, `recording_published_at`, dan `materials_path`. Key R2
  hanya dikirim ke admin.
- **Endpoint pembeli baru** (Bearer, saklar masa uji `webinarOpenFor` yang sama):
  - **`functions/api/webinar/watch.js`:** `POST {orderId}`.
    - Pemilik dicek lewat `auth_user_id` saja.
    - Order wajib `paid`, dan rekaman wajib terbit. Bila belum, 409 `not_ready`.
    - Order refund dijawab 403 `inactive`; akun lain 404.
    - Membalas `{video_url (presigned 3 jam), expires_at, minutes, has_materials, watermark, event}`.
    - `watermark` berisi email akun dari sesi + 4 karakter kode tiket.
  - **`functions/api/webinar/material.js`:** `POST {orderId}`, syarat sama. Membalas signed URL Supabase Storage 10 menit
    dengan nama berkas unduhan.
- **`my.js` → `buildOrderView`:** menambah `recording: { available, minutes, has_materials }` dan `watch_path`. Tidak
  memuat URL atau key.
- **`_notify-email.js`:** templat `recording_ready` (C16), dengan link ke halaman tonton per order. `order_id` datang
  dari body cron (Iterasi 4).

### Klien
- **`src/utils/webinarRecording.ts` (fungsi murni + pengunggah):**
  - `validateRecordingFile`.
  - `planParts(size)`: bagian 50 MiB yang sama besar kecuali terakhir, ≥ 5 MiB, ≤ 10.000 bagian.
  - `readDurationMinutes(file)`: dari `loadedmetadata`.
  - `uploadRecording(file, api, onProgress, signal)`: 3 bagian paralel, ulang 3 kali per bagian, ETag dari header
    respons, batal lewat `AbortController`.
- **`src/components/webinar-admin/WebinarRecordingPanel.tsx` (C12)** dipasang di `WebinarEventForm.tsx`.
  - Unggah materi lewat `supabase.storage.from('webinar-materials')` dengan path `<eventId>/<nama-aman>`; policy
    product@jakpat.net sudah ada di sql/131.
  - `beforeunload` aktif selama unggahan berjalan.
- **`src/utils/webinarAdminApi.ts`:** fungsi bertipe untuk aksi baru.
- **Dashboard:**
  - **`WebinarTicketCard.tsx` dan `WebinarParts.tsx`:** keadaan C13.
  - **`src/pages/dashboard/webinar/WebinarWatchPage.tsx` (baru, C14):**
    `<video controls controlsList="nodownload nofullscreen" playsInline preload="metadata" poster>` di dalam pembungkus.
    - Pembungkusnya memuat watermark (`watermarkSpot`, berganti tiap ±45 detik) dan tombol [⛶] yang menjalankan
      `requestFullscreen` pada pembungkus. Bila Fullscreen API tidak ada (iPhone), tombol disembunyikan.
    - `onContextMenu` dicegah.
    - Saat `error` pertama, minta URL baru lalu kembali ke `currentTime`.
    - Bila gagal lagi, tampilkan pesan.
  - **Rute** di `src/App.tsx`.
  - **`WebinarHubPage.tsx`:** bagian Riwayat pembelian (C15).
  - **`src/utils/webinarApi.ts`:** `fetchWatch` dan `fetchMaterialUrl`.
- **Tata letak:** grep `styles.css` untuk setiap utility responsif baru, dan pakai pembungkus untuk varian responsif.

### Tes
- **`functions/api/webinar/recording.spec.js`:**
  - Bentuk presigned URL: host `<acct>.r2.cloudflarestorage.com`, bucket/key, `X-Amz-Expires`.
  - XML create/complete multipart terurai benar.
  - Galat berlabel, dan konfigurasi kurang menghasilkan 503.
- **Spec admin:** untuk setiap aksi baru, dengan fetch dirute ke emulator PostgREST dan R2 palsu:
  - bukan admin → 401 tanpa REST;
  - non-MP4, > 4 GB, atau key di luar prefiks acara → 400;
  - complete PATCH hanya `id=eq.`;
  - objek lama dihapus hanya sesudah PATCH sukses;
  - publish wajib key + centang, tanpa memanggil antrean (Iterasi 4);
  - `local_test` bila ada tiket lunas.
- **`watch.spec.js`:**
  - pemilik dapat URL 3 jam, dengan watermark berisi email sesi (bukan email dari body);
  - akun lain 404, refund 403, belum terbit 409.
  - Kebocoran URL: `my.js`, `events.js`, dan HTML halaman publik tidak memuat `r2.cloudflarestorage.com`.
- **`notify.spec.js`:** templat `recording_ready`:
  - link tonton per order;
  - tanpa URL R2;
  - escape `<script>`;
  - tanpa kata refund.
- **`webinarRecording.spec.ts`:**
  - `planParts` (batas 5 MiB, 10.000 bagian, ukuran seragam), validasi file, dan logika ulang dengan fetch palsu;
  - `watermarkSpot`: deterministik per seed dan tick, selalu salah satu dari 6 titik, dan titik berganti antar-tick.
- **PGlite sql/136:**
  - terbit tanpa key ditolak;
  - format kunci;
  - Video kelas dijual wajib punya kunci.

  Bagian email ada di Iterasi (4).

### Urutan kerja
0. **Fase 4:** merge ke `main` dan deploy saat diminta. Tidak bergantung pada 5A.
1. **Tim dev:** persiapan Cloudflare (di atas).
2. **sql/136** dan uji PGlite. Pemilik produk menjalankannya sebelum push.
3. **Server** + tes, lalu **admin** (panel, unggah, materi) + tes, lalu **dashboard** (kartu, halaman tonton, riwayat)
   + tes.
4. **Gerbang otomatis:**
   - `npx vitest run` hijau, kecuali 2 kegagalan baseline `respondentsGate.spec.ts`;
   - `npx tsc -p tsconfig.app.json | grep -E "TS2304|TS2552"` kosong.
5. **Cek visual** di HP 375 px dan desktop lewat harness mock (`scratchpad/f4`).
6. **Uji lokal (`dev:full`):** unggah MP4 uji sungguhan ke `uji-webinar-jfu` lewat form, lalu pratinjau di Chrome dan
   Safari.
7. **Commit** saat diminta (+ `graphify update .`), merge `main`, deploy, lalu gerbang 5A.
8. **Perbarui** memory `webinar-jfu-plan-state` (keputusan R2) dan salinan rencana di `docs/`.

### Gerbang 5A (produksi, acara uji)
1. **Unggah** MP4 uji ±300 MB ke `uji-webinar-jfu` dari form desktop. Progres berjalan, pratinjau bisa diputar, dan durasi
   benar.
2. **Unggah materi PDF,** lalu "Terbitkan rekaman". Dalam 1 menit email "Rekaman tersedia" masuk ke tegar@jakpat.net, dan
   tombolnya membuka halaman tonton.
3. **Putar** di Chrome Android dan Safari iPhone. Lompat ke menit 60 harus jalan. Materi bisa diunduh.
   - Watermark email tampil dan berpindah.
   - Tombol [⛶] membuat layar penuh dengan watermark tetap tampil (Chrome/Android/desktop).
   - Tidak ada tombol unduh dan menu klik kanan.
4. **Akun kedua tanpa tiket** yang membuka URL tonton mendapat "Rekaman ini untuk pemilik tiket". Sumber HTML halaman
   publik, `events.js`, dan `my.js` bebas `r2.cloudflarestorage.com`.
5. **Refund order uji** (sekaligus langkah gerbang Fase 3): halaman tonton menjadi "Tiket tidak aktif".
6. **SELECT:**
   - `recording_object_key` dan `recording_published_at` terisi;
   - `recording_email_sent_at` terisi untuk tiket lunas;
   - `net._http_response` bernilai 200.

### 5B — jual Video kelas (sesudah 5A lulus; ASCII dibahas dulu)
- **Form:** pilihan "Halaman ini menjual: Tiket webinar | Video kelas" (`offer_kind`), dengan aturan rencana induk:
  - Video kelas wajib punya rekaman terbit dan materi.
  - Mengganti pilihan mengosongkan tanggal buka/tutup dan meminta pilihan penjualan lagi.
  - Muncul peringatan bila masih ada tiket untuk acara yang belum lewat.
- **Halaman publik Video kelas:** `_view.js` dan `[[path]].js` sudah mengenal `replay` (manfaat, "Beli rekaman", durasi).
  Tinggal dirapikan dan diuji.
- **Checkout rekaman:**
  - teks tanpa e-tiket;
  - S&K rekaman (penggunaan pribadi, dilarang disebar);
  - bagian Webinar di `terms-conditions.html`.
- **Email "Rekamanmu siap" + kwitansi** untuk pembeli rekaman: `deliverWebinarTicket` menerima `kind=replay` dengan
  templat sendiri.
- **Gerbang 5B:** beli Video kelas dengan akun kedua lalu bisa menonton, dan pemegang tiket melihat "Sudah punya".

### Status per fase (6 Nov)
| Fase | Status |
|---|---|
| 3 | Dideploy. Sisa gerbang: refund dan Cek ke DOKU (bisa sekarang); langkah email diuji ulang sesudah Iterasi (4) |
| 4 | Lolos uji cepat, di branch (`b8e6292`, `a9c348b`), belum dideploy |
| 5A | Kode di branch, belum commit (2405 tes hijau). Dirilis bersama Iterasi (4) |
| Iterasi (4) | Email tanpa tabel antrean, pola iklan. Iterasi ini |
| 5B, 6, 7 | Belum dimulai. Ditambahkan ke Fase 7: pindah ke vendor DRM (VdoCipher/Bunny) bila rekaman terbukti beredar, atau ke Stream bila buffering jadi keluhan |

---

## Lampiran — Iterasi 6 Nov (4): email otomatis tanpa tabel antrean

### Context
- **Pertanyaan pemilik produk:** apakah 4 tabel webinar perlu, karena email iklan/Kilat tidak punya tabel. Dibuktikan dari
  kode dan produksi (SELECT 6 Nov).
- **Cara email iklan/Kilat bekerja:**
  - **Berbasis waktu.** Cron Postgres `notify_primary_ads_live` (tiap 15 menit) dan `notify_primary_ads_completed`
    (harian) memanggil Function **satu kali per penerima** lewat pg_net.
    - Kolom `ad_schedules.live_notified_at` / `completed_notified_at` langsung diisi. Artinya diisi saat permintaan
      diserahkan, bukan saat terkirim.
    - Gagal tidak dicatat dan tidak diulang.
    - Ada batas 7 hari untuk order lama.
  - **Ikut aksi** (submit, tagihan, review, jadwal berubah). Function dipanggil browser dan **tanpa catatan apa pun**.
- **Kenapa webinar Fase 3 punya 2 tabel:** `webinar_broadcasts` + `webinar_broadcast_deliveries`, ditambah 5 fungsi,
  dibuat untuk:
  - ulang otomatis;
  - status per email dan tombol "Kirim ulang yang gagal";
  - kirim per batch (batas 50 subrequest per panggilan Function).

  Batch tidak perlu lagi bila Postgres memanggil Function per penerima seperti iklan.
- **Keputusan pemilik produk 6 Nov: "Pola iklan + catatan gagal".**
  - Kedua tabel antrean 0 baris di produksi, jadi tidak ada data yang hilang.
  - Dikerjakan bersama Fase 5A, karena sql/136 belum dijalankan dan kode 5A belum di-commit.

### Struktur data sesudahnya (dicek ke produksi 6 Nov)
**Tabel webinar berkurang dari 4 menjadi 2. Fungsi database berkurang dari 10 menjadi 5.**

| Tempat | Isi | Perubahan |
|---|---|---|
| `webinar_events` (1 baris = 1 acara) | Halaman: `slug`, `title`, `summary`, `description_blocks`, `speakers`, `poster_url`. Jadwal: `starts_at`, `duration_minutes`. Penjualan: `sales_*`, `price`, `quota`, `status`, `offer_kind`, `is_listed`, `is_test`. Rekaman: `recording_minutes`, `recording_published_at`, `materials_path`. Lainnya: `meeting_url`, `preview_token`, `published_at` | **+** `recording_object_key` (5A), **+** `schedule_changed_at`, **−** `youtube_video_id`. Total 27 → 28 kolom |
| `webinar_orders` (1 baris = 1 pembelian) | Pembeli + izin kontak + S&K, uang (invoice, harga, PPN, voucher), status bayar DOKU, tiket (`ticket_code`, `join_token`), e-tiket (`ticket_email_*`), refund (`refunded_*`) | **+** `reminder_sent_for`, `schedule_email_sent_at`, `cancel_email_sent_at`, `email_error`; `recording_email_sent_at` mulai dipakai. Total 44 → 48 kolom |
| `transactions` (tabel lama) | 1 baris per tiket lunas (`entity_type='webinar'`): sumber halaman Transaksi | Tidak berubah |
| ~~`webinar_broadcasts`~~, ~~`webinar_broadcast_deliveries`~~ | Antrean email | **Dihapus** (0 baris) |
| Penyimpanan berkas | `webinar-public` (poster/foto), `webinar-materials` (materi), R2 `jfu-webinar-recordings` (video, di luar database) | Tidak berubah |
| Fungsi database | `webinar_offer_state`, `webinar_reserve_seat`, `webinar_mark_paid`, `webinar_mark_refunded`, `webinar_notify_tick` (ditulis ulang) | **Dihapus:** `webinar_enqueue_broadcast`, `webinar_enqueue_due_reminders`, `webinar_claim_deliveries`, `webinar_record_deliveries`, `webinar_retry_broadcast` |

Satu baris `webinar_orders` langsung menunjukkan email apa saja yang sudah diterima peserta itu:
- `ticket_email_sent_at` (e-tiket);
- `schedule_email_sent_at`;
- `reminder_sent_for`;
- `cancel_email_sent_at`;
- `recording_email_sent_at`;
- `email_error`.

### Fitur yang hilang dan yang tetap
**Hilang (diterima pemilik produk 6 Nov):**
1. **Ulang otomatis email otomatis yang gagal** (sebelumnya maks. 3 kali, jeda ≥ 5 menit). Akibatnya, bila kuota harian
   Cloudflare habis atau penyedia sedang gangguan, email itu tidak terkirim lagi. Kegagalannya tetap tercatat dan tampil
   di halaman Peserta.
2. **Tombol "Kirim ulang yang gagal"** di halaman Peserta. Gantinya, admin mengabari peserta lewat WA.
3. **Status gagal per jenis email.** Sekarang hanya ada satu catatan galat terakhir per peserta (`email_error`).
4. **Arti "terkirim" berubah menjadi "dikirim",** yaitu sudah diserahkan ke pengirim, sama dengan email iklan. Status
   "sedang dikirim" juga hilang.
5. **Riwayat lengkap pengiriman:**
   - jumlah percobaan;
   - admin mana yang memicu;
   - riwayat perubahan jadwal sebelumnya (hanya perubahan terakhir yang disimpan);
   - alasan pengingat H-1 "dilewati". Aturan 12 jamnya tetap jalan, tetapi alasannya tidak tercatat.
6. **Email yang ikut aksi admin tidak berangkat seketika,** tertunda paling lama ±1 menit.

**Tetap ada:**
- **Keempat email otomatis** (pengingat H-1, jadwal berubah, pembatalan, rekaman tersedia), dengan templat yang sama.
- **Aturannya:**
  - sekali per peserta;
  - diingatkan lagi bila jadwal pindah;
  - aturan 6 jam dan 12 jam;
  - tidak dikirim ke tiket refund.
- **Fitur Fase 2–3 lainnya:** e-tiket + kwitansi + "Kirim ulang e-tiket" (termasuk ganti alamat), Cek ke DOKU, refund,
  CSV, halaman Peserta, dan pemblokiran `local_test`.
- **Seluruh Fase 4 dan 5A.**

**Berubah kecil:** pembeli yang baru membayar sesudah acara dibatalkan (bayar telat, alarm `paid_on_cancelled`) kini ikut
menerima email pembatalan. Sebelumnya tidak, karena daftar penerima dikunci saat acara dibatalkan.

### Perilaku baru
- **Pengirim:** cron `webinar-notify` (jobid 7, tiap menit, perintahnya tidak berubah) memanggil `/api/notify-webinar`
  **sekali per peserta** lewat pg_net. Batasnya 25 panggilan per menit. Kolom penanda di `webinar_orders` langsung diisi
  (pola `notify_primary_ads_live`).
- **Aksi admin** (simpan jadwal, batalkan acara, terbitkan rekaman) tidak lagi mengirim atau mengantrekan apa pun; aksi itu
  hanya mengubah acara. Email berangkat paling lambat 1 menit kemudian.
- **Isi dan penerima dihitung saat dikirim,** jadi email selalu memuat jadwal terbaru. Dua perubahan jadwal sebelum cron
  jalan menghasilkan satu email. Aturan "antrean basi" tidak diperlukan.
- **Gagal kirim:**
  - Function menulis `email_error` di order (jenis, waktu WIB, galat). Email otomatis berikutnya yang sukses
    mengosongkannya.
  - Tidak ada ulang otomatis, dan tombol "Kirim ulang yang gagal" dihapus. Admin mengabari peserta lewat WA.
- **Diterima hilang:**
  - ulang otomatis 3 kali;
  - catatan admin yang memicu email;
  - status "sedang dikirim";
  - arti "dikirim" sama dengan iklan, yaitu sudah diserahkan ke pengirim.

**Aturan per jenis.** Berlaku untuk order `paid` dengan `kind='live'`. Paling banyak satu email per order per menit,
dengan urutan prioritas sesuai urutan tabel:

| Jenis (templat tetap) | Dikirim bila | Penanda di `webinar_orders` |
|---|---|---|
| Pembatalan | acara `cancelled`, `starts_at > now() − 7 hari`, penanda kosong | `cancel_email_sent_at` |
| Jadwal berubah | acara `published`, `offer_kind='live'`, belum mulai; `schedule_changed_at` terisi; order lunas sebelum `schedule_changed_at`; penanda kosong atau lebih lama dari `schedule_changed_at` | `schedule_email_sent_at` |
| Pengingat H-1 | acara `published` live; sekarang di [mulai − 24 jam, mulai − 3 jam); penanda ≠ `starts_at`; lunas ≥ 6 jam lalu | `reminder_sent_for` = `starts_at`. Jadwal pindah berarti diingatkan lagi |
| ↳ dilewati | syarat pengingat terpenuhi, tetapi `schedule_email_sent_at` < 12 jam lalu → ditandai tanpa dikirim | `reminder_sent_for` |
| Rekaman tersedia | acara `published`, `recording_published_at` terisi dan > `now() − 7 hari`, penanda kosong | `recording_email_sent_at` (kolom sql/131 yang dipakai lagi) |

### Data: sql/136 dipecah dua, mengikuti pola 135/135b
**`sql/136_webinar_rekaman.sql`: Bagian A, dijalankan sebelum push, hanya menambah**
- **Isi Fase 5A tetap:** `recording_object_key` dengan 2 CHECK, dan `webinar_events_ready_to_sell` memakai kunci itu.
- **`youtube_video_id` beserta CHECK formatnya di-DROP.** Dry-run memastikan semua nilainya NULL; kodenya sudah tidak
  memakai kolom ini.
- **`webinar_events.schedule_changed_at timestamptz`** diisi server saat jadwal acara yang sudah terjual berubah.
- **`webinar_orders`** mendapat `reminder_sent_for`, `schedule_email_sent_at`, `cancel_email_sent_at` (timestamptz), dan
  `email_error text`.
- **Dibuang dari versi lama sql/136:** CHECK `recording_ready`, unique index broadcast, dan `CREATE OR REPLACE
  webinar_enqueue_broadcast`.
- **Tabel dan fungsi antrean lama tidak disentuh.** Kode Fase 3 yang sedang live masih memakainya sampai deploy.

**`sql/136b_webinar_email_tanpa_antrean.sql`: Bagian B, dijalankan segera sesudah deploy**
1. **Salin jejak lama** dari deliveries yang `sent`:
   - `reminder_day` → `reminder_sent_for = event_starts_at`;
   - `schedule_change` → `schedule_email_sent_at`;
   - `cancellation` → `cancel_email_sent_at`;
   - `schedule_changed_at` acara diisi dari broadcast `schedule_change` terakhir.

   Ini mencegah pengingat dobel bila H-1 `uji-webinar` (8 Nov ±10.00 WIB) sudah terkirim lewat sistem lama.
2. **`DROP` + `CREATE webinar_notify_tick()` versi baru,** `RETURNS integer`:
   - SECURITY DEFINER, `search_path` = public, extensions, vault (pola sql/48).
   - Diawali `pg_try_advisory_xact_lock`, supaya tick yang tumpang tindih tidak mengirim dobel.
   - Langkahnya:
     1. Tandai H-1 yang dilewati.
     2. Pilih ≤ 25 order jatuh tempo lewat satu SELECT dengan `CASE` prioritas.
     3. `net.http_post` dengan body `{order_id, kind}`, timeout 10 detik.
     4. Isi penanda.
   - Hak: REVOKE dari PUBLIC, anon, authenticated, dan service_role (sama dengan sekarang). Verifikasi `proacl`.
3. **DROP** `webinar_enqueue_broadcast`, `webinar_enqueue_due_reminders`, `webinar_claim_deliveries`,
   `webinar_record_deliveries`, `webinar_retry_broadcast`, `webinar_broadcast_deliveries`, dan `webinar_broadcasts`.
4. **Verifikasi + rollback.** Rollback berarti menjalankan ulang objek antrean sql/135 dan tick lama.

**Kenapa dipecah dua:** tick baru mengirim body `{order_id, kind}`. Bila tick baru jalan sebelum kode baru terpasang,
penanda terisi tetapi email tidak terkirim, persis insiden sql/48. Antara deploy dan Bagian B, email webinar hanya
tertunda, tidak hilang, karena penanda belum diisi.

**Uji PGlite** (`scratchpad/pglite131/run136.mjs`, di atas sql/131–135 dengan stub pg_net/vault):
- Setiap jenis email, aturan 6 jam, aturan 12 jam, dan pengingat ulang sesudah jadwal pindah.
- Jadwal berubah: sekali per perubahan, dan tidak dikirim ke pembeli yang membeli sesudahnya.
- Refund tidak dikirimi; batas 7 hari; maksimal 25 per tick; isi body `http_post`; kunci advisory.
- Salin jejak lama, objek lama hilang, `proacl` tick, anon ditolak, serta rollback A dan B.

### Server
- **`functions/api/webinar/_notify.js`** ditulis ulang menjadi `sendOrderNotification({ env, sb, orderId, kind })`:
  - Baca order + acara (service role).
  - Lewati bila keadaannya sudah tidak cocok, misalnya refund, atau jenisnya tidak sesuai status acara.
  - Render dengan `buildWebinarNotifyEmail`; templatnya tidak berubah.
  - Kirim dengan `sendMail`.
  - Gagal → PATCH `email_error`, filter `id=eq.` saja, dan barisnya wajib kembali. Sukses → `email_error` dikosongkan
    bila terisi.
- **`functions/api/notify-webinar.js`:**
  - Tetap memakai gerbang `?k=`.
  - Body `{order_id (UUID), kind}` divalidasi.
  - Membalas 200 `{sent | skipped}`, atau 502 bila penyedia email gagal.
- **`functions/api/admin/webinar.js`:**
  - `save` menulis `schedule_changed_at: now` di PATCH yang sama bila acara terbit, terjual, dan jadwalnya berubah.
  - `cancel` tanpa notifikasi.
  - Respons `notify_scheduled: <tiket lunas>`.
  - `local_test` tetap berlaku untuk jadwal/batal acara terjual.
- **`functions/api/admin/_webinarOps.js`:**
  - Hapus `notifyParticipants`, `kickDispatch`, dan `retryEmail`.
  - `participants` membalas `{event, orders}`; `ORDER_COLUMNS` + kolom penanda + `email_error`.
  - `LOCAL_BLOCKED_ACTIONS` tanpa `email-retry`.
- **`_webinarRecording.js` `publishRecording`:** hanya mengisi `recording_published_at`, ditambah `notify_scheduled`.
- **`webinarGate.js`:** aksi `email-retry` dan validasi `broadcastId` dihapus.

### Klien
- **`src/utils/webinarParticipants.ts`:**
  - Hapus tipe dan fungsi broadcast (`AdminBroadcast`, `AdminDelivery`, `broadcastSummary`, …).
  - Tambah kolom order/acara.
  - Fungsi murni baru: `reminderStatus(event, orders, now)`, `noticeStatus(kind, event, orders)`, `failedEmails(orders)`,
    dan `emailHistoryFor(order, event)`.
- **`WebinarEmailStatus.tsx`:**
  - Baris: E-tiket, Pengingat H-1, Jadwal berubah, Pembatalan, dan Rekaman tersedia, misalnya
    "10 Nov 09.12 · 11/12 dikirim".
  - Ditambah "⚠ n email gagal — lihat peserta", tanpa tombol Kirim ulang.
  - Keterangan: "Dikirim otomatis tiap menit. Email yang gagal tidak diulang; kabari pesertanya."
- **Komponen lain:**
  - `WebinarParticipantsPage.tsx`: retry dihapus.
  - `WebinarParticipantSheet.tsx`: riwayat diambil dari kolom, ditambah `email_error`.
  - `webinarAdminApi.ts`: `retryEmail` dan tipe broadcast dihapus; `notify_scheduled` ditambah.
- **Toast** di `useWebinarEditor.ts`, `WebinarAdminPage.tsx`, dan `WebinarRecordingPanel.tsx`:
  "Email ke n peserta berangkat dalam ±1 menit".

**C4' "Email otomatis" di halaman Peserta** (pengganti bagian itu di C4; HP = baris ditumpuk)
```
EMAIL OTOMATIS                       dikirim otomatis tiap menit
  E-tiket          12/12 terkirim
  Pengingat H-1    dijadwalkan Sen, 16 Nov · 08.30 WIB
                   (di jendela: 9/12 dikirim · 3 menyusul)
  Jadwal berubah   10 Nov 09.12 · 12/12 dikirim        ← hanya bila pernah berubah
  Pembatalan       12/12 dikirim                        ← hanya bila acara batal
  Rekaman tersedia 18 Nov 09.30 · 12/12 dikirim         ← hanya bila rekaman terbit
  ⚠ 1 email gagal · lihat peserta (Sari Wulandari)
  Email yang gagal tidak diulang; kabari pesertanya lewat WA.
```
Panel detail peserta (C5), bagian Email:
"E-tiket ✓ 5 Nov 12.48 · Jadwal berubah ✓ 10 Nov 09.13 · Pengingat H-1 ✓ 16 Nov 08.31", ditambah baris merah
`email_error` bila ada.

### Tes
- **`notify.spec.js`:**
  - Endpoint: 401, 400, 200, dan 502.
  - Keadaan tak cocok dilewati.
  - `email_error` ditulis dan dikosongkan dengan filter id saja.
  - Templat yang sudah ada tetap diuji.
- **`webinar.spec.js` (admin):**
  - `schedule_changed_at` hanya diisi saat tiket terjual dan jadwal berubah.
  - Tidak ada RPC antrean di save, cancel, maupun publish rekaman.
  - `email-retry` → 400.
  - Bentuk `participants`.
- **`webinarParticipants.spec.ts`:** status dari kolom, batas 24 jam dan 3 jam, serta riwayat per peserta.
- **Gerbang otomatis:**
  - vitest hijau, kecuali 2 kegagalan baseline `respondentsGate.spec.ts`;
  - grep tsc TS2304/TS2552 kosong;
  - cek visual halaman Peserta (HP 375 px + desktop) lewat harness mock.

### Urutan rilis
1. **Kerjakan** di `feat/webinar-tiket` bersama kode 5A, yang belum di-commit.
2. **Commit** saat diminta (+ `graphify update .`).
3. **Pemilik produk menjalankan sql/136 (A).**
4. **Merge ke `main`, `git pull`, lalu push** (Fase 4 + 5A + iterasi ini).
5. **Segera jalankan sql/136b (B),** lalu cek `net._http_response`.
6. **Perbarui** memory `prefers-automatic-notifications` dan `webinar-jfu-plan-state`, serta salinan rencana di `docs/`.

### Gerbang (menggantikan langkah email di gerbang Fase 3 dan Fase 5A)
1. **Jadwal berubah:** ubah jadwal `uji-webinar-jfu` yang sudah terjual. Dalam ≤ 2 menit email "Jadwal baru" masuk,
   `schedule_email_sent_at` terisi, dan `net._http_response` bernilai 200.
2. **Pengingat H-1** masuk sendiri di jendela 24–3 jam, dan `reminder_sent_for` = `starts_at`.
3. **Batal:** batalkan `uji-webinar`.
   - Email pembatalan masuk dan `cancel_email_sent_at` terisi.
   - Sesudah itu tidak ada email jenis lain ke acara ini.
4. **Rekaman:** terbitkan rekaman.
   - Email "Rekaman tersedia" masuk dan `recording_email_sent_at` terisi.
   - Mengganti video tidak mengirim email lagi.
5. **SELECT:** tabel `webinar_broadcasts*` sudah tidak ada, dan cron jobid 7 tetap jalan tanpa galat.

---

## Lampiran — Iterasi 6 Nov (5): Fase 5B (jual Video kelas)

**Keputusan selama pengerjaan (6 Nov malam):**
- **Ubah jenis tanpa pilihan penjualan:** server menolak dengan `sales_choice_required`, sesuai rencana. Form selalu mengirim pilihan
  penjualan lengkap saat jenis berubah; pilihan bawaannya Belum ditentukan.
- **Acara tiket terbit yang belum berlangsung** (pasti tanpa tiket, karena yang bertiket ditolak) juga kehilangan jadwal, kuota, dan
  Zoom saat diubah menjadi Video kelas. Tanpa ini halamannya menulis "Direkam" dengan tanggal yang belum terjadi.
- **Halaman tonton:** penolakan membawa `kind`, jadi pembeli video yang di-refund melihat "Akses video ini tidak aktif", bukan
  "Tiket tidak aktif".
- **Kepala halaman Peserta dan kartu daftar** Video kelas menulis "Direkam …", bukan jam live.

### Context
- **5A + Iterasi (4) sudah dideploy** (`40d8d97` + `9a9caec`), sql/136 + 136b live, R2 terpasang.
  Verifikasi 6 Nov ±20.40 WIB (SELECT):
  - Unggahan lewat form mengisi `recording_object_key` di `uji-webinar` (video 5 detik → `recording_minutes` 1).
    Server baru menulis kolom ini sesudah HEAD R2 lolos, jadi kunci, bucket, dan CORS (ETag) sudah benar.
  - "Terbitkan rekaman" dijalankan pukul 20.31 WIB. Hasilnya:
    - `recording_email_sent_at` terisi 20.32;
    - `net._http_response` 200 `{"sent":true}`;
    - `email_error` kosong;
    - cron jobid 7 jalan 360 kali dalam 6 jam, semuanya sukses.

    Penerimanya hanya order uji milik tegar@jakpat.net.
  - **Belum terbukti.** Uji manual ini dijalankan pemilik produk, paralel dengan 5B:
    - email masuk inbox dan tombolnya membuka halaman tonton;
    - unggahan multi-bagian (≥150 MB lewat "Ganti video"), yang sekaligus menguji bahwa ganti video tidak mengirim email;
    - materi PDF;
    - menonton di Chrome Android dan Safari iPhone;
    - akun lain;
    - refund.
- **Pemilik produk memilih 5B sebelum Fase 6** (6 Nov).
- **Tujuan 5B:** rekaman dijual sebagai Video kelas, dari dua sumber:
  - acara yang sudah lewat (halaman yang sama berubah jenis, URL tetap);
  - kelas tanpa sesi live.
- **Sudah ada sejak Fase 1–2** (dipetakan 6 Nov):
  - **DB:**
    - `offer_kind` live|replay.
    - `webinar_offer_state`: Video kelas tanpa kuota dan tanpa tutup otomatis.
    - `webinar_reserve_seat`: `already_owned` bila akun punya tiket live atau rekaman yang lunas; tanpa tahan kursi.
    - `webinar_mark_paid`: item "Video kelas: …"; `ticket_code` untuk semua jenis.
    - CHECK `ready_to_sell`: Video kelas wajib punya rekaman terbit (sql/136).
  - **Halaman publik:** `_view.js` + `[[path]].js` sudah punya manfaat, tombol "Beli rekaman", "▶ n menit", dan bagian
    "Video kelas" di `/webinar`.
  - **Checkout:** sebagian ("Konfirmasi pembelian", "Bukti pembelian…").
  - **Akses tonton** (`_recordingAccess.js`): tidak bergantung jenis order.
  - **Label "Video kelas"** sudah ada di Riwayat pembelian, Transaksi, dan Customers.
  - **S&K §12** sudah mencakup Video kelas.
- **Belum ada:**
  1. **Form admin:** pilihan jenis halaman. Server masih menolak `offer_kind`.
  2. **Email untuk pembeli video:** belum ada sama sekali, karena `deliverWebinarTicket` hanya mengklaim `kind=eq.live`.
  3. **Halaman Peserta:** query masih `kind=eq.live`.
  4. **Teks khusus video** di halaman publik, checkout, kartu, dan dialog admin.
  5. **Kwitansi:** memakai `starts_at`. Bila kosong, tercetak 1 Jan 1970.
  6. **Angka terjual Video kelas:** `webinar_offer_state.sold` hanya menghitung tiket live, jadi selalu 0 untuk Video kelas.
- **SQL:** tanpa migrasi. Hanya satu ops SQL kecil untuk acara uji.

### Keputusan pemilik produk (6 Nov, lewat pilihan)
- **Ubah ke Video kelas ditolak sampai acara selesai** bila sudah ada tiket terjual atau kursi ditahan.
  - Ini mengetatkan rencana induk, yang sebelumnya cukup memberi peringatan.
  - Alasannya: halaman Video kelas menghentikan pengingat H-1 dan email jadwal, karena keduanya hanya untuk
    `offer_kind='live'`.
  - Draft dan acara tanpa tiket terjual bebas diubah.
- **Video kelas tanpa sesi live diterbitkan dalam dua langkah:**
  1. "Terbitkan rekaman" di panel Rekaman, dengan dua centang. Tidak ada email karena belum ada pembeli.
  2. Terbitkan halaman.
- **Halaman Peserta memakai satu daftar + label "Video kelas".** Ringkasan memisahkan Tiket live (x/kuota) dan Video kelas
  (n). CSV mendapat kolom Jenis.

### Keputusan saya (koreksi bila keliru)
- **Arah ubah jenis:**
  - Halaman yang sudah terbit hanya bisa Tiket → Video kelas.
  - Video kelas yang sudah terbit tidak bisa kembali menjadi Tiket.
  - Draft bebas dua arah.
- **Isian saat ubah jenis:**
  - Draft → Video kelas mengosongkan Mulai, Durasi, Kuota, dan Link Zoom.
  - Acara terbit yang diubah tetap menyimpan Mulai dan Durasi, yang tampil sebagai "Direkam <tanggal>".
- **Ubah jenis selalu meminta pilihan penjualan lagi.** Tanggal buka/tutup dikosongkan, dan ini ditegakkan server, bukan
  hanya form. Harga terbawa dan boleh diubah.
- **Syarat Video kelas dijual** (Sekarang/Pada tanggal): judul, ringkasan, poster, deskripsi, minimal 1 pembicara, harga,
  rekaman terbit, dan materi.
- **"Batalkan acara" tidak berlaku untuk Video kelas** (409, dan menunya disembunyikan).
  - Membatalkan berarti email "Webinar dibatalkan" ke pemegang tiket, dan rekaman hilang dari mereka.
  - Untuk berhenti menjual, pakai Tutup penjualan.
- **Email pembeli video:** "Rekamanmu siap" + kwitansi lewat jalur e-tiket.
  - Kolom `ticket_email_*`, klaim, dan Kirim ulang dipakai untuk kedua jenis.
  - Pemegang tiket live tetap menerima "Rekaman tersedia" dari cron. Pembeli video tidak, karena sudah mendapat email
    pembelian.
- **Pemegang tiket live yang menekan "Beli rekaman"** dibawa ke kartunya (aturan `already_owned` yang sudah ada).
  - Halaman Video kelas hasil ubah jenis menulis "Sudah punya tiket acara ini? Rekamannya sudah ada di menu Webinar".
- **Menu Webinar:** judul "Tiket saya" menjadi "Tiket & video saya".
- **S&K:** §12 sudah mencakup Video kelas, jadi `TERMS_VERSION` tetap. Yang berbeda per jenis hanya kalimat centang di
  checkout.
- **Angka terjual Video kelas** dihitung di aksi admin `list` lewat satu query order lunas. `webinar_offer_state` tidak
  diubah.
- **Pilihan jenis** ditaruh paling atas di form, lebar penuh, di HP maupun desktop.

### Visual (HP + desktop)

**C17. Form acara: pilihan jenis (paling atas)**
```
HALAMAN INI MENJUAL
( ● Tiket webinar )( ○ Video kelas )
Tiket: sesi live + rekaman + materi. Video kelas: rekaman + materi, tanpa sesi live.
```
- **Acara terbit, sudah ada tiket, belum selesai:** Video kelas abu-abu, dengan keterangan "Video kelas bisa dipilih
  sesudah acara selesai: Sel, 17 Nov · 10.00 WIB (12 tiket terjual)."
- **Video kelas sudah terbit:** Tiket webinar abu-abu, dengan keterangan "Video kelas yang sudah terbit tidak bisa kembali
  menjadi tiket."
- **Draft:** pindah jenis langsung, tanpa dialog.

Dialog untuk acara terbit yang sudah selesai:
```
┌ Ubah jadi Video kelas? ─────────────────────┐
│ • Tombol halaman menjadi "Beli rekaman".     │
│   URL tetap: /webinar/olah-data-spss         │
│ • 12 pemegang tiket tetap bisa menonton dan  │
│   tidak perlu membeli lagi.                  │
│ • Pilih lagi kapan penjualan dibuka; tanggal │
│   buka/tutup lama dikosongkan.               │
│ • Tersimpan setelah [Simpan perubahan].      │
│          [Kembali] [Ubah jadi Video kelas]   │
└──────────────────────────────────────────────┘
```
Kolom kanan saat Video kelas dipilih (di HP ditumpuk). Mulai, Durasi, Kuota, dan Link Zoom disembunyikan:
```
PENJUALAN
 Penjualan dibuka   ○ Sekarang  ○ Pada tanggal  ○ Belum ditentukan  ○ Ditutup
 Penjualan ditutup  ☑ Tidak ditutup
 Direkam            Sel, 17 Nov 2026              ← hanya hasil ubah jenis
HARGA
 Harga [Rp 49.000]  = Rp 44.144 + PPN Rp 4.856
REKAMAN & MATERI · wajib untuk Video kelas         ← tampil juga saat draft
 Video   rekaman-spss.mp4 · 88 mnt   [Ganti]
 Materi  materi-spss.pdf             [Ganti]
 ┌ Terbitkan rekaman ────────────────────────┐
 │ ☑ Ada izin tertulis pembicara             │
 │ ☑ Wajah/nama peserta sudah dipotong       │
 │ [Terbitkan rekaman]    belum ada pembeli  │
 └───────────────────────────────────────────┘
```
- Bar bawah: [Terbitkan: langsung dijual].
- Bila isian kurang, muncul "Video rekaman belum terbit" atau "Materi belum diunggah"; panel Rekaman ditandai merah dan
  halaman menggulir ke sana.

**C18. Kartu di daftar acara admin**
```
│ Olah Data SPSS untuk Skripsi  [Video kelas]   │
│ ● Dijual · Terjual 5 video · 12 tiket live    │
│ [Peserta (17)] [Edit] [Pratinjau]        [⋯]  │   ⋯ = Salin link · Tutup penjualan (tanpa Batalkan)
```

**C19. Halaman publik Video kelas**
Di HP, info ada di bawah judul dan tombol di bar bawah. Di desktop, info dan tombol ada di kartu kanan, sama dengan
rancangan A2.
```
[poster 16:9]
Olah Data SPSS untuk Skripsi
Ringkasan…
🎬 Video kelas · ▶ 88 menit
📅 Direkam Sel, 17 Nov 2026           ← hanya bila ada tanggal acara
💻 Tonton kapan saja di menu Webinar
Tentang webinar ini … · Pembicara …
Yang kamu dapat: • Rekaman video webinar • Materi PPT
Sudah punya tiket acara ini? Rekamannya sudah ada di menu Webinar,
tidak perlu membeli lagi.             ← hanya hasil ubah jenis
Ada kendala? Hubungi admin di product@jakpat.net.
──────────────────────────────────────── (menempel di HP)
Rp 49.000                        [Beli rekaman]
```
`/webinar` tidak berubah: bagian "Video kelas", dan Video kelas menjadi hero bila tidak ada tiket live.

**C20. Checkout Video kelas** (yang berbeda dari checkout tiket)
```
Konfirmasi pembelian
[poster] Olah Data SPSS…  · Video kelas · 88 menit
Rp 49.000 · sudah termasuk PPN 11%
Bukti pembelian dan kwitansi dikirim ke kontak berikut.   (Nama / Email / WhatsApp …)
☐ Saya setuju dengan Syarat & Ketentuan, termasuk bahwa rekaman dan materi
  hanya untuk penggunaan pribadi dan tidak boleh disebarkan.
☐ Saya setuju dihubungi JFU … (opsional)
Setelah bayar, rekaman langsung bisa ditonton di menu Webinar.
Ada kendala? Hubungi admin di product@jakpat.net.
[ Bayar ]
```
Bila email beda dari akun: "Bukti pembelian dikirim ke email di atas; videonya tetap tersimpan di akun ini."

**C21. Menu Webinar**
```
TIKET & VIDEO SAYA
┌──────────────────────────────────┐
│ ▶ Olah Data SPSS untuk Skripsi    │
│ Video kelas · 88 menit            │
│ [▶ Tonton rekaman] [⤓ Materi]     │
└──────────────────────────────────┘
```
- **Menunggu bayar:** hitung mundur + [Lanjutkan bayar], sama dengan tiket.
- **Refund:** "Akses tidak aktif. Hubungi admin bila ada pertanyaan."
- **"Webinar & kelas":** Video kelas milik akun tampil sebagai [Sudah punya] [Tonton].
- **Beranda dashboard:** "Video kelas: Olah Data SPSS · 88 menit".

**C22. Email "Rekamanmu siap" + kwitansi** (templat tetap)

Subjek: `Rekamanmu siap: {judul}`
> Halo {nama}, terima kasih sudah membeli video kelas **{judul}**. Rekaman dan materinya sudah bisa dibuka.
> [Tonton rekaman] → /dashboard/webinar/tonton/{orderId}
> Masuk dengan akun {email akun}. Rekaman ini untuk penggunaan pribadi, jadi jangan disebarkan.
> Kwitansi terlampir. Ada kendala? Hubungi admin di product@jakpat.net.

- **Kwitansi:** "Video kelas: {judul}" dengan kolom "Tanggal beli".
- **Tidak memuat:** URL R2, kata refund, link gabung, maupun kalender.

**C23. Halaman Peserta** (pilihan "Satu daftar + label")
```
┌──────────┬──────────┬─────────┬───────┬────────────┐
│Tiket live│Video     │Ditahan  │Izin   │Pendapatan  │
│12 / 25   │kelas 5   │2        │8      │Rp 833.000  │
└──────────┴──────────┴─────────┴───────┴────────────┘
EMAIL OTOMATIS
  E-tiket           12/12 terkirim
  Bukti beli video  5/5 terkirim            ← hanya bila ada pembeli video
  Pengingat H-1 …   (hanya pemegang tiket live)
(Lunas 17) (Belum bayar 3) (Refund 1)
Putra Kurniawan               ✓ E-tiket
Rina Putri   [Video kelas]    ✓ Bukti beli
```
- **Detail pembeli video:**
  - Jenis: Video kelas.
  - Email: Bukti beli ✓ 18 Nov.
  - Tombol [Kirim ulang bukti pembelian], tanpa [Salin link gabung].
- **Dialog refund:** baris "Akses rekaman langsung berhenti" menggantikan baris link gabung dan kursi.

### Server
- **`functions/api/admin/webinarGate.js`:**
  - `offer_kind` masuk daftar kolom tulis (live|replay).
  - `missingForPublish` untuk Video kelas menambah `recording` (rekaman terbit) dan `materials_path`; keduanya ditaruh di
    ujung `FIELD_ORDER`.
  - Baru: `offerSwitchError(current, next, offer, now)`:
    - draft bebas;
    - terbit, Video kelas → Tiket: `offer_locked`;
    - terbit, Tiket → Video kelas, `seatsTaken > 0` dan acara belum selesai: `event_not_over` + `ends_at`.
- **`functions/api/admin/webinar.js`:**
  - **`save`, bila `offer_kind` berubah:**
    1. Jalankan `offerSwitchError`.
    2. `sales_mode` wajib ada di body; bila tidak, `sales_choice_required`.
    3. `sales_open_at`/`sales_close_at` diambil dari body atau null, tidak pernah terbawa.
    4. Draft → Video kelas: kosongkan jadwal, kuota, dan Zoom.

    Bila hasilnya Video kelas yang dijual, `missingForPublish` (rekaman + materi) berlaku. Tetap satu PATCH dengan filter
    `id=eq.` saja.
  - **`publish`:** aturan Video kelas lewat `missingForPublish`.
  - **`cancel`:** Video kelas dijawab 409 `replay_no_cancel`.
  - **`list`:** `sold_live`/`sold_replay` per acara, dari `dbAll` `webinar_orders?status=eq.paid&select=event_id,kind`.
- **`_webinarRecording.js` `publishRecording`:** boleh untuk draft Video kelas (draft tiket tetap ditolak).
  `notify_scheduled` tetap = jumlah tiket live.
- **`_webinarOps.js`:** `participants` tanpa filter `kind`; `resendTicket` menerima Video kelas.
- **`functions/api/doku/_webinar.js` `deliverWebinarTicket`:**
  - klaim tanpa `kind=eq.live`;
  - select `kind`;
  - templat dipilih dari `order.kind`.
- **`_webinar-ticket-email.js`:**
  - `buildReplayEmail` (C22);
  - `buildTicketReceipt` per jenis: judul "Video kelas: …", kolom "Tanggal beli" = `paid_at`;
  - tanggal kosong tidak lagi tercetak 1970.
- **`my.js`:** kirim ulang email pembelian yang tertunda untuk kedua jenis.
- **`_view.js`:** untuk Video kelas, `schedule_label: null`, ditambah `recorded_label` ("Direkam …") dan `kind_label`
  ("Video kelas · 88 menit").
- **`[[path]].js`:** fakta dan catatan C19.
- **`_recordingAccess.js`:** pesan `inactive` per jenis.

### Klien
- **`src/utils/webinarAdmin.ts`** (fungsi murni):
  - `offer_kind` masuk model form dan `diffColumns`;
  - `switchOffer(form, kind)`;
  - `offerLock(row, now)` untuk keadaan C17;
  - label kartu daftar.
- **Form:**
  - `WebinarEventForm.tsx`: blok C17 + dialog. Panel Rekaman tampil bila acara terbit atau berjenis Video kelas.
  - `WebinarSalesPanel.tsx`: isian live disembunyikan, "Tidak ditutup", baris Direkam.
  - `WebinarRecordingPanel.tsx`: teks untuk draft Video kelas dan tanda merah.
  - `useWebinarEditor.ts`: galat `event_not_over`, `offer_locked`, dan `sales_choice_required`.
- **Daftar:** `WebinarEventList.tsx` sesuai C18.
- **Peserta:**
  - `src/utils/webinarParticipants.ts`: statistik per jenis. Email otomatis **hanya** menghitung tiket live (penting:
    tanpa ini pengingat H-1 terbaca "kurang" karena pembeli video ikut terhitung). Ditambah baris "Bukti beli video",
    CSV Jenis, dan label baris.
  - `WebinarParticipantsPage.tsx`, `WebinarParticipantSheet.tsx`, `WebinarEmailStatus.tsx`, `WebinarOrderDialogs.tsx`:
    teks per jenis.
- **Pembeli:**
  - `WebinarCheckoutPage.tsx`: C20.
  - `WebinarHubPage.tsx`: judul bagian, [Tonton] di OfferCard.
  - `WebinarTicketCard.tsx`: label dan teks refund.
  - `WebinarHomeEntries.tsx`, `src/utils/webinarApi.ts` (tipe).
- **Tata letak:** grep `styles.css` untuk setiap utility responsif baru.

### Data
- Tanpa migrasi.
- **`sql/ops_webinar_uji_video_kelas.sql`** (dry-run + rollback): acara uji Video kelas yang dibuat lewat form ditandai
  `is_test=true, is_listed=false`. Ini perlu supaya halamannya terbuka selama masa uji dan transaksinya berlabel Uji.

### Tes
- **`webinarGate.spec.js`:**
  - `offer_kind`;
  - `missingForPublish` untuk Video kelas;
  - `offerSwitchError`: draft bebas, `event_not_over` (termasuk kursi ditahan), sesudah selesai boleh, `offer_locked`.
- **`webinar.spec.js` (admin):**
  - Ubah jenis menghasilkan satu PATCH `id=eq.` berisi `offer_kind` + tanggal null; kasus penolakannya.
  - Terbit Video kelas tanpa rekaman/materi → `missing_fields`.
  - Cancel Video kelas → 409.
  - `recording-publish`: draft Video kelas boleh, draft tiket ditolak.
  - `participants` berisi dua jenis; resend Video kelas memakai templat video; `list` sold per jenis.
- **`webhookWebinar.spec.js`:**
  - pembeli video menerima templat video + kwitansi "Video kelas:";
  - klaim tetap sekali;
  - jalur live tidak berubah.
- **Spec templat:**
  - link tonton per order;
  - tanpa URL R2;
  - escape `<script>`;
  - tanpa kata refund dan tanpa link gabung.
- **`webinarView.spec.js`:**
  - view Video kelas;
  - HTML halaman memuat fakta, catatan, dan "Beli rekaman", dan tidak memuat `r2.cloudflarestorage.com`.
- **`webinar.spec.js` (pembeli):** `my.js` untuk order video (rekaman ada, tanpa join), kirim ulang email video.
- **`webinarParticipants.spec.ts`:** statistik per jenis, email otomatis mengabaikan pembeli video, CSV Jenis.
- **`webinarAdmin.spec.ts`:** `switchOffer`, `offerLock`, diff `offer_kind`.
- **Gerbang otomatis:**
  - vitest hijau, kecuali 2 kegagalan baseline `respondentsGate.spec.ts`;
  - grep tsc TS2304/TS2552 kosong;
  - cek visual HP 375 px + desktop lewat harness mock: C17, C19, C20, C21, C23.

### Urutan kerja
1. Kerjakan di branch `feat/webinar-tiket` (sama dengan `main` `9a9caec`).
2. Server + tes: gate → admin → email → view/halaman publik.
3. Klien admin + tes, lalu klien pembeli + tes.
4. Gerbang otomatis dan cek visual.
5. Commit saat diminta (+ `graphify update .`), lalu merge `main`, `git pull`, dan push. Tanpa SQL migrasi.
6. Gerbang 5B, lalu perbarui memory `webinar-jfu-plan-state` dan salinan rencana di `docs/`.

### Gerbang 5B (produksi, masa uji = tegar@jakpat.net)
1. **Video kelas tanpa sesi live:**
   1. Buat "Uji Video Kelas" lewat form dan pilih Video kelas.
   2. Jalankan ops SQL.
   3. Isi harga Rp 1.000, unggah MP4 pendek + PDF.
   4. Terbitkan rekaman (keterangan "belum ada pembeli"), lalu Terbitkan (Sekarang).

   Halaman publik tampil sesuai C19.
2. **Beli dengan tegar:** bayar QRIS.
   - Email "Rekamanmu siap" + kwitansi masuk ("Video kelas: …", tanggal benar).
   - Kartu "Tiket & video saya" menampilkan [Tonton] [Materi].
   - Rekaman bisa ditonton di HP.
3. **Admin:**
   - Peserta: label, statistik, dan CSV Jenis sesuai C23.
   - Transaksi: baris Webinar [Uji].
   - Daftar acara: "Terjual 1 video", dan menu tanpa Batalkan.
4. **Ubah jenis di `uji-webinar-jfu`:**
   - Sekarang (acara 17 Nov) pilihan Video kelas terkunci, sesuai C17.
   - Sesudah 17 Nov ±10.07 WIB:
     1. Ubah ke Video kelas, konfirmasi dialog, pilih Sekarang, lalu Simpan.
     2. Halaman menampilkan "Direkam …" dan catatan untuk pemegang tiket.
     3. Tegar menekan "Beli rekaman" dan dibawa ke kartunya.

   `uji-webinar` tidak dipakai di sini karena akan dibatalkan di gerbang Fase 3.
5. **Refund order uji video:**
   - kartu menampilkan "Akses tidak aktif…";
   - halaman tonton menolak;
   - Transaksi menampilkan Refund.
6. **SELECT:**
   - order `kind='replay'` berstatus paid;
   - `ticket_email_sent_at` terisi dan `ticket_email_error` kosong;
   - `transactions` memuat "Video kelas: …".

### Status per fase (6 Nov malam)
| Fase | Status |
|---|---|
| 3 | Dideploy. Sisa gerbang: jadwal berubah (`uji-webinar-jfu`), batal + refund (`uji-webinar`, sesudah pengingat H-1 8 Nov ±10.00 WIB; batal dulu, refund kemudian), Cek ke DOKU |
| 4 | Dideploy |
| 5A + Iterasi (4) | Dideploy 6 Nov. R2 dan email rekaman terbukti; sisa uji manual (lihat Context) |
| 5B | Iterasi ini |
| 6 | Sesudah 5B. Pintu Webinar baru bisa tayang bersama rilis (saklar masa uji dimatikan) |
| 7 | Backlog |
