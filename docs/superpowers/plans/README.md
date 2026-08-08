# Rencana implementasi — indeks

Folder ini berisi rencana implementasi yang ditulis sebelum eksekusi. Sebagian sudah
selesai dan disimpan sebagai catatan sejarah; sebagian belum dijalankan sama sekali.

**Diperbarui 2026-08-08.**

> Rencana **bukan** status berjalan. Untuk "di mana posisi kita sekarang", baca
> [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md) — itu titik masuk resmi
> pekerjaan Jadwal Iklan dan selalu lebih mutakhir dari file mana pun di sini.

## Daftar rencana

| Rencana | Status | Ringkas |
|---|---|---|
| [2026-08-08-task-11-ad-schedules-otoritatif](2026-08-08-task-11-ad-schedules-otoritatif.md) | ⬜ **disetujui; kini terkunci HANYA oleh merge + deploy** | `ad_schedules` jadi otoritatif; `form_submissions_extend` jadi view lalu pensiun. Menambah `booking_id` (kode jadwal yang dikutip peneliti) dan `schedule_id` di invoices/transactions. **Jalur uang — rilis sendiri.** Menyusut 2026-08-08: langkah 3 kehilangan dua pemanggil, langkah 5 tinggal identifier |
| [2026-08-05-phase-3-jadwal-iklan-terpadu](2026-08-05-phase-3-jadwal-iklan-terpadu.md) | ✅ **selesai di branch — sisa: adu visual + deploy** | Judulnya sudah basi (baca kotak koreksi di kepalanya). Task 9A+9B ✅, papan Schedule bertab ✅, drawer digabung ✅, Page Calendar pensiun ✅ |
| [2026-08-03-jadwal-iklan-redesign](2026-08-03-jadwal-iklan-redesign.md) | 🟡 **tinggal Task 10 & 11** | Rencana Phase 2 lengkap. Task 8/8B-1/8C/8D live; 9 ✅ dan 12 🟡 selesai di branch, belum tayang |
| [2026-08-03-phase-0-test-checklist](2026-08-03-phase-0-test-checklist.md) | ⬜ **belum dijalankan** | Checklist uji manual pasca-deploy Phase 0. §2/§3/§5 wajib. Tidak memblokir apa pun, tapi belum pernah dijalankan |
| [2026-07-30-design-system-dashboard](2026-07-30-design-system-dashboard.md) | ⬜ **belum dieksekusi** | Design-token system terpusat + perbaikan cascade `styles.css` legacy. Masih berlaku penuh |
| [2026-07-06-customer-identity-from-auth](2026-07-06-customer-identity-from-auth.md) | ✅ selesai 2026-07-06 | Satu akun auth = satu customer; `sql/27`+`sql/28` diterapkan |
| [2026-07-04-finance-page-revamp](2026-07-04-finance-page-revamp.md) | ✅ selesai 2026-07-06 | Halaman Transactions jadi "Keuangan" |
| [2026-07-03-submissions-visual-refresh](2026-07-03-submissions-visual-refresh.md) | ✅ selesai 2026-07-06 | Refresh visual halaman Submissions admin |

## Urutan rilis yang berlaku (diputuskan 2026-08-08)

**Deploy sekarang → Task 11 → Phase 4.** Bukan satu deploy besar sesudah Phase 4.

```
[1] merge feat/dashboard-soft-dna-navbar → main → DEPLOY
      isinya: revamp visual + Phase 2 Task 9 & 12(copy) + Phase 3 penuh
      gerbang: adu visual di browser · cron_activate_extends() diawasi
[2] Task 11        branch baru dari main · JALUR UANG, rilis sendiri
[3] Phase 4        setelah keputusan pool hadiah turun
```

Tiga alasan, dan yang ketiga yang menentukan:

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
