# Transisi harga iklan bersegmen — Okt 2026 → Jan 2027

> **Status: ⬜ BELUM DIEKSEKUSI — ditulis 2026-09-04. Nol baris kode berubah.**
>
> Dokumen ini **menggantikan strategi** [`2026-08-30-kenaikan-harga-voucher-klaim.md`](2026-08-30-kenaikan-harga-voucher-klaim.md)
> dan **memakai ulang rancangan teknisnya**. Rencana 30 Agustus tetap berlaku sebagai
> sumber angka dampak (+65,2%) dan sebagai penemu kelas bug `atMs`; yang dibatalkan
> hanya **urutan** dan **bentuk bantalannya**.
>
> Angka baru di dokumen ini diukur langsung ke produksi (`zewuzezbmrmpttysjvpg`)
> pada 2026-09-04. Angka lama yang masih dipakai diberi tanggal aslinya.

## Apa yang berubah dari 30 Agustus

Tiga hal, dan yang ketiga yang paling mengubah rencana:

1. **Jeda tanpa voucher sudah berjalan.** JFUSUHUD mati 1 Sep 00.00 WIB tanpa
   pengganti — total riwayatnya **33 order, 25 lunas**, terakhir dipesan 31 Agu
   (rencana 30 Agustus mencatat 23 order; ia masih laku sampai hari terakhir).
2. **Bantalannya diganti.** Halaman "Klaim Voucher" salah tugas sebagai peredam
   kejutan: ia punya **risiko penemuan** — peneliti yang tidak menemukan halamannya
   justru menghadapi +65% mentah. Diganti **Harga Perkenalan** yang berlaku otomatis
   tanpa satu klik pun. Halaman klaim tidak dibuang, ia turun ke Fase 4 dengan tugas
   yang benar.
3. **Risikonya dipetakan ulang berdasarkan perilaku pelanggan**, dan hasilnya
   membatalkan dua asumsi — termasuk asumsi yang kutulis sendiri di sesi ini.

Hasil yang dituju: pada 1 Jan 2027 tarif penuh berlaku, **tanpa satu hari pun**
peneliti menghadapi lompatan >35%, **tanpa satu order pun** ditagih berbeda dari yang
disetujui pemesannya, dan **tanpa kehilangan akun institusi karena kejutan anggaran.**

---

## Keputusan pemilik produk (2026-09-04)

| # | Keputusan |
|---|---|
| 1 | Bantalan = **Harga Perkenalan otomatis**, bukan halaman klaim voucher |
| 2 | Peluruhan **3 langkah**: efektif = harga lama → ≈+33% → harga penuh |
| 3 | Harga list baru **tayang 1 Okt 2026**; harga penuh berlaku **1 Jan 2027** |
| 4 | Tangga tetap **200 / 350 / 500 / 650 / 800** |

Yang tetap berlaku dari 30 Agustus: tangga tarif dibuat **ber-tanggal**, dan JFUSUHUD
dibiarkan mati.

---

## Dua asumsi yang dibatalkan pengukuran

### ❌ "Preseden 2025 membuktikan kenaikan aman" — dicabut

Commit `7eee119` (28 Agu 2025) menaikkan tier >50 soal (+33%/+67%), dan sesudahnya
porsi order >50 soal justru naik 7,8% → 13,4% → 20,6%. Angka itu sempat kupakai
sebagai bukti bahwa kenaikan tidak menimbulkan penghindaran.

**Bobotnya dicabut.** Pada Sep–Nov 2025 `auth_user_id` hanya terisi di **26,2%** order,
dan cuma **6 order lunas** di jendela itu punya identitas. Periode preseden **buta
secara pengukuran** — ia tidak bisa menjawab siapa yang membeli, apalagi apakah mereka
pernah melihat harga lama. Yang bertahan hanyalah tren jumlah soal, dan itu tidak
berbicara tentang pelanggan berulang.

Kekhawatiran pemilik produk benar: kenaikan 2025 adalah **kenaikan terhadap orang
asing**. Kondisi itu tidak berlaku lagi.

### ❌ "Segmen mahasiswa = T3, jadi tier bisa jadi proksi segmen" — dicabut

Order lunas sejak 1 Apr 2026, dipecah menurut riwayat pembeli:

| Tier | Lunas | Pertama kali | Revenue pertama kali | Revenue berulang |
|---|---|---|---|---|
| T1 | 9 | 66,7% | Rp 1,40jt | Rp 0,69jt |
| T2 | 55 | 50,9% | Rp 15,47jt | Rp 8,48jt |
| **T3** | **164** | **48,2%** | **Rp 46,64jt** | **Rp 40,01jt** |
| T4 | 43 | 74,4% | Rp 21,35jt | Rp 6,35jt |
| T5 | 29 | 44,8% | Rp 16,35jt | Rp 19,74jt |

T3 — 54% order dan kenaikan +67% — terbelah **48/52**. Belahan segmennya **melintasi
tier**, bukan memisahkannya. Instrumen apa pun yang berbasis tier akan menghantam dua
segmen sekaligus tanpa bisa membedakan.

**Sumbu yang benar adalah riwayat pembeli** (`auth_user_id`) — persis kunci yang sudah
dipakai `voucher_redemptions` dan `UNIQUE(auth_user_id, voucher_code)`.

---

## Peta risiko yang sebenarnya

### Risikonya satu akun, bukan sepuluh

"Top 10" ternyata dua spesies berbeda (order lunas sejak 1 Apr 2026, identitas sengaja
tidak ditulis):

| Peringkat | Order lunas | Revenue | Rentang aktif | Rata soal |
|---|---|---|---|---|
| **#1** | **66** | **Rp 31,9jt** | 8 Jan – 30 Agu (234 hr) | 38 (T3) |
| **#2** | 16 | Rp 18,2jt | 2 Feb – 3 Sep (aktif) | 82 (T5) |
| #3 | 5 | Rp 6,6jt | Des – 24 Jul | 114 |
| **#4** | 13 | Rp 5,2jt | 10 Feb – 25 Agu | 42 (T3) |
| #5 / #6 / #7 | **1 / 1 / 1** | Rp 4,9 / 3,7 / 3,1jt | sekali beli | 43 / 92 / 62 |
| **#8** | 7 | Rp 2,9jt | 10 Feb – 31 Agu | 31 (T3) |
| #9 | 3 | Rp 2,8jt | Jan – Feb (berhenti) | 56 |
| #10 | 42 | Rp 2,7jt | s/d 8 Agu 2025 (churn) | 20 |

Yang berjangkar harga **dan masih aktif** hanya empat: **#1, #2, #4, #8**. Tiga akun
(#5–#7) pembeli sekali-besar tanpa jangkar sama sekali.

**Konsentrasinya di #1: ±18% seluruh revenue sejak April — 66 order dalam 234 hari,
satu order tiap 3,5 hari, rata-rata 38 soal (T3, +67%).**

⚠️ #10 memang churn, tapi order terakhirnya **8 Agu 2025 — tiga minggu sebelum**
kenaikan 2025. Bukan bukti churn karena harga.

### #1 adalah unit kampus/lab riset — itu mengubah bentuk risikonya, bukan menghapusnya

Dikonfirmasi pemilik produk. Artinya ia **berdana hibah/anggaran institusi**: tidak
sensitif harga per-order, tapi **terikat siklus anggaran tahunan**.

Bentuk kegagalannya jadi lebih berbahaya karena **sunyi**: mereka tidak protes dan
tidak churn — mereka hanya memesan lebih sedikit, karena anggaran yang sudah disahkan
membeli lebih sedikit survei. Kehilangan seperti ini tidak pernah muncul sebagai
keluhan, hanya sebagai angka yang pelan-pelan mengecil.

> **Konsekuensi terpenting sesi ini:** untuk pembeli berdana anggaran, **pengumuman
> dini itu melindungi, bukan berisiko.** Yang melukai mereka adalah kenaikan yang
> datang *setelah* anggaran dikunci. Tanggal 1 Jan 2027 baru aman kalau angkanya sampai
> ke mereka **sebelum mereka menyusun anggaran 2027.**

⚠️ **Wajib dikonfirmasi, bukan diasumsikan:** kapan tepatnya akun institusi mengunci
anggaran tahunannya. Kalau musim penyusunannya Okt–Des, pengumuman September tepat
waktu. Kalau lebih awal, tanggalnya harus digeser. **Tanyakan langsung saat outreach** —
itu sekalian alasan alami untuk meneleponnya.

### Segmen lain: mahasiswa berdana pribadi

Uang sendiri, terikat tenggat skripsi, mayoritas membeli sekali, dan — menurut belahan
di atas — **duduk bercampur dengan pembeli berulang di T3**. Mereka yang paling
merasakan +67%, dan mereka pula yang tidak punya jangkar harga.

### Alternatif & jendela kompetitif

Hari ini alternatif peneliti adalah menyebar sendiri lewat grup WA/IG — lambat dan
sampelnya bias. Yang dijual JFU **kecepatan & kualitas panel, bukan harga**, dan **tidak
ada patokan harga eksternal** di kepala peneliti. Tapi pemilik produk menilai kompetitor
bisa bergerak dalam waktu dekat.

Dua konsekuensi berlawanan arah, keduanya berlaku: menaikkan **sekarang** lebih aman
daripada nanti selagi belum ada pembanding — dan **jangan melampaui** tangga yang sudah
disepakati, karena begitu pembanding muncul, harga jadi bisa diadu.

### Nego ad-hoc

Pernah terjadi lewat WhatsApp, tapi jarang & kasuistis. Cukup kecil untuk tidak
membatalkan "harga list = harga nyata", tapi cukup nyata untuk perlu **batas nego resmi
bagi admin** sebelum kenaikan — tanpa itu, nego jadi jalur utama begitu harga naik.

---

## Riset tangga: 200/350/500/650/800 dipertahankan

Sebaran order lunas sejak 1 Apr 2026: **26–30 soal 9,7%**, **31–40 soal 35,7%** (modus).
Perbatasan **30/31 adalah perbatasan terpadat di seluruh produk.**

Sempat kuusulkan menurunkan T2 ke 300rb karena +75% adalah lompatan persentase tercuram.
**Usul itu ditarik:** T2 di 300rb justru **melebarkan tebing** di perbatasan terpadat
dari +150rb menjadi +200rb per hari — tepat di tempat paling banyak orang berdiri dan
paling mudah memangkas satu-dua pertanyaan. Tangga berlangkah rata +150rb menaruh tebing
terkecil yang mungkin di sana. T2 juga bukan segmen rapuh: konversinya 88,7%, dan +75%
adalah kenaikan **absolut** terkecil setelah T1.

Pendukung lain, dengan keterbatasannya masing-masing:

- **Konversi naik seiring harga:** T1 30,0% · T2 88,7% · T3 80,8% · T4 89,6% · T5 96,7%.
  ⚠️ Korelasional — ia menunjukkan *siapa* yang membeli, bukan reaksi terhadap kenaikan.
- **Biaya iklan cuma 71,4% dari total tagihan** (sisanya insentif pilihan peneliti +
  PPN), jadi **iklan +64,7% → total yang dibayar +51,3%**. ⚠️ Diukur atas 112 order lunas
  yang punya `subtotal` terisi; kolom itu baru diisi sejak pekerjaan PPN akhir Juli, jadi
  sampelnya condong ke order terbaru.
- **Volume & konversi sedang di puncak** (Agu: 115 dibuat, 88 lunas). ⚠️ Rekor itu
  **tidak bersih**: 28% order lunas Agustus memakai JFUSUHUD; bulan lain hanya 2–3%.

**T1 dicatat, tidak dioptimasi sekarang** — 3% order lunas dengan konversi 30%.
Merapikan bentuknya keputusan terpisah.

**Data mendukung tangga ini dengan nyaman; data TIDAK mendukung naik lebih tinggi tanpa
eksperimen harga sungguhan**, dan eksperimen itu bukan bagian rilis ini.

---

## Jadwal harga

Harga per hari, ribuan rupiah. Kolom nilai = tarif **efektif** yang benar-benar ditagih.

| Periode | Diskon | T1 | T2 | T3 | T4 | T5 | vs harga lama |
|---|---|---|---|---|---|---|---|
| s/d 30 Sep 2026 | — | 150 | 200 | 300 | 400 | 500 | — |
| **1 Okt – 30 Nov** | **−40%** | 120 | 210 | **300** | 390 | 480 | ±0% |
| **1 Des – 31 Des** | **−20%** | 160 | 280 | **400** | 520 | 640 | ≈ +33% |
| **mulai 1 Jan 2027** | — | 200 | 350 | **500** | 650 | 800 | **+65%** |

Harga list yang dicoret sepanjang Okt–Des adalah **200/350/500/650/800** — angka yang
memang diberlakukan 1 Januari, bukan angka karangan. Itu yang membedakannya dari harga
coret palsu, yang selain melanggar **UU 8/1999 pasal 9–10** dan **Permendag 50/2020**
juga akan langsung terbaca oleh empat akun berjangkar di atas.

⚠️ Semua nilai efektif bulat. **Tulis list dan efektif sebagai literal** di tabel tarif —
jangan hitung `list × (1 − pct)` saat runtime — supaya klien dan server tidak mungkin
beda satu rupiah. Persentase yang dipajang diturunkan dari dua literal itu, dan hanya
untuk teks.

### Kenapa musim sepi justru waktu yang tepat

Order lunas per bulan kalender (2025+2026 digabung): Sep 13 · Okt 9 · Nov 10 · Des 24,
melawan Mei 107 dan Agu 100.

⚠️ **Angka Sep–Nov hanya berasal dari 2025**, saat produk ±10x lebih kecil — musim dan
pertumbuhan **tidak bisa dipisahkan** dari data yang tersedia. Perlu dikonfirmasi
pengetahuan domain; jangan diperlakukan sebagai temuan.

Kalau memang Okt–Nov musim sepi, ia **memperkuat** jadwal ini: risiko transisi diambil
saat paling sedikit orang menonton, sehingga musim ramai (Jan ke atas) dibuka dengan
harga yang sudah menjadi normal. Konsekuensi yang diterima sadar: langkah +33% mendarat
1 Des, dan Desember bulan yang menanjak — disengaja, karena permintaan Desember didorong
tenggat dan paling tidak sensitif harga.

---

## Rancangan teknis

### Fase 1 — tangga ber-tanggal, dikirim sebagai no-op (WAJIB pertama)

Harga Perkenalan membuat fase ini makin wajib: begitu ada **dua** angka di layar,
keduanya harus bisa direkonstruksi pada tanggal order lahir. Tanpa ini, harga coret
melahirkan ulang bug §00V (*"tercatat ≠ ditagihkan"*) di tempat yang jauh lebih terlihat.

Terverifikasi masih berlaku **2026-09-04**: `calculateAdCostPerDay(questionCount)` di
`multi-step-form/src/utils/cost-calculator.ts:89` **tidak punya parameter tanggal**,
sementara salinannya di `functions/api/doku/create-payment.js:61` menghitung ulang harga
tiap kali orang menekan bayar lalu mengoreksi `total_cost` di DB ke angka server.

Kirim dengan tabel berisi **satu** baris — nilai hari ini. Nol rupiah berpindah.

- `src/utils/constants.ts` — `AD_RATE_SCHEDULE`, tiap entri
  `{ effectiveFrom, list[], effective[] }`
- `src/utils/cost-calculator.ts` — `calculateAdCostPerDay(questionCount, atMs = Date.now())`
  mengembalikan tarif **efektif**; tambah `adRateBreakdown(questionCount, atMs)` →
  `{ list, effective, discountPct, listStartsAt }` khusus UI
- `functions/api/doku/create-payment.js` — salinan **OTORITATIF**, wajib berubah bersamaan

Pola instannya sudah ada dan sudah dipakai untuk voucher: `voucherInstantOf(created_at)`
di `cost-calculator.ts:55`, `orderInstant(sub)` di `create-payment.js:146`. Namanya kini
terlalu sempit; rename opsional, **jangan menahan rilis**.

⚠️ Default `Date.now()` dipertahankan supaya pemanggil lama tetap ter-kompilasi, **tapi
default diam persis cara bug `created_at` dulu lolos review.** Fase 1 wajib menambah spec
bergaya `create-payment-select.spec.ts` yang menguji **pemanggilnya**, bukan cuma
fungsinya.

### Fase 2 — harga coret di UI

Tanpa mengubah satu angka pun. Sumbernya `adRateBreakdown()`, jadi tidak ada angka kedua
yang bisa melenceng dari yang ditagih.

Baris "Biaya Iklan" di `src/components/StepCheckout.tsx:558-566` hari ini line-item polos
tanpa tempat bagi harga referensi. Ia mendapat harga list tercoret, tarif efektif, dan
satu baris jujur: *"Harga perkenalan −40% · harga normal Rp 500.000/hari mulai
1 Des 2026"*. **Tanggal langkah berikutnya dicetak sejak hari pertama** — itu yang
membuat harga coret ini sah, secara hukum maupun di mata pelanggan berjangkar.

Ikut disentuh: ringkasan hidup di `Sidebar.tsx` + `UnifiedHeader.tsx`, dan naskah FAQ
chatbot di `src/pages/dashboard/ChatPage.tsx:231-235` (memuat tangga lama; **wajib satu
deploy** dengan perubahan tarif, kalau tidak bot mengontradiksi checkout).

### Fase 3 — nyalakan jadwalnya

Tambah tiga baris ke `AD_RATE_SCHEDULE` (1 Okt −40%, 1 Des −20%, 1 Jan penuh). **Satu
berkas, satu deploy**, seluruh peluruhan tayang sejak awal Oktober. Tidak ada deploy
tergesa di malam pergantian tahun.

### Fase 4 — instrumen permanen segmen mahasiswa (tenggat 1 Jan 2027, BUKAN 1 Okt)

Di sinilah halaman klaim voucher rencana 30 Agustus kembali — dengan tugas yang benar.
Ia **bukan** peredam kejutan (itu tugas Harga Perkenalan); ia **lantai harga permanen**
bagi pembeli pertama kali/mahasiswa setelah tarif penuh berlaku. Kuncinya `auth_user_id`
— satu-satunya sumbu yang bisa membedakan segmen, karena tier tidak bisa.

Ini Fase 2+3 rencana 30 Agustus (voucher jadi data + halaman klaim). Ia **tidak lagi
memblokir kenaikan** dan boleh menyusul kapan saja sebelum 1 Jan.

---

## Temuan review 2026-09-04 — yang mengubah daftar kerja Fase 1

Kode diperiksa ulang hari ini terhadap daftar pemanggil di rencana 30 Agustus. Empat
koreksi:

### 1. ⚠️ Satu titik harga tidak ada di daftar mana pun: `SubmissionDetailSheet`

`src/components/submissions/SubmissionDetailSheet.tsx:576-577` menghitung selisih harga
yang **ditunjukkan ke admin** saat mengoreksi `question_count` sebelum Approve:

```
const oldAdCost = calculateTotalAdCost(submission.questionCount || 0, duration);
const newAdCost = calculateTotalAdCost(questionCountInput, duration);
```

Keduanya memakai **tarif hari ini**. Untuk order yang lahir sebelum sebuah langkah,
**kedua angka salah** — dan dialog ini justru ada supaya admin memutuskan sadar, bukan
kaget. Tambahkan ke daftar "perlu `created_at` di-thread masuk".

`src/components/schedule/bulkInvoiceCandidates.ts:28` juga bergantung pada
`calculateAdCostPerDay(0) === 0`; sifat itu **wajib bertahan** di semua entri
`AD_RATE_SCHEDULE`.

### 2. ✅ `SchedulePhase` sudah bukan titik harga — daftarnya jadi lebih pendek

Catatan lama menyebut halaman status peneliti menghitung ulang seluruh harganya dari
tarif hari ini. **Sudah tidak lagi**: `SchedulePhase.tsx:413` dan `airingPeriods.ts:154`
kini merutekan semuanya lewat `deriveScheduleMoney` — fungsi yang sama dengan kartu admin.
Artinya seluruh sisi peneliti runtuh jadi **satu** fungsi yang harus dibetulkan:
`src/utils/scheduleMoney.ts`.

### 3. ⚠️ `deriveScheduleMoney` bukan cuma kehilangan tanggal tarif — ia kehilangan tanggal voucher

`scheduleMoney.ts:90` dan `:200` memanggil `calculateDiscount(...)` **tanpa argumen
`atMs`** sama sekali, jadi ia menilai kevalidan voucher pada "sekarang". Aturan *"voucher
dinilai pada tanggal order lahir"* yang sudah ditegakkan di `supabase.ts` dan
`create-payment.js` **tidak pernah sampai ke sini**. Menambahkan instan ke fungsi ini
memperbaiki **dua** hal sekaligus.

`AdScheduleEntry` tidak membawa `created_at`, jadi tanda tangannya harus dilebarkan dan
kedua pemanggilnya (kartu admin + halaman peneliti) ikut disentuh. **Ini potongan
terbesar Fase 1, bukan catatan kaki.**

Yang sudah dipastikan **tidak** membuat uang bergerak: cabang rekonstruksi
`Math.abs(... − netAdCost) < 10` memang berhenti cocok begitu tangga berubah, tapi
totalnya diambil dari `entry.totalCost` tersimpan. Diukur hari ini: **1.037 jadwal
bertagihan, 131 bervoucher, 34 masuk cabang rekonstruksi — ketiga puluh empatnya
JFUSUHUD**, voucher persentase, sehingga jatuh dengan mulus ke cabang pembalikan rasio
dan tetap menampilkan angka yang benar. Tetap perlu diperbaiki lewat `atMs`; **bukan
penghalang rilis.**

### 4. 🔴 JFUFEB adalah cap dalam RUPIAH yang menyeberangi 1 Jan 2027

`calculateDiscount` (`cost-calculator.ts:150-163`) memberi JFUFEB & ILKOMUNY:
durasi 7 hari → biaya iklan **flat Rp 1.000.000**; durasi lain → **cap Rp 300.000/hari**.

Cap itu ditulis terhadap tangga **lama**, dan di sana ia duduk persis di T3 — jadi
praktis hanya menggigit T4/T5. Terhadap tangga **baru**, Rp 300.000 jatuh **di bawah T2
(350rb)**, sehingga voucher yang sama diam-diam berubah jadi jauh lebih murah hati:

| Tier | Tarif baru | Dengan cap 300rb | Diskon efektif |
|---|---|---|---|
| T2 | 350 | 300 | −14% |
| T3 | 500 | 300 | **−40%** |
| T4 | 650 | 300 | **−54%** |
| T5 | 800 | 300 | **−62,5%** |

**JFUFEB berlaku s/d 20 Feb 2027** — 51 hari **melewati** tanggal harga penuh. Pemakaian
terukur 2026-09-04: **7 order, 6 lunas, terakhir 20 Jul 2026**. **ILKOMUNY nol pemakaian
seumur hidup** (berlaku s/d 31 Des 2026, jadi ia tidak menyeberang).

**Butuh keputusan pemilik produk sebelum Fase 3:** akhiri JFUFEB 31 Des 2026, atau tulis
ulang cap-nya relatif terhadap tangga. Membiarkannya berarti menerbitkan diskon 40–62%
yang tidak pernah diputuskan siapa pun.

---

## Lubang yang harus ditutup: grandfathering tanpa kedaluwarsa = opsi harga gratis

"Order dihargai pada tarif saat ia lahir" **selamanya** berarti siapa pun bisa membuat
order 30 Nov lalu membayarnya Maret dengan harga Oktober. Bukan hipotetis: pekerjaan
2026-09-03 menemukan **tidak ada cron yang mengedaluwarsakan tagihan**, dan **182 dari
183** baris `transactions` berstatus `pending` sudah lewat 7 hari, tertua Desember 2025
(lihat [`2026-09-03-tagihan-mati-benar-benar-mati.md`](2026-09-03-tagihan-mati-benar-benar-mati.md)).

Paparannya hari ini: **26** order dengan definisi sempit (`submission_status='approved'`,
termuda 24 Jul) dan **±75** dengan definisi luas (ikut `slot_reserved`/`scheduled`/`live`/
`waiting_payment`). Angka **80** di rencana 30 Agustus memakai definisi luas — **datanya
tidak bergerak, definisinya yang beda.** Sepakati satu definisi sebelum dipakai sebagai
angka risiko.

Usulan: tarif yang di-grandfather berlaku selama order masih berstatus bisa dibayar;
lewat itu, order dihargai ulang pada tarif berjalan **dengan pemberitahuan**. Butuh
keputusan pemilik produk — jangan diam-diam, itu persis bentuk bug yang ditutup rencana
ini.

---

## Rencana komunikasi

Bagian ini setara pentingnya dengan kodenya, dan **urutannya mengikat**.

**1. Identifikasi & hubungi #1, #2, #4, #8 — SEBELUM pengumuman apa pun.**
Empat akun berjangkar yang masih aktif; #1 sendiri ±18% revenue. Ini pekerjaan orang
(telepon/WA bernama), bukan pekerjaan UI. Yang mereka butuhkan **kepastian, bukan
diskon** — mereka berdana anggaran, jadi bawa **kartu tarif 2027 yang bisa dimasukkan ke
dokumen anggaran**, bukan kupon. Sekalian tanyakan **kapan mereka mengunci anggaran
tahunan**; jawabannya menentukan apakah 1 Jan aman.

**2. Pengumuman ke semua akun — secepat mungkin, jangan tunggu T-14.**
Untuk pembeli berdana anggaran, dini itu melindungi. Sasaran: semua akun dengan order
lunas 6 bulan terakhir. Isinya empat hal: tangga baru, **tanggal 1 Jan 2027**, jadwal
harga perkenalan Okt–Des, dan jaminan bahwa order yang dibuat sebelum tanggal langkah
tetap memakai tarif saat ia dibuat.
Infrastrukturnya ada: `functions/api/_mail.js` + pola `notify-*.js`; banner dashboard
punya preseden di `SpecialMissionRunningBanner.tsx` / `WebhookFailuresBanner.tsx`.

**3. 1 Okt — harga coret tayang.** Pesannya bukan "harga naik" melainkan *"harga baru
berlaku 1 Januari; sampai 30 November kamu tetap bayar harga lama"*.

**4. Naskah + batas nego untuk admin.** Invoice dikirim admin lewat WhatsApp, dan nego
ad-hoc sudah pernah terjadi. Siapkan naskah tarif baru, jawaban "kenapa naik", **dan
batas nego resmi** — bersamaan, bukan menyusul. Tanpa batas, nego jadi jalur utama
begitu harga naik.

**5. Satu kalimat "kenapa".** Alternatif peneliti hari ini menyebar sendiri lewat grup
WA/IG — lambat dan sampelnya bias. Jadi kalimatnya bicara **kecepatan dan kualitas
panel**, bukan biaya operasional. Satu kalimat jujur, bukan paragraf korporat.

**Risiko yang diawasi:** penumpukan order menjelang 1 Des dan 1 Jan. 76% order berdurasi
1 hari dan terikat tanggal tayang tertentu, sementara slot harian berkuota — **cek
kapasitas kalender sebelum 1 Des.**

---

## Verifikasi

- `npm test` (vitest). `voucher-validity.spec.ts` (6.804 kombinasi) dan
  `create-payment-select.spec.ts` adalah jaring pengaman paritas klien↔server.
- **Spec tangga ber-tanggal:** order yang lahir sebelum sebuah langkah tapi dibayar
  sesudahnya **wajib** ditagih tarif saat ia lahir. Uji ketiga tanggal langkah, dan uji
  **pemanggilnya**, bukan cuma fungsinya.
- **Spec harga coret:** `adRateBreakdown().effective` **wajib** identik dengan
  `calculateAdCostPerDay()` pada instan yang sama — angka yang dipajang tidak boleh punya
  jalur perhitungan sendiri.
- **Spec `calculateAdCostPerDay(0) === 0`** di setiap entri `AD_RATE_SCHEDULE`
  (`bulkInvoiceCandidates` bergantung padanya).
- **Adu ulang ke produksi setelah Fase 1:** seluruh order approved-belum-bayar harus
  menghasilkan `total_cost` yang **tidak berubah**. Nol rupiah berpindah, atau Fase 1
  gagal.
- **Uji tanggal terkendali:** majukan `atMs` ke 1 Okt / 1 Des / 1 Jan → tarif efektif T3
  wajib 300rb / 400rb / 500rb, di klien **dan** di `create-payment.js`.
- **Klik manual:** order baru di tiap jendela → angka checkout = angka tagihan DOKU =
  `total_cost` di DB.
- Gerbang `tsc`: **`tsc -p tsconfig.app.json`** — `tsc --noEmit` polos menipu.

---

## Keputusan yang masih terbuka (milik pemilik produk)

| # | Pertanyaan | Kenapa memblokir |
|---|---|---|
| 1 | Kapan akun institusi mengunci anggaran tahunannya? | Menentukan apakah 1 Jan 2027 aman atau harus digeser |
| 2 | Nasib JFUFEB (cap Rp 300rb/hari, berlaku s/d 20 Feb 2027) | Dibiarkan = diskon 40–62% yang tak pernah diputuskan — memblokir Fase 3 |
| 3 | Aturan kedaluwarsa grandfathering | Tanpa itu, tarif Oktober bisa ditebus Maret |
| 4 | Definisi resmi "approved-belum-bayar": 26 (sempit) atau ±75 (luas) | Dipakai sebagai angka paparan di semua dokumen |
| 5 | Benarkah Okt–Nov musim sepi? | Data tak bisa memisahkan musim dari pertumbuhan |

---

## Yang sengaja DI LUAR cakupan

- **Membenahi bentuk T1** — dicatat, diputuskan terpisah.
- **Validasi `question_count`.** 5 baris mustahil ada di DB (maks 123456789); **nol** di
  antaranya lunas, jadi nol rupiah salah tagih — tapi kolom itu **menggerakkan harga** dan
  gerbangnya tidak ada. Catat, jangan ditumpuk ke rilis uang ini.
- **Eksperimen harga sungguhan** (A/B tarif). Diperlukan kalau ingin naik melampaui
  tangga ini; bukan bagian rilis ini.
