import { describe, it, expect, vi } from 'vitest';
import { onRequest, REDIRECT_SUBMIT_TO_APEX } from './_middleware.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  ROUTING PER DOMAIN
  ═══════════════════════════════════════════════════════════════════════════
  Yang dikunci:
    1. Apex `/` dan halaman legal = homepage statis; path lain = aplikasi.
    2. `www` selalu 301 ke apex, path + query utuh.
    3. `submit.` baru 301 ke apex saat saklar REDIRECT_SUBMIT_TO_APEX hidup.
    4. `/api/*` dan request non-GET TIDAK PERNAH dialihkan di host mana pun —
       webhook DOKU dan cron Supabase mengirim POST ke `submit…/api/…`.
    5. pages.dev, localhost, dan subdomain pengguna tidak tersentuh.
*/

const NEXT_RESPONSE = new Response('spa');

function run(url, { method = 'GET' } = {}) {
  const next = vi.fn(async () => NEXT_RESPONSE);
  const assetPaths = [];
  const env = {
    ASSETS: {
      fetch: vi.fn(async (req) => {
        const { pathname } = new URL(req.url);
        assetPaths.push(pathname);
        if (pathname.endsWith('.html')) {
          const pretty = pathname.replace(/index\.html$/, '').replace(/\.html$/, '');
          return new Response(null, { status: 308, headers: { Location: pretty } });
        }
        return new Response(`asset:${pathname}`);
      }),
    },
  };
  const request = new Request(url, { method });
  return { promise: onRequest({ request, next, env }), next, assetPaths };
}

describe('apex jakpatforuniv.com', () => {
  it('`/` menyajikan homepage (redirect ASSETS diikuti di server)', async () => {
    const { promise, next, assetPaths } = run('https://jakpatforuniv.com/');
    const res = await promise;
    expect(next).not.toHaveBeenCalled();
    expect(assetPaths).toEqual(['/homepage/index.html', '/homepage/']);
    expect(await res.text()).toBe('asset:/homepage/');
  });

  it.each([
    ['/privacy-policy', '/homepage/privacy-policy.html'],
    ['/privacy-policy.html', '/homepage/privacy-policy.html'],
    ['/terms-conditions', '/homepage/terms-conditions.html'],
    ['/terms-conditions.html', '/homepage/terms-conditions.html'],
    ['/syarat-ketentuan', '/homepage/terms-conditions.html'],
  ])('halaman legal %s → %s', async (path, file) => {
    const { promise, assetPaths } = run(`https://jakpatforuniv.com${path}`);
    await promise;
    expect(assetPaths[0]).toBe(file);
  });

  it.each([
    '/dashboard',
    '/dashboard/forms/new',
    '/login',
    '/f/abc123',
    '/bayar/11111111-2222-4333-8444-555555555555',
    '/payment-success?invoice=INV-1',
    '/webinar/olah-data',
    '/api/webinar/events',
    '/c/instagram',
    '/tidak-ada',
  ])('%s diteruskan ke aplikasi', async (path) => {
    const { promise, next } = run(`https://jakpatforuniv.com${path}`);
    expect(await promise).toBe(NEXT_RESPONSE);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('www.jakpatforuniv.com', () => {
  it('GET dialihkan 301 ke apex dengan path dan query utuh', async () => {
    const res = await run('https://www.jakpatforuniv.com/dashboard?tab=iklan').promise;
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://jakpatforuniv.com/dashboard?tab=iklan');
  });

  it('`/api/*` dan POST tidak dialihkan', async () => {
    expect(await run('https://www.jakpatforuniv.com/api/doku/webhook').promise).toBe(NEXT_RESPONSE);
    expect(await run('https://www.jakpatforuniv.com/dashboard', { method: 'POST' }).promise)
      .toBe(NEXT_RESPONSE);
  });
});

describe('submit.jakpatforuniv.com', () => {
  it('`/api/*` selalu dilayani langsung, apa pun saklarnya', async () => {
    for (const method of ['GET', 'POST']) {
      const { promise, next } = run('https://submit.jakpatforuniv.com/api/doku/webhook', { method });
      expect(await promise).toBe(NEXT_RESPONSE);
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it('POST ke path non-API tidak dialihkan', async () => {
    expect(await run('https://submit.jakpatforuniv.com/bayar/x', { method: 'POST' }).promise)
      .toBe(NEXT_RESPONSE);
  });

  it('halaman aplikasi mengikuti saklar REDIRECT_SUBMIT_TO_APEX', async () => {
    const res = await run('https://submit.jakpatforuniv.com/dashboard/forms?x=1').promise;
    if (REDIRECT_SUBMIT_TO_APEX) {
      expect(res.status).toBe(301);
      expect(res.headers.get('Location')).toBe('https://jakpatforuniv.com/dashboard/forms?x=1');
    } else {
      expect(res).toBe(NEXT_RESPONSE);
    }
  });
});

describe('host lain tidak tersentuh', () => {
  it.each([
    'https://abc123.jakpatforuniv-submit.pages.dev/',
    'http://localhost:8788/',
    'https://budi.jakpatforuniv.com/survei-saya',
  ])('%s → aplikasi', async (url) => {
    const { promise, next } = run(url);
    expect(await promise).toBe(NEXT_RESPONSE);
    expect(next).toHaveBeenCalledOnce();
  });
});
