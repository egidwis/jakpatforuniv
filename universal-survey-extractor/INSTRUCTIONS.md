# Cara Menggunakan Universal Survey Extractor

Ada dua cara untuk menjalankan aplikasi ini:

## 1. Cara Sederhana (Client-side Only)

Metode ini menggunakan CORS proxy publik untuk mengakses survei. Ini adalah cara termudah untuk menjalankan aplikasi, tetapi mungkin tidak selalu berfungsi karena keterbatasan CORS proxy.

### Langkah-langkah:

1. Buka file `index.html` langsung di browser Anda
2. Masukkan URL survei dari salah satu platform yang didukung:
   - Google Forms: `https://docs.google.com/forms/d/e/...`
   - SurveyMonkey: `https://www.surveymonkey.com/r/...`
   - Typeform: `https://yourname.typeform.com/to/...`
   - Microsoft Forms: `https://forms.office.com/r/...`
   - JotForm: `https://form.jotform.com/...`
3. Klik tombol "Dapatkan Informasi"

## 2. Menggunakan Server Node.js (Lebih Andal)

Metode ini menggunakan server Node.js lokal untuk mengatasi masalah CORS. Ini lebih andal tetapi memerlukan instalasi Node.js.

### Prasyarat:

- Node.js dan npm terinstal di komputer Anda

### Langkah-langkah:

1. Buka terminal/command prompt
2. Navigasikan ke direktori proyek:
   ```
   cd path/to/universal-survey-extractor
   ```
3. Instal dependensi:
   ```
   npm install
   ```
4. Jalankan server:
   ```
   npm start
   ```
5. Buka browser dan akses `http://localhost:3000`
6. Masukkan URL survei
7. Klik tombol "Dapatkan Informasi"

## Contoh URL untuk Pengujian

Berikut adalah beberapa contoh URL yang dapat Anda gunakan untuk menguji aplikasi:

### Google Forms
- https://docs.google.com/forms/d/e/1FAIpQLSdmm-1O8OIqazF0fY2NvXGV9NhpYUTfFiXUV1X7XcQyOPPDRA/viewform

### SurveyMonkey
- https://www.surveymonkey.com/r/NPQSKQN

### Typeform
- https://form.typeform.com/to/moe6aa

### Microsoft Forms
- https://forms.office.com/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAN__jZdNJhUOEY0UlVWVDROSk82VFU1WVlVOTFCWFRUMi4u

### JotForm
- https://form.jotform.com/201834340440041

### OpinionX
- https://www.opinionx.co/s/example-survey
- https://opnx.to/example-survey

## Troubleshooting

### Masalah CORS:

Jika Anda mengalami masalah CORS dengan metode client-side, coba:

1. Gunakan metode server Node.js
2. Coba CORS proxy yang berbeda (edit file extractor untuk platform yang relevan)
3. Gunakan ekstensi browser untuk menonaktifkan CORS (hanya untuk pengembangan)

### Server Tidak Berjalan:

Jika server tidak berjalan, pastikan:

1. Node.js terinstal dengan benar
2. Semua dependensi terinstal (`npm install`)
3. Port 3000 tidak digunakan oleh aplikasi lain

### Platform Tidak Didukung:

Jika Anda mencoba URL dari platform yang tidak didukung, Anda akan melihat pesan error. Saat ini, aplikasi hanya mendukung platform yang tercantum di atas.

### Ekstraksi Gagal:

Jika ekstraksi gagal untuk URL yang valid, kemungkinan penyebabnya adalah:

1. Platform telah mengubah struktur HTML/JavaScript mereka
2. Survei memerlukan login
3. Survei memiliki perlindungan anti-scraping
4. CORS proxy yang digunakan sedang down atau dibatasi

Dalam kasus ini, coba gunakan metode server Node.js atau tunggu beberapa saat sebelum mencoba lagi.
