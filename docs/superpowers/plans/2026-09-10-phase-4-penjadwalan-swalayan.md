# Phase 4 — "Jadwalkan Iklan Lagi" jadi swalayan di dashboard peneliti

> **BELUM DIEKSEKUSI.** Ditulis 2026-09-10 sebagai serah-terima: seluruh
> pengukuran di bawah dilakukan langsung ke produksi pada tanggal itu, supaya
> sesi berikutnya tidak perlu menurunkannya ulang.
>
> Status berjalan Jadwal Iklan tetap di
> [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md) — dokumen ini
> rencana, bukan status.
>
> ⚠️ **Prasyaratnya sudah lunas 2026-09-10** ([§00Z](../../jadwal-iklan-progress.md)):
> Phase 4 melipatgandakan jumlah link bayar yang beredar, jadi jebakan link harus
> tertutup lebih dulu. Sekarang sudah.

## Context

Tombol **"Jadwalkan Iklan Lagi"** sudah terpasang di dashboard peneliti sejak
revamp Soft DNA dan **sengaja dimatikan** —
[`SchedulePhase.tsx:1088`](../../../multi-step-form/src/components/status/SchedulePhase.tsx#L1088)
hanya memanggil `toast.info(t('scheduleAgainComingSoon'))` di balik badge "Segera
Hadir". Sampai hari ini perpanjangan iklan **hanya bisa dibuat admin**, lewat
percakapan WhatsApp lalu `ScheduleForm` mode `create` di dashboard admin.

**Permintaannya naik, dan ini pengukuran terbaru:** **18 perpanjangan seumur
hidup, 11 di antaranya sejak 1 Agustus 2026** (diukur 2026-09-10 — naik dari
14/7 saat rencana ini pertama dirancang 2026-09-08). Argumen "permintaannya masih
kecil" yang dipakai saat menundanya 18 Agustus sudah tidak berdiri.

**Hasil yang dituju:** peneliti memesan jadwal iklan berikutnya sendiri — pilih
tanggal, harga muncul seketika, slot terkunci, bayar dalam 1 jam — **dengan
perilaku reservasi yang identik dengan jadwal pertama**, karena kuotanya memang
kolam yang sama.

---

## 🔴 Kesiapan, diukur 2026-09-10 — BACA INI DULU

Empat dari lima penghalang masih berdiri, dan **tiga di antaranya mengubah kode
jalur uang yang sedang berjalan** — bukan menambah kode baru.

| Prasyarat | Keadaan (diverifikasi ke produksi 2026-09-10) |
|---|---|
| Jebakan link bayar tertutup | ✅ selesai — Rencana A-2 + `sql/87`, lihat §00Z |
| `reward_pools` (`sql/50`) | 🔴 **tabelnya tidak ada di produksi**, dan berkas `sql/50` belum pernah ditulis |
| `sql/86` — pelebaran `create_ad_schedule` | 🔴 belum ditulis. Tanda tangan RPC hari ini **tidak punya `p_slot_reserved_at`** sama sekali (15 parameter, diverifikasi lewat `pg_get_function_identity_arguments`) |
| Pelepasan hold jadwal ke-2 | 🔴 nol implementasi. `slot_reserved_at` terisi di **0 dari 18** jadwal ordinal ≥2 |
| `create-payment.js` | 🔴 tiga penjaga order-scoped ([baris 353–366](../../../multi-step-form/functions/api/doku/create-payment.js#L353-L366)) menolak **100%** sasaran Phase 4 |

### ⚠️ Dua hal yang berubah SESUDAH rencana ini dirancang

**1. Cancel Order tidak bisa diandalkan seperti dulu diasumsikan.**
Langkah 4 di bawah membatalkan tagihan tersalip lewat `cancelDokuOrder`. Sampai
2026-09-10 panggilan itu **selalu gagal** — fiturnya tidak pernah aktif di akun
DOKU (`Merchant not support cancel order`). Fiturnya **sudah diaktifkan
2026-09-10**, tapi:

* belum ada satu pun pembatalan yang terbukti berhasil (`doku_cancelled_at`
  masih nol baris seumur hidup);
* DOKU membatasinya ke **Virtual Account & QRIS saja** — kartu kredit tidak
  pernah tercakup (6 dari 201 transaksi DOKU berkanal-diketahui, ~3%);
* `payment_channel` baru terisi **sesudah** dibayar, jadi saat sebuah tagihan
  dibatalkan kanalnya biasanya belum diketahui.

Phase 4 membuat peneliti bisa menerbitkan tagihan sendiri, jadi tagihan
**tersalip** akan jauh lebih sering lahir daripada hari ini. Ini bukan penghalang
mutlak — resolver `/bayar/` tetap menjaganya dan `paid_on_stale_bill` menangkap
uangnya — tapi ia menaikkan taruhan, dan sebaiknya diputuskan sadar, bukan
ditemukan saat uji.

**2. Jendela ke 1 Oktober tidak realistis.** Keputusan no. 5 (lihat tabel
keputusan) adalah mengirim Phase 4 **sebelum** tangga tarif 1 Oktober. Per
2026-09-10 tersisa **tiga minggu**, untuk **dua rilis jalur uang berturut-turut**
(`sql/50` sendiri, lalu Phase 4) yang menurut aturan repo dirilis terpisah.
Rencana ini sendiri sudah menandai jendela itu "patut ditinjau ulang dengan angka
baru"; angka barunya sekarang ada.

> **Rekomendasi:** lepaskan keputusan no. 5, lalu kirim `sql/50` sendiri dulu dan
> Phase 4 dengan tempo normal. Memaksakan tanggal berarti menaruh tiga perubahan
> pada kode uang yang sedang berjalan di bawah tekanan.
>
> Ini **keputusan pemilik produk**, dan ia harus diambil sebelum satu baris pun
> ditulis — karena ia menentukan urutan, bukan cuma jadwal.

---

## Keputusan yang sudah diambil (diskusi 2026-09-04…08)

| # | Keputusan | Alasan penentu |
|---|---|---|
| 1 | **Self-serve penuh**, bukan "ajukan lalu admin menagih" | Perilaku reservasi disamakan dengan jadwal pertama (arahan pemilik produk). Itu menutup pintu bentuk "ajukan" |
| 2 | **Pemegang slot = `'user'`, hold 1 jam** — sama persis ordinal 1 | Hold 1 jam itu jendela **membayar**, bukan jendela **menunggu**. Tidak pernah ada admin di dalamnya |
| 3 | Batch undian BARU → **tanyakan hadiah di layar** | Persis yang sudah dilakukan `ScheduleForm` admin (`fetchBatchContext` → wajib isi hadiah). Pemindahan layar, bukan mekanisme baru |
| 4 | **`reward_pools` (`sql/50`) TETAP gerbang** — ditulis sebelum Phase 4 | Backfill ternyata cuma 2 baris (Rp 120.000), jauh lebih murah dari yang dikira |
| 5 | Kirim **sebelum** tangga tarif bertanggal | ⚠️ **PATUT DICABUT** — lihat "Kesiapan" di atas |

---

## Angka yang membatalkan catatan lama

Diukur di produksi 2026-09-04…10. **Tiga catatan di dokumen lain masih salah dan
harus diralat saat rencana ini dieksekusi.**

**1. "83 order sudah mendanai hadiah tanpa punya tanggal" — meleset ~30×.**
Kriterianya hari ini cocok dengan 91 order, tapi hanya **3** yang uangnya
benar-benar bergerak; 88 sisanya keranjang telantar (`pending`/`expired`) yang
cuma *mengisi* angka hadiah. Audit ketiganya:

| Order | Judul | Hadiah | Vonis |
|---|---|---|---|
| `0026f81d` | **"test"** (17 Apr, jadwal `cancelled`) | Rp 175.000 | order uji — **dilewati** |
| `e9cb5944` | JFSUHUD Pariwisata Sunda (3 Agu) | Rp 50.000 | ikut backfill |
| `8c9c00a6` | Survei Persepsi Konsumen… Smart Marit… (4 Agu) | Rp 70.000 | ikut backfill |

Sapuan "dibayar di luar sistem" (jadwal pernah `live`/`completed` tapi
`payment_status` bohong) **tidak menambah satu baris pun**.
→ **Backfill `reward_pools` = 2 baris, Rp 120.000.**

**2. Hold 1 jam bukan jendela menunggu.** Diukur dari `slot_reserved_at` →
tagihan pertama terbit, jadwal ke-1: **median 6 detik**, p90 0,3 menit untuk
`slot_booked_by='user'` — karena `create-payment` mengunci slot dan menerbitkan
tagihan dalam satu klik. Hasilnya **65 dari 73 reservasi `user` lunas (89%)**,
hanya 8 lewat tenggat.

**3. Jalur perpanjangan belum pernah menyentuh jam reservasi.**
`slot_reserved_at` terisi di **0 dari 18** jadwal ordinal ≥ 2. Tidak ada perilaku
lama yang perlu dijaga — tapi juga belum pernah ada kode yang menanggungnya.

**Yang tetap berdiri:** `additional_prize_per_winner` masih **0 di seluruh
baris**, dan **6 dari 14 perpanjangan (43%) berakhir di batch BARU** — jadi panel
hadiah di Langkah 5 bukan kasus tepi. **Nol perpanjangan Kilat**, jadi
menyembunyikan CTA untuk Kilat gratis.

---

## Yang sudah ada dan dipakai ulang

Separuh hilirnya sudah jadi — jangan menulis ulang:

- [`airingPeriods.ts`](../../../multi-step-form/src/components/status/airingPeriods.ts)
  menjatuhkan jadwal tanpa invoice ke `awaiting_invoice` (chip + copy dua bahasa + SLA)
- Tombol "Bayar Sekarang" per kartu sudah berfungsi lewat `fetchSchedulePayments`
- `fetchSlotAvailability` **sudah menghitung extend** — kolam kuota reguler yang
  sama; kolam terpisah hanya untuk iklan tambahan
- `get_schedule_batch_context` (RPC) menjawab batch tujuan + pool berjalan
- `deriveScheduleMoney` — satu-satunya penurun uang per jadwal, dipakai admin & peneliti
- `create_ad_schedule` (`sql/74`) menahan lima aturan penyisipan di DB
- `SlotCalendar`, `useSlotAvailability`, `slotHold.ts`, `invoiceWrite.ts`
- **BARU sejak 2026-09-10:** `payLinkForBill()` / `payLinkUrl()` — Phase 4 wajib
  memakainya, dan tes penjaga `payLinkNoRawFallback.spec.ts` akan **memerah**
  kalau kode baru menyandingkan `payLink*` dengan URL DOKU mentah

---

## Pekerjaan, berurutan

### Langkah 1 — `sql/50_reward_pools.sql` (gerbang; rilis sendiri)

Nomor `50` sudah dipesan sejak lama; jangan menggesernya.

- Tabel `reward_pools`: PK `(submission_id, period_batch)`, kolom
  `prize_per_winner`, `winner_count`, akumulasi top-up, `created_at`.
- **Pool lahir saat pendanaannya nyata**, dan kuncinya `NOT NULL`.
- Backfill **2 baris** di atas, nilai dibakukan (pola `sql/72`/`sql/79`),
  idempoten dengan menyaring nilai lama yang diharapkan. `0026f81d` **dilewati** —
  sebutkan alasannya di komentar berkas supaya tidak "diperbaiki" orang berikutnya.
- `get_schedule_batch_context` dan `get_batch_rewards_bulk` bersumber ke tabel
  ini, sehingga agregasi `MAX()` gandanya hilang.
- **Penjaga risiko no. 1**: `cancelSchedule()` tidak boleh menghilangkan pendanaan
  pool yang masih menaungi jadwal lain yang hidup di batch itu.
- RLS: `SELECT` untuk pemilik order; **tulisan hanya lewat RPC/`service_role`**.

### Langkah 2 — `sql/86`: lebarkan wewenang `create_ad_schedule`

Berkas `sql/74` sendiri menulis: *"Kalau Phase 4 kelak membuka penjadwalan
swalayan, pelebarannya dilakukan SADAR di sini."* Ini pelebaran itu.

> Nomornya **`86`** — sudah dipesan dan masih kosong. `85` dipakai DUA berkas
> (tabrakan branch paralel) dan `87` sudah terpakai untuk `bill_cancelled`.
> ⚠️ Ambil nomor **sesudah `git fetch`**, bukan dari folder lokal — aturan yang
> lahir dari tabrakan `85` itu sendiri.

Izinkan pemilik order (`auth.uid()` = `auth_user_id` order) membuat jadwal untuk
ordernya sendiri. **Parameter dari browser tidak boleh dipercaya** — untuk
pemanggil non-admin, RPC **memaksa**:

- `slot_booked_by := 'user'` dan `slot_reserved_at := now()`
- `p_is_extra_ad := false` — kolam iklan tambahan milik admin
- `p_total_cost := 0` — harga tidak pernah datang dari browser (Langkah 4 yang mengisinya)

⚠️ **`slot_reserved_at` belum ada jalannya sama sekali.** `sql/74` tidak punya
parameternya (diverifikasi 2026-09-10: 15 parameter, tidak satu pun
`p_slot_reserved_at`) dan menulis kolomnya **hardcoded `NULL`** di baris VALUES.
Jadi "hold 1 jam" bukan sekadar nilai default yang diganti — kolomnya harus
ditambahkan ke tanda tangan DAN ke INSERT-nya. Selama itu belum, Keputusan 2
tidak punya wujud di database, dan Langkah 3 tidak punya apa pun untuk dilepas.

Dan **menolak**: order Kilat, order yang belum lolos review, tanggal lewat
cutoff, serta hadiah kosong saat `is_new_batch`.

⚠️ **KUOTA HARIAN TIDAK DIJAGA DATABASE — dan Phase 4 yang membuatnya terasa.**
`assert_schedule_window_free` menyaring `submission_id = p_submission_id`: ia
menjaga satu survei dari beririsan dengan **dirinya sendiri**, bukan kapasitas
satu hari dari terjual berlebih. `MAX_REGULAR_ADS_PER_DAY = 4` hidup **hanya di
TypeScript**. Hari ini yang menyerialkan pemesanan adalah **seorang admin**;
Phase 4 mencabut manusia itu dan menaruh N peneliti membaca kalender lalu
menyisipkan — TOCTOU klasik, dan yang kalah adalah hari yang terjual 5 dari 4.
RPC ini harus menghitung kuotanya sendiri sebelum INSERT (memakai predikat
`holdsSlot` yang sama) dan menolak dengan pesan yang menyebut tanggalnya.

⚠️ **Cutoff 13.00 akan jadi salinan KETIGA, kali ini di Postgres.** `sql/74` nol
logika tanggal hari ini, dan bukti bahwa cabang `null` `invoiceLifetimeMinutes()`
mustahil dicapai peneliti bersandar sepenuhnya pada `submitOrder.ts:109`. Langkah
ini membuka jalur peneliti KEDUA yang tidak lewat sana.

> Jalur tulisnya tetap RPC `SECURITY DEFINER`. **Jangan** menambah policy `INSERT`
> langsung untuk `authenticated` di `ad_schedules` — lubang itu persis yang
> ditutup saat view dicabut.

⚠️ **Dan satu jebakan baru sejak `sql/87`:** schema `public` punya
`pg_default_acl` yang memberi **`anon` EXECUTE pada setiap fungsi baru**, dan
`REVOKE ALL FROM PUBLIC` **tidak** mencabutnya. Untuk RPC jalur uang, tulis
`REVOKE ... FROM anon` **eksplisit**, lalu periksa `pg_proc.proacl` — jangan
berasumsi dari isi berkas.

### Langkah 3 — pelepasan hold untuk jadwal ke-2 (belum ada sama sekali)

Uji "biarkan lewat 1 jam → slot lepas" **hari ini tidak punya implementasi apa
pun**, dan tiga jalan pintas yang kelihatan tersedia semuanya salah:

1. **`releaseExpiredSlot()` TIDAK boleh dipakai.** Ia berlingkup **order**, bukan
   jadwal: mengosongkan `form_submissions.start_date`/`end_date`, menyetel
   `payment_status = 'expired'`, meng-`expire` **seluruh** transaksi pending order
   itu, dan menghapus `survey_pages.publish_*`. Memakainya untuk hold ordinal 2
   **merusak jadwal ordinal 1 yang sedang tayang**.
2. **Timer klien tidak cukup.** Satu-satunya pemanggil yang benar-benar melepas
   adalah `PaymentCheckoutPage`. Dialog Phase 4 hidup di dashboard; peneliti yang
   menutup tab sesudah mengunci slot menahan tanggal itu **selamanya**, dan tidak
   ada cron yang membereskannya.
3. **Klien peneliti tidak bisa menulisnya.** `UPDATE ad_schedules` hanya untuk
   `product@jakpat.net` (`sql/78`).

Yang benar: **RPC `release_expired_schedule_hold()` berlingkup SATU baris
`ad_schedules`**, `SECURITY DEFINER`, memakai predikat yang sama dengan
`slotHold.ts`. Ia menyetel status jadwal itu saja, tidak menyentuh order, tidak
menyentuh `survey_pages`.

Pemicunya **dua**, dan keduanya perlu: saat **dibaca** (`fetchSlotAvailability`
sudah menjatuhkan hold basi lewat `holdsSlot()`, jadi kuota kalender sudah benar
tanpa tulisan apa pun) dan saat **ditulis** (pelepasan sesungguhnya — jadikan ia
bagian dari penjaga kuota di Langkah 2, bukan cron baru).

### Langkah 4 — harga diturunkan di server

`create-payment.js` hari ini order-scoped (membaca `ad_schedules` dengan
`ordinal=eq.1`). Tambahkan cabang: bila `schedule_id` dikirim, turunkan nominal
**dari jadwal itu**.

⚠️ **TIGA PENJAGA ORDER-SCOPED MENOLAK SETIAP PEMBAYARAN PHASE 4 — ini penghalang
pertamanya, bukan harganya.** Diverifikasi 2026-09-10, ketiganya masih berdiri di
[baris 353–366](../../../multi-step-form/functions/api/doku/create-payment.js#L353-L366):

| Penjaga | Akibat untuk Phase 4 |
|---|---|
| `sub.payment_status === 'paid'` → 409 `Submission is already paid` | **Menolak 100% sasaran Phase 4.** Webhook memang menulis `'paid'` di order induk saat jadwal pertamanya lunas — dan order yang jadwal pertamanya lunas justru definisi sasaran fitur ini |
| `sub.payment_status === 'expired'` → 409 | Order yang jadwal pertamanya pernah kehabisan hold tidak akan pernah bisa memesan lagi |
| hold 1 jam dari `sub.slot_reserved_at` | Membaca jam reservasi **ordinal 1**, yang untuk jadwal ke-2 sudah lama basi |

Ketiganya benar selama endpoint ini hanya melayani jadwal pertama. Begitu
`schedule_id` dikirim, ketiganya harus dialihkan ke **baris jadwal itu**
(`ad_schedules.payment_status` dan `slot_reserved_at` miliknya sendiri).
Menghapusnya bukan pilihan: untuk jalur ordinal 1 ia tetap satu-satunya
pertahanan.

**Jangan mengarahkan peneliti ke `/api/doku/checkout`**: endpoint itu admin-gated
di `_middleware.js` justru karena nominalnya datang dari klien.

Salinan tarif `cost-calculator.ts` ↔ `create-payment.js` **wajib berubah
bersamaan** — suite paritas vitest yang menjaganya sudah ada.

⚠️ Cabang "batalkan tagihan tersalip" di endpoint ini memanggil `cancelDokuOrder`
— baca "Dua hal yang berubah" di atas sebelum mengandalkannya.

### Langkah 5 — layar peneliti

- `SchedulePhase.tsx`: tombol jadi hidup; **sembunyikan untuk order Kilat**.
- Dialog baru (mis. `ScheduleAgainDialog`) di `components/status/`, memakai ulang
  `SlotCalendar`, `useSlotAvailability`, `get_schedule_batch_context`, dan
  `deriveScheduleMoney` untuk pratinjau harga.
- ⚠️ **Jangan memakai `ScheduleForm` apa adanya** — di dalamnya ada toggle Iklan
  Tambahan dan kelonggaran cutoff khusus admin (commit `920b3cb`). Keduanya tidak
  boleh sampai ke peneliti.
- Bila `isNewBatch`: panel hadiah muncul dengan prefill dari jadwal terakhir,
  wajib diisi, disertai kalimat yang menjelaskan **kenapa** hadiah ditagih lagi.
- Tombol akhir: **"Kunci Jadwal & Lanjut Bayar"** — kata "kunci" milik tombol yang
  benar-benar mengunci slot (aturan 2026-08-18).

⚠️ **`create_ad_schedule` MENGEMBALIKAN `source_id`, bukan `ad_schedules.id`** —
dan resolver `/bayar/<id>` dikunci ke `ad_schedules.id`, karena itulah kunci yang
diterima `schedule_billing()`. Dua UUID berbeda untuk satu jadwal, dan yang salah
**tidak error** — ia hanya tidak menemukan tagihan apa pun. Kekeliruan ini mudah
sekali terjadi di sini: seluruh kode di sekitarnya memakai `sourceId`. Dialog ini
butuh satu lookup sebelum bisa menyusun link `/bayar/`.

### Langkah 6 — i18n & pembersihan

Buang `scheduleAgainComingSoon` dan `comingSoonBadge` dari tombol ini; string baru
ditulis **dua bahasa** mengikuti pola `awaiting_invoice` yang sudah ada.

---

## Verifikasi

**Gerbang mesin**

- `npx vitest run` — termasuk suite paritas harga klien↔server dan
  `payLinkNoRawFallback.spec.ts`
- `tsc -p tsconfig.app.json` — **bukan** `tsc --noEmit` polos; yang polos menipu,
  lapor 0. Baseline per 2026-09-10 = **77**
- `npm run build`

**Uji browser (wajib, dashboard peneliti)**

1. Order non-Kilat lunas → "Jadwalkan Iklan Lagi" → tanggal yang berakhir di
   **batch berjalan** → panel hadiah **tidak** muncul, harga = iklan + PPN.
2. Ulangi dengan tanggal yang berakhir di **batch BARU** → panel hadiah muncul dan wajib.
3. Kunci jadwal → bayar dalam 1 jam → jadwal jadi `paid`.
4. Kunci jadwal → **biarkan lewat 1 jam, TUTUP TABNYA** → slot lepas, kuota
   kembali. Menutup tab itu bagian ujinya (Langkah 3).
5. Order **Kilat** → tombol tidak muncul sama sekali.
6. Order yang jadwal pertamanya **sudah lunas** → sampai ke halaman DOKU, **bukan**
   409 `Submission is already paid` (Langkah 4).
7. Hari yang **kuotanya tinggal 1** → dua peneliti mengunci tanggal yang sama
   hampir bersamaan (dua browser) → yang kedua **ditolak RPC**.
8. Jadwal ke-2 yang menunggu bayar → kartunya menyebut tenggat **1 jam** (hold),
   bukan tenggat 14.00 hari tayang.
9. **BARU:** tombol bayar jadwal ke-2 mengarah ke **`/bayar/<ad_schedules.id>`**,
   bukan URL DOKU — dan bukan ke `source_id`.

**Verifikasi data sesudah uji (pelajaran `sql/79`)**

- `slot_booked_by = 'user'` **dan** `slot_reserved_at` terisi di baris baru —
  angka yang hari ini **0 dari 18**
- `total_cost`, `subtotal`, `ppn_amount` **tidak 0** — nol di sini berarti tulisan
  menyentuh nol baris tanpa error
- nol hari yang jumlah jadwal regulernya melebihi `MAX_REGULAR_ADS_PER_DAY`
- nol baris `waiting_payment` ber-`slot_booked_by='user'` yang `slot_reserved_at`-nya
  lewat lebih dari sejam
- `doku_webhook_events` mendapat baris ber-`outcome` `ok`
- kalender slot admin dan peneliti menampilkan angka yang sama

---

## Risiko & yang sadar ditinggal

- **Lingkupnya membengkak sesudah review 2026-09-08.** Rencana ini semula lima
  langkah yang semuanya menambah; sekarang tiga di antaranya **mengubah kode jalur
  uang yang sudah berjalan** — penjaga `create-payment.js`, kuota di RPC, dan
  cabang tenggat di kartu peneliti.
- **Kuota harian pindah rumah, dan salinan TypeScript-nya tetap ada.** Dua penjaga
  (kalender di klien untuk UX, RPC di server untuk kebenaran) — disengaja, tapi
  keduanya harus menyebut angka yang sama. Beri komentar silang.
- **Tagihan tersalip akan jauh lebih sering lahir**, dan Cancel Order baru saja
  diaktifkan tanpa satu pun bukti keberhasilan — plus ia tidak pernah mencakup
  kartu kredit.
- **Permukaan harga disentuh dua kali** kalau keputusan no. 5 dipertahankan.
- **Dua order lunas belum pernah dapat tanggal sejak awal Agustus**
  (`e9cb5944`, `8c9c00a6`). Itu **isu layanan yang berdiri sendiri**, bukan bagian
  rencana ini — tapi sudah sebulan berjalan dan pantas ditindak terpisah.
- **Phase 5 (Kilat swalayan) tetap menyusul**, bukan paralel — butuh pemilih
  gelombang, bukan rentang hari.
- Dokumen yang harus **diralat** saat rencana ini dieksekusi: §00G progress doc
  dan roadmap Phase 4 di
  [`2026-08-03-jadwal-iklan-redesign.md`](2026-08-03-jadwal-iklan-redesign.md) —
  keduanya masih memuat angka "83 order".
