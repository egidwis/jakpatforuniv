# Task 13 — Tagihan fleksibel per jadwal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ⬜ BELUM DIMULAI — TERKUNCI PRASYARAT
> Disetujui pemilik produk 2026-08-09. **Jangan mulai sebelum Task 11 mendarat di `main` dan
> dideploy** — seluruh rencana ini berdiri di atas kolom `schedule_id` yang Task 11 lahirkan.
> Status berjalan selalu di [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md).
>
> Ini rilis yang menyentuh **jalur uang** (invoice, webhook DOKU, kuota slot). Ia sengaja
> tidak digabung dengan apa pun.

Baseline gate: **75** error — `npm run typecheck` (= `tsc -b`) dari `multi-step-form/`.
⚠️ **Bukan** `tsc -p tsconfig.app.json --noEmit` (angka 74 yang beredar di rencana lama
meleset satu), dan **bukan** `npx tsc --noEmit` polos — yang terakhir melaporkan **0** di repo
ini karena `tsconfig.json` cuma daftar referensi proyek, jadi memakainya sebagai gerbang
berarti tidak menguji apa pun.

Branch: **baru**, dari `main` sesudah Task 11 mendarat.

## Context

Tab **Jadwal & Bayar** memperlakukan satu jadwal sebagai satu tagihan yang tidak pernah
berubah. Tiga kebutuhan operasional tidak bisa diungkapkan di atas asumsi itu:

1. **Tagihan susulan.** Ketika scope bertambah sesudah invoice terbit (hadiah naik, pemenang
   nambah), admin tidak punya cara menagih kekurangannya sebagai tagihan tambahan yang jujur.
2. **Batal reservasi per jadwal.** Slot yang sudah dipesan tidak bisa dilepas kecuali untuk
   jadwal #1 — jadi admin tidak bisa melepas slot lama untuk kemudian menagih ulang.
3. **Extra Ad untuk jadwal baru.** Panel "Jadwal Iklan Baru" tidak pernah punya pilihan Extra
   Ad, padahal keputusan reguler-vs-extra itu per tanggal: jadwal #1 bisa muat di kuota
   reguler sementara jadwal #2 jatuh di hari penuh.

Hasil yang dituju: satu jadwal boleh punya **beberapa invoice**, punya **sisa tagihan** yang
terlihat, boleh **dibatalkan** tanpa kehilangan riwayat uangnya, dan boleh berdiri di kuota
**Extra Ad** sendiri — terlepas dari jadwal lain di order yang sama.

### Lima keputusan (pemilik produk, 2026-08-09)

| | |
|---|---|
| Sifat tagihan susulan | **Tambahan, bukan koreksi.** Invoice pertama tetap benar; tidak ada yang dibatalkan atau dinyatakan ulang |
| Gate tayang | **Tidak pernah menghentikan iklan yang sudah tayang.** Tagihan susulan jadi piutang yang terlihat. Alasan: responden sudah masuk dan hadiahnya sudah dijanjikan |
| Sumber kebenaran uang | **Invoice.** `ad_schedules.total_cost` kembali berarti "harga saat dipesan", bukan "yang ditagih" |
| Dashboard peneliti | Rincian multi-invoice **hanya di admin**; peneliti melihat **tagihan terakhir** yang diterbitkan admin |

| Pemilik voucher | **Tagihan, bukan order.** Voucher diterapkan saat menagih, dan dua jadwal di order yang sama boleh punya voucher berbeda (pemilik produk, 2026-08-09) |

Dua keputusan turunan:

- **Batal jadwal yang sudah lunas: boleh.** Uangnya dicatat & terlihat di kartu; refund atau
  kredit diurus finance di luar sistem. Konsisten dengan kenyataan bahwa sebagian order
  memang dibayar di luar sistem dan `payment_status`-nya tidak pernah menyusul.
- **Extra Ad jadi sifat jadwal**, bukan sifat order.

### Prasyarat keras — kenapa ini tidak bisa dimulai lebih awal

**Task 11 langkah 1b** menambahkan `schedule_id` ke `invoices` + `transactions`. Tanpa kolom
itu, penautan tagihan ke jadwal masih bertumpu pada pasangan `entity_type`/`extend_id`:
[`InvoiceForm.tsx`](../../../multi-step-form/src/components/schedule/InvoiceForm.tsx) menulis
`entity_type: 'extend'` + `extend_id` untuk jadwal ke-2 dst. dan **tanpa `entity_type`** untuk
jadwal pertama. Itu bekerja, tapi ia dua jalur tulis untuk satu konsep — dan tagihan susulan
menambah dimensi ketiga yang tidak punya tempat di sana. `schedule_id` yang melipatnya jadi satu.

**Task 11 langkah 4** (`updatePaymentStatus` dipersempit ke `schedule_id`) juga prasyarat.
Tanpa itu "Tandai Lunas" tetap melunasi seluruh order sekaligus dan akan menghapus piutang
susulan yang baru saja dibuat.

---

## Temuan yang membentuk rencana ini

**A. "N invoice per jadwal" sudah bisa terjadi hari ini — yang belum ada adalah artinya.**
`invoices` dan `transactions` hanya menyimpan `form_submission_id`; tidak ada constraint yang
melarang invoice kedua. Di produksi **76 jadwal punya lebih dari satu transaksi** (satu bahkan
29). Tapi seluruh kode membacanya sebagai satu hal saja: *percobaan bayar ulang atas tagihan
yang sama*. Tagihan yang **menambah** akan disalahbaca sebagai retry.

**B. `hasEverPaid` adalah bug yang menunggu kasus ini.**
[`supabase.ts:2212`](../../../multi-step-form/src/utils/supabase.ts#L2212) memakai
`.some(paid)` — **satu** invoice lunas sudah cukup membuat kartu mengumumkan "Lunas".
Begitu tagihan susulan ada, kartu akan menyembunyikan tagihan terbuka. Ini kebohongan uang,
bukan sekadar tampilan yang kurang rapi.

**C. Menaikkan `total_cost` bukan jalan keluar — ada yang mengembalikannya.**
[`create-payment.js:183-203`](../../../multi-step-form/functions/api/doku/create-payment.js#L183)
menghitung ulang harga dari input pricing, membandingkannya dengan `total_cost`, dan kalau
berbeda ia **menimpa kolomnya**. Satu percobaan bayar self-service akan menurunkan angka itu
balik, diam-diam, di jalur uang.

**D. Status `cancelled` SUDAH ADA di database — tinggal tidak punya penulis dan tidak punya chip.**
[`sql/38:107-109`](../../../multi-step-form/sql/38_forbid_overlapping_schedules.sql#L107) sudah
membebaskan `submission_status = 'cancelled'` dari penjaga tumpang-tindih, dan
`SLOT_OCCUPYING_EXTEND_STATUSES` ([`supabase.ts:1232`](../../../multi-step-form/src/utils/supabase.ts#L1232))
sudah tidak menghitungnya sebagai penghuni slot. Artinya **"batalkan lalu pesan ulang tanggal
yang sama" — kasus yang memicu fitur ini — tidak akan ditolak.** Yang hilang cuma tombolnya;
`LifecycleStage` ([`status-tokens.ts:16`](../../../multi-step-form/src/lib/status-tokens.ts#L16))
belum punya nilai `cancelled`.

**E. Extra Ad hari ini adalah sifat ORDER, dan Task 11 justru mengunci sifat itu.**
`is_extra_ad` hidup di `survey_pages` — satu baris per order — dan
[`supabase.ts:1368`](../../../multi-step-form/src/utils/supabase.ts#L1368) melakukan lookup
per `submissionId`, sehingga setiap jadwal mewarisi flag induknya. Task 11 langkah 1c
menambahkan `UNIQUE (submission_id)` ke tabel itu. Padahal keputusan reguler-vs-extra itu
per tanggal.

**F. Tidak ada satu pun permukaan yang bisa memilih Extra Ad per jadwal — dan pilihan itu
memang tidak punya tempat disimpan.**
[`ScheduleForm.tsx`](../../../multi-step-form/src/components/schedule/ScheduleForm.tsx) kini
memuat `regularCounts` **dan** `extraCounts` dan membaca kolam yang benar, tapi jenisnya
**diwariskan dari order, tidak bisa dipilih**.

⚠️ Sebuah toggle sempat ditulis di sana pada 2026-08-09 lalu **dicabut hari itu juga**:
`is_extra_ad` tidak punya kolom di baris jadwal mana pun — ia hanya ada di `survey_pages`
(dan `scheduled_ads`), satu baris per ORDER. Jadi togglenya memindahkan kolam yang dilihat
kalender tanpa menyimpan apa pun: admin memesan ke kuota tambahan, jadwalnya tetap dihitung
reguler, dan kolam reguler kelebihan jual. **Togglenya baru boleh lahir sesudah Langkah 1a
di bawah memberi flag itu rumah di `ad_schedules`** — bukan sebelumnya.

**G. Pembatalan melepas slot tapi meninggalkan link bayar hidup.**
`handleCancelSchedule` di [`SchedulePaymentTab.tsx`](../../../multi-step-form/src/components/submissions/tabs/SchedulePaymentTab.tsx)
hanya menyetel `submission_status = 'cancelled'` + `payment_status = 'failed'`. Ia **tidak**
meng-expire transaksi pending dan **tidak** melepas `slot_booked_by` — berbeda dari
`releaseExpiredSlot` dan `prepareForReschedule` yang keduanya melakukannya. Ia juga hanya
berlaku untuk jadwal perpanjangan, dan hanya selama belum ada tagihan.

⚠️ Perilaku itu **sengaja dipertahankan apa adanya** saat aksinya pindah ke drawer
(2026-08-09), supaya pemindahan permukaan tidak menyelundupkan perubahan uang. Task ini yang
memperbaikinya.

---

## Langkah 1 — `sql/50`: dua kolom, satu fungsi agregat

⚠️ `sql/47` **sudah diklaim** `reward_pools` (8B-2), `sql/48`+`49` diklaim Task 11. Mulai dari **50**.

### 1a. `ad_schedules.is_extra_ad BOOLEAN NOT NULL DEFAULT false`

Backfill dari sumber yang dipakai `fetchSlotAvailability` hari ini (temuan E):

```
is_extra_ad = survey_pages.is_extra_ad OR form_submissions.admin_notes LIKE '%[EXTRA_AD]%'
```

`survey_pages.is_extra_ad` **tidak di-drop.** Ia jadi turunan — true kalau ada satu saja
jadwal extra di order itu — disinkronkan lewat trigger `AFTER INSERT/UPDATE/DELETE` di
`ad_schedules`. Itulah yang menjaga tiga pembaca lama tetap benar tanpa disentuh:
[`adOrdering.ts:41`](../../../multi-step-form/src/utils/adOrdering.ts#L41),
[`SubmissionsTableRow.tsx:77`](../../../multi-step-form/src/components/SubmissionsTableRow.tsx#L77),
[`InternalDashboard.tsx:229`](../../../multi-step-form/src/components/InternalDashboard.tsx#L229).

⚠️ Penanda legacy `[EXTRA_AD]` di `admin_notes` **berhenti ditulis** sesudah rilis ini, tapi
tetap dibaca saat backfill. **Jangan dibersihkan di rilis ini** — ia satu-satunya sumber untuk
order lama yang tidak punya `survey_pages`.

### 1b. Status `cancelled` untuk jadwal

Sebagian besar sudah berdiri (temuan D). Yang perlu ditambahkan hanya:

- `CHECK` yang mengizinkan `'cancelled'` di `ad_schedules.status`, bila constraint-nya membatasi.
- Memastikan `assert_no_schedule_overlap` yang sudah dipindahkan ke `ad_schedules`
  (Task 11 langkah 2.3) **membawa serta pembebasan `cancelled`**. Kalau pembebasan itu
  tertinggal saat trigger dipindah, "batal lalu pesan ulang tanggal yang sama" akan ditolak —
  dan itu justru kasus utama fitur ini.

### 1c. `schedule_billing(p_schedule_id UUID)` — agregat uang per jadwal

```sql
RETURNS TABLE (billed BIGINT, paid BIGINT, outstanding BIGINT, invoice_count INT)
-- billed      = Σ amount invoice jadwal ini yang TIDAK expired/cancelled/failed
-- paid        = Σ amount invoice berstatus paid/completed
-- outstanding = billed - paid
```

Plus `schedule_billing_bulk(p_submission_id UUID)` untuk kartu di drawer — satu round-trip,
bukan N.

**1d. `voucher_code TEXT` di `invoices` + `transactions`**

Voucher milik tagihan (lihat tabel keputusan). Hari ini ia hanya ada di
`form_submissions.voucher_code`, satu per ORDER.

⚠️ Sejak 2026-08-09 `InvoiceForm` sudah punya kolom isian voucher yang menghitung ulang item
dan menitipkan kodenya di **`transactions.note` (JSON)** — sengaja, karena migrasi belum boleh
lahir di branch itu. Backfill kolom baru ini dari `note->>'voucher_code'` lebih dulu, lalu
**hentikan penulisan ke note** supaya tidak ada dua tempat menyimpan hal yang sama.

⚠️ **`create-payment.js` masih membaca `form_submissions.voucher_code`** untuk menghitung ulang
harga link self-service. Selama itu belum ikut dipindahkan, voucher per-tagihan hanya benar
untuk tagihan manual — dan itulah dua sumber kebenaran yang task ini ada untuk menutupnya.
Ubah keduanya dalam satu rilis.

⚠️ Sumbernya `invoices`, **bukan** `transactions`. Keduanya berbagi `payment_id` untuk
pembayaran self-service, dan menjumlahkan keduanya menghitung ganda. Aturan dedup yang sudah
terbukti ada di [`InvoiceForm.tsx`](../../../multi-step-form/src/components/schedule/InvoiceForm.tsx)
(`statusRank`, memenangkan status yang paling terminal) — **pindahkan aturannya ke SQL, jangan
disalin lagi.**

### Verifikasi langkah 1

- [ ] `is_extra_ad` terisi untuk setiap jadwal milik order yang hari ini ber-`is_extra_ad`
      atau ber-`[EXTRA_AD]`; hitung dan catat angkanya sebelum & sesudah, jangan diasumsikan
- [ ] `schedule_billing()` untuk 5 jadwal yang diketahui lunas → `outstanding = 0`
- [ ] `schedule_billing()` untuk jadwal ber->1 transaksi yang berbagi `payment_id` → **tidak**
      menghitung ganda. Ambil yang paling ekstrem: jadwal dengan 29 transaksi
- [ ] Trigger sinkronisasi: set satu jadwal jadi extra → `survey_pages.is_extra_ad` ikut true;
      batalkan → ikut false **hanya** bila tidak ada jadwal extra lain di order itu
- [ ] Gate tetap **75** (`npm run typecheck`); nol perubahan frontend di langkah ini

---

## Langkah 2 — uang jadwal jadi agregat invoice

### `supabase.ts` — `fetchSchedulePayments` dibongkar

[`supabase.ts:2151-2216`](../../../multi-step-form/src/utils/supabase.ts#L2151). `SchedulePayment`
berhenti melipat N transaksi jadi satu objek:

```ts
interface ScheduleInvoice {            // satu baris invoice
  paymentId: string; amount: number; status: string;
  paymentUrl: string | null; createdAt: string;
  isTopUp: boolean;                    // bukan invoice pertama jadwal ini
}
interface ScheduleBilling {            // ringkasan jadwal
  invoices: ScheduleInvoice[];         // terbaru dulu
  billed: number; paid: number; outstanding: number;
  isSettled: boolean;                  // outstanding <= 0 && billed > 0
  openInvoice: ScheduleInvoice | null; // satu-satunya yang belum lunas
}
```

- **`hasEverPaid` dihapus, bukan ditambal.** Ia sumber bug temuan B; `isSettled`
  menggantikannya, dan bug itu kehilangan tempat berdiri.
- **`attempts` dihapus.** Jumlah percobaan bayar diturunkan per-invoice dari `transactions`
  yang berbagi `payment_id` — bukan dari jumlah invoice, yang sesudah rilis ini punya arti
  berbeda.
- Kunci penautan pindah dari pencocokan `entity_type`/`extend_id` ke **`schedule_id`**.

### `scheduleMoney.ts` — pisahkan HARGA dari TAGIHAN

[`scheduleMoney.ts`](../../../multi-step-form/src/components/submissions/tabs/scheduleMoney.ts)
tetap jadi tempat rincian **harga jadwal** (`total_cost`, subtotal, PPN, estimasi). Yang
ditambahkan: ia menerima `ScheduleBilling` dan mengembalikan blok kedua — `billed` / `paid` /
`outstanding` — sehingga kartu menampilkan keduanya tanpa mencampurnya.

⚠️ Aturan yang sudah tertulis di kepala berkas itu **tetap berlaku**: kalau sudah pernah
ditagih, tampilkan yang ditagih; jangan hitung ulang dengan tarif hari ini.

⚠️ **JANGAN menaikkan `ad_schedules.total_cost` saat tagihan susulan terbit** (temuan C).

### `ScheduleCardList.tsx` — kartu jadi jujur

[`ScheduleCardList.tsx`](../../../multi-step-form/src/components/submissions/tabs/ScheduleCardList.tsx):

- `cardStateOf` (baris 34) memakai `billing.isSettled`, bukan `payment?.hasEverPaid`.
  Tambah state baru **`partially_paid`** — ada yang lunas, ada yang menggantung.
- Banner `paid` (baris 88) berhenti menampilkan `"{attempts} percobaan bayar"` untuk invoice
  susulan. Daftar invoice dirender sebagai baris-baris, bukan satu angka.
- Ringkasan atas (baris 370) menampilkan **`Rp X ditagih · Rp Y belum masuk`**.
- Aksi baru **"Tagih Susulan"** di dalam kartu, aktif hanya bila `billing.openInvoice === null`.

### Aturan: satu tagihan terbuka per jadwal

Karena peneliti hanya melihat **tagihan terakhir**, tagihan susulan tidak boleh terbit selama
masih ada invoice yang menggantung — kalau tidak, tagihan lama hilang dari layar orang yang
harus membayarnya. Ditegakkan dua lapis: tombolnya disabled di UI, dan `schedule_billing`
dipakai sebagai penjaga sebelum insert.

### Verifikasi langkah 2

- [ ] Jadwal lunas + terbitkan susulan → kartu **berhenti** bilang "Lunas", menampilkan sisa
- [ ] Iklan yang **sedang tayang** + terbitkan susulan → tetap tayang; nol perubahan
      `submission_status` maupun `survey_pages`
- [ ] Tombol "Tagih Susulan" **disabled** selama ada invoice menggantung
- [ ] Bayar susulan lewat DOKU sandbox → `outstanding` jadi 0, kartu jadi "Lunas"
- [ ] "Tandai Lunas" pada order berjadwal banyak melunasi **hanya jadwal itu**

---

## Langkah 3 — batalkan reservasi jadwal

### `supabase.ts` — `cancelSchedule(scheduleId)` baru

Menggantikan `handleCancelSchedule` di
[`SchedulePaymentTab.tsx`](../../../multi-step-form/src/components/submissions/tabs/SchedulePaymentTab.tsx)
(temuan G). Bentuknya meniru `prepareForReschedule`
([`supabase.ts:1823`](../../../multi-step-form/src/utils/supabase.ts#L1823)):

1. `ad_schedules` → `status = 'cancelled'`, `slot_booked_by = NULL`, `slot_reserved_at = NULL`.
   **Tanggalnya DIPERTAHANKAN** — baris ini jadi catatan sejarah, dan `cancelled` sudah
   dikecualikan dari penjaga tumpang-tindih maupun hitungan kuota.
2. Semua transaksi & invoice **pending** milik `schedule_id` ini → `expired`.
   ⚠️ Inilah yang `handleCancelSchedule` **tidak** lakukan sekarang.
3. Invoice yang **sudah lunas** tidak disentuh. Kartu menampilkan
   **"Dibatalkan — Rp X sudah dibayar"** supaya uangnya tidak lenyap dari layar.
4. Kalau jadwal yang dibatalkan adalah **satu-satunya** jadwal order, jatuhkan
   `form_submissions.submission_status` ke `approved` (perilaku lama dipertahankan).

⚠️ **Jangan menulis `is_extra_ad: false` ke `survey_pages` saat membatalkan.** Jalur batal
lama di `SchedulePaymentView` melakukannya; berkas itu sudah dihapus, tapi polanya mudah
dihidupkan lagi tanpa sadar. Sesudah langkah 4 flag itu milik jadwal, dan mematikannya di level
halaman akan mencabut status extra jadwal lain.

### UI

Aksi **"Batalkan Reservasi"** di dalam kartu jadwal, dengan dialog konfirmasi yang menyebut
nominal yang sudah dibayar bila ada.

### Chip `cancelled`

- [`status-tokens.ts:16`](../../../multi-step-form/src/lib/status-tokens.ts#L16) — tambah
  `"cancelled"` ke `LifecycleStage` + entri `STATUS_TOKENS` (varian `slate`, tanpa dot).
- [`scheduleModel.ts:71`](../../../multi-step-form/src/pages/dashboard/schedule/scheduleModel.ts#L71) —
  `chipKindOf` mengembalikan `'cancelled'` saat `e.status === 'cancelled'`, **sebelum** cabang
  `live`/`scheduled`.
- `CANCELLED_CHIPS` (baris 286) → `['rejected', 'spam', 'cancelled']`.
- `occupiesSlot` (baris 160) mengecualikan `'cancelled'` — samakan dengan `holdsSlot` di
  `supabase.ts`, sesuai peringatan yang sudah tertulis di kepala fungsi itu: kalau papan
  kapasitas dan wizard penjadwalan memakai aturan berbeda, admin melihat "2/4" sementara
  peneliti ditolak karena harinya penuh.
- `agendaChipOf` (baris 126) sudah aman: ia mengembalikan lebih dulu untuk `CANCELLED_CHIPS`.

### Verifikasi langkah 3

- [ ] Batalkan jadwal #2 → slot lepas; `fetchSlotAvailability` untuk tanggal itu **berkurang 1**
- [ ] Pesan ulang **tanggal yang sama persis** sesudah dibatalkan → **diterima**, tidak ditolak
      `assert_no_schedule_overlap`
- [ ] Invoice pending jadwal itu jadi `expired`; link DOKU-nya tidak lagi bisa dipakai
- [ ] Batalkan jadwal yang **sudah lunas** → kartu menampilkan nominal terbayar; invoice lunas
      **tidak** berubah status
- [ ] Papan Schedule: jadwal `cancelled` tampil ber-chip abu dan **tidak** menempati kuota harian

---

## Langkah 4 — Extra Ad jadi sifat jadwal

### `supabase.ts` — `fetchSlotAvailability` baca flag per jadwal

[`supabase.ts:1341-1353`](../../../multi-step-form/src/utils/supabase.ts#L1341). Peta
`extraAdMap` yang di-lookup per **submission** diganti pembacaan `is_extra_ad` per baris
`ad_schedules`.

⚠️ Komentar di kepala fungsi (baris 1274-1278) menyatakan bahwa extend mewarisi
`is_extra_ad` dari induknya. Sesudah langkah ini pernyataan itu **tidak lagi benar** —
perbarui, jangan tinggalkan.

`AdScheduleEntry.isExtraAd` ([`supabase.ts:1946`](../../../multi-step-form/src/utils/supabase.ts#L1946))
berhenti diturunkan dari `survey_pages` (baris 2141) dan dibaca dari kolom barunya.
Komentarnya yang berbunyi "ikut dari `survey_pages.is_extra_ad`, jadi ia gratis" harus diganti.

### `ScheduleForm.tsx` — toggle jenis iklan lahir di sini

Prop `isExtraAd` hari ini **hanya dibaca** — lihat komentar panjang di atasnya, yang
menjelaskan kenapa togglenya sengaja tidak ada. Sesudah langkah 1a memberi `ad_schedules`
kolom `is_extra_ad`, ganti prop itu jadi keadaan yang bisa diubah:

- mode `create` → simpan pilihannya ke baris jadwal yang dibuat
- mode `edit` → simpan pilihannya ke baris jadwal yang disunting

⚠️ **Buang komentar penundaan itu bersamaan.** Kalau tertinggal ia akan terbaca sebagai
larangan yang masih berlaku, dan orang berikutnya akan mencabut togglenya lagi.

### Verifikasi langkah 4

- [ ] Order dengan jadwal #1 reguler + #2 extra → kalender menghitung masing-masing ke pool
      yang benar, bukan dua-duanya ke satu pool
- [ ] Hari yang penuh untuk reguler masih bisa menerima jadwal Extra Ad
- [ ] `SubmissionsTableRow.tsx:77` dan `adOrdering.ts` tetap menampilkan hasil yang sama untuk
      order yang **seluruh** jadwalnya extra — pembaca lama tidak boleh pecah

---

## Langkah 5 — dashboard peneliti: tagihan terakhir saja

[`SchedulePhase.tsx`](../../../multi-step-form/src/components/status/SchedulePhase.tsx)
**tidak** menampilkan daftar invoice — keputusan pemilik produk. Perubahannya hanya dua:

1. Tombol bayar menunjuk `billing.openInvoice` (tagihan terbuka yang terakhir diterbitkan),
   bukan transaksi terbaru apa pun statusnya.
2. Status "Lunas" diturunkan dari `billing.isSettled`, bukan `hasEverPaid`. Tanpa ini dashboard
   peneliti mengumumkan "Lunas" sementara ada tagihan susulan terbuka — kebohongan yang sama
   yang diperbaiki di sisi admin.

3. **Harga berhenti dihitung ulang di layar peneliti.** Sejak voucher jadi milik tagihan,
   estimasi yang dihitung dari `voucher_code` order bisa berbeda dari yang benar-benar
   ditagih. Tampilkan `billing` — angka invoice — dan sisakan estimasi hanya untuk jadwal yang
   memang belum pernah ditagih sama sekali. Aturan yang sama sudah berlaku di
   [`scheduleMoney.ts`](../../../multi-step-form/src/components/submissions/tabs/scheduleMoney.ts)
   sisi admin; ini menyamakannya.

Jadwal berstatus `cancelled` ditampilkan sebagai kartu ber-chip "Dibatalkan", **tidak
disembunyikan** — peneliti berhak melihat bahwa slotnya sudah dilepas.

---

## Di luar cakupan

- **Kredit / saldo order.** Uang dari jadwal lunas yang dibatalkan tidak otomatis mengurangi
  tagihan jadwal berikutnya. Dicatat dan terlihat; refund diurus finance di luar sistem.
  Menambahkan konsep "kredit" berarti ia harus benar di setiap layar uang — rilis tersendiri.
- **Koreksi tagihan** (membatalkan atau menyatakan ulang invoice yang salah). Rilis ini hanya
  melayani tagihan yang **menambah**.
- **Daftar invoice di dashboard peneliti.** Sengaja ditahan.
- **Membersihkan penanda `[EXTRA_AD]` dari `admin_notes`.** Berhenti ditulis, tetap dibaca.
- **`DROP COLUMN survey_pages.is_extra_ad`.** Tetap ada sebagai turunan.

## Prasyarat sebelum mulai

- [ ] Branch `feat/dashboard-soft-dna-navbar` di-merge ke `main` dan **dideploy**
- [ ] **Task 11 selesai dan dideploy** — khususnya langkah 1b (`schedule_id`) dan langkah 4
      (`updatePaymentStatus` per jadwal)
- [ ] Branch baru dari `main`

## Setelah selesai

Perbarui [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md): model uang final
(invoice sebagai sumber kebenaran, `total_cost` = harga saat dipesan), status `cancelled` per
jadwal, dan Extra Ad sebagai sifat jadwal. Dua entri untuk §"Jebakan" sudah dicatat di sana
sejak 2026-08-09 — pastikan keduanya masih akurat sesudah eksekusi.
