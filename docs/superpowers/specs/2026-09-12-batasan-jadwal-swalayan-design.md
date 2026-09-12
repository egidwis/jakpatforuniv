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

## Empat perubahan

Urutannya mengikat: **A → D** boleh mendarat sendiri; **B → C** menyusul.

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

Cakupan: 9 `slot_cancelled` + 11 `cancelled` + 17 `rejected` + 110 `spam`.

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
tidak lagi nol saat penerapan, gerbang B akan meloloskan peneliti yang masih
punya link DOKU bisa-dibayar — dan C di bawah menjadi tidak aman.

Verifikasi wajib sebelum menerapkan:

```sql
SELECT count(*) FROM invoices WHERE status = 'pending' AND expires_at IS NULL;
-- harapan: 0. Kalau > 0, HENTIKAN dan tinjau ulang gerbang B & C.
```

### C. RPC `cancel_own_schedule()` — baru

Peneliti boleh membatalkan **jadwal yang ia pesan sendiri** selama belum ada uang.
Cermin aturan `cancelOrder()` yang sudah berlaku untuk ordinal 1 (`StatusPage.tsx:42`:
*"Boleh membatalkan sendiri? Hanya selama BELUM ADA UANG."*).

Syarat berlapis, semuanya di server:

- pemilik order (pola kepemilikan yang sama dengan `sql/86` — `auth.uid()`
  ATAU email untuk 303 order tanpa `auth_user_id`)
- `slot_booked_by = 'user'` — jadwal buatan admin tetap milik admin
  (`slotHold.ts`: jadwal admin tidak pernah lepas tanpa keputusan admin)
- `payment_status` bukan `paid`/`completed`
- **tidak ada tagihan hidup** (predikat yang sama dengan B)

⚠️ **`cancelSchedule()` TIDAK bisa dipakai ulang.** Ia menulis `ad_schedules`
langsung dari browser, sementara policy UPDATE-nya hanya `product@jakpat.net`.
Peneliti memanggilnya = **nol baris, tanpa error** — kelas bug yang sudah kambuh
tiga kali (memori `rls-update-policy-silent-zero-rows`, `sql/78`). Karena itu
RPC baru, `SECURITY DEFINER`.

⚠️ **Batas yang tidak bisa dilewati RPC: Postgres tidak bisa memanggil DOKU.**
Urutan wajib "matikan link dulu, baru batalkan jadwal" (pelajaran order
`af004b84`) mustahil dipenuhi RPC sendirian. **Karena itu syarat "tanpa tagihan
hidup" bersifat MUTLAK** — bukan kenyamanan. Kalau tidak ada tagihan hidup,
tidak ada link yang perlu dimatikan, dan batas ini tidak pernah tersentuh.
Peneliti yang punya tagihan hidup diarahkan ke admin, bukan diberi tombol.

Yang ditulis RPC, meniru `cancelSchedule()` cabang extension:

```
status = 'cancelled', slot_booked_by = NULL, slot_reserved_at = NULL
```

Tanggal **tetap** — yang dilepas tahanannya, bukan riwayatnya.

### D. Gerbang tombol (`SchedulePhase.tsx`)

Satu helper murni `canScheduleAgain()` di `src/utils/`, menguji syarat yang sama
dengan A + B. Tombol **disembunyikan**, bukan `disabled` — kontrak
`scheduleCardActions.ts`. Alasannya dititipkan ke kalimat di kartu, supaya
tombolnya tidak sekadar lenyap tanpa sebab.

Helper terpisah supaya aturan UI dan aturan server punya satu tempat yang bisa
dibandingkan — bukan kondisi yang ditulis ulang di JSX.

---

## Arsitektur & aliran data

```
SchedulePhase  ──canScheduleAgain()──>  tombol muncul / tidak        (D)
      │
      ▼ (klik)
ScheduleAgainDialog
      │
      ▼ create_ad_schedule (sql/88)
        ├── penjaga order tidak aktif                                (A)
        ├── penjaga tagihan hidup                                    (B)
        └── penjaga lama: Kilat, review, cutoff 13.00, hadiah batch
      │
      ▼ create-payment.js  (tak berubah)
```

Pembatalan:

```
Kartu jadwal (peneliti)  ──cancel_own_schedule()──>  status='cancelled'   (C)
   syarat: milik sendiri + slot_booked_by='user' + belum lunas + nol tagihan hidup
```

**Dua penjaga, disengaja.** D menjawab "tampilkan tombolnya?"; A+B menjawab
"izinkan tulisannya?". D boleh salah tanpa membahayakan data; A+B tidak boleh
salah sama sekali. Angkanya wajib sama — beri komentar silang, pola yang sama
dengan kuota harian di `sql/86`.

## Penanganan kesalahan

Setiap penolakan RPC punya kalimatnya sendiri di dua bahasa. `ScheduleAgainDialog`
sudah meneruskan `e?.message` apa adanya, jadi pesan RPC harus layak dibaca
peneliti — bukan jargon kolom.

Kegagalan `cancel_own_schedule` **tidak** boleh senyap: nol baris terpengaruh
berarti ada yang lebih dulu (webhook mendarat, admin bertindak), dan itu
dilaporkan sebagai penolakan, bukan sukses. Pola `explainNoRowsCancelling()`.

## Pengujian

Tes ditulis **sebelum** kodenya (TDD), dan tiap tes harus terbukti MERAH lebih
dulu untuk alasan yang benar.

**Unit murni**
1. `canScheduleAgain()`: `in_review` → false; `slot_cancelled` → false;
   `approved` + nol tagihan hidup → true; `approved` + tagihan hidup → false;
   Kilat → false.
2. Kedaluwarsa: order dengan tagihan `pending` yang `expires_at < now()` → **true**
   (tidak memblokir). Tes ini yang menangkap "predikat dikarang".

**RPC (uji relasional)**
3. Peneliti + order `slot_cancelled` → RPC menolak.
4. Peneliti + order `in_review` → RPC menolak (penjaga lama, jangan sampai hilang).
5. Peneliti + order `approved` + tagihan hidup → RPC menolak.
6. **Admin + order `slot_cancelled` → RPC MENGIZINKAN.** Penjaga baru hanya untuk
   non-admin; kalau tes ini merah, A bocor ke jalur admin.
7. `cancel_own_schedule` atas jadwal `slot_booked_by='admin'` → menolak.
8. `cancel_own_schedule` atas jadwal milik order lain → menolak.
9. `cancel_own_schedule` atas jadwal lunas → menolak.

**Gerbang mesin**: `npx vitest run` (baseline 667/49), `tsc -p tsconfig.app.json`
(baseline 77), `npm run build`.

**Uji browser** — tidak tergantikan oleh tes mesin:
- Order `in_review`: tombol **tidak muncul** (kasus pemicu dokumen ini).
- Order `slot_cancelled`: tombol tidak muncul.
- Order `approved` + tagihan hidup: tombol tidak muncul, kartu menjelaskan kenapa.
- Peneliti membatalkan jadwalnya sendiri → slot lepas, kuota hari itu kembali.

## Risiko yang dipikul sadar

- **Rilis jalur uang ketiga dalam ~3 minggu** menuju 1 Oktober, sementara
  Phase 4 **belum pernah diuji di browser satu kali pun**. Karena itu A+D
  (murni penutup lubang, nol perubahan uang) dipisah dari B+C.
- **B dan C menyunting jalur yang sedang menagih peneliti hari ini.** Keduanya
  menunggu Phase 4 terbukti jalan.
- **Selisih himpunan B vs jalur pembunuh link** — nol hari ini, wajib
  diverifikasi ulang sebelum menerapkan (query di bagian B).
- **`review_status_of()` tetap memetakan `slot_cancelled → approved`.**
  Keputusan sadar, bukan utang. Pemanggil lain bergantung padanya.
- **`payment_status` bukan bukti pembayaran** — sebagian order dibayar di luar
  sistem. Gerbang B bersandar pada tagihan, bukan pada kolom itu sendiri.
- **Peneliti tanpa tombol batal** ketika tagihannya hidup: ia harus menghubungi
  admin, atau menunggu hold 1 jam lewat. Konsekuensi sadar dari batas DOKU/RPC.

## Yang sengaja TIDAK dikerjakan

- Mengubah `review_status_of()` — lihat koreksi di atas.
- Self-cancel untuk jadwal buatan admin — bertabrakan dengan `slotHold.ts`.
- Self-cancel lewat Pages Function agar bisa memanggil DOKU — ditolak demi
  kesederhanaan; syarat "nol tagihan hidup" membuatnya tidak perlu.
- Notifikasi admin saat peneliti membatalkan — belum ada bukti dibutuhkan;
  ukur dulu (prinsip yang sama dengan bagian dashboard admin di rencana Phase 4).
