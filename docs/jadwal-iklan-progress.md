# Jadwal Iklan — Status Berjalan

> **Titik masuk untuk pekerjaan Jadwal Iklan.** Baca ini dulu sebelum membuka
> rencana mana pun. Diperbarui 2026-08-18.
>
> ✅ **Rilis Soft DNA sudah tayang (2026-08-18).** Penahanan 2026-08-09 dicabut,
> `feat/dashboard-soft-dna-navbar` di-merge (`f217d58`), dipush, dan dideploy.
> Endpoint `/api/notify-ad-live` **terbukti tayang** — probe POST tanpa kunci
> membalas `401` (gerbang menolak), bukan `405` (route hilang) seperti 10 Agustus.
>
> 🟢 **JALUR EMAIL HIDUP LAGI — Brevo, 2026-08-18 23.28 WIB.** Rantainya
> dibuktikan berurutan, bukan diasumsikan: probe body `{}` → **400
> `Missing email`** (lolos gerbang rahasia DAN lolos cek konfigurasi — inilah
> yang kemarin 500), lalu kiriman uji ke `product@jakpat.net` → **200
> `{"provider":"brevo"}`** dengan message-id `smtp-relay.mailin.fr`. Cron
> `notify-primary-ads-live` dijadwalkan ulang (`jobid 4`, `*/15`). **4 order**
> akan menerima email pada siklus pertama; 526 kandidat lain jendelanya sudah
> lewat dan dilewati selamanya (kerugian 10 Agustus, tak terpulihkan).
> Rinciannya di §00A.
>
> 🟢 **Task 11 Deploy A SUDAH TAYANG (2026-08-18).** `sql/51` hijau di
> produksi; `booking_id` (1016 baris, nol NULL) dan "Tandai Lunas" per jadwal
> di-merge ke `main` lewat fast-forward bersih, dipush, dan dideploy.
> Menemukan satu regresi yang memblokir Deploy B — lihat §00J.
>
> 🟢 **Uji browser "Tandai Lunas" (2026-08-19) MENEMUKAN DUA BUG UANG
> TERSEMBUNYI, keduanya ditutup — lihat §00L.** `invoices` tidak punya kolom
> `payment_method` (400 sejak `sql/51` tayang), dan yang lebih besar:
> `transactions` **tidak pernah bisa di-UPDATE dari browser** karena RLS-nya
> tidak pernah punya policy `UPDATE` — sudah begitu jauh sebelum Task 11,
> berlaku untuk setiap tulisan status transaksi dari dashboard admin.
> Ditambal `sql/59` + backfill 6 baris. **Diuji di browser 2026-08-19 —
> "Tandai Lunas" & "Tandai belum lunas" dua-duanya hijau, Booking ID
> dikonfirmasi sama di dua sisi.**
>
> 🟢 **Search bar papan Schedule ternyata tidak mengenal Booking ID — ditutup
> 2026-08-19, lihat §00M.** Logikanya sempat digandakan dua tempat (daftar
> tersaring vs hitungan pil), sekarang satu fungsi (`matchesQuery()`) untuk
> keduanya. Sekalian: tombol salin Booking ID ditambahkan di tabel
> `ScheduleAgenda.tsx`. Pencarian tiga bentuk di tabel Submissions (§00K)
> sudah diuji dan hijau.
>
> 🟢 **TASK 11 SELESAI — DEPLOY B MENDARAT 2026-08-19 (`sql/52`), lihat §00N.**
> `form_submissions_extend` kini VIEW di atas `ad_schedules`; `ad_schedules`
> resmi otoritatif untuk jadwal ke-2 dst. Sidik jari 21 kolom × 15 baris
> **identik sebelum & sesudah**, dan sudah dibuktikan cocok SEBELUM `DROP TABLE`
> dijalankan. RLS sekalian diperketat (`security_invoker = true`) atas keputusan
> pemilik produk. ⚠️ Tiga jebakan ditemukan & ditutup — yang terpenting: **view
> baru mewarisi hak penuh untuk `anon` dari default privileges Supabase**, dan
> **pengetatan RLS diam-diam merusak kuota slot**. Rinciannya di §00N; jangan
> mengulang tabel serupa tanpa membacanya.
> ✅ **Sudah diuji di browser & dideploy 2026-08-19.** Kalender slot admin dan
> peneliti kini cocok — itu buktinya RPC `get_extend_slot_occupancy()` bekerja
> dari sisi non-admin.
>
> 🟢 **TASK 13 RILIS 1 SELESAI DI KODE — `sql/53` DITERAPKAN, lihat §00O.**
> Uang per jadwal jadi agregat tagihan; `hasEverPaid` dibuang dari jalur
> per-jadwal. Tiga premis rencana Task 13 batal saat diukur — yang terpenting:
> **membaca `invoices` saja akan menghapus Rp 44.759.000 dari layar**, dan
> **percobaan bayar TIDAK berbagi `payment_id`** (satu jadwal punya 29
> `payment_id` berbeda senilai Rp 9,8 juta untuk harga Rp 350.000). Piutang
> total turun Rp 1.106.009.261 → Rp 21.922.163. Fitur **"Batalkan tagihan"**
> ditambahkan atas permintaan pemilik produk, di luar cakupan rencana asli.
> ⬜ Belum diuji di browser, belum dideploy.

**Tujuan besar:** satu baris = satu jendela tayang, **termasuk jadwal pertama**.
Sekarang jadwal pertama hidup di `form_submissions` dan jadwal ke-2 dst. di
`form_submissions_extend` — dua tabel dengan tipe waktu, kosakata status, dan
aturan waktu berbeda. Itu akar bersama dari bug-bug yang selama ini ditambal
sendiri-sendiri. Setelah `ad_schedules` jadi satu-satunya sumber, admin dan user
membaca baris yang sama.

---

## Ringkasan cepat

| Fase | Isi | DB | Frontend |
|---|---|---|---|
| Phase 0 | Cabut gerbang banner, hitung perpanjangan di kuota slot, larang jadwal tumpang tindih | ✅ `sql/36`–`39` | ✅ deployed 2026-08-04 |
| Phase 1 | Auto-create + auto-publish halaman iklan dengan banner default | ✅ `sql/40` (+ `sql/42`: Kilat dikecualikan) | ✅ deployed 2026-08-04 |
| Kilat | Jembatan admin iklan→Kilat + slot 08/11/14/17 WIB hari kerja | ✅ `sql/42` | ✅ deployed 2026-08-04 |
| Kilat — papan jadwal | Toggle Iklan/Kilat di Ads Schedule + tutup lubang Create Page utk Kilat | — | ✅ deployed 2026-08-05 (`a4fc499`+`b78a7aa`) |
| Phase 1B | Pemberitahuan weekend/hari libur di jalur review manual | — | ⬜ backlog, tidak memblokir |
| **Phase 2** | **Satukan model jadwal ke `ad_schedules`** | 🟡 Task 8 ✅ · 8B-1 ✅ · 8C ✅ · 8D ✅ · **9A ✅ `sql/46`** | 🟡 **9B ✅ · 12 ✅ (copy)** — sisa Task 10 & 11 |
| **Phase 3** | **Papan "Schedule" di dashboard admin** | ✅ `sql/46` | 🟡 **papan sudah jalan**; sisa: adu visual dengan Page Calendar lalu pensiunkan yang lama |
| Phase 4 | Tombol "Jadwalkan Iklan Lagi" aktif di dashboard user | ⬜ | 🔓 **TERBUKA & jadi pekerjaan berikutnya** — Task 13 sudah tayang 2026-08-19, harga per jadwal tersedia. ⚠️ Prasyarat `reward_pools` (8B-2, `sql/50`) **belum ada di mana pun** — diperiksa 2026-08-19: tabelnya NULL di produksi dan berkas `sql/50` belum pernah ditulis |
| **Task 13** | **Tagihan fleksibel per jadwal** (multi-invoice, batal per jadwal, Extra Ad jadi sifat jadwal) | ✅ `sql/53`·`60`·`62`·`63`·`64` diterapkan & diverifikasi | ✅ selesai di branch 2026-08-19 · ⬜ **belum dideploy**, dashboard peneliti **belum diuji manual** |

🔴 **DB SEDANG MENDAHULUI KODE — dan salah satunya membakar email tiap 15 menit.**
Baca §00A sebelum melakukan apa pun. `sql/47` dan `sql/48` **sudah diterapkan ke
produksi 2026-08-10**, tapi kode yang menemaninya masih tertahan di branch. Ini
persis keadaan yang dokumen ini sebut "paling rawan di seluruh papan" (§Task 8C),
dan kali ini ia **tidak diam** — cron `notify-primary-ads-live` menandai order
sebagai "sudah dinotifikasi" padahal endpoint-nya belum ada, jadi setiap order
yang mulai tayang sebelum deploy kehilangan emailnya secara permanen.

**Kalau kamu kembali setelah lama:** per 2026-08-05 `main` sudah di-deploy dan
DB serta kode sempat sejajar — tidak ada lubang di deret `sql/`. Yang tayang
memuat Phase 0/1, jembatan + papan jadwal Kilat, Task 8B-1, 8C, dan 8D.
**Kesejajaran itu putus lagi 2026-08-10** oleh `sql/47`+`48` (lihat §00A).

Sisa Phase 2 tinggal **Task 9–12**, dan sejak 2026-08-05 sore semuanya **sudah
bisa jalan**: `feat/dashboard-soft-dna-navbar` sudah menarik `main`, jadi branch
itu tidak lagi menahan apa pun. Pekerjaan Task 9–12 dan Phase 3 berlangsung DI
branch itu. Lihat §2.

⚠️ **`sql/40` dan `sql/42` mendefinisikan `ensure_survey_page()` yang sama.**
`sql/42` versinya yang benar (order Kilat tidak dapat halaman iklan). Kalau
`sql/40` dijalankan ulang kapan pun, jalankan `sql/42` lagi sesudahnya.

---

## Yang menunggu tindakan

### 00J. 🟢 `sql/49` diam-diam membatalkan perbaikan `sql/46` — ditemukan & diperbaiki 2026-08-18

**Ini yang paling penting dibawa ke migrasi berikutnya**, karena mekanismenya akan
terulang: dua migrasi `CREATE OR REPLACE` fungsi yang sama di berkas berbeda, dan git
**tidak** menganggapnya konflik. Yang terakhir dijalankan menang tanpa peringatan.

`sql/46` §3 membuang cabang `DELETE` dari `sync_ad_schedule_from_submission()` dan
menjadikan aturannya total: **satu order = satu baris ordinal 1, selalu**, dengan uji
paritas §7(1) `COUNT(*) WHERE ordinal=1` = `COUNT(*) FROM form_submissions`.

`sql/49` menulis ulang fungsi yang sama untuk menambah cabang jam kustom. Kepalanya
berbunyi *"SALINAN UTUH sql/46 (versi terakhir fungsi ini), dengan SATU cabang
tambahan"* — tapi badan yang disalin adalah badan **`sql/45`**, dan cabang `DELETE` ikut
terbawa. Niatnya tertulis benar; yang disalin salah.

| | |
|---|---|
| Terukur sebelum perbaikan | **1001 order, 986 baris ordinal 1** — 15 hilang |
| Lahir SESUDAH `sql/46` diterapkan | **10 dari 15**, tiga di antaranya 18 Agustus |
| Semuanya | `start_date IS NULL` — order yang belum dijadwalkan |

**Kenapa ini memblokir Deploy B.** Kepala `sql/46` sudah menuliskannya sepuluh hari
sebelum kejadian: *"admin yang mengosongkan tanggal diam-diam menghapus baris cermin.
Sesudah Task 11 — ketika `ad_schedules` jadi otoritatif — yang terhapus adalah jadwalnya
sendiri."* Dan jalurnya hidup: `releaseScheduleSlot()` ("Hapus dari list") **memang**
bekerja dengan mengosongkan tanggal. Sesudah `sql/52`, klik itu akan menghapus jadwal
beserta `booking_id` yang mungkin sudah dikutip peneliti ke support.

**Sudah diperbaiki** di `sql/51` bagian 0, diterapkan & diverifikasi: 1001 = 1001,
cabang `DELETE` hilang, sidik waktu **identik** sebelum/sesudah (nol jadwal bergeser),
dan uji hidup membuktikan mengosongkan tanggal kini mempertahankan baris **beserta**
`booking_id`-nya.

⚠️ **Gerbang untuk `sql/52`:** jalankan uji paritas `sql/46` §7(1) lebih dulu. Kalau
selisihnya bukan nol, jangan terapkan `sql/52`.

⚠️ **`sync_ad_schedule_from_extend()` tidak kena** — `DELETE` di sana ada di bawah
`TG_OP = 'DELETE'`, yaitu baris yang memang benar-benar dihapus. Itu benar; jangan ikut
"diperbaiki".

### 00K. 🟡 Task 11 Deploy A tayang 2026-08-18 — tersisa uji browser

`sql/51` + commit `eb336cf`/`7b3450a` sudah di produksi. Yang belum: **tidak
satu pun perubahan UI-nya pernah diklik.** Deploy A menyentuh jalur uang, jadi
daftar ini bukan formalitas.

**Terukur di DB sesudah deploy:**

| | |
|---|---|
| `ad_schedules` | **1016** baris, `booking_id` **nol NULL**, nol duplikat |
| `doku_webhook_events` | **1** baris — `sql/54` akhirnya terbukti (Rp 1.498.500, Mandiri VA, `outcome: ok`) |

**Tiga klik yang menunggu** — urut dari yang paling mahal kalau salah:

- [x] **"Tandai Lunas" pada jadwal ke-2** order berjadwal banyak → tagihan
      jadwal ke-1 **tidak ikut** berubah. Ini inti Deploy A; sebelum `sql/51`
      satu klik melunasi seluruh order. **Diuji 2026-08-19 — menemukan DUA bug
      uang yang tidak terlihat sebelumnya, keduanya ditutup. Baca §00L.**
- [x] **Booking ID sama di dua sisi** — kode yang dilihat peneliti di dashboard
      identik dengan yang dilihat admin di papan Schedule. Sebelumnya peneliti
      melihat `#E284351B` dan admin `#078e561b` untuk jadwal yang sama.
      **Dikonfirmasi user 2026-08-19.**
- [ ] **Pencarian admin (tabel Submissions) menerima tiga bentuk** — `booking_id`,
      id submission, id extend. ⚠️ Satu `booking_id` produksi juga cocok dengan
      `SHORT_ID_RE` (1 dari 1016), jadi hasilnya **digabung**, bukan dipilih
      salah satu. Belum diuji — jangan tertukar dengan pencarian papan Schedule
      di §00M, itu search bar yang BEDA dan sudah selesai.

⚠️ **Jangan turunkan tampilan dari `ordinal`.** `resync_ad_schedule_ordinals()`
menomori ulang begitu jadwal disisipkan dengan tanggal lebih awal — kode
turunan ordinal akan berpindah ke jadwal lain diam-diam. `booking_id` sekali
diberikan tidak pernah dihitung ulang; itulah gunanya.

⛔ **Deploy B menunggu dua hal:** daftar di atas hijau, **dan** uji paritas
`sql/46` §7(1) hijau satu siklus penuh.

### 00L. 🟢 Dua bug uang tersembunyi ditemukan saat uji "Tandai Lunas" — ditutup 2026-08-19

Mengklik item pertama checklist §00K (yang paling mahal kalau salah) langsung
menabrak `400` di konsol browser. Menelusurinya membuka DUA lapis bug, bukan
satu — dan lapis kedua jauh lebih tua dan lebih luas dari lapis pertama.

**Lapis 1 — `invoices` tidak punya kolom `payment_method`.**
`markScheduleAsPaid()` (baru, `sql/51`) dan `updatePaymentStatus()` (lama,
dropdown status di tabel Submissions) sama-sama menulis `{ status: 'paid',
payment_method: 'manual' }` ke `invoices` — padahal kolom itu **cuma ada di
`transactions`**. PostgREST menolak `42703` sebelum menyentuh satu baris pun.
Di `updatePaymentStatus()` errornya bahkan **tidak pernah diperiksa**, jadi
bug ini sudah lama gagal diam-diam setiap kali dropdown itu dipakai. Ditutup:
patch invoices/transactions dipisah sesuai skema masing-masing, mengikuti
pola yang sudah dipakai `functions/api/doku/webhook.js` (`status` + `paid_at`
untuk invoices, `payment_method`/`payment_channel` untuk transactions).

**Lapis 2 — `transactions` TIDAK PERNAH bisa di-UPDATE dari browser, sejak
RLS-nya ada.** Sesudah Lapis 1 ditutup, `invoices` berhasil jadi `paid` tapi
`transactions` pasangannya **tetap `pending`**. Sebabnya: `transactions` punya
RLS aktif (`relrowsecurity=true`) tapi **nol policy `UPDATE`** — cuma ada
`Admin/Users Insert Transactions` dan `Admin/Users Select Transactions`.
Bandingkan `invoices`, yang punya `Admin Update Invoices` sejak
`24_secure_invoices_rls.sql`. Tanpa policy UPDATE, RLS menolak default, dan
Supabase JS **tidak melempar error** saat itu terjadi — `.update()` tanpa
`.select()` cuma diam-diam kena 0 baris, tidak bisa dibedakan dari "memang
tidak ada yang cocok".

⚠️ **Dampaknya jauh lebih luas dari tombol "Tandai Lunas".** Setiap tulisan
`transactions.status` dari dashboard admin kena gerbang yang sama, sejak dulu:
`updatePaymentStatus()`, dan tiga titik lain di `supabase.ts` yang menandai
`'expired'` (`releaseScheduleSlot`, `prepareSubmissionForReschedule`,
`closePaymentLink`). Webhook DOKU tidak kena karena ia pakai `service_role`
(melewati RLS) — itu sebabnya jalur pembayaran normal kelihatan baik-baik saja
selama ini.

**Ditutup lewat `sql/59`:**

| Langkah | Hasil |
|---|---|
| Policy `Admin Update Transactions` | dipasang, bentuk identik `Admin Update Invoices` (`product@jakpat.net`) |
| Backfill anomali (`invoices.status='paid'` tapi `transactions.status` bukan `paid`/`completed`) | **6 baris**, tertua 2026-01-15 |
| Verifikasi ulang | **0** anomali tersisa |

⚠️ **Backfill dipasangkan lewat `payment_id`, BUKAN `schedule_id`.** Satu
jadwal bisa punya puluhan baris percobaan bayar gagal yang memang SAH tetap
`pending` selamanya (sampai 29 baris untuk satu jadwal, per audit Task 11).
Join lewat `schedule_id` awalnya menghitung ~60 "anomali" — hampir semuanya
percobaan gagal yang normal. `payment_id` adalah pasangan yang benar-benar
ditulis bersama oleh setiap alur pembayaran; join lewat situ menemukan angka
sebenarnya: 6.

**Fitur baru sebagai penutup lingkaran: tombol teks "Tandai belum lunas".**
Muncul di kartu jadwal HANYA kalau `payment.paymentChannel ===
'MANUAL_VERIFIED'` — satu-satunya nilai yang ditulis `markScheduleAsPaid()`
sendiri, tidak pernah oleh webhook DOKU. Sengaja lebih ketat dari `isManual`
(badge audit di kartu yang sama), yang juga bernilai true untuk `!payment`
(order dibayar di luar sistem, tidak ada apa pun untuk dibalik). Baliknya
`unmarkScheduleAsPaid()`, bukan tebakan — persis bentuk yang dipakai
`InvoiceForm.tsx` saat menerbitkan tagihan baru (`payment_status: 'pending',
submission_status: 'waiting_payment'`).

✅ **Diuji di browser 2026-08-19 — "Tandai Lunas" dan "Tandai belum lunas"
dua-duanya berjalan baik.** Bukan cuma tidak error: gerbang ketat
`payment_channel === 'MANUAL_VERIFIED'` terbukti bekerja seperti dirancang —
tombol undo muncul tepat untuk jadwal yang ditandai lunas manual, dan siklus
tandai→batalkan→tandai lagi tidak meninggalkan baris nyasar.

⚠️ **Tiga pelajaran yang berlaku untuk tabel RLS berikutnya, bukan cuma
`transactions`:**

1. **INSERT + SELECT ada bukan berarti UPDATE ada.** Cek eksplisit: `select
   cmd, count(*) from pg_policies where tablename='<tabel>' group by cmd` —
   kalau `UPDATE` tidak muncul di hasilnya, setiap tulisan dari browser ke
   tabel itu diam-diam tidak pernah terjadi.
2. **`.update()` tanpa `.select()` tidak melempar error saat RLS menyaring
   habis barisnya.** Untuk jalur uang, tambahkan `.select()` dan periksa
   panjang array-nya, atau terima risikonya secara sadar — jangan biarkan itu
   jadi kejutan yang ditemukan berbulan-bulan kemudian.
3. **Untuk mendeteksi anomali `invoices` vs `transactions`, pasangkan lewat
   `payment_id`, bukan `schedule_id`.** `schedule_id` mengumpulkan semua
   percobaan bayar (termasuk yang gagal dan SAH tetap `pending`);
   `payment_id` adalah pasangan tunggal yang benar-benar ditulis bersama.

### 00M. ✅ Search bar papan Schedule tidak mengenal Booking ID — ditutup, + salin ID di tabel (2026-08-19)

Ditemukan sesudah Booking ID dikonfirmasi sama di dua sisi (item checklist
§00K di atas): search bar di papan Schedule (`ScheduleBoardPage.tsx`) hanya
membaca `title`/`researcherName`. Bukan lubang kecil — **logikanya digandakan
dua kali** (sekali di `matchesFilter()` untuk daftar tersaring, sekali lagi
inline di `chipCounts` untuk angka pil), dan kedua salinan sama-sama tidak
menyebut `bookingId`. Persis pola yang sudah dua kali membakar sesi ini
(`sync_ad_schedule_from_submission` vs `sql/49`, lalu invoices vs transactions):
dua tempat menulis aturan yang sama tanpa satu sumber, salah satunya
tertinggal.

Ditutup dengan **satu** fungsi (`matchesQuery()`, baru di `scheduleModel.ts`)
yang dipakai kedua tempat — bukan menambal masing-masing salinan. Ia juga
membuang awalan `#` sebelum membandingkan, supaya admin yang menempel
`#K3M9PQ7T` langsung dari kartu jadwal tetap dapat hasil (`bookingId` sendiri
tidak pernah menyimpan `#`).

**Sekalian:** tombol salin (ikon `Copy`) ditambahkan di kolom ID
`ScheduleAgenda.tsx` — sebelumnya Booking ID cuma bisa dibaca, tidak bisa
disalin langsung dari tabel. `stopPropagation()` dipasang di tombolnya karena
seluruh baris punya `onClick` sendiri (buka drawer); tanpa itu menyalin ID
juga ikut membuka drawer.

⬜ **Belum diuji di browser** — cek: ketik Booking ID (dengan/tanpa `#`) di
search bar papan Schedule → jadwalnya muncul; klik ikon salin di tabel →
toast "Booking ID disalin!" dan clipboard berisi kode TANPA `#`, drawer TIDAK
ikut terbuka.

### 00N. 🟢 DEPLOY B SELESAI — `form_submissions_extend` kini VIEW (`sql/52`, 2026-08-19)

**`ad_schedules` resmi otoritatif untuk jadwal ke-2 dst.** Tabel
`form_submissions_extend` sudah tidak ada; namanya kini view di atas
`ad_schedules`, ditulis lewat tiga trigger `INSTEAD OF`.

**Cara derisking-nya — pola yang layak diulang:** sidik jari 21 kolom × 15
baris diukur DUA KALI *sebelum* apa pun dihapus — sekali dari tabel, sekali
dari SELECT yang persis akan jadi badan view-nya. Keduanya
`1798a75e9750611d14178e45be2387ef`. Jadi bentuk view-nya sudah **terbukti**,
bukan diharapkan, sebelum `DROP TABLE` dijalankan. Sesudah migrasi + seluruh
uji tulis + pembersihan, sidik jarinya **tetap** angka yang sama.

| Verifikasi | Hasil |
|---|---|
| Sidik jari sebelum vs sesudah | **identik** (`1798a75e…`) |
| Tipe kolom (`total_cost` tetap `integer`) | ✅ cast `::INTEGER` bekerja |
| `cron_activate_extends()` | bersih, **0** status bergeser |
| INSERT lewat view | ordinal **4** (resync jalan), `booking_id` terbit, `period_batch` terisi |
| Rentang beririsan | **ditolak**, pesan sama persis seperti dulu |
| Kolom uang: non-admin / admin | **ditolak** / **lolos** |
| Tulisan cermin ordinal 1 sbg non-admin | **lolos** — prinsip `sql/41` terjaga |
| DELETE lewat view + paritas | bersih, `0` / `0` |
| `get_batch_rewards_bulk` | utuh, termasuk batch dari jadwal ke-2 |

**Keputusan pemilik produk: RLS DIPERKETAT** (`security_invoker = true`).
Dulu `authenticated` bisa baca-tulis extend SIAPA PUN (`qual = true`); kini
bacaan tunduk RLS `ad_schedules` — peneliti hanya jadwalnya sendiri, admin
semua. Tulisan ikut menyempit: sebelum `INSTEAD OF` menyala, Postgres
meng-SELECT baris untuk membentuk OLD, dan SELECT itu berjalan sebagai
pemanggil.

⚠️ **TIGA JEBAKAN YANG DITEMUKAN SAAT MENGERJAKAN — semuanya sudah ditutup,
dan semuanya akan terulang di tabel berikutnya kalau tidak dibaca:**

1. **`anon` mewarisi hak penuh atas view baru, tanpa satu baris GRANT pun.**
   Supabase memasang `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon`
   di skema `public`. Terukur langsung setelah `CREATE VIEW`: `anon` punya
   **7 privilege** termasuk INSERT/UPDATE/DELETE. Bacaannya memang tetap
   kosong (RLS), **tapi tulisannya lolos** — `INSTEAD OF`-nya `SECURITY
   DEFINER`, jadi menulis sebagai `postgres` dan melewati RLS. Di tabel lama
   lubang ini tertutup karena tulisan `anon` dihadang RLS langsung.
   **Tidak memberi grant TIDAK CUKUP; harus `REVOKE ALL … FROM anon`.**

2. **Memperketat RLS diam-diam merusak kuota slot.** `fetchSlotAvailability()`
   menghitung kuota 2-iklan-per-hari dan HARUS melihat jadwal semua orang.
   Dengan view yang tunduk RLS, peneliti cuma melihat miliknya sendiri →
   tanggal penuh tampak kosong → kuota tertembus. **Bugnya senyap:** tidak ada
   error, cuma angka yang salah. Ditutup dengan RPC `get_extend_slot_occupancy()`
   (SECURITY DEFINER, hanya memapar kolom yang dibutuhkan kalender).
   *Catatan konsistensi:* `form_submissions` sendiri sudah terbuka untuk semua
   pengguna login — policy **"User View Own Submissions" ber-`qual = true`**,
   namanya menyesatkan. Pengetatan menyeluruh adalah pekerjaan tersendiri.

3. **`assert_no_schedule_overlap()` tidak bisa dipindah apa adanya.** Ia
   bercabang di `TG_TABLE_NAME` dan membaca `NEW.submission_status`/`NEW.id` —
   nama kolom yang tidak ada di `ad_schedules` (`status`, `source_id`).
   Intinya dipecah jadi `assert_schedule_window_free()`, dipanggil dua pihak,
   **bukan disalin dua kali**. `guard_extend_payment_columns()` sebaliknya
   BISA dipindah apa adanya (keempat kolomnya bernama sama), tapi wajib
   dipagari `source_table` supaya tidak menjatuhkan cermin ordinal 1.

**Rollback** tersedia: `form_submissions_extend_legacy` (15 baris) masih ada,
**kini di skema `backup`, bukan `public`** (dipindah `sql/61` — lihat di bawah).
⚠️ Baris yang lahir SESUDAH `sql/52` hanya ada di `ad_schedules` — salin manual
dulu kalau benar-benar harus mundur. Boleh dibuang setelah satu siklus rilis
tenang.

✅ **Diuji di browser & dideploy 2026-08-19.** Ketiga klik wajib hijau:
"Jadwal Iklan Baru" (INSERT lewat view), ubah tagihan di `InvoiceForm` sebagai
admin, dan alur pesan tanggal sebagai peneliti — kalender slot peneliti kini
**cocok dengan papan Schedule admin**, yang membuktikan RPC kuota bekerja dari
sisi non-admin.

**Keadaan terukur sesudah deploy (2026-08-19):**

| Pemeriksaan | Hasil |
|---|---|
| `ordinal = 1` vs `form_submissions` | **1001 / 1001** — paritas `sql/51` bertahan |
| `booking_id` NULL | **0** |
| `transactions` / `invoices` tanpa `schedule_id` | **0 / 0** — trigger penurun A2 masih menutup semua penulis |
| View vs `ad_schedules(source_table='form_submissions_extend')` | **15 / 15** |
| `form_submissions_extend_legacy` | 15 baris, masih ada (jalan pulang) — dipindah ke skema `backup` oleh `sql/61`, sidik jari tetap `1798a75e…` |
| `is_trigger_updatable/insertable/deletable` di view | **YES / YES / YES** — PostgREST menerima PATCH & POST, jadi jalur `webhook.js` STEP 5 sah |

🎉 **`sql/54` akhirnya terbukti.** `doku_webhook_events` yang sejak dibuat
selalu 0 baris kini berisi **1** — pembayaran produksi nyata Rp 1.498.500 lewat
VA Mandiri pada 2026-08-18 20:54 WIB (`http_status` 200, `outcome` `ok`,
`app_status` `completed`), yaitu **sesudah `sql/52` diterapkan**. Jadi alur uang
ujung-ke-ujung tetap utuh di atas view.

⬜ **Satu gerbang belum terbukti dengan uang sungguhan:** pembayaran itu
`entity_type='submission'` (ordinal 1). Cabang **extend** di
[`webhook.js:716`](../multi-step-form/functions/api/doku/webhook.js#L716) —
`PATCH form_submissions_extend?id=eq.…`, kini menembus `INSTEAD OF` — belum
pernah dilewati sejak view berdiri. Secara struktur aman (`service_role`
di-GRANT, view trigger-updatable), tapi **pantau baris `doku_webhook_events`
ber-`entity_type='extend'` yang pertama** alih-alih menganggapnya terbukti.

#### 🔴 Jebakan (1) punya KEMBARAN yang luput — ditutup `sql/61` (2026-08-19)

Security Advisor menyalakan **satu ERROR**: *RLS Disabled in Public →
`public.form_submissions_extend_legacy`*. Bukan tabel extend yang bocor —
view-nya justru terbukti aman (`anon` → `permission denied for view`). Yang
bocor adalah **snapshot jalan-pulang** yang dibuat bagian 1 `sql/52` sendiri.

Sebabnya jebakan (1) di atas, plus satu sifat yang belum tercatat di mana pun:

> **`CREATE TABLE ... AS SELECT` tidak mewarisi RLS maupun policy dari tabel
> sumbernya.** Snapshot lahir `relrowsecurity = false`, nol policy — padahal
> sumbernya punya empat policy. Lalu default privileges Supabase
> menempelkan tujuh privilege `anon` di atasnya, gratis.

Ironinya: REVOKE yang benar sudah ditulis di bagian 7 `sql/52`, untuk view-nya.
Bagian 1 ditulis **sebelum** temuan itu muncul dan tidak ikut disapu. Satu
migrasi bisa menutup sebuah lubang di satu paragraf dan membukanya di paragraf
lain — gerbangnya harus per-objek, bukan per-berkas.

**Terukur sebagai `anon` sebelum perbaikan** (di dalam transaksi yang
dibatalkan, jadi tidak ada data yang berubah):

| Uji sebagai `anon` | Sebelum | Sesudah `sql/61` |
|---|---|---|
| `SELECT` snapshot | **15 baris**, agregat `total_cost` 6.316.683 | `permission denied for schema backup` |
| `UPDATE` kolom uang | **15 baris tertulis** | idem — tak terjangkau |
| Lewat PostgREST | terekspos (`public` + anon key ada di bundel frontend) | skema `backup` di luar permukaan API |

Peredam yang kebetulan berlaku: `admin_notes` dan `voucher_code` NULL di
kelima belas baris, dan tidak ada nama/email di tabel ini. Tulisan `anon` juga
tidak menjalar ke data hidup (snapshot CTAS tidak punya trigger maupun FK) —
tapi ia bisa merusak jalan pulang `sql/52`.

**Kenapa pindah skema, bukan sekadar `ENABLE RLS`:** snapshot rollback tidak
punya alasan untuk terlihat dari API. Selama ia duduk di `public` ia akan
selalu diekspos PostgREST *dan* mewarisi default privilege `anon` setiap kali
dibuat ulang. Pindah mencabut kedua sifat itu di sumbernya. Terverifikasi
sebelum menerapkan: `pg_default_acl` untuk anon/authenticated **hanya**
terpasang di `public` — tidak ada entri lintas skema, jadi `backup` tidak
mewarisi jebakannya. RLS tetap dinyalakan sebagai sabuk kedua.

⚠️ **`backup` tidak boleh ditambahkan ke Exposed schemas** (Dashboard >
Settings > API). Seluruh perbaikan ini bergantung pada itu.

| Verifikasi `sql/61` | Hasil |
|---|---|
| Lokasi + RLS | `backup` / **true** |
| Sisa hak `anon` + `authenticated` | **0** |
| `USAGE` skema untuk anon/authenticated | **false / false** |
| Sidik jari 15 baris pasca-pindah | **`1798a75e9750611d14178e45be2387ef`** — identik dengan kepala `sql/52` |
| `public.form_submissions_extend` (view) | **15** — tak tersentuh |
| Security Advisor | **ERROR 0** (sisa: INFO `rls_enabled_no_policy`, memang yang dituju) |

**Aturan yang berlaku mulai sekarang:** snapshot/tabel jalan-pulang dibuat
**langsung di `backup`**, tidak pernah di `public`. Bentuk amannya sudah
ditempel di bagian 1 `sql/52` supaya tidak perlu diingat-ingat.

⬜ Snapshotnya sendiri **boleh di-DROP** setelah `sql/52` melewati satu siklus
rilis tenang; per 2026-08-19 baru sehari, jadi ditahan dulu.

### 00O. 🟢 TASK 13 RILIS 1 — uang per jadwal jadi jujur (`sql/53`, 2026-08-19)

**Satu jadwal boleh punya beberapa tagihan, dan kartunya berhenti berbohong.**
`hasEverPaid` (`.some(paid)`) dihapus dari jalur per-jadwal.

⚠️ **Ini bukan bug hipotetis — ia sudah salah hari ini.** Tagihan susulan sudah
terjadi di lapangan, dikerjakan manual, jauh sebelum fitur ini ada:

| Booking ID | Dibayar | `total_cost` |
|---|---|---|
| `76XKVW5P` | Rp 1.470.750 **lalu** Rp 61.050 | 1.470.750 |
| `43MG75Y5` | Rp 1.000.000 **lalu** Rp 500.000 | 1.900.000 |
| `F6WCSWJB` | Rp 1.276.500 **lalu** Rp 410.700 | 410.700 |

14 jadwal beruang sungguhan punya >1 invoice lunas, dan semuanya mengumumkan
"Lunas" walau bersisa.

**TIGA PREMIS RENCANA TASK 13 YANG BATAL SAAT DIUKUR** — semuanya tercatat
lengkap di kepala [`sql/53`](../multi-step-form/sql/53_schedule_billing.sql):

1. **"Sumber kebenaran uang = invoice" menghapus Rp 44.759.000.** 190 jadwal
   hanya punya `transactions`, 79 di antaranya lunas. 185 dari sebelum
   `create-payment.js` mulai menulis `invoices` (2026-07-01, commit `36ed0eb`);
   **5 sisanya bertanggal sesudah itu** karena kedua sisipan dijalankan lewat
   `Promise.all` dan kegagalannya hanya DICATAT — endpoint tetap balas 200.
   Jadi "tiap transaksi punya invoice" tidak pernah jadi invarian.
   → Keputusan pemilik produk: **gabungan, kunci `payment_id`**.

2. **Percobaan bayar TIDAK berbagi `payment_id`.** Rencana menyatakan
   sebaliknya. `3DNWE9PS` punya **29 `payment_id` berbeda** senilai Rp 9.800.000
   untuk jadwal berharga Rp 350.000 — tiap klik "bayar" menerbitkan nomor DOKU
   baru. Yang menahan penggelembungan bukan dedup, melainkan aturan bahwa
   **pending di `transactions` itu keranjang yang ditinggalkan, bukan tagihan**
   (121 peristiwa, Rp 1,08 miliar — 98% dari total).

3. **"Pending" ≠ "piutang".** 194 invoice pending menggantung, `expires_at`
   kosong di 194 dari 194. Aturan yang dipilih: sebuah pending berhenti jadi
   piutang kalau ada pembayaran lunas **yang lebih baru** di jadwal yang sama
   (tanda ia diterbitkan ulang). Faktual, bukan ambang umur yang dikarang —
   sengaja TIDAK memakai "pending tua = mati", karena antrean "perlu ditagih"
   masih memuat entri Maret–Juni yang sungguh ditagih.

**Hasilnya:** piutang total **Rp 1.106.009.261 → Rp 21.922.163**. Dua invarian
dijaga dan keduanya 0: nol jadwal ber-`outstanding` tanpa tagihan terbuka, nol
jadwal yang `paid`-nya melebihi `billed`.

**Fitur baru atas permintaan pemilik produk** (rencana asli menaruhnya di luar
cakupan): **"Batalkan tagihan"** per invoice. Sebelumnya tagihan yang salah
terbit tidak punya jalan keluar sama sekali — itulah asal 194 baris di atas.
Contoh yang langsung terbantu: **`V3M9285H` punya tagihan Rp 370.000 DAN
Rp 3.700.000 di hari yang sama** (satu nol kelebihan), dan `5FJ9J4Q6` punya
invoice kembar yang satu lunas satu menggantung. Barisnya **tidak dihapus**,
hanya dicoret — riwayat tagihan adalah catatan uang.

⚠️ **Membatalkan tagihan tidak mematikan link DOKU.** Kami tidak memanggil API
pembatalan DOKU, jadi VA yang sudah terbit masih bisa dibayar dari sisi bank.
Kalau uangnya sungguh masuk, webhook tetap mencatatnya dan tagihannya hidup
lagi sebagai lunas. **Itu disengaja** — uang yang benar-benar diterima harus
selalu menang atas status di layar.

**Keputusan teknis yang menyimpang dari rencana, dan alasannya:**

- **`SECURITY INVOKER`, bukan `DEFINER`.** Kebalikan `get_extend_slot_occupancy`
  (sql/52) yang DEFINER karena kuota slot harus melihat jadwal semua orang.
  Uang kebalikannya: hanya boleh terlihat pemiliknya, dan RLS
  `invoices`/`transactions` sudah mengerjakannya. DEFINER di sini akan membuka
  riwayat uang semua orang ke siapa pun yang bisa menebak satu UUID.
- **`hasEverPaid` di `InternalDashboard` SENGAJA dibiarkan `.some(paid)`.**
  Namanya sama, pertanyaannya beda: ia menjawab "adakah uang yang pernah
  masuk?" untuk hitung mundur slot di `CampaignActions`, bukan "sudah lunas?".
  Menyeragamkannya akan memunculkan "Expired" pada order yang lunas sebagian
  lalu melepas slot yang sudah dibayar. Alasannya ditulis di tempatnya.

Ikut ditutup: `create-payment.js` berhenti menimpa `total_cost` untuk jadwal
yang sudah pernah ditagih (temuan C rencana Task 13 — terverifikasi masih
hidup, lognya berbunyi *"Correcting DB to server value"*), dan voucher pindah
dari titipan JSON di `transactions.note` ke kolomnya sendiri.

⚠️ **Backfill voucher HANYA dari `note`, bukan dari `form_submissions`.** Kolom
`form_submissions.voucher_code` isian bebas peneliti: dari 131 baris terisi ada
`-`, `tidak ada`, `111111111111`, dan beberapa nomor telepon. Ia bukan kode
kupon tervalidasi.

Gerbang: `tsc -b --force` **61** (baseline), `npm run build` hijau, 25/25 uji.

🟢 **KELIMA UJI ADMIN HIJAU 2026-08-19.** Dibuka lewat search bar papan
Schedule — ia menerima Booking ID sejak §00M.

| # | Booking ID | Yang harus terlihat | Kenapa ini ujinya |
|---|---|---|---|
| 1 | ✅ **`76XKVW5P`** | **dua baris** tagihan, kepala **"Rp 1.531.800 ditagih"** | Kode lama memakai transaksi TERBARU sebagai nominal kartu, yaitu **Rp 61.050** — jadwal yang menerima Rp 1.531.800 tampil sebagai Rp 61.050. Jadwal ini **lunas penuh**, jadi ia memang tetap bilang "Lunas"; yang diuji **angkanya**, bukan labelnya |
| 2 | ✅ **`5FJ9J4Q6`** | **"Rp 2.880.000 ditagih · Rp 1.440.000 belum masuk"** | Inilah yang **berhenti** bilang "Lunas". `hasEverPaid` dulu bernilai true karena satu invoice-nya lunas, padahal Rp 1.440.000 masih menggantung |
| 3 | ✅ **`5FJ9J4Q6`** lagi | batalkan invoice yang menggantung → kartu balik **"Lunas"** | Ia punya **invoice kembar Rp 1.440.000 di hari yang sama**, satu lunas satu menggantung — kasus yang persis jadi alasan "Batalkan tagihan" ada |
| 4 | ✅ **`T25FVETF`** (atau `7F8CBKEF`, `RT4ZHEPN`) | Rp 2.525.000 **lunas** | **Uji REGRESI, bukan fitur baru.** Jadwal ini hanya punya `transactions`. Kode lama juga membacanya, jadi ia tidak pernah Rp 0 — tapi ia AKAN jadi Rp 0 kalau rencana Task 13 diterapkan harfiah (`invoices` saja). Kalau tampil Rp 0 atau "belum ada tagihan", itu bug |
| 5 | ✅ mana saja yang punya tagihan menggantung | **"Tagih Susulan" disabled** | Peneliti hanya melihat tagihan terakhir; tagihan kedua akan menyembunyikan yang pertama |

**Hasil uji 2/3/5 (2026-08-19, di produksi):** `a8e8233f-…` jadi `cancelled`,
daftar tetap **3 baris**, `billed` Rp 2.880.000 → Rp 1.440.000, `outstanding`
Rp 1.440.000 → **0**, `open_count` 1 → **0**. Piutang seluruh sistem
Rp 21.922.163 → Rp 20.482.163. Kedua invarian tetap **0/0**. Pasangan di
`transactions` ikut dibatalkan, jadi tidak ada baris yatim yang menghidupkan
tagihan itu lagi.

⚠️ **DUA BUG UI DITEMUKAN SAAT UJI INI — keduanya kelas yang sama: memakai
satu sinyal untuk dua pertanyaan.**

1. **Aksi ikut diredupkan bersama barisnya.** Gerbang aksi memakai `isStruck`,
   yang memuat `isLate` — jadi tagihan yang lewat batas bayar, **persis yang
   ingin dibatalkan admin**, tidak punya tombolnya sama sekali. Aksi kini
   dipecah per pertanyaan: `canPay` (hidup DAN belum lewat batas) vs
   `canCancel` (tagihan sungguhan, belum dibayar, belum mati — terlewat dan
   tersusul TETAP boleh).

2. **Coretan pada nominal dipakai untuk dua arti.** Baris `isLate` dicoret
   seolah tidak dihitung, sementara kepala kartu menuliskan angka yang sama
   sebagai "belum masuk". Sebabnya `isLate` diturunkan di KLIEN dari tanggal
   tayang, sedangkan `schedule_billing_summary` tidak tahu apa-apa soal itu —
   dan DB-lah yang benar, karena admin memang masih menagihnya di luar sistem.
   Aturannya kini satu: **coretan pada nominal = angka ini tidak ikut
   dihitung**; baris terlewat hanya diredupkan, dan labelnya dieja lengkap
   *"Batas bayar terlewat — masih dihitung piutang"*.

   Ikut diperbaiki: tautan aksi tidak lagi `text-slate-400` — warna yang sama
   dengan isi baris yang diredupkan, sehingga ia terbaca sebagai keterangan
   dan sempat dilaporkan "tidak ada" padahal sudah dirender.

⛔ **SATU PERMUKAAN BELUM DIUJI SAMA SEKALI: DASHBOARD PENELITI.**
[`StatusPage`](../multi-step-form/src/pages/dashboard/StatusPage.tsx) berubah
di rilis ini — peta pembayarannya dulu mengambil **transaksi pertama yang
kebetulan cocok** per `extend_id`; kini ia memanggil `schedule_billing_bulk`
dan menunjuk `openInvoice`. Peneliti tetap hanya melihat SATU tagihan
(keputusan pemilik produk), tapi sekarang tagihan yang benar.

Yang wajib diklik **sebagai peneliti**, bukan admin:

- order yang punya tagihan menggantung → tombol bayar menunjuk tagihan itu,
  bukan tagihan lama yang sudah lunas
- order lunas sebagian → **tidak** lagi tertulis "Lunas"
- order dengan jadwal ke-2 → tagihannya tidak tertukar dengan jadwal ke-1

⚠️ Ini permukaan yang dilihat pelanggan, dan satu-satunya bagian rilis ini
yang belum pernah disentuh manusia. Uji admin tidak mewakilinya: RLS-nya
berbeda, dan jalur datanya lain (`SchedulePaymentMap`, bukan `ScheduleBilling`
langsung).

**Catatan cakupan:** rencana menyebut `scheduleMoney.ts` menerima blok kedua
untuk `billed`/`paid`/`outstanding`. Blok itu akhirnya hidup di
`BillingSection` — satu tempat dengan daftarnya, bukan dua. `scheduleMoney.ts`
tetap murni soal HARGA. Hasilnya sama, tempatnya berbeda dari rencana.

### 00-slot. ✅ Kontrol pelepasan slot kembali ke admin (2026-08-10) — belum diuji di browser

**Nol migrasi SQL. Seluruhnya frontend**, jadi ia tidak menambah lubang DB-mendahului-kode.

**Yang ditemukan.** Tidak ada cron, edge function, maupun worker yang melepas slot —
tidak pernah ada. Aturan "hanya reservasi mandiri (`slot_booked_by = 'user'`) yang lepas
karena waktu" sudah dijaga di **tujuh** tempat (`holdsSlot`, `deriveLifecycle`,
`deriveOrderUiState`, `isExpiredHold`, `PaymentRetryPage`, `CampaignActions`,
`create-payment.js`). Yang **tidak** menjaganya cuma `PaymentCheckoutPage` — dan justru
halaman itu satu-satunya pemanggil `releaseExpiredSlot()`. Ia bocor dua kali: cutoff 14.00
ikut masuk `Math.min` sebagai tenggat pelepasan, dan cabang `else` menghapus SEKETIKA
setiap baris yang `slot_reserved_at`-nya NULL.

Terukur di produksi tepat sebelum perbaikan:

| Populasi | Jml |
|---|---|
| Jadwal **admin** belum lunas, hold 1 jam sudah lewat | **35** (6 tayang 10–13 Agu) |
| Baris tanpa `slot_booked_by` **dan** `slot_reserved_at` | **264** (35 punya transaksi pending) |
| Jadwal **user** belum lunas — yang aturan 1 jam memang untuk mereka | **3** |
| Kerusakan yang sudah terjadi sejak April | **9** (7 tanggal terhapus, **4 terdampar**) |
| Antrean "perlu ditagih" | **17** — dan **12 di antaranya bertanggal Maret–Juni** |

**Yang berubah.**

- [`utils/slotHold.ts`](../multi-step-form/src/utils/slotHold.ts) baru — satu tempat untuk
  aturan umur reservasi, dengan 12 uji. Batas 14.00 WIB **sengaja tidak** tinggal di sana:
  ia tidak melepas slot, ia hanya membuat tanggalnya tidak terkejar (niat yang sudah
  tertulis di `status/airingPeriods.ts` dan dulu dilanggar di `PaymentCheckoutPage`).
- `PaymentCheckoutPage` — jadwal admin tidak lagi punya hitung mundur maupun pelepasan;
  layar "batas bayar lewat" tetap **membuka pembayaran**, karena order seperti itu memang
  ditagih manual lalu dijadwalkan ulang. Sekalian ditutup: `payment_status = 'expired'`
  kini dikenali sesudah reload (`releaseExpiredSlot` mengosongkan `slot_booked_by`, jadi
  aturan hold sendirian akan bilang "tidak pernah lepas" untuk baris yang sudah lepas),
  dan `expiredAt` ke DOKU tidak lagi bisa jadi `Invalid Date`.
- `releaseScheduleSlot()` — pelepasan berlingkup **satu jadwal**, semua ordinal, transaksi
  pending disaring per jadwal. Dipakai aksi **"Hapus dari list"**.
- Badge **"perlu ditagih"** di kartu jadwal + pil papan Schedule berganti nama dari "lewat
  batas bayar". Baris antrean diurut **terbaru di atas** — tanpa itu, 12 tunggakan
  Maret–Juni mengubur 4 baris yang benar-benar bisa ditagih.

⚠️ **Ini fondasi Task 13 Langkah 3, dan dokumen Task 13 sudah dikoreksi** — langkah itu kini
**menggantikan** `releaseScheduleSlot`, bukan menulis fungsi kedua di sebelahnya. Yang
tersisa di sana: tukar penautan ke `schedule_id`, dan pertahankan tanggal alih-alih
mengosongkannya (keduanya butuh Task 11).

**Belum dikerjakan:** uji manual di browser (urutannya di rencana), dan keputusan atas **4
order terdampar** peninggalan kerusakan lama — sengaja tidak dipulihkan otomatis.

### 00P. 🟢 Balapan admin-vs-peneliti + "tagihan hidup" (`sql/60`, 2026-08-19)

**Keputusan pemilik produk: PENELITI YANG MENANG.** Saat pembayaran kedaluwarsa,
admin bisa menerbitkan tagihan ulang tepat ketika peneliti menjadwalkan ulang.
Slot adalah barang langkanya; tagihan cuma turunan dari jadwal. Menerbitkan ulang
tagihan gratis, mengembalikan uang tidak — dan sistem ini **tidak punya alur refund**.

**Dinilai saat DIBACA, bukan dikunci saat MENULIS.** Kunci optimistis (bandingkan
`updated_at` jadwal sebelum menyimpan) menutup urutan "peneliti dulu, admin
menyusul" tapi **tidak** menutup yang benar-benar bersamaan: tagihan yang mendarat
sesudah sapuan expiry tetap lolos dan bertahan hidup menunjuk jendela yang sudah
tidak ada — peneliti bisa **membayar penuh untuk slot yang sudah pindah**.
Menyimpan jendela yang DITAGIHKAN (`billed_start_date`) lalu membandingkannya saat
dibaca membuat pertanyaan "apakah tagihan ini masih berlaku?" **tidak punya jendela
balapan sama sekali**. Polanya sama dengan `is_superseded` di `sql/53`.

    is_stale = status BUKAN lunas
               AND billed_start_date IS NOT NULL
               AND ad_schedules.start_date IS NOT NULL
               AND billed_start_date <> ad_schedules.start_date

Dua pengecualian yang disengaja: **uang yang sudah masuk tidak pernah basi**, dan
**baris lama tidak pernah basi** (`billed_start_date` NULL = "tidak diketahui",
bukan "tidak cocok"). Membackfill dari `ad_schedules.start_date` hari ini akan
menyatakan 400+ tagihan lama sah selamanya ATAU membatalkan semuanya sekaligus,
tergantung arah tebakan.

⚠️ **`billed_start_date` punya DUA penulis dan keduanya wajib**: `InvoiceForm.tsx`
(tagihan manual admin) dan `create-payment.js` (swalayan peneliti). Melewatkan satu
membuat seluruh jalur itu kebal dari pemeriksaan.

Peneliti mendapat keterangannya sendiri — ia tidak tahu apa-apa soal balapan ini:
tanggal lama disebut (supaya cocok dengan email tagihan yang terlanjur diterima),
sebabnya dijelaskan, dan **"jangan bayar link lama"** dinyatakan eksplisit — itu
satu-satunya kalimat yang benar-benar mencegah kehilangan uang.

**Verifikasi sesudah diterapkan:** piutang tetap Rp 20.482.163, `stale_count` 0 di
semua jadwal (benar — semua baris lama NULL), kedua invarian 0, `anon` tidak bisa
EXECUTE. Nol pergerakan memang hasil yang diinginkan: migrasi ini memasang alatnya.
Disimulasikan di `5FJ9J4Q6` — menggeser jadwalnya membuat 2 dari 3 peristiwa basi
dan yang lunas tetap utuh.

#### 🔴 `sql/60` sempat tidak bisa dijalankan ulang — diperbaiki 2026-08-19

Versi pertama berkasnya hanya memuat `ALTER TABLE` lalu menulis *"definisi lengkap
ada di riwayat git commit ini"* — padahal DDL ketiga fungsinya **tidak ikut sama
sekali**. Produksi punya `is_stale`, repo tidak. Klon baru yang menjalankan `sql/53`
lalu `sql/60` mendapat fungsi versi `sql/53`, dan frontend yang membaca
`is_stale`/`stale_count` mati tanpa ada yang salah ketik. Definisi lengkapnya
sekarang ada di berkasnya, disalin verbatim dari `pg_get_functiondef` produksi.
**Migrasi harus bisa dijalankan ulang dari nol; komentar tidak bisa.**
(Belum dijalankan ulang ke produksi — produksi sudah memuatnya.)

#### 🟢 "Ada baris tagihan" bukan "ada tagihan hidup" — ditutup 2026-08-19

Dilaporkan dari lapangan: order `d696325a` menampilkan **dua jawaban berbeda untuk
satu pertanyaan**. Tab Info berkata *"Invoice tagihan sudah diterbitkan, menunggu
pelunasan"*; tab Jadwal & Bayar cuma menampilkan satu baris tercoret. Yang menyuruh
menunggu itu yang salah — tidak ada satu pun link yang masih bisa dibayar.

Sebabnya sama di kedua tempat, ditulis dua kali:

| Tempat | Ukuran lama | Ukuran benar |
|---|---|---|
| `lifecycle.ts` → banner Info | `paymentData.hasInvoices` | `paymentData.hasOpenInvoice` |
| `ScheduleCardList.cardStateOf` | `billing.invoices.length` | `billing.openInvoice` |

Keduanya menghitung **baris**, bukan tagihan yang hidup. Baris tagihan tidak pernah
dihapus, jadi begitu satu tagihan mati keduanya berbohong selamanya. Kartunya bahkan
sudah menampilkan **"Rp 0 ditagih"** di layar yang sama — dua pernyataan yang saling
membantah di satu kartu.

Yang lewat batas bayar **tetap** terhitung terbuka: itu piutang, bukan tagihan mati.

Terukur sebelum diubah: **1 order** di seluruh basis data yang semua tagihannya mati
tanpa uang masuk — persis yang dilaporkan. Di tingkat jadwal **101** jadwal berpindah
`waiting_payment` → `awaiting_invoice`; semuanya yang tagihan hidupnya cuma `pending`
di `transactions`, yaitu checkout yang ditinggalkan, dan kartunya memang sudah
menampilkan Rp 0 untuk mereka.

Kartu tanpa tagihan hidup juga berhenti menawarkan **"Tagih Susulan"** — tidak ada
tagihan pertama yang bisa disusuli — dan menawarkan **"Terbitkan Tagihan"** beserta
alasannya.

#### ❌ KOREKSI: "1 hari kerja vs 1 jam" BUKAN kontradiksi — 2026-08-19

Sempat dicatat di sini sebagai bug terbuka. **Salah, dan sudah diverifikasi salah.**
`calloutAwaitingInvoice` ("maksimal 1 hari kerja") hanya bisa tampil kalau
`awaitingInvoice` true, dan
[`deriveOrderUiState.ts:151`](multi-step-form/src/components/status/deriveOrderUiState.ts#L151)
mensintesis `/dashboard/payment/:id` untuk **setiap** order `slot_booked_by='user'`
di step 2. Jadi kartu ordinal 1 hanya sampai ke `awaiting_invoice` kalau slotnya
**dipesan admin** — dan slot admin tidak pernah lepas sendiri (`slotReleaseDeadline`
mengembalikan `null` kecuali `slotBookedBy === 'user'`). Janjinya ditepati.

Untuk jadwal ke-2 dst. copy-nya beda (`calloutAwaitingInvoiceSchedule`) dan tidak
menjanjikan waktu apa pun; terukur **0** jadwal ordinal >1 yang `slot_booked_by='user'`.

#### 🟢 Yang SUNGGUHAN berbohong: satu kalimat tenggat untuk tiga akibat — ditutup 2026-08-19

Ditemukan saat memverifikasi koreksi di atas. `booking.deadlineCause`
(`'slot' | 'cutoff' | null`) sudah dihitung sejak lama, dibawa sampai ke
`ScheduleCard`, dan **tidak pernah dirender**. Akibatnya satu kalimat dipakai untuk
ketiga keadaan:

> "Bayar sebelum batas waktu agar reservasi slot tidak dilepas ke pengguna lain."

Benar hanya untuk `'slot'`. Untuk `'cutoff'` (batas 14.00 WIB) **slot tidak dilepas**
— aturan itu eksplisit di `slotHold.ts`; yang habis adalah waktu admin menyiapkan
halaman iklan. Untuk jadwal ke-2 dst. `deadline` selalu `null`, jadi kalimat itu
menyebut "batas waktu" yang tidak ditampilkan di mana pun.

Terukur: dari jadwal yang sedang menunggu bayar, **2 admin-booked : 1 user-booked** —
kalimat yang salah tampil untuk mayoritasnya.

**Aturan pemilik produk 2026-08-19 — jam hanya untuk slot milik peneliti:**

| `slot_booked_by` | Tenggat ditampilkan? | Kalimatnya |
|---|---|---|
| `user` | **ya**, jam WIB di judul banner | konsekuensi sesuai `deadlineCause` (slot lepas / tanggal harus diganti) |
| `admin` / NULL / jadwal ke-2 dst. | **tidak** | *"Jadwal iklan memiliki slot terbatas setiap harinya. Lakukan pembayaran sebelum slotnya terpenuhi."* |

Alasannya: **slot yang dipesan admin dilepas MANUAL lewat dashboard admin, kapan
saja.** Tidak ada jam yang jujur bisa disebut untuknya, jadi jangan mengarang satu.
Kasus hari-H tetap tertangani keadaan `too_late_today` yang terpisah.

⚠️ Gerbangnya `isUserBooked`, **bukan** `paymentDeadlineCause` — tapi alasan yang
pertama kali kutulis di sini SALAH dan sudah dicabut. Aku menulis "peneliti yang
memesan pukul 13.50"; itu mustahil. Batas pemesanan hari-H 13.00 WIB **memang
ditegakkan**, di ketiga jalur yang bisa menulis `slot_booked_by='user'`:

| Penulis | Penjaga |
|---|---|
| `submitOrder.ts:207` | `throw OrderSubmitError('past_cutoff')` tepat sebelum INSERT (baris 120) |
| `rebookSlotForSubmission` | `handleRebook` memblokir + toast (`PaymentCheckoutPage.tsx:306`) |
| `ScheduleForm.tsx:299` | menulis `slot_booked_by: 'admin'`, jadi bukan slot peneliti |

Karena reservasi mandiri untuk hari ini selalu terjadi sebelum 13.00, hold 1 jamnya
selalu berakhir sebelum 14.00 — **cutoff tidak pernah menang karena jam**.

Cabang `'cutoff'` tetap dipertahankan karena ia hidup lewat pintu lain:
`slot_booked_by='user'` dengan `slot_reserved_at` **NULL atau rusak**.
`slotReleaseDeadline` mengembalikan `null` di situ — slotnya tidak pernah lepas
sendiri, keadaan yang dipagari eksplisit oleh dua tes di `slotHold.test.ts` — jadi
satu-satunya batas yang tersisa memang cutoff-nya, dan kalimat `'slot'` justru yang
akan berbohong di sana.

⚠️ Semua penjaga 13.00 itu **client-side**; tidak ada CHECK maupun trigger di DB.
Belum sempat diukur berapa baris produksi yang `slot_booked_by='user'` tapi
`slot_reserved_at` NULL — koneksi DB putus di sesi ini.

Ditegakkan di `deriveOrderUiState` (satu tempat), jadi baris konteks chat ikut
berhenti menyebut jam untuk slot admin — dan berhenti mengklaim "slot dilepas jika
lewat" saat sebabnya cutoff.

⚠️ **Masih dibiarkan (sengaja):** jadwal ke-2 dst. tidak menampilkan tenggat sama
sekali walau batas 14.00 WIB tetap berlaku untuk mereka. Mengisinya tanpa ikut
membawa keadaan `too_late_today` akan memunculkan tenggat yang lewat tanpa
mengubah apa pun — menukar kelalaian dengan kontradiksi baru.

### 00Q. 🟢 Task 13 selesai di branch — Extra Ad pindah ke jadwal (`sql/63`/`64`, 2026-08-19)

**Aturan baru dari pemilik produk: KILAT TIDAK PUNYA KUOTA IKLAN TAMBAHAN.**
Kolam tambahan (`MAX_EXTRA_ADS_PER_DAY` = 4/hari, di samping 4 reguler) adalah
kolam di KALENDER IKLAN. Kilat dijual lewat slot jam (8/11/14/17 WIB, 2 kuota per
slot) dan tidak punya kolam kedua.

#### Angka backfill — mengoreksi dokumen rencana

| | |
|---|---|
| jadwal terbaca tambahan (halaman **atau** `[EXTRA_AD]`) | 25 |
| — reguler → **di-backfill** | **24** (21 order: 21 ordinal 1 + 3 perpanjangan) |
| — kilat → **ditinggal `false`** | **1** |

Baris ke-25 itu `RZ8R6SWR` ("JFSUHUD Pariwisata Sunda", `admin_notes` =
`'[EXTRA_AD]'`). Ia **belum pernah salah hitung** — `start_date`-nya NULL, jadi ia
tidak pernah masuk lingkaran penghitungan kalender. Yang dimatikan aturan ini
adalah bom waktunya: begitu jadwal itu diberi tanggal, kode lama membuangnya ke
`extraCounts` dan ia **lolos dari kuota Kilat tanpa jejak**.

#### Kenapa aturannya ditegakkan tiga lapis dengan nada berbeda

| Lapis | Perilaku | Alasan |
|---|---|---|
| trigger `BEFORE` di `ad_schedules` | membersihkan **diam-diam** | jalur mesin. Konversi reguler→kilat (`convertDistributionType`) harus **berhasil**, bukan gagal — dan hasil benarnya adalah flag tambahannya ikut lepas |
| `CHECK ad_schedules_kilat_never_extra` | **menjamin** | tidak akan pernah berbunyi selama triggernya hidup; gunanya justru itu — kalau triggernya suatu hari dilepas, barisnya tetap tidak bisa berbohong |
| `set_schedule_extra_ad()` | menolak **KERAS** | satu-satunya tempat MANUSIA menyatakan maksud. Salah klik harus berbunyi, bukan dibersihkan diam-diam |

#### `survey_pages.is_extra_ad` tidak di-drop — ia jadi cermin

Lima tempat masih membacanya dan tidak disentuh: `adOrdering.ts` +
`functions/api/surveys.js` (urutan kartu di feed aplikasi), `publish-pages/types.ts`,
`SubmissionsTableRow.tsx`, `CampaignActions.tsx`. Dibiarkan lepas, admin menandai
sebuah jadwal "Tambahan", papan kapasitas memindahkannya — dan kelima layar itu
tetap bilang "Regular Ad".

Dijaga **sepasang** trigger, bukan satu, karena urutan kejadiannya bisa terbalik:
halaman lahir saat order LUNAS (`ensure_survey_page`), sedangkan flagnya bisa
disetel jauh sebelum itu. Push saat jadwal berubah, pull saat halaman lahir.

⚠️ **Batasnya, disengaja:** cermin mengikuti jadwal ordinal 1 saja. Order yang
jadwal ke-2-nya tambahan sementara jadwal pertamanya reguler diurutkan sebagai
reguler di feed. Tetap lebih benar daripada sebelumnya (yang tidak punya konsep
per-jadwal sama sekali), dan "iklan mana yang sedang tayang" bukan pertanyaan yang
bisa dijawab trigger tanpa cron.

#### 🔴 `sql/64` — backfill yang tidak menyebar, dan pelajarannya

Verifikasi sesudah `sql/63` diterapkan memulangkan **9**, bukan 0: sembilan order
yang jadwalnya sudah `is_extra_ad = true` sementara halamannya masih `false`.

Sebabnya urutan **di dalam `sql/63` sendiri**. Backfill jalan di bagian 2, trigger
pendorong cermin dipasang di bagian 7, dan **trigger tidak berlaku surut**. Yang
tertinggal persis order yang ke-extra-annya cuma datang dari penanda teks
`[EXTRA_AD]` — di sana halamannya memang masih `false`.

> **Pelajaran:** backfill yang mengandalkan trigger untuk menyebar harus dijalankan
> SESUDAH triggernya terpasang, atau menyebarkannya sendiri di pernyataan yang sama.

Ditutup `sql/64` (satu `UPDATE`). Diperiksa sebelum menulis: kesembilannya sudah
lewat jendela tayang, jadi **nol iklan berjalan** berpindah urutan. Sesudah
diterapkan: mismatch **0**, halaman tambahan 10 → **19**, pelanggaran kilat **0**.

#### Yang ikut diperbaiki di jalan

**`extraAdMap` dan query `survey_pages`-nya dihapus.** Itu kaki yang MENGGANTUNG di
produksi 2026-08-19 (317 UUID → URL ±12 KB → permintaan tidak pernah kembali) dan
menghentikan seluruh penguncian slot. Kedua kaki `fetchSlotAvailability` kini lewat
RPC `SECURITY DEFINER` dan membawa `is_extra_ad` sendiri — jadi jadwal ke-2 berhenti
diam-diam dihitung reguler. Efek samping: kaki ordinal 1 berhenti bergantung pada
policy `"User View Own Submissions"` yang ber-`USING (true)`.

**Tagihan mandiri memakai voucher TAGIHAN, bukan voucher order.** `create-payment.js`
membaca `form_submissions.voucher_code` — yang diketik peneliti saat memesan. Kalau
admin sudah menerbitkan tagihan dengan voucher lain, itulah harga yang dijanjikan.
Urutan yang wajar berakhir buruk: admin menagih dengan voucher X → tagihan
kedaluwarsa → peneliti menekan "Bayar Sekarang" → tagihan baru lahir dengan voucher
order. Efek keduanya lebih halus dan lebih sering: `amount` inilah yang dipakai blok
pakai-ulang untuk **mencocokkan** tagihan hidup, jadi dengan voucher berbeda
cocoknya selalu gagal — tagihan admin yang MASIH hidup pun diduplikasi.
Hanya voucher tagihan yang **berisi** yang menang; kolomnya baru lahir di `sql/53`
jadi baris lebih tua NULL, dan menyita diskon dari baris-baris itu lebih merusak
daripada gagal menghormati admin yang sengaja mengosongkan voucher.

#### ⚠️ Temuan sampingan — DITUTUP di §00S (`sql/66`, 2026-08-20)

`form_submissions` punya policy `"User View Own Submissions"` dengan
`USING (true)` untuk peran `authenticated` — **setiap akun yang login bisa membaca
seluruh baris order**, termasuk nama, email, telepon, dan universitas peneliti lain.
`sql/47` hanya menutup `anon`. Migrasi ini kebetulan melepas satu pembacanya
(kalender ketersediaan), tapi lubangnya tetap terbuka. Bukan bagian Task 13.

> **Menyusul: lubangnya ternyata dua.** Audit §00S menemukan dua policy INSERT
> `WITH CHECK (true)` yang membuat pengetatan `sql/11c` tidak pernah berlaku.
> Ketiganya dicabut `sql/66` — baca §00S untuk angka dan verifikasinya.

---

### 00R. 🔴→🟢 Email "iklan selesai" tidak pernah terkirim sekali pun (`sql/65`, 2026-08-19)

Ditemukan saat merge `main` menjelang deploy Task 13. **Bukan bagian Task 13** —
ia datang dari `sql/60b_ad_completed_notifications` (fitur JFU AI Analyzer).

#### Kenapa tidak ada yang tahu

`notify_primary_ads_completed()` menyaring dengan **huruf besar**:

```sql
WHERE fs.submission_status IN ('APPROVED', 'PUBLISHED', 'COMPLETED')
  AND fs.payment_status = 'PAID'
```

Kosakata sistem ini huruf kecil. Terukur: saringan itu cocok dengan **0 baris**.
`'PUBLISHED'` bahkan bukan nilai yang pernah ada di kolom itu dalam huruf apa pun.

> **Diamnya yang paling mahal.** Bug ini tidak muncul di `cron.job_run_details`
> (job-nya sukses tiap hari), tidak di `net._http_response` (tidak pernah ada
> permintaan), dan tidak di log endpoint (tidak pernah dipanggil). Satu-satunya
> gejalanya adalah email yang **tidak datang** — dan tidak ada yang memantau itu.
>
> Kalau ada satu hal yang dibawa pulang dari §00R: **cron yang "selalu sukses"
> bukan bukti apa-apa.** Yang membuktikan cuma barisnya berkurang.

#### Dua bug yang ikut ketemu

**Jam berakhirnya dihitung rumus yang beda.** Versi lama memakai
`airing_instant_of_date()` untuk SEMUA order, mengabaikan jam tayang kustom dan
Kilat. Ironisnya `notify_primary_ads_live()` sudah memuat peringatan persis soal
ini di badannya — *"urutan cabang SAMA PERSIS dengan
`sync_ad_schedule_from_submission()`; menyimpang berarti email terkirim padahal
papan Schedule masih bilang belum tayang"* — dan fungsi 'completed' menyimpang.
Menyentuh 1 order berjam kustom dan 14 Kilat.

**Tidak ada batas mundur.** Memperbaiki bug pertama sendirian akan mengirim
**181 email** "penayangan baru selesai" dalam satu jalannya cron: 166 untuk iklan
yang berakhir >7 hari lalu, 101 >30 hari, yang tertua **26 Mei 2026**. Kalimatnya
bohong untuk iklan yang berakhir tiga bulan lalu, dan volumenya membahayakan
reputasi pengirim Brevo.

#### Yang diterapkan

| | |
|---|---|
| saringan | daftar-**tolak** (`NOT IN rejected/spam/cancelled/slot_cancelled`), bukan daftar-izin — status baru terus lahir di proyek ini, dan daftar-izin diam-diam berhenti mengenali order yang sah |
| jam berakhir | custom → kilat → bawaan, urutan yang sama dengan mirror & notifikasi 'live' |
| batas mundur | **7 hari**. Berakhir lebih lama → ditandai TANPA dikirim. Cron mati sebulan hanya mengirim minggu terakhir |
| tunggakan | **531 baris ditandai tanpa email** (keputusan pemilik produk). Bukan 181: saringannya sengaja lebih lebar dari syarat kirim, supaya order batal yang dihidupkan lagi tidak mendadak memenuhi syarat |
| atomisitas | peredam + perbaikan di **satu transaksi**, jadi tidak ada jendela di mana saringan yang benar hidup tanpa peredamnya |

Cadangan URL **dipertahankan** (beda dari fungsi 'live' yang gagal-tertutup):
`notify_ad_completed_url` tidak ada di vault, jadi menghapusnya akan mematikan
fitur ini untuk kedua kalinya dengan cara berbeda.

Verifikasi sesudah diterapkan: tunggakan dibungkam **531**, tunggakan tersisa
**0**, masih tayang **7**, fungsi masih huruf besar **false**. Fungsinya
dijalankan sekali langsung — **0 permintaan HTTP**, 0 antrean. Yang dibuktikan
itu bukan "email terkirim", melainkan ia **berjalan sampai habis tanpa
exception**, hal yang tidak pernah bisa dipastikan sebelumnya.

#### ⚠️ Yang MASIH belum terbukti, dan batas yang sengaja tidak ditambal

**Belum ada satu pun email sungguhan yang terkirim lewat jalur ini.** Buktinya
baru ada saat salah satu dari **7 iklan** yang masih tayang berakhir. Saat itu
periksa `net._http_response` **segera** — retensinya beberapa jam saja.

Penandaan tetap terjadi **tanpa memeriksa hasil kiriman**. `net.http_post`
asinkron: jawabannya mendarat belakangan, jadi tidak ada status yang bisa
diperiksa di transaksi itu; pola yang sama dipakai `notify_primary_ads_live()`.
Kalau endpointnya mati, ordernya tetap ditandai dan emailnya hilang permanen —
**persis insiden `sql/48`** (§00A). Yang menahannya hari ini cuma satu hal:
endpointnya sudah tayang. Membuat pola ini benar-benar aman perlu tabel antrean
+ penyapu yang membaca `net._http_response`; itu pekerjaan tersendiri.

Untuk iklan pertama yang berakhir, **catat id-nya lebih dulu** supaya
`completed_notified_at`-nya bisa dikosongkan manual kalau emailnya gagal.

**Rollback** (aman hanya SELAMA belum ada email sungguhan terkirim — sesudah itu
ia berubah jadi perintah kirim-ulang): `completed_notified_at` bernilai 0 baris
sebelum `sql/65`, jadi `UPDATE form_submissions SET completed_notified_at = NULL
WHERE completed_notified_at IS NOT NULL;` memulihkan persis.

---

### 00T. 🟢 Rework "Reservasi Jadwal" — Track A–E (`sql/70` + `sql/71` + 5 commit, 2026-08-26)

> Rencana lengkapnya: `~/.claude/plans/bantu-aku-mengaudit-flow-twinkling-cascade.md`.
> Branch `fix/track-a-jalur-uang`. **`sql/70` & `sql/71` sudah diterapkan ke
> produksi 2026-08-26 dan diverifikasi**; kodenya belum di-push.

**Yang menutup catatan lama di dokumen ini:**

| Catatan lama | Nasibnya |
|---|---|
| "Task 11 langkah 4 — `updatePaymentStatus` dipersempit ke `schedule_id`", dicatat sebagai **prasyarat Task 13** | **Prasyaratnya terpenuhi lewat PENIADAAN.** Fungsinya ternyata KODE MATI: `handlePaymentStatusChange` diteruskan sebagai prop `onPaymentStatusChange` ke `SubmissionsTableRow` dan `SubmissionDetailSheet`, dan **tidak satu pun dari keduanya pernah men-destructure-nya** — ia cuma berdiri di interface props. Sudah tercatat sejak revamp Juli 2026 (*"`onPaymentStatusChange` was never destructured, so 'Mark as Paid' crashed"*). Dihapus seluruhnya di `a22ea19`; nol kemunculan tersisa di repo. **Jangan mencarinya lagi.** |
| §00L Lapis 2 — `.update()` tanpa `.select()` gagal senyap saat RLS menyaring nol baris | Polanya ditutup di titik yang tersisa: `markScheduleAsPaid`/`unmarkScheduleAsPaid` kini `.select('id')` di keempat penulisannya, dengan `assertScheduleRowTouched()` yang melempar saat baris jadwal nol tersentuh. Tulisan ke `invoices`/`transactions` sengaja TIDAK melempar — nol baris di sana keadaan sah ("lunas di luar sistem"), jadi jumlahnya dilaporkan di toast. |

**Lima commit:**

| Track | Commit | Isi |
|---|---|---|
| A — jalur uang | `a22ea19` | gagal-senyap pelunasan ditutup; `updatePaymentStatus` dihapus; `orderTotalOf()` jadi satu-satunya "total order" (`form_submissions.total_cost` menyimpan harga jadwal ke-1, bukan total — terukur meleset di 10 order multi-jadwal) |
| A — data | `sql/70`, `sql/71` | `review_status` ordinal-2 berhenti beku; 5 faktur `paid` tanpa `paid_at` diselesaikan **3 dibatalkan + 2 di-backfill**, bukan sapu rata |
| B — kepemilikan | `6cec6b2` | Kilat manual berhenti mengunci slot; peneliti tidak bisa menghidupkan jadwal yang admin batalkan; `slot_cancelled` berhenti berkata "otomatis"; penanda + filter "batas bayar terlewat" di tabel Submissions |
| C — tab admin | `2ab9fa6` | `scheduleCardActions.ts` jadi sumber tunggal `{ primary, menu }` — "maksimal satu tombol di luar ⋯" kini ditegakkan TIPE, bukan disiplin |
| D — sisi peneliti | `de91e76` | satu kosakata (Tagihan/Kuitansi); harga dibaca lewat `deriveScheduleMoney` yang sama dengan admin; sisa tagihan bukan harga penuh; banner Fase ② ditulis ulang dengan aturan emas |
| E — notifikasi | `f2ce0b3` | gerbang + dialog menggeser tanggal order lunas; `functions/api/notify-schedule-change.js` |

**Dua temuan yang tidak ada di rencana, ditemukan saat mengerjakan:**

1. **"Tandai Lunas" di baris tagihan salah lingkup.** Tombolnya duduk di satu
   baris tagihan tapi memanggil `onMarkPaid(entry)` — melunasi **seluruh
   jadwal**. Pada jadwal dengan 2 tagihan, admin yang mengklik baris Rp 61.050
   sedang melunasi keduanya, tanpa apa pun di layar yang menyebutkannya.
   Dibuang; aksi berlingkup jadwal kini hidup sekali per kartu.
2. **`ad_schedules.status = 'cancelled'` kelebihan muatan.** Dari 136 baris,
   110 sebenarnya spam, 15 ditolak, 9 order dibatalkan, dan **1** yang
   benar-benar "tim membatalkan tanggal tayang". Menggerbangkan email pembatalan
   pada nilai itu saja akan mengirim 135 email salah. Pembedanya kontrak
   `sql/62`: `slot_cancelled` satu-satunya yang tayangnya `cancelled` sementara
   review-nya tetap `approved`.

**Sisa yang DISEBUT, bukan didiamkan:** jalur Kilat memakai penyimpan jadwalnya
sendiri (`updateKilatSchedule`), jadi pemindahan tanggal Kilat mendapat
**email**-nya (kait `onRescheduled`, hanya diisi drawer admin) tapi **belum
dialog konsekuensi E1** — menaruhnya di `KilatScheduleStep` berarti menyentuh
komponen yang juga dipakai wizard checkout, pekerjaan Kilat yang sengaja
ditunda ke sesi terpisah.

---

### 00S. 🟢 Audit Task 1–13 — tiga bug jalur uang + dua lubang izin (`sql/66` + deploy, 2026-08-20)

> **SELESAI 2026-08-20.** `sql/66` diterapkan ke produksi, dan seluruh perbaikan
> kode (A1, A2, A7, A3, A5, A6) sudah **dideploy dari `main`** oleh pemilik
> produk. Yang tersisa hanya verifikasi lapangan — daftarnya di kaki bagian ini.

Audit implementasi Task 1–13, bukan penulisan fitur baru. Semua angka diukur
langsung ke produksi (`zewuzezbmrmpttysjvpg`).

> **Bentuk yang sama, untuk ketiga kalinya: perbaikan ditulis, tesnya hijau,
> tapi perbaikannya tidak pernah benar-benar berlaku — dan gagalnya sunyi.**
>
> | perbaikan | tesnya menguji | yang sebenarnya rusak |
> |---|---|---|
> | masa berlaku JFUSUHUD | `computeTotalCostFromSubmission` | `select=` pemanggilnya |
> | `sql/11c` pengetatan INSERT | policy yang ditulisnya | dua policy `true` yang tidak pernah di-DROP |
> | `sql/47` pembatasan `anon` | GRANT kolom `anon` | premisnya soal `authenticated` |
>
> Ketiganya lolos review dengan cara yang sama: **yang diuji fungsinya, bukan
> pemanggilnya.** Tes baru di rilis ini sengaja dibentuk sebaliknya.

#### A1 🔴 Voucher dinilai pada jam bayar, bukan tanggal order lahir

`orderInstant()` membaca `sub.created_at`, tapi `select=` di
`create-payment.js` tidak pernah meminta kolom itu. `Date.parse(undefined ?? '')`
= `NaN` → jatuh ke `Date.now()`. Seluruh mekanisme `atMs` yang ditulis khusus
untuk masa berlaku voucher tidak pernah menerima nilai yang benar.

Terukur dengan menjalankan fungsinya: order lahir 20 Agu 2026, dibayar 2 Sep →
seharusnya **2.319.900**, produksi **2.553.000**. Selisih **Rp 233.100** di atas
ringkasan yang sudah disetujui peneliti. Akibatnya dobel: DOKU menagih angka itu,
**dan** blok koreksi menaikkan `total_cost` di DB ke nilai salah tersebut.

Terpapar saat ditemukan: **8 order JFUSUHUD belum lunas** (dipesan 6 Jul–17 Agu)
+ 1 JFUFEB. Tenggat nyata: JFUSUHUD mati **1 September 2026**.

> **Tapi ia tidak pernah sempat menyala — dan itu kebetulan, bukan desain.**
> Jendela selisihnya hanya terbuka untuk order yang **lahir sebelum** masa
> voucher habis lalu **dibayar sesudahnya**. Hanya tiga voucher yang punya
> tenggat sama sekali, dan per 2026-08-20 ketiganya masih hidup: `JFUSUHUD`
> 31 Agu 2026, `ILKOMUNY` 31 Des 2026, `JFUFEB` 20 Feb 2027. Jadi `Date.now()`
> dan `created_at` masih memberi vonis yang sama untuk **setiap** order yang
> pernah ada (22 JFUSUHUD, 7 JFUFEB, 2 ILKOMUNY).
>
> **Nol peneliti pernah ditagih di atas harga yang disetujui.** Perbaikannya
> mendarat **11 hari** sebelum yang pertama akan menyala. Yang perlu diingat
> bukan angkanya melainkan bentuknya: bug ini duduk tenang berbulan-bulan
> dengan tesnya hijau, dan yang menahan kerugiannya cuma kalender.

**Perbaikan.** Daftar kolomnya diangkat jadi `SUBMISSION_SELECT_COLUMNS` yang
diekspor, dan `select=` dibangun darinya. Penjaganya
`src/utils/create-payment-select.spec.ts`: ia **memproyeksikan** baris uji lewat
daftar itu — persis seperti PostgREST — sebelum menghitung harga. Dibuktikan
merah: mencabut `created_at` dari daftar membuat 3 dari 5 tesnya gagal.

#### A2 🔴 Webhook menyimpulkan status bayar dari "invoice terbaru se-ORDER"

STEP 2 menandai invoice yang benar-benar dibayar lunas, lalu STEP 3 membuang
informasi itu dan mengambil ulang `invoices?form_submission_id=eq.…` terbaru —
tanpa filter `schedule_id`. STEP 4 memakai status baris itu untuk menulis
`payment_status`.

Sebelum Task 13 itu hampir selalu benar (satu tagihan hidup per order). Sekarang
tidak: `canTopUp` berlingkup **per jadwal**, jadi satu order boleh punya dua
tagihan terbuka. Bayar yang lebih tua → order ditulis `pending` **padahal uangnya
masuk**. Yang ikut mati di hilirnya: `ensure_survey_page()` (halaman iklan tidak
lahir), `notify_primary_ads_live()`, `notify_primary_ads_completed()`, dan
gerbang 409 di create-payment.

**Laten, belum pernah menyala.** Saat diukur: 41 jadwal punya tagihan terbuka,
**1 order** sudah punya tagihan terbuka di >1 jadwal. Task 13 yang membuat
kondisi ini rutin, bukan langka. (Satu order yang tampak seperti gejalanya,
`7fb09c39`, ternyata baris manual Mayar Januari 2026 — bukan ini.)

**Perbaikan.** STEP 2 sudah memakai `return=representation`, jadi baris yang
barusan dibayar **beserta `schedule_id`-nya** sudah ada di tangan. STEP 3 kini
memfilter `schedule_id=eq.…` dari baris itu; `schedule_id` NULL (baris sebelum
`sql/51`) tetap memakai `form_submission_id` supaya data lama tidak berubah
perilakunya. Pertanyaannya sekarang **"apakah jadwal ini lunas?"**, bukan
"apakah order ini lunas?".

#### A7 🔴 Webhook 500 untuk pembayaran yang barisnya hanya ada di `transactions`

Ditemukan saat menelusuri A2. STEP 1a **sengaja** menoleransi 0 baris (Skenario
B, ada komentarnya). Tapi STEP 2 memakai `sbPatchExpectingRows` pada `invoices`,
yang **melempar** saat 0 baris cocok → `write_failed` → HTTP 500 → DOKU retry 5×
→ menyerah. `payment_status` tidak pernah berpindah.

Terukur: **243 transaksi tanpa invoice pasangan, 162 masih `pending`** (terbaru
2026-07-14). Yang membuat kelasnya tetap hidup adalah A6 di bawah.

**Perbaikan.** STEP 2 mengikuti alasan yang sama dengan STEP 1a: `sbFetch` biasa,
0 baris sah **hanya kalau STEP 1a menemukan transaksinya**. Dua-duanya kosong
tetap melempar.

#### A5 + A6 🟡 Dua fail-open di create-payment

**A5 — `billed_start_date` jatuh ke keadaan rusak.** Kalau lookup `ad_schedules`
gagal, kodenya jatuh ke `form_submissions.start_date` — dan komentar tepat di
atasnya sendiri menjelaskan bahwa nilai itu membuat tagihan **lahir langsung
basi** sehingga peneliti tidak akan pernah bisa membayar. Sekarang jatuh ke
**`null`**; `sql/60` sudah menetapkan NULL = tidak diketahui = tidak pernah basi.

**A6 — sisipan `Promise.all` bisa separuh.** Satu sukses satu gagal → balas 502,
baris yang sukses tetap tinggal. Invoice yatim jadi piutang selamanya;
**transaksi yatim melahirkan A7 dengan link DOKU yang masih hidup** — itulah
sumber 243 baris di atas. Sekarang baris yang berhasil di-DELETE lewat
`payment_id` (unik per percobaan) sebelum 502 dibalas.

#### A3 🟡 Dua salinan aturan `live` tidak identik

SQL memakai `payment_status_rank(status) = 1` (hanya `'pending'`); TS memakai
`!isDead` — apa pun yang bukan lunas/mati, **termasuk status tak dikenal**
(rank 0). Komentar di kedua sisi menuntut mereka identik.

**Laten, 0 baris terdampak** — seluruh kosakata status produksi ada di kedua
daftar. Ini kebersihan, bukan bug hidup: yang dijaga adalah status baru pertama
yang lahir hanya di satu sisi. TS kini punya `isPending` eksplisit.

#### B1 🔴 `form_submissions` terbuka untuk setiap akun yang login — INSERT-nya juga

§00Q mencatat sisi SELECT. Produksi menunjukkan lubangnya **dua**:

| cmd | policy | ekspresi |
|---|---|---|
| SELECT | `User View Own Submissions` | `true` 🔴 namanya menyesatkan |
| INSERT | `User Insert Own Submissions` | `true` 🔴 |
| INSERT | `Users Can Insert Submissions` | `true` 🔴 |

Policy permissive di-OR-kan, jadi satu policy longgar mengalahkan semua yang
ketat. **`sql/11c` ditulis persis untuk menutup sisi INSERT, tapi kedua policy
longgarnya tidak pernah di-DROP** — jadi pengetatannya tidak pernah berlaku:
akun mana pun bisa menyisipkan order atas nama `auth_user_id` orang lain.

**Ketiganya tidak ada di `sql/`.** Dibuat di luar repo. Karena itu `sql/README.md`
sekarang menyatakan eksplisit: berkas migrasi **bukan** sumber kebenaran RLS
produksi — baca `pg_policies`.

Diukur sebelum DROP: dari 1006 order, 695 punya `auth_user_id`, 12 tanpa
`auth_user_id` tapi emailnya punya akun (tertangkap cabang fallback), dan 299
tanpa `auth_user_id` yang emailnya **tidak punya akun sama sekali**. Nol baris
yatim. Prasyarat yang membuatnya murah sekarang: `sql/63` sudah memindahkan
kedua kaki `fetchSlotAvailability` ke RPC `SECURITY DEFINER`.

#### B2 🟠 Peneliti yang email order-nya beda dari email akun tidak bisa melihat tagihannya

Ditemukan saat memeriksa dampak B1. Policy SELECT `invoices` (`sql/24`) dan
`transactions` mengunci kepemilikan pada **email**, sementara `form_submissions`
sudah pindah ke `auth_user_id` sejak `sql/11`. Order yang `auth_user_id`-nya
cocok tapi emailnya berbeda **terlihat di dashboard tapi tagihannya kosong**.

Terukur: **16 order**, 9 punya invoice, **2 belum lunas dengan tagihan `pending`**
(`c1d195a5`, `91bd5fb2`) — dua peneliti yang saat itu tidak punya tombol bayar
sama sekali. Ini **pra-Task 13**, tapi Task 13 menjadikan `schedule_billing_bulk`
(SECURITY INVOKER) jalur utama dashboard peneliti, jadi ia mewarisi lubang ini
bulat-bulat — persis di permukaan yang §00O tandai *"belum pernah disentuh
manusia"*.

Arahnya dua-duanya benar. Selain melebar untuk pemilik sah, ia juga
**menyempit**: 8 order punya email yang dimiliki akun **lain**, dan akun itu
selama ini bisa membaca tagihan order yang bukan miliknya. Setelah B1 ia tidak
lagi bisa membaca ordernya — tanpa B2 ia masih bisa membaca uangnya.

> ⚠️ **B1 dan B2 harus berpasangan.** Sub-query di dalam policy tetap tunduk RLS
> `form_submissions`, jadi menerapkan B1 sendirian mempersempit apa yang bisa
> dilihat `EXISTS`-nya. Diterapkan dalam **satu transaksi**.

#### Yang diterapkan — `sql/66`, produksi 2026-08-20

Verifikasi dijalankan sebagai peneliti sungguhan (`set_config` JWT + `role`),
bukan sebagai `postgres`:

| bukti | hasil |
|---|---|
| policy `true` tersisa di `form_submissions`/`invoices`/`transactions` | **0** |
| `select count(*) from form_submissions` sebagai peneliti | **1** (ordernya sendiri), sebelumnya 1006 |
| tagihan `pending` `c1d195a5` / `91bd5fb2` terlihat oleh pemiliknya | **2** / **1**, sebelumnya 0 |
| `get_submission_slot_occupancy()` / `get_extend_slot_occupancy()` | **413** / **4** baris — SECURITY DEFINER tetap bekerja |
| INSERT order dengan `auth_user_id` akun lain | **ditolak RLS** |

Kaki kalender itu yang paling penting dijaga: kalau ia jatuh, **gagalnya sunyi**
— angkanya salah, tanpa satu pun error.

#### A4 🟡 Kebersihan migrasi

`59_survey_analyses.sql` → **`59b_survey_analyses.sql`** (mengikuti konvensi
`60b` yang sudah ada). Ditambahkan **`multi-step-form/sql/README.md`**: urutan
terap, aturan penomoran, daftar tabrakan nomor yang diketahui (22/23/31 sengaja
dibiarkan — tidak ada urutan yang mengikat di antara pasangannya), penjelasan
bahwa `50` **dipesan** untuk `reward_pools` dan bukan berkas hilang, serta
status terap 51–66 yang **diverifikasi ke produksi** dengan memeriksa objeknya,
bukan dari catatan.

#### Yang ditemukan tapi TIDAK ditutup

- **`qual = true` untuk `authenticated`** juga ada di `chat_messages`,
  `chat_sessions` (keduanya bernama "Admins can view all…" tapi tidak dibatasi
  admin), `doku_payouts`, dan `campaign_links` (`ALL`). Bukan bagian Task 1–13.
- **STEP 5 webhook merutekan extend dari `transactions` saja.** STEP 1b membaca
  `entity_type`/`extend_id` dari `invoices` tapi tidak pernah memakainya, jadi
  extend yang dibayar lewat invoice admin tanpa baris `transactions` akan
  di-PATCH ke `form_submissions`. **Nol baris hari ini**: seluruh 12 invoice
  `entity_type='extend'` punya transaksi pasangan.
- **`Users Insert Transactions`** masih berbasis email. Sengaja tidak disentuh —
  peneliti tidak pernah menyisipkan `transactions` dari klien, dan mengubahnya
  hanya bisa **melebarkan** izin tulis di jalur uang.

#### Sudah dideploy — dan yang belum terbukti

`sql/66` diterapkan ke produksi 2026-08-20, dan **seluruh perbaikan kode
dideploy dari `main`** di hari yang sama. Tidak ada lagi jarak antara DB dan
kode untuk rilis ini.

**Yang sudah terbukti** semuanya milik `sql/66`, dan diuji sebagai peneliti
sungguhan (tabel di atas). **Yang belum terbukti adalah seluruh sisi kode.**
Bedanya penting: A1 dijaga tes otomatis yang sudah dibuktikan merah-kalau-rusak,
tapi A2 dan A7 hidup di endpoint webhook yang **tidak punya test harness sama
sekali** — satu-satunya buktinya adalah pembayaran sungguhan.

Regresi yang wajib ikut diuji — dua permukaan yang dokumen ini sendiri tandai
belum pernah disentuh manusia dan berubah di rilis ini:

- **Dashboard peneliti** (§00O): order dengan tagihan menggantung → tombol bayar
  menunjuk tagihan itu; order lunas sebagian → tidak tertulis "Lunas"; order
  berjadwal ke-2 → tagihannya tidak tertukar.
- **A2 + A7 di jalur nyata**: order dengan 2 jadwal, terbitkan tagihan di
  keduanya lewat "Tagih Susulan", **bayar yang lebih tua**. Harapkan jadwal itu
  lunas, jadwal satunya tidak ikut berpindah, dan `doku_webhook_events` berisi
  `http_status` 200 / `outcome` `ok`. Baris `write_failed` di sana berarti A7
  belum tertutup.
- **A1 sesudah 1 September 2026.** Ini satu-satunya butir yang tidak bisa
  diverifikasi hari ini, karena jendela selisihnya belum terbuka. Begitu
  September masuk, buat pembayaran untuk salah satu order JFUSUHUD yang lahir
  Agustus dan pastikan `amount` masih harga saat dipesan. Kalau ia naik, berarti
  yang dideploy bukan versi ini.

> **Pemantauan termurah untuk rilis ini** adalah `doku_webhook_events`
> (`sql/54`) — ia yang membuat A7 berisik alih-alih sunyi. Kalau hanya satu hal
> yang sempat dilihat sesudah deploy, lihat itu.

---

### 00A. 🟢 Cron notifikasi — SELESAI 2026-08-18 lewat Brevo

> **SELESAI 2026-08-18 23.28 WIB. Baca kotak ini; sisanya riwayat.**
>
> | Bukti | Hasil |
> |---|---|
> | Probe body `{}` | **400 `Missing email`** — bukan 500 lagi |
> | Kiriman uji → `product@jakpat.net` | **200 `{"provider":"brevo"}`**, id `smtp-relay.mailin.fr` |
> | `cron.schedule` | `jobid 4`, `*/15 * * * *`, aktif |
> | Kandidat siklus pertama | **4 dikirim**, 3 belum tayang, 526 jendela sudah lewat |
>
> ⚠️ **Kenapa kiriman uji dilakukan lebih dulu, bukan langsung menjadwalkan
> cron:** `notify_primary_ads_live()` menyetel `live_notified_at = now()` tepat
> setelah `net.http_post` **tanpa menunggu hasilnya** (pg_net asinkron). Kalau
> Brevo menolak, keempat order itu hangus lagi dan tidak akan pernah dicoba
> ulang — persis mekanisme yang membakar notifikasi 10 Agustus. Menguji ke
> alamat sendiri lebih dulu memindahkan risiko itu ke tempat yang tidak
> merugikan pelanggan. **Ulangi pola ini tiap kali provider email berganti.**
>
> ⚠️ **Job baru melewatkan satu tick.** pg_cron memuat daftar job di awal tick;
> `jobid 4` dibuat beberapa detik sesudah 16:29 UTC sehingga tick 16:30 hanya
> menjalankan `jobid 1`. Bukan kerusakan — hanya jangan simpulkan cron mati
> sebelum melewati satu putaran penuh.
>
> ⛔ **`MAIL_PROVIDER=brevo` itu sementara.** Begitu Resend pulih, cukup ubah
> satu variabel — `functions/api/_mail.js` sudah provider-agnostik dan
> `_mail.spec.ts` menjaga pemilihannya (11 tes). Jangan menyentuh pemanggil.
>
> <details>
> <summary>Riwayat percobaan yang gagal 20.45 WIB (penyebab & pemulihannya)</summary>
>
>
>
> Cron dijadwalkan (`jobid 3`), menyala tepat waktu, `cron.job_run_details`
> melaporkan `succeeded` — dan tetap **nol email terkirim**. Buktinya cuma ada di
> satu tempat:
>
> ```
> net._http_response → 500 ×4  {"error":"Email service not configured"}
> ```
>
> **Yang diberitahukan angka 500 itu, tepatnya:**
>
> | | |
> |---|---|
> | Gerbang `CRON_NOTIFY_SECRET` | ✅ **LOLOS** — kalau tidak cocok jawabannya 401, dan gerbang itu berjalan sebelum apa pun |
> | Route & parse body | ✅ ada — cek `RESEND_API_KEY` letaknya *sesudah* `await request.json()` |
> | `env.RESEND_API_KEY` | ❌ **tidak terlihat** oleh `functions/api/notify-ad-live.js` baris 29-33 |
>
> **Ini pengulangan pola 10 Agustus dengan penyebab berbeda**, dan sekali lagi
> karena `notify_primary_ads_live()` menyetel `live_notified_at = now()` tanpa
> menunggu respons (pg_net async — memang desainnya, tertulis di kepala `sql/48`).
>
> **Bedanya menentukan, dan kali ini kabarnya baik:** jendela tayang keempat order
> **masih terbuka**, jadi pemulihannya nyata. Sudah dikerjakan:
>
> | Aksi | Hasil |
> |---|---|
> | `cron.unschedule('notify-primary-ads-live')` | rem terpasang lagi — 3 order yang mulai tayang 19–20 Agu tidak ikut terbakar |
> | `live_notified_at = null` ×4 | `72ec157b`, `f6b905d1`, `77790fe4`, `234b70ad` pulih |
> | Verifikasi | cron off, **9 order** menunggu email dengan jendela masih berjalan |
>
> **DIPERIKSA LANGSUNG LEWAT API CLOUDFLARE 2026-08-18 — variabelnya memang
> TIDAK PERNAH ADA.** Production punya 17 variabel, `RESEND_API_KEY` bukan
> salah satunya; Preview kosong total. Jadi bukan salah environment.
>
> **Dan dampaknya jauh lebih luas dari cron ini.** Empat jalur email memakai
> variabel itu, dan tiga di antaranya mati tanpa suara:
>
> | Jalur | Fallback | Akibat |
> |---|---|---|
> | `send-submission-email` | ⚠️ kunci HARDCODED di repo sejak Feb 2026 | jalan — lewat rahasia bocor |
> | `send-invoice-ready-email` | tidak ada | mati; pemanggilnya menelan error (**8 tagihan** 18 Agu) |
> | `notify-ad-live` | tidak ada | mati — inilah 500 di atas |
> | `doku/_webhook-alert` | tidak ada | **mati, `return` diam-diam** |
>
> Baris terakhir yang paling mahal: alarm itu dibangun justru untuk kegagalan
> senyap webhook DOKU (insiden Rp 499.500), lalu ikut senyap.
>
> ✅ **SUDAH DIPERBAIKI SECARA STRUKTURAL** (commit `5c18c64`): keempat
> pemanggil kini lewat satu adapter `functions/api/_mail.js`, provider dipilih
> lewat `MAIL_PROVIDER`. Kunci hardcoded dibuang — ⚠️ **cabut juga di dashboard
> Resend**, ia sudah beredar di git sejak Februari.
>
> **Keputusan provider 2026-08-18: Brevo, sementara.** Akun Resend kena suspend
> dan sedang diurus; Cloudflare Email Sending tertutup karena akun ada di
> **Workers Free** (kirim ke penerima sembarang butuh Workers Paid — 3.000
> email/bln, sementara kebutuhan nyata hanya **~310/bln**: 107 order + 113
> invoice + 90 mulai tayang dalam 30 hari terakhir).
>
> **Yang masih dibutuhkan sebelum email hidup lagi:**
>
> 1. Akun Brevo + otentikasi domain `jakpatforuniv.com` → rekaman DNS-nya
>    ditulis ke zone lewat API (zone ada di akun Cloudflare yang sama)
> 2. Secret `BREVO_API_KEY` dan variabel `MAIL_PROVIDER=brevo` di Pages
> 3. **Deploy ulang** — ⚠️ Pages Functions hanya membaca secret yang sudah ada
>    SEBELUM deployment; menyetelnya saja tidak cukup
> 4. Probe `/api/notify-ad-live?k=…` dengan body `{}` → **400 `Missing email`**
>    berarti jalur email sudah hidup; **baru** jadwalkan cron
>
> ⚠️ **Apex `jakpatforuniv.com` tidak punya MX sama sekali** (terverifikasi) —
> jadi tidak ada email staf di domain ini yang bisa rusak saat SPF apex
> ditambahkan untuk Brevo. `send.` milik Resend sengaja tidak disentuh supaya
> pemulihan Resend nanti tidak perlu membongkar apa pun.
>
> **Urutan aman sesudah diperbaiki** — probe dulu, jadwalkan belakangan:
>
> ```
> POST https://submit.jakpatforuniv.com/api/notify-ad-live?k=<CRON_NOTIFY_SECRET>
> body: {}
> ```
>
> Balasan **400 `Missing email`** = kunci Resend sudah terbaca, aman menjadwalkan.
> Balasan **500** = belum. Probe ini tidak menyentuh satu baris pun.
>
> ⚠️ **Pelajaran yang berlaku untuk tiap cron pg_net berikutnya:** `succeeded` di
> `cron.job_run_details` hanya berarti SQL-nya jalan, bukan HTTP-nya berhasil.
> Satu-satunya bukti ada di `net._http_response` — dan isinya dipangkas berkala,
> jadi periksa dalam hitungan menit, bukan hari.

> </details>

<details>
<summary>Riwayat 2026-08-10 — insiden pertama (dipertahankan, pelajarannya masih berlaku)</summary>

> **Keadaan per 2026-08-18 17.15 WIB — SESUDAH deploy (diverifikasi langsung
> ke produksi):**
>
> - ✅ **Endpoint sudah tayang.** POST tanpa kunci ke
>   `https://submit.jakpatforuniv.com/api/notify-ad-live` membalas **401**
>   (gerbang rahasia menolak) — bukan lagi **405** seperti 10 Agustus. Probe ini
>   aman diulang kapan saja: gerbangnya berjalan sebelum apa pun, jadi tidak ada
>   email terkirim dan tidak ada baris tersentuh.
> - 🔴 **Rem cron MASIH terpasang.** `cron.job` tetap hanya memuat
>   `activate-extends`. Setengah rilis: yang mengerjakan sudah ada, yang
>   memanggil belum. **Ini satu-satunya langkah rilis yang belum dikerjakan.**
> - **4 order sedang tayang dengan `live_notified_at IS NULL`** — `72ec157b`
>   (15–22 Agu), `f6b905d1`, `77790fe4`, `234b70ad` (tiga terakhir mulai
>   **hari ini 15.00**). Keempatnya dikirimi email pada cron pertama setelah rem
>   dilepas. Empat email berangkat sekaligus; itu wajar, bukan tanda kebocoran.
> - ⚠️ **Opsi B di bawah sudah menjadi no-op — jangan berharap apa pun darinya.**
>   Ketiga order yang terbakar 10 Agustus (`0cdd8ab4` 8–11 Agu, `f9b73a58` dan
>   `8b7bd9c1` keduanya 9–10 Agu) **jendela tayangnya sudah lewat**, dan guard
>   fungsinya mensyaratkan `airing_instant_of_date(end_date) > now()`. Mengosongkan
>   `live_notified_at` mereka tidak akan menghasilkan email apa pun. Ketiga email
>   itu hilang permanen; kalau perlu, susulkan manual di luar sistem.
>
> Syarat urutannya — deploy dulu, baru jadwalkan — **sudah terpenuhi**: deploy
> selesai dan terbukti. Menjadwalkan sekarang aman.

**Ditemukan 2026-08-10 saat audit pra-merge.** Riwayat lengkapnya dipertahankan di
bawah karena pelajarannya masih berlaku untuk migrasi berikutnya.

`sql/48` menjadwalkan cron `notify-primary-ads-live` tiap 15 menit. Fungsinya
mem-`POST` ke `https://submit.jakpatforuniv.com/api/notify-ad-live` lewat pg_net,
lalu **langsung** menyetel `live_notified_at = now()` — tanpa menunggu respons,
karena pg_net async (ini memang desainnya, tertulis di kepala `sql/48`).

Masalahnya: **endpoint itu belum ada di produksi.** `functions/api/notify-ad-live.js`
lahir di commit `e7584b4` dan masih tertahan di branch. Terukur di
`net._http_response`:

| Waktu | Request | Status |
|---|---|---|
| 2026-08-10 02:15 UTC (09.15 WIB) | 3 POST | **405** ×3 |

`405 Method Not Allowed` = Cloudflare Pages tidak punya route itu. Nol email
terkirim. Tapi ketiga ordernya sudah ditandai `live_notified_at`, dan guard
fungsinya adalah `live_notified_at is null` — jadi **ketiga order itu tidak akan
pernah dikirimi email itu lagi**, deploy atau tidak:

- `0cdd8ab4-…` "booked by Alanda" (8–11 Agu)
- `f9b73a58-…` "JAK2693 Survey Wisata di Tempat Pasca Bencana - Model #3" (9–10 Agu)
- `8b7bd9c1-…` "Personalisasi Berbasis AI dalam Layanan Pariwisata…" (9–10 Agu)

**Dan ia masih memakan.** Dua order berikutnya mulai tayang **hari ini 2026-08-10
pukul 15.00 WIB** (`8462698a-…`, `2a0db0c3-…`), keduanya masih `live_notified_at
IS NULL`. Mereka akan ikut terbakar pada cron pertama setelah 08.00 UTC.

**Pilih satu, sekarang:**

```sql
-- A. Kalau deploy TIDAK terjadi sebelum 15.00 WIB hari ini — rem dulu:
select cron.unschedule('notify-primary-ads-live');
-- lalu setelah deploy:
select cron.schedule('notify-primary-ads-live', '*/15 * * * *',
                     $$select public.notify_primary_ads_live()$$);
```

```sql
-- B. Setelah deploy, kembalikan yang sudah terbakar supaya emailnya menyusul
--    (aman: guard fungsinya tetap menyaring jendela tayang yang masih berjalan;
--     order yang jendelanya sudah lewat tidak akan ikut terkirim).
update public.form_submissions
   set live_notified_at = null
 where id in ('0cdd8ab4-7427-4bc8-a4df-d6ad906ce888',
              'f9b73a58-6523-4c80-801c-7df7bd5fa6ed',
              '8b7bd9c1-48b6-488a-997f-ce8ebc26d57a');
```

Sesudah deploy, **buktikan jalurnya hidup** — jangan anggap selesai karena cron
`succeeded` (ia `succeeded` juga saat 405):

```sql
select id, status_code, created from net._http_response order by created desc limit 5;
-- harus 200, bukan 405 (route hilang) dan bukan 401 (CRON_NOTIFY_SECRET beda)
```

⚠️ **`401` berarti gerbang rahasianya tidak cocok.** Vault sudah terisi keduanya
(`notify_ad_live_url` + `cron_notify_secret`, diverifikasi 2026-08-10) — yang
**belum bisa diverifikasi dari sini** adalah env var `CRON_NOTIFY_SECRET` di
Cloudflare Pages produksi. Nilainya harus identik dengan isi Vault.

⚠️ Cek juga status akun **Resend** sebelum menyalahkan kode: akun sempat
suspended 2026-08-10 dan form reaktivasinya baru dikirim. `200` dari
`/api/notify-ad-live` hanya membuktikan endpoint-nya hidup, bukan emailnya sampai.

**Pelajaran yang lebih besar dari insiden ini** — dan ini yang membedakannya dari
`sql/43` (DB maju, kode belum, tapi diam): sebuah migrasi yang **menulis penanda
"sudah dikerjakan"** tidak boleh diterapkan sebelum yang mengerjakannya ada.
`sql/43` cuma menunggu; `sql/48` menghabiskan. Aturan turunannya: kalau sebuah
fungsi menandai baris sebelum tahu hasilnya, **jadwalnya menyusul deploy**, bukan
mendahuluinya — atau tanda itu dipasang dari respons, bukan dari pengiriman.

</details>

⚠️ **Catatan 2026-08-18 atas peringatan Resend di atas.** Akun Resend yang sempat
suspended 10 Agustus **bukan** penyebab kegagalan hari ini: pesan `500` berbunyi
`Email service not configured`, dan cabang itu menyala dari `!env.RESEND_API_KEY` —
sebelum satu pun panggilan ke Resend terjadi. Status akun tetap perlu dipastikan
**sesudah** variabelnya terpasang, karena `200` dari endpoint hanya membuktikan
endpoint-nya hidup, bukan emailnya sampai.

### 00B. 🟡 `sql/47` juga mendahului kodenya — dampaknya kecil dan diam

Sudah diterapkan ke produksi 2026-08-10 dan **terverifikasi benar**: `anon` tinggal
7 kolom (`criteria_responden, end_date, id, prize_per_winner, start_date,
survey_url, winner_count`), `authenticated` utuh 35 kolom.

Tapi kode yang tayang sekarang (`main`) masih memuat
`functions/api/send-to-sheets.js`, yang membaca `form_submissions` dengan
`select('*')` memakai **anon key** (`send-to-sheets.js:148`) dan masih dipanggil
dari `StepCheckout.tsx:8` lewat `sendToGoogleSheetsBackground`. Sejak `sql/47`
jalan, panggilan itu **selalu gagal**. Tidak berbahaya dan tidak perlu ditindak:
ia fire-and-forget, sinkronisasi Sheets sudah lama mati (dipanggil sebelum halaman
iklan terbit, jadi policy anon menolaknya bahkan sebelum `sql/47`), dan pemilik
produk sudah memutuskan mencabutnya 2026-08-09. Deploy branch ini menghapus
seluruh jalurnya.

Konsumen anon lainnya sudah dicek satu per satu dan **semuanya aman**:
`SurveyPage.tsx` (6 kolom), `SurveyListingPage.tsx` + `functions/api/surveys.js`
(embed `prize_per_winner, winner_count`), `respondents.js` (`criteria_responden`).

⚠️ **Yang tidak bisa diverifikasi dari luar, dan wajib dipastikan:**
`doku/webhook.js` dan `doku/create-payment.js` memakai
`SUPABASE_SERVICE_ROLE_KEY || VITE_SUPABASE_ANON_KEY` — **fallback ke anon**. Kalau
service-role key tidak terpasang di env Cloudflare, jalur uang membaca
`auth_user_id`/`voucher_code` yang kini **tidak lagi di-grant ke anon**, dan
webhook DOKU akan gagal diam-diam. Bukti tidak langsung bahwa key-nya terpasang:
10 order jadi `paid` dalam 48 jam terakhir, termasuk **sesudah** `sql/47` jalan.
Cukup meyakinkan, belum konklusif — pantau webhook pertama setelah deploy.

### 00D. ✅ Revamp visual dashboard diaudit sebelum commit (2026-08-17) — nol SQL, nol perubahan skema

Perubahan besar bertema tampilan (39 file, ~4.100 baris) diperiksa sebelum di-commit. Tiga
hal menyentuh rencana dan sembilan bug ikut ditemukan; **semuanya sudah diselesaikan di
commit yang sama.** Ringkas — detail per rencana ada di
[`docs/superpowers/plans/README.md`](superpowers/plans/README.md).

**Yang dikembalikan supaya tidak dikerjakan dua kali:**

- Sebagian **Task 13 Langkah 2** (multi-invoice per jadwal) tak sengaja ikut terbangun.
  Dikembalikan; rancangan UI-nya dicatat lengkap di rencana Task 13 supaya versi benar lahir
  di atas `schedule_id` (Task 11) dan hasilnya minimal setara.
- Alasannya bukan selera: prototipe itu **salah menghitung uang**. Diukur di produksi —
  82 sumber punya >1 baris transaksi, 33 di antaranya penjumlahannya melebihi yang
  benar-benar dibayar. Satu order nyata lunas Rp 1.150.000 tampil Rp 3.450.000; kasus
  terburuk 29 percobaan Rp 350.000 tampil Rp 10.150.000.

**Penjaga jalur uang yang dipulihkan** (keduanya dari commit `0b295bb`): penjaga lunas
di dalam query `releaseScheduleSlot` (balapan dengan webhook DOKU), dan penandaan
`slot_booked_by='admin'` saat admin memindahkan jadwal — tanpa itu slot yang baru dipindah
tetap `'user'` dan bisa ikut kadaluwarsa otomatis.

**Bug yang diperbaiki** — dua di antaranya akan lolos ke produksi karena `vite build` tidak
melakukan typecheck: `AlertTriangle` dipakai tanpa import (tab Jadwal & Bayar *crash* untuk
submission spam/rejected), dan `updateExtendScheduleDates` dipanggil dengan `endIso` di slot
`durationDays` (tanggal rusak saat memindahkan jadwal ordinal ≥2). Sisanya: badge "perlu
ditagih" yang tak pernah muncul, empat baris identitas peneliti tanpa kolom DB, dua cabang
render mati, variant Chip tak sah, dan `totalPaid` yang tak pernah ada.

**Ronde review kedua** menemukan tiga hal lagi, semuanya sudah diperbaiki:

- `PaymentSection` sempat mengecek "belum ada tagihan" SEBELUM cek lunas, sehingga jadwal
  yang dibayar di luar sistem (tanpa baris `transactions`) menampilkan ajakan "Terbitkan
  tagihan". Presedens dikembalikan seperti `PaymentBanner` lama: lunas didahulukan.
- `scheduleMoney.ts` sempat memuat **salinan ketiga** tarif voucher sebagai daftar
  hardcoded — dan daftarnya sudah tertinggal: `JFUANA`/`JFUNATALIA`/`JFUSALSA` (10%) dan
  `TEGARGANTENG` (20%) tidak ada di sana. Diganti dengan **probe dua titik** terhadap
  `calculateDiscount`; voucher proporsional dibalik otomatis, yang berbasis cap
  (`JFUFEB`/`ILKOMUNY`) dan `JFUTGRX` sengaja dilewati. Terverifikasi untuk 20 kode.
- `updateFormDetails` kini menerima `Partial`, dan "Ganti link" di dashboard peneliti hanya
  mengirim `survey_url`. Sebelumnya ia ikut menulis `title`/`question_count`/`duration` dari
  salinan lokal — persis empat kolom yang admin sunting di tab Info, jadi suntingan admin
  bisa tertimpa, termasuk dua masukan harga.

**Perubahan perilaku yang disengaja dan perlu diketahui:** `isScheduleLate` baru di
`lifecycle.ts` membuat order belum lunas yang tanggal tayangnya sudah lewat berderajat
`reserved_expired`. Terukur **336 order** akan berpindah label jadi "Slot Expired". Iklan
yang dibayar di luar sistem **tidak** terdampak — 32 baris berstatus scheduled/live/completed
terlindungi presedens stage yang menaruh live/page_scheduled/completed di atasnya.

**Gerbang typecheck:** baseline `tsc -b` **39** error sebelum, **36** sesudah — nol error
baru, dan tiga error lama ikut hilang (termasuk `ui/Dialog.tsx` yang di-*rename* jadi
`dialog.tsx` supaya cocok dengan 14 import yang semuanya huruf kecil; build Linux dulu
rawan gagal di sini). Build produksi lolos.

### 00I. 🟡 Rilis Soft DNA dideploy 2026-08-18 — hijau, kurang satu langkah

**Yang sudah terbukti.** Merge `f217d58` dipush (tip `835aea1` sesudah menyatu
dengan dua commit rekan) dan dideploy. Route Functions-nya hidup: POST tanpa kunci
ke `/api/notify-ad-live` membalas **401**, bukan **405** — pembeda yang persis
dipakai saat mendiagnosis insiden 10 Agustus.

**Yang belum.** Cron `notify-primary-ads-live` belum dijadwalkan ulang. Lihat
§00A; ini satu-satunya sisa checklist rilis.

**Yang belum bisa dibuktikan, dan jangan diklaim beres sebelum ada buktinya:**

| Hal | Kenapa belum terbukti | Bukti yang ditunggu |
|---|---|---|
| Perbaikan webhook DOKU (`sql/54`) | `doku_webhook_events` **masih 0 baris** — belum ada pembayaran masuk sejak deploy. Tabel kosong tidak membedakan "kode benar, belum ada trafik" dari "kode tidak menulis" | Satu pembayaran DOKU apa pun. Baris pertama yang muncul membuktikan jalurnya; kalau ada order jadi `paid` **tanpa** baris di sini, justru itu alarm |
| `CRON_NOTIFY_SECRET` di env Cloudflare | Balasan `401` muncul untuk dua sebab berbeda — kunci tidak diset, atau kunci salah — dan keduanya tak bisa dibedakan dari luar | `net._http_response` = **200** sesudah cron dijadwalkan. `401` di sana berarti env-nya tidak cocok dengan Vault |
| Email Resend benar-benar sampai | Akun sempat suspended 10 Agustus. `200` hanya membuktikan endpoint hidup | Satu email diterima peneliti, atau dashboard Resend |

**Commit yang menyusul rilis** (sudah tayang, di luar lingkup branch Soft DNA):
`ee7b057` dot indicator di tabel submissions · `4267c01` dot disembunyikan untuk
page completed + badge audit "tandai lunas" · `bf26145` ajakan JFU Form di helper
text input tautan manual · `d391fdd` `@fontsource/plus-jakarta-sans` dipasang.

⚠️ **Uji manual pasca-deploy masih menganggur seluruhnya** — §00F dan §00H
mencatat daftarnya, dan tidak satu pun sudah diklik. Rilis ini besar (81 commit);
sampai ada yang mengkliknya, "hijau" baru berarti build lolos, bukan flow benar.

### 00H. ✅ Tarikan `main` kedua + merge ke `main` — penahanan dicabut (2026-08-18)

**`main` bergerak lagi sesudah §00F.** Tiga commit baru (`2b0053b`, `733782f`,
`3f3c699`): import Google Form lewat tautan di Ask JFU AI, blok gambar di form
builder, promo bar JFU Form, dan **navigasi dashboard mobile-first**. Ditarik ke
branch lebih dulu supaya konfliknya diselesaikan di sana, bukan saat merge balik.

**Enam file konflik, tiga jenis penyelesaian.**

| File | Penyelesaian |
|---|---|
| `MultiStepForm`, `UnifiedHeader`, `ChatPage`, `StatusPage` | Ambil sisi branch. Perubahan `main` di keempatnya **hanya** membuang hamburger + `toggleSidebar`, dan branch sudah membuangnya lebih dulu lewat `AppNav`. Diverifikasi: `toggleSidebar`/`useOutletContext` nol kemunculan di **kedua** sisi, jadi tidak ada konsumen yang ditinggalkan |
| `StepOneMethodSelection` | Gabung. Layout accordion branch tetap; promo bar JFU Form dari `main` dibawa masuk, lalu diselaraskan ke Soft DNA dan diangkat ke i18n (5 kunci × 2 locale) — versinya di `main` memakai gradien indigo-ungu dan copy Indonesia hardcoded |
| `DashboardLayout` | Ambil sisi branch (`AppNav`) |

⚠️ **Merge ini MENGHAPUS bottom tab bar mobile yang `main` tambahkan di `2b0053b`.**
Bukan konflik teks — dua sistem navigasi utuh yang saling meniadakan: `main` =
sidebar desktop + tab bar bawah; branch = `AppNav` sticky atas + sheet mobile.
Keduanya tidak bisa hidup berdampingan apa adanya, karena hamburger `AppNav` akan
mengulang tujuan yang sama persis dengan tab bar di bawahnya.

**Keputusan pemilik produk 2026-08-18: `AppNav` saja.** Alasannya bukan umur
branch, melainkan cakupan: `AppNav` menampung switch bahasa, profil, dan sign out;
tab bar `main` hanya memindahkan halaman dan menjejalkan profil sebagai tab kelima.
Membuang `AppNav` berarti ketiga fungsi itu kehilangan rumah. **Nol destinasi
hilang** — `/dashboard`, `/dashboard/forms`, `/dashboard/chat`, profil, dan sign
out semuanya ada di `AppNav`; `/dashboard/submit` dicapai lewat kartu masuk di
`/dashboard`.

Kalau nanti tab bar diinginkan kembali (opsi hybrid: `AppNav` untuk identitas +
tab bar untuk perpindahan, hamburger mobile dilepas), markupnya masih utuh di
`git show 2b0053b -- multi-step-form/src/components/DashboardLayout.tsx`.

**Penomoran migrasi tidak bentrok.** `main` menambah `sql/58`; branch memakai
`49`/`54`/`55`. Deret `50`–`53` tetap kosong sesuai reservasi di §Peta dokumen.

**Gerbang:** `tsc -b --force` = **60 error**, identik baseline pra-merge (nol
tambahan — pakai `--force`, lihat peringatan di §00F); **14/14** uji lolos;
`npm run build` ✓.

**Seluruh migrasi 45–58 sudah ada di produksi** — diverifikasi satu per satu
2026-08-18, termasuk `sql/54` (`doku_webhook_events`) dan `sql/55` (`display_order`
NULL) yang sempat tercatat belum diterapkan. Jadi deploy ini **tidak** membawa
lubang DB-mendahului-kode baru; sebaliknya, ia menutup yang lama (§00A, §00B).

⚠️ **Belum diuji di browser.** Uji manual yang tertunda dari §00F masih berlaku,
plus dua yang baru: navigasi mobile sesudah tab bar `main` dihapus, dan promo bar
JFU Form di jalur bahasa Inggris.

### 00G. 🔒 Phase 4 ("Jadwalkan Iklan Lagi") diputuskan menunggu Task 13 (2026-08-18)

**Keputusan pemilik produk 2026-08-18: tombol swalayan baru dinyalakan SESUDAH Task 13.**
Bukan sesudah Task 11, dan bukan sesudah `reward_pools` saja seperti yang tercatat di
dokumen ini sejak 2026-08-04. Prasyaratnya diperbarui di tiga tempat: baris Phase 4 di
§"Ringkasan cepat", `[4]` di urutan rilis
[`plans/README.md`](superpowers/plans/README.md), dan roadmap Phase 4 di
[`2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md).

**Kenapa BUKAN Task 11 — ini yang paling mudah salah disimpulkan.** Task 11 langkah 2
sengaja mengubah `form_submissions_extend` jadi view dengan `INSTEAD OF` trigger supaya
seluruh penulis lama tetap jalan tanpa disentuh. Jadi kode Phase 4 yang ditulis hari ini
akan **selamat melewati Task 11 tanpa diedit**. Task 11 tidak memblokir Phase 4; ia cuma
merapikan identitas (`booking_id`) dan tautan tagihannya (`schedule_id`).

**Yang benar-benar mengunci: sistem tidak punya harga untuk jadwal ke-2.**
[`ScheduleForm.tsx:333`](../multi-step-form/src/components/schedule/ScheduleForm.tsx#L333)
menulis `total_cost: 0` saat membuat jadwal; harganya diketik admin belakangan di
`InvoiceForm`. Tidak ada satu pun jalur yang menghitungnya — `cost-calculator` hanya
melayani order pertama. Terukur di produksi 2026-08-17 atas seluruh 13 baris
`form_submissions_extend`:

| `total_cost` | Jumlah |
|---|---|
| Masuk akal (Rp 200.000 – Rp 3.191.250) | **6** |
| `0`, atau di bawah Rp 10.000 (`1.000`, `1.110`, `1.110`, `1.103`) | **7** |

Tujuh dari tiga belas bukan harga. Itu bukan data kotor yang perlu dibersihkan — itu
potret bahwa kolomnya memang diisi tangan tanpa validasi, dan **tidak ada rumus di
baliknya untuk dipakai ulang.** Task 13 yang melahirkan harga per jadwal (invoice jadi
sumber kebenaran, Extra Ad jadi sifat jadwal, voucher jadi milik tagihan).

**Lapisan kedua: keputusan hadiah yang belum pernah ditanyakan ke peneliti.**
`fetchBatchContext` ([`ScheduleForm.tsx:50`](../multi-step-form/src/components/schedule/ScheduleForm.tsx#L50))
bercabang di batch undian tujuan — jadwal yang berakhir di batch baru **wajib** mendanai
pool hadiah baru (`prize_per_winner` × `winner_count`); yang jatuh di batch berjalan pakai
`additional_prize_per_winner`. Keduanya sudah terpakai di produksi (5 baris
`is_new_month=true`; satu baris top-up Rp 10.000). Flow order utama tidak pernah
menanyakan ini karena ia selalu batch pertama. Inilah lubang yang `reward_pools` (8B-2)
obati — jadi prasyarat lama tetap berlaku, ia cuma bukan satu-satunya.

**Tiga risiko sisanya tumbuh seiring volume, bukan penghalang mutlak:**

| | |
|---|---|
| ~~`updatePaymentStatus` masih menyaring `form_submission_id` saja~~ **LUNAS 2026-08-26** | Fungsinya ternyata kode mati dan **dihapus** (`a22ea19`), bukan dipersempit — lihat §00T. Prasyarat Task 13 ini terpenuhi lewat peniadaan; jangan mencarinya lagi |
| Booking ID masih beda antara admin & peneliti | Pencarian sudah ditambal (§00E); **tampilannya belum**. Task 11 (`booking_id`) yang menyatukan |
| Perpanjangan order Kilat | Eksplisit di luar cakupan Task 11 — butuh pemilih gelombang, bukan rentang hari. Phase 4 harus menyembunyikan CTA-nya untuk order Kilat |

#### Temuan yang menghemat waktu saat Phase 4 benar-benar dikerjakan

**Separuh HILIR-nya sudah jadi, lengkap, dan sudah dua bahasa.** Begitu sebuah baris jadwal
ada tapi invoice-nya belum terbit,
[`airingPeriods.ts:230`](../multi-step-form/src/components/status/airingPeriods.ts#L230)
otomatis menjatuhkannya ke `awaiting_invoice` — chip abu-abu, label "Menunggu
Tagihan"/"Awaiting Invoice", plus kalimat SLA yang sudah ditulis di
`deriveOrderUiState.ts:292` ("slot sudah dipesan, menunggu admin menerbitkan tagihan
(maksimal 1 hari kerja)"). Sesudah admin menerbitkan tagihan, tombol "Bayar Sekarang" per
kartu muncul sendiri dan **sudah berfungsi** lewat `fetchSchedulePayments`. Yang hilang
cuma hulunya.

Konsekuensinya: ada **versi "ajukan, bukan pesan"** yang secara teknis bisa dikirim tanpa
menunggu apa pun — peneliti memilih rentang tanggal, barisnya lahir tanpa invoice, admin
memberi harga persis seperti hari ini, nol logika uang baru. Kuota slot pun sudah aman:
`fetchSlotAvailability` sudah menghitung extend
([`supabase.ts:1462`](../multi-step-form/src/utils/supabase.ts#L1462)).
**Sengaja tidak diambil 2026-08-18** — ia menambah antrean kerja manual admin alih-alih
menguranginya, dan permintaannya belum cukup besar (13 jadwal lanjutan seumur hidup, 11
order, dari 244 order selesai/tayang ≈ 4,5%). Dicatat di sini supaya kalau permintaannya
melonjak sebelum Task 13 selesai, opsi ini tidak perlu ditemukan ulang.

⚠️ **Kalau versi itu suatu saat diambil, ada satu keputusan yang wajib dijawab dulu:
siapa pemegang slotnya.** [`slotHold.ts:44`](../multi-step-form/src/utils/slotHold.ts#L44)
hanya melepas otomatis yang `slot_booked_by === 'user'`, dan lepasnya setelah 1 jam —
pengajuan yang menunggu admin sampai besok pasti kehilangan slotnya. Menandainya
`'admin'` menyelesaikan itu tapi membuka pintu peneliti menyerobot tanggal tanpa batas
waktu. Tidak ada jawaban default yang benar; ini keputusan produk.

### 00F. ✅ `main` (JFU Form) di-merge ke branch Soft DNA (2026-08-17)

**Insiden yang ditemukan saat menyiapkan merge — order produksi mati 4 hari.**
`StepCheckout` mulai mengirim `custom_form_id` sejak commit `6c42644`
(2026-08-13 15:02 WIB) dan ikut ter-deploy, tapi migrasinya tidak pernah dijalankan —
dari dua migrasi JFU Form hanya `custom_forms` yang diterapkan. PostgREST menolak
**seluruh** insert (`42703`), jadi setiap order baru gagal dengan toast "gagal menyimpan".
Order terakhir berhasil 13 Agustus 10.50 WIB; **nol order 14–17 Agustus** (laju sebelumnya
~5,4/hari). Kolomnya diterapkan & diverifikasi 2026-08-17, dan penomoran migrasinya
dibereskan di `main` lewat commit `05f921a` (`46`→`56`, `47`→`57`) — dua deret nomor sempat
tumbuh paralel, dan git **tidak** menganggap itu konflik karena nama filenya berbeda.

**Bentuk merge-nya.** `main` menyentuh 25 file, 19 di antaranya file baru (Form Builder
berdiri sendiri). Irisannya 8 file, 6 konflik. Seluruh file JFU Form masuk **identik**
dengan `main` — nol modifikasi.

**Keputusan pemilik produk: flow baru Soft DNA yang menang**, fitur `main` disisipkan ke
dalamnya. Yang perlu disesuaikan:

| Titik | Penyesuaian |
|---|---|
| `StepCheckout` | Konflik besar karena branch kita memindahkan submit ke `submitOrder.ts`. Ambil versi kita; baris `custom_form_id` dipasang di lokasi barunya |
| Rute `/dashboard/submit` | Branch kita mengalihkannya ke `submit-iklan`, dan `<Navigate>` polos **membuang query string** — `?custom_form_id=` hilang diam-diam, halaman terbuka normal tanpa prefill. Dibuatkan `RedirectPreservingQuery`; CTA "Sebar" juga diarahkan langsung ke rute kanonik |
| Entry point | `main` menambah "JFU Form" ke **sidebar** yang sudah kita hapus. Dipindahkan ke `AppNav`: item **"The Form"** yang tadinya `<span>` mati berbadge "Soon" kini `<Link>` hidup ke `/dashboard/forms`, badge jadi "Beta", desktop & mobile, dengan state aktif mencakup seluruh prefix `/dashboard/forms` |
| `StepSurveyDetails` | Gate profil (kita) + `isJfuImport`/`clearJfuOrigin` (main) dipertahankan keduanya. Tautan ganti-metode disembunyikan untuk impor JFU dengan tidak mengoper `onSwitchToGoogle` |
| `StepOneFormFields` | JSX versi kita dipakai; porting `fieldsReadOnly` (9 titik), spanduk "diisi otomatis", dan blokir keras data pribadi ke gaya kartu kita |
| `MultiStepForm` | Effect prefill dipertahankan utuh. `setCurrentStep(1)` kebetulan tetap benar — step 1 = `StepSurveyDetails` di kedua flow |

**Nomor step berbeda antar flow** — dicatat supaya tidak menjebak nanti:

| Step | main (lama) | Soft DNA (baru) |
|---|---|---|
| 1 | StepSurveyDetails | StepSurveyDetails |
| 2 | StepSchedule | **StepCheckout** |
| 3 | StepCheckout | **StepSchedule** |

**Gerbang:** `tsc -b` **nol error baru** (satu error warisan `main` di
`QuestionLogicBuilder.tsx` sekalian dibereskan); `npm run build` lolos.

⚠️ **Koreksi angka 2026-08-18.** Sesi merge mencatat "37 → 37". Perbandingannya benar —
sama-sama `tsc -b` polos, sebelum & sesudah — tapi **angka mutlaknya salah**: `tsc -b`
bersifat inkremental dan hanya melaporkan error untuk proyek yang ia bangun ulang, jadi 37
itu hasil sebagian. Diukur ulang dengan `tsc -b --force` di worktree terpisah:
`6ba4123` (tip sebelum merge) = **60**, `4893c10` (commit merge) = **60**. Nol error baru
tetap berlaku. **Pakai `--force` untuk angka gerbang**, atau angkanya akan berbeda-beda
tergantung isi cache. (Angka **75** yang tercatat di rencana Task 11 & 13 berasal dari era
pengukuran lain dan belum diadu ulang dengan metode ini.)

⚠️ **Belum diuji di browser.** Yang paling perlu diklik: CTA "Sebar via Jakpat" → prefill →
lanjut sampai bayar, dan satu order Google Form biasa untuk memastikan `custom_form_id`
NULL tidak mengganggu.

### 00E. ✅ Pencarian admin kini menemukan Booking ID jadwal ke-2 dst. (2026-08-17) — nol SQL, frontend saja

**Celahnya:** Booking ID yang dilihat peneliti adalah `ad_schedules.source_id`
([`SchedulePhase.tsx:624`](../multi-step-form/src/components/status/SchedulePhase.tsx#L624)),
dan kolom itu **berpindah tabel** — id `form_submissions` untuk jadwal ke-1, id
`form_submissions_extend` untuk jadwal ke-2 dst. Kotak pencarian admin hanya mencocokkan
`form_submissions.id`. Terukur di produksi: dari **13** Booking ID jadwal lanjutan, **nol**
yang bisa ditemukan. Peneliti mengutip kodenya ke support, admin mengetiknya, hasilnya
kosong — tanpa error, jadi tidak ada yang sadar pencariannya yang salah.

Sisi admin memang menyebut jadwal lanjutan dengan id yang berbeda dari sisi peneliti: agenda
([`ScheduleAgenda.tsx:102`](../multi-step-form/src/pages/dashboard/schedule/ScheduleAgenda.tsx#L102))
dan drawer-nya ([`ScheduleEntryDrawer.tsx:218`](../multi-step-form/src/pages/dashboard/schedule/ScheduleEntryDrawer.tsx#L218))
menampilkan `submissionId` untuk **semua** baris satu order. **Itu sengaja belum disamakan** —
lihat catatan di rencana Task 11.

**Yang diperbaiki**, seluruhnya di `getFormSubmissionsPaginated`
([`supabase.ts`](../multi-step-form/src/utils/supabase.ts)):

- Pencarian id kini juga melakukan lookup ke `ad_schedules.source_id` lalu memetakan balik ke
  `submission_id`. Satu lookup menutupi kedua bentuk sekaligus, karena baris ordinal 1 memang
  punya `source_id = submission_id`.
- Pencocokan langsung ke `form_submissions.id` **tetap dipertahankan** di sampingnya: **6
  order belum punya baris `ad_schedules`** sama sekali, dan menyerahkan pencarian sepenuhnya
  ke cermin akan menghilangkan mereka.
- Kegagalan lookup cermin **tidak menjatuhkan pencarian** — ia mengecil kembali ke perilaku
  lama dan menulis `console.warn`.

**Perubahan perilaku yang disengaja:** pencarian **id** kini melewati filter bulan.
Sebuah id menunjuk tepat satu order, jadi menyaringnya lagi per bulan tidak menyempitkan
apa pun — ia cuma menyembunyikan, dan menyembunyikan hampir semuanya: 985 order tersebar di
16 bulan, cuma 60 di bulan berjalan, jadi **~94% pencarian id akan kosong** hanya karena
admin sedang membuka bulan lain. Tanpa ini perbaikan di atas nyaris tak terasa. Pencarian
**teks** tetap terikat bulan.

**Verifikasi:**

| | |
|---|---|
| 13 Booking ID jadwal lanjutan | **13/13** memetakan ke tepat satu order yang benar (sebelumnya 0) |
| Ambiguitas prefiks 8-hex | **998 kode, 0 ambigu** — tidak ada kode yang menunjuk >1 order |
| Sintaks PostgREST | `and()` bersarang di `or=()`, rentang prefiks uuid, dan input HURUF BESAR diuji langsung ke server produksi |
| `tsc -b` | **nol error baru, nol hilang** (angka mutlak "37" yang tercatat di sini semula hasil build inkremental sebagian — lihat koreksi di §00F) |
| `npm run build` | lolos |

⚠️ **Belum diuji di browser.** Yang dikerjakan baru typecheck, build, dan simulasi SQL atas
data produksi.

**Belum dikerjakan (sadar, bukan lupa):** papan Schedule masih mencari judul + nama peneliti
saja, tanpa id sama sekali
([`ScheduleBoardPage.tsx:154`](../multi-step-form/src/pages/dashboard/ScheduleBoardPage.tsx#L154)).

### 00C. ✅ Iklan auto-publish tak lagi tenggelam ke bawah list (2026-08-13) — `sql/55` diterapkan & terverifikasi di prod

**Nol perubahan frontend.** `ensure_survey_page()` (Phase 1, `sql/40`/`42`) sengaja menyetel
`display_order = MAX(display_order) + 1` untuk setiap halaman iklan yang dibuat otomatis
saat order lunas — supaya kartu berbanner default tidak jadi yang paling mencolok di
listing. Karena Page Calendar (jalur pembuatan manual) sudah dipensiunkan (§00), hampir
semua iklan baru lewat jalur trigger ini, dan MAX+1 selalu menghasilkan angka tertinggi
baru — jadi tiap iklan baru selalu berakhir di ujung bawah pita "sudah ditempatkan"
(`orderBand()` di `src/utils/adOrdering.ts`) sampai admin sempat menyeretnya naik lewat tab
Live. Diverifikasi ke produksi sebelum fix: `MAX(display_order) = 40`, dan pemiliknya
persis halaman yang paling baru dibuat (12 Agu 21:50 WIB).

Keputusan produk 2026-08-13: konsekuensinya lebih besar daripada manfaatnya — performa
iklan pembayar bergantung pada admin sempat membuka tab Live, dan itu gampang terlupa.

**Fix:** [`sql/55_auto_page_display_order_neutral.sql`](../multi-step-form/sql/55_auto_page_display_order_neutral.sql)
— `CREATE OR REPLACE` atas `ensure_survey_page()` (basis: versi `sql/42` yang aktif di
produksi, dicocokkan lewat `pg_get_functiondef` sebelum ditulis), satu nilai yang berubah:
`display_order` balik ke `NULL` saat insert, sama seperti jalur manual `PageBuilderModal.tsx`.
Guard Kilat `sql/42` tidak disentuh. `orderBand()` sudah memperlakukan halaman non-extra-ad
ber-`display_order` NULL sebagai pita TOP, jadi tidak ada kode frontend yang perlu berubah.

✅ **Diterapkan ke database produksi 2026-08-13.** Diverifikasi lewat `pg_get_functiondef`:
`display_order` di INSERT sudah `NULL`, komentar fungsi menyebut `sql/55`, dan guard Kilat
(`IF v_sub.distribution_type = 'kilat' THEN RETURN NULL`) masih utuh — tidak tertimpa balik.

**Backfill 49 baris lama — selesai 2026-08-13.** Awalnya ditahan karena datanya tidak bisa
dibedakan mana bekas trigger murni dan mana bekas drag manual admin — dipecahkan lewat dua
sinyal yang terbukti akurat 100% (nol anomali di seluruh 49 baris):

1. `set_survey_pages_order()` menormalkan SELURUH daftar live dalam satu `UPDATE` — jadi
   baris yang berbagi `updated_at` persis sama pasti satu sesi simpan admin, dan nilainya
   pasti rentang rapat `0..N-1`. Diverifikasi: **8 klaster, 33 baris, seluruhnya rapat
   sempurna tanpa satu pun celah** — bukti kuat, bukan dugaan.
2. Sisa baris "sendirian" (`updated_at` tak dibagi baris lain) diuji kontradiksi: kalau ada
   baris LAIN yang dibuat lebih dulu tapi `display_order`-nya lebih besar/sama, baris
   "sendirian" itu **mustahil** murni trigger (`MAX+1` naik monoton) — pasti pernah
   disentuh manual. 4 dari 16 baris solo gagal uji ini dan diikutkan ke daftar dipertahankan.

Hasil: **37 baris dipertahankan** (33 klaster + 4 solo-kontradiksi — kemungkinan bekas
susunan manual admin), **12 baris di-backfill ke `NULL`** (solo, lolos uji kontradiksi; 6 di
antaranya malah `updated_at = created_at` persis — belum tersentuh apa pun sejak dibuat
trigger). `survey_pages` sekarang: 268 baris `display_order NULL`, 37 baris terisi.

### 00. Page Calendar sudah dipensiunkan ✅ (2026-08-08) — sisa: adu visual di browser

**`SchedulingPage.tsx` + `SchedulingPage.css` dihapus** atas keputusan pemilik produk
2026-08-08: papan Schedule dinilai sudah lebih dari cukup. Ikut terhapus karena
kehilangan seluruh pemanggilnya: `getScheduledPages()` dan
`getPendingSlotsWithoutPage()` di `supabase.ts` (124 baris). `react-big-calendar` +
`moment` **tidak lagi diimpor di mana pun** — kandidat pencabutan dependensi, tapi
dibiarkan dulu karena mencabut paket di tengah branch tidak sepadan risikonya.

⚠️ **Satu kemampuan hilang, dan ini catatannya supaya tidak dikira bug nanti.**
Dari Page Calendar admin bisa membuat halaman iklan untuk order yang **belum lunas**;
jalur drawer tidak bisa (`canBuildPage = isPaid || isLegacyActive`). Terukur saat
penghapusan: **10 order** ada di keadaan itu (9 `slot_reserved` + 1
`waiting_payment` yang benar-benar belum bayar). Sisanya yang tampak "belum lunas"
ternyata sudah — 10 dari 19 `slot_reserved` ber-`payment_status` lunas, dan
8 order `paid` tanpa halaman semuanya tetap terlayani drawer.

⚠️ **Penjaga `paymentStatus` di `PageBuilderModal` kini TIDAK PUNYA PEMANGGIL.**
`SchedulingPage` satu-satunya yang mengopernya. Selama tidak diisi, `isUnpaid`
selalu `false` dan ketiga penjaganya (peringatan kuning, tombol publish mati,
auto-publish ditahan) diam. Sengaja tidak dihapus — penjaganya benar dan murah —
tapi **jangan dibaca sebagai "publish order belum lunas sudah dijaga"**. Kalau
disambungkan lagi: turunkan dari `deriveLifecycle().isPaid`, **jangan** dari
`form_submissions.payment_status` mentah (lihat §Jebakan no. 3).

Yang tersisa: **adu visual di browser**, dan itu butuh mata manusia. Pembandingnya
sudah tidak ada di layar, jadi kalau ada yang janggal, rujuk `git show` pada commit
sebelum penghapusan.

Papan barunya bertab **Agenda · Iklan · Kilat** (bentuk final per 2026-08-08,
commit `08a2cd4`..`e808189`):

- [ ] **Agenda** — tanggal, jam, dan status halaman masuk akal untuk survei yang
      dikenal. Sisi data sudah diadu relasional dan nol (§4), jadi yang diuji di
      sini murni penyajiannya
- [ ] **Kilat** — kisinya rapi: 5 kolom sama lebar, judul terpotong satu baris,
      tidak ada sel yang melebar sendiri (regresi `1fr` — §Jebakan no. 13)
- [ ] **Iklan** — papan kapasitas baru, **tidak punya pembanding**. Yang bisa diadu
      cuma angkanya: cocokkan `n/4` sebuah hari dengan kalender pemesanan di wizard
      (`StepSchedule`) untuk tanggal yang sama. Kalau berbeda, `occupiesSlot()` dan
      `fetchSlotAvailability` sudah menyimpang
- [ ] Klik entri dari order **bulan lampau** → drawer terbuka dan **tetap terbuka**
- [ ] Klik entri **iklan regular** → mendarat di tab Regular, bukan tab Kilat kosong
      (bug `setDistTab('kilat')` yang ditutup di `d7639df` — inilah ujinya)
- [ ] Pil **belum dijadwalkan** dinyalakan → 37 order tanpa tanggal muncul, dan yang
      berstatus lunas benar-benar ada di sana
- [ ] Mobile: papan terbaca di 375px, nol scroll horizontal pada tab Agenda
      (tab Iklan & Kilat memang menggulung mendatar — kisinya `min-w-[900px]`/`720px`)

⚠️ **Menghapus `SchedulingPage` membuang satu kemampuan nyata — jangan dihapus
sebelum ini dipindahkan.** Dari Page Calendar admin bisa membuat halaman untuk
order yang **belum lunas** (`getPendingSlotsWithoutPage` memasukkan
`slot_reserved`/`waiting_payment`). Jalur drawer tidak bisa: `PageAction`
`disabled={!canBuildPage}` dan `canBuildPage = isPaid || isLegacyActive`.
Selain itu **hanya `SchedulingPage` yang mengoper prop `paymentStatus`** ke
`PageBuilderModal` — prop itu yang menyalakan peringatan "belum lunas" dan
**mematikan tombol publish**. Mount di `InternalDashboard.tsx:1318` tidak
mengopernya; kalau `SchedulingPage` dihapus begitu saja, penjaga itu hilang diam-diam.

### 0. Uji jembatan Kilat ujung-ke-ujung ⬅️ uji manual paling mendesak

`sql/42` sudah diterapkan **dan diverifikasi** di produksi 2026-08-04:

- kolom `kilat_slot_hour` ada;
- CHECK menolak jam di luar 8/11/14/17 (diuji dengan `= 9`, ditolak `23514`);
- guard Kilat aktif — `ensure_survey_page()` mengembalikan `NULL` untuk order
  Kilat yang seluruh prasyarat lainnya lolos;
- **nol halaman iklan menempel di order Kilat mana pun**, jadi tidak ada
  peninggalan `sql/40` yang perlu dibereskan.

Frontend commit `c554880` sudah **dideploy** 2026-08-04 (laporan admin). Yang
**belum** dijalankan: urutan uji manual di dashboard admin:
tab Regular Ads → **Jadikan Kilat** → tab Kilat → Reserve Slot (grid gelombang
08/11/14/17, hari kerja saja) → Payment → Mark as Paid.

Yang paling penting dicek: **sesudah order Kilat lunas,
`SELECT * FROM survey_pages WHERE submission_id = '<uuid>'` harus kosong.** Kalau
ada isinya, guard Kilat di `ensure_survey_page()` tidak aktif — kemungkinan besar
`sql/40` dijalankan ulang sesudah `sql/42` dan mengembalikan definisi lama.
Perbaikannya: jalankan `sql/42` bagian 2 lagi.

Sisa verifikasi ada di bagian bawah `sql/42_kilat_slots.sql`.

### 0B. Papan jadwal Kilat di Ads Schedule ⬅️ sudah deploy, uji manual belum

Commit `a4fc499`, **dideploy 2026-08-05** bersama `b78a7aa`. Halaman **Ads Schedule** sekarang punya toggle **Iklan |
Kilat**: mode Kilat menampilkan papan mingguan (4 gelombang × Senin–Jumat)
lintas semua order Kilat, dengan klik-untuk-buka-drawer ke order itu di tab
Submissions (`fetchKilatSchedule` + `KilatScheduleBoard.tsx`).

Sekalian menutup lubang nyata yang sebelumnya ada: order Kilat selalu muncul di
kalender iklan (mode Iklan) sebagai kartu "Page belum dibuat" dengan tombol
**Create Page** yang masih berfungsi. Mengkliknya insert langsung ke
`survey_pages` lewat `PageBuilderModal` — melewati guard `sql/42` sepenuhnya
(guard itu cuma hidup di trigger DB, bukan di jalur ini) dan menimpa jadwal
Kilat ke 15.00 WIB. Ditutup dua lapis: `getPendingSlotsWithoutPage` tidak lagi
menarik order Kilat, dan `PageBuilderModal.handleSave` menolak `submissionId`
berjalur Kilat sebagai sabuk pengaman kedua.

Diverifikasi: `npx tsc --noEmit` bersih (dibanding baseline sebelum perubahan
ini — nol error baru), `npx vite build` sukses. **Belum diuji manual di
browser.** Sebelum dianggap selesai:

**Insiden nyata yang mengonfirmasi lubang ini benar ada** (ditemukan
2026-08-04 lewat kanari `countKilatPagesLeak` sesaat setelah papan jadwal
dijalankan admin): satu order Kilat lunas (`e9cb5944-3a24-4093-8621-b36d2a7fe8d9`,
"JFSUHUD Pariwisata Sunda", `kilat_slot_hour` masih `null`) punya baris
`survey_pages` (`f759f097-35ab-4d1b-b54b-e4c0b7e09faf`) dengan
`is_published = false`. Dikonfirmasi lewat `select prosrc ilike '%kilat%' ...`
bahwa guard `ensure_survey_page()` masih utuh di produksi saat itu — jadi
BUKAN `sql/40` tertimpa ulang. `is_published = false` juga tidak cocok dengan
insert trigger sql/40 yang selalu `TRUE` (baris 199). **Koreksi setelah dikonfirmasi admin:** dugaan awal (tombol Create Page manual)
salah. Penyebab sebenarnya: order ini tadinya **iklan regular** dengan halaman
yang sudah terbit otomatis oleh `sql/40`. Kebijakan berubah dan order perlu
pindah ke Kilat — admin meng-unpublish halaman itu dulu (untuk lolos blokir
"halaman sudah published" di `convertDistributionType`), lalu klik **Jadikan
Kilat**. `is_published = false` + `requires_banner_update = false` cocok
persis dengan insert `sql/40` (bukan insert manual `PageBuilderModal`), dan
jeda 14 menit antara `page_created_at` dan `submission_updated_at` cocok
dengan urutan: order lunas → halaman terbit otomatis → admin unpublish →
admin konversi. Ini alur admin yang sah untuk kasus khusus (perubahan
kebijakan), bukan kesalahan — tapi `convertDistributionType` sebelumnya tidak
pernah membersihkan baris `survey_pages` yang tersisa setelah blokir
published-nya lolos, jadi baris itu tertinggal yatim piatu selamanya.

**Fix:** commit `b78a7aa` — `convertDistributionType` sekarang menghapus baris
`survey_pages` yang tersisa (kalau ada) sebagai bagian dari konversi ke Kilat.
Blokir keras untuk halaman yang **masih** published tidak berubah sama sekali
— admin tetap harus stop manual dulu, persis alur yang sudah berjalan. Opsi
"satu klik penuh" (auto-unpublish halaman yang masih live) dipertimbangkan dan
**sengaja ditolak** — itu akan menghapus blokir keras yang sengaja dipilih di
sesi perencanaan awal, dan bisa menggelapkan iklan yang sedang tayang tanpa
konfirmasi terpisah.

Baris `f759f097-...` (peninggalan dari sebelum fix ini) **sudah tidak ada** —
dicek 2026-08-05, `0` baris. Dicek sekalian: **nol** halaman iklan menempel di
order Kilat mana pun di seluruh produksi, jadi tidak ada peninggalan lain yang
tertinggal.

1. Order Kilat berjadwal aktif TIDAK lagi muncul di kalender iklan (mode Iklan)
   dalam bentuk apa pun, dan tombol Create Page pada order **regular** tanpa
   halaman tetap berfungsi seperti biasa.
2. Mode Kilat: gelombang 08.00 tampil di baris 08.00 (bukan 15.00 seperti
   kalender iklan); isi satu gelombang sampai 2/2 lalu cocokkan dengan grid di
   `KilatScheduleStep` (dua layar harus sepakat); order tanpa
   `kilat_slot_hour` muncul di baris "Tanpa Gelombang"; navigasi ke minggu
   lampau tetap menampilkan order `completed`; Sabtu/Minggu tidak dirender.
3. Klik entri dari order yang dibuat **bulan lalu** → pindah ke tab
   Submissions, sub-tab Kilat, drawer terbuka dan **tetap terbuka** (kasus yang
   gagal kalau bulan tidak ikut disetel bersama pencarian).

### 1. Jalankan checklist Phase 0

Sekarang deploy sudah terjadi, sisanya tinggal menjalankan
[`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md).
Bagian **§2, §3, §5 wajib**; sisanya kalau sempat. Checklist itu sudah dikoreksi
2026-08-04 — §8 dulu menyuruh memastikan Phase 1 *diam*, sekarang kebalikannya
karena `sql/40` sudah aktif.

Kenapa tetap penting dicek meski sudah deploy: sebelum deploy ini, yang tayang
menjual kapasitas slot yang tidak ada (perpanjangan tidak terhitung), menagih
insentif batch dua kali untuk jadwal ke-3+, dan bisa menggelapkan iklan yang
sedang berjalan saat admin melakukan reschedule — checklist ini yang
membuktikan ketiganya benar sudah tidak terjadi lagi di produksi.

### 2. Phase 3 sudah bisa dimulai — penghalangnya habis ✅

**Semua penghalang sudah hilang per 2026-08-05 sore.** `ad_schedules` mengenali
Kilat (Task 8D, `sql/45`), dan `feat/dashboard-soft-dna-navbar` **sudah menarik
`main`** (merge commit di branch itu, 2026-08-05). Branch tidak lagi tertinggal
18 commit; `git log --oneline HEAD..main` kosong.

Yang tersisa **bukan** penghalang, melainkan urutan kerja biasa: Task 9 harus
jalan sebelum Phase 3, dan alasannya bukan formalitas:

`ad_schedules.status` menyalin `submission_status`, dan kolom itu masih memuat
**dua sumbu sekaligus** (review + tayang). Akibatnya pemetaan di `sql/41` harus
menjatuhkan setiap nilai sumbu-review ke `waiting_payment`. Terukur 2026-08-05:

| `status` di cermin | Aslinya di sumber | Baris |
|---|---|---|
| `waiting_payment` | `in_review` | **393** |
| `waiting_payment` | `approved` | **97** |
| `waiting_payment` | `slot_reserved` | **40** |
| `waiting_payment` | `waiting_payment` | 1 |
| `live` / `scheduled` / `paid` / `completed` / `cancelled` | dirinya sendiri | 338 |

**531 dari 869 baris — 61% — runtuh jadi satu keranjang.** Tab "Jadwal Iklan"
terpadu yang dibangun hari ini tidak bisa membedakan "belum direview" dari "sudah
disetujui" dari "slot sudah dipesan". Itu bukan kekurangan kosmetik; itu justru
informasi yang paling dibutuhkan admin di layar penjadwalan. Memisahkan kedua
sumbu itu **adalah** Task 9.

Jadi Phase 3 dimulai begitu Task 9 jalan. Task 9 menulis ulang
`src/components/status/deriveOrderUiState.ts`, `airingPeriods.ts`, dan
`SchedulePhase.tsx` — ketiganya lahir di branch revamp visual dan tetap hanya ada
di sana.

**Diputuskan 2026-08-05: Task 9–12 dan Phase 3 dikerjakan DI branch
`feat/dashboard-soft-dna-navbar` itu sendiri**, bukan di branch baru dari `main`.
Larangan menumpang branch itu dicabut karena tidak bisa dipatuhi — file yang
ditulis ulang Task 9 memang lahir di sana. Konsekuensi yang diterima sadar: revamp
visual dan sisa Phase 2 jadi **satu unit rilis**, tidak bisa di-revert
sendiri-sendiri.

**Diputuskan 2026-08-05 juga: Phase 3 duluan, design-system dashboard
belakangan.** Task 1 design-system membalik urutan cascade `styles.css` dan
menyentuh seluruh app — terlalu berisiko-lebar untuk branch yang sudah memuat
revamp visual + sisa Phase 2. Konsekuensi diterima: recipe warna/spacing tab
Phase 3 kemungkinan ditulis ulang belakangan.

#### Yang dikerjakan sesi merge (2026-08-05 sore)

Merge `main` → branch berjalan persis seperti diperkirakan: **nol konflik kode**,
tepat **dua konflik dokumentasi** (`docs/jadwal-iklan-progress.md` dan
`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`), keduanya diselesaikan
dengan mengambil versi `main` — versi branch adalah potret pekerjaan yang sudah
selesai dan hanya akan menghidupkan kembali informasi kedaluwarsa.

Baseline setelah merge: **`tsc -p tsconfig.app.json` = 74 error** (sebelum merge
75 di branch, 76 di `main`; yang hilang persis satu `TS6133 isKilat` yang
dibersihkan bersama pemecahan berkas). `vite build` hijau, ketiga test harness
lolos. **Angka 74 ini yang jadi baseline Task 9.**

Dua pembersihan struktural ikut dituntaskan supaya Task 9/10 tidak membaca kode
yang menyesatkan:

- **Formatter uang disatukan** di `src/utils/currency.ts`. Sebelumnya ada empat
  implementasi `formatIDR` yang tidak sepakat (satu membayangi yang kanonik di
  dalam modulnya sendiri, satu lagi memakai nama `formatRupiah` padahal
  bentuknya `formatIDR` — tepat di `SchedulePhase.tsx`) plus lima salinan
  `formatRupiah`. Sekarang nol formatter uang di luar `utils/currency.ts`.
- **`SubmissionDetailSheet.tsx` dipecah** 1365 → 330 baris + lima berkas di
  `submissions/tabs/`. Relevan langsung untuk Task 10: "Mark as Paid" yang harus
  jadi per-jadwal sekarang ada di `submissions/tabs/PaymentTab.tsx` (246 baris),
  bukan di baris ~982 dari 1365.

Prosedur lengkap Phase 3 ada di
[`superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md`](superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md).
**Itu titik masuk sesi berikutnya — mulai dari Task 9.**

### 3. Uji manual yang masih menganggur

Tidak memblokir apa pun, tapi belum pernah dijalankan:

- **Jembatan Kilat ujung-ke-ujung** (§0) — urutan Jadikan Kilat → Reserve Slot →
  Payment → Mark as Paid di dashboard admin.
- **Papan jadwal Kilat di browser** (§0B) — tiga poin di akhir bagian itu.
- **Checklist Phase 0** (§1).
- **Task 8C di layar** — sudah dibuktikan di tingkat kode (lihat "Yang sudah
  selesai"), tinggal dilihat mata.

### 4. Verifikasi Task 8 — ✅ SELESAI SELURUHNYA (2026-08-08)

Semuanya **nol**:

| Periksa | Hasil |
|---|---|
| `(2a)` ordinal ganda dalam satu order | **0** |
| `(2b)` lubang di deret `1..n` | **0** |
| ordinal tidak mulai dari 1 | **0** |
| `(4b)` `period_batch` perpanjangan vs sumber | **0** |
| sinkron menyeluruh jadwal pertama (973 baris) — tanggal, durasi, biaya | **0** |
| sinkron menyeluruh perpanjangan — tanggal, durasi | **0** |
| baris cermin yatim (sumbernya sudah hilang) | **0** |
| order tanpa baris cermin | **0** |

`(4a)` tidak berlaku: **`form_submissions` tidak punya kolom `period_batch`** —
kolom itu hanya ada di `form_submissions_extend` dan `ad_schedules`. Jadwal pertama
selalu batch 1 secara definisi.

⚠️ **Cara mengukurnya sempat salah, dan salahnya persis jebakan no. 5.** Pengukuran
pertama melaporkan **16 baris menyimpang** — semuanya Kilat. Yang menyimpang bukan
datanya melainkan querynya: ia mengadu `start_date` Kilat dengan
`airing_instant_of_date()` (aturan regular, 15.00 WIB). Kilat memakai
`kilat_instant_of()`. Dengan helper yang benar hasilnya nol. **Dua jalur, dua
helper — juga saat menulis query verifikasi, bukan cuma saat menulis kode.**

**`(7)` `SELECT cron_activate_extends();` dijalankan dengan pengawasan pemilik produk,
2026-08-08 malam — nol perubahan, dan hasilnya diprediksi lebih dulu.**

Sidik jari diambil sebelum & sesudah atas `form_submissions_extend` (12 baris:
id · status · payment_status · `updated_at` sebagai epoch) dan atas seluruh
`survey_pages` milik order berjadwal ganda (jendela terbit + `current_period_batch`).
**Keduanya identik**: `f36426cd…` dan `c8b631ea…`. Cacah status tak bergeser —
1 `live`, 1 `scheduled`, 7 `completed`.

Prediksinya ditulis sebelum tombol ditekan, dan itu yang membuat ujinya berarti:
langkah 1 nol baris (satu-satunya jadwal `scheduled` lunas baru mulai 10 Agu),
langkah 2 menulis satu baris bernilai **identik** (halaman `untitled-former` sudah
sinkron), langkah 3 nol baris (yang `live` baru berakhir 10 Agu).

Sekalian terukur: cron `activate-extends` (`*/15 * * * *`) sudah jalan **6.250 kali,
100% `succeeded`**, sejak 4 Juni. Jadi yang diuji bukan "apakah ia jalan" melainkan
"apakah aman dipanggil manual" — dan jawabannya ya, ia idempoten.

> **Kenapa fungsi ini penting, karena mudah dikira sepele.** Langkah 2-nya —
> mengarahkan ulang `survey_pages.publish_start_date/end_date/current_period_batch`
> ke jadwal yang sedang tayang — adalah **satu-satunya** mekanisme yang membuat
> "1 halaman iklan, N jadwal" bekerja: halaman itu **jendela yang berpindah**, bukan
> milik satu jadwal. Tanpanya, peneliti yang membayar jadwal ke-2 tidak akan pernah
> tayang: `SurveyPage` menggerbang tampilan pada tanggal terbit yang masih menunjuk
> jendela lama, dan `current_period_batch` yang tertinggal menaruh respondennya di
> **pool hadiah yang salah**. Uang masuk, tidak ada yang keluar, dan DB berkata
> "scheduled". Cakupannya sempit — hanya order berjadwal ganda, 12 baris seumur hidup
> sistem — tapi justru itu yang membuatnya senyap.
>
> ⚠️ **Task 11 wajib mempertahankan perilaku ini utuh.** Sesudah
> `form_submissions_extend` jadi view, langkah 2 harus tetap menemukan barisnya.

---

## Yang sudah selesai

### Phase 2 Task 9B + 12 — dashboard peneliti, commit `e91f52f`..`433153c` (2026-08-08)

Nol migrasi. Seluruhnya frontend, dan **RLS-nya sudah siap sejak `sql/46`**:
policy `Owner or admin can view ad_schedules` predikatnya persis sama dengan
`getFormSubmissionsByUser` (`auth_user_id = uid` ATAU `auth_user_id IS NULL AND
email = jwt email`), jadi tidak ada order yang bisa tampil di daftar peneliti tapi
kehilangan jadwalnya.

Aturan dua sumbu tinggal di satu berkas baru,
[`status/scheduleAxes.ts`](../multi-step-form/src/components/status/scheduleAxes.ts);
`deriveOrderUiState`, `buildScheduleCards`, dan `ReviewPhase` semuanya lewat sana.

**Algoritma lama dan baru diadu berdampingan lewat SQL atas seluruh 971 order**
— pola yang sama yang membuktikan 8B-1 dan 8D. 664 identik, 307 berubah, dan
ketiga kelompoknya perbaikan:

| Jumlah | Dulu | Kini | Isinya |
|---|---|---|---|
| 237 | menunggu bayar | **menunggu review** | `in_review` yang memilih tanggal saat checkout, lalu ditagih sebelum sempat direview |
| 65 | menunggu bayar | **perlu revisi** | ditandai **spam**, tetap disuruh bayar |
| 5 | menunggu bayar | **perlu revisi** | **ditolak**, tetap disuruh bayar |

Dua jebakan yang baru ketahuan justru saat mengadu — keduanya sudah dikunci di
kode, dan urutan cabang di `orderStepOf` tidak boleh dibalik karenanya:

- **Lunas mengalahkan review.** 156 order ber-`submission_status = 'in_review'`
  tapi `payment_status = 'paid'` — sudah tayang, sudah selesai, hanya kolomnya
  tidak pernah dimajukan. Menaruh sumbu review di atas akan memundurkan ke-156
  order itu jadi "menunggu review" di layar penelitinya sendiri.
- **Tanpa tanggal = belum memilih jadwal**, apa pun kata sumbu tayang. 4 order
  `slot_reserved` tidak punya tanggal sama sekali (kejanggalan yang sudah dicatat
  `sql/46`); menyuruh mereka membayar sesuatu tanpa jendela tayang adalah jalan buntu.

**Ikut terbetulkan tanpa diminta: Kilat.** Tanggal cermin sudah instant yang benar
(gelombang 08/11/14/17 WIB), jadi `normalizeScheduleDate` yang memaksa 15.00 tidak
dipakai lagi di jalur ini — dan Mimin AI berhenti memberi tahu peneliti Kilat bahwa
iklannya mulai pukul 15.00.

Paritas kolom sebelum menukar sumber, semuanya **0 selisih**:

| Cakupan | Hasil |
|---|---|
| ordinal 1 — 974 baris × 12 kolom vs `form_submissions` | **0** |
| ordinal 2+ — 12 baris × 16 kolom vs `form_submissions_extend` | **0** |

Karena itu kartu jadwal ke-2 dst. tidak berubah sedikit pun. Nomor kartunya kini
dari `ad_schedules.ordinal` (yang dinomori ulang `resync_ad_schedule_ordinals()`),
bukan dari posisi array — jadi "Jadwal Iklan 2" di layar peneliti dan di papan admin
akhirnya baris yang sama.

**`components/ProgressTracker.tsx` dihapus.** `getCurrentStepIndex` dan
`computeEffectiveExtendStatus` kehilangan seluruh pemanggilnya. Sisanya,
`normalizeScheduleDate`, pindah ke `utils/airing-window.ts` tempat aturan waktu WIB
memang tinggal; ujinya berhenti menyalin ulang rumus itu dan kini memanggil fungsi
sungguhan — dulu keduanya bisa menyimpang tanpa satu pun uji gagal.

**Task 12 baru separuh, dan batasnya disengaja.** Yang dibaca peneliti sudah bersih
(lima kunci terjemahan; dua di antaranya dihapus karena `payExtension` tidak lagi
punya alasan ada dan `extendWaitingPaymentAlert` nol pemanggil). Yang **belum**:
identifier kode (`ExtendSection`, `FormSubmissionExtend`, `entity_type='extend'`) —
selama tabelnya masih bernama itu, menggantinya cuma memindahkan kebingungan; ia
milik Task 11 langkah 5. Dan nama item invoice `'Extend Iklan (ads)'`
([`ExtendSection.tsx:350,380`](../multi-step-form/src/components/ExtendSection.tsx))
yang terkirim ke DOKU — menunggu finance diberi tahu.

### Phase 3 — Task 9A (`sql/46`) + papan Schedule, commit `478d550`..`d7639df` (2026-08-08)

**Pembagian permukaan yang berlaku sekarang** — ini yang paling menentukan untuk
sesi berikutnya, dan ia **membatalkan** gambaran lama "tab Jadwal Iklan terpadu
sebagai tempat kerja":

| Permukaan | Perannya |
|---|---|
| **Submissions** | **tempat kerja.** Review → jadwal → bayar, semuanya dalam satu drawer |
| **Schedule** | **papan pantau.** Nol aksi, hanya baca + deep-link ke drawer |
| **Pages** | kelola halaman (perombakannya task terpisah, belum dikerjakan) |

**Sejak 2026-08-09 "tempat kerja" itu benar-benar utuh.** Menjadwalkan dan menagih
dulu melempar admin ke halaman penuh `SchedulePaymentView` (breadcrumb
`Submissions › Schedule`) — daftar order hilang, drawer tertutup. Keduanya kini
sub-tampilan **di dalam** drawer, dan berlaku untuk **semua ordinal**; sebelumnya
jadwal ke-2 dst. tidak punya jalur menyunting sama sekali. `SchedulePaymentView.tsx`
dan `ExtendSection.tsx` dihapus. Yang masih mengambil alih layar tinggal
`PageBuilderModal` — sengaja, karena ia editor dokumen dengan rail pratinjau 360px,
bukan formulir; pembagian yang sama sudah dipakai drawer papan Schedule.

Alasannya perilaku, bukan model data: rute review manual adalah **satu percakapan**
dengan peneliti dari feedback sampai tagihan. Memecahnya jadi dua station memutus
percakapan itu. Rute yang satunya — order auto-approval yang bayar sendiri lewat
DOKU — tidak pernah lewat percakapan admin sama sekali; di situ pertanyaannya
"mana yang lunas tapi halamannya belum dibuat", dan itu pertanyaan pantau.
**Dua rute, dua pintu masuk.**

**`sql/46` (Task 9A)** memberi cermin sumbu kedua:

- kolom `review_status` — sumbu review, milik ORDER, lewat `review_status_of()`
  (terjemahan harfiah `getDisplayStatus()` di `lifecycle.ts`)
- `status` jadi sumbu **tayang saja**, lewat `airing_status_of()`, dengan tiga
  nilai yang selama ini runtuh: `unscheduled` · `requested` · `slot_reserved`
- **cabang DELETE dibuang** — satu order = satu baris ordinal 1, SELALU

Yang kedua menutup lubang yang baru ketahuan saat mengukur: **87 order tidak ada
di cermin sama sekali**, karena trigger `sql/41` menghapus barisnya begitu
`start_date` jadi NULL. Cermin **896 → 983**, ordinal 1 **884 → 971**.

Verifikasi sesudah diterapkan, semuanya **0**: selisih ordinal 1, order tanpa
baris, selisih perpanjangan, `review_status` salah baris-demi-baris,
`review_status` NULL, `status` salah baris-demi-baris. **Sidik waktu tidak
berubah** (896 baris, `a4cf99aa345c397ea148528464b7dc16`) — tidak ada satu detik
pun yang bergeser.

**Papan Schedule** (`ScheduleBoardPage`) adalah **pembaca pertama** `ad_schedules`
— sampai `sql/46` tabel itu cermin satu arah tanpa satu pun pembaca di klien,
edge function, view, maupun fungsi DB. Tiga tampilan: Agenda, Bulan, Kilat
(`KilatScheduleBoard` kini di-host di sini juga).

Yang bisa dilakukannya dan Page Calendar tidak:

- menampilkan order **tanpa jadwal** — 90 entri, **4 di antaranya sudah LUNAS**
- membedakan empat keadaan yang dulu runtuh jadi `waiting_payment`
- perpanjangan sebagai baris berurut `#1`/`#2`/`#3` dengan status tayang
  masing-masing
- menyaring sama sekali (Page Calendar: `const filteredEvents = events;`)

**Drawer Submissions** digabung: tab Reservasi + Payment jadi **"Jadwal & Bayar"**,
karena aksi utama keduanya membuka `SchedulePaymentView` yang sama. `ExtendAction`
pindah ke sana, dan **pagar `!existingPage` dicabut karena itu bug** (lihat
§Jebakan no. 8).

### Phase 0 — `sql/36`–`39`, commit `05a2fa1`

- `sql/36` cabut gerbang banner dari `cron_activate_extends()`
- `sql/37` `get_schedule_batch_context` — insentif batch tidak lagi ditagih dua
  kali; `get_batch_rewards` menyaring baris parent `rejected`/`spam`
- `sql/38` larang satu survei tayang di dua jendela sekaligus
- `sql/39` **DITARIK** — tinggal helper `airing_instant_of_date()`, yang justru
  jadi fondasi semua perbandingan waktu berikutnya
- Perpanjangan kini ikut dihitung di kuota slot (`fetchSlotAvailability`)

### Kilat — `sql/42`, commit `c554880`

Jembatan admin iklan regular → JFU Kilat, plus penjadwalan slot Kilat sendiri
(gelombang push 08/11/14/17 WIB, 2 order per gelombang, Senin–Jumat) lewat kolom
baru `form_submissions.kilat_slot_hour`. Diterapkan ke DB 2026-08-04.

Sekalian menutup tiga lubang tagih di sisi admin — jalur user lewat
`/api/doku/create-payment` sudah benar sejak awal:

- invoice manual admin menagih Kilat dengan rumus regular (add-on Rp 250.000
  tidak pernah masuk, base rate dikali durasi yang tidak berarti);
- `ensure_survey_page()` menerbitkan halaman iklan untuk order Kilat yang lunas —
  kartu di feed aplikasi plus satu tempat di `display_order`, tidak dibayar
  siapa pun;
- `SchedulePaymentView` mengukur kapasitas Kilat terhadap pool iklan **regular**.

Jam Kilat sebelumnya tidak pernah tersimpan: `start_date` bertipe `DATE` dan
`updateScheduleDates()` memaku setiap jadwal ke 15.00 WIB. Karena itu kolom
terpisah, dan `updateKilatSchedule()` menulis langsung tanpa lewat fungsi itu.

### Kilat — papan jadwal di Ads Schedule, commit `a4fc499`

Detail lengkap di §0B di atas. Ringkas: toggle Iklan/Kilat di halaman Ads
Schedule (`KilatScheduleBoard.tsx` + `fetchKilatSchedule`/
`countKilatPagesLeak` di `supabase.ts`), deep-link klik-entri → drawer order di
Submissions, dan penutupan lubang "Create Page" untuk order Kilat di dua lapis
(`getPendingSlotsWithoutPage` + guard di `PageBuilderModal.handleSave`).
**Belum dideploy, belum diuji manual di browser** — hanya tsc + build.

### Phase 1 — `sql/40`, commit `7ec7c28`

Halaman iklan terbit otomatis dengan banner default saat order lunas.
`ensure_survey_page()` + trigger `trg_form_submissions_ensure_page` + indeks unik
`uq_survey_pages_submission`. Ketiganya dikonfirmasi ada di produksi 2026-08-04.

### Phase 2 Task 8 — `sql/41`, merge `b4ed204`

`ad_schedules` sebagai **read-model satu arah** (lama → baru). Nol perubahan kode
aplikasi — belum ada yang membaca maupun menulisnya.

Diterapkan & diverifikasi di produksi 2026-08-04: **866 baris** (856 jadwal
pertama + 10 perpanjangan), selisih nol di kedua sumber, penomoran urut
`start_date` tanpa lubang, dan pengangkatan DATE → 15.00 WIB benar di jalur
backfill maupun trigger.

Sebaran status hasil pemetaan: `waiting_payment` 532 · `live` 169 · `cancelled`
76 · `scheduled` 55 · `paid` 21 · `completed` 13.

### Phase 2 Task 8B-1 — `sql/44`, commit `01ef96a`..`d730571`

**Satu sumber angka hadiah.** SQL diterapkan 2026-08-04, kode di-merge ke `main`
(fast-forward) dan **dideploy 2026-08-05**.

Agregasi batch dulu ditulis **dua kali** — RPC `get_batch_rewards` (`sql/37`) untuk
Mode 2 `/api/respondents`, dan `buildBatches()` di `respondents.js` untuk Mode 1 —
dan keduanya sudah menyimpang. Sekarang `get_batch_rewards_bulk` (`sql/44`) adalah
satu-satunya implementasi; `get_batch_rewards` jadi pembungkus tipis di atasnya
dengan tanda tangan **tidak berubah sedikit pun** (kontrak platform pengundian).

Sekalian: halaman survei publik dan feed aplikasi Jakpat berhenti membaca
`form_submissions.prize_per_winner × winner_count` mentah. Kolom itu hanya pernah
memuat apa yang didanai jadwal **pertama**, jadi top-up ke batch berikutnya sampai
ke platform pengundian tapi **tidak pernah** terlihat oleh responden yang diminta
menjawab. Ditutup juga bug uang laten di `ExtendSection`: invoice top-up membangun
qty dari winner count order **induk**, padahal preview di layar sudah memakai
`poolWinnerCount` yang benar — preview dan tagihan bisa berbeda angka.

Hasil verifikasi di produksi:

| Uji | Hasil |
|---|---|
| PRE-CHECK: logika bulk vs `get_batch_rewards` hidup, seluruh submission | **0 baris beda** |
| Kontrak `pg_get_function_result` sebelum & sesudah | **string identik** |
| Pembungkus vs bulk, seluruh submission | **0 baris beda** |
| SQL vs JS lama — apa adanya / disimulasikan 10:00 WIB | **0 / 2 survei** (260 `beda_end_date`) |
| Kenetralan nilai halaman publik | **266 halaman, 0 nominal berubah, 0 kehilangan angka** |
| Hak akses `anon` (`SET LOCAL ROLE`, lalu POST `/rest/v1/rpc` dgn anon key) | **berhasil, `200`** |
| **Mode 1 vs Mode 2, blok `batches` field demi field** | **43 slug, 43 identik, 0 beda** |

Uji terakhir itu yang paling berarti: 10 survei dengan batch masih berjalan, 30
sampel lampau, plus 3 halaman pengumuman (yang benar-benar mengembalikan
`batches: []`). Sebelum perubahan ini, kesamaan itu tidak pernah dijamin.

**Yang berubah di mata konsumen API:** setiap perbedaan adalah **Mode 1
dikoreksi**, Mode 2 tidak bergerak. Yang terbesar, `can_select_winners` tidak lagi
menyala delapan jam terlalu cepat di hari terakhir tayang — sisi SQL sudah
mengangkat `end_date` ke 15.00 WIB sejak `sql/39`, sisi JS masih membacanya mentah
sebagai 00.00 UTC. Bug itu berulang **setiap hari terakhir setiap survei yang
tayang** dan tidak pernah menghasilkan keluhan, karena korbannya bukan konsumen
API melainkan responden yang diam-diam tidak ikut diundi. Pergeseran `period.*`
+8 jam menyentuh 266 batch **teksnya**, tapi 256 sudah lewat dan **tidak satu pun
tanggalnya berpindah** — inert. Dikonfirmasi pemilik produk: `can_select_winners`
belum difungsikan di dashboard pengundian, jadi tidak perlu dikabarkan ke konsumen.

**Uji top-up ujung ke ujung: LOLOS.** Dijalankan admin di dashboard produksi
2026-08-05. Ini satu-satunya dari sepuluh verifikasi yang membuktikan *tujuan*
task — sembilan lainnya membuktikan tidak ada yang rusak. Sepanjang umur sistem,
top-up hadiah belum pernah sekali pun sampai ke responden; sekarang sudah.

**Ganda-tagih Rp 425.000 — insiden lampau, data tidak disentuh.** Dua pool penuh
pernah masuk ke satu batch yang sama (Juli 2026: "Studi Pengambilan Keputusan"
Rp 50.000 + "Faktor-Faktor Psikologis" Rp 375.000); `MAX()` di agregasi menelan
yang kedua tanpa jejak. Keduanya dibuat **sebelum** `sql/37` diterapkan, dan
`sql/37` sudah menghentikan penyebabnya — tidak ada kasus baru sejak itu. Yang
belum hilang adalah **bentuk datanya**: selama tidak ada entitas pool, uang masih
bisa tertelan diam-diam. Itu yang jadi alasan ke-2 kenapa `reward_pools` (8B-2)
wajib ada sebelum Phase 4. Keputusan 2026-08-04: dicatat, **data tidak disentuh**,
refund diputuskan terpisah.

### Phase 2 Task 8C — `sql/43`, commit `e8a77a6`..`06161c1`

Pensiunkan sisa fitur pengundian di dashboard. `sql/43` sudah diterapkan
2026-08-04, tapi kodenya sempat tersangkut sebulan di branch revamp visual —
keadaan paling rawan di seluruh papan: **DB maju, kode belum.** Dibereskan
2026-08-05 dengan cherry-pick lima commit ke `main`, **tanpa** ikut menayangkan
revamp visualnya.

Cherry-pick-nya bersih karena jejak 8C ternyata cuma dua berkas sumber:
`main` memegang `PublishPageManagement.tsx` dan `SubmissionsManagerView.tsx`
**byte-identik** dengan induk commit 8C pertama, jadi patch-nya mendarat persis
seperti saat ditulis. Hasilnya juga dibuktikan byte-identik dengan versi di branch
visual — yang tayang adalah kode yang sudah ditulis dan diuji di sana, bukan
rekonstruksi.

Diverifikasi di bundle yang benar-benar tayang (2026-08-05): SHA-256 chunk di
server **identik** dengan hasil build lokal dari `main`; string `"Respondents"`
muncul 3×; string **`"Select Winners"` 0×** — indikator merah yang menyala
permanen sejak Mei 2026 benar-benar hilang dari produksi.

Typecheck justru **membaik**: 80 → **76**, nol error baru, dan keempat yang hilang
semuanya di `SubmissionsManagerView.tsx` — berkas yang 8C bersihkan.

Deret `sql/` kembali utuh: `42, 43, 44, 45`.

### Phase 2 Task 8D — `sql/45`, commit `20206a0`

`ad_schedules` mengenali Kilat. `sql/41` mengangkat setiap `DATE` ke 15.00 WIB —
benar untuk iklan regular, salah untuk Kilat, yang didorong dalam gelombang
08/11/14/17 WIB. Sembilan order Kilat berjadwal, sembilan-sembilanya tercermin
15.00 → 15.00; order yang benar-benar didorong pukul 08.00 tercatat tayang tujuh
jam kemudian.

Ditemukan lewat pertanyaan "bisakah lanjut ke Phase 3?" — bukan lewat keluhan,
karena belum ada pembacanya. Diperbaiki **sebelum** Phase 3 dibangun di atasnya,
bukan sesudah.

Diterapkan & diverifikasi di produksi 2026-08-05:

| Uji | Hasil |
|---|---|
| Jam Kilat cermin ≠ `kilat_slot_hour` | **0** |
| Iklan regular jam ≠ 15.00 WIB | **0** dari 872 |
| Iklan regular tanggal bergeser | **0** |
| Kilat tanpa gelombang bukan 00.00 WIB | **0** dari 3 |
| Total baris / selisih ordinal 1 / ordinal 2..n | **881 / 0 / 0** |
| Baris belum terstempel `distribution_type` | **0** |
| Papan jadwal admin vs cermin (9 order Kilat) | **9 cocok, 0 beda** |

Sekalian menutup lubang yang ditemukan di jalan: daftar `UPDATE OF` trigger
`trg_ad_schedule_from_submission` tidak memuat `distribution_type` maupun
`kilat_slot_hour`, jadi mengubah gelombang secara prinsip tidak membangunkan
cermin. Laten — penulisnya selalu ikut menyentuh `start_date` — tapi menganga
permanen. Dibuktikan tertutup lewat `pg_trigger.tgattr`: trigger sekarang
mendengarkan **16 kolom**, kedua kolom itu termasuk.

**Order Kilat tanpa gelombang mendarat di 00.00 WIB, bukan 08.00** — keputusan
sadar, 3 dari 9 baris. 00.00 bukan gelombang mana pun, jadi tidak bisa disangka
jadwal sungguhan dan tidak menggelembungkan kuota gelombang; barisnya tetap
terlihat admin. `kilat_slot_hour IS NULL` penandanya — **jangan baca jam dari
`start_date` tanpa mengecek kolom itu.**

> ⚠️ **Temuan di luar cakupan, belum diputuskan.** Ke-11 order Kilat punya
> `prize_per_winner > 0`, tapi Kilat tidak pernah punya halaman iklan — sehingga
> hadiahnya **tidak pernah sampai ke platform pengundian lewat jalur mana pun**
> (`/api/respondents` Mode 1 hanya melisting halaman terbit, Mode 2 dicari lewat
> slug halaman). Kalau responden Kilat memang ikut diundi, ada lubang di sana yang
> tidak bisa ditutup migrasi.

---

## Yang belum dikerjakan

Detail lengkap tiap task ada di
[`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md).
Urutan wajib: **~~8B-1~~ → 8C → 9 → 10 → 11 → 12 → 13**, masing-masing rilis sendiri
(expand-and-contract). Tidak ada satu langkah pun yang mengharuskan semua lapis
berubah serentak. 8B-2 keluar dari urutan ini — ia pindah jadi prasyarat Phase 4.

| Task | Isi | Catatan |
|---|---|---|
| ~~**8B-1**~~ | ~~Satu sumber angka hadiah + top-up jadi mulus~~ | ✅ **selesai & live 2026-08-05** (`sql/44`). Risiko terbesarnya — dua agregasi batch yang bisa menyimpang — sudah hilang secara struktural, bukan ditambal. |
| **8B-2** | `reward_pools` — pool jadi milik batch, bukan milik jadwal pertama | ⏸️ **Ditunda jadi prasyarat Phase 4**, bukan bagian Phase 2. Hari ini semua yang diobatinya masih laten (10 perpanjangan seumur hidup, 0 top-up terpakai, 0 pool yatim) — Phase 4 yang membuat ketiganya hidup sekaligus. ⛔ Sebelum tabelnya dirancang, jawab dulu: **83 order sudah mendanai hadiah tanpa punya tanggal sama sekali**, sehingga kunci `(submission_id, period_batch)` tidak punya tempat untuk mereka. Nomor filenya `sql/50` — sudah bergeser tiga kali (dari `45`, lalu `47`, lalu `49` dipakai perbaikan bug jam tayang kustom 2026-08-10); lihat baris "Peta dokumen" di bawah untuk alasannya sebelum menulis migrasinya. |
| ~~**8C**~~ | ~~Pensiunkan sisa fitur pengundian di dashboard~~ | ✅ **selesai & live 2026-08-05.** Dipindah ke `main` lewat cherry-pick tanpa ikut menayangkan revamp visual. Indikator "Select Winners" terbukti hilang dari bundle produksi. |
| ~~**8D**~~ | ~~`ad_schedules` mengenali Kilat~~ | ✅ **selesai & live 2026-08-05** (`sql/45`). Prasyarat Phase 3 yang pertama — sudah lunas. |
| ~~**9**~~ | ~~Pisahkan status order dari status jadwal~~ | ✅ **selesai 2026-08-08.** 9A = `sql/46` (cermin dapat sumbu kedua), 9B = dashboard peneliti membacanya. Diadu atas seluruh 971 order: 664 identik, 307 berubah, semuanya perbaikan. **Belum tayang** — ikut branch ini. |
| **10** | Satukan aturan waktu & pembayaran | Cutoff 13.00/14.00 WIB berlaku seragam ke semua jadwal; `transactions`/`invoices` pakai `schedule_id`; **"Mark as Paid" jadi per-jadwal** (sekarang order-level dan bisa menandai lunas order tanpa jadwal sama sekali — 3 dari 522 order terukur begitu). |
| **11** | Pindahkan pembaca, lalu contract | ⚠️ View kompatibilitas WAJIB ada sebelum tabel aslinya disentuh, bukan sesudah. **Diperkecil oleh 8B-1:** `respondents.js` tidak lagi membaca `form_submissions_extend` sama sekali (query massalnya diganti RPC). Sisa pembaca serverless tinggal dua — `functions/api/storage-cleanup.js:74` dan `functions/api/doku/webhook.js:497,516` — plus pembaca di `src/`. |
| **12** | Istilah — semua jadi "Jadwal Iklan 1/2/3" | 🟡 **Separuh, sengaja.** Copy yang dibaca peneliti & admin ✅ selesai 2026-08-08. Sisa: identifier kode (`ExtendSection`, `FormSubmissionExtend`, `entity_type='extend'`) — menunggu Task 11 langkah 5, karena selama tabelnya masih bernama itu penggantian cuma memindahkan kebingungan. Plus nama item invoice `'Extend Iklan (ads)'` yang menunggu finance. Berhenti di API: nama field publik (`period_batch`, `batch_status`, `can_select_winners`, `prize_per_winner`, `winner_count`, `jakpat_id`) **tidak** ikut berganti. |
| **13** | Tagihan fleksibel per jadwal | ⬜ **Disetujui 2026-08-09, terkunci di belakang Task 11.** Satu jadwal boleh punya beberapa invoice: tagihan susulan jadi **piutang yang terlihat** dan **tidak pernah menghentikan iklan yang sedang tayang**. Plus **batal reservasi per jadwal** dan **`is_extra_ad` pindah ke `ad_schedules`** (hari ini ia sifat ORDER — lihat jebakan no. 17). Sumber kebenaran uang pindah dari `ad_schedules.total_cost` ke invoice, yang sekalian membunuh `hasEverPaid`. **Sejak 2026-08-18 ia juga pembuka Phase 4** — harga per jadwal yang dilahirkannya adalah yang selama ini hilang (§00G). Rencana lengkap: [`2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md`](superpowers/plans/2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md) |

Setelah Phase 2: **Phase 3** (tab "Jadwal Iklan" terpadu di admin) menyusut jadi
mapper biasa, dan **Phase 4** (tombol "Jadwalkan Iklan Lagi" di dashboard user)
baru masuk akal dikerjakan. Dikerjakan **sebelum** Phase 2 rampung, Phase 3 justru
jadi adapter di atas dua model jadwal yang masih berbeda — persis pekerjaan yang
Phase 2 ada untuk menghapusnya. Rinciannya di §2 "Yang menunggu tindakan".

⚠️ **Phase 4 menunggu Task 13, bukan Task 11** (pemilik produk 2026-08-18). Task 11
tidak memblokirnya — view kompatibilitasnya membuat kode Phase 4 selamat tanpa diedit.
Yang mengunci adalah **harga jadwal ke-2 yang belum pernah ada rumusnya**, dan itu
lahir di Task 13. Bukti + prasyarat lengkapnya di §00G.

---

## ✅ Penghalang branch — sudah selesai 2026-08-05

*(Disimpan sebagai catatan sejarah: ini penghalang yang paling sering muncul di
dokumen ini, dan berguna tahu kenapa ia akhirnya hilang.)*

Task 9, dan sebagian Task 10 dan 12, menyasar file yang tidak ada di `main`:

- `src/components/status/deriveOrderUiState.ts`
- `src/components/status/airingPeriods.ts`
- `src/components/status/SchedulePhase.tsx`

Ketiganya lahir di branch **`feat/dashboard-soft-dna-navbar`** — padahal rencana
Phase 2 semula melarang menumpang branch itu supaya kedua pekerjaan bisa
di-revert sendiri-sendiri. Larangan itu **dicabut** 2026-08-05 karena tidak bisa
dipatuhi.

Task 8B-1, 8C, dan 8D dikerjakan dari `main` lewat branch sendiri lalu
fast-forward; semuanya live dan bisa di-revert sendiri-sendiri. **Task 9 ke atas
tidak bisa begitu**, jadi arahnya dibalik: `main` yang di-merge **ke dalam**
branch revamp, bukan sebaliknya.

Merge itu dijalankan 2026-08-05 sore dan bersih di sisi kode (dua konflik
dokumentasi saja). Sejak itu branch **tidak lagi tertinggal** dari `main`, dan
seluruh sisa Phase 2 + Phase 3 berjalan di sana. Rinciannya di §2.

Kalau perlu memastikan branch masih sejajar sebelum sesi baru:

```bash
git log --oneline feat/dashboard-soft-dna-navbar..main   # harus kosong
```

---

## Jebakan yang sudah memakan waktu — jangan diulang

0. **`invoices` SENDIRIAN bukan sumber kebenaran uang.** Rencana Task 13
   memutuskan *"sumber kebenaran uang = invoice"*, dan diterapkan harfiah sebagai
   `SELECT FROM invoices` ia **menghapus Rp 44.759.000 lunas dari layar**.
   Terukur 2026-08-19: **518** jadwal punya baris `transactions`, **328** punya
   baris `invoices`, dan **190 punya transaksi tapi NOL invoice** — 79 di
   antaranya sudah dibayar. Sebabnya `create-payment.js` **tidak pernah menulis
   `invoices`**; pembayaran swalayan hanya lahir di `transactions`, dan baris
   `invoices` cuma terbit saat admin menagih manual. Baca keduanya, gabungkan
   ber-kunci `payment_id` — itulah yang `schedule_billing()` (`sql/53`) lakukan.
   Aturan dedupnya **beda per tabel**: percobaan bayar berbagi `payment_id` di
   `transactions` (satu jadwal punya 29), sementara di `invoices` nol jadwal
   punya baris melebihi jumlah `payment_id` uniknya.
1. **`form_submissions.status` BUKAN kolom status.** Isinya jenjang pendidikan
   peneliti (`Mahasiswa`, `Dosen`, `Mahasiswa S2 (Master)`, …). Yang dibaca
   `deriveLifecycle` sebagai `status` sebenarnya `submission_status` yang
   di-alias ulang di `supabase.ts:1365`; kolom DB-nya dipetakan ke `education` di
   `InternalDashboard.tsx:201`.
2. **Dua tabel menyimpan tipe waktu berbeda.** `form_submissions.start_date` =
   `DATE`, `form_submissions_extend.start_date` = `TIMESTAMPTZ`. DATE berarti
   15.00 WIB pada hari itu; cast langsung mendarat di 07.00 WIB — delapan jam
   sebelum iklan tayang. Selalu lewat `airing_instant_of_date()` (`sql/39`).
3. **`payment_status` bukan bukti pembayaran.** Sebagian order dibayar di luar
   sistem dan kolomnya tetap `pending` selamanya. Jangan bangun logika uang atau
   hadiah di atasnya — filter berbasis pembayaran pernah dicoba di `sql/37` dan
   ditarik karena menghapus hadiah dari 17 survei yang halamannya sudah tayang.
4. **Rencana Phase 2 yang benar hanya versi `main`.** File senama pernah berisi
   rencana lain (restrukturisasi 5 tab admin + set `requires_banner_update` dari
   client) yang premisnya keliru dan sudah dibuang di commit `4759a79`.
5. ~~**`ad_schedules` tidak tahu apa-apa soal Kilat.**~~ **Sudah diperbaiki**
   `sql/45` (Task 8D, 2026-08-05). Yang tersisa sebagai jebakan: **jangan membaca
   jam tayang Kilat dari `ad_schedules.start_date` tanpa mengecek
   `kilat_slot_hour`.** Order yang gelombangnya belum ditugaskan sengaja mendarat
   di 00.00 WIB — itu penanda "belum dijadwalkan", bukan jadwal pukul nol.
   Untuk iklan regular jamnya tetap 15.00 WIB lewat `airing_instant_of_date()`;
   untuk Kilat lewat `kilat_instant_of()`. Dua helper, dua aturan, jangan
   ditukar.
6. **Nol selisih bisa berarti "salah jam mengukurnya".** Divergensi SQL-vs-JS di
   8B-1 cuma hidup 00.00–08.00 UTC (07.00–15.00 WIB) — diukur di luar jendela itu
   hasilnya nol, dan task ini nyaris disimpulkan "tidak ada masalah". Kalau sebuah
   pengukuran menyangkut waktu, ukur dua kali: apa adanya, **dan** dengan `NOW()`
   disimulasikan ke dalam jendela yang dicurigai.
7. **`SELECT` biasa di SQL Editor tidak membuktikan hak akses apa pun** — ia jalan
   sebagai `postgres`. Untuk membuktikan `anon`/`authenticated` benar bisa (atau
   benar tidak bisa), bungkus dengan `BEGIN; SET LOCAL ROLE anon; … ROLLBACK;`,
   atau panggil endpoint REST-nya langsung dengan anon key. Pelajaran `sql/43`,
   dipakai lagi di `sql/44`.
8. **Pagar `!existingPage` di `ExtendAction` adalah BUG, bukan kebijakan.**
   Dikonfirmasi pemilik produk 2026-08-07: punya halaman iklan tidak pernah jadi
   syarat memesan jadwal berikutnya — syaratnya cuma tidak tumpang tindih, dan
   itu sudah ditegakkan `trg_submission_no_overlap` (`sql/38`) di DB. Akibatnya
   order regular yang **lunas tapi belum punya halaman** tidak pernah bisa
   menambah jadwal. Dicabut 2026-08-08 (`456c54b`).

   ⚠️ **Pagar Kilat yang menggantikannya JANGAN ikut dicabut.** Sebelum ini order
   Kilat terhalang **dua kali tanpa sengaja** — oleh `!existingPage` (Kilat tidak
   pernah punya baris `survey_pages`, guard `sql/42`) dan oleh pembungkus
   `!isKilat` di `PageTab`. Keduanya hilang saat aksi itu pindah tab, jadi
   pagarnya kini eksplisit. Alasannya bukan cuma aturan produk:
   **`ExtendSection` tidak mengenal Kilat sama sekali** — nol kemunculan
   `distribution_type`, harganya `calculateAdCostPerDay(questionCount) × durasi`
   (rumus regular). Untuk Kilat itu berarti add-on Rp 250.000 **tidak tertagih**
   dan base rate dikali durasi yang tidak punya arti (Kilat selesai ~2 jam).
   Membukanya butuh `ExtendSection` mengenal jalur distribusi lebih dulu: bukan
   sekadar rumus harga, tapi **pemilih gelombang alih-alih rentang hari**.
9. **`sql/40` menciptakan pekerjaan berulang yang tidak punya permukaan** —
   mengganti banner generik `/default-ad-banner.jpg` dengan banner asli, setiap
   kali sebuah order lunas.

   ⚠️ **`requires_banner_update` BUKAN penandanya.** Trigger `sql/40` menyetelnya
   `FALSE` pada setiap halaman yang ia buat (produksi 2026-08-07: `true` hanya
   pada **1** baris dari 274). Siapa pun yang membangun antrean banner di atas
   flag itu akan mendapat **tab kosong** lalu menyimpulkan tidak ada pekerjaan.
   Penandanya harus `banner_url`. Batasi juga ke halaman yang **masih akan
   tayang** — 243 dari 274 halaman iklan ber-`banner_url` NULL (peninggalan
   pra-`sql/40`) dan akan membanjiri antrean itu kalau ikut dihitung.
10. **Angka produksi basi dalam hitungan jam — jangan tulis uji berbasis
    konstanta.** Order masuk belasan per hari: 954 pada 2026-08-07 jadi **971**
    pada 2026-08-08. Rencana yang menyebut "sebaran harus tepat sembilan angka
    ini" sudah salah keesokan harinya. Tulis verifikasi **relasional** — cermin
    diadu dengan sumbernya, selisih harus nol — dan pakai angka absolut hanya
    sebagai konteks. Pola yang dipakai `sql/46`.
11. **Snapshot berbasis `CREATE TEMP TABLE` tidak berguna kalau yang mengukur dan
    yang menerapkan bukan sesi yang sama.** TEMP table mati bersama koneksinya.
    Untuk membuktikan "tidak ada waktu yang bergeser" lintas sesi, pakai md5 atas
    `EXTRACT(EPOCH FROM …)` — bebas sesi **dan** bebas setelan TimeZone (`::text`
    ikut berubah mengikuti TimeZone sesi; epoch tidak). Pola yang dipakai
    `sql/46` §6(4)/§7(5).
12. **`.in()` dengan daftar id yang tumbuh akan mati di panjang URL — dan matinya
    berbunyi `400`, bukan `414`.** PostgREST menaruh filter di query string, jadi
    `submission_id=in.(…)` berisi 954 UUID = **±35 KB URL**. Terukur di produksi
    2026-08-08: **600 UUID (≈22 KB) lolos, 700 (≈26 KB) ditolak**. Papan Schedule
    kena persis di sini dan **gagal memuat sejak hari pertama** — layar kosong,
    `0 order · 0 jadwal`, pesannya cuma `Bad Request` tanpa menyebut panjang sama
    sekali. Diperbaiki lewat `selectSurveyPagesByIds()` (potongan 200, paralel).

    ⚠️ **Ini lolos dari seluruh verifikasi karena verifikasinya dijalankan lewat
    SQL, bukan lewat REST.** Angka-angkanya semua benar — dan tidak satu pun
    menyentuh jalur yang benar-benar dipakai browser. Sama persis dengan jebakan
    no. 7, cuma sumbunya beda: di sana yang dilewati **hak akses**, di sini yang
    dilewati **gateway**. Untuk fitur yang membaca banyak baris, buktikan sekali
    lewat `curl` ke `/rest/v1/` dengan anon key sebelum menyatakan selesai.

    Aturan turunannya: daftar id yang **tidak pernah menyusut** (seluruh order
    sepanjang sejarah) wajib dipotong. Daftar yang disaring status aktif boleh
    utuh — ia menyusut lagi saat order selesai. `getPendingSlotsWithoutPage` (64
    id) dan peta `is_extra_ad` (317 id) masuk kategori kedua.
13. **`grid-cols-[…1fr]` + judul panjang = kisi berantakan, dan `.grid` warisan
    membunuh `gap-*`.** Dua jebakan yang selalu muncul bersamaan, dan bersama itu
    pula yang merusak papan Kilat sampai tidak terbaca:

    - `1fr` sama dengan `minmax(auto, 1fr)`. Isi yang lebih lebar dari jatahnya
      **melebarkan** trek-nya, jadi satu judul survei panjang cukup untuk membuat
      kolom hari tidak lagi sama lebar. Selalu **`minmax(0,1fr)`**.
    - `truncate` pada anak flex tidak menyala tanpa **`min-w-0`** pada anak itu —
      `min-width` bawaannya `auto`, jadi ia menolak menyusut di bawah isinya.
    - `styles.css` memuat `.grid { display:grid; gap:1.5rem }` SESUDAH Tailwind,
      jadi tiap `gap-2` di elemen ber-`class="grid"` diam-diam jadi 24px. Dodge:
      tulis **`[display:grid]`**, bukan `grid` (lihat juga jebakan `.flex`).
14. **Sumbu review tidak boleh dievaluasi lebih dulu dari "sudah lunas".**
    Kedengarannya terbalik — review kan datang pertama — tapi datanya tidak
    mengikuti urutan itu. Terukur 2026-08-08: **156 order ber-`submission_status
    = 'in_review'` tapi `payment_status = 'paid'`**, sudah tayang dan sudah
    selesai; kolom statusnya tidak pernah dimajukan siapa pun. Menaruh cabang
    review di atas cabang lunas memundurkan ke-156 order itu jadi "menunggu
    review" di dashboard penelitinya sendiri.

    Urutan yang benar ada di `orderStepOf`
    ([`status/scheduleAxes.ts`](../multi-step-form/src/components/status/scheduleAxes.ts)):
    ditolak-dan-belum-pernah-bayar → **lunas** → review → tanpa tanggal → sisanya.
    Jangan dibalik tanpa mengadu ulang kedua algoritma atas seluruh tabel.

    Aturan turunannya, dan ini yang menemukan jebakan ini: **sebelum menukar
    sumber sebuah turunan, jalankan turunan lama dan baru berdampingan lewat SQL
    atas SELURUH baris, lalu jelaskan setiap selisih satu per satu.** "Nol
    selisih" bukan targetnya — targetnya "tidak ada selisih yang tidak bisa
    kujelaskan". Pola yang sama membuktikan 8B-1, 8D, dan 9B.
15. **Satu `normalizeScheduleDate` per berkas adalah utang, bukan kemudahan.**
    Sampai Task 9B ada **lima** salinan fungsi bernama sama di pohon ini, dan
    ujinya di `airing-window.test.ts` menyalin ulang rumusnya lagi sebagai
    "equivalent" — jadi salinan mana pun boleh menyimpang tanpa satu uji pun
    gagal. Yang di `ProgressTracker.tsx` sudah dipindahkan ke
    `utils/airing-window.ts` dan ujinya kini memanggil fungsi sungguhan. **Empat
    sisanya masih ada** (`PageBuilder/PageBuilderModal.tsx`,
    `pages/public/SurveyPage.tsx`, `pages/public/SurveyListingPage.tsx`,
    `utils/adOrdering.ts`) — dan semuanya memaksa 15.00 WIB, jadi **semuanya
    salah untuk Kilat**.
16. **Jangan menaikkan `ad_schedules.total_cost` untuk menagih tambahan.** Ada
    yang akan mengembalikannya: `functions/api/doku/create-payment.js:183-203`
    menghitung ulang harga dari input pricing, membandingkannya dengan
    `total_cost`, dan kalau berbeda ia **menimpa kolomnya** dengan hitungannya
    sendiri. Jadi satu percobaan bayar self-service menurunkan angka itu balik,
    diam-diam, di jalur uang. Arti kolom itu adalah **harga saat dipesan**, bukan
    "yang ditagih" — yang ditagih hanya bisa dijawab oleh `invoices`.
    Konsekuensi turunannya: `hasEverPaid` (`supabase.ts:2212`) memakai
    `.some(paid)`, jadi **satu** invoice lunas sudah cukup membuat kartu jadwal
    mengumumkan "Lunas". Selama satu jadwal cuma punya satu tagihan itu tidak
    kelihatan; begitu ada tagihan kedua, ia menyembunyikan tagihan terbuka.
17. **`is_extra_ad` adalah sifat ORDER, bukan sifat jadwal.** Ia hidup di
    `survey_pages` — satu baris per order — dan `fetchSlotAvailability`
    (`supabase.ts:1368`) melakukan lookup per `submissionId`, sehingga setiap
    jadwal mewarisi flag induknya. Task 11 langkah 1c malah menambahkan
    `UNIQUE (submission_id)` yang mengunci sifat itu. Siapa pun yang mengira
    "jadwal #1 reguler, #2 extra" bisa diungkapkan hari ini salah baca. Sumber
    keduanya: penanda legacy `[EXTRA_AD]` di `form_submissions.admin_notes`,
    yang masih dibaca di tiga tempat. Task 13 yang memindahkannya.

    ⚠️ Konsekuensi praktisnya: **jangan menawarkan pilihan Reguler/Tambahan di
    formulir jadwal** sebelum flag itu punya rumah di `ad_schedules`. Sebuah
    toggle sempat ditulis di `ScheduleForm` pada 2026-08-09 dan dicabut hari itu
    juga — ia memindahkan kolam kuota yang dibaca kalender tanpa menyimpan apa
    pun, jadi admin memesan ke kuota tambahan sementara jadwalnya tetap dihitung
    reguler, dan kolam reguler kelebihan jual.

18. **Kolom Tailwind responsif tidak berlaku di dalam panel sempit.**
    `grid-cols-4 sm:grid-cols-7` mengukur **viewport**, bukan lebar kontainer —
    di layar desktop ia jadi 7 kolom walau hidup di drawer 480px, lalu menggulung
    mendatar. Kalender slot karena itu menerima jumlah kolom sebagai **prop**
    (`SlotCalendar`), bukan lewat breakpoint. Lebar tersempit yang harus diuji
    adalah **`DetailPane` 520px** (dipakai pada ≥1280px), bukan sheet 576px.

19. **Dari tiga kalender pemesanan, hanya satu yang menghormati batas pesan
    13.00 WIB.** `SchedulePaymentView` dan `ExtendSection` tidak pernah mengimpor
    `airing-window` sama sekali, jadi keduanya mengizinkan admin memesan slot yang
    aturannya sudah tutup; hanya `RescheduleDialog` yang memanggil
    `isBookingClosedForDate`. Tertutup 2026-08-09 dengan menyatukan ketiganya ke
    `components/schedule/SlotCalendar.tsx`. **Jangan menyalin kalender keempat** —
    aturan yang lupa ikut tersalin tidak akan terlihat sampai ada yang tayang di
    hari yang salah.

20. **Kalender slot pernah berbohong dua kali sekaligus, dan keduanya membuat hari
    tampak lebih kosong dari kenyataan.** Ditemukan & ditutup 2026-08-09.

    a. **`excludeSubmissionId` membuang SELURUH jendela milik order itu**, bukan
       hanya jadwal yang sedang dipindah. Order berjadwal banyak jadi tidak
       melihat jadwalnya sendiri: hari yang sudah dipakai jadwal #2 tampil `0/4`
       saat admin memindahkan jadwal #1 ke sana, dan penolakannya baru muncul dari
       `trg_submission_no_overlap` (sql/38) setelah tombol simpan ditekan.
       `fetchSlotAvailability` kini punya `excludeSourceId` — cocokkan dengan
       `AdScheduleEntry.sourceId`, dan **pakai itu**, bukan yang per-order.

    b. **Tile hari ke-2 dst. tidak menghitung iklan yang sedang dipesan.** Iklan
       7 hari memakai tujuh slot; kalender hanya menaikkan angka di tanggal mulai,
       jadi rentang yang akan melewati kuota tidak terlihat sampai ditolak.
       `SlotCalendar` sekarang menampilkan `terpakai + 1` di setiap hari yang
       tertutup pilihan, dan memerahkannya kalau lewat kuota. ⚠️ Yang **mengunci**
       tile tetap angka yang benar-benar terpakai — kalau tidak, hari yang baru
       saja dipilih akan mengunci dirinya sendiri.

21. **Migrasi yang MENANDAI "sudah dikerjakan" tidak boleh mendahului kode yang
    mengerjakannya.** Papan ini sudah lama tahu bahaya "DB maju, kode belum"
    (`sql/43`, tersangkut sebulan) — tapi kasus itu **diam**: ia cuma menunggu.
    `sql/48` mengajarkan varian yang lebih buas: fungsinya mem-`POST` lewat pg_net
    lalu **langsung** menyetel `live_notified_at`, tanpa menunggu respons. Saat
    diterapkan 2026-08-10 sementara `functions/api/notify-ad-live.js` masih di
    branch, tiga order ditandai "sudah dinotifikasi" atas dasar **tiga `405`**.
    Emailnya hilang permanen — bukan tertunda. Detail & pemulihannya di §00A.

    Aturannya, untuk migrasi mana pun sesudah ini: kalau sebuah fungsi terjadwal
    menulis penanda kemajuan, **`cron.schedule` menyusul deploy, bukan
    mendahuluinya** — atau penandanya dipasang dari respons (baca
    `net._http_response`), bukan dari pengiriman. Bagian aditifnya (kolom, fungsi)
    tetap aman jalan duluan; yang harus ditahan cuma penjadwalannya.

    ⚠️ **`cron.job` `succeeded` tidak membuktikan apa-apa soal hasilnya.** Job-nya
    memang sukses — yang gagal ada di `net._http_response`, tabel lain. Sama
    keluarganya dengan jebakan no. 7 (SQL Editor bukan bukti hak akses) dan no. 12
    (verifikasi SQL melewati gateway REST): **ukur di lapisan yang benar-benar
    dilewati**, bukan di lapisan yang paling gampang di-query.

22. **Jam tayang kustom (admin) hidup di TIGA tempat dengan tiga nasib berbeda —
    ✅ SUDAH DIPERBAIKI `sql/49` (2026-08-10).** `ScheduleForm` sejak 2026-08-10
    punya kontrol "Jam Tayang (WIB)" untuk kasus khusus. Ditulis di sini
    sebagai "utang yang diterima", lalu terbukti nyata di prod dalam hitungan
    jam (order `#8462698a`, admin memilih 10.00 WIB — papan Schedule tetap
    menampilkan 15.00 dan admin melaporkannya sebagai bug). Sebelum membaca jam
    tayang dari mana pun, tahu dulu mana yang menjawab pertanyaanmu:

    | Tempat | Tipe | Jam kustom |
    |---|---|---|
    | `survey_pages.publish_start_date` | TIMESTAMPTZ | tersimpan & dihormati — ini yang benar-benar menggerbang tayang di halaman iklan + feed aplikasi |
    | `form_submissions.start_date` | DATE | mustahil menyimpan jam; **tanggalnya** benar (diturunkan `toWibYmd`); jamnya kini hidup terpisah di `airing_hour_wib`/`airing_minute_wib` (`sql/49`) |
    | `ad_schedules.start_date` (cermin) | TIMESTAMPTZ | **kini benar** untuk ordinal 1 — trigger memakai `airing_hour_wib`/`airing_minute_wib` kalau diisi, baru jatuh ke Kilat lalu ke `airing_instant_of_date()` bawaan |

    Untuk **jadwal ke-2 dst. tidak pernah ada masalah**: sumbernya
    `form_submissions_extend` (TIMESTAMPTZ) dan trigger cermin menyalin apa
    adanya, jadi jamnya sampai utuh ke papan Schedule.

    **Perbaikannya** persis presedennya sendiri: **kolom jam terpisah seperti
    `kilat_slot_hour`** — `form_submissions.airing_hour_wib`/`airing_minute_wib`
    (nullable, NULL = bawaan 15.00), ditulis `updateScheduleDates()`, dicermin ke
    `ad_schedules`, dan dibaca `sync_ad_schedule_from_submission()` sebelum jatuh
    ke cabang Kilat lalu ke `airing_instant_of_date()` bawaan — sama seperti
    `sql/45` menyelesaikannya untuk Kilat. `notify_primary_ads_live()` (sql/48,
    ditulis ulang oleh `sql/49`) dan `notify-ad-live.js` (hardcode "pukul 15.00
    WIB" dihapus) ikut mengikuti prioritas yang sama. Rincian lengkap & bukti
    prod: header `sql/49_ad_schedules_custom_airing_hour.sql`.

    ⚠️ **JANGAN mengoper instant UTC ke kolom `DATE`.** Postgres meng-cast-nya di
    zona sesi (**UTC** di Supabase), jadi setiap jam WIB di bawah 07.00 **mundur
    sehari**: 12 Agu 03.00 WIB = 11 Agu 20.00 UTC → tersimpan `2026-08-11`.
    Terbukti langsung di produksi. Yang membuatnya senyap: `survey_pages` tetap
    menyimpan instant yang benar, jadi iklannya tayang di hari yang benar
    sementara **seluruh penghitung** — cermin, `trg_submission_no_overlap`,
    kuota slot, `notify_primary_ads_live` — bekerja di hari sebelumnya.
    `updateScheduleDates()` karena itu menurunkan tanggalnya lewat `toWibYmd()`.
    Invariannya dikunci uji di `airing-window.test.ts` §7 (00.00 · 03.00 · 06.59
    · 07.00 · 15.00 · 23.30).

23. **`total_cost` pada jadwal ke-2 dst. adalah angka ketikan tangan, bukan harga
    yang dihitung.** `ScheduleForm.handleSaveCreate` menulis `total_cost: 0`; nilai
    sebenarnya diketik admin belakangan di `InvoiceForm`, tanpa validasi dan tanpa
    rumus. Terukur 2026-08-17 atas seluruh 13 baris `form_submissions_extend`:
    **7 di antaranya `0` atau di bawah Rp 10.000** (`1.000`, `1.110`, `1.110`,
    `1.103`) — sisa uji coba yang tidak pernah dibersihkan, sebagian bahkan
    berstatus `paid`.

    Dua akibat langsung. **(a)** Jangan pakai kolom ini untuk statistik uang,
    laporan, atau rata-rata harga — jumlahkan invoice. Task 13 memang memindahkan
    sumber kebenaran uang ke invoice dan mengembalikan arti `total_cost` jadi
    "harga saat dipesan". **(b)** Jangan berasumsi ada rumus harga jadwal ke-2
    yang tinggal dipanggil ulang: `cost-calculator` hanya melayani order pertama.
    Ini penemuan yang menunda Phase 4 ke belakang Task 13 — lihat §00G.

---

## Peta dokumen

| File | Isi |
|---|---|
| **`docs/jadwal-iklan-progress.md`** | ⬅️ file ini — titik masuk, status berjalan |
| [`superpowers/plans/README.md`](superpowers/plans/README.md) | **Indeks seluruh rencana** + statusnya; baca kalau bingung file mana yang masih berlaku |
| [`superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md`](superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md) | **Rencana Task 11** — `ad_schedules` jadi otoritatif, `form_submissions_extend` pensiun, `booking_id` lahir. Disetujui 2026-08-08, **terkunci sampai Phase 3 mendarat di `main`** |
| [`superpowers/plans/2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md`](superpowers/plans/2026-08-09-task-13-tagihan-fleksibel-per-jadwal.md) | **Rencana Task 13** — multi-invoice per jadwal (tagihan susulan jadi piutang), batal reservasi per jadwal, Extra Ad jadi sifat jadwal. Disetujui 2026-08-09, **terkunci sampai Task 11 mendarat & dideploy** (butuh `schedule_id`) |
| [`superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md`](superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md) | **Rencana Phase 3** — judulnya sudah basi; baca kotak koreksi di kepalanya sebelum mengeksekusi apa pun dari sana |
| [`superpowers/plans/2026-08-03-jadwal-iklan-redesign.md`](superpowers/plans/2026-08-03-jadwal-iklan-redesign.md) | Rencana Phase 2 lengkap, Task 8–12 |
| [`superpowers/plans/2026-08-03-phase-0-test-checklist.md`](superpowers/plans/2026-08-03-phase-0-test-checklist.md) | Checklist uji setelah deploy frontend |
| [`superpowers/plans/2026-08-09-order-flow-reorder.md`](superpowers/plans/2026-08-09-order-flow-reorder.md) | **Rencana reorder flow order user** — Ringkasan sebelum Jadwal, gabung layar jadwal+bayar, P0 kebocoran anon, dua email transisi. ✅ committed 2026-08-10, masuk `main` 2026-08-18. **Tidak termasuk daftar Task 8–13 di atas** — workstream terpisah yang menumpang branch yang sama |
| `multi-step-form/sql/36`–`49` | Migrasi; tiap file memuat pre-check, verifikasi, dan rollback-nya sendiri di bagian bawah. Deretnya **utuh** sejak 2026-08-05 — lubang di `43` sudah ditutup. `46` = Task 9A (dua sumbu); `47`/`48` dipakai reorder flow order (P0 anon + email transisi); `49` dipakai perbaikan bug jam tayang kustom ordinal 1 (**bukan** `reward_pools` — tabrakan nomor ditemukan 2026-08-10, dua kali). `reward_pools` bergeser jadi `sql/50` |
| `multi-step-form/sql/54` | **Di luar alur Jadwal Iklan.** `doku_webhook_events` — jejak permanen notifikasi DOKU, dari insiden webhook 2026-08-10 ([rencananya](superpowers/plans/2026-08-10-doku-webhook-silent-failure.md)). Sengaja mengambil `54` dan bukan `50`, supaya tiga rencana yang sudah mengklaim `50`–`53` (`reward_pools`, Task 11, Task 13) tidak perlu bergeser untuk keempat kalinya — migrasi-migrasi itu saling independen, jadi urutan penerapan tidak jadi soal. **Nomor bebas berikutnya untuk pekerjaan Jadwal Iklan tetap `50`.** |
