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
// `/homepage/*` and `/assets/*` never reach this file (see public/_routes.json).

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
    return Response.redirect(`https://${APEX_HOST}${url.pathname}${url.search}`, 301);
  }

  if (hostname !== APEX_HOST) {
    return next();
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
