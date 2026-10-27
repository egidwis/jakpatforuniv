# Phase 5 — Kilat swalayan: peneliti memesan Kilat sendiri

> **STATUS NYATA (16 Okt 2026):** strategi rilis **diubah** — seluruh Phase 5 dikerjakan di **satu branch `feat/kilat-swalayan`** dan dirilis di akhir dengan **tiga push** (A → Uji → B) (lihat §Peta pengerjaan & rilis tepat di bawah). R1–R6 + R8 selesai di branch itu (belum push); `sql/117` dan `sql/118` **sudah diterapkan** di produksi; **`sql/119` (R8) diterapkan & diverifikasi 19 Okt** (md5 prod = migrasi PGlite); origin/main `0851d87` di-merge 19 Okt; origin/main `56c54fa` di-merge 19 Okt; origin/main `ade976d` (dashboard ringkas, tanpa kerja keamanan baru) di-merge 21 Okt; jalur admin Kilat ikut function seri keamanan (lihat langkah 6 di bawah); **21 Okt: ketiga SQL egidwis (`117_drop_browser_mimin_writes`, `118_review_decision_service_role`, `119_order_fields_service_role`) sudah LIVE** — terverifikasi MCP; berikutnya Push A, daftar periksa produksi, lalu commit Push Uji/B. Keputusan JFUTGRX 16 Okt: **opsi A** (lihat tabel keputusan) — `8ef96dd`.
>
> Berkas ini salinan rencana yang disetujui di sesi chat 14–15 Okt. R1–R8 kini **tahap pengerjaan** di satu branch, bukan rilis terpisah; nomor task (5.1–5.10) tetap jadi rujukan isi.

> **Ditinjau ulang 14 Okt 2026** terhadap `main` = `316c610` dan DB produksi (hanya SELECT). Pada tanggal yang sama ditambahkan keputusan **extend Kilat** dan **tarif Kilat baru**. Tarif menjadi Task 5.1, sehingga task lain bergeser +1 dibanding versi sebelumnya; extend kini 5.10.

## Peta pengerjaan & rilis

> **Keputusan 16 Okt (pemilik produk):** tidak ada lagi push per rilis. Semua tahap dikerjakan berurutan di **satu branch `feat/kilat-swalayan`** (dibuat dari `c42362a`, memuat R1–R4) dan diuji lokal secara berkala oleh pemilik produk. Rilis ke produksi baru dilakukan setelah fiturnya stabil, dalam **tiga push**: Push A (pintu tertutup) → **Push Uji** (pintu terbuka hanya untuk akun uji, order swalayan sungguhan) → Push B (buka pintu untuk semua) — §Rilis di bawah. Gerbang produksi per rilis di versi 15 Okt berubah menjadi **daftar periksa** sebelum/sesudah tiap push. Branch lama (`feat/kilat-tarif-bertanggal`, `feat/kilat-fondasi-gelombang`, `feat/kilat-undian-siaran`, `feat/kilat-libur-badge`, `feat/kilat-siaran-toggle`) adalah leluhur branch ini dan dihapus setelah rilis.

| # | Tahap | Task | SQL | Status | Uji lokal / catatan |
|---|---|---|---|---|---|
| 1 | **R1 — Tarif tidur** | 5.1 | — | ✅ Kode (`c86c9e9`, `e64db33`) | Angka identik selama `KILAT_TARIFF_FROM = null` |
| 2 | **R2 — Fondasi gelombang** | 5.2, 5.4 | `sql/117` ✅ live 15 Okt | ✅ Kode (`2ec405c`) | Picker admin 11/15; 3 order macet (`e56f4853`, `4a112eae`, `be488b57`) tetap bisa disentuh |
| 3 | **R3 — Libur & badge** | 5.4b (libur + badge) | `sql/122` (21 Okt, ⬜ belum diterapkan) | ✅ Kode (`0eb5395`); **diganti 21 Okt: mode libur** | Toggle **Mode libur** di Submissions (butuh `wrangler pages dev`); strip oranye + pill; banner, modal sebelum submit/bayar, pemilih gelombang Kilat tidak tampil; badge = hitungan manual (15 Okt: Iklan 22 = 13 review + 9 penjadwalan, Kilat 0) |
| 4 | **R4 — Undian & siaran** | 5.3, 5.4b (toggle), sinkron halaman 5.4 | `sql/118` ✅ live 15 Okt | ✅ Kode (`4213f8b` SQL, `c42362a`) | Linimasa toggle pada **order uji**; sisa kecil: status siaran ringkas di `KilatScheduleBoard` |
| 5 | **R5 — Pintu tersembunyi** | 5.5, 5.6, 5.8 | — | ✅ Kode (`59c7913`, commit 5.8 menyusul) | Kartu Kilat → modal → `?product=kilat` (admin; `KILAT_PILOT_EMAILS` kosong) → Step 3 pemilih gelombang → Jadwal & Bayar. Batas bayar gelombang ikut R6 — uji lokal tanpa bayar |
| 6 | **R6 — Jalur bayar Kilat** | 5.7 | — | ✅ Kode (16 Okt) | Cermin helper waktu di `create-payment.js`; cabut peringatan "pakai 15.00" di picker admin; **pilih ulang gelombang di badan tiket Jadwal & Bayar** (`KilatWavePicker` + `handleLock`, dipindah dari 5.5 karena butuh `rebookSlotForSubmission` sadar gelombang); tagihan terbit sekali lalu dibatalkan (DOKU sandbox) |
| 7 | **R7 — Uji nyata & buka pintu (disiapkan)** | 5.9 | — | ✅ Push Uji di-push 26 Okt (`e7a669b`, akun uji `tegarerputra`; bayar DOKU nyata #3a432277 Rp1.110 lunas); 🟡 Push B disiapkan 26 Okt di `release/push-b-kilat` — `KILAT_TARIFF_FROM = '2026-10-26T16:00:00+07:00'`, `KILAT_SELF_SERVE_OPEN = true`, pilot dikosongkan, email admin saat Kilat lunas | Dua commit kecil yang **tidak ikut Push A**: pilot akun uji (`KILAT_PILOT_EMAILS`) = Push Uji, lalu buka pintu = Push B |
| 8 | **R8 — Extend Kilat** | 5.10 | `sql/119_extend_kilat.sql` (✅ diterapkan 19 Okt) | ✅ Kode (16 Okt) | Kode ikut Push A terkunci; **dibuka untuk akun uji di Push Uji** (prasyarat 5.10 dipenuhi di sana), untuk semua di Push B |

### Selama pengerjaan (sampai Push A)

- **Lokal = produksi.** `.env` lokal mengarah ke DB produksi (`zewuzezbmrmpttysjvpg`); tidak ada staging. Uji hanya pada **order uji** (akun uji / order berlabel uji), tidak pernah pada order peneliti. Toggle siaran, hari libur, dan "Jadikan Kilat" menulis data sungguhan — matikan/hapus kembali sesudah uji.
- **Fungsi server butuh `wrangler pages dev dist`** + berkas `.dev.vars` (service role, `ADMIN_EMAILS`, kunci DOKU **sandbox**). `npm run dev` hanya menjembatani sebagian Pages Function; `/api/admin/holidays`, aksi `broadcast-*` dan `create-payment` tidak termasuk.
- **DB sudah di depan kode** (`sql/117`, `sql/118` live). Aturan jeda berlaku sampai Push A:
  - admin hanya menugaskan **gelombang 15.00** (picker live masih 08/11/14/17; batas bayar live masih 14.00);
  - halaman Kilat baru tutup sendiri 24 jam setelah gelombang; bila push terlambat, geser lewat SQL Editor: `select kilat_broadcast_start('<schedule_id>','admin');`
  - `/api/respondents` sudah memakai jendela baru (20 order lama bergeser, 0 perubahan status/`can_select_winners`); snapshot `backup.r118_rewards_before` (Langkah 1e) **tidak dibuat**, nilai lama direkonstruksi dengan kueri 1d.
- **Branch tetap segar:** merge `origin/main` ke branch ini secara berkala (merge, bukan rebase — leluhurnya sudah dibagikan antartahap). Nomor SQL baru dicek ke `git ls-tree origin/main multi-step-form/sql/` tepat sebelum diberi nomor.
- **Merge `origin/main` 16 Okt (`c03086a`, main = `e878490`, sudah dideploy pemilik produk tanpa Kilat):** nol konflik; tsc 72, vitest 1545 lulus (2 gagal lama `respondentsGate`), build lulus. Isinya seri keamanan: status tayang order & nominal tagihan perpanjangan pindah ke `/api/admin/airing` (`setSubmissionAiringStatus`, `writeExtensionBillAmounts`), tulisan Mimin ke `/api/admin/mimin`. Dampak ke rencana:
  - ⚠️ **Nomor SQL ganda `117`**: main membawa `sql/117_drop_browser_mimin_writes.sql` (belum diterapkan per 16 Okt — policy `Product manages ai_*` masih ada), di samping `sql/117_kilat_swalayan.sql` kita (live). Repo sudah punya nomor ganda (110/111/116); rujukan "sql/117" di rencana ini = `117_kilat_swalayan`. Nomor berikutnya untuk extend tetap **`sql/119`** (cek ulang sebelum dipakai).
  - **R8 (5.10)**: nominal tagihan perpanjangan Kilat ditulis lewat `writeExtensionBillAmounts` (bukan `supabase.from('ad_schedules').update` dari browser); cabang Kilat `buildExtensionInvoiceItems` cukup mengubah angka, jalur tulisnya sudah benar.
  - **5.8 prompt Mimin**: setelah sql/117 Mimin diterapkan, prompt DB hanya bisa diubah dari halaman Mimin AI Setup (lewat function).
  - Tidak ada fungsi yang disentuh branch ini ikut dipindah main; tidak ada tulisan browser baru branch ini ke kolom yang dijaga sql/113.
- Setiap commit: tes → `graphify update .` → STATUS NYATA di berkas ini. SQL baru (mis. `sql/119`) diserahkan ke user dan diterapkan **sebelum Push A**.

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
| Hari tayang | **Senin–Jumat**, kecuali selama **mode libur** menyala (5.4b, dikoreksi 21 Okt). Peneliti hanya memesan **3 hari kerja mulai hari ini**; admin tetap 2 minggu (sql/122 K3) | 14 Okt, 21 Okt |
| Batas pesan dan bayar | Pesan **H-2 jam**, bayar **H-1 jam**. Gelombang 11.00: pesan ≤ 09.00, bayar ≤ 10.00. Gelombang 15.00: pesan ≤ 13.00, bayar ≤ 14.00 | 5 Okt |
| Review | **Persis Iklan.** Jalur otomatis: peneliti memilih gelombang lalu bayar. Jalur manual: order dikirim dari Ringkasan **tanpa gelombang**; setelah disetujui, **admin menugaskan gelombang** (`awaiting_admin_schedule`), lalu tagihan terbit. *(Keterangan 5 Okt "gelombang pilihan disimpan" keliru menggambarkan Iklan; dikoreksi 14 Okt)* | 5 Okt, dikoreksi 14 Okt |
| Alur submission | **Identik dengan Iklan, dengan tepat dua pengecualian**: (1) konfigurasi Step 1 **tanpa pilihan durasi**; (2) Step 3 berisi **pemilih gelombang**, bukan kalender hari. Langkah, jalur tulis (INSERT `submitOrder`, pilih ulang `rebookSlotForSubmission`), review, Ringkasan (termasuk kolom voucher), Jadwal & Bayar, email dan review admin tetap satu jalur. Turunan otomatis dari dua pengecualian itu: harga per gelombang dan batas pesan/bayar per gelombang. Perbedaan lain di luar daftar ini dianggap penyimpangan | 14 Okt |
| Voucher untuk Kilat | **Hanya kode ambassador (−10% dari tarif Kilat, bukan dari hadiah)** dan **JFUTGRX** (voucher uji internal, total Rp1.000). JFUFEB, ILKOMUNY, TEGARGANTENG dan kode lain **tidak berlaku**. Kode yang tidak berlaku ditolak di form Kilat dengan pesan jelas dan tidak disimpan, sehingga tidak bisa membelokkan jalur review. Server mengabaikannya untuk Kilat. Ini menggantikan prinsip lama "Kilat tanpa diskon voucher" | 14 Okt |
| Operasional | Salin link halaman ke survei Jakpat dan kirim push tetap manual, **di luar cakupan** | 5 Okt |
| Sinyal ke admin | **Badge angka** (gaya badge Conversations) di tab **Iklan** dan **Kilat** halaman Submissions: jumlah order yang masih menunggu admin. Kilat menghitung juga gelombang lunas yang **belum disiarkan** (toggle siaran belum dinyalakan). Tanpa email atau cron | 14 Okt |
| ~~Kalender libur~~ → **Mode libur** | **Dikoreksi 21 Okt.** Bukan kalender per tanggal, melainkan **satu toggle** di pojok kanan atas Submissions + pesan ≤80 karakter (diterjemahkan otomatis ke `label_en`). Selama menyala: **Kilat tutup total** untuk peneliti (pemilih gelombang tidak pernah tampil; Kilat jalur otomatis dikirim sebagai **jalur manual permanen**, `forced_manual_reason`); **Iklan otomatis tetap tayang**; modal sebelum submit/bayar (Lanjutkan / ×) dan pengumuman di dashboard, status, chat Mimin, email. Tabel `"JFU_operational_holidays"` (`sql/122`) | 14 Okt, 21 Okt |
| Satu pemesanan = satu gelombang | Durasi pengerjaan maksimal 24 jam, **tidak ditampilkan ke peneliti**. Tidak ada pilihan durasi | 7 Okt |
| Undian buta jenis | **Undian tidak melihat Iklan/Kilat**, hanya responden dan hadiah. Satu rumus jendela untuk semua jadwal (ordinal 1 & perpanjangan): **[saat iklan benar-benar mulai, saat benar-benar selesai)**. Iklan mulai dan selesai di instan jadwalnya. Kilat mulai saat **toggle siaran** dinyalakan admin dan selesai saat dimatikan, atau otomatis 24 jam setelah dinyalakan. Bila toggle tak pernah disentuh, dipakai jendela gelombang. `can_select_winners` menyala saat jendela selesai, untuk kedua jenis | 14 Okt |
| Halaman & pendaftar telat | **Halaman Kilat swalayan tutup bersamaan dengan jendela undian**, seperti Iklan. Pendaftar telat ikut aturan undian yang sama untuk semua survei (batch terakhir yang `period.start` ≤ `submitted_at`, rencana undian 7 Okt). 17 halaman lama dibiarkan. *(Menggantikan "semua ikut, halaman tidak diubah" 7 Okt)* | 14 Okt |
| Toggle siaran Kilat | **Toggle, bukan tombol**, di tab Page drawer Submissions. **Nyala** = push terkirim: halaman & undian dibuka. **Mati** = siaran selesai: halaman tutup dan pemenang bisa dipilih seketika. Batas maksimal 24 jam tetap: bila lupa dimatikan, jendela selesai sendiri. Satu arah per gelombang: setelah selesai, toggle terkunci | 14 Okt |
| Siaran terlewat | Toggle **boleh dinyalakan kapan saja** selama belum pernah dinyalakan, termasuk setelah jendela sementara [gelombang, +24 jam) habis. Jendela halaman dan undian pindah ke [nyala, +24 jam), dan `can_select_winners` kembali `false`. Risiko pendaftar setelah undian diterima. Dialog nyala memberi peringatan bila jendela sementara sudah lewat. Kunci "selesai" tetap berlaku hanya setelah toggle pernah dinyalakan | 15 Okt |
| Strategi rilis | **Satu branch `feat/kilat-swalayan`** sampai fitur stabil, diuji lokal berkala oleh pemilik produk; rilis **tiga push**: Push A = semua kode, pintu tertutup & tarif identik → **Push Uji** = pintu terbuka hanya untuk akun uji, order swalayan sungguhan di produksi (ditambahkan 16 Okt) → Push B = buka pintu untuk semua. Menggantikan push per rilis R1–R8 | 16 Okt |
| Kabar ke tim undian | **Satu laporan setelah Push B**, termasuk pergeseran `period` 17 batch Kilat lama + 1 Iklan berjam kustom akibat `sql/118` di R4. Tidak ada kabar terpisah saat R4 | 15 Okt |
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
| JFUTGRX pada rumus lama | **Opsi A**: JFUTGRX mematok iklan + add-on + hadiah jadi Rp1.000 **juga sebelum `KILAT_TARIFF_FROM`** (klien `calculateKilatDiscount`, server `calculateKilatDiscount` + `buildNoteItems`, prefill admin `buildOrderInvoiceItems`/`describeVoucher`). Kode ambassador tetap Rp0 sampai tarif baru & pintu swalayan dibuka (Push B); form Kilat menyebutnya "belum memotong", bukan galat. Alasan: penagihan Kilat saat ini murni dari admin, voucher jarang dipakai; Push Uji butuh bayar nyata Rp1.000. Satu-satunya order Kilat ber-JFUTGRX di produksi (`e56f4853`, macet, jadwal 14 Sep lewat) akan dihargai Rp1.110 bila pernah ditagih ulang | 16 Okt |

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

### 5.1 — Tarif Kilat bertanggal (jalur uang, tidak bergantung pada task lain, boleh rilis paling awal) · **[R1]**

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

### 5.2 — Fondasi reservasi gelombang (`sql/117_kilat_swalayan.sql`) · **[R2]**
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

### 5.3 — Undian & halaman buta jenis (`sql/118_undian_buta_jenis.sql`, setelah `sql/117`) · **[R4]**
> *Dikerjakan 15 Okt (branch `feat/kilat-undian-siaran`): `sql/118` memuat 5.3 **dan** bagian SQL 5.4b (kolom siaran, penjaga+reset, backfill 17) plus RPC toggle `kilat_broadcast_start/_end/_undo` — logika satu-arah, "boleh terlambat", dan "batal hanya tanpa responden" ditegakkan DB, bukan Pages Function. Satu rumus jendela `airing_window_start/_end` dipakai undian, `ensure_survey_page` (lewat `kilat_page_window`) dan RPC toggle. Snapshot keluaran undian sebelum migrasi disimpan di `backup.r118_rewards_before` untuk laporan tim undian (R7). **Koreksi 15 Okt 12.30:** snapshot itu tidak dibuat — lihat §Selama pengerjaan.*
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

### 5.4 — Aturan waktu & konstanta (+ admin) · **[R2 + sinkron halaman di R4]**
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

### 5.4b — Kalender libur operasional & badge admin (sebelum 5.9) · **[R3 + toggle siaran di R4]**
> ⚠️ **Koreksi 21 Okt — kalender per tanggal DIGANTI mode libur** (halaman "Hari Libur" tidak pernah dirilis, tabel masih kosong). Rancangan berlaku: `~/.claude/plans/bantu-aku-pelajari-dokumentasi-replicated-lantern.md`. Ringkasnya: toggle `AdminAwayToggle` di Submissions (strip oranye mencolok + pill, popup pesan ≤80 + daftar gelombang mendatang, ringkasan "N order Kilat dialihkan" saat dimatikan, chip "Dialihkan saat libur"); `sql/122` (rename `"JFU_operational_holidays"`, `label_en`, trigger & RPC `holiday_date <= gelombang`, `forced_manual_reason`, jendela 3 hari kerja); store poller bersama `useAdminAway`; `AdminAwayModalHost` (varian A–F) di DashboardLayout; `checkoutPath` 'kilat_away'. Daftar di bawah tentang tabel/halaman/`nextWorkingDay` adalah riwayat R3, bukan keadaan sekarang.
> *Dikerjakan R4, 15 Okt (branch `feat/kilat-siaran-toggle`): aksi `broadcast-start/-end/-undo` di `/api/admin/content` → RPC sql/118 dengan `p_by` = email admin dari JWT, HINT diteruskan ke UI; `KilatBroadcastToggle` di tab Page (per gelombang, dialog nyala/mati/batal, jumlah responden sejak nyala); `utils/kilatBroadcast.ts` (keadaan = cermin `airing_window_end`); `fetchAdSchedules` membaca kolom siaran (hibah tabel-level, aman untuk peneliti); `updateKilatSchedule` menggeser jendela halaman lewat `patch-pages` (halaman lama: hanya awal); badge Kilat + gelombang lunas yang toggle-nya sudah bisa dinyalakan. Belum: status siaran ringkas di `KilatScheduleBoard`.*
> *Dikerjakan R3, 15 Okt (branch `feat/kilat-libur-badge`): `functions/api/admin/holidays.js` (+gerbang & spec yang memanggil handler), `utils/operationalHolidays.ts` + `nextWorkingDay` di `airing-window.ts`, halaman admin `pages/internal-dash/HolidaysPage.tsx` (menu **Hari Libur**), `AdminHolidayBanner` di dashboard (`StatusPage` = dashboard + status order) dan chat Mimin, badge tab Iklan/Kilat + filter **Perlu Ditangani** dari `utils/adminQueue.ts`. Penyimpangan yang disadari: predikat badge membaca kolom `form_submissions`, bukan `deriveOrderUiState` (butuh jadwal + peta bayar per order); `review` hanya baris **tanpa tanggal** karena 398 baris `in_review` bertanggal adalah artefak pra-review (Mei 2025–Jan 2026). Pemilih jenis versi mobile tidak ada, jadi filter mobile memuat kedua jenis.*
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

### 5.5 — Pemilih gelombang peneliti · **[R5]**
> **STATUS NYATA (16 Okt):** ✅ `KilatWavePicker`, `useKilatWaveAvailability`, util murni `kilatWaves.ts` (`kilatWaveDays`, `kilatLockGate`) — `59c7913`. Dipakai Step 3 wizard. Pemakaian di badan tiket Jadwal & Bayar **dipindah ke R6** (butuh `handleLock` sadar gelombang). Hari libur dirender tertutup ("Libur"), akhir pekan tidak dirender.
- **`KilatWavePicker`** + hook **`useKilatWaveAvailability`** (lewat RPC okupansi `get_kilat_wave_occupancy`, 5.2). Menampilkan 10 hari kerja × 2 gelombang beserta sisa kuota. Gelombang yang penuh atau lewat cutoff dinonaktifkan. Hanya satu gelombang yang bisa dipilih. Logika grid diambil dari `KilatScheduleStep`.
- Dipakai di **Step 3 wizard** (`StepSchedule mode="kilat"`, posisi yang sama dengan kalender Iklan) dan di badan tiket **Jadwal & Bayar** untuk mode Kilat. Di 5.10 juga dipakai `JadwalBaruPage`.

### 5.6 — Pintu masuk & wizard (di balik bendera) · **[R5]**
> **STATUS NYATA (16 Okt):** ✅ `59c7913`. Gerbang satu tempat `canUseKilatSelfServe` (bendera / admin / `KILAT_PILOT_EMAILS`, kosong). Modal = `AdsEntryModal product="kilat"` + `KilatRateBlock` (angka dari `kilatRateAt`, jadi rumus lama selama `KILAT_TARIFF_FROM` null). Jenis order dijaga `applyOrderProduct` (juga sesudah impor Google Form di wizard). `submitOrder` Kilat: INSERT `start_date` YMD, `end_date` +1, `kilat_slot_hour`, `duration` 1; cek okupansi gelombang; galat `kilat_wave_*` dipetakan sebelum kuota harian (pesan penuhnya juga memuat "sudah penuh"). Voucher non-Kilat tidak disimpan; `isAutoApprovalPath` mengabaikan JFUFEB/ILKOMUNY untuk Kilat.
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

### 5.7 — Jalur bayar Kilat di halaman Jadwal & Bayar (jalur uang) · **[R6]**
- **`handleLock`** (`JadwalDanBayarPage.tsx:469-486`): tetap memanggil **`rebookSlotForSubmission`**, fungsi yang sama dengan Iklan, yang kini menerima jam gelombang. Untuk Kilat, fungsi itu menulis `kilat_slot_hour`, tanggal gelombang, dan `end` = +1 hari, alih-alih 15.00 + `duration`. Tanpa jam gelombang, panggilan Kilat ditolak, dan trigger 5.2 menegakkan sisanya.
- **`billExpiryFor`** (`jadwalBayarGates.ts:98-105`): untuk Kilat batasnya `kilatPayDeadline` (gelombang − 60 menit), bukan 14.00. Hitung mundur di sobekan dan penanda "lewat batas bayar" (`deriveOrderUiState`) ikut.
- **`shouldAutoMint` / `canRepickInPlace`**: tambah kasus Kilat ke tes. Sampai 5.10, order Kilat selalu berjadwal tunggal; setelahnya gelombang perpanjangan ikut aturan Iklan untuk jadwal ke-2 dst.
- **`create-payment.js`**:
  - tolak Kilat tanpa gelombang atau yang sudah lewat gelombang − 60 menit;
  - umur link DOKU = min(sisa hold, batas bayar);
  - `billed_start_date` membawa jam gelombang.
- **Webhook** tidak diubah.

> **STATUS NYATA (16 Okt):** ✅ Kode, tanpa SQL.
> - **Satu pintu batas bayar** `payDeadlineFor`/`isPayDeadlinePassed` (`airing-window.ts`): Kilat = gelombang − 60 menit, Iklan = 14.00 persis seperti dulu. Dipakai Jadwal & Bayar (`tooLate`), `billExpiryFor`, `deriveOrderUiState` (dashboard peneliti), `ScheduleCardList` (kartu tagihan admin), `missedPaymentWindow` (antrean admin). Jam gelombang hanya dibaca untuk baris `distribution_type='kilat'`.
> - **`rebookSlotForSubmission(id, ymd, dur, { kilatHour })`**: bentuk tulis = INSERT Kilat `submitOrder` ([tanggal, +1) DATE + `kilat_slot_hour` + durasi 1). Produk dijaga **di kueri**: bentuk Kilat `.eq('distribution_type','kilat')`, bentuk Iklan `.or(is.null, neq.kilat)` → salah pasang = nol baris = galat. Hibah kolom `authenticated` UPDATE `kilat_slot_hour`/`duration` dicek di produksi (ada).
> - **Jadwal & Bayar**: `KilatWavePicker` di badan tiket (keadaan `pick`, `released`, pilih ulang lewat batas); `handleLockWave` = `kilatLockGate` + galat HINT `kilat_wave_*`; tiket beku Kilat = `LockedScheduleCard kilatWaveHour` (tanggal + gelombang, tanpa 15.00). **Kilat lewat batas bayar TIDAK punya "Tetap bayar"**: tombol bayar diganti catatan, pilihan satu-satunya "Pilih Gelombang Lain" (bila `canRepickInPlace`), selain itu banner "tim akan menghubungi".
> - **`create-payment.js`** `kilatPaymentGate`: sesudah penjaga tempo, sebelum penulisan apa pun → 409 `kilat_wave_missing` / `kilat_pay_closed`; gagal baca gelombang = 502. Instan gelombang = tanggal WIB + `kilat_slot_hour`, **bukan** jam cermin — terukur 16 Okt: 1 dari 21 cermin Kilat (`e56f4853`) bercermin 15.00 untuk gelombang 11.00. Umur link `kilatDueMinutes` (pangkas ke batas, lantai 1 menit); link hidup yang melewati batas tidak dipakai ulang (dicabut). `billed_start_date` tetap `ad_schedules.start_date` (cermin = instan gelombang), tidak diubah.
> - Peringatan sementara "pakai 15.00" di `KilatScheduleStep` dicabut; peringatan admin lewat batas kini menyebut link ditolak. Aturan jeda R2→R6 (admin hanya 15.00) **gugur** begitu Push A tayang.
> - Tes: `createPaymentKilat.spec.js` (handler sungguhan; mutasi gerbang → 2 merah), `kilatPaymentGate.spec.ts` (paritas klien ⇄ server di −1/0/+1 ms), `jadwalBayarGates.spec.ts` (shouldAutoMint/canRepickInPlace/billExpiryFor Kilat), `rescheduleGuards.spec.ts` (bentuk tulis + filter produk), `missedPaymentWindow.spec.ts`, `deriveOrderUiStateKilat.spec.ts`.
> - Konteks Mimin `too_late_today` (`describeOrderForChat`) kini menyebut batas gelombang untuk Kilat, bukan 14.00; zona kunci tiket Kilat lewat batas tanpa pilih ulang dikosongkan (bukan "ditahan untukmu").

### 5.8 — Copy tanpa durasi & kebersihan · **[R5]**
> **STATUS NYATA (16 Okt):** ✅ Ringkasan (kartu "Distribusi · 1 gelombang push"), companion, sobekan tiket (wizard & Jadwal & Bayar), kartu jadwal `SchedulePhase` (judul = tanggal gelombang, subteks = "Gelombang HH.00 WIB", banner `awaiting_admin_schedule` menyebut gelombang); kuitansi `receiptScheduleLabel` ("20 Okt 2026 · Gelombang 11.00 WIB"); email tayang/selesai varian Kilat lewat `scheduleKindOf` (membaca `ad_schedules` dengan service role dari `schedule_id` payload — **tanpa SQL**; gagal baca = copy Iklan); `send-invoice-ready-email.js` diperiksa, tanpa teks durasi. Prompt bawaan Mimin dibetulkan (dulu "landing page publik, tanpa antre"); ⚠️ `ai_settings.system_prompt` di DB tetap menang — perlu dicek manual. Penjaga Kilat di `JadwalBaruPage` sampai 5.10. 31 kunci i18n Kilat mati dihapus. Copy admin "~2 jam" / "tanpa halaman iklan" dibetulkan. Pilih ulang di Jadwal & Bayar memakai `KilatWavePicker` (R6), bukan `SchedulePicker mode="kilat"`.
> **Untuk pemilik produk (copy pemasaran):** kartu produk "Untuk kecepatan maksimal — Distribusi ekspres dengan push notification…" dipertahankan; klaim "~2 jam" / "hasil 2 hari dalam 2 jam" sudah tidak tampil di mana pun ke peneliti (kunci `kilatUpgradeTagline`/`kilatBenefitFast` terhapus). Bila mau klaim waktu di modal/kartu, putuskan kalimatnya dulu.
- **Layar peneliti** hanya menampilkan **tanggal + "Gelombang HH.00 WIB"**. Yang dibuang: "{n} hari", "N×24 Jam", "Tayang penuh selama 1 hari", `kilatDuration`/`kilatInstant24h`, dan "Mulai 15.00 WIB" untuk Kilat. Lokasinya: `StepCheckout.tsx:342-345`, `SchedulePicker`, `OrderLiveCompanion`, sobekan tiket, `SchedulePhase`, `translations.ts`.
- **Email & kuitansi** (temuan tinjauan 14 Okt): `functions/api/doku/_payment-receipt.js:558-568` menulis "(1 Hari) (Kilat)". Untuk Kilat ganti dengan "tanggal · Gelombang HH.00 WIB". Subjek `notify-ad-live.js:49-50` ("Iklan surveimu mulai tayang") diberi varian Kilat. Periksa juga `notify-ad-completed.js` dan `send-invoice-ready-email.js`.
- **Copy pemasaran** (mis. "~2 jam", "hasil 2 hari dalam 2 jam") disodorkan ke pemilik produk.
- **Kebersihan**:
  - perbaiki prompt bawaan Mimin (`ChatPage.tsx` ~226);
  - tambah penjaga Kilat di `JadwalBaruPage` (sampai 5.10);
  - hapus kunci i18n Kilat yang mati.

### 5.9 — Uji ujung-ke-ujung, buka pintu, dokumen penutup · **[R7]**
- **Uji di browser**: lokal (`wrangler pages dev dist`) selama pengerjaan, lalu **di produksi saat Push Uji** dengan akun uji non-admin, termasuk **satu pembayaran DOKU nyata** gelombang 15.00 dengan voucher **JFUTGRX** (Rp1.000). *(Revisi 16 Okt: dulu dijalankan pada build commit buka pintu sebelum di-push; kini bayar nyata pindah ke Push Uji, dan build Push B cukup dicek tampilan tarifnya — lihat §Rilis.)*
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

### 5.10 — Extend Kilat: pesan gelombang lagi (setelah 5.9) · **[R8]**
Prasyarat: minimal satu order Kilat swalayan sudah tayang serta dibayar dengan benar — dipenuhi oleh akun uji di **Push Uji** (revisi 16 Okt), sehingga extend dibuka untuk semua bersama Push B.
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

> **STATUS NYATA (16 Okt):** ✅ Kode + `sql/119` (belum diterapkan). Menyimpang dari rencana, dengan alasan:
> - **Signature `create_ad_schedule` TIDAK berubah.** Jam gelombang diturunkan dari jam WIB `p_start_date` → `CREATE OR REPLACE`, ACL ikut, nol risiko overload. Bentuk Kilat (jam 11/15 tepat, +24 jam, durasi 1, `kilat_slot_hour`) dipaksa untuk **semua** pemanggil, termasuk admin (dulu admin menulis `kilat_slot_hour` NULL).
> - **Trigger baru `validate_kilat_extend_claim`** (tidak ada di rencana): peneliti punya dua policy UPDATE di `ad_schedules` dan hak UPDATE penuh atas kolomnya, jadi aturan waktu yang hanya di RPC bisa dilangkahi PATCH langsung. Hari kerja / libur / H-2 jam ditegakkan di sini, kalimat galat = K4 sql/117.
> - **`cron_activate_extends`** (jobid 1, */15) langkah 2 menimpa `publish_*` dengan start/end jadwal tiap tick → akan membuka lagi halaman gelombang perpanjangan yang sudah dimatikan admin. Kini memakai `airing_window_start/_end` (Iklan identik).
> - **Pintu:** kartu "Pesan gelombang lagi" & `JadwalBaruPage` ikut `canUseKilatSelfServe` (admin / pilot / bendera) — selama `KILAT_TARIFF_FROM` null gelombang tambahan dihargai rumus lama, jadi tidak dijual sebelum Push B. ⚠️ Server (`create_ad_schedule`) **tidak** memeriksa bendera: peneliti Kilat lama yang memanggil RPC langsung bisa memesan gelombang tambahan berharga rumus lama sebelum Push B (diterima: 18 akun, harga = yang selama ini ditagih admin).
> - **Admin:** prefill `buildExtensionInvoiceItems` cabang Kilat = `buildNoteItems` (tes paritas `extensionInvoiceKilat.spec.ts`, bulan sama/baru, ambassador, JFUTGRX, rumus lama); `fetchKilatSchedule` membaca kaki perpanjangan (`+Gel.` di papan); **sunting baris perpanjangan Kilat dikunci** di `ScheduleForm` — jalur `KilatScheduleStep` → `updateKilatSchedule` menulis `form_submissions` dan akan memindahkan GELOMBANG PERTAMA. Buat jadwal Kilat dari admin = 15.00 + 24 jam (catatan di form).
> - `JadwalBaruPage` Kilat: `KilatWavePicker` + `kilatLockGate` + teguran dini jarak 24 jam (`kilatWaveClashesOwn`); umur link = `billExpiryFor` (min hold, gelombang − 60 menit); galat `kilat_wave_*` dipetakan sebelum kuota harian.
> - Email tayang/selesai baris perpanjangan: `scheduleKindOf` membaca `ad_schedules` per `schedule_id` (R5), jadi varian Kilat ikut — belum diuji dengan baris perpanjangan sungguhan.

## Rilis: tiga push (A → Uji → B)

> Menggantikan "Gelombang rilis R1–R8" versi 15 Okt (keputusan 16 Okt). Prinsip lama yang dipertahankan: **jalur uang dan pembukaan pintu tidak sekapal** — Push A menayangkan seluruh kode dengan pintu tertutup dan angka tarif identik, Push Uji membuka pintu hanya untuk akun uji, Push B membuka untuk semua. Tiap push memisahkan satu sumber masalah.

**Sebelum Push A** (di branch `feat/kilat-swalayan`):
1. Semua tahap R1–R6 + R8 selesai; commit Push Uji dan Push B (R7) disiapkan **terpisah** dan belum ikut.
2. Merge `origin/main` terbaru ke branch; seluruh vitest hijau (kecuali kegagalan lama yang tercatat); `tsc -p tsconfig.app.json` tidak naik dari baseline (69 per 21 Okt) dan grep TS2304/TS2552 kosong.
3. SQL yang belum live (`sql/119`) diterapkan user di SQL Editor + diverifikasi.
4. Uji lokal pemilik produk lulus untuk tiap tahap (kolom "Uji lokal" di atas).
5. Hari push: Senin–Rabu pagi, admin bertugas; bukan hari libur, bukan menempel 1 Des.
6. **Seri keamanan egidwis (19 Okt):** `sql/118_review_decision_service_role` + `sql/119_order_fields_service_role` (nomor 119 ganda dengan `119_extend_kilat` kita yang sudah live) menolak JWT browser Product menulis status review, harga, tanggal, `kilat_slot_hour`, dan `distribution_type`. Jalur admin Kilat ikut function egidwis: "Jadikan Kilat" = `/api/admin/order` aksi `convert` (harga dihitung server lewat `create-payment.js` kita — paritas dikunci `orderConvertKilat.spec.ts`), pindah gelombang = `/api/admin/schedule` aksi `kilat` + sinkron jendela halaman R4 lewat `/api/admin/content` (sempat hilang di hasil merge, dipulihkan; dikunci `kilatPageSync.spec.ts` jalur produksi). Rilis Kilat menunggu seri keamanan selesai (keputusan 19 Okt); tepat sebelum Push A: merge terakhir + uji lokal `wrangler pages dev` jalur admin Kilat (Jadikan Kilat, pindah gelombang, toggle siaran, buat jadwal) **setelah** SQL egidwis diterapkan.
   - **Status 21 Okt:** ketiga SQL di atas sudah live (trigger `trg_guard_review_decision` + `trg_guard_product_order_fields` aktif, policy `Product manages ai_*` sudah diganti `Product reads`). Kekhawatiran lama "sql/118_review baru boleh diterapkan setelah Push A" **gugur**: "Jadikan Kilat" sudah lewat `/api/admin/order` di main. Penjaga baru tidak menolak jalur Kilat mana pun di branch ini — tulisan peneliti lolos sebagai pemilik baris, admin lewat function, cron tanpa klaim JWT. Uji `wrangler pages dev` jalur admin Kilat kini **bisa** dijalankan.
   - **Seri keamanan belum tuntas:** admin masih menulis langsung dari browser ke `ad_schedules`, `invoices`, `transactions` (policy `Admin Update/Insert …`). Jalur Kilat ikut memakai ketiganya (tagihan Kilat, papan gelombang, perpanjangan). Tanyakan egidwis apakah tabel-tabel itu gelombang berikutnya; kalau ya, merge + uji ulang jalur admin Kilat setelahnya, sebelum Push A.
   - Pertanyaan terbuka ke egidwis (19 Okt) tetap: `convert` kini mengizinkan order LUNAS (distribution_type berubah, tanggal dikosongkan).
7. **Persiapan Push A — status 21 Okt** (syarat 1–3 terpenuhi; branch sudah memuat `origin/main` `ade976d`, tsc 68, vitest 1.665 lulus):
   - ⏸️ **Pemilik produk mengonfirmasi ke egidwis** apakah seri keamanan sudah selesai: (a) apakah `ad_schedules`/`invoices`/`transactions` dikunci di gelombang berikutnya — kalau ya, tunggu, merge, uji ulang jalur admin Kilat; (b) apakah `convert` untuk order lunas disengaja. Push A tidak dijalankan sebelum jawaban ini ada.
   - ⬜ **`.dev.vars` belum ada** di `multi-step-form/` — wajib untuk `wrangler pages dev dist` (service role, `ADMIN_EMAILS`, kunci DOKU **sandbox**); diisi pemilik produk, tidak di-commit.
   - ⬜ **Order uji** milik akun admin untuk Jadikan Kilat / pindah gelombang / toggle siaran / R8; hari libur yang diisi saat uji dimatikan lagi.
   - ⬜ **Uji lokal (syarat 4)**: sisi peneliti cukup `npm run dev` (kartu, modal, wizard `?product=kilat`, pemilih gelombang, tiket Jadwal & Bayar, banner libur); sisi admin lewat `wrangler pages dev dist` (Jadikan Kilat, pindah gelombang, toggle siaran + `/api/respondents`, Mode libur (sql/122 dulu), badge, Pesan gelombang lagi; tagihan terbit sekali lalu dibatalkan).
   - ⬜ Keputusan sebelum Push B (tidak memblokir Push A): **notifikasi aktif ke admin** saat gelombang Kilat lunas (sekarang hanya badge, keputusan 14 Okt "tanpa email atau cron" — risiko siaran terlewat bila dashboard tak dibuka); **akun uji non-admin** untuk `KILAT_PILOT_EMAILS`.
   - Tabel tarif modal Kilat sengaja masih satu kolom rumus lama sampai `KILAT_TARIFF_FROM` diisi (Push B); tabel perkenalan tiga kolom menyala sendiri.

**Push A — semua kode, pintu tertutup.** `KILAT_TARIFF_FROM = null`, `KILAT_SELF_SERVE_OPEN = false`, kartu Kilat tetap `comingSoon`, extend Kilat tetap terkunci. Alur: merge ke `main` → `git pull` → push.

| Yang dirasakan | Siapa |
|---|---|
| Picker admin 11/15, toggle **Mode libur**, badge tab, toggle siaran, sinkron halaman | Admin |
| Batas bayar Kilat = gelombang − 60 menit, copy tanpa durasi, banner + modal mode libur | Order Kilat yang ada / peneliti selama mode libur |
| Wizard Kilat lewat `?product=kilat` | Admin saja |

**Periksa di produksi setelah Push A** (gabungan gerbang R1–R6 lama; Push Uji baru boleh setelah semuanya lulus):
- `total_cost` setiap order Kilat belum lunas **tidak berubah** (adu ulang); paritas klien = `create-payment.js`;
- 48 jam tanpa galat `kilat_wave_*` palsu di `query_logs`; 3 order macet tetap bisa disentuh cron/catatan admin;
- `sql/122` sudah diterapkan SEBELUM push (Langkah 3 lulus); toggle **Mode libur** dinyalakan sebentar lalu dimatikan: baris + `label_en` tertulis, banner tampil, ringkasan "dialihkan" muncul; badge = hitungan manual;
- satu order uji "Jadikan Kilat" menjalani linimasa toggle penuh, `/api/respondents` dicek di tiap keadaan;
- admin membuat order Kilat lewat wizard sampai Jadwal & Bayar; tagihan terbit sekali lalu dibatalkan (tanpa bayar sungguhan); umur link DOKU-nya ≤ gelombang − 60 menit (`invoices.expires_at`);
- order Kilat yang lewat batas bayar: halaman menampilkan "Pilih Gelombang Lain" tanpa tombol bayar, dan `create-payment` menjawab 409 `kilat_pay_closed` (cek log Pages Function);
- (R8) admin: "Pesan gelombang lagi" pada satu order Kilat uji → tiket Jadwal & Bayar gelombang ke-2, tagihan terbit sekali lalu dibatalkan; baris `ad_schedules` ber-`kilat_slot_hour`, `duration` 1, `end = start + 24 jam`; papan Kilat menampilkannya (`+Gel.`); akun non-admin TIDAK melihat kartunya.

**Push Uji — order swalayan sungguhan, hanya akun uji (ditambahkan 16 Okt).** Satu commit kecil: `KILAT_PILOT_EMAILS` (daftar literal akun uji) membuka kartu Kilat, wizard, dan kartu "Pesan gelombang lagi" **hanya** untuk email itu; semua peneliti lain tetap melihat `comingSoon`. `KILAT_TARIFF_FROM` **tetap `null`** — tarif baru mulai bersamaan dengan pintu dibuka (keputusan 14 Okt), dan tagihan uji memakai JFUTGRX (Rp1.000) sehingga angka tarif tidak teruji lewat bayar mana pun; angka tarif dijaga tes paritas dan dicek tampilannya pada build Push B.
- ✅ **DIPUTUSKAN 16 Okt — opsi A** (tabel keputusan). Catatan temuan aslinya: JFUTGRX tidak memotong apa pun selama `KILAT_TARIFF_FROM` null. `calculateKilatDiscount` (klien) dan salinannya di `create-payment.js` mengembalikan 0 untuk semua voucher pada rumus lama — keputusan "order Kilat lama tetap tanpa diskon". Jadi bayar nyata di Push Uji akan menagih harga penuh rumus lama (≈ Rp350rb–Rp700rb + hadiah + PPN), bukan Rp1.000. Pilihan: (A) JFUTGRX berlaku juga pada rumus lama (klien + server + tes paritas); di produksi hanya 1 order Kilat ber-JFUTGRX: `e56f4853` (order macet, jadwal 14 Sep lewat, `pending` Rp444.000) — tidak bisa ditagih ulang karena jadwalnya lewat; (B) isi `KILAT_TARIFF_FROM` di Push Uji (membatalkan keputusan 14 Okt); (C) bayar uji dengan harga penuh. Usulan: **A**, dikerjakan bersama R6 (jalur uang).
- ⚠️ Akun uji **wajib bukan email admin**: trigger klaim `sql/117` dan `create-payment.js` melewatkan email admin, jadi order dari akun admin tidak menguji jalur peneliti sama sekali.
- Uji di produksi (pemilik produk, akun uji):
  1. kartu Kilat → modal → wizard → pilih gelombang 15.00 → Kunci → tiket Jadwal & Bayar (tagihan terbit sekali);
  2. **bayar DOKU nyata** dengan JFUTGRX → webhook lunas → halaman lahir berjendela [15.00, +24 jam) → email/kwitansi tanpa teks durasi;
  3. admin menyalakan toggle siaran → `/api/respondents` `period.start` = waktu nyala, badge Kilat turun → admin mematikan → halaman "Survey sudah berakhir", `can_select_winners` = true;
  4. gelombang 11.00 hari ini tertutup setelah 09.00; pilih ulang gelombang mencabut tagihan lama;
  5. setelah order (2) tayang & lunas (= prasyarat 5.10): **"Pesan gelombang lagi"** dari akun uji — jarak < 24 jam ditolak, bulan sama tanpa tagihan hadiah, papan admin menampilkan kedua gelombang.
- Peneliti sungguhan tidak merasakan apa pun. Kegagalan di sini diperbaiki di branch dan di-push ulang sebagai Push Uji berikutnya; Push B menunggu.

**Push B — buka pintu untuk semua (5.9).**
- **Status 26 Okt:** disiapkan di `release/push-b-kilat`, rencana push 26 Okt 16.00 WIB (Senin sore, menyimpang dari aturan "pagi" — gelombang pertama yang bisa dipesan peneliti = 27 Okt 11.00, pesan s/d 09.00). Keputusan notifikasi admin: **email ke `ADMIN_EMAILS`** dari webhook DOKU saat gelombang Kilat lunas (`_kilat-paid-alert.js`). `comingSoon` di `CreateOrderCards` sengaja DIBIARKAN: dicabut per akun oleh `onOpenKilatModal`, yang kini terbuka untuk semua lewat bendera. Seri keamanan: `ad_schedules` sudah dijaga trigger kolom (pintu jadwal, airing/lunas, uang perpanjangan, siaran) — dicek 26 Okt; `invoices`/`transactions` dijaga `guard_paid_status_transition` untuk UPDATE, INSERT belum (lihat catatan rilis).
- Rancangan semula — satu commit kecil: isi `KILAT_TARIFF_FROM` (tanggal literal hari itu, di klien dan `create-payment.js`), `KILAT_SELF_SERVE_OPEN = true`, cabut `comingSoon`, extend Kilat terbuka untuk semua, `KILAT_PILOT_EMAILS` dikosongkan, dokumen penutup. Sebelum push: build commit ini dicek lokal — tabel tarif baru tampil di modal/Ringkasan dan `create-payment.js` menghitung angka yang sama (tes paritas). Hari push mengikuti aturan Push A. Sesudah push: pantau 3 order swalayan pertama; laporan ke tim undian (§5.9) dikirim.

Rencana undian 7 Okt boleh dieksekusi setelah Push B.

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
- **Mode libur & badge (5.4b, sql/122)**:
  - INSERT/UPDATE `"JFU_operational_holidays"` dari peran `authenticated` ditolak; `/api/admin/holidays` menolak non-admin; `proacl`/Advisor bersih;
  - selama menyala, klaim gelombang Kilat peneliti di tanggal ≥ nyala ditolak (HINT `kilat_admin_away`), admin tetap bisa; setelah dimatikan diterima;
  - Kilat otomatis yang dikirim saat libur: `in_review`, tanpa gelombang, `forced_manual_reason = 'admin_away'`; setelah disetujui masuk antrean "Tugaskan gelombang" (bukan pilih sendiri);
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
