# Kenaikan harga iklan + voucher yang bisa diklaim

> **Status: ⬜ BELUM DIEKSEKUSI — ditulis 2026-08-30, ditahan atas permintaan pemilik
> produk untuk menyelesaikan langkah *contract* `form_submissions_extend` lebih dulu.**
>
> Nol baris kode berubah sejauh ini. Seluruh angka di dokumen ini **diukur langsung
> ke produksi** (`zewuzezbmrmpttysjvpg`) pada 2026-08-30, bukan diperkirakan.
>
> ---
>
> ⚠️ **KOREKSI 2026-09-04 — strateginya diganti, rancangan teknisnya dipakai ulang.**
> Baca [`2026-09-04-transisi-harga-iklan-okt-jan.md`](2026-09-04-transisi-harga-iklan-okt-jan.md)
> **sebelum** mengeksekusi apa pun di sini. Yang berubah:
>
> 1. **Bantalannya bukan lagi halaman "Klaim Voucher"** (Fase 2+3 di bawah). Halaman
>    klaim punya *risiko penemuan* — peneliti yang tidak menemukannya menghadapi +65%
>    mentah. Penggantinya **Harga Perkenalan otomatis** yang berlaku tanpa satu klik.
>    Halaman klaim tidak dibuang: ia turun jadi **lantai harga permanen segmen
>    mahasiswa**, tenggat 1 Jan 2027, dan **tidak lagi memblokir kenaikan**.
> 2. **Kenaikannya bertahap, bukan sekali lompat** — 1 Okt (efektif ±0%) → 1 Des (≈+33%)
>    → 1 Jan 2027 (harga penuh). Fase 4 di bawah ("Nyalakan kenaikannya") diganti jadwal
>    tiga langkah.
> 3. **Empat temuan review kode 2026-09-04** menambah/mengurangi daftar kerja di bawah:
>    `SubmissionDetailSheet.tsx:576-577` **ternyata titik harga** dan tidak ada di daftar
>    mana pun · `SchedulePhase` **sudah bukan** titik harga (semuanya lewat
>    `deriveScheduleMoney`) · `deriveScheduleMoney` juga kehilangan tanggal **voucher**,
>    bukan cuma tanggal tarif · **JFUFEB memakai cap Rp 300.000/hari yang berlaku sampai
>    20 Feb 2027** — terhadap tangga baru itu jadi diskon 40–62% yang tak pernah
>    diputuskan siapa pun.
> 4. Angka JFUSUHUD final: **33 order, 25 lunas** (dokumen ini mencatat 23 — ia masih
>    laku sampai hari terakhir, 31 Agu).
>
> Yang **tetap berlaku penuh** dari dokumen ini: dampak **+65,2%**, bauran tier, tangga
> **200/350/500/650/800**, dan seluruh temuan `atMs` (§"Temuan yang WAJIB dibereskan").

## Kenapa dokumen ini ada

Direksi ingin menaikkan harga iklan, dan ingin kenaikan itu **dilunakkan lewat kode
voucher yang bisa diklaim peneliti sendiri**. Dua hal itu tidak bisa dikerjakan
terpisah: menaikkan tarif tanpa jalan keluar akan menghantam pelanggan yang sedang
antre, dan menerbitkan voucher klaim tanpa kenaikan tidak menyelesaikan apa pun.

Tangga tarif baru sebenarnya **sudah disepakati 2026-07-20** dan tidak pernah
dieksekusi. Dokumen ini menghidupkannya kembali, ditambah mekanisme klaim yang
hari ini **belum ada sama sekali**.

---

## Keputusan yang sudah diambil (pemilik produk, 2026-08-30)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Tangga tarif baru | **200 / 350 / 500 / 650 / 800** ribu per hari — sesuai kesepakatan 2026-07-20 |
| 2 | Order lama yang belum bayar | **Tangga tarif ikut ber-tanggal**, seperti voucher. Tiap order selamanya dihargai pada tarif yang berlaku saat ia LAHIR |
| 3 | Bentuk "voucher yang bisa diklaim" | **Halaman "Klaim Voucher" self-serve** di dashboard peneliti |
| 4 | Isi vouchernya | **Potongan persen dengan batas nominal maksimum** (mis. 20% maks Rp 200.000) |
| 5 | Kuota & kelayakan | **Semua akun terdaftar, sekali per akun, ada masa berlaku** |
| 6 | Nasib JFUSUHUD (mati 31 Agu 2026) | **Dibiarkan mati sesuai jadwal.** Voucher klaim jadi penggantinya |

---

## Keadaan terukur hari ini

### Tangga tarif berjalan

`150.000 / 200.000 / 300.000 / 400.000 / 500.000` per hari, dengan batas
`≤15 / ≤30 / ≤50 / ≤70 / >70` pertanyaan.

### Dampak tangga baru — 239 order lunas sejak 2026-05-01

| | |
|---|---|
| Biaya iklan tarif lama | Rp 119.050.000 |
| Biaya iklan tarif baru | Rp 196.650.000 |
| Selisih | **+Rp 77.600.000 (+65,2%)** |
| Per bulan (±) | Rp 29,8jt → **Rp 49,2jt** |

Dihitung pada bauran order NYATA (`question_count` × `duration` per order,
Kilat memakai tarif basis tanpa pengali durasi), bukan pada rata-rata.

### Bauran tier — order lunas sejak 2026-05-01

| Tier | Order | Porsi | Durasi 1 hari |
|---|---|---|---|
| T1 (1–15) @150k | 4 | **1,7%** | 3 dari 4 |
| T2 (16–30) @200k | 51 | 21,3% | 42 dari 51 |
| T3 (31–50) @300k | **115** | **48,1%** | 93 dari 115 |
| T4 (51–70) @400k | 41 | 17,2% | 31 dari 41 |
| T5 (>70) @500k | 28 | 11,7% | 12 dari 28 |

⚠️ **T1 dijaga murah "untuk segmen mahasiswa", tapi ia cuma 1,7% order lunas.**
Kekhawatiran 2026-07-20 bahwa porsi T1 akan membengkak >20% **tidak terjadi** —
ia justru mengecil. Proteksi itu praktis tidak menyentuh siapa pun; yang benar-benar
menanggung kenaikan adalah **T3 (48%)**. Kalau kenaikan perlu dilunakkan, T3 yang
harus dilihat, bukan T1.

Tambahan: **76% order berdurasi 1 hari**, jadi tarif harian = harga produk de facto.

### Keadaan voucher

| Kode | Order | Lunas | Revenue | Agustus 2026 | Catatan |
|---|---|---|---|---|---|
| **JFUSUHUD** | 23 | 15 | Rp 8,30jt | **22** | Satu-satunya yang hidup. **Mati 31 Agu 2026** |
| JFUFEB | 7 | 6 | Rp 9,91jt | 0 | Revenue tertinggi, tapi dorman |
| JFUGITA | 6 | 5 | Rp 2,94jt | 0 | Ambassador |
| JAKPATUNIV2025 | 18 | 4 | Rp 1,70jt | 0 | Sudah pensiun |
| JFUEDO | 1 | 1 | Rp 0,42jt | 0 | Ambassador |
| JFUTGRX | 12 | 3 | Rp 4rb | 0 | Voucher uji sistem |
| JFUTYR / PPISWEDIA / TEGARGANTENG | 5 / 1 / 1 | 0 | 0 | 0 | Mati suri |
| **ILKOMUNY** | **0** | 0 | 0 | 0 | **Nol pemakaian seumur hidup** |

Fakta yang menentukan bentuk pekerjaan:

- **`voucher_redemptions` = 0 baris.** Tabelnya dibangun lengkap (`sql/35`, dengan
  `UNIQUE(auth_user_id, voucher_code)`, RLS, dan penulisan dari webhook), tapi
  gerbangnya **belum pernah mencatat satu pun redemption** — karena satu-satunya
  voucher yang memakainya (ILKOMUNY) tidak pernah dipakai orang.
- **Belum ada mekanisme klaim sama sekali.** Voucher hari ini adalah rantai `if`
  yang di-hardcode di dua berkas. Menambah satu kode = ubah kode + deploy.
  Tidak ada kuota, tidak ada penerbitan, tidak ada CRUD admin.
- **12 kode ambassador praktis mati** (JFUGITA 6, JFUEDO 1, sisanya nol; tak ada
  yang dipakai di Agustus).
- **Kolom `voucher_code` teks bebas** — dari 120 isian, 39% bukan voucher sama
  sekali (`TIDAK ADA`, `-`, `1933`, bahkan `jakpat_id`).
- **`webhook.js` punya daftar hardcoded ketiga**: `LIMITED_VOUCHERS = ['ILKOMUNY']`.

---

## ⚠️ Temuan yang WAJIB dibereskan sebelum tarif dinaikkan

**`calculateAdCostPerDay()` tidak punya parameter tanggal sama sekali** — padahal
`calculateDiscount()` punya (`atMs`), ditambal Agustus 2026 setelah ada peneliti
ditagih Rp 233.100 di atas ringkasan yang ia setujui.

`create-payment.js` **menghitung ulang harga setiap kali orang menekan bayar**, lalu
diam-diam mengoreksi `total_cost` di DB ke angka server. Jadi begitu tangga baru
dideploy:

| | |
|---|---|
| Order sudah di-approve tapi belum bayar | **80** |
| Di antaranya dibuat Agustus 2026 | 11 |
| Kenaikan rata-rata per order | **+Rp 230.000** |
| Kenaikan terbesar satu order | +Rp 500.000 |
| Total naik diam-diam | **+Rp 18.400.000** |

Ini persis bug §00V (*"harga tercatat ≠ ditagihkan"*) dalam arah sebaliknya, dan
kali ini ia menimpa pelanggan yang sedang menunggu bayar. **Keputusan no. 2 ada
untuk menutup kelas bug ini permanen**, bukan sekadar untuk kenaikan kali ini.

### Kabar baiknya: polanya sudah ada, tinggal diperluas

Pekerjaan §00V sudah menegakkan aturan *"nilai voucher pada tanggal order lahir"* di
tiga penulis harga, dan ketiganya **sudah membaca `created_at` dan sudah meneruskan
`voucherInstantOf(sub.created_at)`**:

- `src/utils/supabase.ts` — `recomputeOrderPrice`, `previewOrderPrice`, `convertDistributionType`
- `functions/api/doku/create-payment.js` — `orderInstant(sub)`

Jadi menambahkan `atMs` ke tangga tarif adalah **perluasan simetris**: instan yang
sama sudah dihitung di tiap titik, tinggal ikut diteruskan.

### Titik harga yang harus berubah serentak — TIGA, bukan empat

1. `multi-step-form/src/utils/cost-calculator.ts` — `calculateAdCostPerDay` (klien)
2. `multi-step-form/functions/api/doku/create-payment.js` — salinan **OTORITATIF** (server)
3. `multi-step-form/src/pages/dashboard/ChatPage.tsx` ±L230 — naskah FAQ chatbot

⚠️ **Koreksi terhadap catatan lama:** `StepOneFormFields.tsx` ±L338 pernah dicatat
sebagai titik harga keempat. **Salah** — tangga di sana (`25/30/35/50/80` ribu)
adalah *saran hadiah per responden*, bukan tarif iklan. Jangan ikut diubah.

Halaman marketing statis (`index.html`, `homepage.html`) **tidak** memuat tarif.

### Pemanggil yang perlu diberi `atMs`

Sudah punya instannya, tinggal diteruskan:
`supabase.ts` (3 blok recompute) · `create-payment.js`

Perlu `created_at` di-thread masuk:
`src/utils/scheduleMoney.ts` · `src/components/schedule/invoiceItems.ts` ·
`src/components/schedule/InvoiceForm.tsx` ·
`src/components/submissions/tabs/DistributionConvertDialog.tsx` ·
`src/components/submissions/tabs/DistributionSection.tsx`

**Sengaja TIDAK diubah** — wizard order baru, di mana "tarif hari ini" memang benar:
`StepCheckout` · `MultiStepForm` · `UnifiedHeader` · `Sidebar`

### `deriveScheduleMoney` — regresi tampilan, bukan regresi uang

`deriveScheduleMoney` merekonstruksi rincian kotor/diskon dengan menghitung ulang
memakai tarif hari ini lalu mengadu hasilnya dengan nilai TERSIMPAN
(`Math.abs(... - netAdCost) < 10`). Saat tangga berubah, perbandingan itu gagal untuk
order lama bervoucher, dan ia jatuh ke cabang probe.

Ditelusuri: **totalnya tetap benar** (diambil dari `entry.totalCost` tersimpan). Yang
hilang hanyalah **baris "Diskon Voucher" pada kartu order lama** — order tanpa
voucher tidak tersentuh sama sekali. Sama juga terjadi begitu JFUSUHUD mati, bahkan
tanpa kenaikan harga. Perlu diperbaiki lewat `atMs`, tapi **bukan penghalang rilis**.

---

## Rancangan

### Fase 1 — Tangga tarif jadi ber-tanggal, dengan nilai TIDAK berubah

Kirim mekanismenya lebih dulu sebagai **no-op**: tangga baru diisi angka yang sama
dengan tangga lama. Nol rupiah berpindah, jadi kalau ada yang salah ia terlihat tanpa
ada pelanggan yang tertagih keliru.

```
constants.ts   → AD_RATE_CHANGE_AT = '<ISO, tengah malam WIB>'
cost-calculator.ts → calculateAdCostPerDay(questionCount, atMs = Date.now())
                     memilih tangga: effectiveFrom terakhir yang <= atMs
create-payment.js  → salinan identik (WAJIB berubah bersamaan)
```

Lalu thread `atMs` ke lima pemanggil yang belum punya (daftar di atas).

⚠️ Nilai default `Date.now()` dipertahankan supaya 20 pemanggil lama tetap
ter-kompilasi — **tapi default diam persis cara bug `created_at` dulu lolos review.**
Karena itu Fase 1 wajib menambah spec bergaya `create-payment-select.spec.ts`: menguji
**PEMANGGIL**-nya, bukan cuma fungsinya.

### Fase 2 — Voucher jadi DATA, bukan kode

Tabel `vouchers`: `code` (PK, huruf besar) · `kind` (`percent_capped`) ·
`percent` · `max_discount_amount` · `valid_from` / `valid_until` ·
`claimable` · `once_per_account` · `active` · `terms`.

Migrasi 19 kode hardcoded jadi baris tabel. **Perilaku wajib identik** — dijaga uji
paritas yang sudah ada (`voucher-validity.spec.ts`, 6804 kombinasi).

Aturan pindah ke DB, **matematikanya tetap murni & terduplikasi**:
`calculateDiscount(code, ..., rule)` menerima objek aturan sebagai masukan, sehingga
klien dan server sama-sama mengambil aturan dari DB lalu menyerahkannya ke fungsi
yang sama. Paritas tetap bisa diuji tanpa DB.

Ini sekalian membunuh **dua** daftar hardcoded: `VOUCHER_CATALOG` dan
`LIMITED_VOUCHERS` di `webhook.js`.

⚠️ `create-payment.js` hari ini **nol** membaca voucher dari DB. Fase 2 membuatnya
membaca aturan + memverifikasi klaim. Ia otoritatif atas uang — perlakukan sebagai
rilis jalur uang tersendiri.

### Fase 3 — Halaman "Klaim Voucher"

Rute baru di dashboard peneliti. Peneliti melihat voucher yang `claimable`, menekan
klaim, dan kodenya terikat ke akunnya beserta masa berlaku. Di checkout ia terisi
otomatis.

`voucher_redemptions` (0 baris, jadi nol risiko migrasi) diperluas jadi model dua
tahap dalam **satu** tabel: `claimed_at` (saat diklaim) dan `redeemed_at` (saat
order-nya lunas). `UNIQUE(auth_user_id, voucher_code)` yang sudah ada persis
menegakkan "sekali per akun".

⚠️ **Satu tabel, bukan dua.** Dua tabel yang sama-sama menjawab "akun ini sudah
pakai kode ini?" adalah persis bentuk penyimpangan yang berulang kali memakan waktu
di repo ini.

`useIlkomunyBlocked` digeneralisasi jadi `useVoucherClaim(code)` — hari ini ia
hardcoded ke satu kode dan sudah dipasang di empat komponen sekaligus.

### Fase 4 — Nyalakan kenaikannya

Ubah **satu konstanta** (`AD_RATE_CHANGE_AT` + angka tangga barunya), lalu umumkan
dengan tanggal efektif.

---

## Kenapa urutannya begini

Keputusan no. 6 (JFUSUHUD dibiarkan mati) menciptakan jeda tanpa voucher. Urutan di
atas membuat jeda itu **jinak**: kenaikan harga baru menyala di Fase 4, sementara
halaman klaim sudah tayang di Fase 3. **Tidak ada satu momen pun di mana peneliti
menghadapi tarif baru tanpa jalan keluar** — yang mereka rasakan selama jeda hanyalah
hilangnya diskon 10%, di atas tarif lama.

Fase 1 sengaja no-op supaya perubahan paling berisiko (tarif menyentuh 80 order yang
belum bayar) sudah tayang dan terbukti jauh sebelum satu rupiah pun berpindah.

---

## Verifikasi

- `npm test` (vitest) — `voucher-validity.spec.ts` & `create-payment-select.spec.ts`
  adalah jaring pengaman utamanya. Keduanya sudah menguji sambungan klien↔server.
- Spec baru bergaya `create-payment-select.spec.ts` untuk tangga ber-tanggal:
  order lahir sebelum `AD_RATE_CHANGE_AT` yang dibayar sesudahnya **wajib** ditagih
  tarif lama.
- Adu ulang ke produksi: ke-80 order approved-belum-bayar harus menghasilkan
  `total_cost` yang **tidak berubah** sesudah Fase 1 & Fase 4.
- Klik manual: klaim voucher → order baru → bayar → cek `voucher_redemptions`
  terisi dan klaim kedua ditolak.

## Yang sengaja DI LUAR cakupan

- **CRUD voucher di dashboard admin.** Sesudah Fase 2 voucher adalah baris tabel, jadi
  menerbitkan kode = satu `INSERT`. CRUD-nya berguna, tapi keputusan no. 3 memilih
  klaim self-serve, bukan penerbitan batch per kampanye. **Perlu diputuskan terpisah.**
- **Membersihkan 39% isian `voucher_code` yang ngawur.** Akarnya di `MultiStepForm`/
  `StepCheckout` yang menerima teks apa pun. Layak dibereskan saat Fase 2 menyentuh
  jalur yang sama, tapi bukan bagian kenaikan harga.
- **Menghidupkan lagi 12 kode ambassador.** Praktis mati; keputusan bisnis, bukan teknis.
