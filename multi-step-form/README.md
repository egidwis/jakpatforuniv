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
- Dukungan shortlink Google Forms (forms.gle, goo.gl, g.co)
- Perhitungan biaya berdasarkan jumlah pertanyaan dan durasi
- Dukungan untuk kode voucher/referal
- Integrasi pembayaran dengan Mayar
- Penyimpanan data di Supabase
- Webhook untuk notifikasi pembayaran
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
/functions         # Cloudflare Pages Functions
/netlify/functions # Netlify Functions (termasuk webhook handler)
/public            # File statis dan halaman pengujian
```

## Integrasi Pembayaran dengan Mayar

Aplikasi ini terintegrasi dengan [Mayar](https://mayar.id/) sebagai payment gateway. Integrasi ini memungkinkan pengguna untuk melakukan pembayaran untuk survey mereka.

### Konfigurasi Mayar

1. **API Key**: Didapatkan dari dashboard Mayar dan dikonfigurasi di `.env.local` dan environment variables Cloudflare Pages:
   ```
   VITE_MAYAR_API_KEY=your-mayar-api-key
   ```

2. **Webhook Token**: Digunakan untuk memverifikasi notifikasi webhook dari Mayar:
   ```
   VITE_MAYAR_WEBHOOK_TOKEN=your-webhook-token
   ```

### Webhook Mayar

Aplikasi ini menggunakan webhook untuk menerima notifikasi pembayaran dari Mayar. Webhook handler berada di `netlify/functions/webhook.js`.

#### Cara Kerja Webhook:

1. Mayar mengirim notifikasi ke endpoint webhook ketika status pembayaran berubah
2. Webhook handler memverifikasi signature menggunakan webhook token
3. Jika valid, webhook handler memperbarui status pembayaran di database Supabase
4. Aplikasi menampilkan status pembayaran yang diperbarui kepada pengguna

#### Pengujian Webhook:

Untuk menguji webhook, gunakan halaman pengujian yang tersedia di:
- `/webhook-status.html` - Untuk memeriksa status konfigurasi webhook
- `/test-webhook.html` - Untuk mengirim payload webhook simulasi

## Integrasi Database dengan Supabase

Aplikasi ini menggunakan [Supabase](https://supabase.com/) sebagai backend database. Data form submission dan transaksi pembayaran disimpan di Supabase.

### Tabel Database:

1. **form_submissions** - Menyimpan data form yang disubmit
2. **transactions** - Menyimpan data transaksi pembayaran

### Konfigurasi Supabase:

Konfigurasi Supabase tersedia di `.env.local` dan environment variables Cloudflare Pages:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Fitur Shortlink Google Forms

Aplikasi ini mendukung deteksi dan ekspansi shortlink Google Forms secara otomatis. Fitur ini memungkinkan pengguna untuk memasukkan shortlink dan aplikasi akan mengekspansi ke URL lengkap.

### Domain Shortlink yang Didukung:
- `forms.gle` - Shortlink resmi Google Forms
- `goo.gl` - Shortlink umum Google (yang mengarah ke forms)
- `g.co` - Shortlink Google lainnya

### Cara Kerja:
1. User memasukkan shortlink (contoh: `forms.gle/abc123`)
2. Aplikasi mendeteksi bahwa ini adalah shortlink
3. Aplikasi mengekspansi shortlink ke URL lengkap
4. Menampilkan preview URL lengkap kepada user
5. Menggunakan URL lengkap untuk proses ekstraksi form

### Contoh Penggunaan:
```
Input: forms.gle/abc123
Output: https://docs.google.com/forms/d/e/1FAIpQLSe.../viewform
```

Fitur ini memberikan kemudahan bagi pengguna yang hanya memiliki shortlink dari Google Forms, tanpa perlu mencari URL lengkap terlebih dahulu.
