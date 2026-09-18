import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ⚠️ GERBANG PII — BUKAN TES KOSMETIK.
 *
 * /api/respondents mengirim `jakpat_id` + `e_wallet_number` responden, memakai
 * service-role sehingga RLS TIDAK menjadi lapis kedua. Gerbang API key adalah
 * satu-satunya penjaga, dan berkas ini yang menjaga gerbang itu tetap tertutup.
 *
 * Ketiga hal yang dikunci di sini diperbaiki 2026-09-18 (Phase 5, Langkah 5).
 * Semuanya mudah "dirapikan" kembali oleh orang yang tidak tahu sejarahnya —
 * itulah sebabnya masing-masing punya tesnya sendiri.
 */

const SRC = readFileSync(path.resolve(__dirname, './respondents.js'), 'utf8');

describe('gerbang API key: header saja', () => {
    /**
     * Key di query string ikut tertulis ke access log Cloudflare, log server
     * pemanggil, dan header `Referer`. Sekali bocor, seluruh basis data e-wallet
     * terbuka. Header tidak pernah masuk ke log-log itu.
     */
    it('TIDAK menerima api_key dari query string sebagai kredensial', () => {
        // Bentuk lama: `url.searchParams.get('api_key')` di-OR ke providedKey.
        expect(SRC).not.toMatch(/providedKey\s*=[\s\S]{0,120}searchParams\.get\(\s*['"]api_key['"]\s*\)/);
    });

    it('membaca kredensial dari header X-API-Key', () => {
        expect(SRC).toContain("headers.get('X-API-Key')");
    });

    /**
     * Satu-satunya penyebutan `api_key` yang sah adalah untuk MENJELASKAN
     * penolakan kepada klien lama — bukan untuk menerimanya.
     */
    it('memberi tahu klien lama cara memperbaikinya', () => {
        expect(SRC).toContain('no longer accepted');
    });
});

describe('CORS: tidak terbuka ke browser', () => {
    /**
     * Dengan `*`, halaman web mana pun yang dibuka korban bisa membaca respons
     * ini begitu ia memegang API key. Endpoint yang mengirim nomor e-wallet
     * tidak punya alasan untuk dipanggil dari browser sama sekali.
     */
    it('tidak pernah mengirim Access-Control-Allow-Origin: *', () => {
        expect(SRC).not.toMatch(/['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/);
    });

    it('kebijakan CORS berasal dari env var, bukan hardcode', () => {
        expect(SRC).toContain('RESPONDENT_API_ALLOWED_ORIGIN');
    });

    /**
     * Preflight yang murah hati di depan gerbang yang ketat menghidupkan kembali
     * lubang yang baru ditutup. Keduanya WAJIB memakai sumber yang sama.
     */
    it('preflight memakai kebijakan yang sama dengan GET', () => {
        const options = SRC.slice(SRC.indexOf('export async function onRequestOptions'));
        expect(options).toContain('buildCorsHeaders(context.env)');
    });
});

describe('is_hidden dihormati di KEDUA mode', () => {
    /**
     * Admin yang menyembunyikan halaman mengira sudah menariknya dari peredaran.
     * sql/42:244-246 bahkan menyarankan `is_hidden` sebagai remediasi PII — saran
     * yang tidak pernah bekerja di endpoint ini sampai 2026-09-18.
     *
     * Mode 2 adalah yang benar-benar mengirim `e_wallet_number`, dan ia bisa
     * dipanggil langsung dengan page_id/slug tanpa menyentuh daftar Mode 1 —
     * jadi menyaring satu mode saja tidak menutup apa pun.
     */
    it('kedua kueri survey_pages menyaring is_hidden', () => {
        const filters = SRC.match(/\.or\('is_hidden\.eq\.false,is_hidden\.is\.null'\)/g) || [];
        expect(filters).toHaveLength(2);
    });

    it('jumlah filter is_hidden sama dengan jumlah filter is_published', () => {
        const published = SRC.match(/\.eq\('is_published',\s*true\)/g) || [];
        expect(published).toHaveLength(2);
    });
});

describe('yang sengaja TIDAK dilakukan', () => {
    /**
     * ⚠️ JANGAN tambahkan pemeriksaan jendela tanggal di endpoint ini.
     *
     * Undian terjadi SESUDAH iklan berhenti tayang: `can_select_winners` baru
     * `true` ketika `end_date` sudah lewat. Menyaring halaman kedaluwarsa akan
     * mematikan undian untuk SEMUA survei — yaitu fungsi utama endpoint ini.
     *
     * Tes ini menguji ketiadaan, jadi ia rapuh terhadap penulisan ulang. Itu
     * disengaja: kegagalan yang dijaganya senyap total (tidak ada error, undian
     * hanya tidak pernah boleh dibuka), dan biaya salah di sini jauh lebih besar
     * daripada biaya tes yang sesekali perlu disesuaikan.
     */
    it('tidak menyaring survei berdasarkan jendela publish_*', () => {
        expect(SRC).not.toMatch(/publish_end_date\s*<\s*|\.lt\(\s*['"]publish_end_date['"]/);
        expect(SRC).not.toMatch(/\.gt\(\s*['"]publish_end_date['"]/);
    });

    /**
     * Kilat HARUS tetap terlihat di sini — /pages dan /api/surveys membuangnya,
     * endpoint ini tidak. Tanpa itu, pemenang Kilat tidak akan pernah bisa diundi.
     */
    it('tidak menyaring distribution_type, dan alasannya tertulis', () => {
        expect(SRC).not.toContain("distribution_type', 'kilat'");
        expect(SRC).toContain('TIDAK ADA FILTER `distribution_type` DI SINI');
    });
});
