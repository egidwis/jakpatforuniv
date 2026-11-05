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
