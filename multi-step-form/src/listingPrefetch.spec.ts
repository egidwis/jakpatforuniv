import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
    batchRewardsQuery,
    buildListingQuery,
    LISTING_END_GRACE_MS,
    rewardsFromBatchRows,
} from './pages/public/SurveyListingPage';
import { takeListingPrefetch, LISTING_PREFETCH_MAX_AGE_MS } from './utils/listingPrefetch';

/**
 * Fase 3 (20 Nov 2026): data /pages diminta SEJAK HTML. Di 4G lambat kueri
 * survey_pages baru jalan ±2,5 s — setelah JS utama diunduh & dijalankan — dan
 * kartu menunggu RPC hadiah sesudahnya (loading baru false setelah RPC).
 * Skrip inline #jfu-listing-prefetch tidak bisa mengimpor apa pun, jadi kedua
 * permintaannya adalah salinan KEMBAR dari buildListingQuery & batchRewardsQuery
 * (supabase-js). Tes ini menjalankan keduanya dan menuntut permintaan IDENTIK:
 * kolom yang beda (mis. tanpa hibah anon) atau filter yang beda tak bisa lolos.
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

type Call = { url: string; method: string; body: string | null; headers: Headers };
type Slot = { at: number; rows: Promise<unknown>; rewards: Promise<unknown> };

const jsonResponse = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } });

const record = (calls: Call[], input: RequestInfo | URL, init?: RequestInit) =>
    calls.push({
        url: input instanceof Request ? input.url : String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : null,
        headers: new Headers(init?.headers),
    });

class FixedDate extends Date {
    static now() {
        return NOW;
    }
}

const ROWS_WITH_SUBMISSIONS = JSON.stringify([
    { id: 'p1', submission_id: 's1' },
    { id: 'p2', submission_id: null },
    { id: 'p3', submission_id: 's1' },
    { id: 'p4', submission_id: 's2' },
]);

function runPrefetch(opts: {
    kind?: string;
    session?: boolean;
    url?: string;
    key?: string;
    unfilled?: boolean;
    storageThrows?: boolean;
    rowsBody?: string;
    rowsStatus?: number;
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
        record(calls, input, init);
        if (opts.fetchImpl) return opts.fetchImpl(input, init);
        if (input.includes('/rpc/')) return Promise.resolve(jsonResponse('[{"submission_id":"s1","prize_per_winner":5}]'));
        return Promise.resolve(jsonResponse(opts.rowsBody ?? '[{"id":"p1"}]', opts.rowsStatus ?? 200));
    };
    const script = opts.unfilled ? rawScript : fill(rawScript, opts.url ?? TEST_URL, opts.key ?? TEST_KEY);
    new Function('document', 'localStorage', 'fetch', 'window', 'Date', 'URL', script)(
        document, localStorage, fetch, win, FixedDate, URL,
    );
    return { calls, win };
}

/** Klien supabase-js ASLI yang hanya merekam permintaannya. */
function recordingClient(url = TEST_URL) {
    const calls: Call[] = [];
    const client = createClient(url, TEST_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
                record(calls, input, init);
                return Promise.resolve(jsonResponse('[]'));
            },
        },
    });
    return { client, calls };
}

async function supabaseJsListing(url = TEST_URL): Promise<Call> {
    const { client, calls } = recordingClient(url);
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
        const expected = await supabaseJsListing();
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(expected.url);
        expect(calls[0].method).toBe(expected.method);
        expect(calls[0].headers.get('apikey')).toBe(expected.headers.get('apikey'));
        expect(calls[0].headers.get('authorization')).toBe(expected.headers.get('authorization'));
    });

    it('URL env bergaris miring akhir tetap identik', async () => {
        const { calls } = runPrefetch({ url: TEST_URL + '/' });
        expect(calls[0].url).toBe((await supabaseJsListing(TEST_URL + '/')).url);
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

    it('hadiah: RPC berantai setelah baris, IDENTIK dengan batchRewardsQuery (id unik, urutan baris)', async () => {
        const { calls, win } = runPrefetch({ rowsBody: ROWS_WITH_SUBMISSIONS });
        await expect(win.__jfuListing?.rewards).resolves.toEqual([{ submission_id: 's1', prize_per_winner: 5 }]);
        expect(calls).toHaveLength(2);

        const { client, calls: sj } = recordingClient();
        await batchRewardsQuery(client, ['s1', 's2']);
        expect(sj).toHaveLength(1);
        expect(calls[1].url).toBe(sj[0].url);
        expect(calls[1].method).toBe('POST');
        expect(calls[1].method).toBe(sj[0].method);
        expect(JSON.parse(calls[1].body ?? 'null')).toEqual(JSON.parse(sj[0].body ?? 'null'));
        for (const h of ['apikey', 'authorization', 'content-type']) {
            expect(calls[1].headers.get(h), h).toBe(sj[0].headers.get(h));
        }
    });

    it('tanpa submission_id → tanpa RPC, rewards = null', async () => {
        const { calls, win } = runPrefetch({ rowsBody: '[{"id":"p1","submission_id":null},{"id":"p2"}]' });
        await expect(win.__jfuListing?.rewards).resolves.toBeNull();
        expect(calls).toHaveLength(1);
    });

    it('lebih dari 200 id unik → tanpa RPC (klien memecahnya per 200), rewards = null', async () => {
        const many = JSON.stringify(Array.from({ length: 201 }, (_, i) => ({ id: `p${i}`, submission_id: `s${i}` })));
        const { calls, win } = runPrefetch({ rowsBody: many });
        await expect(win.__jfuListing?.rewards).resolves.toBeNull();
        expect(calls).toHaveLength(1);
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

    it('respons bukan 2xx → rows DAN rewards menolak (SurveyListingPage jatuh ke kueri biasa)', async () => {
        const { calls, win } = runPrefetch({ rowsBody: '{"message":"x"}', rowsStatus: 401 });
        await expect(win.__jfuListing?.rows).rejects.toThrow('401');
        await expect(win.__jfuListing?.rewards).rejects.toThrow('401');
        expect(calls).toHaveLength(1);
    });
});

describe('takeListingPrefetch — sekali pakai, maksimal 30 s', () => {
    const slot = (at: number, rows: unknown = Promise.resolve([]), rewards: unknown = Promise.resolve(null)) =>
        ({ __jfuListing: { at, rows, rewards } as unknown as Slot });

    it('segar → { rows, rewards } yang sama, slot dihapus', () => {
        const rows = Promise.resolve([{ id: 'x' }]);
        const rewards = Promise.resolve([]);
        const host = slot(NOW - 1000, rows, rewards);
        const got = takeListingPrefetch(host, NOW);
        expect(got?.rows).toBe(rows);
        expect(got?.rewards).toBe(rewards);
        expect(host.__jfuListing).toBeUndefined();
    });

    it('rewards tidak ada / bukan Promise → rewards null (klien memanggil RPC sendiri)', () => {
        const noRewards = { __jfuListing: { at: NOW, rows: Promise.resolve([]) } as unknown as Slot };
        expect(takeListingPrefetch(noRewards, NOW)?.rewards).toBeNull();
        expect(takeListingPrefetch(slot(NOW, Promise.resolve([]), 'x'), NOW)?.rewards).toBeNull();
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

describe('rewardsFromBatchRows — aturan pilih batch sama dengan sebelumnya', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    it('per submission: batch berjalan yang paling cepat berakhir; hanya id yang diminta', () => {
        const rows = [
            { submission_id: 's1', period_batch: '2026-11', prize_per_winner: 10, winner_count: 2, end_date: later },
            { submission_id: 's1', period_batch: '2026-12', prize_per_winner: 20, winner_count: 3, end_date: future },
            { submission_id: 's2', period_batch: '2026-10', prize_per_winner: 7, winner_count: 1, end_date: past },
            { submission_id: 's2', period_batch: '2026-09', prize_per_winner: 6, winner_count: 1, end_date: past },
            { submission_id: 's3', period_batch: '2026-11', prize_per_winner: 99, winner_count: 9, end_date: future },
            { period_batch: '2026-11', prize_per_winner: 1, winner_count: 1, end_date: future },
        ];
        expect(rewardsFromBatchRows(rows, new Set(['s1', 's2']))).toEqual({
            s1: { prize_per_winner: 20, winner_count: 3 },
            s2: { prize_per_winner: 7, winner_count: 1 },
        });
    });
});

describe('SurveyListingPage memakai prefetch, lalu kueri biasa', () => {
    const src = readFileSync(path.resolve(__dirname, 'pages/public/SurveyListingPage.tsx'), 'utf8');
    const loadPages = src.slice(src.indexOf('const loadPages'), src.indexOf('const loadPages') + 5000);

    it('takeListingPrefetch dipanggil sebelum buildListingQuery, hasilnya wajib array', () => {
        const take = loadPages.indexOf('takeListingPrefetch()');
        const query = loadPages.indexOf('buildListingQuery(supabase, now)');
        expect(take).toBeGreaterThan(-1);
        expect(query).toBeGreaterThan(take);
        expect(loadPages).toContain('Array.isArray(');
    });

    it('hadiah prefetch dipakai sebelum RPC biasa; RPC biasa lewat batchRewardsQuery', () => {
        const pre = loadPages.indexOf('await prefetchedRewards');
        const rpc = loadPages.indexOf('batchRewardsQuery(supabase, chunk)');
        expect(pre).toBeGreaterThan(-1);
        expect(rpc).toBeGreaterThan(pre);
        expect(loadPages).not.toContain("supabase.rpc(");
    });
});
