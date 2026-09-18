import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isKilatPage } from './SurveyListingPage';

/**
 * ⚠️ TES INI ADALAH SABUK PENGAMAN, BUKAN PELENGKAP.
 *
 * Sejak Phase 5 (sql/95) halaman Kilat nyata-nyata ada di `survey_pages`, dan ia
 * lolos SETIAP tapisan lain yang dimiliki dua listing surface:
 *
 *   is_published = TRUE ...... wajib, /api/respondents membacanya untuk undian
 *   is_hidden    = FALSE ..... sengaja, is_hidden dipakai admin untuk hal lain
 *   publish_end_date = NULL .. sengaja, tautan push tidak boleh mati
 *
 * NULL pada tanggal akhir berarti filter tanggal (`if (end && end < now)`)
 * MELOLOSKANNYA. Jadi satu-satunya yang menahan halaman Kilat keluar dari
 * /pages dan /api/surveys adalah filter `distribution_type` — dan satu-satunya
 * yang menahan filter itu tetap ada adalah berkas ini.
 *
 * Kalau tes ini dihapus atau dilonggarkan, kegagalannya senyap: tidak ada error,
 * halaman Kilat hanya mulai muncul di daftar publik dan di feed aplikasi Jakpat,
 * bersaing dengan iklan reguler yang membayar untuk tempat itu.
 */

describe('isKilatPage', () => {
    it('mengenali Kilat saat join berbentuk objek', () => {
        expect(isKilatPage({ form_submissions: { distribution_type: 'kilat' } })).toBe(true);
    });

    it('mengenali Kilat saat join berbentuk array', () => {
        expect(isKilatPage({ form_submissions: [{ distribution_type: 'kilat' }] })).toBe(true);
    });

    it('meloloskan halaman reguler', () => {
        expect(isKilatPage({ form_submissions: { distribution_type: 'regular' } })).toBe(false);
        expect(isKilatPage({ form_submissions: [{ distribution_type: 'regular' }] })).toBe(false);
    });

    /**
     * ⚠️ KASUS YANG PALING MUDAH DIRUSAK.
     *
     * 23 halaman produksi punya `submission_id` NULL, 11 di antaranya terbit —
     * pengumuman dan iklan manual yang tidak lahir dari order mana pun. Bagi
     * mereka join `form_submissions` menghasilkan null/array kosong.
     *
     * Implementasi yang "aman-amanan" (buang yang tidak diketahui) akan
     * melenyapkan 11 halaman hidup dari /pages sekaligus. Tidak diketahui
     * BUKAN Kilat.
     */
    it('meloloskan halaman yatim — submission_id NULL bukan Kilat', () => {
        expect(isKilatPage({ form_submissions: null })).toBe(false);
        expect(isKilatPage({ form_submissions: [] })).toBe(false);
        expect(isKilatPage({})).toBe(false);
        expect(isKilatPage(null)).toBe(false);
    });
});

/**
 * Kontrak duplikasi. `/pages` (React) dan `/api/surveys` (Pages Function)
 * membaca tabel yang sama untuk dua klien berbeda — web dan aplikasi Jakpat —
 * dan sudah lama terikat kontrak semacam ini untuk `compareDisplayOrder`.
 *
 * Menyaring Kilat hanya di salah satunya berarti ia tetap muncul di sisi lain,
 * dan justru sisi aplikasi Jakpat-lah yang paling merugikan: di sanalah kartu
 * iklan reguler dibayar untuk bersaing.
 */
describe('kontrak: kedua listing surface menyaring Kilat', () => {
    const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');

    it('/pages menarik distribution_type dan memanggil isKilatPage', () => {
        const src = read('./SurveyListingPage.tsx');
        expect(src).toContain('distribution_type');
        expect(src).toContain('if (isKilatPage(page)) return false;');
    });

    it('/api/surveys menarik distribution_type dan memanggil isKilatPage', () => {
        const src = read('../../../functions/api/surveys.js');
        expect(src).toContain('distribution_type');
        expect(src).toContain('if (isKilatPage(s)) return false;');
    });

    /**
     * /api/respondents harus tetap MELIHAT Kilat — undian pemenang berantai
     * survey_pages.id → page_respondents.page_id → jakpat_id. Menyaring Kilat
     * di sana akan membekukan undian Kilat tanpa satu pun error.
     *
     * Ini menguji ketiadaan, jadi ia rapuh terhadap penulisan ulang — tapi
     * kegagalan yang dijaganya senyap total, dan komentar di berkas itu adalah
     * satu-satunya hal lain yang menjelaskan mengapa filternya tidak ada.
     */
    it('/api/respondents TIDAK menyaring Kilat, dan alasannya tertulis', () => {
        const src = read('../../../functions/api/respondents.js');
        expect(src).not.toContain('isKilatPage');
        expect(src).toContain("TIDAK ADA FILTER `distribution_type` DI SINI");
    });
});

/**
 * Gerbang privasi sisi peneliti. Tautan Kilat adalah alat kerja admin: ia
 * disalin ke dalam survei Jakpat. Peneliti tidak pernah melihatnya, dan
 * penyaringannya dilakukan di SUMBER DATA supaya setiap permukaan peneliti di
 * masa depan ikut aman tanpa perlu tahu apa-apa soal Kilat.
 */
describe('kontrak: peneliti tidak menerima tautan halaman Kilat', () => {
    it('getSurveyPagesBySubmissionIds membuang baris Kilat', () => {
        const src = readFileSync(path.resolve(__dirname, '../../utils/supabase.ts'), 'utf8');
        // Iris dari komentar pembuka blok (yang memuat "GERBANG PRIVASI") sampai
        // akhir fungsi — alasannya hidup di komentar, jadi ia ikut dikunci.
        const start = src.indexOf('// Halaman iklan (survey_pages) per submission');
        const fn = src.slice(start);
        const body = fn.slice(0, fn.indexOf('\n};'));

        expect(start).toBeGreaterThan(-1);
        expect(body).toContain('distribution_type');
        expect(body).toContain("=== 'kilat'");
        expect(body).toContain('GERBANG PRIVASI');
    });
});
