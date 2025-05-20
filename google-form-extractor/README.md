# Google Form Info Extractor

Aplikasi web sederhana berbasis JavaScript untuk mengekstrak informasi dasar dari Google Form, seperti judul, deskripsi, dan jumlah pertanyaan.

## Fitur

- Mengambil informasi dasar dari Google Form berdasarkan URL
- Menampilkan judul form, deskripsi, dan jumlah total pertanyaan
- Antarmuka web yang responsif dan mudah digunakan
- Tidak memerlukan server backend (client-side only)

## Cara Penggunaan

1. Buka file `index.html` di browser Anda
2. Masukkan URL Google Form yang ingin Anda analisis
3. Klik tombol "Dapatkan Informasi" untuk melihat hasilnya

## Teknologi yang Digunakan

- HTML5
- CSS3
- JavaScript (ES6+)
- Axios untuk HTTP requests

## Cara Kerja

Aplikasi ini bekerja dengan cara:

1. Mengambil HTML dari Google Form menggunakan CORS proxy
2. Mengekstrak data form dari JavaScript yang tertanam di halaman
3. Mengurai data untuk mendapatkan judul, deskripsi, dan menghitung jumlah pertanyaan
4. Menampilkan hasil kepada pengguna

## Keterbatasan

- Bergantung pada CORS proxy untuk mengakses Google Form
- Tidak dapat mengakses form yang memerlukan login
- Tidak dapat mengakses form yang memiliki pertanyaan upload file
- Mungkin tidak berfungsi jika Google mengubah struktur HTML/JavaScript dari Google Forms

## Pengembangan Lanjutan

Beberapa ide untuk pengembangan lanjutan:

- Menambahkan kemampuan untuk mengekstrak detail pertanyaan
- Membuat versi serverless dengan Netlify Functions atau AWS Lambda
- Menambahkan fitur untuk menyimpan hasil ekstraksi
- Membuat ekstensi browser untuk mengekstrak informasi form dengan satu klik

## Lisensi

MIT License
