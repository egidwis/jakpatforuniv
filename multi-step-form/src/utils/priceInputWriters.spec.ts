import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Penjaga struktural untuk satu invarian: SETIAP fungsi yang menulis masukan
 * harga order WAJIB menghitung ulang harganya sendiri.
 *
 * ⚠️ KENAPA MEMBACA SUMBERNYA, BUKAN MEMANGGIL FUNGSINYA. Keduanya menulis ke
 * Supabase, jadi menguji perilakunya berarti memalsukan klien — dan tiruan itu
 * akan tetap hijau persis pada kegagalan yang ingin dicegah, yaitu seseorang
 * MENGHAPUS panggilan `recomputeOrderPrice` dari badan fungsinya.
 *
 * Cacat yang membuat penjaga ini ada tidak terlihat sebagai error: dari empat
 * permukaan yang menyunting masukan harga, hanya SATU (tombol Approve) yang
 * ingat memanggil penghitungan ulang. Tiga sisanya menulis lalu berhenti, dan
 * `InvoiceForm` menagih dari kolom yang baru — 17 dari 90 order era-PPN
 * akhirnya mencatat harga yang berbeda dari nominal yang ditagihkan, 12 di
 * antaranya sudah lunas. Tidak ada tes yang bisa merah, karena tidak ada yang
 * rusak; yang ada cuma aturan pemanggil yang dilupakan pemanggil.
 */
const SRC = readFileSync(join(__dirname, 'supabase.ts'), 'utf-8');

function bodyOf(name: string): string {
  const start = SRC.indexOf(`export const ${name} = async (`);
  expect(start, `${name} tidak ditemukan di supabase.ts`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n};\n', start);
  expect(end, `akhir badan ${name} tidak ditemukan`).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('penulis masukan harga menghitung ulang harganya sendiri', () => {
  it.each(['updateFormDetails', 'updateSubmissionCriteria'])(
    '%s memanggil recomputeOrderPrice',
    (name) => {
      expect(bodyOf(name)).toContain('recomputeOrderPrice(');
    },
  );

  it('updateFormDetails menjaga daftar kolom harganya, bukan menebak', () => {
    // Kalau kolom masukan harga bertambah (mis. `distribution_type` pindah ke
    // sini), ia harus masuk daftar ini — bukan diperiksa ad-hoc di pemanggil.
    expect(SRC).toContain("const PRICE_INPUT_COLUMNS = ['question_count', 'duration'] as const;");
    expect(bodyOf('updateFormDetails')).toContain('PRICE_INPUT_COLUMNS.some');
  });
});

describe('tidak ada permukaan yang menyunting harga di luar kedua penulis itu', () => {
  it('recomputeOrderPrice tidak lagi dipanggil langsung dari komponen', () => {
    // Bukan soal gaya: panggilan langsung dari komponen berarti ADA jalur
    // penulisan yang tidak lewat penulis di atas — dan jalur itulah yang dulu
    // dilupakan tiga dari empat kali.
    const files = [
      '../components/submissions/SubmissionDetailSheet.tsx',
      '../components/submissions/tabs/InfoTab.tsx',
      '../components/EditFormDetailsModal.tsx',
      '../components/EditCriteriaModal.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(join(__dirname, f), 'utf-8');
      expect(src, `${f} memanggil recomputeOrderPrice sendiri`).not.toContain('recomputeOrderPrice(');
    }
  });
});
