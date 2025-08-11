# Panduan Integrasi Pembayaran Mayar

Dokumen ini berisi panduan untuk mengintegrasikan dan mengatasi masalah dengan Mayar Payment Gateway.

## Konfigurasi Environment Variables

Pastikan environment variables berikut telah dikonfigurasi dengan benar:

1. **VITE_MAYAR_API_KEY**: API key dari dashboard Mayar
2. **VITE_MAYAR_WEBHOOK_TOKEN**: Token webhook untuk verifikasi notifikasi pembayaran
3. **VITE_SUPABASE_URL**: URL Supabase untuk database
4. **VITE_SUPABASE_ANON_KEY**: Anon key Supabase untuk akses database

### Cara Mengatur Environment Variables di Cloudflare Pages

1. Buka dashboard Cloudflare Pages
2. Pilih project "jakpatforuniv-submit"
3. Klik tab "Settings" > "Environment variables"
4. Tambahkan semua environment variables yang diperlukan
5. Pastikan untuk mengatur variabel untuk environment "Production" dan "Preview"
6. Klik "Save" untuk menyimpan perubahan

## Mengatasi Masalah CORS

Aplikasi menggunakan Cloudflare Functions sebagai proxy untuk mengatasi masalah CORS saat berkomunikasi dengan API Mayar. Berikut adalah beberapa tips jika mengalami masalah CORS:

1. Pastikan Cloudflare Functions (`functions/api/mayar-proxy.js` dan `functions/api/mayar-verify.js`) telah dikonfigurasi dengan benar
2. Pastikan header CORS telah dikonfigurasi dengan benar di Cloudflare Functions
3. Pastikan environment variables dapat diakses oleh Cloudflare Functions

## Mengatasi Masalah Pembayaran Stuck

Jika tombol "Lanjut Bayar" tidak mengarahkan ke halaman pembayaran Mayar:

1. Periksa console browser untuk melihat error yang muncul
2. Pastikan API key Mayar valid dan tidak kedaluwarsa
3. Pastikan format request ke API Mayar sudah benar
4. Periksa apakah proxy Cloudflare Function berfungsi dengan baik
5. Coba gunakan mode simulasi untuk testing dengan mengubah `isSimulationMode()` di `src/utils/payment.ts`

## Format Request Mayar

Format request yang benar untuk API Mayar adalah:

```javascript
{
  name: "Nama Pelanggan",
  email: "email@example.com",
  amount: 100000, // dalam Rupiah
  mobile: "081234567890",
  redirectUrl: "https://your-site.com/success",
  failureUrl: "https://your-site.com/failure",
  description: "Deskripsi Pembayaran",
  expiredAt: "2023-12-31T23:59:59Z", // ISO 8601 format
  webhookUrl: "https://your-site.com/webhook"
}
```

## Debugging

Untuk debugging masalah pembayaran:

1. Periksa log di Cloudflare Pages > Functions
2. Periksa console browser untuk error
3. Gunakan Network tab di DevTools untuk melihat request dan response
4. Pastikan format request dan response sesuai dengan dokumentasi Mayar

## Dokumentasi Mayar

Untuk informasi lebih lanjut, lihat dokumentasi resmi Mayar:
- [Dokumentasi API Mayar](https://documenter.getpostman.com/view/25084670/2s8Z6x1sr8)
- [GitHub Mayar](https://github.com/mayarid/mayar-nim)
