import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BOOT_COPY, BOOT_KIND_CASES } from './components/boot/bootRoute';

/**
 * index.html menampilkan skeleton SEBELUM JS selesai diunduh — tahap terlama di
 * ponsel. Ia tidak bisa mengimpor apa pun, jadi penentu rute & teksnya adalah
 * salinan KEMBAR dari src/components/boot/bootRoute.ts. Tes ini menjaga salinan
 * itu tetap sama: tanpa tes ini, salah satu berubah dan pengguna melihat
 * skeleton A lalu tiba-tiba skeleton B (atau loader generik) saat React jalan.
 */
const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

const bootScript = (() => {
    const m = head.match(/<script>\s*([\s\S]*?data-boot[\s\S]*?)<\/script>/);
    if (!m) throw new Error('skrip penentu rute tidak ada di <head>');
    return m[1];
})();

function runBootScript(pathname: string, hostname: string, search: string, saved: string | null) {
    const attrs: Record<string, string> = {};
    const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    const location = { pathname, hostname, search };
    const localStorage = { getItem: () => saved };
    new Function('document', 'location', 'localStorage', 'URLSearchParams', bootScript)(
        document, location, localStorage, URLSearchParams,
    );
    return attrs;
}

describe('index.html — skeleton boot', () => {
    it('skrip penentu rute ada di <head>, sebelum stylesheet apa pun', () => {
        const scriptAt = head.indexOf('data-boot');
        const firstStylesheet = head.search(/<link[^>]+rel="stylesheet"/);
        expect(scriptAt).toBeGreaterThan(-1);
        if (firstStylesheet !== -1) expect(scriptAt).toBeLessThan(firstStylesheet);
    });

    it('CSS loader ada di <head> (isi #root diganti React; style di dalamnya ikut hilang)', () => {
        expect(head).toContain('.jfu-initial-loader');
        const root = html.slice(html.indexOf('<div id="root">'));
        expect(root).not.toContain('<style');
    });

    it.each(BOOT_KIND_CASES)('penentu inline sama dengan React: $host $path $search → $kind', ({ path: p, host, search, kind }) => {
        expect(runBootScript(p, host, search, null)['data-boot']).toBe(kind);
    });

    it('bahasa dibaca dari localStorage jakpat-language, bawaan id', () => {
        expect(runBootScript('/pages', 'jakpatforuniv.com', '', 'en')['data-boot-lang']).toBe('en');
        expect(runBootScript('/pages', 'jakpatforuniv.com', '', null)['data-boot-lang']).toBe('id');
        expect(runBootScript('/pages', 'jakpatforuniv.com', '', 'xx')['data-boot-lang']).toBe('id');
    });

    it('localStorage yang melempar tidak menggagalkan skrip', () => {
        const attrs: Record<string, string> = {};
        const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
        const localStorage = { getItem: () => { throw new Error('SecurityError'); } };
        expect(() => new Function('document', 'location', 'localStorage', 'URLSearchParams', bootScript)(
            document, { pathname: '/pages', hostname: 'jakpatforuniv.com', search: '' }, localStorage, URLSearchParams,
        )).not.toThrow();
        expect(attrs['data-boot']).toBe('pages');
        expect(attrs['data-boot-lang']).toBe('id');
    });

    it.each(['id', 'en'] as const)('teks skeleton statis = teks React (%s)', (lang) => {
        const c = BOOT_COPY[lang];
        // loadingList = isi sr-only di dalam role="status" (aria-label tak bisa dwibahasa).
        for (const text of [c.heading, c.subtitle, c.loadingSurvey, c.loadingList]) {
            expect(html).toContain(`>${text}<`);
        }
    });

    it('memuat ketiga blok boot di dalam #root', () => {
        const root = html.slice(html.indexOf('<div id="root">'));
        expect(root).toContain('jfu-boot-generic');
        expect(root).toContain('data-boot-skeleton="pages"');
        expect(root).toContain('data-boot-skeleton="survey"');
    });

    it('subjudul loader generik: "workspace" hanya untuk area peneliti', () => {
        expect(runBootScript('/dashboard', 'jakpatforuniv.com', '', null)['data-boot-generic']).toBe('workspace');
        expect(runBootScript('/login', 'jakpatforuniv.com', '', null)['data-boot-generic']).toBe('workspace');
        expect(runBootScript('/f/abc', 'jakpatforuniv.com', '', null)['data-boot-generic']).toBe('page');
    });

    it('Google Fonts tidak render-blocking', () => {
        expect(head).not.toMatch(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+rel="stylesheet"/);
        expect(head).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+fonts\.googleapis\.com\/css2/);
    });
});
