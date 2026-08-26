// ─────────────────────────────────────────────────────────────
// Rute publik halaman iklan — SATU tempat.
//
// ⚠️ BENTUKNYA `/pages/{slug}`, BUKAN `/p/{slug}`.
//
// `/p/...` tidak pernah ada rutenya di repo ini — `git log -S'/p/:slug' --all`
// mengembalikan nol. Bentuk itu lahir di `84d5401` (revamp visual) sebagai URL
// yang terlihat lebih ringkas, lalu menetap di dua permukaan admin yang justru
// tugasnya MENYERAHKAN tautan itu ke manusia, keduanya lengkap dengan tombol
// "Salin Link". Yang diterima orang di ujung sana:
//
//   submit.jakpatforuniv.com/p/…  → SPA jatuh ke `*`, <Routes> bersarang tidak
//                                   cocok apa pun → halaman kosong + footer
//   jakpatforuniv.com/p/…         → functions/_middleware.js cabang `else`
//                                   → homepage marketing
//
// Rute yang hidup ada di App.tsx (`/pages/:slug` → SurveyPage). Kalau rute itu
// berubah, ia berubah DI SINI juga — dan `page-url.spec.ts` mengadu keduanya
// supaya tidak bisa berpisah diam-diam.
// ─────────────────────────────────────────────────────────────

/** Path relatif halaman publik. Dipakai untuk <a href> dan teks yang dipajang. */
export const publicPagePath = (slug: string): string => `/pages/${slug}`;

/** URL absolut halaman publik. Dipakai untuk "Salin Link" dan window.open. */
export const publicPageUrl = (slug: string): string =>
  `${window.location.origin}${publicPagePath(slug)}`;
