// Domain-based routing middleware
//
// jakpatforuniv.com (apex, canonical):
//   `/` and the legal pages → static homepage (public/homepage/)
//   everything else         → React SPA + Pages Functions
// www.jakpatforuniv.com → 301 to apex
// submit.jakpatforuniv.com → 301 to apex once REDIRECT_SUBMIT_TO_APEX is on;
//   `/api/*` is always served directly on every host (DOKU webhooks and the
//   Supabase cron POST there, and a redirected POST is not reliably replayed).
// *.pages.dev, localhost, wildcard user subdomains → SPA, unchanged.
//
// Old `/homepage/…` page URLs 301 to their clean apex path. The homepage's
// images, CSS, JS and the SPA's `/assets/*` never reach this file (see
// public/_routes.json).

export const APEX_HOST = 'jakpatforuniv.com';
const WWW_HOST = 'www.jakpatforuniv.com';
const SUBMIT_HOST = 'submit.jakpatforuniv.com';

// Turn on only after the apex is attached to this Pages project and the
// Cloudflare zone redirect `jakpatforuniv.com/* → submit…/homepage/*` is
// removed — otherwise the two redirects loop.
export const REDIRECT_SUBMIT_TO_APEX = true;

const HOMEPAGE_PATHS = {
  '/': '/homepage/index.html',
  '/privacy-policy': '/homepage/privacy-policy.html',
  '/privacy-policy.html': '/homepage/privacy-policy.html',
  '/terms-conditions': '/homepage/terms-conditions.html',
  '/terms-conditions.html': '/homepage/terms-conditions.html',
  '/syarat-ketentuan': '/homepage/terms-conditions.html',
};

// Must not be served through `_redirects`: serveAsset fetches these same files
// from ASSETS, which would apply the redirect and land on the SPA.
const LEGACY_HOMEPAGE_PATHS = {
  '/homepage': '/',
  '/homepage/': '/',
  '/homepage/index': '/',
  '/homepage/index.html': '/',
  '/homepage/privacy-policy': '/privacy-policy',
  '/homepage/privacy-policy.html': '/privacy-policy',
  '/homepage/terms-conditions': '/terms-conditions',
  '/homepage/terms-conditions.html': '/terms-conditions',
  '/homepage/syarat-ketentuan': '/terms-conditions',
};

const ASSET_EXT = /\.(css|js|mjs|map|json|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|pdf|txt|xml)$/;

/**
 * Alamat bersih untuk URL halaman `/homepage/…` lama, atau `null` bila bukan.
 * Dipakai cabang apex DAN host lama (www/submit), jadi selalu SATU lompatan:
 *   - tak peka huruf besar/kecil pada prefix `/homepage`;
 *   - aset statis (`/homepage/styles.css`, gambar, JS, dll.) → `null` (dilayani apa adanya);
 *   - path legacy yang dipetakan eksplisit (`/homepage`, `/homepage/index.html`,
 *     `/homepage/privacy-policy.html`, dll.) → path kanoniknya;
 *   - subpath lain (`/homepage/webinar`, `/homepage/webinar/<slug>`, `/homepage/pages`,
 *     `/homepage/login`, `/homepage/dashboard`, dll.) → strip prefix `/homepage`
 *     dengan menjaga kapitalisasi subpath.
 */
export function cleanHomepagePath(pathname) {
  const lower = pathname.toLowerCase();
  if (lower !== '/homepage' && !lower.startsWith('/homepage/')) return null;
  if (ASSET_EXT.test(lower)) return null;

  const exact = LEGACY_HOMEPAGE_PATHS[lower];
  if (exact) return exact;

  const trimmed = lower.replace(/\/+$/, '') || '/';
  const exactTrimmed = LEGACY_HOMEPAGE_PATHS[trimmed];
  if (exactTrimmed) return exactTrimmed;

  const stripped = pathname.slice('/homepage'.length).replace(/^\/+/, '/');
  return stripped || '/';
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname;

  const isLegacyHost =
    hostname === WWW_HOST || (REDIRECT_SUBMIT_TO_APEX && hostname === SUBMIT_HOST);

  if (isLegacyHost) {
    const redirectable = request.method === 'GET' || request.method === 'HEAD';
    if (!redirectable || url.pathname.startsWith('/api/')) {
      return next();
    }
    const path = cleanHomepagePath(url.pathname) ?? url.pathname;
    return Response.redirect(`https://${APEX_HOST}${path}${url.search}`, 301);
  }

  if (hostname !== APEX_HOST) {
    return next();
  }

  const cleanPath = cleanHomepagePath(url.pathname);
  if (cleanPath) {
    return Response.redirect(`https://${APEX_HOST}${cleanPath}${url.search}`, 301);
  }

  const homepageFile = HOMEPAGE_PATHS[url.pathname];
  if (!homepageFile) {
    return next();
  }

  return serveAsset(env, request, url, homepageFile);
}

async function serveAsset(env, request, originalUrl, filePath) {
  const assetUrl = new URL(originalUrl);
  assetUrl.pathname = filePath;

  let response = await env.ASSETS.fetch(new Request(assetUrl, request));

  // ASSETS answers `/x.html` with a 308 to `/x`; follow it server-side so the
  // browser URL stays clean.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location');
    if (location) {
      const redirectUrl = new URL(location, assetUrl);
      response = await env.ASSETS.fetch(new Request(redirectUrl, request));
    }
  }

  return response;
}
