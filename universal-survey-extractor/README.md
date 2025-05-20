# Universal Survey Extractor

Aplikasi web untuk mengekstrak informasi dari berbagai platform survei online, termasuk Google Forms, SurveyMonkey, Typeform, Microsoft Forms, dan JotForm.

## Fitur

- Deteksi otomatis platform survei berdasarkan URL
- Ekstraksi judul, deskripsi, dan jumlah pertanyaan
- Informasi tambahan spesifik untuk setiap platform
- Antarmuka pengguna yang responsif dan mudah digunakan
- Dukungan untuk berbagai platform survei populer

## Platform yang Didukung

Aplikasi ini dioptimalkan untuk Google Forms, tetapi juga dapat mendeteksi informasi dasar dari platform lain:

- **Google Forms** (Dukungan Penuh): Ekstraksi lengkap dengan informasi tambahan seperti ID form, jenis (kuis/formulir), dll.
- **Platform Lain** (Dukungan Dasar): Aplikasi dapat mendeteksi judul, deskripsi, dan jumlah pertanyaan dari platform berikut:
  - SurveyMonkey
  - Typeform
  - Microsoft Forms
  - JotForm
  - OpinionX

Untuk platform selain Google Forms, aplikasi akan menampilkan informasi dasar (judul, deskripsi, jumlah pertanyaan) dengan tampilan yang disederhanakan.

## Cara Penggunaan

### Metode 1: Client-side Only (Menggunakan CORS Proxy)

1. Buka file `index.html` di browser Anda
2. Masukkan URL survei yang ingin Anda analisis
3. Klik tombol "Dapatkan Informasi"
4. Lihat hasil yang ditampilkan

### Metode 2: Menggunakan Server Node.js (Lebih Andal)

1. Pastikan Node.js dan npm terinstal di komputer Anda
2. Buka terminal/command prompt
3. Navigasikan ke direktori proyek
4. Instal dependensi:
   ```
   npm install
   ```
5. Jalankan server:
   ```
   npm start
   ```
6. Buka browser dan akses `http://localhost:3000`
7. Masukkan URL survei
8. Klik tombol "Dapatkan Informasi"

## Cara Kerja

Aplikasi ini bekerja dengan cara:

1. **Deteksi Platform**: Mendeteksi platform survei berdasarkan URL
2. **Ekstraksi Data**: Menggunakan teknik ekstraksi yang sesuai untuk platform tersebut:
   - Mengekstrak data dari JavaScript yang tertanam di halaman
   - Mengurai struktur HTML untuk menemukan informasi yang relevan
   - Menggunakan regex untuk mengekstrak data dari berbagai format
3. **Penanganan CORS**: Menggunakan CORS proxy atau server Node.js untuk mengatasi masalah CORS
4. **Tampilan Hasil**: Menampilkan informasi yang diekstrak dalam format yang mudah dibaca

## Keterbatasan

- Bergantung pada struktur HTML/JavaScript dari platform survei, yang dapat berubah
- Beberapa platform memiliki perlindungan anti-scraping yang dapat mengganggu ekstraksi
- Tidak dapat mengakses survei yang memerlukan login (kecuali dengan kredensial)
- Akurasi ekstraksi dapat bervariasi tergantung pada platform dan struktur survei

## Pengembangan Lanjutan

Beberapa ide untuk pengembangan lanjutan:

- Menambahkan dukungan untuk lebih banyak platform survei
- Mengimplementasikan ekstraksi detail pertanyaan
- Menambahkan fitur untuk menyimpan hasil ekstraksi
- Membuat ekstensi browser untuk ekstraksi dengan satu klik
- Mengimplementasikan autentikasi untuk mengakses survei yang memerlukan login

## Lisensi

MIT License
