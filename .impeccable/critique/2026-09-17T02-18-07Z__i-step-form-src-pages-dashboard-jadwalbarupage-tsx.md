---
target: Reservasi Jadwal — 2 layar (StepSchedule + JadwalBaruPage)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-17T02-18-07Z
slug: i-step-form-src-pages-dashboard-jadwalbarupage-tsx
---
Method: dual-agent (A: design review · B: detector + build evidence)

# Kritik Desain — Reservasi Jadwal (2 layar)

## Design Health Score

| # | Heuristik | Skor | Masalah utama |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Skeleton vs spinner benar; tombol mati di layar 1 diam total |
| 2 | Match System / Real World | 2 | "4/4" kosakata operator, tanpa legenda |
| 3 | User Control and Freedom | 2 | Posisi tombol kembali berpindah; `replace: true` menghapus riwayat |
| 4 | Consistency and Standards | 1 | 15 divergensi struktural untuk satu tugas |
| 5 | Error Prevention | 3 | Gerbang saat-ditekan kuat; pesan penuh salah angka (3 vs 4) |
| 6 | Recognition Rather Than Recall | 2 | Layar 1 tanpa durasi & harga saat mengunci |
| 7 | Flexibility and Efficiency | 2 | Horizon 14 hari terkunci tanpa penjelasan |
| 8 | Aesthetic and Minimalist | 2 | Kartu-dalam-kartu layar 1; 6 panel bertumpuk layar 2 |
| 9 | Error Recovery | 3 | Satu kunci per sebab; `e.message` mentah sampai ke peneliti |
| 10 | Help and Documentation | 1 | Tanggal nonaktif tidak pernah menyebut alasannya |
| **Total** | | **21/40** | Perlu perbaikan struktural |

## Verdict kekhususan desain
Komponen diautor sungguh-sungguh; alur tidak pernah diautor — ia dirakit. Dua layar untuk satu
tugas dibangun di atas dua sasis berbeda (15 divergensi). Akar: KEPEMILIKAN, bukan gaya — judul
dirender MultiStepForm, tombol kembali dirender StepSchedule, jadi anak tak bisa menempatkan diri
di atas header induk. Invarian dinyatakan di komentar, bukan ditegakkan komponen bersama.

## Bukti deterministik — jebakan styles.css (kambuh ke-6), terverifikasi byte-level di dist/
- Tabrakan 1: `.grid{gap:1.5rem}` @252203 mengalahkan `gap-2.5` @50410 → grid tanggal 24px, bukan 10px.
- Tabrakan 2: `.grid-cols-1{1fr}` @252233 mengalahkan `.sm:grid-cols-2` @171581 → panel hadiah
  tetap 1 kolom di SEMUA lebar. Perbaikan sudah ada 3× di AnalyticsDashboard.tsx, tak diterapkan.
- Kolom kalender (grid-cols-2/sm:4/md:7) AMAN — hanya gap yang kalah.

## Yang bekerja
1. AiringSummary memakai helper yang sama dengan penulis end_date → layar & baris tak bisa berselisih.
2. Skeleton vs spinner mencegah keputusan di atas "0/4" karangan.
3. newSchedulePlan membuat tombol mati bersuara & menolak menebak batch — pola ini ADA, layar 1 tak memakainya.

## Masalah prioritas
- [P1] Layar 1 minta komitmen finansial tanpa harga. Komentar di JadwalBaruPage ("tanpa pernah
  melihat satu angka pun") masih harfiah benar untuk layar 1. Fix diterapkan ke pengguna berulang,
  ditahan dari pengguna pertama kali.
- [P1] Dua layar tak terhubungkan: 15 divergensi. Fix: satu ScheduleReservationLayout.
- [P1] Jebakan CSS legacy — dua tabrakan hidup (di atas).
- [P2] CTA tidak terbaca sebagai membuat tagihan berjangka 60 menit; peringatan ber-text-xs gray-500.
- [P2] "4/4" tanpa legenda; titik 4px amber vs emerald luminansi 1.18:1; tile penuh tanpa label
  sama sekali. slotErrorFull bilang "maksimal 3" padahal MAX_REGULAR_ADS_PER_DAY = 4.
- [P2] Total Rp 1.110 di samping Rp 1.500.000 terbaca seperti bug; disusul "tagihan resmi
  diterbitkan tim kami" tepat sebelum tombol uang.

## Red flag persona (peneliti akademik, pertama kali, ponsel)
- Stepper -/+ 28×28px berjarak 6px (min 44px)
- focus:outline-none tanpa pengganti di input durasi → WCAG 2.4.7 gagal
- Kontras tile nonaktif 1.81–1.87:1 (opacity-* di <button> meredupkan teks DAN latar)
- Seluruh label rincian biaya hardcoded Indonesia di scheduleMoney.ts; satu note bocorkan "sql/34"
- Tanggal hardcoded 'id-ID' (3×) → pengguna Inggris lihat "Sen", "Kam", "Agu"
- e.message mentah ke toast; satu muncul SETELAH jadwal terlanjur dibuat

## Positif palsu detektor
gray-on-color di OrderFormHeader:92 — memasangkan warna diam dengan latar hover yang tak pernah
berbarengan. Kedua keadaan nyata lolos AA (6.92:1 dan 5.72:1). Kedua agen sepakat: abaikan.

## Pertanyaan yang mengganggu
1. Kenapa pengguna pertama kali dapat lebih sedikit daripada pengguna berulang?
2. Kalau "4/4" butuh legenda, kenapa ia ada di tile? Apa yang berubah antara 2/4 dan 0/4?
3. Apakah isEstimate pantas di layar dengan tombol komit?
4. Apakah horizon 14 hari aturan bisnis atau artefak implementasi?
