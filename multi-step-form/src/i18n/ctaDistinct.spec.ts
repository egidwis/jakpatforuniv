import { describe, it, expect } from 'vitest';
import { translations } from './translations';

/*
  Tidak boleh ada DUA tombol yang sekata dalam satu perjalanan.

  ⚠️ KENAPA BERKAS INI ADA. `summaryCtaPay` dan `scheduleLockCta` pernah
  berbunyi SAMA PERSIS — "Kunci Jadwal & Lanjut Bayar" — di kedua bahasa,
  padahal melakukan hal yang berbeda: yang satu MENULIS ORDER (cabang Kilat /
  order yang jadwalnya tidak dipilih di layar itu), yang lain MENGUNCI SLOT
  tanggal. Peneliti menekan kalimat identik dua kali dalam satu perjalanan dan
  mengira yang pertama gagal.

  Keduanya tinggal berjauhan di berkas terjemahan (baris ~310 dan ~325), jadi
  tabrakan seperti ini tidak terlihat saat menambah kunci baru. Tes ini yang
  melihatnya.
*/

/** CTA yang bisa muncul dalam satu perjalanan order → jadwal → bayar. */
const CTA_SATU_PERJALANAN = [
  'summaryCtaSchedule',
  'summaryCtaPay',
  'summaryCtaReview',
  'scheduleLockCta',
] as const;

describe('CTA satu perjalanan — nol pasangan sekata', () => {
  for (const lang of ['en', 'id'] as const) {
    it(`${lang}: setiap CTA berbunyi berbeda`, () => {
      const dipakai = new Map<string, string>();
      for (const key of CTA_SATU_PERJALANAN) {
        const teks = translations[lang][key].trim().toLowerCase();
        const sebelumnya = dipakai.get(teks);
        expect(
          sebelumnya,
          `"${translations[lang][key]}" dipakai oleh ${sebelumnya} DAN ${key}`,
        ).toBeUndefined();
        dipakai.set(teks, key);
      }
    });
  }
});

describe('CTA — kata kerjanya menyebut yang TERJADI SEKARANG', () => {
  it('summaryCtaPay tidak lagi menjanjikan penguncian jadwal', () => {
    // Tombol itu MENULIS ORDER. Menyebut "kunci jadwal" membuat peneliti
    // mengira tanggalnya sudah aman padahal belum ada tanggal sama sekali.
    expect(translations.id.summaryCtaPay.toLowerCase()).not.toContain('kunci');
    expect(translations.en.summaryCtaPay.toLowerCase()).not.toContain('lock');
  });

  it('summaryCtaReview TIDAK diubah — ia sudah jujur sejak awal', () => {
    // Satu-satunya CTA yang sejak dulu menyatakan hasilnya apa adanya.
    expect(translations.id.summaryCtaReview).toBe('Kirim untuk Diperiksa');
    expect(translations.en.summaryCtaReview).toBe('Send for Review');
  });
});
