# Rencana implementasi — indeks

Folder ini berisi rencana implementasi yang ditulis sebelum eksekusi. Sebagian sudah
selesai dan disimpan sebagai catatan sejarah; sebagian belum dijalankan sama sekali.

**Diperbarui 2026-09-03.**

> Rencana **bukan** status berjalan. Untuk "di mana posisi kita sekarang", baca
> [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md) — itu titik masuk resmi
> pekerjaan Jadwal Iklan dan selalu lebih mutakhir dari file mana pun di sini.

> ⚠️ **Tiga** rencana di sini **bukan** bagian Jadwal Iklan.
>
> 1. [webhook DOKU](2026-08-10-doku-webhook-silent-failure.md) lahir dari insiden pembayaran
>    dan berdiri sendiri. Ia mengambil `sql/54` supaya tidak menggeser nomor `50`–`53` yang
>    sudah diklaim `reward_pools`/Task 11/Task 13.
> 2. [Kenaikan harga + voucher klaim](2026-08-30-kenaikan-harga-voucher-klaim.md) lahir dari
>    arahan direksi soal tarif. Ia menyentuh jalur uang yang sama tapi tidak bergantung pada
>    satu pun task Jadwal Iklan, dan **ditahan sadar 2026-08-30** sampai langkah *contract*
>    `form_submissions_extend` selesai.
> 3. [Tagihan yang dibatalkan harus benar-benar mati](2026-09-03-tagihan-mati-benar-benar-mati.md)
>    lahir dari insiden pembayaran order `af004b84` — uang mendarat di link DOKU milik jadwal
>    yang sudah dibatalkan. Seperti rencana webhook di atas, ia berdiri sendiri; ia mengambil
>    `sql/80`–`84`. **Dieksekusi & dideploy 2026-09-03**, tapi ⚠️ **`sql/81` belum diterapkan
>    sementara kodenya sudah tayang** — 75 jadwal sedang kehilangan aksi "Batalkan Jadwal".
>    Status berjalan di [§00X](../../jadwal-iklan-progress.md).

> ⚠️ `sql/55` juga **tidak** punya dokumen rencana di folder ini — perbaikan langsung dari
> sesi chat 2026-08-13, bukan rencana pra-tulis. Ia mengubah `ensure_survey_page()` (Phase 1,
> `sql/40`/`42`): `display_order` iklan auto-publish kembali `NULL` saat dibuat, bukan
> `MAX+1`, supaya iklan baru tidak tenggelam ke bawah list hanya karena masih pakai banner
> default. Guard Kilat `sql/42` tidak disentuh. **Committed di kode
> ([`multi-step-form/sql/55_auto_page_display_order_neutral.sql`](../../../multi-step-form/sql/55_auto_page_display_order_neutral.sql))
> dan sudah diterapkan ke database produksi 2026-08-13, terverifikasi.** Detail lengkap ada
> di [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md), bagian "00C".

> ⚠️ **2026-08-17 — revamp visual dashboard sempat menyerempet tiga rencana.** Ketiganya
> sudah diselesaikan sebelum commit, tidak ada yang menggantung:
>
> 1. **Sebagian Task 13 Langkah 2 tak sengaja ikut terbangun** (multi-invoice per jadwal di
>    `fetchSchedulePayments` + daftar invoice di `ScheduleCardList`). **Dikembalikan ke
>    bentuk lama**, karena tanpa `schedule_id` ia salah menghitung uang: 82 sumber punya >1
>    baris transaksi dan pada 33 di antaranya penjumlahannya melebihi yang benar-benar
>    dibayar — satu order nyata lunas Rp 1.150.000 tampil Rp 3.450.000. Rancangan UI-nya
>    **dipungut dan dicatat** di [Task 13 §Langkah 2](2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md),
>    lengkap dengan angkanya, supaya versi yang benar lahir di atas Task 11 dan hasilnya
>    minimal setara. Catatan padanannya ditambahkan di [Task 11 §1b](2026-08-08-task-11-ad-schedules-otoritatif.md).
> 2. **`PAGE_LABEL` dihapus** — status halaman kini chip di `ScheduleEntryDrawer`, bukan teks
>    di agenda. Pembedaan Phase 3 yang wajib dijaga ("Kilat memang tidak punya halaman" vs
>    "halaman belum dibuat") sempat hilang dan **sudah dipulihkan** sebagai chip terpisah.
> 3. **Penjaga jalur uang dari commit `0b295bb` sempat melemah** (penjaga lunas di dalam query
>    `releaseScheduleSlot`, dan penandaan `slot_booked_by='admin'` saat admin memindah jadwal).
>    Keduanya **sudah dipulihkan**.

> ⚠️ **2026-08-17 — sebagian "Booking ID" Task 11 ditambal lebih awal.** Pencarian admin dulu
> hanya mencocokkan `form_submissions.id`, padahal Booking ID yang dilihat peneliti adalah
> `ad_schedules.source_id` — id `form_submissions_extend` untuk jadwal ke-2 dst. Akibatnya
> **13 dari 13** Booking ID jadwal lanjutan tidak bisa ditemukan admin sama sekali, dan
> gagalnya sunyi. Pencarian kini menerima kedua bentuk (dan pencarian id melewati filter
> bulan, karena ~94% order berada di luar bulan berjalan). **Yang TIDAK dikerjakan:**
> menyamakan id yang *ditampilkan* admin — itu tetap milik
> [Task 11](2026-08-08-task-11-ad-schedules-otoritatif.md), supaya kodenya tidak berganti dua
> kali. Detail di "00E" pada [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md).

> ⚠️ **2026-08-18 — revamp visual order form (Step 1–4) menyerempet dua rencana.**
> Keduanya sudah diselesaikan, tidak ada yang menggantung:
>
> 1. **Bar floating dipersempit ke Step 1 & 2**, atas keputusan pemilik produk: begitu user
>    menyeberang ke Step 3 ia sedang di jalur jadwal → bayar dan layarnya dibiarkan bersih.
>    Ini membatalkan kriteria terima "di setiap step" milik
>    [back-cancel Task 5 §5–6](2026-08-10-order-form-back-cancel.md) — **rencananya sudah
>    diralat**, bukan kodenya. Jalan keluar dari Step 3/4 tetap ada lewat tombol "Kembali"
>    per-step ke Step 2. Sekalian diperbaiki: `isHeaderVisible` sempat punya **dua penulis**
>    (`MultiStepForm` ↔ `StepSurveyDetails`) sehingga bar muncul/hilang tergantung arah user
>    tiba, dan saat muncul di Step 1 ia menutupi baris tombolnya sendiri. Sekarang nilai
>    turunan, satu pemilik.
> 2. **`handleSelect` di `StepSchedule` berhenti menulis ke `formData`** — tanggal baru
>    mendarat di draft saat dikonfirmasi. Ini **memperkuat**, bukan melanggar, koreksi no. 3
>    di kepala [order-flow-reorder](2026-08-09-order-flow-reorder.md): rewind `currentStep`
>    tetap tidak diperlukan. Guard draft di `MultiStepForm` **tetap dipakai** — jalur Kilat
>    (Step 4 → Step 2) masih memarkir tanggal di draft. Trade-off yang diterima sadar:
>    reload tab di Step 3 kini menghapus tanggal yang belum dikunci.
>
> Copy tombol Step 3 dikembalikan ke **"Kunci Jadwal & Lanjut Bayar"** — kata "kunci" milik
> tombol yang benar-benar mengunci slot, bukan tombol Step 2 yang hanya mengantar ke sana.

> ⚠️ **2026-08-18 — `JFUSUHUD` sekarang punya tanggal mati, dan itu menutup pintu Kilat.**
> Voucher itu selama ini tidak punya masa berlaku di kode sama sekali; "berakhir ~16 Agustus"
> hanyalah kesepakatan lisan. Sejak commit hari ini ia **berlaku s/d 31 Agu 2026** (mati
> 1 Sep 00.00 WIB), dan karena ia satu-satunya pembawa `isKilatEligible`, tombol upgrade Kilat
> ikut hilang saat itu — **disengaja**, lihat [rencana menu Kilat](2026-08-18-kilat-menu-mandiri.md).
>
> Dua hal ikut dibetulkan karena tanggal mati tanpa keduanya berbahaya:
>
> 1. **Kevalidan voucher dinilai pada tanggal order LAHIR, bukan jam pembayaran.**
>    `create-payment.js` menghitung ulang harga tiap pembayaran lalu diam-diam mengoreksi
>    `total_cost` di DB ke angka server — jadi tanpa ini, order yang dipesan sewaktu voucher
>    masih hidup akan **ditagih lebih mahal** dari ringkasan yang disetujui pemesannya. Jebakan
>    yang sama sudah terpasang untuk ILKOMUNY (31 Des 2026) dan JFUFEB (20 Feb 2027); ketiganya
>    kini aman.
> 2. **Pesan voucher yang masih berlaku menyebut tanggal berakhirnya**, supaya peneliti tahu
>    sebelum kehilangan dan bukan pada 1 September saat kodenya berhenti bekerja.
>
> ✅ **Sudah tidak menumpang apa pun.** Ia lahir di `feat/dashboard-soft-dna-navbar`, dan
> branch itu **di-merge ke `main` 2026-08-18** sesudah penahanannya dicabut. Batas 31 Agustus
> berlaku begitu `main` dideploy — cherry-pick yang dulu disiapkan sebagai jalan darurat
> tidak jadi diperlukan. Sisa tenggatnya **13 hari** terhitung dari tanggal merge.
>
> Repo ini juga akhirnya punya test runner: **vitest** (`npm test`), dengan aturan penamaan
> `*.spec.ts` untuk suite vitest dan `*.test.ts` untuk lima skrip mandiri lama yang tetap
> dijalankan lewat `esbuild … | node`. Suite pertamanya menjaga paritas harga klien–server yang
> selama ini hanya dijaga komentar.

## Daftar rencana

| Rencana | Status | Ringkas |
|---|---|---|
| [2026-09-03-tagihan-mati-benar-benar-mati](2026-09-03-tagihan-mati-benar-benar-mati.md) | ✅ **dieksekusi & DIDEPLOY 2026-09-03** — `sql/80`·`82`·`83`·`84` diterapkan & diverifikasi · 🔴 **`sql/81` BELUM diterapkan padahal kodenya sudah tayang** · ⬜ Cancel Order API belum diuji di sandbox | **Di luar alur Jadwal Iklan** — insiden pembayaran order `af004b84`: uang mendarat di link DOKU milik jadwal yang sudah dibatalkan 20 menit sesudah tagihannya terbit. Tiga asumsi hulu yang gagal: `is_stale` buta terhadap jadwal yang *mati* (hanya melihat yang *pindah*, karena `cancelSchedule()` mempertahankan tanggal); umur link dipatok 7 hari; dan "uang masuk boleh diterapkan ke jadwalnya" — benar untuk **buku besar**, tidak untuk **jadwal**. Sekarang: outcome `paid_on_dead_bill` (nol tulisan, 200, antrean admin), umur link mengikuti batas bayar jadwal dengan lantai 60 menit yang **menolak** alih-alih meng-clamp, gerbang "batalkan tagihannya dulu", dan Cancel Order API DOKU. ⚠️ **Menukar kegagalan berisik dengan kegagalan sunyi DI BUKU** — pendapatan kurang hitung sampai admin bertindak; rekonsiliasi harus tahu kelas selisih ini ada. ⚠️ **`sql/81` menahan gerbang 6a**: selama belum diterapkan, 75 jadwal kehilangan aksi "Batalkan Jadwal". Temuan di luar rencana: `transactions` **tidak punya** `expires_at`; **tidak ada cron** yang mengedaluwarsakan tagihan (182/183 baris `pending` sudah lewat 7 hari, tertua Des 2025); tiga outcome `sql/77` tidak pernah masuk peta label banner. Status berjalan di [§00X](../../jadwal-iklan-progress.md) |
| [2026-08-30-kenaikan-harga-voucher-klaim](2026-08-30-kenaikan-harga-voucher-klaim.md) | ⬜ **belum dieksekusi — ditahan 2026-08-30** atas permintaan pemilik produk, supaya langkah *contract* `form_submissions_extend` selesai lebih dulu. Nol baris kode berubah | Tangga tarif naik ke **200/350/500/650/800** (kesepakatan 2026-07-20 yang tak pernah dijalankan) — **+65,2%** atas bauran order nyata, ±Rp 29,8jt → 49,2jt/bulan. Dilunakkan **halaman "Klaim Voucher" self-serve**: potongan persen bercap, sekali per akun, bermasa berlaku. JFUSUHUD dibiarkan mati 31 Agu 2026 dan voucher klaim jadi penggantinya. ⚠️ **`calculateAdCostPerDay()` tidak punya parameter tanggal** sementara `create-payment.js` menghitung ulang harga tiap kali orang menekan bayar — menaikkan tarif begitu saja akan menagih **80 order approved-belum-bayar** rata-rata **+Rp 230.000** (total +Rp 18,4jt) tanpa ada yang memberi tahu. Karena itu tangga tarif dibuat **ber-tanggal**, dan Fase 1 dikirim sebagai **no-op**. ⚠️ Titik harga ada **TIGA**, bukan empat — `StepOneFormFields` itu tangga *hadiah responden*, bukan tarif iklan |
| [2026-08-10-doku-webhook-silent-failure](2026-08-10-doku-webhook-silent-failure.md) | ✅ **kode selesai & teruji lokal 2026-08-10** · ✅ **`sql/54` diterapkan** · ✅ **dideploy 2026-08-18** · ✅ **TERBUKTI JALAN 2026-08-18** — baris pertama `doku_webhook_events` mendarat dari pembayaran produksi nyata Rp 1.498.500 (VA Mandiri, `http_status` 200, `outcome` `ok`), dan itu terjadi **sesudah** `sql/52` sehingga sekalian membuktikan jalur uang selamat di atas view | Webhook DOKU dulu balas 200 walau tulis DB gagal — pembayaran hilang diam-diam (insiden Nur Fitriana, Rp 499.500). Sebabnya semua `fetch` ke PostgREST tidak memeriksa `res.ok`. Sekarang: `sbFetch` + cek jumlah baris berubah, kunci service-role fail-closed, balas 500 supaya DOKU retry (dibatasi 5x), jejak permanen di `doku_webhook_events` (`sql/54`), email admin, banner di halaman Keuangan. **Cloudflare Observability TIDAK tersedia untuk Pages** — itu sebabnya loggingnya di Supabase. **Jalur uang — rilis sendiri; terapkan `sql/54` SEBELUM deploy** |
| [2026-08-09-order-flow-reorder](2026-08-09-order-flow-reorder.md) | ✅ **masuk `main` 2026-08-18** · 🟡 **cron `sql/48` direm sejak 2026-08-10 — hidupkan lagi SESUDAH deploy** | Wizard order user dibalik: Detail → Ringkasan → Jadwal & Bayar (dulu Jadwal sebelum Review); layar jadwal+countdown digabung, kedaluwarsa pulih di tempat; P0 kebocoran data anon (`sql/47`); dua email transisi via pg_cron/pg_net (`sql/48`). Verifikasi 6 skenario baru lewat code-trace, klik manual di browser masih PR. **Baca kotak koreksi 2026-08-10 di kepalanya** — tiga hal menyimpang dari badan dokumen |
| [2026-08-10-order-form-back-cancel](2026-08-10-order-form-back-cancel.md) | ✅ **selesai, commit `3663bed`, masuk `main` 2026-08-18** | Tiap step order form dapat tombol "Kembali" di sebelah CTA-nya, dan panah mundur di bar floating berubah jadi `X` "Batalkan Pesanan" berdialog konfirmasi (buang draft → `/dashboard`). **Baca kotak koreksi 2026-08-18 di kepalanya** — bar floating kini hanya di Step 1 & 2, jadi `X`-nya tidak terjangkau dari Step 3/4 (disengaja) |
| [2026-08-18-kilat-menu-mandiri](2026-08-18-kilat-menu-mandiri.md) | ⬜ **ditunda sadar; satu keputusan produk masih terbuka** | JFU Kilat pindah dari upgrade berpagar voucher jadi **menu tersendiri** di dashboard peneliti, terbuka untuk semua dengan antrean tanggal seperti Iklan. Sebagian besar antreannya **sudah ada** (kuota 8/hari, kalender Kilat, papan admin) — yang kurang pintunya. Belum bisa jadi rencana tugas-per-tugas: siapa yang memilih jam gelombang belum diputuskan. Mencatat satu lubang nyata: **aturan Senin–Jumat cuma hidup di picker admin** |
| _(tanpa rencana — datang lewat `main`)_ | 🔴→🟢 **`sql/65` diterapkan 2026-08-19** · ⬜ **belum terbukti mengirim satu email pun** | **Email "iklan selesai" tidak pernah terkirim sejak dipasang.** `notify_primary_ads_completed()` menyaring huruf BESAR (`'PAID'`, `'APPROVED'`) di sistem yang huruf kecil → cocok **0 baris**, cron sukses tiap hari tanpa melakukan apa pun. Ikut ketemu: jam berakhirnya mengabaikan jam tayang kustom & Kilat, dan tanpa batas mundur perbaikannya akan mem-blast **181 email** retroaktif (tertua 26 Mei). Diperbaiki + **531 tunggakan dibungkam** dalam satu transaksi. ⚠️ Penandaan masih tanpa cek hasil kiriman (pola insiden `sql/48`) — lihat §00R progress doc. Bukti pertama menunggu salah satu dari 7 iklan yang masih tayang berakhir |
| [2026-08-09-task-13-tagihan-fleksibel-per-jadwal](2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md) | ✅ **SELESAI DI BRANCH 2026-08-19 — `sql/53`, `60`, `62`, `63`, `64` semua diterapkan ke produksi & diverifikasi.** ⬜ **belum dideploy, belum diuji manual di browser untuk dashboard PENELITI.** 🔓 **Phase 4 terbuka** | Satu jadwal boleh punya **beberapa invoice** — tagihan susulan jadi piutang yang terlihat dan tidak pernah menghentikan iklan yang sedang tayang. Plus **batal reservasi per jadwal** dan **Extra Ad jadi sifat jadwal**, bukan sifat order. **Jalur uang — rilis sendiri.** ⚠️ **Tiga premis rencananya batal saat diukur; angka-angkanya di §00P progress doc, bukan di badan dokumen.** Yang terpenting: *"sumber kebenaran uang = invoice"* diterapkan harfiah akan **menghilangkan Rp 44.759.000 lunas** dari layar — 190 jadwal hanya punya baris `transactions`. Keputusan penggantinya: gabungan, kunci `payment_id`. Backfill Extra Ad juga bukan 25 melainkan **24** — yang ke-25 order Kilat, dan **Kilat tidak punya kuota tambahan** (aturan pemilik produk 2026-08-19, kini dijamin CHECK + trigger). **Sisa yang sadar ditinggal:** kredit/saldo order, koreksi tagihan (membatalkan invoice yang salah), daftar invoice di dashboard peneliti, membersihkan `[EXTRA_AD]` dari `admin_notes`, `DROP COLUMN survey_pages.is_extra_ad` |
| [2026-08-08-task-11-ad-schedules-otoritatif](2026-08-08-task-11-ad-schedules-otoritatif.md) | ✅ **SELESAI & TAYANG 2026-08-19** — Deploy A (`sql/51`, commit `eb336cf`+`7b3450a`) dan Deploy B (`sql/52`, commit `3e32832`) keduanya diterapkan, diuji di browser, dan dideploy. `ad_schedules` otoritatif untuk jadwal ke-2 dst. 🔓 **Task 13 terbuka.** Sisa opsional tanpa tenggat: Langkah 3 (pindahkan pemanggil dari view), lalu `DROP VIEW` — view menahan semuanya, jadi bukan penghalang | **Dipecah jadi dua rilis** — baca kotak koreksi di kepalanya. A (aditif, reversible): `booking_id` menyatukan kode yang dilihat admin & peneliti, `schedule_id` + trigger penurunnya, "Tandai Lunas" per jadwal, `UNIQUE` di `survey_pages`. B (tak reversibel): `form_submissions_extend` jadi view. Langkah 5 (rename identifier) **dikeluarkan** ke belakang `DROP VIEW`. ⚠️ Menemukan regresi `sql/49`-membatalkan-`sql/46` yang **memblokir B** — sudah diperbaiki di `sql/51` bagian 0, lihat §00J progress doc |
| [2026-08-05-phase-3-jadwal-iklan-terpadu](2026-08-05-phase-3-jadwal-iklan-terpadu.md) | ✅ **selesai di branch — sisa: adu visual + deploy** | Judulnya sudah basi (baca kotak koreksi di kepalanya). Task 9A+9B ✅, papan Schedule bertab ✅, drawer digabung ✅, Page Calendar pensiun ✅ |
| [2026-08-03-jadwal-iklan-redesign](2026-08-03-jadwal-iklan-redesign.md) | 🟡 **tinggal Task 10 & 11** | Rencana Phase 2 lengkap. Task 8/8B-1/8C/8D live; 9 ✅ dan 12 🟡 selesai di branch, belum tayang |
| [2026-08-03-phase-0-test-checklist](2026-08-03-phase-0-test-checklist.md) | ⬜ **belum dijalankan** | Checklist uji manual pasca-deploy Phase 0. §2/§3/§5 wajib. Tidak memblokir apa pun, tapi belum pernah dijalankan |
| [2026-07-30-design-system-dashboard](2026-07-30-design-system-dashboard.md) | ⬜ **belum dieksekusi** | Design-token system terpusat + perbaikan cascade `styles.css` legacy. Masih berlaku penuh |
| [2026-07-06-customer-identity-from-auth](2026-07-06-customer-identity-from-auth.md) | ✅ selesai 2026-07-06 | Satu akun auth = satu customer; `sql/27`+`sql/28` diterapkan |
| [2026-07-04-finance-page-revamp](2026-07-04-finance-page-revamp.md) | ✅ selesai 2026-07-06 | Halaman Transactions jadi "Keuangan" |
| [2026-07-03-submissions-visual-refresh](2026-07-03-submissions-visual-refresh.md) | ✅ selesai 2026-07-06 | Refresh visual halaman Submissions admin |

## Urutan rilis yang berlaku (diputuskan 2026-08-08, diperluas 2026-08-09)

**Deploy → Task 11 → Task 13 → Phase 4.** Bukan satu deploy besar sesudah Phase 4.

```
[1] merge → main ✅ · DEPLOY ✅ keduanya 2026-08-18 — sisa: jadwalkan cron
      isinya: revamp visual + Phase 2 Task 9 & 12(copy) + Phase 3 penuh
              + reorder flow order user (2026-08-09-order-flow-reorder, ✅ 2026-08-10)
              + P0 kebocoran data anon (sql/47) + email transisi (sql/48, pg_cron/pg_net)
      gerbang: adu visual di browser · cron_activate_extends() diawasi
               · 6 skenario order-flow diklik manual (baru diverifikasi via code-trace)
      ✅ penahanan dicabut, merge f217d58, push 835aea1, deploy selesai
      ✅ /api/notify-ad-live TERBUKTI TAYANG: POST tanpa kunci balas 401
         (bukan 405 seperti 10 Agu). Probe ini aman diulang — gerbang jalan
         sebelum apa pun, nol email terkirim, nol baris tersentuh.
      🔴 SISA SATU: cron notify-primary-ads-live. DICOBA 18 Agu 20.45 WIB dan
         GAGAL — net._http_response balas 500 "Email service not configured".
         Gerbang CRON_NOTIFY_SECRET LOLOS (bukan 401); yang hilang
         env.RESEND_API_KEY di Cloudflare Pages. Cron sudah di-unschedule lagi
         dan 4 order yang tertandai sudah dipulihkan — jendelanya masih
         terbuka, jadi kali ini pemulihannya nyata. Tindakan berikutnya milik
         pemilik Cloudflare, bukan kode — §00A
      ⚠️ cron.job_run_details "succeeded" TIDAK membuktikan apa pun: ia
         succeeded juga saat 405 (10 Agu) dan saat 500 (18 Agu). Satu-satunya
         bukti ada di net._http_response, dan isinya dipangkas berkala
      ⚠️ pemulihan 3 order terbakar 10 Agu NO-OP: jendelanya sudah lewat dan
         guard-nya mensyaratkan end_date > now(). Hilang permanen — §00A
      ⚠️ webhook DOKU (sql/54) BELUM terbukti: doku_webhook_events masih 0 baris,
         belum ada pembayaran sejak deploy. Order jadi paid TANPA baris di sana
         = alarm — §00I
[2] Task 11        branch baru dari main · JALUR UANG, rilis sendiri
[3] Task 13        tagihan fleksibel per jadwal · JALUR UANG, rilis sendiri
[4] Phase 4        tombol "Jadwalkan Iklan Lagi" swalayan di dashboard peneliti
      ditegaskan 2026-08-18: ia menunggu [3], BUKAN [2]. Task 11 tidak
      memblokirnya — view kompatibilitasnya membuat kode Phase 4 selamat
      tanpa diedit. Yang mengunci: tidak ada harga untuk jadwal ke-2
      (`total_cost` diketik tangan; 7 dari 13 baris prod bernilai 0 atau
      < Rp 10.000). Task 13 yang melahirkannya. Prasyarat kedua tetap
      berdiri sendiri: keputusan pool hadiah (`reward_pools`, Task 8B-2).
      Bukti lengkap: progress doc §00G
```

**Kenapa Task 13 duduk di [3] dan bukan sesudah Phase 4.** Ia memakai `schedule_id` yang
Task 11 lahirkan, jadi ia tidak bisa lebih awal. Dan ia menyentuh jalur uang yang sama —
dua rilis uang berturut-turut lebih mudah ditelusuri daripada satu rilis uang yang
diselingi fitur user-facing. Task 13 juga menyelesaikan sisa Task 10 yang sengaja
ditinggalkan sebagai peringatan sementara di Phase 3 ("Tandai Lunas" order-level).

Tiga alasan urutan dasarnya, dan yang ketiga yang menentukan:

1. **Phase 4 tidak diblokir kode, melainkan keputusan produk yang belum ada** — di mana
   pool hadiah tinggal untuk **83 order** yang sudah mendanai hadiah tanpa punya tanggal
   sama sekali. Menunda deploy ke belakang keputusan itu berarti menunda tanpa tanggal.
2. **Batchnya jadi tak terbaca.** Branch ini sudah ~49 commit di depan `main`. Menambah
   Phase 4 membuat satu deploy memuat revamp visual + papan Schedule + penulisan ulang
   dashboard peneliti + fitur user-facing baru; satu regresi punya 60+ tersangka.
3. **Task 11 adalah jalur uang** — webhook DOKU, cron 15 menit, 2 jadwal sedang menunggu
   bayar. Alasan ia diputuskan rilis sendiri persis ini: regresi pembayaran tidak boleh
   tersamar di antara ratusan perubahan tampilan. Menunda deploy menunda Task 11 juga.

## Hubungan dengan rencana lain

**Phase 3 dan design-system saling bersinggungan, dan keduanya belum dieksekusi.**
Keduanya menyentuh dashboard, dan sejak keputusan 2026-08-05 keduanya akan hidup di branch
yang sama (`feat/dashboard-soft-dna-navbar`).

**Diputuskan 2026-08-05: Phase 3 duluan, design-system belakangan.**

Argumen tandingannya nyata dan sengaja dikalahkan: design-system lebih dulu sebenarnya
lebih murah, karena Phase 3 membangun permukaan admin baru dan membangunnya di atas token
yang belum ada berarti menulis ulang recipe warna/spacing-nya belakangan.

Yang mengalahkannya: **risiko rilis**. Task 1 design-system membalik urutan cascade
`styles.css` dan menyentuh **seluruh** app sekaligus, sementara Phase 3 berisiko-sempit.
Branch ini sudah memuat revamp visual + sisa Phase 2 dalam satu unit rilis; menambahkan
perubahan berisiko-lebar ke dalamnya membuat satu deploy yang gagal sulit ditelusuri.

**Konsekuensi yang diterima sadar:** recipe warna/spacing tab Phase 3 kemungkinan ditulis
ulang setelah design-system masuk.

## Keputusan branch yang berlaku sekarang (2026-08-05)

Task 9–12 dan Phase 3 dikerjakan di **`feat/dashboard-soft-dna-navbar`**, bukan di branch
sendiri dari `main`. Larangan menumpang branch itu di rencana Phase 2 sudah **dicabut**
untuk task-task tersebut — alasannya lengkap di Global Constraints
[`2026-08-03-jadwal-iklan-redesign.md`](2026-08-03-jadwal-iklan-redesign.md).

⚠️ **Berlaku sampai branch itu di-merge, tidak sesudahnya.** Task 10 dan 11 dikerjakan
dari **branch baru dari `main`** — lihat §"Urutan rilis yang berlaku" di atas.

Konsekuensi yang diterima sadar: **revamp visual dan sisa Phase 2 jadi satu unit rilis** dan
tidak bisa di-revert sendiri-sendiri.

Task 8, 8B-1, 8C, dan 8D **tidak** kena keputusan ini — keempatnya sudah dikerjakan dari
`main` lewat branch sendiri, sudah live, dan bisa di-revert sendiri-sendiri.

Merge `main` → branch **sudah dijalankan 2026-08-05 sore** dan bersih di sisi kode. Branch
tidak lagi tertinggal; `git log --oneline feat/dashboard-soft-dna-navbar..main` kosong.

## Cara membaca folder ini

1. Buka [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md) — status berjalan.
2. Buka rencana yang statusnya ⬜ atau 🟡 di tabel di atas.
3. Rencana ✅ hanya untuk arkeologi: "kenapa kode ini berbentuk begini". Jangan
   dieksekusi ulang.

Setiap rencana menaruh penanda status di paling atas file, jadi membuka satu file langsung
tanpa lewat indeks ini pun tidak menyesatkan.
