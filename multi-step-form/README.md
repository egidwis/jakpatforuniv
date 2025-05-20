# Jakpat for Universities - Submit Survey Form

Aplikasi multi-step form untuk submit survey ke platform Jakpat.

## Teknologi yang Digunakan

- React + TypeScript
- Vite
- Tailwind CSS
- Lucide React (untuk ikon)
- Sonner (untuk toast notifications)

## Fitur

- Form multi-step dengan 3 langkah:
  1. Detail Survey (ekstraksi otomatis dari URL)
  2. Data Diri & Insentif
  3. Review & Pembayaran
- Ekstraksi otomatis informasi dari URL Google Forms
- Perhitungan biaya berdasarkan jumlah pertanyaan dan durasi
- Dukungan untuk kode voucher/referal
- Tema gelap/terang

## Pengembangan Lokal

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment ke Cloudflare Pages

Aplikasi ini dikonfigurasi untuk di-deploy ke Cloudflare Pages dengan URL `jakpatforuniv.com/submit-survey`.

### Langkah-langkah Deployment

1. **Login ke Cloudflare**

   ```bash
   npx wrangler login
   ```

2. **Deploy ke Cloudflare Pages**

   ```bash
   npx wrangler pages deploy dist --project-name=jakpatforuniv-submit-survey
   ```

3. **Konfigurasi Custom Domain**

   Setelah deployment berhasil, konfigurasi custom domain di dashboard Cloudflare Pages:

   - Buka dashboard Cloudflare
   - Pilih project "jakpatforuniv-submit-survey"
   - Buka tab "Custom domains"
   - Tambahkan domain "jakpatforuniv.com"
   - Pilih opsi "Subdomain" dan masukkan "/submit-survey" sebagai path

4. **Konfigurasi DNS**

   Pastikan DNS record untuk domain "jakpatforuniv.com" sudah dikonfigurasi dengan benar di Cloudflare:

   - CNAME record untuk "jakpatforuniv.com" yang mengarah ke domain Cloudflare Pages
   - Aktifkan Cloudflare proxy (ikon orange cloud)

## Struktur Folder

```
/src
  /components      # Komponen React
  /utils           # Utility functions
  /types.ts        # TypeScript type definitions
  /styles          # CSS styles
  main.tsx         # Entry point
  App.tsx          # Root component
```
