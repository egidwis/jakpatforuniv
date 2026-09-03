# Tagihan yang dibatalkan harus benar-benar mati

> **Arsip rencana — DIEKSEKUSI & DIDEPLOY 2026-09-03.** Berkas ini disimpan apa
> adanya sebagai catatan sejarah; status berjalan ada di
> [`docs/jadwal-iklan-progress.md` §00X](../../jadwal-iklan-progress.md).
>
> ⚠️ **Di luar alur Jadwal Iklan**, seperti rencana webhook 2026-08-10. Ia lahir
> dari insiden pembayaran order `af004b84` dan mengambil `sql/80`–`84`.
> Penomoran bergeser dari rencana awal: bersih-bersih tagihan zombie mengambil
> `sql/81`, jadi `is_stale` → `sql/82`, kesadaran kedaluwarsa → `sql/83` (**baru,
> tidak ada di rencana awal**), `doku_request_id` → `sql/84`.
>
> ⚠️ **`sql/81` BELUM DITERAPKAN** sementara kodenya sudah tayang — lihat §00X.

> ## Status eksekusi — 2026-09-03
>
> | Bagian | Status |
> |---|---|
> | 1 + 1B (perbaikan data `af004b84`) | ✅ **DITERAPKAN & terverifikasi di produksi** |
> | 2 — webhook `paid_on_dead_bill` + `sql/80` | ✅ migrasi diterapkan, kode + 9 tes baru |
> | 3 — umur link mengikuti jadwal | ✅ kode + 8 tes baru |
> | 4 — `is_stale` kenal jadwal mati (`sql/82`) | ✅ diterapkan & terverifikasi |
> | 5 — permukaan admin | ✅ (+ 3 outcome `sql/77` yang ternyata juga hilang) |
> | 6 — pengalaman "batalkan reservasi" | ✅ kode + 7 tes baru; **6a baru boleh tayang sesudah `sql/81`** |
> | 7 — matikan link di DOKU (`sql/84`) | ✅ migrasi + endpoint; **belum diuji di sandbox** |
> | `sql/81` — bersih-bersih 181 tagihan zombie | ⏸️ **DITULIS, BELUM DITERAPKAN** — menunggu persetujuan |
> | `sql/83` — billing sadar-kedaluwarsa | ✅ diterapkan, angka piutang tidak berubah |
>
> Penomoran bergeser dari rencana awal: bersih-bersih zombie mengambil `sql/81`,
> jadi `is_stale` → `sql/82`, kesadaran kedaluwarsa → `sql/83` (baru, tidak ada
> di rencana awal), `doku_request_id` → `sql/84`.

## Context

Order `af004b84` ("Geopark Kebumen and Sustainable Tourism") membayar Rp 444.000 lewat
link DOKU milik jadwal yang **sudah dibatalkan 20 menit setelah tagihannya terbit**.
Uangnya tercatat di `invoices`/`transactions`, tapi STEP 5 webhook mencoba menghidupkan
kembali jadwal batal itu (`status: 'scheduled'`) dan ditolak trigger irisan `sql/75`:
jendelanya (04–11 Sep, artefak bug "dipatok 7 hari" yang baru diperbaiki `153f68a`)
bertabrakan dengan jadwal pengganti (04–05 Sep). Webhook membalas HTTP 500, DOKU
retry 3×, dan jadwal yang benar-benar dipesan peneliti tetap `waiting_payment`.

**Ini bukan kegagalan webhook.** Webhook justru satu-satunya lapisan yang berisik.
Yang gagal adalah tiga asumsi di hulu:

| Asumsi | Kenyataan |
|---|---|
| `is_stale` (`sql/60`) menangkap tagihan yang tidak berlaku lagi | Rumusnya `billed_start_date <> ad_schedules.start_date`. `cancelSchedule()` **sengaja mempertahankan tanggal** — jadi tagihan jadwal batal punya `is_stale = false`. Terukur di `…664`: `billed_start` 04 Sep = `sched_start` 04 Sep. Detektornya melihat jadwal yang *pindah*, buta terhadap yang *mati*. |
| *"DOKU payments auto-expire via payment_due_date — no manual link closure needed"* ([supabase.ts:2698](../../GarCode/jakpatforuniv/multi-step-form/src/utils/supabase.ts#L2698), [:3084](../../GarCode/jakpatforuniv/multi-step-form/src/utils/supabase.ts#L3084)) | Benar secara harfiah, tapi umurnya `60*24*7` = **7 hari** ([payment.ts:142](../../GarCode/jakpatforuniv/multi-step-form/src/utils/payment.ts#L142)) — keabadian untuk jadwal yang bisa mati dalam 20 menit. |
| Uang yang masuk selalu boleh diterapkan ke jadwalnya | Berlaku untuk **buku besar**, tidak untuk **jadwal**. Menghidupkan jadwal yang sengaja dibatalkan tidak pernah benar; di kasus ini penjaga irisan kebetulan menangkapnya, dan untuk ordinal 1 ia **tidak akan menangkap apa pun** (`trg_submission_no_overlap` hanya menyala `UPDATE OF start_date, end_date`). |

Paparan hari ini kecil dan terukur: 3 event gagal (semua satu invoice), nol jadwal
yang diam-diam hidup lagi, 11 invoice + 10 transaksi `cancelled`, 5 + 7 `expired`.

## Keputusan pemilik produk (2026-09-03)

1. Pembayaran `…664` **dianggap pelunasan link kedua** (jadwal ordinal 3, 04–05 Sep).
2. "Hapus tagihan yang dibatalkan" = **matikan, bukan DELETE baris**. Baris tetap ada
   sebagai riwayat uang. Yang dimatikan ada dua lapis: **link-nya di DOKU** (Bagian 7,
   sejauh API-nya mengizinkan) dan **kemampuannya menggerakkan jadwal** (Bagian 2, yang
   selalu berlaku).
3. Umur link tagihan admin **mengikuti batas bayar jadwal**, bukan 7 hari mati.
4. Uang yang tetap mendarat di tagihan mati: **dicatat, jadwal tidak disentuh,
   diantrekan ke admin**.
5. Pembatalan jadwal **diblokir selama tagihannya masih hidup** — admin wajib
   membatalkan tagihannya dulu — dan pembatalan tagihan itu **membawa peringatan
   spesifik** soal link DOKU yang masih bisa dibayar.
6. Peneliti diberi tahu lewat **email saja** (tanpa tombol WhatsApp baru). Kalimat
   "jangan bayar link lama" jadi **bersyarat** pada hasil panggilan DOKU — tidak dihapus,
   dan tetap tanpa syarat sampai Bagian 7 terbukti di sandbox (Bagian 6d).
7. **Jadwal #2 order `af004b84` (`EAKD7WPQ`) BENAR-BENAR DIHAPUS** dari `ad_schedules`,
   dan #3 dinomori ulang jadi #2 (Bagian 1B). Ini tidak melanggar keputusan #2: yang
   dilindungi di sana riwayat **uang**, sedangkan baris ini murni salah input admin —
   iklan 7 hari dengan harga 1 hari — dan uangnya justru dipertahankan utuh.

---

## Bagian 1 — Perbaikan data order `af004b84` ⏰ sebelum 4 Sep 15.00 WIB

Jadwal ordinal 3 tayang besok; `cron_activate_extends` (*/15) hanya mengangkat baris
`status='scheduled' AND payment_status='paid'`. Kerjakan ini lebih dulu, terpisah dari
perubahan kode.

> ⚠️ **URUTAN LANGKAH 1 → 4 MENGIKAT, DAN ALASANNYA SENYAP.**
> `invoices_schedule_id_fkey` dan `transactions_schedule_id_fkey` keduanya
> **ON DELETE SET NULL** (diverifikasi `pg_constraint.confdeltype='n'`, 2026-09-03).
> Menghapus jadwal #2 sebelum uangnya dipindahkan membuat `schedule_id` baris `…664`
> jadi NULL **tanpa satu pun error** — dan `schedule_billing()` membaca `schedule_id`,
> jadi Rp 444.000 lenyap dari setiap papan jadwal selamanya. Pindahkan dulu, hapus
> kemudian, verifikasi di antaranya.

1. **Pindahkan pembayaran yang sudah lunas ke jadwal yang hidup.** Pertahankan
   `payment_id` asli (`…664`) sebagai baris lunas — itu yang benar-benar disettle DOKU,
   jadi rekonsiliasi dashboard tetap cocok dan pendapatan terhitung **sekali**.

       update invoices     set extend_id = '0159f80b-079f-4367-9d90-e8ec5801a973',
                               schedule_id = null
        where payment_id = 'JFU-INV-af004b-1788319498664';
       update transactions set extend_id = '0159f80b-079f-4367-9d90-e8ec5801a973',
                               schedule_id = null
        where payment_id = 'JFU-INV-af004b-1788319498664';

   > **Koreksi 2026-09-03 — versi tanpa `schedule_id = null` TIDAK BEKERJA.**
   > Plan ini sempat menyatakan `trg_derive_schedule_id` memindahkan `schedule_id`
   > sendiri. Trigger-nya memang menyala pada `UPDATE OF extend_id`, tapi baris
   > pertama `derive_schedule_id()` adalah
   > `IF NEW.schedule_id IS NOT NULL THEN RETURN NEW; END IF;` — dan `…664` **sudah
   > punya** `schedule_id = 010ee84a` (jadwal batal). Trigger pulang di baris pertama:
   > `extend_id` berubah, `schedule_id` tidak. Hasilnya baris yang menunjuk dua jadwal
   > berbeda, dan papan jadwal membaca yang salah. Mengosongkan `schedule_id` di UPDATE
   > yang sama membuat trigger benar-benar menurunkannya ulang — sekaligus jadi
   > **bukti** pemetaannya, bukan hardcode.

   `billed_start_date` keduanya sudah 04 Sep 08:00Z, jadi `is_stale` tetap `false`.

   **Verifikasi sebelum lanjut — wajib, bukan opsional:**

       select payment_id, extend_id, schedule_id from invoices
        where payment_id = 'JFU-INV-af004b-1788319498664';
       -- harapan: schedule_id = 4bae5af9-…  ❌ NULL berarti trigger gagal, JANGAN hapus apa pun

2. **Batalkan tagihan kembar `…458`** lewat tombol **"Batalkan tagihan"** di halaman
   Transaksi (memanggil `cancelInvoice()`), bukan SQL — supaya jejaknya lewat jalur
   yang disanksikan.

3. **Lunaskan jadwalnya.** Aman: `OLD.status='waiting_payment'`, tanggal tidak berubah,
   jadi cabang revival di `enforce_extend_schedule_rules` tidak menyala.
   `guard_extend_payment_columns()` meloloskan `service_role` dan `product@jakpat.net`.

       update ad_schedules set payment_status = 'paid', status = 'scheduled'
        where id = '4bae5af9-ef2d-4982-9d2a-b19d7013201c';

4. **Hapus jadwal #2 — lihat Bagian 1B di bawah.**

5. **Tandai selesai** 3 baris `doku_webhook_events` lewat tombol di `WebhookFailuresBanner`.
   Ini yang menjadi rekaman insidennya sesudah baris jadwalnya hilang.

> ⚠️ Link `…458` **masih hidup di DOKU sampai ~9 Sep**. Cancel Order API (Bagian 7) tidak
> bisa menolong di sini: ia menuntut `original_request_id`, dan untuk tagihan yang sudah
> terbit nilai itu tidak pernah disimpan. **Beri tahu peneliti jangan membayarnya —
> hari ini, jangan tunggu kodenya.** Selama Bagian 2 belum tayang, kalau uangnya masuk
> ke `…458` yang sudah dibatalkan, STEP 1a akan mem-PATCH baris `cancelled` itu balik
> jadi `paid` dan Rp 444.000 terhitung **dua kali**.

## Bagian 1B — Hapus jadwal #2 (`EAKD7WPQ`) dan rapikan penomorannya

**Alasannya beda dari tagihan, jadi keputusannya juga boleh beda.** Keputusan #2
("matikan, bukan hapus") melindungi **riwayat uang**. Jadwal #2 bukan riwayat uang dan
bukan peristiwa bisnis: ia murni salah input admin — iklan dijadwalkan 7 hari
(4–11 Sep) padahal harganya 1 hari. Jendela 7 hari itu sendiri artefak bug yang sudah
diperbaiki `153f68a`. Tidak ada yang perlu dikenang dari baris yang seharusnya tidak
pernah lahir; yang perlu dikenang — uangnya dan insidennya — hidup di
`invoices`/`transactions` dan `doku_webhook_events`, dan keduanya tidak tersentuh.

Efek yang diinginkan: **#3 menjadi #2**, dan pembayaran Rp 444.000 yang sudah lunas
menempel padanya.

**Prasyarat mutlak:** verifikasi di Bagian 1 langkah 1 sudah menunjukkan
`schedule_id = 4bae5af9…`. Kalau masih `010ee84a` atau NULL, **berhenti** — DELETE-nya
akan memutus uang dari jadwal mana pun tanpa peringatan.

1. **Snapshot dulu ke skema `backup`, bukan `public`.** Aturan `sql/61`: CTAS tidak
   mewarisi RLS, dan default privileges `anon` hanya berlaku di `public` — tabel telanjang
   di `public` langsung jadi temuan Advisor. Skema `backup` sudah ada (14 tabel).

       create table if not exists backup.ad_schedules_deleted
         (like public.ad_schedules including defaults);
       alter table backup.ad_schedules_deleted enable row level security;
       insert into backup.ad_schedules_deleted
       select * from public.ad_schedules
        where id = '010ee84a-2525-4402-90a1-4378d38e70a8';

   Satu baris ini yang membedakan "keputusan yang bisa ditinjau ulang" dari "keputusan
   yang tak bisa dibatalkan". Murah, sekali.

2. **Hapus barisnya.** Tidak ada trigger DELETE di `ad_schedules` sama sekali
   (diverifikasi: ketujuh trigger-nya BEFORE/AFTER INSERT/UPDATE), jadi tidak ada efek
   samping tersembunyi — juga tidak ada penomoran ulang otomatis.

       delete from public.ad_schedules
        where id = '010ee84a-2525-4402-90a1-4378d38e70a8';

   `form_submissions_extend` **sudah tidak ada** sebagai tabel maupun view (Task 11,
   `sql/73–76`), jadi `source_id = bc5d73d6…` tidak meninggalkan baris yatim di mana pun.
   Ini satu-satunya tempat jadwal itu hidup.

3. **Nomori ulang lewat fungsi yang sudah ada, jangan tulis UPDATE sendiri.**

       select resync_ad_schedule_ordinals('af004b84-c40d-45e6-98a0-2000ee2e0c1e');

   `resync_ad_schedule_ordinals()` adalah logika penomoran yang **sudah disanksikan**
   sistem — ia yang dipanggil `trg_ad_schedules_extend_resync` setiap kali jadwal extend
   pindah tanggal. Aturannya `1 + ROW_NUMBER() OVER (ORDER BY start_date, created_at, id)`
   untuk baris `form_submissions_extend` saja, jadi ordinal 1 tetap milik baris
   `form_submissions`. Menulis UPDATE tangan sendiri berarti memilih aturan urutan kedua
   yang akan berbeda hasilnya begitu ada pemindahan tanggal berikutnya.

   `ad_schedules_ordinal_key` UNIQUE (submission_id, ordinal) **DEFERRABLE INITIALLY
   DEFERRED**, jadi 3→2 tidak perlu nilai antara.

4. **Verifikasi tiga hal, bukan satu:**

       select id, ordinal, status, payment_status, start_date, end_date
         from ad_schedules where submission_id='af004b84-c40d-45e6-98a0-2000ee2e0c1e'
        order by ordinal;
       -- harapan: 2 baris — #1 (31 Agu, paid) dan #2 = 4bae5af9 (4–5 Sep, scheduled/paid)

       select payment_id, status, amount, schedule_id from invoices
        where form_submission_id='af004b84-c40d-45e6-98a0-2000ee2e0c1e';
       -- ❗ TIDAK BOLEH ADA schedule_id NULL. NULL = FK SET NULL menyambar, uang lepas.

       select sum(amount) from transactions
        where form_submission_id='af004b84-c40d-45e6-98a0-2000ee2e0c1e'
          and status in ('paid','completed');   -- harapan: 999000

> **Ini pengecualian satu order, bukan preseden.** Menghapus baris jadwal tidak menjadi
> perkakas admin. Kalau kesalahan input seperti ini berulang, yang dibangun adalah
> jalur "batalkan + sembunyikan" (`dismissed_at`, `sql/69`) — bukan tombol DELETE.

## Bagian 2 — Webhook menolak menggerakkan jadwal untuk tagihan mati

Jaring terakhir, dan satu-satunya lapisan yang **selalu** berlaku: Bagian 7 mematikan
link di DOKU, tapi hanya untuk tagihan baru, hanya untuk sebagian kanal, dan selalu bisa
kalah balapan dengan pembayaran yang sedang berjalan. Bagian ini yang menutup sisanya.

**Kosakata "mati" sudah ada:** `payment_status_rank()` (`sql/53`) memberi
`paid`/`completed` = 3, `expired`/`failed`/`cancelled` = **2**, `pending` = 1. Pakai itu,
jangan bikin daftar status baru.

Di [`functions/api/doku/webhook.js`](../../GarCode/jakpatforuniv/multi-step-form/functions/api/doku/webhook.js):

- **STEP 0** sudah `SELECT invoices?payment_id=eq.…&select=amount` sebelum tulisan
  pertama. Ubah jadi `select=amount,status` (dan sama untuk fallback `transactions`) —
  pre-state didapat **tanpa round-trip tambahan**.
- Tepat setelah verifikasi nominal, sebelum STEP 1a: kalau ada baris ber-rank 2,
  pulang dengan outcome baru **`paid_on_dead_bill`** dan **HTTP 200**. Tidak ada satu pun
  tulisan. Kondisi ini tidak akan pernah sukses di-retry, jadi 500 hanya membakar
  percobaan DOKU (hari ini: 3 dari batas 5).
- Presedennya persis `amount_mismatch`: nol tulisan, 200, alert admin.
- Untuk tagihan gabungan (N baris satu `payment_id`), **campuran hidup+mati juga
  dianggap mati**. Grup yang sebagian dibatalkan justru ambiguitas yang paling tidak
  boleh diterapkan otomatis; `error_message` menyebut baris mana yang mana.

**Konsekuensi yang disengaja, sebutkan ke tim:** peneliti yang membayar link
swalayan **setelah hold 1 jamnya lepas** (`transactions.status='expired'`) tidak lagi
aktif otomatis — slotnya memang sudah dilepas dan bisa sudah diambil order lain.
Uangnya tetap tercatat, kartunya muncul di antrean admin. Skala historis: 7 transaksi +
5 invoice `expired` sepanjang umur sistem.

> ⚠️ **Ini menukar kegagalan berisik dengan kegagalan sunyi DI BUKU — sadari harganya.**
> Nol tulisan berarti uangnya ada di DOKU sementara buku kita bilang `cancelled`.
> Hari ini uang itu setidaknya mendarat di `transactions`; sesudah Bagian 2, pendapatan
> **kurang hitung** sampai admin bertindak. Konsekuensinya: banner Bagian 5 berubah dari
> informasi menjadi **penanggung beban**. Karena itu barisnya wajib membawa nominal dan
> `payment_id`, dan hint-nya menyebut *"uang sudah diterima, BELUM tercatat sebagai
> pendapatan"* — bukan sekadar label status. Rekonsiliasi DOKU-vs-buku harus tahu kelas
> selisih baru ini ada.

**`sql/80` — nilai outcome baru di CHECK constraint.**
`doku_webhook_events_outcome_check` hari ini memuat 9 nilai (`ok`, `write_failed`,
`amount_mismatch`, `no_submission_found`, `forwarded_jm`, `payout`, `rejected_auth`,
`rejected_payload`, `handler_crashed`); `sql/80` menjadikannya 10.
⚠️ Urutannya mengikat, dan headernya `sql/77` sudah memperingatkan: **migrasi
diterapkan DULU, kode menyusul.** Terbalik = INSERT ditolak 400 → penolakannya sendiri
gagal dicatat → persis kebutaan yang sedang ditutup.

**Asimetri yang dipilih sadar, bukan kelupaan.** Untuk ordinal ≥2 ada dua lapis:
penjaga webhook ini **dan** `enforce_extend_schedule_rules` di DB. Untuk ordinal 1 hanya
ada penjaga webhook — `trg_submission_no_overlap` cuma menyala pada perubahan tanggal.
Kami **tidak** menambah trigger baru di sana: memblokir transisi `cancelled → scheduled`
di tingkat DB juga akan memblokir pembatalan-yang-dibatalkan yang sah, dan itu menukar
bug senyap dengan pintu terkunci. Yang ditanggung: kalau penjaga webhook ini dilewati
atau salah, ordinal 1 tidak punya jaring kedua.

## Bagian 3 — Umur link tidak boleh melebihi jadwal yang dibiayainya

- [`payment.ts:142`](../../GarCode/jakpatforuniv/multi-step-form/src/utils/payment.ts#L142):
  `payment_due_date` berhenti dipatok `60*24*7`. Hitung dari
  **`paymentCutoffInstant(ymd)`** yang sudah ada di
  [`airing-window.ts:142`](../../GarCode/jakpatforuniv/multi-step-form/src/utils/airing-window.ts#L142)
  (14.00 WIB, sadar-WIB — jangan hitung sendiri dari jam device). Batas atas tetap
  7 hari untuk tagihan jauh hari.
- **Lantainya 60 menit, dan di bawah itu TOLAK menerbitkan — jangan clamp.**
  Versi awal plan ini menulis "batas bawah beberapa menit"; itu salah arah. Tagihan yang
  terbit 13.50 untuk jadwal hari-H akan hidup 10 menit, dan link yang lahir sekarat lebih
  buruk daripada penolakan yang jelas: peneliti terlanjur menerima link, membayarnya
  gagal, dan tidak ada yang tahu kenapa. 60 menit sudah jadi konvensi berkas ini —
  `create-payment.js` memakai `dueDate … : 60` sebagai default. Kalau cutoff kurang dari
  60 menit lagi, tolak dengan alasan yang bisa dibaca admin.
- `InvoiceData` menerima tanggal tayang jadwal yang ditagih. Untuk bundel, pakai yang
  **paling awal** — link harus mati saat jadwal pertama yang dibiayainya kehilangan haknya.
  Dua pemanggil: [`InvoiceForm.tsx:336`](../../GarCode/jakpatforuniv/multi-step-form/src/components/schedule/InvoiceForm.tsx#L336)
  dan [`BulkInvoiceDialog.tsx:160`](../../GarCode/jakpatforuniv/multi-step-form/src/components/schedule/BulkInvoiceDialog.tsx#L160).
- [`waMessage.ts:16`](../../GarCode/jakpatforuniv/multi-step-form/src/utils/waMessage.ts#L16)
  menuliskan "7 hari" ke pesan WhatsApp peneliti. **Wajib ikut berubah** — kalau tidak,
  pesannya berbohong tentang link yang sudah mati.
- `buildInvoiceRows` ([`invoiceWrite.ts:121`](../../GarCode/jakpatforuniv/multi-step-form/src/components/schedule/invoiceWrite.ts#L121))
  mulai menulis **`expires_at`**. Hari ini hanya `create-payment.js` yang mengisinya —
  182 dari 183 invoice `pending` NULL — sehingga penjaga pakai-ulang di
  `create-payment.js` tidak punya bukti umur untuk tagihan admin.

## Bagian 4 — `is_stale` mengenali jadwal yang mati, bukan cuma yang pindah

`sql/81`, menyempurnakan niat `sql/60`. Di `schedule_billing()` (salin badannya dari
`pg_get_functiondef` produksi, **bukan** dari berkas `sql/` — jebakan `sql/49` vs `sql/51`):
CTE `sched` ikut mengambil `status`, dan `is_stale` menjadi benar juga ketika
`sched.status = 'cancelled'`. Pengecualian `sql/60` dipertahankan apa adanya: **uang yang
sudah masuk tidak pernah basi** (rank 3), **baris lama tidak pernah basi**
(`billed_start_date` NULL).

Efeknya di layar: tagihan milik jadwal batal langsung tampil basi di kartu jadwal dan
halaman Transaksi, tanpa menunggu ada yang membayarnya.

## Bagian 5 — Permukaan admin

[`WebhookFailuresBanner.tsx`](../../GarCode/jakpatforuniv/multi-step-form/src/components/transactions/WebhookFailuresBanner.tsx):
tambahkan `paid_on_dead_bill` ke `OUTCOME_LABELS` / `OUTCOME_VARIANTS` / `OUTCOME_HINTS`.
Hint-nya harus menyebut tindakan nyata, bukan "kirim ulang notifikasi" (yang justru
tidak boleh dilakukan di sini): *uang sudah diterima dan tercatat; jadwal sengaja tidak
disentuh; pindahkan ke tagihan hidup atau proses sebagai kelebihan bayar.*

Tanpa entri ini chip-nya kosong — kelas bug yang persis ditutup `65369c1`.

## Bagian 6 — Pengalaman "batalkan reservasi" di tab admin

Bagian 2–4 menutup akibatnya di mesin; bagian ini menutup **keputusannya**. Dua dialog
di tab yang sama hari ini menyatakan hal yang berlawanan tentang satu fakta:

| Dialog | Kalimatnya | Benar? |
|---|---|---|
| Batalkan **tagihan** ([SchedulePaymentTab.tsx:311](../../GarCode/jakpatforuniv/multi-step-form/src/components/submissions/tabs/SchedulePaymentTab.tsx#L311)) | *"Link bayar … masih bisa dibayar dari sisi bank. Kalau uangnya sungguh masuk, tagihan ini kembali jadi lunas."* | ✅ |
| Batalkan **jadwal** ([:176](../../GarCode/jakpatforuniv/multi-step-form/src/components/submissions/tabs/SchedulePaymentTab.tsx#L176)) | *"…tagihan yang masih menggantung untuk jadwal ini ikut dimatikan."* | ❌ |

Kebenarannya sudah ada di repo — hanya di dialog yang salah.

**6a. Blokir pembatalan jadwal selama tagihannya hidup.**
Di [`scheduleCardActions.ts`](../../GarCode/jakpatforuniv/multi-step-form/src/components/submissions/tabs/scheduleCardActions.ts),
`withCancel()` ikut digerbang `billing?.openInvoice == null` — **bentuk yang sama persis
dengan `canTopUp` yang sudah ada di berkas itu**, jadi tidak ada semantik baru.
`openInvoice` = tagihan hidup & belum lunas (`live.find(i => !i.isPaid)`,
[supabase.ts:3623](../../GarCode/jakpatforuniv/multi-step-form/src/utils/supabase.ts#L3623)),
cerminan `schedule_billing_summary()`.

⚠️ **Aksinya DIHILANGKAN dari menu, bukan ditampilkan `disabled`.** Itu kontrak eksplisit
berkas tersebut (*"Aksi yang TIDAK berlaku DIHILANGKAN… 'Tagih Susulan' yang disabled
berikut tooltipnya adalah pola yang diganti"*). Penjelasannya milik **callout kartu**
pada state `waiting_payment`: *"Batalkan tagihannya dulu — selama masih ada tagihan
hidup, jadwal ini tidak bisa dibatalkan."* Tanpa kalimat itu tombolnya sekadar hilang
tanpa sebab, dan itu jenis kebisuan yang sama dengan yang ditutup `65369c1`.

> 🔴 **PRASYARAT — tanpa ini 6a mencabut "Batalkan Jadwal" dari 75 jadwal hidup.**
> Terukur di produksi 2026-09-03: **182 dari 183** invoice `pending` sudah lewat 7 hari.
> Link DOKU-nya mati, status DB-nya `pending` **selamanya** — tidak ada cron yang
> mengedaluwarsakannya (`cron.job` cuma berisi `activate-extends` dan dua notifier);
> yang membalik status hanya `cancelSchedule()` dan `cancelInvoice()`. Dan
> `isLiveInvoice` ([billingCompare.ts:39](../../GarCode/jakpatforuniv/multi-step-form/src/utils/billingCompare.ts#L39))
> sama sekali tidak sadar kedaluwarsa — ia hanya membaca
> `isPaid`/`isPending`/`isSuperseded`/`isStale`.
>
> Jadi `openInvoice != null` untuk jadwal-jadwal ini:
>
> | Status jadwal | Jumlah |
> |---|---|
> | `requested` | 55 |
> | `slot_reserved` | 18 |
> | `unscheduled` | 2 |
>
> **75 jadwal** yang wajar dibatalkan admin kehilangan aksinya, dan admin harus
> membatalkan dulu tagihan yang mati berminggu-minggu lalu. Dua hal harus mendahului 6a:
> (a) satu migrasi bersih-bersih sekali jalan yang mengedaluwarsakan `pending` renta, dan
> (b) gerbangnya **sadar-kedaluwarsa**, bukan cuma sadar-status. Bagian 3 yang mencegahnya
> kambuh, dengan mulai menulis `expires_at`.

**6b. Peringatan spesifik pindah ke dialog "Batalkan tagihan".**
Di situlah admin benar-benar bisa bertindak. `lines` yang sudah ada jadi **bersyarat**
pada hasil panggilan Bagian 7:

- **berhasil dimatikan** → *"Link bayarnya sudah dinonaktifkan di DOKU."*
- **gagal / kanal tidak didukung / tagihan lama tanpa `doku_request_id`** → kalimat
  yang sekarang, plus tanggal link berhenti berlaku (dari `expires_at` sesudah Bagian 3;
  selama masih NULL, sebut "sampai 7 hari sejak tagihan terbit") dan satu instruksi
  tindakan: beri tahu peneliti jangan membayar link lama.

**6c. Dialog "Batalkan Jadwal" berhenti menjanjikan yang tidak bisa ditepati.**
Buang klausa *"dan tagihan yang masih menggantung untuk jadwal ini ikut dimatikan"*.
Sesudah 6a, saat dialog itu muncul memang sudah tidak ada tagihan hidup — jadi
kalimatnya bukan cuma salah, ia juga tidak relevan lagi.

**6d. Email pembatalan menyebut tagihannya — dengan nada yang mengikuti kenyataan.**
[`notify-schedule-change.js:179–193`](../../GarCode/jakpatforuniv/multi-step-form/functions/api/notify-schedule-change.js#L179)
(cabang `cancelled`) tidak menyebut tagihan sama sekali, sementara cabang `moved`
([:206](../../GarCode/jakpatforuniv/multi-step-form/functions/api/notify-schedule-change.js#L206))
sudah benar: *"tagihan itu tidak berlaku lagi… jangan bayar link yang lama."*
Gerbangnya sama seperti `moved`: **hanya kalau ordernya belum lunas** (`isPaid` sudah
tersedia di sana). §00P menyebutnya *"satu-satunya kalimat yang benar-benar mencegah
kehilangan uang"* — dan insiden ini lewat persis di cabang yang tidak memilikinya.

**Keputusan 2026-09-03 — kalimatnya BERSYARAT, bukan dihapus.** Sesudah Bagian 7,
memperingatkan soal link yang sudah mati justru membingungkan ("link yang mana? saya
tidak bisa bayar apa-apa"). Tapi ia tidak boleh hilang begitu saja:

- **DOKU konfirmasi mati** → *"Tagihan sebelumnya sudah dibatalkan dan link bayarnya
  tidak berlaku lagi."* Nada waspadanya hilang, keterangannya tetap — peneliti yang
  sudah menerima link bayar berhak tahu kenapa halamannya menolak, bukan menemukannya
  sendiri sebagai jalan buntu.
- **gagal / kartu / tagihan lama tanpa `doku_request_id`** → kalimat sekarang:
  *"jangan bayar link yang lama."*

Dasarnya terukur: dari 170 pembayaran yang tercatat kanalnya, QRIS 113 + VA 47 = **~97%**
tercakup Cancel Order API (tidak satu pun BTN/BNC/BPD/OCBC yang dikecualikan DOKU);
`CREDIT_CARD` hanya 5. Tapi **97% itu soal kanal yang akhirnya dipilih, bukan yang kita
tahu saat membatalkan** — pada saat admin membatalkan, peneliti belum memilih kanal dan
halaman Checkout masih berupa menu. Karena itu cabang "gagal" tetap ditulis, dan
kalimatnya **tetap tanpa syarat sampai Bagian 7 terbukti di sandbox**. Bagian 6 tayang
jauh lebih dulu dari Bagian 7; mencabut perlindungan atas dasar kemampuan yang belum ada
berarti membukanya justru di jendela ketika tidak ada perlindungan lain.

> ⚠️ **Konsekuensi arsitektur: hasil panggilan DOKU harus DISIMPAN, bukan jadi toast.**
> Sesudah 6a, membatalkan tagihan dan membatalkan jadwal jadi dua langkah terpisah —
> email dikirim di langkah kedua, panggilan DOKU terjadi di langkah pertama. Karena itu
> `sql/82` bertambah satu kolom (lihat Bagian 7). Dialog 6b dan email 6d membaca **sumber
> yang sama**, jadi layar dan email tidak mungkin bercerita berbeda.

**6e. Kartu jadwal batal berhenti memasang harga.**
Kartu #2 menampilkan **"Estimasi Total Rp 3.108.000"** padahal `total_cost` baris itu
**0**: `deriveScheduleMoney` ([scheduleMoney.ts](../../GarCode/jakpatforuniv/multi-step-form/src/utils/scheduleMoney.ts))
memakai `entry.totalCost > 0` sebagai "sudah ditagih", lalu jatuh ke cabang estimasi dan
menghitung ulang 57 Qs × 7 hari dengan tarif hari ini. Angka itu membantah header
("Rp 999.000 ditagih") **dan** tagihan sungguhannya (Rp 444.000). Estimasi adalah
*penawaran*; jadwal yang dibatalkan tidak sedang ditawarkan. Untuk jadwal batal:
tampilkan yang benar-benar tercatat, atau tidak sama sekali — jangan pernah estimasi.

**6f. Kartu jadwal batal menyebut link yang masih hidup.**
`ScheduleBilling` sudah membawa `staleInvoice`; sesudah Bagian 4 tagihan milik jadwal
batal otomatis masuk ke sana. Banner "Jadwal dibatalkan"
([ScheduleCardList.tsx:364](../../GarCode/jakpatforuniv/multi-step-form/src/components/submissions/tabs/ScheduleCardList.tsx#L364))
menambahkan satu baris selama link-nya belum lewat masa berlaku: *"Link bayar Rp … masih
bisa dibayar sampai <tanggal>."* Hari ini kartu itu diam sepenuhnya soal uang.

## Bagian 7 — Matikan link-nya di DOKU (`checkout/v3/cancellations`)

> **Koreksi.** Sesi ini sempat menyimpulkan endpoint ini tidak ada. Salah — yang saya
> temukan hanya halaman produk *Payment Link*. DOKU Checkout **punya** Cancel Order API,
> dan deskripsinya persis kebutuhan kita: *"invalidate an existing checkout link"*.

    POST https://api.doku.com/checkout/v3/cancellations
    headers: Client-Id, Request-Id, Request-Timestamp, Signature (HMACSHA256)
    body: { order: { invoice_number }, payment: { original_request_id }, note }

Penandatanganannya **identik** dengan yang sudah jalan di `create-payment.js` §4 dan
`checkout.js` — salin polanya, jangan tulis ulang.

**⚠️ PRASYARAT YANG BELUM ADA: `original_request_id`.**
Itu `Request-Id` yang kita kirim saat membuat checkout. Hari ini
[`checkout.js:68`](../../GarCode/jakpatforuniv/multi-step-form/functions/api/doku/checkout.js#L68)
dan [`create-payment.js:528`](../../GarCode/jakpatforuniv/multi-step-form/functions/api/doku/create-payment.js#L528)
menghasilkannya lewat `crypto.randomUUID()`, **hanya mem-`console.log`-nya, lalu
membuangnya** — dan tidak ada kolom untuk menyimpannya. Tanpa ini API-nya tidak bisa
dipanggil sama sekali.

1. **`sql/82`** — `invoices.doku_request_id TEXT` + `transactions.doku_request_id TEXT`,
   nullable (semua baris lama memang tidak punya), **plus
   `invoices.doku_cancelled_at TIMESTAMPTZ`**. Kolom terakhir itu yang membuat 6b dan 6d
   bisa berkata jujur: NULL = tidak pernah berhasil dimatikan → cabang peringatan;
   terisi → cabang tenang. Tanpa kolom ini hasil panggilan DOKU mati bersama toast-nya,
   dan email di langkah berikutnya cuma bisa menebak.
2. Kedua endpoint pembuat menuliskannya bersama `payment_id`.
   Untuk jalur admin, nilainya harus mengalir balik dari
   `/api/doku/checkout` → `createManualInvoice` → `buildInvoiceRows` (`RowContext`,
   sebelah `paymentId`/`invoiceUrl`).

   ⚠️ `RowContext` bukan kerapian — ia **syarat** untuk jalur bersih-bersih.
   `cancelInvoice()` juga dipanggil dari
   [`invoiceWrite.ts:245`](../../GarCode/jakpatforuniv/multi-step-form/src/components/schedule/invoiceWrite.ts#L245),
   tempat baris gagal ditulis sesudah link DOKU terlanjur hidup. Itu justru tempat
   **terbaik** memanggil Cancel Order — link yang seharusnya tidak pernah ada — tapi di
   situ barisnya mungkin belum/tidak terbaca dari DB, jadi `doku_request_id` harus
   tersedia dari konteks, bukan dari query.
3. **`functions/api/doku/cancel-order.js`** — Pages Function baru, otomatis ber-gerbang
   admin lewat `_middleware.js` yang sudah ada.
4. `cancelInvoice()` memanggilnya **sebelum** menulis `status='cancelled'`.

**Kegagalannya tidak boleh menahan pembatalan.** Kalau DOKU menolak, baris kita tetap
dibatalkan dan admin diberi tahu bahwa link-nya mungkin masih hidup — kontrak yang sama
dengan `notifyScheduleChange` ("tidak pernah melempar; kabari lewat toast terpisah").
Membiarkan tagihan tetap hidup di sistem kita gara-gara HTTP gagal jauh lebih buruk.

**Batasnya nyata, dan UI tidak boleh menjanjikan lebih dari ini:**

| Keadaan | Bisa dimatikan? |
|---|---|
| Tagihan baru, kanal VA (kecuali BTN/BNC/BPD/OCBC) atau QRIS | ✅ |
| Kanal kartu | ❌ tidak didukung DOKU |
| Sudah dibayar / sudah kedaluwarsa | ❌ ditolak DOKU (dan memang benar begitu) |
| **183 tagihan `pending` yang sudah ada**, termasuk `…458` | ❌ `request_id`-nya tidak pernah disimpan |

Karena itu kalimat di Bagian 6b **tetap dipertahankan**, hanya dibuat bersyarat: sebut
"link sudah dimatikan di DOKU" kalau panggilannya sukses, dan peringatan lama kalau
tidak. Jangan pernah menampilkan yang pertama tanpa bukti respons DOKU — kalimat yang
menenangkan tanpa dasar persis yang membuat insiden ini terjadi.

---

## Verifikasi

**Bagian 1 (produksi, hari ini):**

    -- pembayaran menempel ke jadwal yang benar
    -- ⚠️ LEFT JOIN, bukan JOIN. Inner join MENYEMBUNYIKAN baris ber-schedule_id NULL —
    --    justru kegagalan yang paling perlu terlihat (FK ON DELETE SET NULL, Bagian 1B).
    select i.payment_id, i.status, i.schedule_id, a.ordinal, a.status, a.payment_status
      from invoices i left join ad_schedules a on a.id = i.schedule_id
     where i.form_submission_id = 'af004b84-c40d-45e6-98a0-2000ee2e0c1e';
    -- harapan: …664 → schedule 4bae5af9 (ordinal 2 sesudah 1B, scheduled/paid);
    --          …458 cancelled; NOL baris dengan schedule_id NULL

    -- pendapatan tetap terhitung SEKALI
    select sum(amount) from transactions
     where form_submission_id = 'af004b84-c40d-45e6-98a0-2000ee2e0c1e'
       and status in ('paid','completed');   -- harapan: 999000 (555000 + 444000)

Lalu tunggu 4 Sep 15.00 WIB dan pastikan `ad_schedules.status` jadi `live` serta
`survey_pages.publish_start_date` menunjuk 04 Sep.

**Bagian 2 — uji relasional, bukan konstanta** (jebakan no. 10):

- `webhook.spec.js`: tagihan `cancelled` → outcome `paid_on_dead_bill`, HTTP 200,
  **nol** PATCH; tagihan `pending` → jalur lama tak berubah; grup campuran → juga ditolak.
- Reproduksi kasus nyata di transaksi yang di-rollback: PATCH `ad_schedules` dengan
  `status='scheduled'` pada baris `cancelled` **harus** tetap ditolak P0001. Penjaga
  webhook mendahuluinya, penjaga DB tetap jaring terakhir.
- Sesudah `sql/80` diterapkan: `insert … values ('paid_on_dead_bill', 200)` lolos,
  `'ngawur'` ditolak — pola verifikasi `sql/77`.

**Bagian 3:** terbitkan tagihan untuk jadwal H+1 dan H+30, periksa `payment_due_date`
yang dikirim ke DOKU dan `invoices.expires_at` yang tersimpan. Pastikan teks WhatsApp
menyebut umur yang sama dengan yang benar-benar dikirim.

**Bagian 4:** sesudah `sql/81`, `select is_stale from schedule_billing('010ee84a-…')`
untuk tagihan jadwal batal → `true`; tagihan lunas mana pun → tetap `false`.

**Bagian 6** — `scheduleCardActions.spec.ts` sudah punya fixture `billing({ openInvoice: … })`,
jadi kasusnya menyambung langsung ke pola yang ada:

- jadwal ber-`openInvoice` → `cancel_schedule` **tidak ada** di `menu` (bukan disabled);
- `openInvoice: null` → aksinya kembali muncul;
- tagihan lunas atau mati tidak menghalangi pembatalan jadwal (hanya yang **hidup**).

Uji jalur di browser, bukan cuma unit: batalkan tagihan → aksi "Batalkan Jadwal" muncul →
batalkan jadwal → kartu menampilkan banner batal **tanpa** estimasi harga, **dengan**
baris link-masih-hidup. Lalu periksa email pembatalan yang benar-benar terkirim memuat
kalimat "jangan bayar link yang lama" untuk order yang belum lunas, dan **tidak**
memuatnya untuk order yang sudah lunas.

**Bagian 7 — buktikan di sandbox lebih dulu** (`api-sandbox.doku.com`), jangan di
produksi: terbitkan tagihan → simpan `doku_request_id` → batalkan → **buka link-nya di
browser** dan pastikan benar-benar tidak bisa dibayar. Membaca HTTP 200 dari DOKU saja
tidak cukup; yang diuji adalah halaman yang dilihat peneliti.

Lalu tiga penolakan yang harus ditangani anggun, bukan crash: tagihan yang sudah dibayar,
yang sudah kedaluwarsa, dan baris lama ber-`doku_request_id` NULL (jangan panggil
API-nya sama sekali — langsung ke cabang "tidak bisa dimatikan").

**Gerbang tsc:** `tsc -p tsconfig.app.json`. `tsc --noEmit` polos menipu — ia melaporkan 0.

## Yang sengaja TIDAK dikerjakan

- **DELETE baris `invoices`/`transactions`.** Sesuai keputusan: link DOKU tetap hidup di
  sisi bank, jadi menghapus barisnya membuat webhook tidak mengenali invoice-nya sama
  sekali → `no_submission_found` → uang masuk tanpa jejak ke order mana pun. Kegagalan
  berisik ditukar jadi kegagalan senyap. **Bagian 1B bukan pengecualian atas ini** — yang
  dihapus di sana baris `ad_schedules`, bukan baris uang; keduanya justru dipertahankan.
- **Tombol hapus jadwal untuk admin.** Bagian 1B satu order, dikerjakan tangan, dengan
  snapshot. Kalau salah input berulang, yang dibangun jalur "batalkan + sembunyikan"
  (`dismissed_at`, `sql/69`).
- **Menambah trigger DB yang memblokir `cancelled → scheduled` untuk ordinal 1.**
  Alasannya di akhir Bagian 2.
- **Membackfill `doku_request_id` untuk 183 tagihan lama.** Nilainya tidak pernah
  ditulis ke mana pun — tidak ada sumber untuk memulihkannya. Link-link itu mati sendiri
  saat `payment_due_date`-nya lewat; sampai itu, penjaga webhook yang menanggungnya.
- **Mengalihkan uang secara otomatis** ke tagihan hidup bernominal sama. "Nominal sama"
  bukan bukti "maksudnya sama".
- **Tombol WhatsApp "jangan bayar link lama"** saat pembatalan. Diputuskan email saja
  (2026-09-03); pola `waMessage.ts` tetap tersedia kalau nanti berubah pikiran.
- **Menyeragamkan `ad_schedules.status='cancelled'` yang kelebihan muatan** (§00T no. 2:
  dari 136 baris, 110 spam / 15 ditolak / 9 order batal / **1** benar-benar batal tanggal).
  Pekerjaan tersendiri, tidak diperlukan untuk menutup kelas bug ini.
