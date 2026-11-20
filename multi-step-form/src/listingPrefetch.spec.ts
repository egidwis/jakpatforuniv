import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildListingQuery, LISTING_END_GRACE_MS } from './pages/public/SurveyListingPage';
import { takeListingPrefetch, LISTING_PREFETCH_MAX_AGE_MS } from './utils/listingPrefetch';

/**
 * Fase 3 (20 Nov 2026): data /pages diminta SEJAK HTML. Di 4G lambat kueri
 * survey_pages baru jalan ±2,5 s — setelah JS utama diunduh & dijalankan.
 * Skrip inline #jfu-listing-prefetch tidak bisa mengimpor apa pun, jadi URL-nya
 * adalah salinan KEMBAR dari buildListingQuery (supabase-js). Tes ini menjalankan
 * keduanya pada jam yang sama dan menuntut URL yang IDENTIK: kolom yang beda
 * (mis. kolom tanpa hibah anon) atau filter yang beda tidak bisa lolos diam-diam.
 */
const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

const TEST_URL = 'https://abcd1234.supabase.co';
const TEST_KEY = 'eyJ0ZXN0Ijoi.YW5vbiJ9.dGVzdA';
const AUTH_KEY = 'sb-abcd1234-auth-token';
const NOW = Date.parse('2026-11-20T08:00:00.000Z');

const rawScript = (() => {
    const m = head.match(/<script id="jfu-listing-prefetch">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('skrip #jfu-listing-prefetch tidak ada di <head>');
    return m[1];
})();

const fill = (script: string, url: string, key: string) =>
    script.split('%VITE_SUPABASE_URL%').join(url).split('%VITE_SUPABASE_ANON_KEY%').join(key);

type Call = { url: string; headers: Headers };
type Slot = { at: number; rows: Promise<unknown> };

const jsonResponse = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } });

class FixedDate extends Date {
    static now() {
        return NOW;
    }
}

function runPrefetch(opts: {
    kind?: string;
    session?: boolean;
    url?: string;
    key?: string;
    unfilled?: boolean;
    storageThrows?: boolean;
    fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
} = {}) {
    const calls: Call[] = [];
    const win: { __jfuListing?: Slot } = {};
    const document = { documentElement: { getAttribute: (k: string) => (k === 'data-boot' ? opts.kind ?? 'pages' : null) } };
    const localStorage = {
        getItem: (k: string) => {
            if (opts.storageThrows) throw new Error('SecurityError');
            return k === AUTH_KEY && opts.session ? JSON.stringify({ access_token: 'a', refresh_token: 'r' }) : null;
        },
    };
    const fetch = (input: string, init?: RequestInit) => {
        calls.push({ url: String(input), headers: new Headers(init?.headers) });
        return opts.fetchImpl ? opts.fetchImpl(input, init) : Promise.resolve(jsonResponse('[{"id":"p1"}]'));
    };
    const script = opts.unfilled ? rawScript : fill(rawScript, opts.url ?? TEST_URL, opts.key ?? TEST_KEY);
    new Function('document', 'localStorage', 'fetch', 'window', 'Date', 'URL', script)(
        document, localStorage, fetch, win, FixedDate, URL,
    );
    return { calls, win };
}

/** URL & header yang BENAR-BENAR dikirim supabase-js untuk kueri /pages. */
async function supabaseJsRequest(url = TEST_URL): Promise<Call> {
    const calls: Call[] = [];
    const client = createClient(url, TEST_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
                calls.push({ url: input instanceof Request ? input.url : String(input), headers: new Headers(init?.headers) });
                return Promise.resolve(jsonResponse('[]'));
            },
        },
    });
    await buildListingQuery(client, new Date(NOW));
    expect(calls).toHaveLength(1);
    return calls[0];
}

describe('index.html — prefetch data /pages sejak HTML', () => {
    it('skrip prefetch ada SETELAH penentu boot (butuh data-boot) dan sebelum stylesheet', () => {
        const bootAt = head.indexOf("d.setAttribute('data-boot', kind)");
        const prefetchAt = head.indexOf('<script id="jfu-listing-prefetch">');
        expect(bootAt).toBeGreaterThan(-1);
        expect(prefetchAt).toBeGreaterThan(bootAt);
        const firstStylesheet = head.search(/<link[^>]+rel="stylesheet"/);
        if (firstStylesheet !== -1) expect(prefetchAt).toBeLessThan(firstStylesheet);
    });

    it('pengunjung tanpa sesi di /pages: URL & header IDENTIK dengan supabase-js', async () => {
        const { calls } = runPrefetch();
        const expected = await supabaseJsRequest();
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(expected.url);
        expect(calls[0].headers.get('apikey')).toBe(expected.headers.get('apikey'));
        expect(calls[0].headers.get('authorization')).toBe(expected.headers.get('authorization'));
    });

    it('URL env bergaris miring akhir tetap identik', async () => {
        const { calls } = runPrefetch({ url: TEST_URL + '/' });
        expect(calls[0].url).toBe((await supabaseJsRequest(TEST_URL + '/')).url);
    });

    it('cutoff = jam boot − LISTING_END_GRACE_MS (superset dari filter browser)', () => {
        const { calls } = runPrefetch();
        const or = new URL(calls[0].url).searchParams.get('or');
        expect(or).toBe(`(publish_end_date.is.null,publish_end_date.gte.${new Date(NOW - LISTING_END_GRACE_MS).toISOString()})`);
    });

    it('slot window.__jfuListing berisi jam boot & Promise baris JSON', async () => {
        const { win } = runPrefetch();
        expect(win.__jfuListing?.at).toBe(NOW);
        await expect(win.__jfuListing?.rows).resolves.toEqual([{ id: 'p1' }]);
    });

    it.each(['app', 'survey', 'login', ''])('kind "%s" → tanpa prefetch', (kind) => {
        const { calls, win } = runPrefetch({ kind });
        expect(calls).toHaveLength(0);
        expect(win.__jfuListing).toBeUndefined();
    });

    it('ada sesi tersimpan → tanpa prefetch (kueri biasa ber-JWT lewat supabase-js)', () => {
        const { calls, win } = runPrefetch({ session: true });
        expect(calls).toHaveLength(0);
        expect(win.__jfuListing).toBeUndefined();
    });

    it('placeholder env belum diganti (build tanpa env) → tanpa prefetch', () => {
        expect(runPrefetch({ unfilled: true }).calls).toHaveLength(0);
        expect(runPrefetch({ key: '' }).calls).toHaveLength(0);
    });

    it('localStorage melempar → tidak crash; dianggap tanpa sesi (sama dengan hasStoredSession)', () => {
        const { calls } = runPrefetch({ storageThrows: true });
        expect(calls).toHaveLength(1);
    });

    it('fetch melempar sinkron → tidak crash, tanpa slot', () => {
        const { win } = runPrefetch({ fetchImpl: () => { throw new Error('boom'); } });
        expect(win.__jfuListing).toBeUndefined();
    });

    it('respons bukan 2xx → rows menolak (SurveyListingPage jatuh ke kueri biasa)', async () => {
        const { win } = runPrefetch({ fetchImpl: () => Promise.resolve(jsonResponse('{"message":"x"}', 401)) });
        await expect(win.__jfuListing?.rows).rejects.toThrow('401');
    });
});

describe('takeListingPrefetch — sekali pakai, maksimal 30 s', () => {
    const slot = (at: number, rows: unknown = Promise.resolve([])) => ({ __jfuListing: { at, rows } as unknown as Slot });

    it('segar → Promise yang sama, slot dihapus', () => {
        const rows = Promise.resolve([{ id: 'x' }]);
        const host = slot(NOW - 1000, rows);
        expect(takeListingPrefetch(host, NOW)).toBe(rows);
        expect(host.__jfuListing).toBeUndefined();
    });

    it('lewat 30 s → null, slot tetap dihapus', () => {
        const host = slot(NOW - LISTING_PREFETCH_MAX_AGE_MS - 1);
        expect(takeListingPrefetch(host, NOW)).toBeNull();
        expect(host.__jfuListing).toBeUndefined();
    });

    it('tepat 30 s masih dipakai', () => {
        expect(takeListingPrefetch(slot(NOW - LISTING_PREFETCH_MAX_AGE_MS), NOW)).not.toBeNull();
    });

    it('diambil kedua kali → null ("Coba lagi" = kueri segar)', () => {
        const host = slot(NOW);
        expect(takeListingPrefetch(host, NOW)).not.toBeNull();
        expect(takeListingPrefetch(host, NOW)).toBeNull();
    });

    it('tidak ada / rusak / jam mundur → null', () => {
        expect(takeListingPrefetch({}, NOW)).toBeNull();
        expect(takeListingPrefetch(undefined, NOW)).toBeNull();
        expect(takeListingPrefetch(slot(NOW, 'bukan promise'), NOW)).toBeNull();
        expect(takeListingPrefetch({ __jfuListing: { at: 'x', rows: Promise.resolve([]) } as unknown as Slot }, NOW)).toBeNull();
        expect(takeListingPrefetch(slot(NOW + 5000), NOW)).toBeNull();
    });
});

describe('SurveyListingPage memakai prefetch, lalu kueri biasa', () => {
    const src = readFileSync(path.resolve(__dirname, 'pages/public/SurveyListingPage.tsx'), 'utf8');
    const loadPages = src.slice(src.indexOf('const loadPages'), src.indexOf('const loadPages') + 3000);

    it('takeListingPrefetch dipanggil sebelum buildListingQuery, hasilnya wajib array', () => {
        const take = loadPages.indexOf('takeListingPrefetch()');
        const query = loadPages.indexOf('buildListingQuery(supabase, now)');
        expect(take).toBeGreaterThan(-1);
        expect(query).toBeGreaterThan(take);
        expect(loadPages).toContain('Array.isArray(');
    });
});
