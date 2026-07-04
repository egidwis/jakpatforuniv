# Revamp Halaman Transactions → "Keuangan" (Transaksi + Wallet)

**Tanggal:** 2026-07-04
**Status:** Disetujui untuk perencanaan implementasi
**Branch dasar:** `feat/submissions-visual-refresh` (bergantung pada komponen `data-list/*` dan `ui/chip` yang hanya ada di branch ini)

## Tujuan

Menerapkan bahasa desain baru dari halaman Submissions (baris kompak + detail di
drawer/reading-pane) ke halaman Transactions, sekaligus menyelesaikan masalah
penempatan DOKU Wallet yang saat ini berupa Dialog modal di tengah layar.

## Keputusan desain

1. **Menu sidebar di-rename `Transactions` → `Keuangan`.** Id internal page
   (`'transactions'`) tidak berubah agar perubahan di
   `InternalDashboardWithLayout.tsx` minimal.
2. **Halaman berisi segmented tab `Transaksi | Wallet`.** Wallet bukan record
   transaksi, tapi masih satu rumpun keuangan — dinaikkannya nama menu ke
   kategori induk menyelesaikan ketidakcocokan semantik tanpa menambah item
   sidebar untuk fitur yang jarang dibuka.
3. **DOKU Wallet keluar dari modal, jadi tab full-page.** Tombol "DOKU Wallet"
   di toolbar dihapus; `DokuWalletModal.tsx` dibongkar menjadi `WalletView`
   dan file modal dihapus setelah QA.
4. **Drawer/reading-pane eksklusif untuk detail transaksi.** Tidak ada konflik
   surface dengan wallet.
5. **Tanpa bulk selection.** Transaksi tidak punya aksi massal (YAGNI) — tidak
   ada checkbox, tidak pakai `useRowSelection`/`BulkActionsToolbar`.
6. **Mobile ikut digarap.** Saat ini tabel di-hide di mobile tanpa fallback
   (halaman kosong); baris kompak yang sama dipakai di mobile dengan kolom
   sekunder disembunyikan, detail memakai drawer full-width.

## Tab Transaksi

### Baris kompak (mencermin `SubmissionListRow`)

```
tanggal+jam · #ID transaksi · judul survei     total (mono) · [chip status] · [chip metode] · ›
                              peneliti
```

- Kolom, kiri ke kanan: tanggal pembayaran (`created_at`, format tanggal+jam
  seperti sekarang) · ID transaksi (`payment_id`, mono + truncate, gaya kolom
  ID submissions) · judul survei **tanpa chip di depannya** dengan subtitle
  nama peneliti (email pindah ke detail) · total (mono) · chip status · chip
  metode pembayaran · chevron.
- Klik baris membuka detail; tidak ada aksi inline di baris.
- Rincian item, memo, email peneliti, dan tombol download pindah seluruhnya
  ke detail.
- Chip memakai `ui/chip.tsx`:
  - Status: `green` Lunas, `amber` Menunggu, `red` Gagal.
  - Metode: `blue` untuk DOKU/channel (QRIS dsb. via `formatPaymentChannel`),
    `amber` untuk Mayar (legacy — dipertahankan hanya untuk data historis),
    `purple` untuk Invoice Manual.
- Di mobile: kolom tanggal dan ID disembunyikan/disatukan ke subtitle;
  judul, total + chip status tetap terlihat.

### Detail transaksi — `TransactionDetailSheet`

Komponen baru dengan `variant: 'sheet' | 'pane'` persis pola
`SubmissionDetailSheet`:

- **≥1280px (xl):** inline reading pane (`DetailPane`) — split view, list tetap
  interaktif, baris aktif diberi highlight + garis biru kiri.
- **<1280px:** drawer kanan (`DetailSheet`); di mobile full-width.

Isi (memakai `DetailSheetSection`):

- **Header:** judul survei; subtitle nama peneliti + email; chips status + metode.
- **Rincian Item:** daftar item dari `note` JSON (nama, kategori, qty, harga),
  memo bila ada, dan total.
- **Pembayaran:** payment ID (mono + tombol copy), channel, dibuat/diperbarui.
- **Footer aksi:** Download Invoice/Receipt (`/invoices/{payment_id}`); untuk
  status Menunggu tambahan tombol salin `payment_url` (kirim ulang link bayar).

### Toolbar

Menyusut karena tombol wallet hilang: periode (bulan+tahun) · search · status
chips dengan count (dipertahankan untuk triase cepat) · Export CSV · Total
Pendapatan dengan dropdown breakdown (tidak berubah) · refresh.

## Tab Wallet — `WalletView`

Konten `DokuWalletModal` diekstrak ke halaman penuh. Tiga tab modal (Saldo,
Payout, Riwayat) dilebur jadi layout dua kolom:

- **Kiri:** kartu saldo (available + pending, refresh) dan form payout
  (jumlah, bank, rekening, nama, invoice, deskripsi).
- **Kanan:** riwayat penarikan (scrollable).
- Di mobile: kolom ditumpuk vertikal.

Logika fetch saldo/riwayat dan submit payout dipindah apa adanya — endpoint
`/api/doku/sac/*` dan props `sacId`/`productName` tidak berubah.

## Yang sengaja tidak diubah (non-goals)

- Query Supabase, logika filter, ekspor CSV, dan perhitungan revenue/kategori.
- Endpoint DOKU dan alur payout.
- Badge Mayar legacy — hanya tampilan; tidak ada flow Mayar baru.
- Halaman lain (Submissions, Customers, dsb.).

## File terdampak

| File | Perubahan |
|---|---|
| `src/components/TransactionsPage.tsx` | Jadi host tab Transaksi + Wallet; list dirombak ke baris kompak |
| `src/components/transactions/TransactionListRow.tsx` | Baru — baris kompak |
| `src/components/transactions/TransactionDetailSheet.tsx` | Baru — detail sheet/pane |
| `src/components/transactions/WalletView.tsx` | Baru — ekstraksi dari modal |
| `src/components/DokuWalletModal.tsx` | Dihapus setelah QA |
| `src/components/InternalDashboardWithLayout.tsx` | Label sidebar `Keuangan` |

## Catatan QA

- Regresi utama yang dijaga: parsing `note` JSON (items/memo/fallback teks),
  filter periode+status+search, ekspor CSV, link invoice, payout DOKU.
- Perhatikan aturan cascade `styles.css` vs Tailwind (jangan pasang `flex`
  bersama kelas display responsif di area multi-step-form).
- QA manual di mobile viewport — halaman ini sebelumnya tidak punya tampilan
  mobile sama sekali.
