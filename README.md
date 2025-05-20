# Jakpat for Universities

Repository untuk aplikasi Jakpat for Universities.

## Struktur Folder

- `multi-step-form`: Aplikasi multi-step form untuk submit survey ke platform Jakpat
- `survey-extractor-vite`: Aplikasi untuk mengekstrak informasi dari URL survey

## Aplikasi

### Multi-Step Form

Aplikasi multi-step form untuk submit survey ke platform Jakpat. Aplikasi ini akan di-deploy ke URL `jakpatforuniv.com/submit-survey`.

Untuk menjalankan aplikasi:

```bash
cd multi-step-form
npm install
npm run dev
```

Untuk build aplikasi:

```bash
cd multi-step-form
npm run build
```

Untuk men-deploy aplikasi ke Cloudflare Pages:

```bash
cd multi-step-form
npx wrangler login
npx wrangler pages deploy dist --project-name=jakpatforuniv-submit-survey
```

Atau dari root project:

```bash
npm run deploy
```

### Survey Extractor

Aplikasi untuk mengekstrak informasi dari URL survey. Aplikasi ini masih dalam tahap pengembangan.

## Deployment

Lihat file `multi-step-form/DEPLOYMENT.md` untuk panduan lengkap deployment ke Cloudflare Pages.
