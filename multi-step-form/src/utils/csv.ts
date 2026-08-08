/**
 * Serialisasi CSV untuk unduhan admin.
 *
 * Dipanen dari `exportPeriodWinnersCSV` (dulu di PublishPageManagement) sebelum
 * modal Arsip Pemenang dibuang. Dari tiga penulis CSV di repo ini, hanya yang itu
 * benar pada dua hal yang sama-sama diam saat salah:
 *
 *   1. BOM UTF-8 di depan berkas. Tanpanya Excel di Windows membaca berkas
 *      sebagai ANSI dan merusak nama Indonesia ber-diakritik.
 *   2. Tanda kutip di dalam sel di-escape jadi `""`. Tanpanya satu judul survei
 *      yang memuat `"` menggeser seluruh kolom di sisa baris.
 *
 * `TransactionsPage` dan `google-forms-responses` belum diretrofit ke sini —
 * util ini diletakkan supaya penulis CSV berikutnya punya satu tempat yang benar,
 * bukan supaya yang lama diam-diam berubah perilaku.
 */

export type CsvCell = string | number | null | undefined;

/** Satu sel: selalu dikutip, kutip di dalamnya digandakan. */
function escapeCell(cell: CsvCell): string {
  const raw = cell === null || cell === undefined ? '' : String(cell);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
}

/** Merangkai CSV lalu memicu unduhan di peramban. */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  // \uFEFF = BOM, ditulis sebagai escape supaya terlihat di kode dan tidak bisa
  // hilang tanpa jejak saat berkas ini disunting. Lihat catatan di atas.
  const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
