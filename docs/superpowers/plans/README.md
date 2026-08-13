# Rencana implementasi — indeks

Folder ini berisi rencana implementasi yang ditulis sebelum eksekusi. Sebagian sudah
selesai dan disimpan sebagai catatan sejarah; sebagian belum dijalankan sama sekali.

**Diperbarui 2026-08-13.**

> Rencana **bukan** status berjalan. Untuk "di mana posisi kita sekarang", baca
> [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md) — itu titik masuk resmi
> pekerjaan Jadwal Iklan dan selalu lebih mutakhir dari file mana pun di sini.

> ⚠️ Satu rencana di sini **bukan** bagian Jadwal Iklan:
> [webhook DOKU](2026-08-10-doku-webhook-silent-failure.md) lahir dari insiden pembayaran dan
> berdiri sendiri. Ia mengambil `sql/54` supaya tidak menggeser nomor `50`–`53` yang sudah
> diklaim `reward_pools`/Task 11/Task 13.

> ⚠️ `sql/55` juga **tidak** punya dokumen rencana di folder ini — perbaikan langsung dari
> sesi chat 2026-08-13, bukan rencana pra-tulis. Ia mengubah `ensure_survey_page()` (Phase 1,
> `sql/40`/`42`): `display_order` iklan auto-publish kembali `NULL` saat dibuat, bukan
> `MAX+1`, supaya iklan baru tidak tenggelam ke bawah list hanya karena masih pakai banner
> default. Guard Kilat `sql/42` tidak disentuh. **Committed di kode
> ([`multi-step-form/sql/55_auto_page_display_order_neutral.sql`](../../../multi-step-form/sql/55_auto_page_display_order_neutral.sql))
> dan sudah diterapkan ke database produksi 2026-08-13, terverifikasi.** Detail lengkap ada
> di [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md), bagian "00C".

## Daftar rencana

| Rencana | Status | Ringkas |
|---|---|---|
| [2026-08-10-doku-webhook-silent-failure](2026-08-10-doku-webhook-silent-failure.md) | ✅ **kode selesai & teruji lokal 2026-08-10** · ⛔ **`sql/54` belum diterapkan, belum di-deploy** | Webhook DOKU dulu balas 200 walau tulis DB gagal — pembayaran hilang diam-diam (insiden Nur Fitriana, Rp 499.500). Sebabnya semua `fetch` ke PostgREST tidak memeriksa `res.ok`. Sekarang: `sbFetch` + cek jumlah baris berubah, kunci service-role fail-closed, balas 500 supaya DOKU retry (dibatasi 5x), jejak permanen di `doku_webhook_events` (`sql/54`), email admin, banner di halaman Keuangan. **Cloudflare Observability TIDAK tersedia untuk Pages** — itu sebabnya loggingnya di Supabase. **Jalur uang — rilis sendiri; terapkan `sql/54` SEBELUM deploy** |
| [2026-08-09-order-flow-reorder](2026-08-09-order-flow-reorder.md) | ✅ **committed di branch 2026-08-10, belum di-merge** · 🔴 **`sql/48` sudah jalan di prod & sedang membakar email** | Wizard order user dibalik: Detail → Ringkasan → Jadwal & Bayar (dulu Jadwal sebelum Review); layar jadwal+countdown digabung, kedaluwarsa pulih di tempat; P0 kebocoran data anon (`sql/47`); dua email transisi via pg_cron/pg_net (`sql/48`). Verifikasi 6 skenario baru lewat code-trace, klik manual di browser masih PR. **Baca kotak koreksi 2026-08-10 di kepalanya** — tiga hal menyimpang dari badan dokumen |
| [2026-08-09-task-13-tagihan-fleksibel-per-jadwal](2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md) | ⬜ **disetujui; terkunci di belakang Task 11** | Satu jadwal boleh punya **beberapa invoice** — tagihan susulan jadi piutang yang terlihat dan tidak pernah menghentikan iklan yang sedang tayang. Plus **batal reservasi per jadwal** (status `cancelled` sudah ada di DB, tinggal dipakai) dan **Extra Ad jadi sifat jadwal**, bukan sifat order. **Jalur uang — rilis sendiri.** Butuh `schedule_id` dari Task 11 langkah 1b |
| [2026-08-08-task-11-ad-schedules-otoritatif](2026-08-08-task-11-ad-schedules-otoritatif.md) | ⬜ **disetujui; kini terkunci HANYA oleh merge + deploy** | `ad_schedules` jadi otoritatif; `form_submissions_extend` jadi view lalu pensiun. Menambah `booking_id` (kode jadwal yang dikutip peneliti) dan `schedule_id` di invoices/transactions. **Jalur uang — rilis sendiri.** Menyusut 2026-08-08: langkah 3 kehilangan dua pemanggil, langkah 5 tinggal identifier |
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
[1] merge feat/dashboard-soft-dna-navbar → main → DEPLOY
      isinya: revamp visual + Phase 2 Task 9 & 12(copy) + Phase 3 penuh
              + reorder flow order user (2026-08-09-order-flow-reorder, ✅ 2026-08-10)
              + P0 kebocoran data anon (sql/47) + email transisi (sql/48, pg_cron/pg_net)
      gerbang: adu visual di browser · cron_activate_extends() diawasi
               · 6 skenario order-flow diklik manual (baru diverifikasi via code-trace)
      🔴 DEPLOY INI SEKARANG PUNYA TENGGAT, bukan cuma antrean. sql/47+48 sudah
         jalan di prod tanpa kodenya; cron notify-primary-ads-live MEMBAKAR
         penanda live_notified_at tiap 15 menit (3 order sudah hilang emailnya,
         405 = route belum ada). Rem cron-nya atau deploy — progress doc §00A.
      ⛔ DITAHAN 2026-08-09 — pemilik produk masih memeriksa beberapa hal
         sebelum merge. Jangan merge tanpa aba-aba eksplisit.
      sesudah deploy: net._http_response harus 200 (bukan 405/401), lalu
         pulihkan live_notified_at 3 order terbakar — §00A
[2] Task 11        branch baru dari main · JALUR UANG, rilis sendiri
[3] Task 13        tagihan fleksibel per jadwal · JALUR UANG, rilis sendiri
[4] Phase 4        setelah keputusan pool hadiah turun
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
