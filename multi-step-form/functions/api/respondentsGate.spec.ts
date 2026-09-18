import { describe, it, expect, beforeEach, vi } from 'vitest';
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

/**
 * ⚠️ TES EKSEKUSI — pelengkap wajib bagi semua tes teks di atas.
 *
 * Semua tes sebelumnya membaca `respondents.js` sebagai STRING. Itu mengunci
 * kebijakan, tapi tidak pernah MENJALANKAN apa pun — sehingga berkas yang
 * melempar ReferenceError pada setiap permintaan tetap lolos 100%.
 *
 * Itu bukan hipotesis: 2026-09-18 commit 77d1e56 menghapus `const url = ...`
 * sementara bagian 2 masih memakainya. Seluruh endpoint mati (Cloudflare 1101,
 * "Worker threw exception") dan 883 tes tetap hijau. Blok ini ada supaya
 * kegagalan sekelas itu tidak bisa terulang diam-diam.
 */
describe('eksekusi nyata: handler tidak melempar', () => {
    // ⚠️ WAJIB. Tanpa ini Vitest memakai modul yang sudah di-cache dari proses
    // uji sebelumnya, sehingga tes ini lolos bahkan terhadap berkas yang rusak —
    // persis yang terjadi saat tes ini pertama kali ditulis.
    beforeEach(() => {
        vi.resetModules();
    });

    const importHandler = async () => (await import('./respondents.js')).onRequestGet;

    /**
     * ⚠️ Konfigurasi Supabase WAJIB diisi (walau palsu).
     *
     * Tanpa `VITE_SUPABASE_URL`/`ANON_KEY`, handler pulang lebih awal dengan 500
     * "Server configuration error" di bagian 1 — dan TIDAK PERNAH sampai ke
     * bagian 2 tempat query string dibaca. Tes yang membiarkannya kosong akan
     * hijau terhadap berkas yang rusak sekalipun. Itu terjadi sungguhan saat
     * blok ini ditulis; jangan sederhanakan kembali.
     *
     * URL-nya menunjuk ke host yang tidak ada, jadi panggilan jaringan gagal —
     * gagal di DALAM `try`, yang berakhir sebagai 500 terkendali, bukan lemparan.
     */
    const ctx = (urlStr: string, headers: Record<string, string> = {}, env: Record<string, string> = {}) => ({
        request: new Request(urlStr, { headers }),
        env: {
            JFU_RESPONDENT_API_KEY: 'kunci-uji',
            VITE_SUPABASE_URL: 'https://tidak-ada.invalid',
            VITE_SUPABASE_ANON_KEY: 'anon-palsu',
            ...env,
        },
    });

    it('menolak tanpa key TANPA melempar, dan tetap 401', async () => {
        const onRequestGet = await importHandler();
        const res = await onRequestGet(ctx('https://x.test/api/respondents', {}, {
            VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '',
        }));
        expect(res.status).toBe(401);
    });

    /**
     * Inilah yang menangkap bug `url` itu: query string hanya dibaca SETELAH
     * gerbang key terlewati, jadi hanya permintaan dengan key benar yang
     * menyentuh baris tersebut.
     */
    it('permintaan ber-key yang benar melewati gerbang tanpa ReferenceError', async () => {
        const onRequestGet = await importHandler();
        const res = await onRequestGet(
            ctx('https://x.test/api/respondents?slug=apa-saja', { 'X-API-Key': 'kunci-uji' })
        );
        expect(res).toBeInstanceOf(Response);
        expect(res.status).not.toBe(401);
        // Bukti bahwa bagian 2 (pembacaan query string) BENAR-BENAR tercapai:
        // 500 "Server configuration error" berarti handler pulang SEBELUM itu,
        // dan tes ini kehilangan seluruh dayanya.
        expect(await res.clone().text()).not.toContain('Server configuration error');
    });

    it('membaca page_id dan slug tanpa melempar', async () => {
        const onRequestGet = await importHandler();
        for (const q of ['', '?page_id=abc', '?slug=abc', '?page_id=abc&slug=def']) {
            const res = await onRequestGet(
                ctx(`https://x.test/api/respondents${q}`, { 'X-API-Key': 'kunci-uji' })
            );
            expect(res).toBeInstanceOf(Response);
            expect(await res.clone().text()).not.toContain('Server configuration error');
        }
    });

    it('preflight OPTIONS tidak melempar', async () => {
        const mod = await import('./respondents.js');
        const res = await mod.onRequestOptions(ctx('https://x.test/api/respondents'));
        expect(res).toBeInstanceOf(Response);
    });
});
