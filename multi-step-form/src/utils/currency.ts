/**
 * Formatter uang tunggal untuk seluruh app.
 *
 * Sebelum berkas ini ada, `formatIDR` punya tiga implementasi berbeda dengan nama
 * sama (satu di antaranya membayangi yang kanonik di dalam modulnya sendiri), dan
 * `formatRupiah` dideklarasikan ulang lima kali. Keduanya kebutuhan yang berbeda,
 * jadi di sini keduanya diberi nama masing-masing alih-alih dipaksa jadi satu.
 */

/**
 * "Rp 1.234.568" — awalan Rp, dibulatkan ke rupiah penuh.
 *
 * Catatan: `style: 'currency'` menyisipkan U+00A0 (non-breaking space) sesudah "Rp",
 * bukan spasi biasa. Jangan bandingkan hasilnya dengan string ber-spasi biasa.
 */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * "1.234.568" — pengelompokan angka saja, tanpa awalan.
 * Untuk template yang sudah menulis "Rp" sendiri.
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount);
}
