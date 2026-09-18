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

/**
 * ⚠️ HIBAH KOLOM `anon` — KONTRAK YANG TIDAK TERLIHAT DARI KODE.
 *
 * `form_submissions` TIDAK memberi `anon` hibah SELECT tingkat tabel. Yang ada
 * adalah hibah per-KOLOM yang sempit dan disengaja (tanpa email, telepon, nama,
 * universitas, angka uang). Kalau kueri publik meminta SATU kolom di luar daftar
 * itu, PostgREST menolak SELURUH kueri — bukan hanya kolomnya — dengan
 * "permission denied for table form_submissions".
 *
 * Ini bukan hipotesis. Phase 5 menambahkan `distribution_type` ke join di
 * /api/surveys dan /pages tanpa hibahnya; keduanya MATI TOTAL di produksi
 * (nol iklan termuat) sampai sql/96 dijalankan. Tidak ada satu pun tes yang
 * menangkapnya, karena hibah hidup di database, bukan di kode.
 *
 * Berkas ini tidak bisa menghubungi database. Yang bisa ia lakukan — dan yang
 * benar-benar berguna — adalah mengunci DAFTARNYA di sini, supaya penambahan
 * kolom berikutnya pada join publik gagal di CI dan memaksa penulisnya
 * memutuskan secara sadar: hibahkan kolomnya, atau jangan memintanya.
 *
 * Menambah kolom baru ke join publik? Tambahkan hibahnya lewat berkas sql
 * (lihat sql/96), LALU tambahkan namanya ke daftar ini.
 */
describe('kontrak hibah kolom anon pada form_submissions', () => {
    /**
     * Sesuai produksi setelah sql/96 (8 kolom). Diverifikasi lewat
     * information_schema.column_privileges 2026-09-18.
     */
    const ANON_BOLEH_BACA = new Set([
        'criteria_responden',
        'distribution_type',
        'end_date',
        'id',
        'prize_per_winner',
        'start_date',
        'survey_url',
        'winner_count',
    ]);

    const LISTING_SRC = readFileSync(
        path.resolve(__dirname, './SurveyListingPage.tsx'), 'utf8');
    const SURVEYS_SRC = readFileSync(
        path.resolve(__dirname, '../../../functions/api/surveys.js'), 'utf8');

    /** Ambil kolom yang diminta dari `form_submissions!submission_id(...)`. */
    const kolomJoinPublik = (src: string): string[] => {
        const out: string[] = [];
        const re = /form_submissions!submission_id\s*\(([^)]*)\)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
            out.push(...m[1].split(',').map(s => s.trim()).filter(Boolean));
        }
        return out;
    };

    it('/pages hanya meminta kolom yang dihibahkan ke anon', () => {
        const kolom = kolomJoinPublik(LISTING_SRC);
        expect(kolom.length).toBeGreaterThan(0);
        for (const k of kolom) {
            expect(ANON_BOLEH_BACA.has(k), `kolom '${k}' TIDAK dihibahkan ke anon — kueri /pages akan ditolak seluruhnya`).toBe(true);
        }
    });

    it('/api/surveys hanya meminta kolom yang dihibahkan ke anon', () => {
        const kolom = kolomJoinPublik(SURVEYS_SRC);
        expect(kolom.length).toBeGreaterThan(0);
        for (const k of kolom) {
            expect(ANON_BOLEH_BACA.has(k), `kolom '${k}' TIDAK dihibahkan ke anon — kueri /api/surveys akan ditolak seluruhnya`).toBe(true);
        }
    });

    /**
     * Pagar PII: daftar di atas tidak boleh diam-diam tumbuh ke kolom sensitif
     * hanya supaya tes di atas hijau. Kalau suatu saat salah satu ini memang
     * perlu dibaca publik, itu keputusan produk — bukan perbaikan tes.
     */
    it('daftar hibah tidak mengandung kolom PII atau uang', () => {
        for (const terlarang of ['email', 'phone_number', 'full_name', 'university',
                                 'total_cost', 'subtotal', 'ppn_amount', 'auth_user_id']) {
            expect(ANON_BOLEH_BACA.has(terlarang), `'${terlarang}' tidak boleh ada di daftar hibah anon`).toBe(false);
        }
    });
});

/**
 * Dashboard admin: tab Kilat & label tipe.
 *
 * Dua jebakan senyap dikunci di sini — keduanya gagal TANPA error, hanya
 * dengan angka yang salah di layar.
 */
describe('dashboard admin: Kilat punya tab & label sendiri', () => {
    const MANAGE_SRC = readFileSync(
        path.resolve(__dirname, '../../components/PublishPageManagement.tsx'), 'utf8');
    const TYPES_SRC = readFileSync(
        path.resolve(__dirname, '../../components/publish-pages/types.ts'), 'utf8');

    /**
     * ⚠️ PostgREST: `.eq()` pada kolom TERTAUT tidak menyaring baris induk
     * kecuali join-nya `!inner`. Terukur di produksi 18 Sep — tanpa `!inner`
     * kueri tab Kilat memulangkan 388 baris, bukan 17.
     *
     * Kegagalannya senyap: penyaring klien tetap membuat layarnya benar, jadi
     * satu-satunya gejala adalah 388 baris ditarik untuk menampilkan 17.
     */
    it('kueri tab Kilat memakai join !inner', () => {
        expect(MANAGE_SRC).toContain('form_submissions!inner');
        // Dan `.eq()`-nya memang menyasar kolom tertaut itu.
        expect(MANAGE_SRC).toContain("eq('form_submissions.distribution_type', 'kilat')");
    });

    /** Feed live tetap TIDAK boleh memakai !inner — halaman yatim wajib lolos. */
    it('PAGE_SELECT biasa tetap tanpa !inner, supaya yatim tidak gugur', () => {
        const biasa = MANAGE_SRC.slice(MANAGE_SRC.indexOf('const PAGE_SELECT = `'));
        const akhir = biasa.indexOf('`;');
        expect(biasa.slice(0, akhir)).not.toContain('!inner');
    });

    /**
     * Sebelum ini `pageTypeOf` tidak pernah menanyai `distribution_type`,
     * sehingga 17 halaman Kilat berlabel "Survey Ad" di seluruh dashboard.
     */
    it('pageTypeOf mengenali Kilat, dan labelnya ada', () => {
        expect(TYPES_SRC).toContain("if (isKilatPage(p)) return 'kilat';");
        expect(TYPES_SRC).toContain("kilat: 'Kilat'");
    });

    /** Urutan rantai: Kilat harus diperiksa SEBELUM pagar submission_id. */
    it('Kilat diperiksa sebelum cabang announcement', () => {
        const iKilat = TYPES_SRC.indexOf("return 'kilat'");
        const iAnn = TYPES_SRC.indexOf("return 'announcement'");
        expect(iKilat).toBeGreaterThan(-1);
        expect(iAnn).toBeGreaterThan(-1);
        expect(iKilat).toBeLessThan(iAnn);
    });
});
