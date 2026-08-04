# Checklist Uji Mandiri — Phase 0 Jadwal Iklan

Untuk dijalankan **setelah deploy frontend**. Status berjalan ada di
[`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md).

> **⚠️ DIPERBARUI 2026-08-04 — premis asli file ini sudah berubah.**
> Waktu ditulis, `sql/40` sengaja ditahan dan checklist ini dirancang untuk
> membuktikan Phase 1 tetap diam. `sql/40` **sudah diterapkan ke produksi**
> sejak itu, jadi auto-publish memang aktif. §8 dan §10 sudah dikoreksi;
> §2–§7 tetap berlaku apa adanya.

**Keadaan per 2026-08-04:**

| | Status |
|---|---|
| `sql/36`–`sql/39` (Phase 0) | ✅ diterapkan ke produksi |
| `sql/40` (Phase 1, auto-publish) | ✅ diterapkan ke produksi |
| `sql/41` (Phase 2 Task 8, `ad_schedules`) | ✅ diterapkan & diverifikasi |
| Frontend | ⬜ **menunggu deploy** — inilah yang checklist ini uji |

Frontend produksi masih di `9ea82ef`, sementara DB sudah di `sql/41`. Jadi tiga bug
Phase 0 masih hidup di layar walau perbaikannya sudah ada di `main`: kuota slot
mengabaikan perpanjangan, insentif batch ditagih dua kali untuk jadwal ke-3+, dan
reschedule menimpa jendela tayang iklan berjalan. Deploy menutup celah itu.

Prioritas: **§2, §3, §5 wajib.** Sisanya kalau sempat.

---

## 1. Sebelum deploy

- [ ] `origin/main` ada di `b4ed204` (merge Task 8) — inilah yang di-deploy
- [ ] Catat commit produksi saat ini untuk jalan mundur: `9ea82ef`

---

## 2. Asap test setelah deploy (5 menit) — WAJIB

Tujuannya menangkap kerusakan besar secepatnya, bukan menguji fitur.

- [ ] Dashboard user terbuka, daftar order tampil normal
- [ ] Dashboard admin → Submissions terbuka, daftar tampil normal
- [ ] Halaman Scheduling (kalender) memuat tanpa error
- [ ] Buka satu halaman iklan publik `/pages/<slug>` yang sedang tayang — tampil utuh
- [ ] Console browser tidak memuat error merah baru

> Kalau ada yang gagal di sini, **hentikan dan rollback** (lihat §9). Sisa checklist
> tidak ada gunanya kalau dasarnya rusak.

---

## 3. Kuota slot kini menghitung perpanjangan — WAJIB

Ini perbaikan paling berisiko sekaligus paling berharga di Phase 0: sebelumnya
perpanjangan **tidak pernah** dihitung, sehingga tanggal yang sudah penuh masih bisa
dijual. Kuotanya hanya **4 iklan reguler per hari**, jadi satu perpanjangan yang luput
sudah berarti kelebihan 25%.

**Dapatkan angka acuan dari DB dulu** (tempel di Supabase SQL Editor):

```sql
-- Okupansi harian 14 hari ke depan, perpanjangan disertakan.
-- Hari terakhir TIDAK dihitung, sama seperti aturan di frontend.
WITH RECURSIVE d(day) AS (
  SELECT CURRENT_DATE
  UNION ALL SELECT day + 1 FROM d WHERE day < CURRENT_DATE + 13
),
occ AS (
  SELECT fs.id AS sid, fs.start_date::date AS sd, fs.end_date::date AS ed
  FROM form_submissions fs
  WHERE fs.distribution_type = 'regular'
    AND fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
    AND fs.submission_status NOT IN ('rejected','spam','cancelled','completed')
  UNION ALL
  SELECT e.submission_id, e.start_date::date, e.end_date::date
  FROM form_submissions_extend e
  JOIN form_submissions fs ON fs.id = e.submission_id
  WHERE fs.distribution_type = 'regular'
    AND e.submission_status IN ('waiting_payment','paid','scheduled','live')
)
SELECT d.day, COUNT(*) AS terpakai, 4 - COUNT(*) AS sisa
FROM d JOIN occ ON d.day >= occ.sd AND d.day < occ.ed
GROUP BY d.day ORDER BY d.day;
```

Angka ini **kasar** (belum memisahkan extra ad dan belum menerapkan kedaluwarsa
reservasi 1 jam), jadi pakai sebagai pembanding arah, bukan angka mutlak.

- [ ] Buka wizard pemesanan → langkah Jadwal. Angka `n/4` per tanggal **naik** dibanding
      sebelum deploy pada tanggal yang punya perpanjangan aktif
- [ ] Tanggal yang query di atas tunjukkan penuh (4) memang **tidak bisa dipilih**
- [ ] Buka dialog perpanjangan (ExtendSection) untuk order yang **sudah punya**
      perpanjangan → kalendernya **tidak** menghitung jadwal itu sendiri (angkanya tidak
      bertambah satu tanpa sebab)

Empat detail yang membuktikan implementasinya benar, bukan sekadar query kedua
ditambahkan — periksa yang datanya tersedia:

- [ ] Perpanjangan berstatus **`paid`** (bukan hanya `scheduled`) ikut terhitung
- [ ] Perpanjangan milik survei **kilat** tidak menggerus kuota `regular`
- [ ] Perpanjangan milik **extra ad** masuk hitungan extra, bukan reguler
- [ ] Perpanjangan **`cancelled`** tidak terhitung

---

## 4. Insentif batch tidak lagi ditagih dua kali

Sebelumnya "bulan baru" dibandingkan ke jadwal **pertama**, sehingga jadwal ke-3 yang
sebulan dengan jadwal ke-2 tetap dinilai batch baru — dan insentif ditagih ulang untuk
pool hadiah yang sama.

- [ ] Buka dialog "Buat Jadwal Baru" untuk survei yang **sudah punya ≥2 jadwal**
- [ ] Pilih tanggal akhir yang jatuh di **bulan yang sama** dengan jadwal terakhir →
      rincian biaya **tidak** memuat item insentif batch baru
- [ ] Pilih tanggal akhir di **bulan berikutnya** → item insentif **muncul**
- [ ] Ganti-ganti tanggal beberapa kali dengan cepat → angka yang tampil sesuai pilihan
      terakhir (bukan hasil balasan yang datang telat)

---

## 5. Jendela tayang tidak tertimpa — WAJIB

Bug ini bisa **memadamkan iklan yang sedang berjalan**, jadi jangan dilewat.

- [ ] Pilih survei yang punya **lebih dari satu jadwal** dan sedang tayang di jadwal
      lanjutan
- [ ] Catat `publish_start_date`/`publish_end_date` halamannya:
      ```sql
      SELECT id, submission_id, publish_start_date, publish_end_date, current_period_batch
      FROM survey_pages WHERE submission_id = '<id>';
      ```
- [ ] Buka PageBuilder untuk survei itu **dari halaman Submissions** (bukan dari kalender
      Scheduling — jalur inilah yang dulu bug), ubah sesuatu yang sepele, simpan
- [ ] Jalankan ulang query di atas → **kedua tanggal tidak berubah**
- [ ] Ulangi dari kalender Scheduling → tetap tidak berubah

---

## 6. Larangan jadwal tumpang tindih

Aturannya sudah hidup di DB sejak `sql/38`; yang diuji di sini adalah bahwa ia tidak
menghalangi pekerjaan normal admin.

- [ ] Coba buat jadwal yang rentangnya **beririsan** dengan jadwal lain di survei yang
      sama → ditolak dengan pesan "Jadwal beririsan", bukan error mentah
- [ ] Ubah tanggal jadwal yang sudah ada ke rentang yang **tidak** beririsan → berhasil
- [ ] Ubah **status** jadwal tanpa mengubah tanggal → berhasil (transisi status sengaja
      dilewatkan validasi, supaya cron tidak gagal massal)

---

## 7. Perubahan kecil

- [ ] **Tombol "Banner OK" sudah tidak ada** di Publish Pages. Peringatan banner kini
      hanya bersih ketika banner benar-benar disimpan
- [ ] Form responden: ketik `https://jakpat.net/s/ks8oh` di kolom Jakpat ID → otomatis
      jadi `ks8oh`
- [ ] Ketik isian yang jelas salah (mis. `indah`) → muncul peringatan lunak, **tapi
      submit tetap bisa ditekan**. Ini disengaja: pola formatnya masih diturunkan dari
      sampel yang bias, jadi menolak ID yang sah lebih merugikan daripada menyaring diam
- [ ] Iklan yang baru dijadwalkan menampilkan jam tayang **15.00 WIB**

---

## 8. Phase 1 sekarang AKTIF — pastikan ia bekerja, bukan diam

> Bagian ini dulunya berbunyi kebalikannya ("yang HARUS tetap diam"), ditulis
> waktu `sql/40` masih ditahan. Sekarang migrasinya sudah diterapkan dan
> triggernya hidup di DB — **tidak bergantung pada deploy frontend**, jadi ia
> sudah aktif bahkan sebelum checklist ini dijalankan.

- [ ] Tandai satu order lunas → halaman iklan **terbit otomatis** dengan banner
      default (inilah perilaku yang diharapkan sekarang)
- [ ] Halaman yang terbit otomatis itu punya slug wajar dan tidak menabrak slug lain
- [ ] Halaman iklan yang **sudah** punya banner sendiri tetap tampil normal di
      `/api/surveys` (`toPublicBannerUrl` menyentuh semua banner, jadi pantas dicek)
- [ ] Order `rejected`/`spam`, atau yang `survey_url`/tanggal/judulnya kosong,
      **tidak** menerbitkan halaman — prasyarat itu ada di `ensure_survey_page`

---

## 9. Kalau harus mundur

Frontend dan DB dipisah, dan itu memudahkan:

- **Frontend** — deploy ulang dari `9ea82ef`. Aman kapan saja.
- **DB** — `sql/36`–`sql/41` **jangan** di-rollback. Isinya korektif atau aditif dan
  sudah berjalan di produksi sejak sebelum deploy ini; mengembalikannya justru
  menghidupkan lagi bug yang sudah tertutup. `sql/41` khususnya tidak punya satu pun
  konsumen di kode aplikasi, jadi ia diam apa pun yang terjadi di frontend.

---

## 10. Diketahui, bukan bug

**Sisa dari periode sebelum `sql/40`.** Melepas JOIN `survey_pages` di `sql/36` membuat
jadwal milik submission tanpa halaman iklan berstatus `live` walau tidak ada halaman
publik yang tayang — statusnya jadi jujur alih-alih membeku di `scheduled` selamanya.
`sql/40` menutup celah itu untuk transisi **baru**, tapi baris yang terlanjur ada tidak
disentuhnya (triggernya hanya bereaksi pada perubahan pembayaran, bukan pada baris lama).

Pantau dengan:

```sql
SELECT e.id, fs.title, e.start_date, e.end_date
FROM form_submissions_extend e
JOIN form_submissions fs ON fs.id = e.submission_id
LEFT JOIN survey_pages sp ON sp.submission_id = e.submission_id
WHERE e.submission_status = 'live' AND sp.id IS NULL;
```

Baris yang muncul di sini butuh halaman dibuat manual, atau `ensure_survey_page()`
dipanggil langsung untuk submission itu.

---

## Setelah checklist lolos

1. Catat hasilnya di [`docs/jadwal-iklan-progress.md`](../../jadwal-iklan-progress.md)
2. Lanjut Phase 2 Task 8B atau 8C — lihat file progress itu untuk urutan dan
   penghalangnya
3. Phase 1B (pemberitahuan weekend) tetap backlog dan tidak memblokir apa pun —
   kilat dikecualikan, masih pilot
