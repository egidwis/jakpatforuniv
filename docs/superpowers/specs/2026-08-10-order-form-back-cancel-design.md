# Back per-step + Cancel order — design spec

**Status:** Approved, belum diimplementasikan
**Date:** 2026-08-10

## Konteks & masalah

User (admin) melaporkan merasa "stuck" saat mengisi form order (`MultiStepForm`,
`multi-step-form/src/components/MultiStepForm.tsx`). Satu-satunya jalan mundur saat
ini adalah ikon panah (`ArrowLeft`) di bar floating bawah layar (`UnifiedHeader.tsx`),
yang perilakunya berubah-ubah tergantung step (kembali ke step sebelumnya, ATAU
sub-navigasi di dalam step 1, ATAU undo upgrade Kilat) — dan tidak ada jalan untuk
membatalkan order sepenuhnya dan mulai dari form kosong.

Dua perubahan diminta:
1. Tambah tombol **Back** kontekstual di sebelah tombol "Lanjutkan" tiap step.
2. Ubah ikon panah di bar floating (`UnifiedHeader`) menjadi **Cancel** (ikon `X`)
   yang membatalkan order & kembali ke halaman utama, dengan dialog konfirmasi
   (destruktif, tidak bisa di-undo).

## Struktur step yang relevan (sudah ada, tidak berubah)

`MultiStepForm.tsx` mengelola 4 step (`currentStep` 1–4), urutan sejak reorder
2026-08-10: **1 Survei → 2 Ringkasan → 3 Jadwal → 4 Kilat** (step 4 adalah cabang
alternatif dari step 2, bukan lanjutan linear dari step 3).

Handler back yang SUDAH ADA dan akan dipakai ulang (bukan logika baru):

| Step | Komponen CTA "Lanjutkan" | Handler back yang dipakai | Sumber |
|---|---|---|---|
| 1 | `StepOneFormFields.tsx:585-593` ("Lanjut ke Ringkasan") | `handleBackToMethodSelection` (`StepSurveyDetails.tsx:137-139`) — balik ke layar pilih metode | Sudah ada, saat ini hanya dilaporkan ke parent lewat `onBackHandlerChange` untuk dipakai `UnifiedHeader` |
| 2 | `StepCheckout.tsx:696-748` (CTA 3 takdir) | `prevStep` (`MultiStepForm.tsx:243-246`) — balik ke step 1 | Sudah ada |
| 3 | `StepSchedule.tsx:104-129` (mode biasa) | `prevStep` — balik ke step 2 (Ringkasan) | Sudah ada |
| 4 | `StepSchedule.tsx:104-129` (mode kilat) | `handleKilatBack` (`MultiStepForm.tsx:335-339`) — undo kilat upgrade, balik ke step 2 | Sudah ada |

`unifiedHeaderOnBack` (`MultiStepForm.tsx:341-344`) sudah menghitung handler yang
benar per step — computed value ini yang sekarang HANYA disalurkan ke
`UnifiedHeader`. Setelah perubahan ini, computed value yang sama disalurkan ke
tombol Back per-step; `UnifiedHeader` tidak lagi menerima `onBack` sama sekali.

## Desain

### A. Tombol Back per step

Layout: **side-by-side**. Outline button "← Kembali" di kiri (ukuran lebih kecil,
non-dominan), tombol utama tetap mengisi sisa lebar di kanan, satu baris. Berlaku
di 4 tempat pada tabel di atas.

- Step 1: `StepSurveyDetails` sudah punya `handleBackToMethodSelection` secara
  lokal (dipakai untuk melapor ke parent via `onBackHandlerChange`). Diteruskan
  langsung sebagai prop `onBack` ke `StepOneFormFields` di kedua render site-nya
  (`StepSurveyDetails.tsx:234-241` flow manual, `:286-292` flow setelah Google
  import) — TIDAK perlu round-trip lewat `MultiStepForm`.
- Step 2–4: `MultiStepForm` meneruskan handler yang sudah dihitung
  (`prevStep` / `handleKilatBack`) sebagai prop `onBack` baru ke `StepCheckout`
  dan `StepSchedule` (kedua render site-nya, step 3 & step 4, dengan handler
  berbeda sesuai tabel).

Style: reuse `Button` primitive (`components/ui/button.tsx`, sudah dipakai
`UnifiedHeader`) varian outline, icon `ArrowLeft` dari `lucide-react`, label pakai
translation key `backButton` yang sudah ada (`translations.ts:181,777`).

### B. Cancel order (ganti ikon panah di floating bar)

`UnifiedHeader.tsx`:
- Prop `onBack?: () => void` dihapus. Prop baru `onCancelConfirmed: () => void`
  ditambahkan (wajib, bukan opsional — cancel harus selalu punya efek).
- Ikon kiri berubah dari `ArrowLeft` ke `X` (`lucide-react`), title/tooltip pakai
  translation key baru (mis. `cancelOrderButton`).
- Klik `X` → buka dialog konfirmasi lokal (state `isCancelDialogOpen` di dalam
  `UnifiedHeader`, tidak perlu diangkat ke parent).
- Dialog: reuse pola `modal-overlay`/`modal-dialog`/`modal-header`/`modal-body`/
  `modal-footer` yang PERSIS sama dengan dialog konfirmasi ganti-metode
  (`StepSurveyDetails.tsx:247-275`) — tidak menambah komponen dialog baru, tidak
  menambah dependency. Icon `AlertTriangle`, judul "Batalkan Pesanan?", body
  memperingatkan data akan hilang, dua tombol: "Tidak, Lanjutkan Mengisi"
  (`modal-button-cancel`, menutup dialog) / "Ya, Batalkan Pesanan"
  (`modal-button-confirm`, styled destruktif, memanggil `onCancelConfirmed`).

`MultiStepForm.tsx`:
- Implementasi `onCancelConfirmed`: `localStorage.removeItem(STORAGE_KEY)`,
  `localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY)`, lalu
  `navigate('/dashboard', { replace: true })`. Pola persis sama dengan cleanup
  yang sudah ada di `submitOrderAndRoute` (`MultiStepForm.tsx:293-295`) — tidak
  ada call jaringan, tidak ada row DB untuk dibersihkan, karena `form_submissions`
  baru lahir saat submit final (dikonfirmasi lewat eksplorasi kode sebelumnya).
- `unifiedHeaderOnBack` (computed value) TIDAK dihapus — dipakai ulang untuk
  tombol Back per-step (lihat bagian A), hanya pindah tujuan penyaluran dari
  `UnifiedHeader` ke `StepCheckout`/`StepSchedule`.

### C. Di luar scope (sengaja tidak disentuh)

- Sub-layar step 1 (pilih metode / import Google Form): `UnifiedHeader`
  memang sudah disembunyikan di situ (`isHeaderVisible=false`,
  `MultiStepForm.tsx:351`), pakai header `AppNav` sendiri. Tidak diberi Cancel.
- `PaymentCheckoutPage` (`/dashboard/payment/:submissionId`, route terpisah,
  dicapai SETELAH `form_submissions` row sudah tersimpan di DB): membatalkan
  order sungguhan di situ adalah operasi berbeda kelas (butuh update DB, bukan
  cuma clear localStorage) — di luar permintaan ini.

## Error handling

Tidak ada state loading/error baru yang dibutuhkan — baik Back maupun Cancel
murni operasi client-side (ubah `currentStep` / clear `localStorage` + navigate),
tanpa network call.

## Testing (manual click-through, tidak ada test otomatis existing untuk flow ini)

1. Step 1 → klik Back → balik ke layar pilih metode (bukan ke luar form).
2. Step 1 → Lanjutkan → Step 2 → klik Back → balik ke Step 1, data form 1 utuh.
3. Step 2 → Lanjutkan (jalur jadwal) → Step 3 → klik Back → balik ke Step 2.
4. Step 2 → upgrade Kilat → Step 4 → klik Back → balik ke Step 2, kilat upgrade
   ter-undo (samakan dengan perilaku panah lama di step 4 sebelum perubahan ini).
5. Di step mana pun → klik `X` → dialog muncul → klik "Tidak, Lanjutkan Mengisi"
   → dialog tertutup, form/step TIDAK berubah.
6. Di step mana pun → klik `X` → "Ya, Batalkan Pesanan" → redirect ke
   `/dashboard`, lalu buka form order baru → mulai dari step 1 kosong (draft
   lama tidak muncul lagi).
