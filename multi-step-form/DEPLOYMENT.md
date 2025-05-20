# Panduan Deployment ke Cloudflare Pages

Dokumen ini berisi panduan lengkap untuk men-deploy aplikasi multi-step form ke Cloudflare Pages dengan URL `jakpatforuniv.com/submit-survey`.

## Prasyarat

1. Akun Cloudflare
2. Domain `jakpatforuniv.com` sudah terdaftar dan dikelola di Cloudflare
3. Node.js dan npm terinstal di komputer lokal
4. Wrangler CLI (CLI Cloudflare)

## Langkah 1: Persiapan Aplikasi

Aplikasi sudah dikonfigurasi dengan base path `/submit-survey/` di file `vite.config.ts`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/submit-survey/',
})
```

## Langkah 2: Build Aplikasi

Build aplikasi untuk produksi:

```bash
npm run build
```

Ini akan menghasilkan folder `dist` yang berisi aplikasi yang sudah di-build.

## Langkah 3: Install Wrangler CLI

```bash
npm install -g wrangler
```

## Langkah 4: Login ke Cloudflare

```bash
wrangler login
```

Ini akan membuka browser dan meminta Anda untuk login ke akun Cloudflare.

## Langkah 5: Deploy ke Cloudflare Pages

```bash
wrangler pages deploy dist --project-name=jakpatforuniv-submit-survey
```

Jika ini adalah deployment pertama, Wrangler akan membuat project baru dengan nama `jakpatforuniv-submit-survey`. Jika project sudah ada, Wrangler akan men-deploy versi baru.

## Langkah 6: Konfigurasi Custom Domain

Setelah deployment berhasil, konfigurasi custom domain di dashboard Cloudflare Pages:

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Pilih "Pages" dari menu sidebar
3. Pilih project "jakpatforuniv-submit-survey"
4. Buka tab "Custom domains"
5. Klik "Set up a custom domain"
6. Masukkan domain "jakpatforuniv.com"
7. Pilih opsi "Subdomain" dan masukkan "/submit-survey" sebagai path
8. Klik "Continue" dan ikuti instruksi selanjutnya

## Langkah 7: Konfigurasi DNS

Pastikan DNS record untuk domain "jakpatforuniv.com" sudah dikonfigurasi dengan benar di Cloudflare:

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Pilih domain "jakpatforuniv.com"
3. Buka tab "DNS"
4. Pastikan ada CNAME record untuk "jakpatforuniv.com" yang mengarah ke domain Cloudflare Pages
5. Pastikan Cloudflare proxy (ikon orange cloud) aktif

## Langkah 8: Verifikasi Deployment

Setelah semua langkah di atas selesai, buka browser dan akses `jakpatforuniv.com/submit-survey` untuk memastikan aplikasi berjalan dengan benar.

## Troubleshooting

### Masalah: Aplikasi tidak muncul di URL yang diharapkan

1. Pastikan base path di `vite.config.ts` sudah benar (`/submit-survey/`)
2. Pastikan file `_redirects` di folder `public` sudah benar:
   ```
   /submit-survey/* /submit-survey/index.html 200
   ```
3. Pastikan custom domain sudah dikonfigurasi dengan benar di Cloudflare Pages
4. Pastikan DNS record sudah benar dan Cloudflare proxy aktif

### Masalah: Asset (CSS, JS) tidak dimuat

1. Pastikan semua path asset di HTML menggunakan base path yang benar
2. Periksa Console di Developer Tools untuk melihat error

### Masalah: Routing tidak berfungsi

1. Pastikan router (jika ada) dikonfigurasi dengan benar untuk base path
2. Pastikan file `_redirects` sudah benar

## Pemeliharaan

Untuk men-deploy versi baru aplikasi:

1. Buat perubahan pada kode
2. Build aplikasi: `npm run build`
3. Deploy ke Cloudflare Pages: `wrangler pages deploy dist --project-name=jakpatforuniv-submit-survey`
