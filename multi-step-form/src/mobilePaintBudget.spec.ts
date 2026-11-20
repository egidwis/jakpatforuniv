import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ⚠️ ANGGARAN LUKIS PONSEL. 19–20 Nov 2026: Safari iPhone menampilkan PUTIH POLOS
 * (#FFFFFF, tanpa progress, tanpa watchdog) di halaman login jalur "Beli tiket".
 * Log: React jalan, pengunjung belum login. Tersangka: "aura" = lingkaran 550–950 px
 * ber-`filter: blur(90–110px)` + `transform-gpu` — tiap lingkaran butuh buffer
 * ±45–60 MB di layar 3× (login ±158 MB, /pages ±275 MB). Chrome desktop tak
 * terpengaruh, jadi tak ada tes lain yang menangkapnya.
 *
 * Aura kini SATU elemen ber-radial-gradient (AmbientBackdrop): tampak sama, tanpa
 * buffer blur. Berkas di bawah adalah halaman yang dibuka di ponsel; jangan
 * kembalikan blur besar ke sana. Efek kaca kecil (navbar, kartu) di luar cakupan.
 * 20 Nov: InvoicePage (4 lingkaran blur 90–95 px) & AnalyzerListPage (blur-3xl) ikut.
 */
const src = path.resolve(__dirname);
// Yang diperiksa KODE, bukan komentar (komentar boleh menyebut blur sebagai larangan).
const stripComments = (code: string) =>
    code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (rel: string) => stripComments(readFileSync(path.join(src, rel), 'utf8'));

const MOBILE_SHELLS = [
    'pages/LoginPage.tsx',
    'components/DashboardLayout.tsx',
    'pages/public/SurveyListingPage.tsx',
    'pages/InvoicePage.tsx',
    'pages/dashboard/AnalyzerListPage.tsx',
    'components/AmbientBackdrop.tsx',
    'components/AmbientBackdrop.css',
];

/** Blur ≥ 40 px dalam bentuk apa pun: style inline, CSS, atau kelas Tailwind. */
function largeBlurs(code: string): string[] {
    const hits: string[] = [];
    for (const m of code.matchAll(/blur\(\s*(\d+(?:\.\d+)?)px\s*\)/g)) if (Number(m[1]) >= 40) hits.push(m[0]);
    for (const m of code.matchAll(/\bblur-\[(\d+)px\]/g)) if (Number(m[1]) >= 40) hits.push(m[0]);
    for (const m of code.matchAll(/\bblur-3xl\b/g)) hits.push(m[0]);
    return hits;
}

describe('halaman ponsel tanpa blur besar', () => {
    it.each(MOBILE_SHELLS)('%s: tanpa blur ≥ 40 px dan tanpa transform-gpu', (rel) => {
        const code = read(rel);
        expect(largeBlurs(code)).toEqual([]);
        expect(code).not.toMatch(/\btransform-gpu\b/);
    });

    it.each([
        ['pages/LoginPage.tsx', 'login'],
        ['components/DashboardLayout.tsx', 'dashboard'],
        ['pages/public/SurveyListingPage.tsx', 'pages'],
        ['pages/InvoicePage.tsx', 'invoice'],
    ])('%s memakai <AmbientBackdrop variant="%s" />', (rel, variant) => {
        expect(read(rel)).toContain(`<AmbientBackdrop variant="${variant}" />`);
    });

    it('kartu login tanpa backdrop-blur (bg-white/95 = hampir buram, blur tak terlihat)', () => {
        const code = read('pages/LoginPage.tsx');
        expect(code).not.toMatch(/\bbackdrop-blur(-[a-z0-9]+)?\b/);
    });

    it('AmbientBackdrop.css: empat varian, hanya radial-gradient, tanpa filter apa pun', () => {
        const css = read('components/AmbientBackdrop.css');
        for (const v of ['login', 'dashboard', 'pages', 'invoice']) expect(css).toContain(`.jfu-aura--${v}`);
        expect(css).toContain('radial-gradient(');
        expect(css).not.toMatch(/(^|[^-])filter\s*:/m);
        expect(css).not.toMatch(/backdrop-filter|will-change/);
    });

    it('aura tidak ikut tercetak (invoice dicetak/di-PDF-kan)', () => {
        expect(read('components/AmbientBackdrop.css')).toMatch(/@media print\s*\{\s*\.jfu-aura\s*\{\s*display:\s*none/);
    });
});
