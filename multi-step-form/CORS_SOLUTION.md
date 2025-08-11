# Solusi Masalah CORS dengan Mayar API

Dokumen ini menjelaskan cara mengatasi masalah CORS (Cross-Origin Resource Sharing) saat mengintegrasikan dengan Mayar API.

## Masalah

Saat mencoba menghubungi Mayar API langsung dari browser, kita menghadapi masalah CORS karena:

1. Browser menerapkan kebijakan same-origin yang mencegah permintaan ke domain berbeda
2. Mayar API tidak menyediakan header CORS yang diperlukan (`Access-Control-Allow-Origin`)
3. Permintaan preflight OPTIONS tidak ditangani dengan benar oleh Mayar API

Ini menyebabkan error seperti:
```
Access to XMLHttpRequest at 'https://api.mayar.id/v1/ping' from origin 'https://submit.jakpatforuniv.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solusi

Kita menggunakan Cloudflare Functions sebagai proxy untuk mengatasi masalah CORS:

1. **Proxy API Requests**: Semua permintaan ke Mayar API dikirim melalui Cloudflare Function yang menambahkan header CORS yang diperlukan
2. **Penanganan Preflight Requests**: Cloudflare Function menangani permintaan OPTIONS dengan benar
3. **Error Handling yang Lebih Baik**: Proxy memberikan pesan error yang lebih jelas dan informatif

## Implementasi

### 1. Cloudflare Functions

Kita menggunakan dua Cloudflare Functions:

- `mayar-proxy.js`: Untuk membuat pembayaran dan operasi POST lainnya
- `mayar-verify.js`: Untuk memverifikasi status pembayaran (operasi GET)

Kedua fungsi ini:
- Menangani permintaan preflight OPTIONS
- Meneruskan permintaan ke Mayar API dengan header yang benar
- Menambahkan header CORS ke respons
- Menyediakan penanganan error yang lebih baik

### 2. Client-Side Code

Di sisi klien, kita:
- Mengirim permintaan ke Cloudflare Function proxy alih-alih langsung ke Mayar API
- Menambahkan retry logic untuk menangani kegagalan sementara
- Menyediakan penanganan error yang lebih baik dengan pesan yang jelas

## Debugging

Jika masih mengalami masalah:

1. Periksa log Cloudflare Function untuk melihat error yang terjadi
2. Pastikan header CORS dikonfigurasi dengan benar di Cloudflare Function
3. Periksa apakah API key Mayar valid dan tidak kedaluwarsa
4. Pastikan format permintaan sesuai dengan dokumentasi Mayar API

## Referensi

- [Dokumentasi Mayar API](https://documenter.getpostman.com/view/25084670/2s8Z6x1sr8)
- [Dokumentasi CORS MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Cloudflare Functions Documentation](https://developers.cloudflare.com/pages/platform/functions/)
