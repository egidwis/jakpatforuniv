import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BOOT_COPY, BOOT_KIND_CASES, BOOT_LOGIN_COPY, BOOT_LOGIN_WEBINAR_SUBTITLE } from './components/boot/bootRoute';
import { translations } from './i18n/translations';

/**
 * index.html menampilkan skeleton SEBELUM JS selesai diunduh — tahap terlama di
 * ponsel. Ia tidak bisa mengimpor apa pun, jadi penentu rute & teksnya adalah
 * salinan KEMBAR dari src/components/boot/bootRoute.ts. Tes ini menjaga salinan
 * itu tetap sama: tanpa tes ini, salah satu berubah dan pengguna melihat
 * skeleton A lalu tiba-tiba skeleton B (atau loader generik) saat React jalan.
 */
const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

// Vite mengganti %VITE_SUPABASE_URL% saat build; di tes diisi URL tiruan.
const TEST_SUPABASE_URL = 'https://abcd1234.supabase.co';
const TEST_AUTH_KEY = 'sb-abcd1234-auth-token';
const bootScript = (() => {
    const m = head.match(/<script>\s*([\s\S]*?data-boot[\s\S]*?)<\/script>/);
    if (!m) throw new Error('skrip penentu rute tidak ada di <head>');
    return m[1].split('%VITE_SUPABASE_URL%').join(TEST_SUPABASE_URL);
})();

function runBootScript(pathname: string, hostname: string, search: string, saved: string | null, opts: { hash?: string; signedIn?: boolean } = {}) {
    const attrs: Record<string, string> = {};
    const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    const location = { pathname, hostname, search, hash: opts.hash ?? '' };
    const localStorage = {
        getItem: (k: string) => {
            if (k === 'jakpat-language') return saved;
            if (k === TEST_AUTH_KEY && opts.signedIn) return JSON.stringify({ access_token: 'a', refresh_token: 'r' });
            return null;
        },
    };
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

    it.each(BOOT_KIND_CASES)('penentu inline sama dengan React: $host $path $search $hash sesi=$signedIn → $kind', ({ path: p, host, search, hash, signedIn, kind }) => {
        expect(runBootScript(p, host, search, null, { hash, signedIn })['data-boot']).toBe(kind);
    });

    it('kunci sesi di skrip inline = bawaan supabase-js (dibentuk dari %VITE_SUPABASE_URL%)', () => {
        expect(head).toContain("'%VITE_SUPABASE_URL%'");
        // Sesi rusak (tanpa refresh_token) = belum login.
        const attrs: Record<string, string> = {};
        new Function('document', 'location', 'localStorage', 'URLSearchParams', bootScript)(
            { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } },
            { pathname: '/dashboard', hostname: 'jakpatforuniv.com', search: '', hash: '' },
            { getItem: (k: string) => (k === TEST_AUTH_KEY ? '{"access_token":"a"}' : null) },
            URLSearchParams,
        );
        expect(attrs['data-boot']).toBe('login');
    });

    it.each(['id', 'en'] as const)('teks skeleton login = translations.ts (%s) dan ada di index.html', (lang) => {
        const c = BOOT_LOGIN_COPY[lang];
        const t = translations[lang];
        expect(c).toEqual({
            heading: t.authWelcomeBack, subtitle: t.authLoginSubtitle, tabLogin: t.authTabLogin, tabSignup: t.authTabSignup,
            google: t.authLoginWithGoogle, orEmail: t.authOrWithEmail, email: t.authEmail, password: t.authPassword, submit: t.authSubmitLogin,
        });
        const block = html.slice(html.indexOf('data-boot-skeleton="login"'));
        for (const text of Object.values(c)) expect(block).toContain(`>${text}<`);
    });

    it('jalur Beli tiket → subjudul webinar (sama dengan LoginPage), selain itu tidak', () => {
        expect(runBootScript('/dashboard/webinar/beli/kelas-a', 'jakpatforuniv.com', '', null)['data-boot-login']).toBe('webinar');
        expect(runBootScript('/login', 'jakpatforuniv.com', '', null)['data-boot-login']).toBe('default');
        const block = html.slice(html.indexOf('data-boot-skeleton="login"'));
        expect(block).toContain(`>${BOOT_LOGIN_WEBINAR_SUBTITLE}<`);
        expect(head).toMatch(/\[data-boot-login="webinar"\] \.jfu-login-webinar/);
        const loginPage = readFileSync(path.resolve(__dirname, 'pages/LoginPage.tsx'), 'utf8');
        expect(loginPage).toContain('BOOT_LOGIN_WEBINAR_SUBTITLE');
        expect(loginPage).not.toContain("'Masuk atau daftar untuk melanjutkan pembelian tiket webinar'");
    });

    it('footer skeleton login meniru footer LoginPage (tinggi sama → kartu tak melompat)', () => {
        const start = html.indexOf('data-boot-skeleton="login"');
        const block = html.slice(start, html.indexOf('jfu-boot-pages', start));
        expect(block).toContain('<footer class="relative z-10 w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 pb-2 text-xs text-slate-400 border-t border-slate-200/60">');
        expect(block).toContain('All rights reserved.');
    });

    it('skeleton login tanpa elemen interaktif (bukan form palsu yang bisa diketik)', () => {
        const start = html.indexOf('data-boot-skeleton="login"');
        const end = html.indexOf('jfu-boot-pages', start);
        const block = html.slice(start, end);
        expect(block.length).toBeGreaterThan(200);
        expect(block).not.toMatch(/<(button|input|a|form)\b/);
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
        expect(root).toContain('data-boot-skeleton="login"');
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

/*
 * Watchdog boot (layar putih tanpa jejak, Safari iPhone 19 Nov 2026). Skrip
 * inline terpisah di <head>: jalan walau CSS/JS utama macet. Dihitung sejak
 * HTML diurai — BUKAN DOMContentLoaded, yang ikut menunggu skrip modul utama
 * (justru yang dicurigai macet).
 */
const watchdogScript = (() => {
    const m = head.match(/<script id="jfu-boot-watchdog">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('skrip watchdog tidak ada di <head>');
    return m[1];
})();

function runWatchdog() {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const listeners: Record<string, (e: { persisted?: boolean }) => void> = {};
    const beacons: Array<Record<string, unknown>> = [];
    const stuck = { style: { display: 'none' } };
    const win: Record<string, unknown> = {
        addEventListener: (type: string, fn: (e: { persisted?: boolean }) => void) => { listeners[type] = fn; },
    };
    const location = { pathname: '/login', reload: vi.fn() };
    const navigator = {
        userAgent: 'UA',
        sendBeacon: (_url: string, blob: { s: string }) => { beacons.push(JSON.parse(blob.s)); return true; },
    };
    const performance = {
        now: () => 12000,
        getEntriesByType: (t: string) =>
            t === 'navigation' ? [{ nextHopProtocol: 'h3' }] : [{ name: 'https://x/assets/js/index-A.js', duration: 900 }],
    };
    const document = {
        readyState: 'interactive',
        getElementById: (id: string) => (id === 'jfu-boot-stuck' ? stuck : null),
        querySelectorAll: () => [{ src: 'https://x/assets/js/index-A.js' }, { href: 'https://x/assets/css/index-B.css' }],
    };
    class FakeBlob { s: string; constructor(parts: string[]) { this.s = parts.join(''); } }
    new Function('window', 'document', 'location', 'navigator', 'performance', 'setTimeout', 'Blob', 'fetch', watchdogScript)(
        win, document, location, navigator, performance,
        (fn: () => void, ms: number) => { timers.push({ fn, ms }); return 1; },
        FakeBlob, () => Promise.resolve(),
    );
    return { win, timers, listeners, beacons, stuck, location };
}

describe('index.html — watchdog boot', () => {
    it('ada di <head> SEBELUM stylesheet apa pun', () => {
        const at = head.indexOf('id="jfu-boot-watchdog"');
        const firstStylesheet = head.search(/<link[^>]+rel="stylesheet"/);
        expect(at).toBeGreaterThan(-1);
        if (firstStylesheet !== -1) expect(at).toBeLessThan(firstStylesheet);
    });

    it('elemen "Muat ulang" ada di dalam #root (hilang otomatis saat React render), tersembunyi, gaya inline', () => {
        const root = html.slice(html.indexOf('<div id="root">'));
        expect(root).toMatch(/<div id="jfu-boot-stuck"[^>]*style="display:none/);
        expect(root).toContain('location.reload()');
    });

    it('12 s tanpa mount → laporan boot-watchdog (dengan protokol & aset yang belum selesai) + tampilkan Muat ulang', () => {
        const w = runWatchdog();
        expect((w.win.__jfuBoot as { mounted: boolean }).mounted).toBe(false);
        expect(w.timers.map((t) => t.ms)).toEqual([12000]);
        w.timers[0].fn();
        expect(w.beacons).toHaveLength(1);
        expect(w.beacons[0]).toMatchObject({ kind: 'boot-watchdog', path: '/login', proto: 'h3', stage: 'interactive' });
        expect(String(w.beacons[0].detail)).toContain('pending=index-B.css');
        expect(String(w.beacons[0].detail)).not.toContain('pending=index-A.js');
        expect(w.stuck.style.display).toBe('flex');
    });

    it('sudah ter-mount → diam', () => {
        const w = runWatchdog();
        (w.win.__jfuBoot as { mounted: boolean }).mounted = true;
        w.timers[0].fn();
        expect(w.beacons).toHaveLength(0);
        expect(w.stuck.style.display).toBe('none');
    });

    it('dipulihkan dari bfcache sebelum React jalan → lapor + reload; selain itu diam', () => {
        const w = runWatchdog();
        w.listeners.pageshow({ persisted: false });
        expect(w.location.reload).not.toHaveBeenCalled();
        w.listeners.pageshow({ persisted: true });
        expect(w.location.reload).toHaveBeenCalledTimes(1);
        expect(w.beacons[0]).toMatchObject({ kind: 'bfcache-unmounted', persisted: true });

        const m = runWatchdog();
        (m.win.__jfuBoot as { mounted: boolean }).mounted = true;
        m.listeners.pageshow({ persisted: true });
        expect(m.location.reload).not.toHaveBeenCalled();
    });
});
