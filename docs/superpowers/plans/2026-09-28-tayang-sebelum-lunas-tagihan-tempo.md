# Tayang sebelum lunas + tagihan tempo

> **Status 2026-09-29 — dieksekusi, di-commit di `feat/tagihan-tempo`, BELUM dideploy.**
> Rencana di bawah ditulis 28 Sep sebelum eksekusi dan dibiarkan apa adanya. Keadaan
> sekarang ada di kotak ini dan di [§00AE progress doc](../../jadwal-iklan-progress.md).
>
> - ✅ `sql/101` (ops, merapikan tagihan JFU-INV-15f4ac) dan `sql/102` **diterapkan pengguna
>   29 Sep**. Diverifikasi di produksi: kolom, trigger `trg_ad_schedules_guard_credit`, unique
>   index, snapshot 7 fungsi, dan `proacl` tanpa `anon` (hanya `mark_schedules_on_credit`
>   yang terbuka untuk `authenticated`, dengan gerbang admin di dalam fungsinya).
> - ✅ **P1 email DOKU menyimpang dari rencana, dan itu aman.** Yang menyala hanya
>   "Pesanan Gagal". "Pesanan Berhasil" juga dimatikan, karena kuitansi dikirim webhook
>   kita sendiri (`_payment-receipt.js`, outcome `ok` + `completed`, termasuk jalur adopsi
>   tempo).
> - ⬜ **Uji browser belum.** Harus lewat `wrangler pages dev dist`, karena `npm run dev`
>   tidak menjembatani `/bayar/` maupun `cancel-order`. Enam langkahnya di §Verifikasi.
> - ⬜ **Deploy:** merge ke `main`, `git pull`, lalu push. SQL-nya sudah mendahului, jadi
>   urutan P2 terpenuhi.
>
> **Yang berubah atau bertambah saat eksekusi** (tidak ada di rancangan di bawah):
>
> - **Resolver:** reason `group_expired` lahir dengan nama `bill_expired`. Cakupannya lebih
>   luas: juga link 7 hari yang habis untuk jadwal jauh hari, tidak hanya grup.
> - **`markScheduleAsPaid` sekarang berlingkup SATU tagihan** (`payment_id`).
>   - Tagihan yang ditandai adalah tagihan terakhir yang tidak `cancelled`. Sebelumnya
>     setiap baris `pending`/`expired` milik jadwal itu ikut ditandai. Itulah cara
>     Rp 1.542.900 fiktif lahir.
>   - `settleGroupAsPaid` mengoper `paymentId`-nya sendiri.
> - **`killDokuLinksForSchedule` memundurkan `expires_at` saudara segrup** ke sekarang.
>   - Link satu `payment_id` mati untuk semua anggota. Kalau `expires_at`-nya tidak
>     dimundurkan, resolver menyerahkan link mati itu sebagai `live`.
>   - Setelah dimundurkan, tagihan tempo terbaca `tempo_renewable`, dan tagihan biasa
>     terbaca `bill_expired`.
> - **`cancel-order.js` menolak peneliti membatalkan tagihan tempo** (K8). Tanpa penolakan
>   ini, link DOKU mati sementara baris kita tetap `pending`.
> - **Webhook STEP 0t:** notifikasi DOKU selain SUCCESS untuk tagihan tempo menghasilkan nol
>   tulisan.
>   - Jalur lama akan menulis `failed`. Akibatnya utang lenyap, dan `/bayar/` menyuruh
>     peneliti menjadwalkan ulang iklan yang sedang tayang.
>   - Adopsi di STEP 0a hanya untuk `completed`. Syarat ini tetap berlaku walaupun
>     `is_tempo` gagal terbaca.
>   - Keadaan hari ini: 100 dari 100 notifikasi produksi sejak 18 Agu berstatus SUCCESS.
>     Penjaga ini untuk hari DOKU mulai mengirim status lain.
> - **`/invoices/:id`:**
>   - tagihan tempo menampilkan "Jatuh Tempo: Tidak ada";
>   - tombol bayarnya tidak dimatikan oleh `expires_at`;
>   - dokumen yang sudah diperbarui (semua barisnya `cancelled` + `superseded_by`) dialihkan
>     ke penggantinya.
> - **Dashboard peneliti — jebakan yang tidak diramalkan rencana:**
>   - `isSchedulePaid()` membaca `scheduled`/`live` sebagai lunas. Akibatnya jadwal kredit
>     ikut `ui.isPaid`, callout "pembayaran diterima" muncul, dan Mimin AI menyebut "lunas".
>   - Sumbu tayang sengaja dibiarkan. Kalimat uang dijaga `ui.owesOnCredit` (predikat
>     `isOwedOnCredit` di `scheduleAxes.ts`).
>   - Chip kredit mengikuti `creditPhaseOf` (upcoming/live/ended/stopped). Sebelumnya chip
>     selalu "Tayang", bahkan untuk iklan minggu depan atau iklan yang dihentikan.
>
> **Risiko sisa yang dicatat, tidak diperbaiki:**
>
> - **"Batalkan tagihan" tempo sebelum tayang tidak mencabut izin tayangnya** (K9). Kalau
>   admin lupa menerbitkan ulang, iklannya tayang tanpa tagihan sama sekali. Satu-satunya
>   pengingat adalah tombol "Buat Tagihan (tempo)" di kartu.
> - **`bill_expired` menjanjikan "tagihan baru akan dikirimkan"**, tapi tidak ada yang memberi
>   tahu admin bahwa tagihannya perlu diterbitkan ulang.
> - **Menghentikan perpanjangan kredit yang sedang tayang** menutup halamannya tanpa
>   memeriksa hasil nol baris. Kalau cocokan tanggalnya meleset, iklannya terus tayang
>   sampai tanggal selesai.
> - **Anggota non-lead tagihan gabungan** diarahkan ke `/invoices/<id>`, yang butuh login.
>   Karena itu admin selalu mengirim link `/bayar/` milik lead.
> - **Koreksi review 29 Sep:** `cancelSchedule` jalur belum-tayang **sudah** menutup baris
>   tagihannya sendiri (`expired`, per `schedule_id`, di `supabase.ts` bagian bawah fungsi).
>   Memanggil `killDokuLinksForSchedule` tanpa `markCancelled` di sana **bukan** bug.
>
> **Tambahan 29 Sep — tempo SUSULAN** (keputusan pengguna: didukung, bukan disembunyikan).
> Toggle tempo ikut muncul di "Tagih Susulan" karena `InvoiceForm`-nya sama. Semua jalur
> tempo menganggap tempo = kredit, jadi pada jadwal yang **sudah lunas** lima hal patah.
> Definisi yang dipakai: susulan = `payment_status` jadwal sudah `paid`/`completed` saat
> tagihan terbit (sama dengan cabang `already_paid` di `mark_schedules_on_credit`).
>
> - **`InvoiceForm`:** tempo susulan tidak memanggil `markSchedulesOnCredit`, sehingga toast
>   "TIDAK ditayangkan" tidak muncul. Kalimat toggle-nya sendiri. Kalimat K8 dan catatan
>   kredit disembunyikan.
> - **Blok tulis perpanjangan dilewati untuk SEMUA susulan**, tempo maupun bukan. Bug lama
>   yang ikut tertutup: susulan biasa pada perpanjangan yang lunas menulis
>   `waiting_payment`/`pending`, sehingga `trg_close_page_on_extend_unpaid` menutup halaman
>   yang sedang tayang. Blok itu juga menimpa `total_cost` dengan selisihnya.
> - **Kartu admin:**
>   - `isLateForSchedule(…, billing)` bernilai false kalau tagihan terbukanya tempo, supaya
>     utang tidak hilang dari `cardMoneyOf` sesudah tanggal lewat;
>   - `partially_paid` dengan tempo terbuka mendapat aksi utama "Tandai Lunas";
>   - gerbang `onMarkPaid` di `SchedulePaymentTab` kini juga terbuka kalau ada tempo
>     terbuka, karena `lifecycle.isPaid` berlingkup order dan dimuat saat dashboard dibuka;
>   - dialog Tandai Lunas menyebut nominal tagihan terbuka, bukan `totalCost`.
> - **K8 hanya mengunci jadwal kredit.** `tempoCancelBlockReason` membaca `air_on_credit_at`.
>   `InvoiceGroupMember.airOnCredit` bersifat gagal-tertutup: `undefined` tetap mengunci.
> - **Tahap tidak mundur saat tempo susulan dilunasi**, baik lewat webhook STEP 4b maupun
>   `markScheduleAsPaid`.
>   - Syaratnya `tempo && jadwal sudah lunas`. Tagihan tempo yang penandaan kreditnya gagal
>     tetap menggerakkan tahap.
>   - Webhook membaca `is_tempo` hanya untuk jadwal yang sudah lunas, dan gagal-terbuka.
>   - Variabelnya berganti nama dari `isCredit` menjadi `holdStage`.
> - **Email:** varian `topUp` dengan subjek "Tagihan susulan…". **WA:** `topUp` di
>   `invoiceReadyMessage`.
> - **Dashboard peneliti:** kartu `paid` dengan sisa tagihan dan tagihan terbuka mendapat
>   tautan "Bayar sisa" ke `/bayar/` (`holdsPayButton`).
> - **Nol SQL.** Hibah `ad_schedules` untuk anon/authenticated berlaku di level tabel
>   (diverifikasi 29 Sep), jadi kolom baru di select `fetchInvoiceGroups` aman untuk
>   `StatusPage`.
> - ~~Risiko sisa: "Tandai Lunas" satuan tidak mematikan link DOKU.~~ Ditutup di blok berikut.
>
> **Tambahan 29 Sep — Tandai Lunas / Tandai Belum Lunas** (ditemukan saat meninjau tempo susulan).
>
> - **Tandai Lunas satuan kini mematikan link DOKU lebih dulu** (`settleScheduleAsPaid`).
>   - Dulu hanya jalur grup yang mematikannya. Penyebabnya urutan sejarah, bukan keputusan
>     desain: `markScheduleAsPaid` lahir 18 Agu, sedangkan `doku_request_id` baru disimpan
>     sejak sql/84 (3 Sep).
>   - Bayar dobel ke tagihan `paid` tidak memicu penjaga apa pun, karena `paid_on_dead_bill`
>     hanya menyala untuk status mati.
>   - Hanya link yang **masih hidup** yang ditembak: `pending` dan `expires_at` belum lewat
>     atau NULL. Link yang kedaluwarsa sendiri tidak ditembak, supaya tidak ada peringatan
>     palsu.
>   - `invoices.expires_at` bertipe `timestamp without time zone` berisi jam UTC.
>     `isLinkStillLive` menempelkan `Z` secara eksplisit, karena tanpanya browser ber-WIB
>     membacanya meleset 7 jam.
> - **Tandai Belum Lunas dibatasi ke SATU tagihan** (`payment_id` pelunasan manual terakhir;
>   untuk grup, `payment_id` grupnya).
>   - Dulu setiap invoice `paid` milik jadwal itu ikut dibalik, termasuk invoice yang dibayar
>     lewat DOKU. Transaksinya sudah disaring `MANUAL_VERIFIED`, invoice-nya tidak.
> - **Tandai Belum Lunas tidak lagi menutup jadwal yang masih lunas dari tagihan lain**
>   (susulan).
>   - `hasOtherPaidBill` memeriksa kedua tabel dengan `or(payment_id.is.null,
>     payment_id.neq."…")`. `neq` polos akan membuang baris warisan yang `payment_id`-nya NULL.
>   - Sintaks dan maknanya dibuktikan di PostgREST produksi, dengan GET anon ke
>     `survey_pages`.
>   - Kalau pembacaannya gagal, fungsi **melempar**, bukan menebak.
> - **Tandai Belum Lunas memundurkan `expires_at` ke sekarang**, untuk tempo maupun tagihan
>   biasa.
>   - Link DOKU tidak bisa hidup lagi, karena DOKU tidak punya "batalkan pembatalan".
>   - Tanpa ini, `/bayar/` menjawab `live` dan mengantar peneliti ke halaman DOKU yang sudah
>     dibatalkan. Kartu admin juga menyembunyikan "Buat Tagihan".
>   - Sekarang tempo terbaca `tempo_renewable`, dan tagihan biasa terbaca kedaluwarsa.

## Context

Admin kadang perlu menayangkan iklan peneliti langganan yang **belum membayar**, dengan
keyakinan uangnya akan datang. Saat ini satu-satunya tuas untuk itu adalah "Tandai Lunas",
karena tayang digerbang oleh status lunas. Pada tagihan gabungan, cara ini menghapus porsi
yang ditandai dari penagihan, dan porsinya tercatat sebagai pendapatan tanpa uang.

### Keputusan produk (28 Sep, final)

| # | Keputusan |
|---|---|
| K1 | **Fungsi baru.** "Tandai Lunas" tetap berarti uang sudah diterima. |
| K2 | Kepercayaan diputuskan **per tagihan**. Tidak ada flag per peneliti. |
| K3 | **Tagihan tempo tanpa tanggal jatuh tempo**, di sisi admin maupun peneliti. Utang hidup sampai lunas. |
| K4 | Link DOKU di baliknya berumur 7 hari (detail teknis) dan **diperbarui otomatis** saat `/bayar/<jadwal>` dibuka, **tanpa login**. |
| K5 | Perpanjangan (ordinal ≥2) ikut di rilis pertama. |
| K6 | Iklan tempo yang dihentikan di tengah tayang: **utang tetap penuh**. |
| K7 | "Tandai Lunas" pada jadwal kredit dalam grup **melunasi semua anggota**. "Batalkan tagihan" **membatalkan seluruh tagihan bulk**. |
| K8 | Tagihan tempo **tidak bisa dibatalkan begitu ada anggota yang mulai tayang**. Sebelum tayang masih boleh, untuk membetulkan salah nominal. |
| K9 | **Tidak ada** "Batalkan Tayang Dulu". Tayang tanpa bayar tidak bisa ditarik lewat jalur tagihan. |
| K10 | Nominal tempo **dibekukan saat terbit**. Transisi harga 1 Okt tidak mengubahnya. |

## Audit — JFU-INV-15f4ac-1790216577586 (terverifikasi di DB)

| Booking | Tayang | Porsi | Keadaan 28 Sep |
|---|---|---|---|
| J8AXQVCF | 28 Sep | 527.250 | ditandai lunas 14.13 WIB, **sesudah** link mati |
| QE8KND8B | 29 Sep | 488.400 | pending |
| RWJJAARF | 29 Sep | 527.250 | pending |
| WH265TVZ | 30 Sep | 488.400 | pending |

1. **Satu link, satu umur.** Umur link diambil dari anggota paling awal
   ([BulkInvoiceDialog.tsx:224](../../../multi-step-form/src/components/schedule/BulkInvoiceDialog.tsx#L224),
   [payment.ts:119](../../../multi-step-form/src/utils/payment.ts#L119)). Keempat baris mati 28 Sep 13.59 WIB.
2. **"Tandai Lunas" kehilangan cakupan grup** begitu link mati: `openInvoice` bernilai null
   ([ScheduleCardList.tsx:848](../../../multi-step-form/src/components/submissions/tabs/ScheduleCardList.tsx#L848)).
3. **`markScheduleAsPaid` mengubah baris tagihan mati milik jadwal itu menjadi `paid`**
   ([supabase.ts:910-924](../../../multi-step-form/src/utils/supabase.ts#L910-L924)). Akibatnya porsinya
   tercatat sebagai pendapatan tanpa uang, dan hilang dari tagihan ulang
   ([bulkInvoiceCandidates.ts:57](../../../multi-step-form/src/components/schedule/bulkInvoiceCandidates.ts#L57)).
4. **Pesan `/bayar/` salah.** Anggota sisa membaca "kedaluwarsa, jadwalkan ulang" padahal
   batas bayar jadwal mereka sendiri belum lewat.

**Penyelesaian order ini (solusi cepat admin, sudah berjalan):**
- Tagihan Rp 2.031.300 diterbitkan di WH265TVZ (`...069960`, hidup s/d 30 Sep 13.59 WIB).
- Tiga jadwal lain ditandai lunas.
- `sql/101_ops_rapikan_tagihan_15f4ac.sql` menutup baris tagihan gabungan lama, supaya
  Rp 1.542.900 tidak tercatat sebagai pendapatan fiktif.
- ⛔ Jangan "Tandai Lunas" WH265TVZ.
- ⛔ Jangan unmark J8AXQVCF.
- Kalau WH265TVZ belum dibayar 30 Sep 13.00, tayangkan lewat SQL.

Catatan: Cancel Order DOKU **aktif**. Baris ringkasan di MEMORY.md yang menyebut "tidak pernah
aktif" basi, sedangkan isi berkasnya sudah dikoreksi 17 Sep.

## Prasyarat sebelum rilis

- **P1 — email DOKU (dicek manual oleh user).**
  - "Pesanan Baru", "Pesanan akan Kedaluwarsa", dan "Pesanan Kedaluwarsa" harus mati di
    dashboard DOKU.
  - Kalau masih nyala, peneliti tempo menerima email "kedaluwarsa" tiap 7 hari. Itu melanggar K3.
  - "Pesanan Berhasil" tetap nyala, karena itu satu-satunya tanda terima peneliti.
- **P2 — urutan rilis.** User menjalankan `sql/102` dulu, baru push ke `main`. Push ke `main`
  langsung ter-deploy (pelajaran sql/99: dashboard 400).

## Rancangan

### Kunci: pisahkan izin tayang dari uang

Menandai jadwal "tayang sebelum lunas" (**kredit**) tidak menyentuh baris uang.
- **Ordinal 1:** `order_is_airable()` ([sql/99:163-165](../../../multi-step-form/sql/99_tutup_jendela_halaman_saat_uang_dibalik.sql#L163-L165))
  sudah menerima `submission_status='scheduled'` walaupun pembayarannya masih pending, jadi
  halaman lahir lewat trigger yang sudah ada.
- **Ordinal ≥2:** `cron_activate_extends()` harus diubah supaya menerima jadwal kredit.

**Jadwal kredit selalu ber-`slot_booked_by='admin'`.** Satu tulisan ini membuat jadwal kredit
tidak pernah dianggap reservasi yang lepas. Ia menutup lima tempat sekaligus:
- cron pelepas slot ([sql/94:134](../../../multi-step-form/sql/94_cron_release_expired_slots.sql#L134)),
  yang tanpa ini akan mengosongkan tanggal dan menutup halaman yang sedang tayang;
- penjaga kuota harian;
- penjaga jendela ([sql/90:108](../../../multi-step-form/sql/90_window_guard_ignores_dead_schedules.sql#L108));
- hitung mundur di layar peneliti;
- tombol "Batalkan reservasi" peneliti ([schedulePageState.ts:108](../../../multi-step-form/src/utils/schedulePageState.ts#L108)).

Presedennya [ScheduleForm.tsx:450](../../../multi-step-form/src/components/schedule/ScheduleForm.tsx#L450).
Karena itu cron pelepas slot tidak perlu diubah.

**Utang dan "link bisa dibayar" adalah dua predikat.** Baris tempo tetap dihitung sebagai
utang walaupun link-nya lewat 7 hari. Kalau tidak begitu, piutang, state kartu admin, dan
tombol bayar peneliti ([StatusPage.tsx:410](../../../multi-step-form/src/pages/dashboard/StatusPage.tsx#L410))
ikut lenyap setiap kali link habis. Hanya resolver yang peduli apakah URL DOKU-nya masih hidup.

### 1. SQL — `sql/102_tayang_sebelum_lunas.sql`

Berkas diserahkan ke user untuk dijalankan sendiri, lengkap dengan dry-run, verifikasi, dan
rollback. Semua badan fungsi disalin dari `pg_get_functiondef` produksi, bukan dari berkas sql lama.

- **Kolom `ad_schedules`:** `air_on_credit_at timestamptz`, `air_on_credit_by text`,
  `air_on_credit_note text`.
  - Kolom eksplisit dibutuhkan karena `scheduled` + `pending` juga dimiliki order lama yang
    dibayar di luar sistem.
  - Pastikan `sync_ad_schedule_from_submission` tidak menimpa kolom ini.
- **Penjaga admin-only** untuk kolom kredit: perluas penjaga kolom uang sql/33. Buktikan dengan
  dijalankan, yaitu `set local role authenticated` + jwt peneliti harus ditolak.
- **Kolom `invoices`** (hanya di `invoices`; `transactions` punya skema berbeda):
  - `is_tempo boolean NOT NULL DEFAULT false`;
  - `superseded_by text`: `payment_id` pengganti saat diperbarui. Kolom ini membedakan pembatalan
    karena pembaruan dari pembatalan admin, untuk metrik dan untuk webhook.
- **Unique index parsial** `invoices(schedule_id) WHERE status='pending' AND is_tempo`. Ini
  menjamin satu tagihan tempo terbuka per jadwal, dan menjadi pengaman balapan pembaruan.
- **`schedule_billing`:** `is_expired` selalu false untuk baris `is_tempo`. Signature tidak
  diubah, supaya `schedule_billing_summary`, `authoritative_payment_url`, dan versi bulk tidak
  perlu di-DROP.
- **`authoritative_payment_url()`:**
  - reason baru `tempo_renewable`: jadwal punya tagihan tempo pending yang `expires_at`-nya
    lewat. Diperiksa **sebelum** `live`, supaya link DOKU mati tidak pernah dikembalikan;
  - reason baru `group_expired`: grup non-tempo yang mati karena cutoff anggota lain,
    sementara jadwal ini sendiri masih bisa dikejar. Kalimatnya menyuruh menunggu tagihan baru.
- **RPC `renew_tempo_bill(...)`** (SECURITY DEFINER, `service_role` saja). Dalam satu transaksi:
  - kunci baris lama;
  - salin baris invoice/transaksi dengan `payment_id` baru;
  - tutup baris lama: invoice `cancelled` + `superseded_by`, transaksi `expired`.
  - Pemanggil yang kalah balapan tertolak oleh unique index dan mengembalikan link pemenang.
- **`cron_activate_extends()`:** terima `payment_status='paid' OR air_on_credit_at IS NOT NULL`.
- **`notify_primary_ads_live()` / `notify_primary_ads_completed()`**
  ([sql/95:119,215](../../../multi-step-form/sql/95_ad_schedules_notifications.sql#L119)): sama.
- **Hibah fungsi:** cabut `anon` dan `authenticated` dari setiap fungsi baru, lalu periksa `proacl`.

### 2. Aksi data — `src/utils/supabase.ts`

- **`markScheduleOnCredit(entry, note)`:** tidak pernah dipanggil sendiri, hanya dari jalur
  penerbitan tempo (§3).
  - Ordinal 1: `form_submissions.submission_status='scheduled'` dan `slot_booked_by='admin'`.
    `payment_status` tidak disentuh.
  - Ordinal ≥2: `ad_schedules.status='scheduled'` dan `slot_booked_by='admin'`.
  - Keduanya: tulis kolom kredit.
  - Wajib `.select()` + `assertScheduleRowTouched`. Nol tulisan ke tabel uang.
- **"Tandai Lunas" pada jadwal kredit (K7):**
  - cakupannya seluruh anggota tagihan tempo terakhir, walaupun link-nya sudah mati;
  - jalurnya `settleGroupAsPaid`, yang juga mematikan link DOKU lewat Cancel Order.
- **`unmarkScheduleAsPaid` pada jadwal kredit:** kembali ke state kredit
  (`submission_status='scheduled'`), bukan `waiting_payment`. Dengan begitu salah klik tidak
  menutup halaman yang sedang tayang.
- **`cancelInvoice` / "Batalkan tagihan":**
  - selalu berlaku untuk seluruh grup (K7);
  - untuk tagihan tempo, **ditolak** kalau ada anggota yang sudah mulai tayang (K8), dengan
    penjaga di klien dan di tombol.
- **`cancelSchedule` pada jadwal kredit yang sudah mulai tayang (K6):**
  - halaman ditutup seperti biasa;
  - link DOKU tidak dimatikan, dan `payment_status` tidak ditulis `expired`;
  - tagihan tempo dan porsinya tetap utuh.

### 3. Tagihan tempo

**Terbit, satu-satunya pintu masuk kredit.**
- Menu "Tayangkan Dulu" di kartu membuka dialog tagihan dengan toggle **"Tagihan tempo — tayang
  sesuai jadwal, bayar menyusul"** sudah menyala, plus kolom catatan. Toggle yang sama ada di
  `BulkInvoiceDialog` dan `InvoiceForm`.
- Tidak ada state "kredit tanpa tagihan". Itu hanya bisa terjadi kalau admin membatalkan
  tagihan tempo sebelum tayang, dan kartunya lalu menawarkan tagihan tempo lagi.
- Kalau jadwal masih punya link non-tempo yang hidup, dialog membatalkannya (untuk seluruh
  grup, lewat Cancel Order) sebelum menerbitkan tagihan tempo.
- `createManualInvoice({ tempo: true })` memakai `MAX_INVOICE_MINUTES` dan sepenuhnya melewati
  `invoiceLifetimeMinutes()`, yang mengembalikan null untuk tanggal lampau lalu melempar
  ([payment.ts:289-296](../../../multi-step-form/src/utils/payment.ts#L289-L296)).
- Baris invoice ditulis `is_tempo = true`. Setelah itu jalankan `markScheduleOnCredit` untuk
  tiap anggota dan laporkan hasilnya per anggota (pola `settleGroupAsPaid`).
- **Peringatan utang menumpuk:** kalau peneliti itu masih punya tagihan tempo lain yang belum
  dibayar, dialog menampilkan jumlah dan umurnya. Ini peringatan, bukan blokir.
- `bulkInvoiceCandidates.ts`: dengan tempo, alasan *hold lapsed* dan *terlambat* bisa
  diperbaiki, dan jadwal lewat tanggal tetap eligible.
- Tagihan non-tempo dengan anggota campuran: umur link dihitung dari anggota **non-kredit**
  paling awal.

**Pembaruan otomatis di `/bayar/<jadwal>`, tanpa login (K4).**
Resolver [bayar/[id].js](../../../multi-step-form/functions/bayar/[id].js) memang dirancang tanpa login
(baris 32-34). Pembayar pelanggan tepercaya sering bagian keuangan kampus yang tidak punya akun.

1. Resolver menjawab `tempo_renewable`, lalu Pages Function yang sama memanggil modul bersama
   `functions/api/doku/_renew-tempo.js`. Modul ini berawalan `_`, jadi bukan rute dan tidak
   terkena gerbang admin `_middleware.js`. Pembundelan impor dari `functions/bayar/` dibuktikan
   di `wrangler pages dev`.
2. **Anggota yang diperbarui:**
   - anggota yang belum lunas, termasuk yang dibatalkan setelah sempat tayang (K6);
   - yang dibatalkan sebelum tayang tidak ikut;
   - nominal = Σ porsi baris lama (K10);
   - nol anggota berarti tidak ada pembaruan, dan halaman `paid` ditampilkan.
3. Cetak link baru lewat `dokuRequest()` ([_helpers.js:80](../../../multi-step-form/functions/api/doku/_helpers.js#L80)),
   berumur 7 hari. Pemeriksaan jumlah dan bentuk baris dipakai ulang dari `create-payment.js`,
   bukan ditulis versi kedua.
4. `renew_tempo_bill` menulis baris baru dan menutup baris lama secara atomik.
   - Kalah balapan: kembalikan link pemenang. Link DOKU yatim dari pihak yang kalah dibatalkan
     lewat Cancel Order.
   - DOKU gagal: baris lama tidak tersentuh, dan peneliti melihat halaman `error`.
5. Tujuan redirect mengikuti aturan lead/follower yang sudah ada:
   - lead ke URL DOKU;
   - follower ke `/invoices/<payment_id baru>`. Halaman ini di balik login, batasan yang sudah
     ada. Karena itu admin selalu mengirim link `/bayar/` milik lead.

Risiko: `/bayar/<uuid>` tetap kapabilitas pembawa, setara dengan hari ini. Siapa pun yang
memegang UUID hanya bisa mencetak link untuk membayar nominal beku. Idempotensinya membatasi
satu link per 7 hari.

### 4. Kartu admin — `scheduleCardActions.ts`, `ScheduleCardList.tsx`, `SchedulePaymentTab.tsx`

- **State baru `airing_on_credit`** (kredit dan belum lunas):
  - badge "Tayang sebelum lunas · N hari", yaitu umur utang sejak tayang;
  - **tanpa tanggal jatuh tempo**.
- `isEntryHoldLapsed` dan `isLateForSchedule` bernilai false untuk jadwal kredit.
- `cardMoneyOf` membaca utang tempo dari predikat utang (§Kunci), bukan dari predikat link hidup.
- **Aksi di state `airing_on_credit`:**
  - "Buat Tagihan (tempo)" hanya kalau tidak ada tagihan tempo pending;
  - "Tandai Lunas (N pesanan)" untuk seluruh grup;
  - "Batalkan tagihan" disembunyikan begitu ada anggota yang mulai tayang.
- **"Tayangkan Dulu"** muncul di menu `awaiting_invoice`, `waiting_payment`, dan `hold_lapsed`.
- **Ubah tanggal jadwal kredit:** diblokir setelah mulai tayang. Sebelum tayang, dialognya
  mewajibkan penerbitan ulang tagihan tempo, karena tagihan lama akan terbaca `is_stale`.
- **`InvoiceGroupPanel`:**
  - tagihan tempo ditulis "Tagihan tempo · belum dibayar", bukan "Hidup s/d";
  - grup biasa yang mati ditulis "Mati sejak …".
- **"Salin link" selalu menyalin `/bayar/<jadwal>`**, tidak pernah URL DOKU mentah.
- **Perbaikan "Tandai Lunas" non-kredit:**
  - keanggotaan grup dihitung dari `payment_id` mana pun, termasuk yang kedaluwarsa;
  - dialog menyebut porsi baris tagihan mati yang ikut tertandai, dan menunjuk ke "Tayangkan Dulu".

### 5. Permukaan lain

- **Webhook STEP 5** ([webhook.js:1234-1300](../../../multi-step-form/functions/api/doku/webhook.js#L1234-L1300)):
  - untuk jadwal kredit, hanya `payment_status` yang ditulis;
  - `submission_status` (ordinal 1) dan `status` (ordinal ≥2) tidak disentuh, supaya
    `live`/`completed` tidak mundur ke `paid`/`scheduled`;
  - efek sekunder (voucher, banner) tetap jalan.
- **Webhook, bayar telat ke link tempo yang sudah diganti** (`superseded_by` terisi):
  - kalau anggotanya masih belum lunas: terapkan pembayarannya, lunasi anggota, dan batalkan
    link pengganti lewat Cancel Order;
  - kalau sudah lunas lewat link baru: tahan sebagai `paid_on_dead_bill` dan kirim alarm
    (bayar ganda, perlu refund).
- **`create-payment.js`:** menolak jadwal kredit dan mengarahkan ke `/bayar/<jadwal>`, supaya
  tidak ada jalur pembayaran kedua.
- **Dashboard peneliti:**
  - tampil "Tayang — menunggu pembayaran", tanpa kuitansi;
  - state ini menang atas cabang `expired` / `too_late_today`
    ([airingPeriods.ts:435](../../../multi-step-form/src/components/status/airingPeriods.ts#L435),
    [SchedulePhase.tsx:855](../../../multi-step-form/src/components/status/SchedulePhase.tsx#L855));
  - `payLinkForBill` mengembalikan `/bayar/<jadwal>` untuk tempo;
  - tidak ada tombol batal atau pindah tanggal (akibat `slot_booked_by='admin'`, diverifikasi).
- **Teks WA** (`waMessage.ts`): untuk tempo, tanpa tenggat, dan menyebut jumlah pesanan kalau grup.
- **Filter "Tayang sebelum lunas"** di papan Schedule dan halaman Transaksi, diurutkan menurut
  umur utang.
- **Metrik:** baris `cancelled` dengan `superseded_by` terisi tidak dihitung sebagai tagihan batal.
- **Dicatat, tidak diperbaiki:** `deadBillOutcome` hanya membaca `status`, bukan `expires_at`.

## Verifikasi

- **Uji unit:**
  - `scheduleCardActions.spec.ts`: state kredit, gerbang lapse/late, "Batalkan tagihan"
    tersembunyi setelah tayang, cakupan grup kedaluwarsa.
  - `bulkInvoiceCandidates.spec.ts`: tempo membuka jadwal lewat tanggal.
  - `invoiceLifetime.spec.ts`: tempo = 7 hari tanpa melempar untuk tanggal lampau; grup campuran
    = cutoff non-kredit.
  - `renewTempo.spec.js` (baru):
    - tanpa login;
    - idempoten;
    - nominal = Σ porsi lama;
    - anggota lunas dan anggota batal-sebelum-tayang dibuang;
    - anggota batal-sesudah-tayang tetap ikut;
    - DOKU gagal tidak menyentuh baris lama.
  - `resolver.spec.js`: `tempo_renewable` menang atas `live`; `group_expired`.
  - `webhook.spec.js`:
    - bayar tempo sesudah `completed` tidak memundurkan stage;
    - bayar ke link yang sudah diganti melunasi dan membatalkan link baru;
    - bayar ganda ditahan.
  - `schedulePageState` / `payLinkForBill`: kredit tanpa hitung mundur, tanpa batal, dan link
    `/bayar/`.
- **SQL**, di dalam `BEGIN … ROLLBACK` dengan `set local role` + jwt claims:
  - kredit membuka halaman;
  - `cron_release_expired_slots()` tidak menyentuh jadwal kredit yang dipesan peneliti >1 jam lalu;
  - penjaga kuota tetap menghitung slot kredit;
  - cron mengangkat perpanjangan kredit dan notifier memilihnya;
  - peneliti ditolak menulis kolom kredit;
  - `schedule_billing_summary` tetap menghitung tempo yang link-nya lewat;
  - dua `renew_tempo_bill` bersamaan: satu menang;
  - baris uang tidak berubah oleh `markScheduleOnCredit`.
- **Tipe:** `npx tsc -p tsconfig.app.json`, lalu grep TS2304/TS2552 harus kosong.
- **Uji browser** lewat `wrangler pages dev dist` (dev vite tidak menjembatani `/bayar/`):
  1. tagihan tempo 4 pesanan;
  2. keempat halaman tayang sesuai tanggal;
  3. paksa `expires_at` lewat di data uji;
  4. buka `/bayar/` lead **tanpa login**: link baru terbit dengan nominal sama;
  5. bayar (sandbox): keempatnya lunas dengan nominal penuh, dan stage tidak mundur;
  6. coba "Batalkan tagihan" setelah tayang: ditolak.
- `graphify update .` setelah perubahan kode.
- **Memori:** perbarui baris ringkasan Cancel Order di MEMORY.md, catat keputusan K1–K10, dan
  catat jebakan "markScheduleAsPaid menandai baris tagihan mati".
