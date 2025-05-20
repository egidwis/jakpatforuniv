# Simple Google Form Info

Aplikasi web sederhana untuk mendapatkan informasi dasar dari Google Form, seperti judul, deskripsi, dan jumlah pertanyaan.

## Fitur

- Mengambil informasi dasar dari Google Form berdasarkan URL
- Menampilkan judul form, deskripsi, dan jumlah total pertanyaan
- Antarmuka web yang mudah digunakan

## Instalasi

1. Pastikan Python 3.8+ sudah terinstal di sistem Anda
2. Clone repositori ini atau download file-filenya
3. Instal dependensi yang diperlukan:

```bash
pip install -r requirements.txt
```

## Penggunaan

1. Jalankan aplikasi:

```bash
python app.py
```

2. Buka browser dan akses `http://127.0.0.1:5000/`
3. Masukkan URL Google Form yang ingin Anda analisis
4. Klik tombol "Dapatkan Informasi" untuk melihat hasilnya

## Keterbatasan

- Tidak dapat mengakses form yang memerlukan login
- Tidak dapat mengakses form yang memiliki pertanyaan upload file
- Mungkin tidak berfungsi jika Google mengubah struktur HTML/JavaScript dari Google Forms

## Teknologi yang Digunakan

- Python
- Flask
- Requests-HTML
- JavaScript

## Inspirasi

Aplikasi ini terinspirasi oleh proyek [Google Forms Filler](https://github.com/FedorAronov/google-forms-filler) oleh Fedor Aronov.
