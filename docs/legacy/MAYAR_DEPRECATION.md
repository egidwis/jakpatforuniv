# Deprecation Mayar → DOKU

Dokumen ini mencatat penghapusan integrasi pembayaran **Mayar** dari codebase.
Gateway pembayaran aktif saat ini adalah **DOKU**.

## Ringkasan

- **Gateway lama:** Mayar (+ sempat menyebut Midtrans di teks legal)
- **Gateway aktif:** DOKU — kode di `multi-step-form/functions/api/doku/` dan `multi-step-form/src/utils/payment.ts`
- **Status:** Mayar tidak lagi dipakai untuk transaksi baru. Sisa referensi sudah dihapus / diarsipkan / ditandai legacy.

## Apa yang dihapus

Dead code Mayar di **project root** (root hanya dideploy sebagai situs statis homepage + halaman legal; React `src/`-nya tidak di-build, file-file ini tidak di-import / tidak dipanggil):

- `functions/api/mayar-proxy.js`
- `functions/api/mayar-verify.js`
- `functions/api/simple-mayar-proxy.js`
- `functions/api/webhook.js`
- `functions/api/webhook-status.js`
- `functions/api/webhook-test.js`
- `functions/webhook.js`
- `src/utils/payment.ts`
- `src/utils/simple-payment.ts`

## Apa yang DIPERTAHANKAN (sengaja)

- **`multi-step-form/src/components/TransactionsPage.tsx`** — handler `method === 'mayar'`
  dan `'mayar_manual_invoice'` tetap ada agar **transaksi historis** yang dibuat lewat
  Mayar tetap tampil di dashboard. Sekarang ditandai badge **"Mayar (legacy)"** (read-only).
  **Tidak ada transaksi Mayar baru** yang dibuat.

## Dokumen legal

Halaman privacy policy & terms (root **dan** `multi-step-form/public/homepage/`) sebelumnya
menyebut `(Mayar/Midtrans)`. Penyebutan nama processor dihapus dan diganti dengan bahasa
umum: *"gateway pembayaran pihak ketiga"*. Jika nanti tim legal ingin menyebut DOKU secara
eksplisit, edit kembali keempat file tersebut.

## Diarsipkan ke `docs/legacy/`

Dokumen & test harness Mayar dipindahkan ke folder ini (tidak lagi disajikan publik):

- `PAYMENT_SETUP.md` (dulu di root)
- `CORS_SOLUTION.md` (dulu di `multi-step-form/`)
- `memoryupdate.md` (dulu di `multi-step-form/`)
- `test-api.html`, `test-webhook.html`, `webhook-status.html` (dulu di `multi-step-form/public/`)

## Catatan operasional

- Folder root `functions/` ikut auto-deploy sebagai Cloudflare Pages Functions. Setelah
  penghapusan ini, endpoint `/api/mayar-proxy` dll. tidak ada lagi — pastikan tidak ada
  webhook eksternal Mayar yang masih menunjuk ke domain root (seharusnya tidak, karena
  akun Mayar sudah tidak dipakai).
- `multi-step-form/README.md` masih memuat beberapa penyebutan Mayar historis. Dibiarkan
  apa adanya; bisa dirapikan terpisah bila perlu.
