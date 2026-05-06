// Domain-based routing middleware
// jakpatforuniv.com → serve homepage (static files from /homepage/)
// submit.jakpatforuniv.com → serve React SPA (default behavior)

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname;

  // Check if request is for the homepage domain
  const isHomepageDomain =
    hostname === 'jakpatforuniv.com' ||
    hostname === 'www.jakpatforuniv.com';

  if (!isHomepageDomain) {
    // submit.jakpatforuniv.com or *.pages.dev → proceed normally (React SPA)
    return next();
  }

  // --- Homepage domain routing ---
  let filePath = url.pathname;

  // If path already starts with /homepage/, serve it directly
  // (this handles relative asset paths when browser is at /homepage/)
  if (filePath.startsWith('/homepage/') || filePath === '/homepage') {
    // Serve directly from assets
    return serveAsset(env, request, url, filePath);
  }

  // Root → homepage index
  if (filePath === '/' || filePath === '') {
    filePath = '/homepage/index.html';
  }
  // Legal pages
  else if (filePath === '/privacy-policy.html' || filePath === '/privacy-policy') {
    filePath = '/homepage/privacy-policy.html';
  }
  else if (filePath === '/terms-conditions.html' || filePath === '/terms-conditions') {
    filePath = '/homepage/terms-conditions.html';
  }
  // Static assets (CSS, JS, images)
  else if (
    filePath.endsWith('.css') ||
    filePath.endsWith('.js') ||
    filePath.endsWith('.png') ||
    filePath.endsWith('.webp') ||
    filePath.endsWith('.jpg') ||
    filePath.endsWith('.svg') ||
    filePath.endsWith('.ico') ||
    filePath.startsWith('/assets/')
  ) {
    filePath = '/homepage' + filePath;
  }
  // Any other path → homepage index
  else {
    filePath = '/homepage/index.html';
  }

  return serveAsset(env, request, url, filePath);
}

async function serveAsset(env, request, originalUrl, filePath) {
  const assetUrl = new URL(originalUrl);
  assetUrl.pathname = filePath;

  let response = await env.ASSETS.fetch(new Request(assetUrl, request));

  // If ASSETS returns a redirect, follow it server-side
  // so the browser URL stays clean
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location');
    if (location) {
      const redirectUrl = new URL(location, assetUrl);
      response = await env.ASSETS.fetch(new Request(redirectUrl, request));
    }
  }

  // If 404, fall back to homepage index
  if (response.status === 404) {
    const fallbackUrl = new URL(originalUrl);
    fallbackUrl.pathname = '/homepage/index.html';
    response = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (location) {
        const redirectUrl = new URL(location, fallbackUrl);
        response = await env.ASSETS.fetch(new Request(redirectUrl, request));
      }
    }
  }

  return response;
}
