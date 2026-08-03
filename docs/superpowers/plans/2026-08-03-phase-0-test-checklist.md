# Checklist Uji Mandiri — Phase 0 Jadwal Iklan

Untuk dijalankan **setelah deploy frontend**, sebelum menerapkan `sql/40`.

**Keadaan saat checklist ini dibuat (2026-08-03):**

| | Status |
|---|---|
| `sql/36`–`sql/39` | ✅ sudah diterapkan ke produksi |
| Frontend (6 commit di `main`) | ⬜ menunggu deploy Anda |
| `sql/40` (auto-publish) | ⬜ **belum** — jangan diterapkan sebelum checklist ini lolos |

Fitur Phase 1 (auto-publish + banner default) ikut terbawa dalam deploy ini tapi
**tidak aktif** tanpa `sql/40`. Itu disengaja: kodenya inert, dan menahannya di branch
terpisah justru menambah kerja merge tanpa manfaat. Bagian §8 memastikan ia benar-benar
diam.

Prioritas: **§2, §3, §5 wajib.** Sisanya kalau sempat.

---

## 1. Sebelum push

- [ ] `git log --oneline -7` di `main` menampilkan 6 commit Jadwal Iklan di atas `e9aac7a`
- [ ] Sadari `main` lokal membawa **satu commit lama yang belum di-push** (`e9aac7a`,
      perbaikan judul Google Picker) — ia ikut terkirim
- [ ] Catat commit produksi saat ini untuk jalan mundur:
      `git log --oneline -1 origin/main` → `9ea82ef`

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

## 8. Yang HARUS tetap diam (Phase 1 belum aktif)

- [ ] Tandai satu order lunas → **tidak ada** halaman iklan yang terbit otomatis
      (`sql/40` belum diterapkan; kalau ada yang terbit, berarti migrasi tak sengaja
      sudah dijalankan — hentikan dan laporkan)
- [ ] Tidak ada halaman yang tiba-tiba memakai banner default
- [ ] Halaman iklan yang **sudah** punya banner tetap tampil normal di `/api/surveys`
      (`toPublicBannerUrl` menyentuh semua banner, jadi ini pantas dicek)

---

## 9. Kalau harus mundur

Frontend dan DB dipisah, dan itu memudahkan:

- **Frontend** — deploy ulang dari `9ea82ef`. Aman kapan saja.
- **DB** — `sql/36`–`sql/39` **jangan** di-rollback. Isinya korektif dan sudah berjalan
  di produksi sejak sebelum deploy ini; mengembalikannya justru menghidupkan lagi bug
  yang sudah tertutup.

---

## 10. Diketahui, bukan bug

Sampai `sql/40` diterapkan, jadwal milik submission yang **belum punya halaman iklan**
akan berstatus `live` padahal tidak ada halaman publik yang tayang. Ini konsekuensi sadar
dari melepas JOIN `survey_pages` di `sql/36` — statusnya jadi jujur alih-alih membeku di
`scheduled` selamanya, dan Phase 1 menutupnya sepenuhnya.

Pantau dengan:

```sql
SELECT e.id, fs.title, e.start_date, e.end_date
FROM form_submissions_extend e
JOIN form_submissions fs ON fs.id = e.submission_id
LEFT JOIN survey_pages sp ON sp.submission_id = e.submission_id
WHERE e.submission_status = 'live' AND sp.id IS NULL;
```

Baris yang muncul di sini butuh halaman dibuat manual — atau `sql/40` diterapkan.

---

## Setelah checklist lolos

1. Terapkan `sql/40` (jalankan pre-check A dan B di dalam file itu lebih dulu)
2. Uji auto-publish sesuai bagian "Phase 1" di rencana utama
3. Baru kerjakan Phase 1B (weekend) — kilat dikecualikan, masih pilot
