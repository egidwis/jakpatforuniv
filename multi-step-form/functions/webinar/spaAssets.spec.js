import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spaAssetUrls, injectSpaPrefetch, withSpaPrefetch, __resetSpaAssetsMemo } from './_spa-assets.js';

/*
  /webinar → "Beli tiket" membuka SPA (/dashboard/webinar/beli/…). Halaman
  webinar memberi <link rel="prefetch"> untuk JS & CSS utama SPA supaya saat
  tombol diketuk, ±285 KB itu sudah di cache. HANYA di halaman bertombol beli.
*/

const SPA_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/js/index-AbC123.js"></script>
<link rel="stylesheet" crossorigin href="/assets/css/index-XyZ789.css">
</head><body><div id="root"></div></body></html>`;

const assetsEnv = (body = SPA_HTML, status = 200) => {
  const fetch = vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'text/html' } }));
  return { env: { ASSETS: { fetch } }, fetch };
};

const BUY = '<a class="btn" href="https://jakpatforuniv.com/dashboard/webinar/beli/kelas-a">Beli tiket</a>';
const pageHtml = (body) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;

beforeEach(() => __resetSpaAssetsMemo());

describe('spaAssetUrls', () => {
  it('membaca entry JS & CSS dari index.html SPA lewat ASSETS (dimemo per isolate)', async () => {
    const { env, fetch } = assetsEnv();
    expect(await spaAssetUrls(env, 'https://jakpatforuniv.com')).toEqual(['/assets/js/index-AbC123.js', '/assets/css/index-XyZ789.css']);
    await spaAssetUrls(env, 'https://jakpatforuniv.com');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0].url ?? fetch.mock.calls[0][0])).toBe('https://jakpatforuniv.com/');
  });

  it('ASSETS gagal / bukan 200 / tanpa ASSETS → [] (halaman tetap utuh)', async () => {
    expect(await spaAssetUrls(assetsEnv('x', 404).env, 'https://a')).toEqual([]);
    __resetSpaAssetsMemo();
    expect(await spaAssetUrls({ ASSETS: { fetch: async () => { throw new Error('boom'); } } }, 'https://a')).toEqual([]);
    __resetSpaAssetsMemo();
    expect(await spaAssetUrls({}, 'https://a')).toEqual([]);
  });
});

describe('injectSpaPrefetch', () => {
  const urls = ['/assets/js/index-AbC123.js', '/assets/css/index-XyZ789.css'];

  it('halaman dengan tombol beli → tag prefetch sebelum </head>', () => {
    const out = injectSpaPrefetch(pageHtml(BUY), urls);
    const headEnd = out.indexOf('</head>');
    expect(out.indexOf('<link rel="prefetch" href="/assets/js/index-AbC123.js" as="script" crossorigin>')).toBeGreaterThan(-1);
    expect(out.indexOf('<link rel="prefetch" href="/assets/css/index-XyZ789.css" as="style" crossorigin>')).toBeLessThan(headEnd);
  });

  it('tanpa tombol beli → tidak diubah (hemat kuota pengunjung lain)', () => {
    const html = pageHtml('<a href="/webinar/kelas-a">Detail</a>');
    expect(injectSpaPrefetch(html, urls)).toBe(html);
  });

  it('daftar URL kosong → tidak diubah', () => {
    const html = pageHtml(BUY);
    expect(injectSpaPrefetch(html, [])).toBe(html);
  });
});

describe('withSpaPrefetch', () => {
  it('respons HTML 200 bertombol beli → disisipi, header & status dipertahankan', async () => {
    const { env } = assetsEnv();
    const res = new Response(pageHtml(BUY), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
    const out = await withSpaPrefetch(res, env, new Request('https://jakpatforuniv.com/webinar/kelas-a'));
    expect(out.status).toBe(200);
    expect(out.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await out.text()).toContain('rel="prefetch"');
  });

  it('redirect, 404, non-HTML, dan HEAD dibiarkan', async () => {
    const { env, fetch } = assetsEnv();
    const req = new Request('https://jakpatforuniv.com/webinar');
    const redirect = new Response(null, { status: 302, headers: { location: '/x' } });
    expect(await withSpaPrefetch(redirect, env, req)).toBe(redirect);
    const nf = new Response(pageHtml(BUY), { status: 404, headers: { 'content-type': 'text/html' } });
    expect(await withSpaPrefetch(nf, env, req)).toBe(nf);
    const json = new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    expect(await withSpaPrefetch(json, env, req)).toBe(json);
    const head = new Response(null, { status: 200, headers: { 'content-type': 'text/html' } });
    expect(await withSpaPrefetch(head, env, new Request('https://jakpatforuniv.com/webinar', { method: 'HEAD' }))).toBe(head);
    expect(fetch).not.toHaveBeenCalled();
  });
});
