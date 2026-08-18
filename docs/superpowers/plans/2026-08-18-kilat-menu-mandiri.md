# JFU Kilat jadi menu tersendiri di dashboard peneliti

> ## ⬜ BELUM DIEKSEKUSI — sengaja ditunda oleh pemilik produk 2026-08-18
> Ditulis supaya keputusan dan temuannya tidak hilang, bukan untuk dikerjakan
> sekarang. **Satu keputusan produk masih terbuka** (lihat §Keputusan yang belum
> diambil) — rencana tugas-per-tugas belum bisa ditulis di atasnya, karena
> jawabannya mengubah bentuk pekerjaan secara mendasar, bukan sekadar detailnya.
>
> Indeks seluruh rencana ada di [`README.md`](README.md).

## Kenapa rencana ini lahir sekarang

Voucher `JFUSUHUD` — satu-satunya pintu masuk Kilat hari ini — **berakhir 31
Agustus 2026**, diterapkan di kode pada 2026-08-18 (lihat §Perubahan yang sudah
mendahului). Sejak 1 September, tombol upgrade Kilat di Ringkasan Pesanan tidak
lagi muncul untuk siapa pun, karena `getVoucherInfo` berhenti mengembalikan
`isKilatEligible`.

Itu **disengaja**. Kilat tidak dimatikan; ia dipindahkan. Pintunya akan lahir
kembali sebagai menu tersendiri di dashboard peneliti. Yang perlu dijaga adalah
jaraknya: antara 1 September dan tayangnya menu baru, Kilat sunyi total.

## Keputusan yang sudah diambil

| Keputusan | Isi | Diputuskan |
|---|---|---|
| Siapa yang boleh | **Terbuka untuk semua**, bukan lagi berpagar voucher/undangan | 2026-08-18 |
| Cara memilih tanggal | **Antrean tanggal seperti Iklan** — kalender ketersediaan, bukan pengajuan manual | 2026-08-18 |
| Nasib `JFUSUHUD` | Mati total 31 Agu 2026: diskon 10% DAN pintu Kilat, keduanya | 2026-08-18 |

## Keputusan yang belum diambil

**Siapa yang memilih jam gelombang (08.00 / 11.00 / 14.00 / 17.00 WIB)?**

Hari ini user memesan Kilat **per-hari tanpa memilih jam**, dan admin menugaskan
slotnya belakangan lewat `kilat_slot_hour`. `sql/42` menyebut `NULL` sebagai
keadaan yang sah, bukan cacat data. Dengan Kilat terbuka untuk semua dan kuota 8
order per hari kerja, pilihannya:

1. **Tetap admin.** Sampai 8 penugasan manual tiap hari kerja — beban yang tumbuh
   lurus dengan kesuksesan fitur. Tidak ada kode baru.
2. **User memilih sendiri.** Kalender berubah dari "hari" jadi "hari × 4
   gelombang"; papan admin berubah dari penugas jadi pengawas. Perubahan terbesar,
   tapi menghapus beban operasional sepenuhnya.
3. **Sistem menugaskan otomatis** (isi gelombang paling kosong), admin hanya
   menggeser bila perlu. Jalan tengah; butuh aturan tie-break yang eksplisit.

Jawabannya menentukan apakah rencana ini menyentuh `SchedulePicker` (opsi 2) atau
tidak sama sekali (opsi 1/3).

## Yang ternyata SUDAH ada — jangan dibangun ulang

Diverifikasi ke kode 2026-08-18. Bagian terbesar "antrean tanggal seperti Iklan"
**sudah jalan**; yang kurang adalah pintunya, bukan antreannya.

| Sudah ada | Di mana | Catatan |
|---|---|---|
| Kartu produk Kilat di hub "Buat Order" | [`CreateOrderCards.tsx:29-31`](../../../multi-step-form/src/components/CreateOrderCards.tsx) | Bertanda `comingSoon: true`, **tanpa `to`** sehingga tidak klikabel. Halaman edukasinya (`submit-kilat`) dihapus 2026-08-10. Membuka menu = mengisi `to` dan mencabut `comingSoon` |
| Kuota harian Kilat | `MAX_KILAT_ADS_PER_DAY` di `constants.ts` | Turunan `KILAT_SLOT_HOURS.length × KILAT_QUOTA_PER_SLOT` = **8/hari** |
| Kalender ketersediaan Kilat untuk user | `useSlotAvailability('kilat')` | Sudah menghitung kuota 8/hari |
| Layar pilih tanggal Kilat untuk user | `StepSchedule` `mode="kilat"` + `SchedulePicker` | Kalender 14 hari, sama seperti iklan regular |
| Papan slot Kilat admin | `KilatScheduleBoard.tsx` di halaman Schedule | Yang diingat pemilik produk — memang ada |
| Penugas jam admin | `KilatScheduleStep.tsx` | Dipakai `schedule/ScheduleForm.tsx` |
| Kolom jam + guard halaman | `sql/42_kilat_slots.sql` | `kilat_slot_hour` nullable; Kilat sengaja TIDAK dapat halaman iklan |

## Lubang yang selama ini ditutup voucher, bukan kode

`sql/42` sudah menuliskan prinsipnya sendiri, dalam konteks lain:

> *"Selama ini tidak terlihat karena Kilat hanya bisa dipesan lewat voucher
> JFUSUHUD; membuka jembatan admin akan membuatnya rutin."*

Kalimat itu ditulis untuk halaman iklan, tapi berlaku untuk semua di bawah ini.

### 1. Aturan Senin–Jumat tidak berlaku di sisi user 🔴

`dow !== 0 && dow !== 6` hanya hidup di
[`KilatScheduleStep.tsx:52-53`](../../../multi-step-form/src/components/KilatScheduleStep.tsx) —
**picker admin**. `SchedulePicker` yang dipakai user tidak menyaring akhir pekan
sama sekali, dan `sql/42` menjelaskan kenapa ia sengaja bukan CHECK constraint
(hari libur nasional tidak terwakili `EXTRACT(DOW)`, dan constraint akan mengunci
baris lama).

**Bukti dari produksi 2026-08-18:** 17 order Kilat yang punya tanggal, **semuanya
Senin–Jumat**. Jadi ini belum pernah kejadian — tapi itu keberuntungan populasi
kecil berpagar voucher, bukan penjagaan. Membuka untuk semua menghapus pagarnya.

### 2. Penugasan jam adalah kerja manual yang tidak berskala 🟡

2 dari 17 order Kilat di produksi masih `kilat_slot_hour IS NULL`. Dengan kuota
8/hari terbuka, angka itu bukan lagi sisa melainkan antrean.

### 3. Kilat tidak punya halaman iklan — dan itu benar 🟢

`sql/42` bagian (B) sengaja mencegah `ensure_survey_page()` menerbitkan halaman
untuk Kilat: produknya dijual sebagai push notification, bukan kartu di feed.
Guard ini sudah aktif; membuka menu tidak melemahkannya. **Jangan** "perbaiki"
ini saat mengerjakan menu baru.

### 4. Harga Kilat sudah bebas voucher 🟢

`KILAT_ADDON_COST` dan `KILAT_ADDON_COST_VOUCHER` dua-duanya **200.000** sejak
prinsip "Kilat tanpa diskon". Cabang `JFUSUHUD` di `getKilatAddonCost()` dan di
`create-payment.js` sudah lama tidak berefek apa-apa. Matinya voucher **tidak**
mengubah harga Kilat sepeser pun — tapi cabang mati itu sebaiknya dibersihkan
sekalian saat menu ini dikerjakan.

## Perubahan yang sudah mendahului rencana ini

Diterapkan 2026-08-18, **bukan** bagian dari rencana ini tapi prasyaratnya:

- `JFUSUHUD_VALID_UNTIL = '2026-08-31T17:00:00Z'` (= 1 Sep 00.00 WIB) di
  `constants.ts`, dicermin di `create-payment.js`.
- Pesan voucher yang **masih berlaku** kini menyebut tanggal berakhirnya, supaya
  peneliti tahu sebelum kehilangan dan bukan sesudah.
- Kevalidan voucher dinilai pada **tanggal order lahir**, bukan jam pembayaran —
  `create-payment.js` menghitung ulang harga tiap pembayaran dan diam-diam
  mengoreksi `total_cost` di DB, jadi tanpa ini order yang dipesan sewaktu
  voucher masih hidup akan ditagih lebih mahal dari ringkasan yang disetujuinya.
- Tes paritas klien-server pertama di repo ini (`voucher-validity.spec.ts`) —
  menjaga tuntutan "kedua salinan harga WAJIB diubah bersamaan" yang sebelumnya
  hanya dijaga komentar.

## Data produksi sebagai titik tolak (2026-08-18)

| Angka | Nilai |
|---|---|
| Order pernah memakai `JFUSUHUD` | 22 |
| Di antaranya Kilat lunas | 11 — pilotnya memang terpakai |
| Order Kilat punya tanggal | 17, seluruhnya Senin–Jumat |
| Order Kilat tanpa `kilat_slot_hour` | 2 |
| Order `JFUSUHUD` masih `pending` | 8, tapi 7 sudah mati (spam/rejected/tanggal lewat) |

## Hubungan dengan rencana lain

- **Tidak bergantung** pada Task 11 maupun Task 13 — Kilat tidak memakai
  `ad_schedules.booking_id` maupun tagihan fleksibel per jadwal.
- **Bersinggungan dengan Phase 4** ("Jadwalkan Iklan Lagi"): keduanya menambah
  permukaan pemesanan swalayan di dashboard peneliti. Kalau dikerjakan
  berdekatan, samakan bahasa visual dan pola kalendernya sekali saja.
- **Design-system** ([2026-07-30](2026-07-30-design-system-dashboard.md)) sudah
  mendaftar `StepSchedule.tsx` dan `SchedulePicker` di daftar sapuannya. Kalau
  menu ini lahir lebih dulu, sapuan itu bertambah.
