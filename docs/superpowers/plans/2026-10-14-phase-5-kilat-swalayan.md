# Phase 5 — Kilat swalayan: peneliti memesan Kilat sendiri

> **STATUS NYATA (15 Okt 2026):** 🟡 **R1 selesai di branch** `feat/kilat-tarif-bertanggal` (tarif Kilat 5.1 tidur, `KILAT_TARIFF_FROM = null`, + audit invoice/kwitansi), belum di-merge. 🟡 **R2 selesai di branch** `feat/kilat-fondasi-gelombang` (di atas R1): `sql/117` ditulis & diuji PGlite (20 kasus + mutan), **belum diterapkan**; kode 5.4 tanpa sinkron halaman. **`sql/117` DITERAPKAN & diverifikasi produksi 15 Okt** (CHECK 8/11/14/15/17, 2 trigger, ACL tanpa anon); kode R2 belum di-push. 🟡 **R4 bagian SQL di branch** `feat/kilat-undian-siaran` (di atas R2): `sql/118` ditulis & diuji PGlite (20 kasus, rollback md5-identik), **belum diterapkan** — dry-run prod: 20 order bergeser jendela undian (19 Kilat lama + 1 Iklan berjam kustom; 18 berhalaman), 0 perubahan status/`can_select_winners`, 0 `period_batch` perpanjangan berubah. Toggle siaran diwujudkan sebagai 3 RPC `service_role` (`kilat_broadcast_start/_end/_undo`), konsumen UI/Pages Function R4 belum dikerjakan. Urutan rilis: R1 deploy → gerbang R1 → push R2 → R3 → R4 (terapkan sql/118 lalu push). R3, R5–R8 ⬜.
>
> Berkas ini salinan rencana yang disetujui di sesi chat 14–15 Okt. Bagian **Gelombang rilis** menentukan urutan eksekusi; nomor task (5.1–5.10) tetap jadi rujukan isi.

> **Ditinjau ulang 14 Okt 2026** terhadap `main` = `316c610` dan DB produksi (hanya SELECT). Pada tanggal yang sama ditambahkan keputusan **extend Kilat** dan **tarif Kilat baru**. Tarif menjadi Task 5.1, sehingga task lain bergeser +1 dibanding versi sebelumnya; extend kini 5.10.

## Context

Sejak 1 Sep 2026, peneliti tidak punya pintu masuk ke Kilat.
- Pintu satu-satunya dulu adalah tombol upgrade di Ringkasan, yang hanya muncul dengan voucher JFUSUHUD. Voucher itu sudah mati. Gerbangnya masih ada di kode (`StepCheckout.tsx:605`, `cost-calculator.ts:450`) tapi tidak pernah menyala.
- Order Kilat hanya lahir lewat "Jadikan Kilat" oleh admin, lalu admin memilihkan gelombangnya.
- Data produksi 14 Okt: 24 order, 19 lunas, semuanya `slot_booked_by='admin'`, dan **nol order Kilat baru sejak 1 Okt**.
- Harga Kilat sekarang (tarif tier × 1 + add-on Rp200rb) **tidak pernah diputuskan terhadap tangga tarif Iklan baru**. Ia efek samping rumus. Dokumen transisi harga tidak menyebut Kilat sama sekali, dan baris README-nya keliru menulis "Kilat Rp200rb di 2027 tetap di badan dokumen". Akibatnya, mulai 2027 Kilat lebih murah dari Iklan 2 hari di empat dari lima tier (tier 31–50: setara 1,4 hari Iklan).

**Penamaan.** "Phase 5" = seluruh pekerjaan Kilat.
- **Task 5.0** "Kilat punya halaman" (`sql/95`, 18 Sep) sudah selesai.
- Rencana ini berisi **Task 5.1–5.10**.
- Rencana undian `2026-10-07-periode-undian-ganda-api-respondents.md` (`b8193cd`) menunggu Phase 5 selesai.

### Keputusan pemilik produk

| Keputusan | Isi | Tanggal |
|---|---|---|
| Pemilih gelombang | **Peneliti** di jalur otomatis. Di jalur manual **admin**, persis Iklan (lihat baris Review) | 5 Okt, diperjelas 14 Okt |
| Jam gelombang | Hanya **11.00 dan 15.00 WIB**, **2 kuota per gelombang**, jadi 4 per hari | 5 Okt |
| Hari tayang | **Senin–Jumat**, kecuali tanggal yang diaktifkan di **kalender libur operasional** (5.4b) | 14 Okt |
| Batas pesan dan bayar | Pesan **H-2 jam**, bayar **H-1 jam**. Gelombang 11.00: pesan ≤ 09.00, bayar ≤ 10.00. Gelombang 15.00: pesan ≤ 13.00, bayar ≤ 14.00 | 5 Okt |
| Review | **Persis Iklan.** Jalur otomatis: peneliti memilih gelombang lalu bayar. Jalur manual: order dikirim dari Ringkasan **tanpa gelombang**; setelah disetujui, **admin menugaskan gelombang** (`awaiting_admin_schedule`), lalu tagihan terbit. *(Keterangan 5 Okt "gelombang pilihan disimpan" keliru menggambarkan Iklan; dikoreksi 14 Okt)* | 5 Okt, dikoreksi 14 Okt |
| Alur submission | **Identik dengan Iklan, dengan tepat dua pengecualian**: (1) konfigurasi Step 1 **tanpa pilihan durasi**; (2) Step 3 berisi **pemilih gelombang**, bukan kalender hari. Langkah, jalur tulis (INSERT `submitOrder`, pilih ulang `rebookSlotForSubmission`), review, Ringkasan (termasuk kolom voucher), Jadwal & Bayar, email dan review admin tetap satu jalur. Turunan otomatis dari dua pengecualian itu: harga per gelombang dan batas pesan/bayar per gelombang. Perbedaan lain di luar daftar ini dianggap penyimpangan | 14 Okt |
| Voucher untuk Kilat | **Hanya kode ambassador (−10% dari tarif Kilat, bukan dari hadiah)** dan **JFUTGRX** (voucher uji internal, total Rp1.000). JFUFEB, ILKOMUNY, TEGARGANTENG dan kode lain **tidak berlaku**. Kode yang tidak berlaku ditolak di form Kilat dengan pesan jelas dan tidak disimpan, sehingga tidak bisa membelokkan jalur review. Server mengabaikannya untuk Kilat. Ini menggantikan prinsip lama "Kilat tanpa diskon voucher" | 14 Okt |
| Operasional | Salin link halaman ke survei Jakpat dan kirim push tetap manual, **di luar cakupan** | 5 Okt |
| Sinyal ke admin | **Badge angka** (gaya badge Conversations) di tab **Iklan** dan **Kilat** halaman Submissions: jumlah order yang masih menunggu admin. Kilat menghitung juga gelombang lunas yang **belum disiarkan** (toggle siaran belum dinyalakan). Tanpa email atau cron | 14 Okt |
| Kalender libur | **Satu saklar per tanggal** (+ label), diatur admin di halaman khusus. Saat aktif: **Kilat tutup** di tanggal itu. **Iklan otomatis tetap tayang**, tetapi peneliti diberi tahu bahwa admin libur, sehingga review/penjadwalan manual, lapor kendala dan komplain dilayani setelah admin masuk | 14 Okt |
| Satu pemesanan = satu gelombang | Durasi pengerjaan maksimal 24 jam, **tidak ditampilkan ke peneliti**. Tidak ada pilihan durasi | 7 Okt |
| Undian buta jenis | **Undian tidak melihat Iklan/Kilat**, hanya responden dan hadiah. Satu rumus jendela untuk semua jadwal (ordinal 1 & perpanjangan): **[saat iklan benar-benar mulai, saat benar-benar selesai)**. Iklan mulai dan selesai di instan jadwalnya. Kilat mulai saat **toggle siaran** dinyalakan admin dan selesai saat dimatikan, atau otomatis 24 jam setelah dinyalakan. Bila toggle tak pernah disentuh, dipakai jendela gelombang. `can_select_winners` menyala saat jendela selesai, untuk kedua jenis | 14 Okt |
| Halaman & pendaftar telat | **Halaman Kilat swalayan tutup bersamaan dengan jendela undian**, seperti Iklan. Pendaftar telat ikut aturan undian yang sama untuk semua survei (batch terakhir yang `period.start` ≤ `submitted_at`, rencana undian 7 Okt). 17 halaman lama dibiarkan. *(Menggantikan "semua ikut, halaman tidak diubah" 7 Okt)* | 14 Okt |
| Toggle siaran Kilat | **Toggle, bukan tombol**, di tab Page drawer Submissions. **Nyala** = push terkirim: halaman & undian dibuka. **Mati** = siaran selesai: halaman tutup dan pemenang bisa dipilih seketika. Batas maksimal 24 jam tetap: bila lupa dimatikan, jendela selesai sendiri. Satu arah per gelombang: setelah selesai, toggle terkunci | 14 Okt |
| Siaran terlewat | Toggle **boleh dinyalakan kapan saja** selama belum pernah dinyalakan, termasuk setelah jendela sementara [gelombang, +24 jam) habis. Jendela halaman dan undian pindah ke [nyala, +24 jam), dan `can_select_winners` kembali `false`. Risiko pendaftar setelah undian diterima. Dialog nyala memberi peringatan bila jendela sementara sudah lewat. Kunci "selesai" tetap berlaku hanya setelah toggle pernah dinyalakan | 15 Okt |
| Kabar ke tim undian | **Satu laporan setelah R7**, termasuk pergeseran `period` 17 batch Kilat lama + 1 Iklan berjam kustom akibat `sql/118` di R4. Tidak ada kabar terpisah saat R4 | 15 Okt |
| Kolam 17 halaman Kilat lama | **Dibiarkan** | 7 Okt |
| Laporan ke tim undian | **Menunggu Phase 5 selesai** | 7 Okt |
| Extend Kilat | **Pesan gelombang lagi** untuk survei yang sama. Satu perpanjangan = satu gelombang, dengan aturan dan harga yang sama dengan gelombang pertama. *(Versi 7 Okt menulis "tanpa perpanjangan". Itu tafsiran keliru, dikoreksi di sini)* | 14 Okt |
| Kapan boleh extend | **Sama seperti Iklan**: begitu tidak ada gelombang belum-lunas yang menahan kuota. Boleh menumpuk gelombang yang sudah lunas | 14 Okt |
| Hadiah gelombang tambahan | **Sama seperti Iklan**: di bulan yang sama ikut kolam yang ada, hadiah tidak ditagih lagi, dan undian sekali per bulan. Di bulan baru, kolam baru dan hadiah ditagih | 14 Okt |
| Jarak antargelombang satu order | **Minimal 24 jam**: jendela pengerjaan tidak boleh beririsan | 14 Okt |
| Rilis extend | **Menyusul sebagai Task 5.10**, setelah pintu dibuka (5.9). Fondasi DB dibuat siap-extend sejak 5.2/5.3 | 14 Okt |
| Bentuk tarif Kilat | **Tabel tarif Kilat sendiri per tier**, literal dan bertanggal. **Bukan add-on** | 14 Okt |
| Tingkat tarif Kilat | **2,5 × tarif harian Iklan** per tier pada tanggal yang sama, yaitu harga Iklan 2 hari + 25%. Kilat tidak pernah lebih murah dari Iklan multi-hari, termasuk setelah extend | 14 Okt |
| Tangga perkenalan Kilat | **Ikut tangga Iklan, tetap 2,5× di tiap tanggal** (opsi A). Harga penuh berlaku **1 Jan 2027** | 14 Okt |
| Mulai tarif Kilat | **Bersamaan dengan buka pintu (5.9)**. Sampai saat itu, "Jadikan Kilat" admin tetap memakai rumus lama | 14 Okt |
| JFUTGRX untuk Kilat | **Bebas seperti Iklan**, tanpa batas akun. Risiko satu kuota gelombang terpakai oleh pihak yang tahu kodenya diterima | 14 Okt |

### Tabel tarif Kilat yang diputuskan (per gelombang)

Angka di luar hadiah responden dan PPN, sebelum potongan voucher ambassador (−10%).

| Periode | 1–15 soal | 16–30 | 31–50 | 51–70 | >70 |
|---|---|---|---|---|---|
| *Kilat sekarang (rumus lama)* | *350rb* | *400rb* | *500rb* | *600rb* | *700rb* |
| Harga katalog (dicoret sampai 31 Des) | 500rb | 875rb | 1,25jt | 1,625jt | 2,0jt |
| Efektif: rilis s/d 30 Nov | 375rb | 500rb | 750rb | 1,0jt | 1,25jt |
| Efektif: 1–31 Des | 400rb | 700rb | 1,0jt | 1,3jt | 1,6jt |
| Efektif: mulai 1 Jan 2027 | 500rb | 875rb | 1,25jt | 1,625jt | 2,0jt |

- Lompatan terbesar terjadi **saat rilis** (tier 31–50 +50%, tier >70 +79%), dari harga yang saat ini tidak bisa dibeli peneliti.
- Langkah 1 Des (+7% s/d +40%) dan 1 Jan (+25%) identik dengan langkah Iklan sendiri.
- Harga coretnya nyata, karena memang berlaku 1 Jan 2027 (UU 8/1999, Permendag 50/2020).
- Pembeli Kilat lama: 18 akun, 2 di antaranya masuk 10 besar revenue (Kilat hanya 3 dari 29 order mereka).

## Yang berubah sejak 7 Okt (dan dampaknya ke rencana)

| Perubahan di `main`/produksi | Dampak |
|---|---|
| Nomor SQL kini sampai **`116`**, dengan tiga nomor ganda (`110`, `111`, `116`) dari dua orang yang bekerja paralel | Pakai **`sql/117`** (fondasi), **`sql/118`** (undian) dan **`sql/119`** (extend). Cek `git ls-tree origin/main multi-step-form/sql/` tepat sebelum memberi nomor |
| **Seri pengetatan keamanan** (`sql/110_tighten…`–`116`). Tulisan admin dipindah ke Pages Function (`/api/admin/manual-payment`, `content`, `chat`, `mark-on-credit`, `stop-credit`). **`sql/113` live**: `guard_payment_columns` hanya melewatkan `service_role`. `protect_form_submissions` masih melewatkan email admin | Penjaga kolom Kilat baru meniru pola sekarang: lewatkan `service_role`, email admin (admin masih menulis `form_submissions` langsung lewat policy "Admin Update Submissions"), dan RPC lewat `set_config` lokal. Jangan tambah jalan tulis admin baru dari browser |
| **`survey_pages` ditulis admin lewat `adminContent({action:'patch-pages'})`**. `sql/116` belum diterapkan, tapi kode sudah lewat function | Semua tulisan jendela halaman Kilat (`updateKilatSchedule` 5.4, toggle siaran 5.4b) wajib lewat Pages Function admin. Halaman Kilat swalayan kini berjendela tutup seperti Iklan (keputusan 14 Okt); hanya 17 halaman lama yang tetap `publish_end_date` NULL |
| **Halaman Jadwal & Bayar gabungan** (live 12 Okt). `PaymentCheckoutPage` kini hanya redirect ke `/dashboard/jadwal/:id`. Bentuknya tiket: badan = pilih & kunci, sobekan = bayar. Gerbang uang ada di `utils/jadwalBayarGates.ts`, dan `issueBill` lewat `inFlightGate` | 5.7 menyasar **satu halaman**. Untuk Kilat ada tiga lubang: tombol Kunci memanggil `rebookSlotForSubmission` (aturan 15.00 + `duration`); `billExpiryFor` memakai `paymentCutoffInstant` 14.00; kalendernya per hari |
| `create-payment.js` **sudah mencabut tagihan lama** jadwal yang sama saat tanggal pindah (`supersededBills` + DOKU cancel inline) | Pilih ulang gelombang tidak butuh logika pembatalan baru. Pastikan `billed_start_date` membawa jam gelombang |
| `create-payment.js` menghargai jadwal ke-2 dst. lewat `pricingRowForSchedule` dengan jenis distribusi **order**, dan hadiah hanya ditagih bila `is_new_period` | Harga extend Kilat (5.10) otomatis memakai tabel 5.1, tanpa kode harga baru |
| Kartu **"Perpanjang Masa Tayang Iklan"** (`316c610`) | Kilat masih terkunci (`SchedulePhase.tsx:988`, `canScheduleAgain.ts:50`). Dibuka di 5.10 |
| `sql/111` (kuota harian, AFTER trigger) live | Pola untuk penjaga kuota gelombang |

**Yang tidak berubah (diverifikasi 14 Okt):**
- CHECK `kilat_slot_hour` masih `8/11/14/17`.
- `get_batch_rewards_bulk` dan `assert_schedule_window_free` masih tanpa cabang Kilat.
- `ad_schedules` sudah punya kolom `kilat_slot_hour` dan `distribution_type`.
- `submitOrder.ts:111-147` masih memeriksa kuota per hari.
- Kartu Kilat (`CreateOrderCards.tsx:22`) masih `comingSoon`.
- `StepCheckout.tsx:342-345` masih menampilkan durasi Kilat.

## Task

Aturan umum yang berlaku di semua task:
- SQL diserahkan ke user untuk dijalankan di SQL Editor (bukan lewat MCP), lengkap dengan dry-run dan rollback, dan diuji dulu di PGlite (pola `sql/111`). SQL diterapkan **sebelum push**, karena push ke main = deploy.
- Setiap fungsi baru: cabut `PUBLIC`, `anon` dan `authenticated`, beri `GRANT` seperlunya, lalu verifikasi `proacl`.
- Rencana atau dokumen yang disentuh diberi STATUS NYATA di commit yang sama.
- Tes yang memanggil handler/RPC sungguhan, bukan sekadar membaca teks.

### 5.1 — Tarif Kilat bertanggal (jalur uang, tidak bergantung pada task lain, boleh rilis paling awal)

Berlaku untuk **semua** order Kilat sejak tanggal mulai, termasuk yang dibuat admin lewat "Jadikan Kilat". Tidak ada SQL baru. Verifikasi dulu bahwa tidak ada fungsi DB yang menghitung harga Kilat.

- **`constants.ts`**:
  - `KILAT_RATE_SCHEDULE`: entri literal `list`/`effective`/`introUntil` per tanggal, sesuai tabel di atas. Entri berlaku mulai `KILAT_TARIFF_FROM`, lalu `2026-12-01`, lalu `2027-01-01`.
  - **`KILAT_TARIFF_FROM`** = `null` saat 5.1 di-merge (selalu rumus lama), lalu diisi **tanggal literal hari buka pintu** di commit 5.9, di klien dan `create-payment.js` sekaligus (tes paritas menjaga keduanya). Jangan berlaku surut ke 1 Okt: order Kilat yang sudah dikutip dengan rumus lama tidak boleh ditagih berbeda saat dibayar. Kalau deploy jatuh sesudah 1 Des, baris "s/d 30 Nov" tidak pernah berlaku.
  - `KILAT_ADDON_COST*` hanya dipertahankan untuk jalur lama.
- **`cost-calculator.ts`**: `kilatRateAt(q, atMs)`. Instan tarif < `KILAT_TARIFF_FROM` memakai **rumus lama** (tarif Iklan efektif + Rp200rb, tidak berubah sepeser pun); sesudahnya memakai tabel. Cabang Kilat di `calculateTotalCost` memakainya; insentif dan PPN tetap.
- **Voucher Kilat** (satu sumber, `VOUCHER_CATALOG`):
  - tiap entri mendapat penanda **berlaku untuk Kilat**: `true` hanya untuk 12 kode ambassador dan JFUTGRX;
  - diskon Kilat = 10% tarif Kilat untuk kode ambassador, rumus JFUTGRX untuk JFUTGRX, selain itu 0;
  - kevalidan tetap dinilai pada `created_at` order;
  - `getVoucherInfo` sadar produk, sehingga kode tak berlaku menghasilkan pesan "tidak berlaku untuk JFU Kilat";
  - order Kilat lama (instan < tanggal mulai) tetap tanpa diskon, sesuai yang dulu disetujui.
- **`create-payment.js`**:
  - salinan literal tabel + tanggal mulai;
  - `computeTotalCostFromSubmission` memakai tabel dan aturan voucher Kilat yang sama (salinan literal daftar kode yang berlaku untuk Kilat; kode lain pada baris Kilat diabaikan);
  - baris struk "Add-on JFU Kilat" menjadi satu baris tarif Kilat per tier (+ baris "Harga perkenalan" bila efektif < katalog).

  Jadwal ke-2 dst. (5.10) otomatis ikut lewat `pricingRowForSchedule`.
- **Titik tampil & hitung lain** (pola sama: ganti "tarif dasar + add-on" dengan satu baris tarif Kilat):
  - `orderMoneyLines.ts`, `scheduleMoney.ts`;
  - `invoiceItems.ts`, `groupedInvoice.ts` (invoice admin);
  - `DistributionConvertDialog`/`DistributionSection` + `convertDistributionType` (`supabase.ts`);
  - `PriceCalculatorWidget` (chat);
  - `miminPricing.ts` (tarif Kilat disusun dari tabel, seperti tarif Iklan);
  - `types.ts`;
  - `translations.ts` (`kilatBenefitPrice`, `kilatFactPrice`, `costLineKilatAddon`, `orderCompanionKilatAddon`).

  Order lama (instan tarif < tanggal mulai) tetap menampilkan baris add-on, karena itu yang benar-benar ditagih.
- **Tes**:
  - perluas `rateSchedule.spec.ts`: paritas klien ↔ `create-payment.js` untuk tabel Kilat;
  - invarian "**Kilat efektif = 2,5 × Iklan efektif**" (sehingga selalu > Iklan 2 hari) di setiap tier dan setiap batas tanggal;
  - voucher Kilat, klien = server: ambassador −10% dari tarif saja, JFUTGRX = Rp1.000, JFUFEB/ILKOMUNY/TEGARGANTENG = 0;
  - instan sebelum `KILAT_TARIFF_FROM` menghasilkan angka rumus lama;
  - perbarui `orderMoneyLines`/`groupedInvoice`/`billedLinesMatch` spec.
- **Dokumen & komunikasi**:
  - baris README transisi harga dibetulkan (hapus klaim "Kilat Rp200rb di 2027"), dan tabel Kilat dicatat di rencana ini dan di dokumen transisi;
  - tabel jadwal harga di dokumen transisi diberi catatan bahwa Okt–Nov yang dideploy = harga lama, bukan 120/210/…;
  - usulan: kartu tarif 2027 memuat Kilat, dan 2 akun 10 besar yang pernah membeli Kilat dikabari.
- **Titik tinjau (usulan, belum diputuskan)**: setelah 20 order Kilat swalayan atau 31 Jan 2027, mana yang lebih dulu. Pantau order lunas, rasio dibuat → dibayar, dan pergeseran porsi Iklan 2 hari. Patokan "1 gelombang ≈ hasil 2 hari Iklan" masih klaim copy, belum hasil ukur.

### 5.2 — Fondasi reservasi gelombang (`sql/117_kilat_swalayan.sql`)
- **CHECK** `kilat_slot_hour` diperluas ke `IN (8,11,14,15,17)`. Nilai lama dipertahankan demi riwayat; pilihan baru dibatasi di RPC.
- **Siap-extend.** Ketiga penjaga di bawah berlaku untuk **kedua kaki**: jadwal pertama (cermin ordinal 1) dan baris perpanjangan. Gelombang dibaca dari jam WIB `ad_schedules.start_date`. Pintu extend-nya sendiri baru dibuka di 5.10.
- **Penjaga irisan sadar gelombang.** `assert_schedule_window_free` dan `assert_no_schedule_overlap` menghitung jendela Kilat sebagai `kilat_instant_of(start, jam)` → `kilat_instant_of(end, jam)`, bukan 15.00. Hasilnya aturan "jarak minimal 24 jam" tanpa kode tambahan, dan tidak ada lagi penolakan palsu untuk gelombang 11.00.
- **Penjaga kuota gelombang**: trigger AFTER INSERT OR UPDATE di `ad_schedules` untuk baris Kilat, meniru `sql/111`:
  - hanya klaim baru yang dicek;
  - satu advisory lock;
  - predikat penahan kuota memakai `ad_schedule_occupies_daily_quota`;
  - HINT `kilat_wave_full`;
  - bayar telat untuk hold kedaluwarsa tetap diterima (D3 `sql/111`).
  - Berlaku untuk semua penulis, termasuk admin. Harus AFTER: upsert sinkron menyalakan BEFORE INSERT.
- **`get_kilat_wave_occupancy(p_from, p_to)`**: SECURITY DEFINER untuk `authenticated`. Mengembalikan hitungan per (hari, jam) dari kedua kaki, tanpa identitas. Jendela dibatasi ≤ 31 hari.
- **Tanpa RPC reservasi.** Kilat memakai jalur tulis yang sama dengan Iklan: INSERT di `submitOrder` dan UPDATE di `rebookSlotForSubmission`. Aturannya ditegakkan trigger.
- **Trigger validasi Kilat di `form_submissions`** (BEFORE INSERT OR UPDATE). Hanya untuk baris Kilat; `service_role` dan email admin dilewatkan. Dicek hanya pada **klaim baru**, yaitu INSERT bertanggal, atau tanggal/jam/`slot_reserved_at`/`slot_booked_by` berubah (pola D4 `sql/111`). Bayar, catatan admin dan pelepasan slot tidak diperiksa ulang. Isinya:
  - jam ∈ {11, 15};
  - Senin–Jumat dan **bukan tanggal libur aktif** di `operational_holidays` (5.4b);
  - `now()` ≤ gelombang − 2 jam;
  - `end_date = start_date + 1` (**wajib**, karena tanggal NULL membuat halaman dan undian beku tanpa tanda);
  - `duration` dipaksa 1;
  - `distribution_type` tidak boleh berubah setelah INSERT;
  - `slot_booked_by = 'admin'` ditolak.

  Galatnya memakai HINT yang bisa dipetakan frontend (`kilat_wave_closed`, `kilat_wave_invalid`). Jalur manual tetap tanpa tanggal, persis Iklan (Track B1, ditegakkan di `submitOrder`). Grep dulu jalur peneliti yang sah sebelum menolak apa pun.
- **Cron pelepas** (`release_expired_order_slots`, `sql/94`): ikut meng-NULL-kan `kilat_slot_hour`.

### 5.3 — Undian & halaman buta jenis (`sql/118_undian_buta_jenis.sql`, setelah `sql/117`)
> *Dikerjakan 15 Okt (branch `feat/kilat-undian-siaran`): `sql/118` memuat 5.3 **dan** bagian SQL 5.4b (kolom siaran, penjaga+reset, backfill 17) plus RPC toggle `kilat_broadcast_start/_end/_undo` — logika satu-arah, "boleh terlambat", dan "batal hanya tanpa responden" ditegakkan DB, bukan Pages Function. Satu rumus jendela `airing_window_start/_end` dipakai undian, `ensure_survey_page` (lewat `kilat_page_window`) dan RPC toggle. Snapshot keluaran undian sebelum migrasi disimpan di `backup.r118_rewards_before` untuk laporan tim undian (R7).*
Temuan 14 Okt (baca-saja di produksi):
- `/api/respondents` **sudah buta jenis**: tidak ada filter `distribution_type`, dan Mode 2 (`get_batch_rewards`) hanya membungkus `get_batch_rewards_bulk`. Satu implementasi, **`respondents.js` tidak diubah**.
- Asimetrinya ada di **sumber jendela**: kaki ordinal 1 membaca `form_submissions` + `airing_instant_of_date` (15.00 terpatok), kaki perpanjangan membaca instan nyata `ad_schedules`. Akibatnya Kilat dan **131 order Iklan berjam kustom** (`airing_hour_wib`) dilaporkan berjendela 15.00.
- Cermin ordinal 1 di `ad_schedules` sudah memegang instan yang benar untuk ketiga kasus (jam kustom, gelombang Kilat, 15.00). Semua 1.035 submission punya cermin.
- `period_batch` kedua kaki sudah satu aturan (bulan `end_date` WIB): 0 selisih di 39 baris perpanjangan dan seluruh ordinal 1.

Perubahan:
- **`get_batch_rewards_bulk`**: kaki ordinal 1 mengambil jendela dari cermin `ad_schedules` (LEFT JOIN ordinal 1; jatuh ke `airing_instant_of_date` bila tak ada). Kedua kaki memakai **satu rumus tanpa cabang `distribution_type`**:
  - `sd = COALESCE(broadcast_at, start_date)`;
  - `ed = COALESCE(broadcast_ended_at, broadcast_at + (end_date − start_date), end_date)`.

  Iklan tidak pernah punya kedua kolom itu, jadi nilainya tidak berubah. `can_select_winners` tetap `NOT has_active` (`ed > now()`); toggle mati membuatnya `true` seketika lewat `ed` yang sama.

  Siapa yang ikut, status, hadiah, `winner_count`, `period_batch`, bentuk `batches` dan `can_select_winners` **tidak berubah**. Kontrak beku utuh; yang berubah hanya nilai `period.start/end`.
- **`compute_extend_period_batch`**: dinormalkan ke bulan **WIB** (`end_date AT TIME ZONE 'Asia/Jakarta'`) supaya aturannya identik dengan ordinal 1 secara definisi, bukan kebetulan. Dry-run harus 0 baris berubah.
- **`ensure_survey_page`** (baca definisi live dulu; jangan salin dari sql/42/55): cabang `publish_end_date = NULL` untuk Kilat diganti `kilat_instant_of(end_date, jam)`. Halaman Kilat baru lahir dengan **jendela sementara** [gelombang, +24 jam), sehingga tetap terbuka walau admin lupa menandai, lalu dijangkarkan ulang oleh tombol 5.4b. Halaman lama tidak disentuh. Komentar "NULL BUKAN KELALAIAN" diganti alasan baru. Konsekuensi: `storage-cleanup.js` kini ikut membersihkan banner Kilat, sama dengan Iklan.
- **Dry-run**: daftar pergeseran `period.start/end` (perkiraan: 17 batch Kilat lama ke jam gelombangnya, 1 order Iklan berjam kustom yang punya halaman); `period_batch` 0 berubah; bandingkan `pg_get_functiondef` live dengan salinan rollback.
- **Batas waktu**: hidup sebelum gelombang swalayan pertama tayang (5.9).

### 5.4 — Aturan waktu & konstanta (+ admin)
- **`constants.ts`**: `KILAT_SLOT_HOURS = [11, 15]`, sehingga `MAX_KILAT_ADS_PER_DAY` = 4. Tambah `KILAT_BOOKING_LEAD_MIN = 120`, `KILAT_PAY_LEAD_MIN = 60`, dan bendera `KILAT_SELF_SERVE_OPEN = false`.
- **`airing-window.ts`**: `kilatWaveInstant`, `isKilatWaveBookable`, `kilatPayDeadline` (+ `kilatBookingClosesAt`, `nextWibWorkdays`). Semuanya sadar WIB. *(Dikerjakan R2, 15 Okt: cermin `create-payment.js` DITUNDA ke R6 — server belum punya helper WIB apa pun dan konsumennya baru ada di 5.7; spec paritasnya ikut R6. Batas pesan klien ⇄ `kilat_booking_closes_at` sql/117 dikunci `kilatWaveRules.spec.ts`.)*
- **Admin**: `KilatScheduleStep` dan `KilatScheduleBoard` memakai jam baru, sementara jam lama tetap dirender untuk riwayat. Di jalur manual, admin tetap boleh menugaskan gelombang setelah cutoff (trigger melewatkan admin), tetapi picker admin memberi peringatan bila sisa waktu bayar peneliti < 60 menit.
- **Data lama (dicek 14 Okt)**: tidak ada order Kilat bertanggal ke depan. Ada 3 order Kilat lama `slot_reserved`/`pending` bertanggal lampau dengan jam 11/14/17 (`e56f4853`, `4a112eae`, `be488b57`). Trigger 5.2 tidak boleh menolak UPDATE non-klaim pada baris ini (cron, catatan admin).
- **`updateKilatSchedule`**: sinkron jendela halaman lewat `adminContent({action:'patch-pages'})`:
  - `publish_start_date` dan `publish_end_date` = jendela sementara gelombang baru [gelombang, +24 jam);
  - filter `submission_id` + `auto_closed_at IS NULL`;
  - untuk **halaman Kilat lama** (`publish_end_date` NULL) hanya `publish_start_date` yang disentuh, agar tautannya tetap hidup.

  `broadcast_at` direset oleh trigger 5.4b.

  Pastikan `contentGate.js` menerima patch ini.

### 5.4b — Kalender libur operasional & badge admin (sebelum 5.9)
Tabel libur masuk `sql/117` (dibaca trigger 5.2). **Kolom siaran + trigger reset + backfill masuk `sql/118`**, bersama rumus undian yang membacanya, supaya kolom, pembaca, dan toggle-nya hidup di rilis yang sama (R4). Berlaku untuk Iklan dan Kilat.

- **Tabel `operational_holidays`** (`holiday_date` PK, `label`, `is_active`, `updated_at`, `updated_by`):
  - RLS: SELECT untuk `anon` + `authenticated` (hanya tanggal dan label); **tanpa policy tulis**;
  - tulis lewat Pages Function admin baru `/api/admin/holidays` (service_role + cek `ADMIN_EMAILS`), mengikuti seri keamanan `sql/110`–`116`. Tidak ada jalan tulis dari browser;
  - dibaca trigger validasi Kilat (5.2) dan `get_kilat_wave_occupancy` (tanggal libur dikembalikan sebagai tertutup).
- **Halaman admin "Hari Libur"** (menu sidebar baru):
  - kalender bulan: klik tanggal → saklar aktif/nonaktif + label (mis. "Natal");
  - bila tanggal yang diaktifkan sudah punya gelombang Kilat terpesan/lunas, tampilkan peringatan + daftar order-nya. Trigger hanya memeriksa klaim baru, jadi admin yang menangani pemindahan/kontak secara manual.
- **Efek ke peneliti**:
  - **Kilat**: tanggal libur tidak bisa dipilih (picker + trigger);
  - **Iklan otomatis**: kalender tidak berubah, iklan tetap tayang;
  - **Pemberitahuan admin libur**: pada hari libur aktif (WIB), banner di dashboard peneliti, halaman status order, dan halaman chat Mimin: "Hari ini tim admin libur ({label}). Iklan tetap tayang otomatis. Review & penjadwalan manual, lapor kendala dan komplain dilayani mulai {hari kerja berikutnya}." Helper `nextWorkingDay()` (Senin–Jumat, melewati tanggal libur aktif) di `airing-window.ts`;
  - copy jalur manual ("maks 2 hari kerja") diberi keterangan bahwa hari libur tidak dihitung; banner di atas yang memberi tanggal konkret saat libur.
- **Badge angka di tab Iklan / Kilat** (`InternalDashboard.tsx:1370`, gaya badge Conversations di `InternalDashboardWithLayout.tsx`):
  - satu predikat `adminActionOf(submission)` di util tersendiri (dites), memakai state yang sama dengan `deriveOrderUiState`: `review_manual`, `awaiting_admin_schedule`, `awaiting_invoice`;
  - **Iklan** = jumlah order non-Kilat yang menunggu admin;
  - **Kilat** = jumlah order Kilat yang menunggu admin + **gelombang lunas yang belum disiarkan**;
  - dihitung dari kueri ringan tersendiri, **bukan** dari halaman baris yang sedang dimuat (daftar dipaginasi); diperbarui saat dibuka, tiap ±5 menit, dan setelah admin bertindak (pola event seperti Conversations);
  - klik badge menyaring daftar ke "Perlu ditangani";
  - tab strip sekarang hanya desktop; badge juga tampil di pemilih jenis versi mobile bila ada.
- **Toggle siaran Kilat** (pengganti tombol "Tandai sudah disiarkan"), sekaligus **pembuka/penutup jendela halaman dan undian**:
  - letak: drawer Submissions → **tab Page** (`submissions/tabs/PageTab.tsx`, tempat admin menyalin tautan untuk push), plus status ringkas di `KilatScheduleBoard`;
  - kolom per gelombang `ad_schedules.broadcast_at`/`broadcast_by` dan `broadcast_ended_at`/`broadcast_ended_by`, sehingga gelombang perpanjangan (5.10) ikut otomatis;
  - **tiga keadaan, satu arah**:

    | Keadaan | Tampilan | Halaman | API undian |
    |---|---|---|---|
    | Belum disiarkan | toggle mati; aktif mulai gelombang − 60 menit | jendela sementara [gelombang, +24 jam) | jendela gelombang |
    | **Sedang disiarkan** | toggle nyala + "tutup otomatis {waktu}" | [nyala, +24 jam) | `active`, `can_select_winners: false` |
    | **Selesai disiarkan** | chip terkunci "Selesai {waktu}" | tutup ("Survey sudah berakhir") | `closed`, `can_select_winners: true` |

  - **nyala**: aksi `/api/admin/content` `broadcast-start` (cek `contentGate.js`) menulis `broadcast_at = now()` dan menjangkarkan jendela halaman ke [`broadcast_at`, +24 jam) (filter `submission_id` + `auto_closed_at IS NULL`). Hanya untuk gelombang lunas/tempo;
  - **mati**: aksi `broadcast-end` menulis `broadcast_ended_at = now()` dan `publish_end_date = now()`. Dialog konfirmasi memuat jumlah responden terdaftar: "N responden. Tutup halaman dan pemenang bisa dipilih?";
  - **otomatis selesai**: tanpa cron. Jendela halaman sudah berakhir di +24 jam, dan rumus 5.3 memberi `ed` yang sama, sehingga UI cukup membaca waktu;
  - **boleh dinyalakan terlambat** (keputusan 15 Okt): selama belum pernah nyala, toggle tetap aktif walau jendela sementara sudah habis. Dialog memperingatkan bahwa halaman dan undian dibuka lagi;
  - **terkunci setelah selesai** (server menolak menyalakan lagi), karena membuka ulang setelah pemenang bisa dipilih menghidupkan lagi masalah pendaftar-setelah-undian. Salah nyala hanya bisa dibatalkan selama belum ada responden sejak `broadcast_at` (memulihkan jendela sementara);
  - badge Kilat menghitung gelombang lunas yang masih **belum disiarkan**; "sedang disiarkan" tampil sebagai chip, tidak menambah angka;
  - trigger meng-NULL-kan kedua kolom bila tanggal/jam gelombang berubah (pilih ulang). Upsert `sync_ad_schedule_from_submission` tidak mendaftarkan kolom ini (dicek di definisi live 14 Okt); kunci dengan uji PGlite;
  - backfill: gelombang Kilat lunas yang sudah lewat diisi `broadcast_at = start_date`, `broadcast_ended_at = end_date`, `*_by = 'backfill'`, agar badge tidak dibuka dengan 19 tunggakan palsu. Jendela undiannya tetap sama dengan jadwal;
  - email "mulai tayang"/"selesai" tetap memakai instan jadwal (selisih dengan toggle diterima).

### 5.5 — Pemilih gelombang peneliti
- **`KilatWavePicker`** + hook **`useKilatWaveAvailability`** (lewat RPC okupansi `get_kilat_wave_occupancy`, 5.2). Menampilkan 10 hari kerja × 2 gelombang beserta sisa kuota. Gelombang yang penuh atau lewat cutoff dinonaktifkan. Hanya satu gelombang yang bisa dipilih. Logika grid diambil dari `KilatScheduleStep`.
- Dipakai di **Step 3 wizard** (`StepSchedule mode="kilat"`, posisi yang sama dengan kalender Iklan) dan di badan tiket **Jadwal & Bayar** untuk mode Kilat. Di 5.10 juga dipakai `JadwalBaruPage`.

### 5.6 — Pintu masuk & wizard (di balik bendera)
- **Kartu Kilat** (`CreateOrderCards.tsx:22`) membuka modal mekanisme Kilat sendiri, sejajar `AdsEntryModal`: push di gelombang pilihan, satu gelombang, dan **tabel tarif Kilat 5.1** (varian `RateTable`/`RateNoticeBlock`). Lalu gerbang profil, lalu `/dashboard/submit-iklan?product=kilat`. `?product=kilat` diabaikan selama bendera mati, kecuali untuk admin.
- **Satu pintu, alur identik Iklan**:
  - jenis order ditetapkan oleh pintu yang dipakai;
  - urutan langkah **sama**: Detail → Ringkasan → **Step 3** (pemilih gelombang) → "Kunci Jadwal & Lanjut Bayar";
  - **dicabut**: jalan memutar Step 4 → kembali ke Ringkasan, `goToKilatSchedule`/`undoKilatUpgrade`/`handleKilatBack`, field `regular*Backup`/`kilatStart*`, tombol upgrade di Ringkasan (`StepCheckout.tsx:605`), gerbang `isKilatEligible`, dan banner "Kembali ke Iklan Regular";
  - draft lama berflag Kilat divalidasi ulang.
- **Pengecualian 1: konfigurasi Step 1 tanpa durasi** (`StepOneFormFields`):
  - `DurationPicker` dan ramalan ketersediaan slot N harinya disembunyikan untuk Kilat;
  - `duration` dipaksa 1 secara internal dan tidak pernah tampil. `orderReadiness.ts:21` mewajibkannya ada, dan default 2 hari (`:155`, `defaultFormData.ts:15`) tidak boleh berlaku untuk Kilat;
  - kriteria responden, jumlah pemenang (2–5), dan hadiah per pemenang tetap identik.
- **Pengecualian 2: Step 3 = pemilih gelombang** (5.5), dengan tombol "Kunci Jadwal & Lanjut Bayar" yang sama.
- **Voucher: kolomnya tetap ada, sama seperti Iklan.** Validasinya sadar produk (5.1):
  - kode yang tidak berlaku untuk Kilat ditolak dengan pesan dan **tidak disimpan** (pola `ilkomunyBlocked`);
  - akibatnya JFUFEB/ILKOMUNY tidak bisa membelokkan Kilat ke antrean admin lewat `isAutoApprovalPath`;
  - baris diskon ambassador tampil di Ringkasan dan kartu harga seperti Iklan.
- **`submitOrder.ts`** (satu fungsi untuk kedua produk, seperti sekarang):
  - jalur otomatis: **satu INSERT** bertanggal + `kilat_slot_hour` + hold `'user'`, persis Iklan. `start_date` = tanggal gelombang (bukan instan 15.00), `end_date` = +1 hari;
  - cek browser per hari (`:130-132`) diganti per gelombang, dan galat trigger (`kilat_wave_full`, `kilat_wave_closed`) dipetakan seperti `isDailyQuotaFullError`;
  - jalur manual: **tanpa gelombang**, tidak berubah dari sekarang (Track B1). Setelah disetujui, admin menugaskan gelombang lewat `KilatScheduleStep`, dan copy `awaiting_admin_schedule` untuk Kilat menyebut "gelombang";
  - setelah submit, alirkan ke `/dashboard/payment/:id` → Jadwal & Bayar, seperti Iklan.

### 5.7 — Jalur bayar Kilat di halaman Jadwal & Bayar (jalur uang)
- **`handleLock`** (`JadwalDanBayarPage.tsx:469-486`): tetap memanggil **`rebookSlotForSubmission`**, fungsi yang sama dengan Iklan, yang kini menerima jam gelombang. Untuk Kilat, fungsi itu menulis `kilat_slot_hour`, tanggal gelombang, dan `end` = +1 hari, alih-alih 15.00 + `duration`. Tanpa jam gelombang, panggilan Kilat ditolak, dan trigger 5.2 menegakkan sisanya.
- **`billExpiryFor`** (`jadwalBayarGates.ts:98-105`): untuk Kilat batasnya `kilatPayDeadline` (gelombang − 60 menit), bukan 14.00. Hitung mundur di sobekan dan penanda "lewat batas bayar" (`deriveOrderUiState`) ikut.
- **`shouldAutoMint` / `canRepickInPlace`**: tambah kasus Kilat ke tes. Sampai 5.10, order Kilat selalu berjadwal tunggal; setelahnya gelombang perpanjangan ikut aturan Iklan untuk jadwal ke-2 dst.
- **`create-payment.js`**:
  - tolak Kilat tanpa gelombang atau yang sudah lewat gelombang − 60 menit;
  - umur link DOKU = min(sisa hold, batas bayar);
  - `billed_start_date` membawa jam gelombang.
- **Webhook** tidak diubah.

### 5.8 — Copy tanpa durasi & kebersihan
- **Layar peneliti** hanya menampilkan **tanggal + "Gelombang HH.00 WIB"**. Yang dibuang: "{n} hari", "N×24 Jam", "Tayang penuh selama 1 hari", `kilatDuration`/`kilatInstant24h`, dan "Mulai 15.00 WIB" untuk Kilat. Lokasinya: `StepCheckout.tsx:342-345`, `SchedulePicker`, `OrderLiveCompanion`, sobekan tiket, `SchedulePhase`, `translations.ts`.
- **Email & kuitansi** (temuan tinjauan 14 Okt): `functions/api/doku/_payment-receipt.js:558-568` menulis "(1 Hari) (Kilat)". Untuk Kilat ganti dengan "tanggal · Gelombang HH.00 WIB". Subjek `notify-ad-live.js:49-50` ("Iklan surveimu mulai tayang") diberi varian Kilat. Periksa juga `notify-ad-completed.js` dan `send-invoice-ready-email.js`.
- **Copy pemasaran** (mis. "~2 jam", "hasil 2 hari dalam 2 jam") disodorkan ke pemilik produk.
- **Kebersihan**:
  - perbaiki prompt bawaan Mimin (`ChatPage.tsx` ~226);
  - tambah penjaga Kilat di `JadwalBaruPage` (sampai 5.10);
  - hapus kunci i18n Kilat yang mati.

### 5.9 — Uji ujung-ke-ujung, buka pintu, dokumen penutup
- **Uji di browser** (`wrangler pages dev dist`) memakai akun uji dan bendera admin, termasuk **satu pembayaran DOKU nyata** gelombang 15.00 dengan **tarif baru** dan voucher **JFUTGRX** (Rp1.000). Uji dijalankan pada build commit buka pintu (isi `KILAT_TARIFF_FROM` + `KILAT_SELF_SERVE_OPEN = true` + cabut `comingSoon`) sebelum di-push.
- **Dokumen**:
  - rencana ini ditulis ke `docs/superpowers/plans/2026-10-14-phase-5-kilat-swalayan.md`;
  - baris di README, dengan Phase 5 = Task 5.0 + 5.1–5.10 (5.10 berstatus ⬜);
  - STATUS NYATA di rencana 18 Agu;
  - saran basi "jalankan ulang sql/42" diganti `sql/95`;
  - memori `kilat-slots-and-admin-bridge` dan `kilat-addon-regression-soft-dna-branch` diperbarui (jam 11/15, tarif tabel, voucher ambassador & JFUTGRX menggantikan "Kilat tanpa diskon").
- **Rencana undian 7 Okt** — §Titik singgung diisi jawaban berikut:
  1. undian **buta jenis**: jendela setiap batch = [saat iklan benar-benar mulai, + panjang jendela) dari satu rumus (`sql/118`). Untuk Kilat, mulai/selesainya mengikuti toggle siaran (maks. 24 jam), dan `period_batch` memakai aturan yang sama dengan Iklan;
  2. **satu aturan pembagian responden untuk semua survei**: batch terakhir yang `period.start` ≤ `submitted_at` (helper §1 rencana itu). Laporan **tidak** memuat pengecualian Kilat. Halaman Kilat swalayan tutup 24 jam setelah disiarkan, jadi pendaftar telat sebatas pengisi yang sudah mulai sebelum tutup, sama dengan Iklan;
  3. bentuk data dan `can_select_winners` tidak berubah, hanya nilai `period.start/end` (Kilat lama → jam gelombangnya, Iklan berjam kustom → jam kustomnya). Sejak 5.10, satu order Kilat bisa punya lebih dari satu batch bila gelombangnya beda bulan.

  4. pergeseran `period` akibat `sql/118` (R4): daftar 17 batch Kilat lama + 1 Iklan berjam kustom, nilai lama → baru, dan tanggal penerapannya.

  Penyebab "40/40" dikoreksi menjadi artefak backfill + kebocoran feed 18 Sep (11.12–11.57, sebelum penyaring `e5b73bc`).

### 5.10 — Extend Kilat: pesan gelombang lagi (setelah 5.9)
Prasyarat: pintu Kilat sudah terbuka, dan minimal satu order Kilat swalayan sudah tayang serta dibayar dengan benar.
- **SQL (`sql/119`, nomornya dicek ulang)**: `create_ad_schedule` menerima Kilat dari peneliti.
  - Jam wajib ∈ {11, 15}.
  - Cek: Senin–Jumat, H-2 jam.
  - Tulis `kilat_slot_hour`, `duration = 1`, `end = start + 24 jam`.
  - Kuota, irisan dan bulan undian sudah dijaga sejak 5.2/5.3.
  - ⚠️ Perubahan signature menuntut DROP/CREATE + hibah ulang + verifikasi `proacl`; hindari overload ganda. Baca definisi live dulu.
- **Gerbang**: cabut blok `'kilat'` di `canScheduleAgain.ts:50` (`order_inactive` dan `quota_held` tetap). Kartu Perpanjang di `SchedulePhase.tsx:988` tampil untuk Kilat sebagai **"Pesan gelombang lagi"**, tanpa durasi.
- **`JadwalBaruPage`** memakai `KilatWavePicker` (5.5), lalu mengalir ke Jadwal & Bayar, yang sudah sadar gelombang sejak 5.7.
- **Harga**: tanpa kode baru. `pricingRowForSchedule` memakai jenis distribusi order, sehingga tabel Kilat 5.1 dipakai pada `rate_locked_at` jadwal, dan hadiah hanya ditagih bila `is_new_period`. Kunci dengan tes untuk kasus bulan sama vs bulan baru. ⚠️ Pengecualian (temuan audit invoice 15 Okt): prefill invoice admin jadwal perpanjangan (`buildExtensionInvoiceItems`, `invoiceItems.ts`) masih menghitung tarif harian Iklan × durasi, sedangkan server (`buildNoteItems`) sudah memakai tabel Kilat. Tambahkan cabang Kilat (satu baris "JFU Kilat (1 gelombang)" + voucher Kilat) dan tes paritas admin = server.
- **Admin**:
  - `fetchKilatSchedule`/`KilatScheduleBoard` membaca kedua kaki dari `ad_schedules`;
  - `ScheduleForm` untuk baris perpanjangan Kilat memakai `KilatScheduleStep`, atau mengunci edit.
- **Halaman**: tautan sama. Jendelanya dipindah ke gelombang perpanjangan oleh `cron_activate_extends`, seperti Iklan (cabut blok Kilat bila ada; baca definisi live). Lalu toggle siaran gelombang itu menjangkarkannya, sama dengan gelombang pertama.
- **Email**: periksa notifikasi "tayang"/"selesai" untuk baris perpanjangan. Kalau belum sesuai, cukup dicatat dulu.

## Gelombang rilis (R1–R8)

Prinsip pemotongan:
- satu rilis = **satu jenis risiko**;
- jalur uang (R1, R6) tidak pernah sekapal dengan perubahan SQL;
- setiap berkas SQL dirilis **bersama konsumennya**, tidak lebih awal;
- pekerjaan di balik bendera boleh di-merge kapan saja.

Rilis berikutnya baru dimulai setelah **gerbang** rilis sebelumnya lulus di produksi.

| Rilis | Isi | SQL | Siapa yang merasakan | Gerbang lanjut |
|---|---|---|---|---|
| **R1 — Tarif tidur** | 5.1 (`KILAT_TARIFF_FROM = null`) | — | Tidak ada (angka identik) | Adu ulang produksi: `total_cost` setiap order Kilat belum lunas tidak berubah; paritas klien = `create-payment.js` |
| **R2 — Fondasi gelombang** | `sql/117` (CHECK jam, penjaga irisan & kuota gelombang, trigger validasi, okupansi, tabel libur kosong, cron pelepas) + 5.4 tanpa sinkron halaman (konstanta, helper `airing-window`, picker admin 11/15) | `sql/117` | Admin ("Jadikan Kilat" kini 11/15) | 48 jam tanpa galat `kilat_wave_*` palsu di `query_logs`; 3 order macet (`e56f4853`, `4a112eae`, `be488b57`) tetap bisa disentuh cron/catatan admin |
| **R3 — Libur & badge** | 5.4b bagian libur + badge (tanpa hitungan siaran) | — | Admin; peneliti hanya di hari libur (banner) | Libur Okt 2026–Jan 2027 **sudah diisi** admin; badge = hitungan manual di produksi |
| **R4 — Undian & siaran** | `sql/118` (kolom siaran + reset + backfill, `get_batch_rewards_bulk` buta jenis, `compute_extend_period_batch` WIB, `ensure_survey_page`) + toggle siaran + sinkron halaman `updateKilatSchedule` + badge menghitung "belum disiarkan" | `sql/118` | Admin; API undian (nilai `period` 17 batch lama + 1 Iklan berjam kustom bergeser) | Satu order uji "Jadikan Kilat" menjalani linimasa toggle penuh di produksi, dan `/api/respondents` dicek di tiap keadaan. Tim undian tidak dikabari terpisah (laporan setelah R7) |
| **R5 — Pintu tersembunyi** | 5.5 + 5.6 + 5.8 (di balik bendera; copy 5.8 sekaligus membetulkan tampilan order Kilat admin) | — | Admin lewat `?product=kilat`; copy Kilat untuk semua | Admin membuat order Kilat lewat wizard sampai Jadwal & Bayar (tanpa bayar) |
| **R6 — Jalur bayar Kilat** | 5.7 | — | Order Kilat yang sudah ada (batas bayar jadi gelombang − 60 menit) | Uji handler `create-payment.js` + tagihan terbit sekali lalu dibatalkan; tanpa bayar sungguhan |
| **R7 — Buka pintu** | 5.9: isi `KILAT_TARIFF_FROM` + `KILAT_SELF_SERVE_OPEN = true` + cabut `comingSoon` + dokumen | — | Semua peneliti | Uji ujung-ke-ujung + **satu bayar DOKU nyata** (JFUTGRX, Rp1.000) pada build ini sebelum push. Lalu pantau 3 order swalayan pertama |
| **R8 — Extend** | 5.10 | `sql/119` | Peneliti dengan order Kilat | Prasyarat 5.10 |

Aturan selama jeda:
- **R2 → R6**: admin hanya menugaskan **gelombang 15.00**. Sebelum R6, batas bayar Kilat masih 14.00, sehingga gelombang 11.00 bisa dibayar setelah tayang. Risikonya kecil (nol order Kilat sejak 1 Okt), tetapi aturan ini menutupnya tanpa kode.
- **Hari R7**: Senin–Rabu pagi, admin bertugas, tidak menempel tanggal libur atau 1 Des (pergantian tangga tarif). Tanggal literal `KILAT_TARIFF_FROM` diputuskan saat itu.
- Rencana undian 7 Okt boleh dieksekusi setelah R7.

Setiap rilis: branch sendiri dari `main` → tes → `graphify update .` → merge ke main → `git pull` → push. SQL diterapkan user **sebelum** push.

## Concern tersisa (tinjauan akhir 14 Okt)

1. **Siaran terlewat** — diputuskan 15 Okt: toggle boleh dinyalakan kapan saja (lihat tabel keputusan). Server **tidak** menolak `broadcast-start` setelah jendela sementara habis selama `broadcast_at` masih NULL; yang ditolak hanya bila `broadcast_ended_at` sudah terisi. Tambahkan uji PGlite: nyala di gelombang +30 jam → `period` = [nyala, +24 jam), `can_select_winners` false lagi.
2. **Kabar ke tim undian** — diputuskan 15 Okt: menunggu R7. Dicatat di §5.9 agar laporannya memuat pergeseran R4.
3. **"Jadikan Kilat" untuk order yang dibuat sebelum hari buka** tetap memakai rumus lama, karena `rate_locked_at` = `created_at` order (`sql/103`). Usulan: diterima. Himpunannya terbatas dan setiap konversi butuh admin.
4. **Sudah dicek, aman**:
   - kuota harian Iklan (`sql/111`) mengecualikan Kilat, jadi kedua kolam tidak saling makan;
   - peneliti tidak bisa memilih ulang jadwal yang dipesan admin (`canRepickInPlace`), jadi trigger R2 tidak memecahkan order Kilat buatan admin.

## Verifikasi
- **Tarif (5.1)**:
  - paritas klien ↔ server untuk tabel Kilat di setiap batas tanggal;
  - invarian 2,5× Iklan per tier;
  - instan sebelum `KILAT_TARIFF_FROM` = rumus lama;
  - **adu ulang ke produksi sesudah deploy**: setiap order Kilat yang belum lunas menghasilkan `total_cost` yang **tidak berubah**;
  - uji tanggal terkendali (`atMs` = rilis/1 Des/1 Jan): tier 31–50 = 750rb/1,0jt/1,25jt, di klien dan di `create-payment.js`;
  - klik manual: angka checkout = tagihan DOKU = `total_cost`.
- **SQL 5.2/5.3** (PGlite + dry-run, `set local role authenticated` + jwt.claims):
  - INSERT/UPDATE peneliti dengan jam di luar {11, 15}, di akhir pekan, lewat H-2 jam, atau `end` ≠ start+1 ditolak;
  - mengubah `distribution_type` setelah INSERT dan menulis `slot_booked_by='admin'` ditolak;
  - klaim ke-3 di satu gelombang ditolak (`kilat_wave_full`);
  - UPDATE peneliti yang bukan klaim baru (batal, catatan) pada order Kilat lewat cutoff tetap lolos;
  - jalur `service_role`, `/api/admin/manual-payment` dan catatan admin tetap lolos;
  - rollback bersih;
  - `period_batch` 17 batch lama tidak berubah;
  - gelombang 11.00 uji tanpa toggle → `period` = [11.00, +24 jam); nyala 11.07 → `period.start` 11.07, `period.end` +24 jam, `can_select_winners` false; mati 15.30 → `period.end` 15.30, `closed`, `can_select_winners` true, halaman tutup di detik yang sama;
  - menyalakan lagi setelah selesai ditolak server; membatalkan nyala ditolak bila sudah ada responden;
  - order Iklan berjam kustom → `period.start` = jam kustomnya; Iklan 15.00 dan baris perpanjangan tanpa `broadcast_at` tidak berubah;
  - `compute_extend_period_batch` WIB: 0 baris berubah.
- **vitest**:
  - cutoff 09.00/10.00/13.00/14.00, akhir pekan, paritas batas bayar;
  - `billExpiryFor`/`shouldAutoMint`/`canRepickInPlace` dengan kasus Kilat;
  - picker menonaktifkan gelombang penuh/lewat;
  - cabang Kilat `submitOrder` memanggil handler sungguhan: jalur otomatis = satu INSERT dengan `kilat_slot_hour`, jalur manual = tanpa tanggal/gelombang;
  - urutan step wizard Kilat = Iklan (Step 4 sudah tidak ada); Step 1 Kilat tanpa `DurationPicker` dengan `duration` = 1;
  - voucher di form Kilat: ambassador & JFUTGRX diterima, JFUFEB/ILKOMUNY/TEGARGANTENG ditolak dan tidak tersimpan, dan jalur review tidak berubah karenanya;
  - `canScheduleAgain` mengunci Kilat sampai 5.10;
  - `contentGate` menerima patch `publish_start_date` saja.
- **Gerbang tsc**: `tsc -p tsconfig.app.json` tidak boleh naik dari baseline (73 per 12 Okt), dan grep TS2304/TS2552 harus kosong.
- **Browser, alur utama**: kartu Kilat → modal (tabel tarif Kilat) → detail → gelombang 15.00 → tiket Jadwal & Bayar (tagihan terbit sekali, dengan harga tabel 5.1) → bayar DOKU → halaman Kilat berjendela sementara [15.00, +24 jam) → admin menyalakan toggle siaran di tab Page → `/api/respondents` `period.start` = waktu nyala, badge Kilat turun satu → admin mematikan toggle → halaman "Survey sudah berakhir" dan `can_select_winners` = true seketika. Ulangi dengan gelombang kedua yang dibiarkan menyala: selesai sendiri 24 jam kemudian.
- **Browser, gelombang tertutup**: gelombang 11.00 hari ini tertutup setelah 09.00; pilih ulang ke gelombang lain di hari yang sama mencabut tagihan lama.
- **Browser, layar peneliti**: tidak ada teks durasi di mana pun.
- **Kalender libur & badge (5.4b)**:
  - INSERT/UPDATE `operational_holidays` dari peran `authenticated` ditolak; `/api/admin/holidays` menolak non-admin; `proacl`/Advisor bersih;
  - klaim gelombang Kilat di tanggal libur aktif ditolak, dan di tanggal yang saklarnya dimatikan diterima;
  - `nextWorkingDay` melewati akhir pekan dan libur berturut-turut;
  - `adminActionOf` per state; badge Kilat turun setelah toggle dinyalakan dan naik lagi setelah pilih ulang gelombang;
  - upsert sinkron tidak menghapus kolom siaran.
- **Extend (5.10)**:
  - gelombang ke-2 berjarak < 24 jam ditolak, tepat 24 jam diterima;
  - bulan sama → satu batch tanpa tagihan hadiah, bulan baru → batch baru dan hadiah ditagih;
  - `quota_held` mencegah penumpukan gelombang belum lunas;
  - papan admin menampilkan kedua gelombang.

## Di luar cakupan
- Kirim push dan salin link (manual).
- 2 order Kilat lunas tanpa tanggal.
- Kolam 17 halaman lama (dibiarkan).
- Penerapan `sql/116` (milik seri keamanan).
- Keputusan terbuka dokumen transisi Iklan (JFUFEB, grandfathering, batas nego).
- Filter `?period_batch=` dan laporan undian (rencana 7 Okt, setelah 5.9).
