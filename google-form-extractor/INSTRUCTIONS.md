# Cara Menjalankan Google Form Info Extractor

Ada dua cara untuk menjalankan aplikasi ini:

## 1. Cara Sederhana (Client-side Only)

Metode ini menggunakan CORS proxy publik untuk mengakses Google Form. Ini adalah cara termudah untuk menjalankan aplikasi, tetapi mungkin tidak selalu berfungsi karena keterbatasan CORS proxy.

### Langkah-langkah:

1. Buka file `index.html` langsung di browser Anda
2. Masukkan URL Google Form
3. Klik tombol "Dapatkan Informasi"

## 2. Menggunakan Server Node.js (Lebih Andal)

Metode ini menggunakan server Node.js lokal untuk mengatasi masalah CORS. Ini lebih andal tetapi memerlukan instalasi Node.js.

### Prasyarat:

- Node.js dan npm terinstal di komputer Anda

### Langkah-langkah:

1. Buka terminal/command prompt
2. Navigasikan ke direktori proyek:
   ```
   cd path/to/google-form-extractor
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
6. Masukkan URL Google Form
7. Klik tombol "Dapatkan Informasi"

### Menggunakan Versi Server:

Untuk menggunakan versi server, Anda perlu mengedit file `index.html` dan mengubah referensi script dari:

```html
<script src="js/app.js"></script>
```

menjadi:

```html
<script src="js/app-with-server.js"></script>
```

## Troubleshooting

### Masalah CORS:

Jika Anda mengalami masalah CORS dengan metode client-side, coba:

1. Gunakan metode server Node.js
2. Coba CORS proxy yang berbeda (edit file `app.js` dan ubah array `corsProxies`)
3. Gunakan ekstensi browser untuk menonaktifkan CORS (hanya untuk pengembangan)

### Server Tidak Berjalan:

Jika server tidak berjalan, pastikan:

1. Node.js terinstal dengan benar
2. Semua dependensi terinstal (`npm install`)
3. Port 3000 tidak digunakan oleh aplikasi lain
