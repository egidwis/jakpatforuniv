# Batasan aksi "Jadwalkan Iklan Lagi" & pembatalan sepihak peneliti

> Desain, 2026-09-12. Lanjutan Phase 4 (`plans/2026-09-10-phase-4-penjadwalan-swalayan.md`).
> Dipicu satu temuan nyata: panel "Hadiah untuk batch baru" (Rp 90.000) tampil
> untuk order yang server-nya tidak akan pernah mengizinkan penjadwalan.

## Masalah yang memicu ini

Peneliti membuka "Jadwalkan Iklan Lagi" pada order yang **sedang direview**,
dan layar menagih hadiah batch baru. Dua cacat terpisah bertemu di satu layar:

1. **Tombolnya tidak punya gerbang kelayakan.** `SchedulePhase.tsx:1126` hanya
   menguji `!isKilatOrder`. Tombol muncul untuk 397 order `in_review`, 17
   `rejected`, 110 `spam` — semuanya akan ditolak RPC, sesudah peneliti
   mengisi hadiah.
2. **`create_ad_schedule` bertanya pada sumbu yang salah.** Lihat bagian
   berikutnya; ini kesalahan yang ditulis di sql/86 kemarin, bukan cacat lama.

Aturan yang diminta pemilik produk — *"kalau jadwal sebelumnya belum lunas,
peneliti belum boleh mengajukan jadwal baru"* — **tidak menutup kasus di atas**.
Order pemicunya tidak punya tagihan menggantung sama sekali. Keduanya perlu
diperbaiki; keduanya perbaikan yang berbeda. Dokumen ini memuat empat.

## Koreksi penting: `review_status_of()` BUKAN cacat

Review pertama menyebut pemetaan `slot_cancelled → approved` sebagai "lubang".
**Itu salah, dan koreksinya mengubah rancangan.**

Sistem ini punya **dua sumbu** yang sengaja dipisah di `sql/46`, lalu dipertegas
`sql/62`:

| Pertanyaan | Fungsi | Nilai |
|---|---|---|
| Kuesionernya lolos review? | `review_status_of()` | `in_review` / `approved` / `rejected` / `spam` |
| Iklannya tayang atau tidak? | `airing_status_of()` | `requested` / `live` / `cancelled` / `paid` … |

`sql/62` menulis alasannya dengan huruf besar: *"TANPA BAGIAN INI, MEMBATALKAN
SLOT AKAN MENGHAPUS RIWAYAT REVIEW. Membatalkan slot tidak membatalkan
persetujuan."* Justru order yang **sudah disetujui** yang bisa punya slot untuk
dibatalkan. Produksi mengonfirmasi rancangan itu bekerja: 13 order
`slot_cancelled` → `review_status='approved'`, `airing_status='cancelled'`.

**Yang keliru adalah pemakaiannya.** `sql/86` menulis:

```sql
IF v_review_status IS DISTINCT FROM 'approved' THEN   -- sumbu REVIEW
  RAISE EXCEPTION 'order ini belum disetujui...';
END IF;
```

"Boleh menambah jadwal?" adalah pertanyaan **sumbu tayang**, bukan sumbu review.
Fungsinya menjawab benar; penjaganya bertanya pada fungsi yang salah.

**Konsekuensi:** `review_status_of()` TIDAK disentuh. Mengubahnya akan merusak
desain dua-sumbu dan menghapus riwayat persetujuan 13 order.

---

## Enam perubahan

Urutan rilis: **A + D + E** boleh mendarat lebih dulu (nol perubahan pada kode
uang yang sedang berjalan); **B + C + F** menyusul sesudah Phase 4 terbukti di
browser.

| | Perubahan | Jalur uang? |
|---|---|---|
| **A** | Penjaga order tidak aktif di `sql/88` | tidak |
| **D** | Gerbang tombol berbasis **kuota** | tidak |
| **E** | Dot merah admin — reservasi menahan kuota, tagihan mati | tidak |
| **B** | Penjaga "tagihan hidup" di RPC | **ya** |
| **C** | "Batalkan Reservasi" — Pages Function dua tahap | **ya** |
| **F** | Sembunyikan riwayat batal milik peneliti | tidak (tapi butuh C) |

### A. Penjaga kelayakan order (`sql/88`)

Penjaga baru di `create_ad_schedule`, hanya untuk pemanggil non-admin, membaca
`v_submission_status` **mentah** — bukan lewat `review_status_of()`:

```sql
IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
  RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
END IF;
```

Penjaga `review_status_of()` yang sudah ada **tetap tinggal** — ia masih tugas
yang benar untuk menolak `in_review`. Penjaga baru menangani dua nilai yang
memang bukan urusan sumbu review.

⚠️ **Cakupan sesungguhnya: 9 order, bukan 147.** Versi pertama spec ini
menjumlahkan keempat status seakan semuanya lolos ke penjaga baru. Diukur ulang
2026-09-12 — berapa yang lolos penjaga review yang **sudah ada**:

| `submission_status` | Jumlah | Lolos `review_status_of()`? |
|---|---|---|
| `in_review` | 397 | 0 |
| `spam` | 110 | 0 |
| `rejected` | 17 | 0 |
| `cancelled` | 11 | 0 |
| **`slot_cancelled`** | **9** | **9** ← hanya ini yang sampai ke A |

Jadi A menutup **9 order**; 138 sisanya tidak pernah lolos sejak awal. A tetap
ditulis — penjaga berlapis di jalur uang itu murah dan `slot_cancelled` memang
lolos — tapi jangan salah menaksir bobotnya 15× lebih besar dari sebenarnya.

### B. Penjaga "tagihan hidup"

Keputusan pemilik produk: blokir **hanya** kalau ada tagihan terbuka yang belum
kedaluwarsa — definisi `billing.openInvoice` milik admin, sadar-kedaluwarsa
sejak `sql/83`.

⚠️ **Predikatnya WAJIB disalin dari `schedule_billing()`, bukan dikarang.**
`sql/83` sudah menurunkan `is_expired` (`expires_at IS NOT NULL AND expires_at < now()`).
Menulis ulang "yang mirip" akan mengunci peneliti pada 6 tagihan yang sudah mati.

Ukuran produksi 2026-09-12: **8** `pending` total — 6 sudah kedaluwarsa,
**2 hidup**, dan **0** baris warisan tanpa `expires_at`.

⚠️ **Asumsi yang harus diverifikasi ulang sebelum menerapkan.**
`killDokuLinksForSchedule()` sengaja menyaring `status='pending'` — BUKAN
predikat `live` — justru untuk menjaring baris warisan ber-`expires_at` NULL,
yang link DOKU-nya hidup tanpa batas. Jadi gerbang B (sadar-kedaluwarsa) dan
jalur pembunuh link (apa pun yang `pending`) adalah **dua himpunan berbeda**.
Hari ini selisihnya kosong (0 baris warisan), sehingga aman. Kalau angka itu
tidak lagi nol saat penerapan, gerbang B akan **meloloskan** peneliti memesan
jadwal baru padahal ia masih punya link DOKU yang bisa dibayar.

⚠️ **Ini TIDAK lagi membahayakan C** — catatan versi pertama yang berkata begitu
sudah usang. C sekarang memanggil `killDokuLinksForSchedule()`, yang justru
menyaring `status='pending'` **tepat untuk menjaring baris warisan itu**. Jadi
selisih himpunan ini murni urusan B.

Verifikasi sebelum menerapkan B:

```sql
SELECT count(*) FROM invoices WHERE status = 'pending' AND expires_at IS NULL;
-- harapan: 0. Kalau > 0, tinjau ulang gerbang B (C tidak terpengaruh).
```

### C. "Batalkan Reservasi" — Pages Function, bukan RPC

> ⚠️ **BAGIAN INI DITULIS ULANG 2026-09-12 sesudah keputusan pemilik produk.**
> Versi pertama mensyaratkan **nol tagihan hidup** dan menolak `waiting_payment`.
> Syarat itu **DICABUT**. Alasan pencabutannya ditulis di bawah supaya tidak
> dihidupkan lagi oleh orang berikutnya — termasuk oleh penulis versi pertama.

Peneliti boleh membatalkan **jadwal yang ia pesan sendiri** selama belum ada uang
yang masuk — **termasuk saat jadwal itu `waiting_payment` dengan tagihan hidup.**

**Kenapa syarat "nol tagihan hidup" salah.** Ia dipilih demi kesederhanaan
implementasi (RPC Postgres tidak bisa memanggil DOKU), lalu batasan teknis itu
dibiarkan mendikte produk. Terbalik. Diukur ke produksi 2026-09-12, dua tagihan
hidup yang ada kedaluwarsa dalam **5,2 dan 6,2 hari**. Jadi "tunggu tagihannya
mati" bukan menunggu — ia **jalan buntu seminggu** bagi peneliti yang salah pilih
tanggal pukul 10.00. Dan tanpa kasus ini, aksi pembatalan kehilangan seluruh
alasan keberadaannya: hold 1 jam sudah menangani sisanya sendiri.

**Bukan wewenang admin.** `cancelInvoice()` bukan fungsi istimewa — ia fungsi
browser biasa; satu-satunya penjaga kerasnya `.eq('status','pending')`. Yang
membuatnya admin-saja hanyalah RLS tabel yang ia tulis, bukan sifat aksinya.
Membatalkan tagihan atas jadwal **miliknya sendiri yang belum dibayar** adalah
hak yang wajar. Ukuran risikonya kecil: **1** jadwal `waiting_payment` bertagihan
hidup di seluruh produksi, **0** di antaranya dipesan peneliti.

**Satu tombol, dua tahap.** Di dashboard admin aksi ini tampak terbagi dua, tapi
ia sebenarnya **satu urutan wajib** — `scheduleCardActions.ts:273` menyembunyikan
"Batalkan Jadwal" selama masih ada tagihan hidup, jadi admin tidak pernah
benar-benar memilih. Peneliti tidak boleh dipaksa memahami bahwa tagihan dan
jadwal adalah dua benda berbeda; niatnya satu: *"aku tidak jadi pakai tanggal ini."*

```
1. matikan link DOKU          ← WAJIB, dan wajib DULUAN
2. tandai tagihan cancelled    (invoices + transactions)
3. lepas jadwal + slotnya
```

⚠️ **Karena langkah 1 butuh kredensial DOKU, ini TIDAK BISA jadi RPC Postgres.**
Pelaksananya **Pages Function** `functions/api/schedule/cancel-own.js`, memegang
service key, pola kepemilikan yang sama dengan `create-payment.js`.

⚠️ **`cancelSchedule()` TIDAK bisa dipakai ulang.** Ia menulis `ad_schedules`
langsung dari browser, sementara policy UPDATE-nya hanya `product@jakpat.net`.
Peneliti memanggilnya = **nol baris, tanpa error** — kelas bug yang sudah kambuh
tiga kali (memori `rls-update-policy-silent-zero-rows`, `sql/78`).

Syarat, semuanya ditegakkan di server:

- pemilik order (pola `sql/86` — `auth.uid()` ATAU email untuk 303 order lama)
- `slot_booked_by = 'user'` — jadwal buatan admin tetap milik admin
  (`slotHold.ts`: jadwal admin tidak pernah lepas tanpa keputusan admin)
- `payment_status` bukan `paid`/`completed`
- penjaga diulang **di dalam** query (`.eq('status','pending')`): webhook DOKU
  bisa mendarat tepat saat peneliti mengklik, dan uang yang sungguh diterima
  tidak boleh kalah oleh status di layar

**Urutan DOKU-dulu tidak boleh dilonggarkan** — insiden `af004b84`: jadwal mati
duluan, link masih menagih, peneliti membayar keesokan harinya. Kegagalan DOKU
**tidak memblokir** pembatalan (sejalan keputusan no. 7 Phase 4); sebabnya
dicatat ke `doku_cancel_last_error` untuk ditindaklanjuti admin.

Yang ditulis di langkah 3:

```
status = 'cancelled', slot_booked_by = NULL, slot_reserved_at = NULL
```

Tanggal **tetap** — yang dilepas tahanannya, bukan riwayatnya.

### D. Gerbang tombol — diukur dari KUOTA, bukan dari tagihan

Satu helper murni `canScheduleAgain()` di `src/utils/`. Tombol **disembunyikan**,
bukan `disabled` — kontrak `scheduleCardActions.ts`. Alasannya dititipkan ke
kalimat di kartu, supaya tombolnya tidak sekadar lenyap tanpa sebab.

⚠️ **Gerbang B dan gerbang tombol mengukur hal yang BERBEDA — ini bukan
duplikasi.** Predikat kuota menghitung menurut **status**, bukan menurut
pembayaran:

| Lapis | Yang dihitung |
|---|---|
| `assert_daily_ad_quota_free` kaki 2 | `status IN ('waiting_payment','paid','scheduled','live')` |
| `occupiesSlot()` | semua **kecuali** `rejected`/`spam`/`cancelled`/`in_review`/`completed`/`reserved_expired` |

Jadi jadwal `waiting_payment` **yang belum dibayar tetap memakan kuota**.
Satu-satunya yang dilepas adalah hold peneliti yang basi (`slot_booked_by='user'`
DAN belum lunas DAN `slot_reserved_at` > 1 jam lalu) — jadwal `waiting_payment`
yang dipesan **admin** menahan kuota **selamanya**.

Akibatnya, kalau tombol digerbang oleh "tagihan hidup" (gerbang B) saja, peneliti
bisa menumpuk jadwal `waiting_payment` tanpa tagihan hidup, masing-masing memakan
kuota hari yang berbeda, menghabiskan kapasitas peneliti lain. Ia tidak bisa
memesan tanggal yang **sama** (`assert_schedule_window_free` menolak irisan),
tapi tanggal lain terbuka lebar.

**Aturan tombol:** sembunyikan bila order punya jadwal yang **masih menahan
kuota** (`occupiesSlot()` true) **dan** belum lunas — plus syarat kelayakan A.

Efek samping yang diinginkan: membatalkan reservasi (C) membuat
`status='cancelled'` → `occupiesSlot()` false → kuota kembali → tombol muncul
lagi **dengan sendirinya**. Satu predikat melayani keduanya; tidak ada aturan
tambahan yang perlu ditulis.

### E. Dot merah admin — "reservasi menahan kuota, tagihan sudah mati"

Bug yang dilaporkan: tagihan dibatalkan sementara reservasi masih menahan slot,
dan daftar admin **tidak memberi tanda apa pun**.

**Sebabnya struktural, bukan cabang yang salah.** `deriveLifecycle(submission,
paymentData, existingPage, isScheduled)` — ketiga pemanggilnya hanya mengoper
kolom `form_submissions`; `isScheduled` cuma `boolean`. Jadi
`getSubmissionActionDot` **tidak pernah melihat `ad_schedules`**. Tagihan
perpanjangan yang dibatalkan mustahil sampai ke sana. Bukan cabang hilang —
**input yang hilang**. Papan Jadwal sudah benar lewat `chipKindOf`; datanya ada,
hanya tidak pernah sampai ke daftar.

⚠️ **ANGKA DIKOREKSI 2026-09-12 — dan koreksinya mengubah syarat dot.**
Versi pertama menulis 272 order dengan **2** bertanggal depan. Pengukuran ulang:

| Pemesan | Tanggal | Jumlah |
|---|---|---|
| admin | sudah lewat | 238 |
| peneliti | sudah lewat | 69 |
| tak seorang pun | sudah lewat | 35 |
| **admin** | **masih depan** | **18** |
| **peneliti** | **masih depan** | **6** |
| tak seorang pun | tanpa tanggal | 2 |

**368 order, dan 24 bertanggal depan — bukan 2.** Tabel lama juga menyebut nol
baris peneliti bertanggal depan; ada **6**.

🔴 **Yang menentukan: semua 24 baris itu `payment_status='paid'`.** Disaring ke
yang belum lunas, hasilnya **kosong**. Jadi syarat yang ditulis versi pertama
(`start_date >= hari ini` DAN `slot_booked_by` tidak NULL) akan menyalakan
**24 titik merah yang seluruhnya jadwal LUNAS tanpa pekerjaan apa pun** —
persis kegagalan yang dikutip spec ini sebagai pelajaran (`lifecycle.ts:233`:
*"menagih admin yang salah"*), diulang oleh perbaikan yang dimaksudkan
mencegahnya.

**Syarat dot (dikoreksi), tiga klausa:**

1. `start_date >= hari ini`
2. `slot_booked_by` tidak NULL — konsisten dengan "Kabari via WA"
   (`scheduleCardActions.ts:281`): NULL berarti *"tak seorang pun pernah
   memesannya"*, bukan "dipesan admin"
3. 🔴 **belum lunas** (`payment_status` bukan `paid`/`completed`) — klausa yang
   hilang di versi pertama

⚠️ **Menyala untuk NOL order hari ini.** Itu jawaban yang jujur: keadaan yang
dilaporkan memang bisa terjadi, tapi tidak sedang berdiri di produksi.
Konsekuensinya **E tidak punya baris produksi untuk diverifikasi** — uji
browsernya wajib membuat keadaan itu dulu (batalkan tagihan atas reservasi
bertanggal depan yang belum lunas), bukan mencari order yang sudah ada.

**Caranya:** parameter baru **opsional** pada `deriveLifecycle(..., scheduleSignals?)`
— ringkasan per-order (ada reservasi menahan kuota? ada tagihan hidup?) yang
sudah dihitung di tempat lain. Opsional supaya pemanggil lain tidak berubah
perilakunya.

⚠️ **Pemanggilnya TIGA, bukan empat** (dikoreksi 2026-09-12):
`InternalDashboard.tsx:1538`, `SubmissionsTableRow.tsx:59`,
`SubmissionDetailSheet.tsx:267`. `SubmissionListRow` **tidak** memanggilnya — ia
menerima `lifecycle` sebagai prop, lalu memanggil `getSubmissionActionDot`.
Periksa dulu apakah `SubmissionsTableRow` masih hidup: barisnya sendiri menulis
*"(Desktop rows now use SubmissionListRow + SubmissionDetailSheet)"*
(`SubmissionsTableRow.tsx:40`), jadi ia mungkin kode mati. Kalau benar mati,
pemanggil nyatanya **dua**.

### F. Riwayat jadwal dibatalkan — tunda, dan ini alasannya

Empat kartu "Dibatalkan" berderet sama menonjolnya dengan jadwal hidup.

**Yang TERBUKTI bukan bug: kartunya menumpuk.** Garis waktu produksi:

```
#3 dibuat 01:56:15  →  dibatalkan 02:01:54
#4 dibuat 02:02:46  ← 52 detik SESUDAH #3 mati
```

`assert_schedule_window_free` melewati baris `status='cancelled'` (sql/52:167),
dan itu **benar** — jendela yang sudah dibatalkan memang bebas dipakai lagi.
Seluruh repo hanya punya **2 order** yang pernah punya jendela ganda hidup,
keduanya Juli–Agustus. Yang terlihat adalah **riwayat**, bukan tumpukan.

**Yang juga terbukti: tanggal yang tampil TIDAK menahan kuota.** Diukur pada
tanggal yang dipesan berulang: 21 Sep → `memakan_kuota=0`, `batal=2`; 22 Sep →
`memakan_kuota=0`, `batal=1`. Baris batal sudah dikecualikan di **kedua** lapis.
Maka **jangan mengosongkan tanggalnya**: ia sudah tidak menahan apa pun,
`cancelSchedule()` menyatakan *"Tanggal TETAP. Yang dilepas adalah tahanannya,
bukan riwayatnya"*, dan baris tak-bertanggal yang punya riwayat akan tertukar
dengan 26 baris `unscheduled` yang memang belum pernah dijadwalkan.

**Aturan yang diinginkan:** sembunyikan yang dibatalkan **peneliti sendiri**
(ia sudah tahu — murni distraksi); **pertahankan** yang dibatalkan admin, karena
kartunya memuat kalimat yang wajib terbaca: *"Jadwal ini dibatalkan tim kami.
Butuh penjelasan? Chat Mimin di bawah."* Menyembunyikannya = jadwal lenyap tanpa
sebab, dan `ReviewPhase.tsx:177` sudah memperingatkan agar tidak menuduh peneliti
membatalkan sesuatu yang bukan ia batalkan.

⚠️ **DITUNDA, karena pembedanya belum ada.** `ad_schedules` tidak punya kolom
"siapa yang membatalkan"; `review_history` mencatatnya untuk ORDER saja. Jadi
aturan ini hanya bisa berlaku untuk jadwal yang dibatalkan lewat C — dan untuk
152 baris lama kita tidak bisa tahu, menebaknya akan salah. Menambah kolom
`cancelled_by` demi menyembunyikan **4** kartu bertanggal depan bernilai rendah
dibanding E. **F menyusul bersama C**, bukan rilis terpisah.

---

## Arsitektur & aliran data

```
SchedulePhase  ──canScheduleAgain()──>  tombol muncul / tidak        (D)
      │                                  diukur dari KUOTA: occupiesSlot()
      ▼ (klik)                           true + belum lunas → sembunyikan
ScheduleAgainDialog
      │
      ▼ create_ad_schedule (sql/88)
        ├── penjaga order tidak aktif                                (A)
        ├── penjaga tagihan hidup                                    (B)
        └── penjaga lama: Kilat, review, cutoff 13.00, hadiah batch
      │
      ▼ create-payment.js  (tak berubah)
```

Pembatalan — **satu tombol, tiga tulisan berurutan**:

```
Kartu jadwal (peneliti)
      │
      ▼ POST /api/schedule/cancel-own      (Pages Function, service key)   (C)
        syarat: milik sendiri + slot_booked_by='user' + belum lunas
        1. DOKU Cancel Order          ← WAJIB DULUAN, gagal ≠ memblokir
        2. invoices + transactions → 'cancelled'
        3. ad_schedules → status='cancelled', slot dilepas
      │
      ▼ kuota kembali → occupiesSlot() false → tombol (D) muncul lagi
```

Daftar admin:

```
SubmissionListRow ──deriveLifecycle(..., scheduleSignals?)──> dot merah    (E)
   syarat: start_date >= hari ini DAN slot_booked_by ≠ NULL  → 2 order
```

**Tiga penjaga, tiga pertanyaan berbeda — bukan duplikasi.**
D menjawab *"apakah peneliti ini sudah menahan kuota yang belum ia bayar?"*;
B menjawab *"apakah ada tagihan hidup yang belum diselesaikan?"*;
A menjawab *"apakah ordernya masih aktif?"*. D boleh salah tanpa membahayakan
data; A+B tidak boleh salah sama sekali. Keduanya memakai predikat yang sudah
ada (`occupiesSlot()` dan `schedule_billing`), bukan salinan baru — beri komentar
silang, pola yang sama dengan kuota harian di `sql/86`.

## Penanganan kesalahan

Setiap penolakan RPC punya kalimatnya sendiri di dua bahasa. `ScheduleAgainDialog`
sudah meneruskan `e?.message` apa adanya, jadi pesan RPC harus layak dibaca
peneliti — bukan jargon kolom.

Kegagalan pembatalan **tidak** boleh senyap: nol baris terpengaruh berarti ada
yang lebih dulu (webhook mendarat, admin bertindak), dan itu dilaporkan sebagai
penolakan, bukan sukses. Pola `explainNoRowsCancelling()`.

⚠️ **Kegagalan DOKU adalah kasusnya sendiri, dan ia TIDAK memblokir.** Kalau
langkah 1 gagal sementara langkah 2–3 berhasil, peneliti tetap mendapat slotnya
kembali dan link DOKU-nya mungkin masih hidup. Sebabnya dicatat ke
`doku_cancel_last_error`, dan perlindungan terakhirnya tetap penjaga webhook
`paid_on_dead_bill` (sql/80) + `paid_on_stale_bill` (sql/85) — keduanya nol
bergantung pada DOKU. Peneliti diberi tahu pembatalannya berhasil, **tanpa**
kalimat menenangkan tentang tagihan yang belum tentu mati (pelajaran `af004b84`:
`doku_cancelled_at` hanya diisi kalau DOKU benar-benar mengonfirmasi).

Keadaan yang **tidak lagi ada**: "terkunci" — versi pertama spec ini
menyembunyikan kedua tombol untuk jadwal `waiting_payment` bertagihan hidup.
Sesudah C ditulis ulang, peneliti selalu punya jalan keluar.

## Pengujian

Tes ditulis **sebelum** kodenya (TDD), dan tiap tes harus terbukti MERAH lebih
dulu untuk alasan yang benar.

**Unit murni**
1. `canScheduleAgain()`: `in_review` → false; `slot_cancelled` → false;
   `approved` + nol jadwal menahan kuota → true; Kilat → false.
2. **Gerbang kuota (D):** order dengan jadwal `waiting_payment` **tanpa tagihan
   apa pun** → **false** (tombol sembunyi). Tes ini yang membedakan gerbang
   berbasis kuota dari gerbang berbasis tagihan; kalau ia hijau memakai
   `openInvoice`, aturannya salah pasang.
3. **Hold basi:** jadwal `slot_booked_by='user'`, belum lunas, `slot_reserved_at`
   > 1 jam lalu → **true** (tidak lagi menahan kuota). Cermin `holdsSlot()`.
4. **Hold admin tidak pernah basi:** input yang sama tapi `slot_booked_by='admin'`
   → **false**. Aturan `slotHold.ts`, dan sumber 13 baris produksi.
5. Kedaluwarsa tagihan (B): tagihan `pending` yang `expires_at < now()` →
   **tidak memblokir**. Tes ini yang menangkap "predikat dikarang".
6. **Dot (E) — EMPAT kasus, bukan tiga.** `start_date` depan + `slot_booked_by
   ='admin'` + **belum lunas** → merah; `start_date` lampau → null;
   `slot_booked_by=NULL` → null (menjaga 35 baris "tak seorang pun memesan"
   tetap diam); 🔴 **`start_date` depan + `slot_booked_by='admin'` + LUNAS →
   null.** Kasus keempat itu yang mengunci koreksi 2026-09-12: tanpa klausa
   "belum lunas" ia hijau di versi lama dan 24 jadwal lunas ikut menyala.

**RPC / endpoint (uji relasional)**
7. Peneliti + order `slot_cancelled` → RPC menolak.
8. Peneliti + order `in_review` → RPC menolak (penjaga lama, jangan sampai hilang).
9. **Admin + order `slot_cancelled` → RPC MENGIZINKAN.** Penjaga A hanya untuk
   non-admin; kalau tes ini merah, A bocor ke jalur admin. ⚠️ Satu-satunya tes
   yang **mulai hijau** — ia merah hanya kalau A salah tulis.
10. `cancel-own` atas jadwal `slot_booked_by='admin'` → 403.
11. `cancel-own` atas jadwal milik order lain → 403.
12. `cancel-own` atas jadwal lunas → menolak.
13. **`cancel-own` atas `waiting_payment` bertagihan hidup → BERHASIL**, dan
    urutannya terbukti: DOKU dipanggil **sebelum** baris `invoices` disentuh.
    Ini tes yang mengunci keputusan pemilik produk 2026-09-12; kalau ia merah,
    syarat "nol tagihan hidup" diam-diam hidup lagi.
14. **Kegagalan DOKU tidak memblokir:** DOKU menolak → jadwal tetap lepas,
    `doku_cancel_last_error` terisi, `doku_cancelled_at` tetap NULL.

**Gerbang mesin**: `npx vitest run` (baseline 667/49), `tsc -p tsconfig.app.json`
(baseline 77), `npm run build`.

**Uji browser** — tidak tergantikan oleh tes mesin:
- Order `in_review`: tombol **tidak muncul** (kasus pemicu dokumen ini).
- Order `slot_cancelled`: tombol tidak muncul.
- Order dengan jadwal `waiting_payment`: tombol **tidak muncul** (kuota tertahan),
  tapi **"Batalkan Reservasi" muncul**.
- Batalkan reservasi → slot lepas → kuota hari itu kembali → tombol "Jadwalkan
  Iklan Lagi" **muncul lagi tanpa refresh manual**.
- Papan admin: order yang reservasinya menahan kuota tapi tagihannya mati
  → **titik merah**; order lama bertanggal lampau → **tidak ada titik**.

## Risiko yang dipikul sadar

- **Rilis jalur uang ketiga dalam ~3 minggu** menuju 1 Oktober, sementara
  Phase 4 **belum pernah diuji di browser satu kali pun**. Karena itu A+D+E
  (murni penutup lubang, nol perubahan uang) dipisah dari B+C.
- **B dan C menyunting jalur yang sedang menagih peneliti hari ini.** Keduanya
  menunggu Phase 4 terbukti jalan.
- **Selisih himpunan B vs jalur pembunuh link** — nol hari ini, wajib
  diverifikasi ulang sebelum menerapkan (query di bagian B).
- **`review_status_of()` tetap memetakan `slot_cancelled → approved`.**
  Keputusan sadar, bukan utang. Pemanggil lain bergantung padanya.
- **`payment_status` bukan bukti pembayaran** — sebagian order dibayar di luar
  sistem. Gerbang B bersandar pada tagihan, bukan pada kolom itu sendiri.
- **Peneliti kini bisa mematikan tagihan hidup sendiri.** Wewenang baru di jalur
  uang, dan ia memanggil DOKU. Dibatasi ke jadwal miliknya yang `slot_booked_by
  ='user'` dan belum lunas; penjaga diulang di dalam query karena webhook bisa
  mendarat saat ia mengklik. Ukuran paparannya kecil hari ini (**1** jadwal
  `waiting_payment` bertagihan hidup di seluruh produksi, **0** dipesan peneliti),
  tapi Phase 4 akan menambahnya.
- **Cancel Order DOKU masih nol bukti keberhasilan** (`doku_cancelled_at` nol
  baris seumur hidup) dan tidak pernah mencakup kartu kredit (~3%). C menjadikan
  peneliti pemakai pertamanya. Perlindungan sesungguhnya tetap resolver `/bayar/`
  + `paid_on_stale_bill`, yang nol bergantung pada DOKU.
- **E menambah parameter pada `deriveLifecycle`**, fungsi yang dipakai **3**
  pemanggil admin (dikoreksi dari "4"; `SubmissionListRow` menerima prop, bukan
  memanggil — dan `SubmissionsTableRow` mungkin kode mati). Opsional supaya
  ketiganya tidak berubah perilaku — tapi fungsinya tetap tersentuh.
- **E tidak punya baris produksi untuk diverifikasi** — sesudah klausa "belum
  lunas" ditambahkan, dot menyala untuk **0** order hari ini. Keadaannya wajib
  dibuat manual saat uji browser; tidak ada order yang bisa dipakai apa adanya.

## Yang sengaja TIDAK dikerjakan

- Mengubah `review_status_of()` — lihat koreksi di atas.
- Self-cancel untuk jadwal buatan admin — bertabrakan dengan `slotHold.ts`.
- **Mengosongkan tanggal jadwal yang dibatalkan** — sudah tidak menahan kuota
  (terbukti: 21–22 Sep `memakan_kuota=0`), dan menghapusnya membuang riwayat
  serta menyamarkannya dengan 26 baris `unscheduled`. Lihat F.
- **Memperbaiki "kartu menumpuk"** — terbukti BUKAN bug; #4 lahir 52 detik
  sesudah #3 dibatalkan, dan penjaga irisan memang melepas jendela yang batal.
- Notifikasi admin saat peneliti membatalkan — belum ada bukti dibutuhkan;
  ukur dulu (prinsip yang sama dengan bagian dashboard admin di rencana Phase 4).
- Kolom `cancelled_by` di `ad_schedules` sebagai rilis tersendiri — ia hanya
  dibutuhkan F, dan F menyusul bersama C.
