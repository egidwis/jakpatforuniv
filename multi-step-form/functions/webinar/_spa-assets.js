/**
 * Prefetch JS & CSS utama SPA dari halaman /webinar yang bertombol beli.
 *
 * "Beli tiket" membuka /dashboard/webinar/beli/<slug> — SPA, ±285 KB brotli
 * yang dulu baru diunduh SETELAH tombol diketuk (±2 s di 4G lambat). Dengan
 * <link rel="prefetch"> browser mengunduhnya di waktu senggang selama
 * pengunjung membaca halaman webinar.
 *
 * Nama berkas ber-hash dibaca dari index.html SPA lewat env.ASSETS (melewati
 * Functions & middleware), dimemo per isolate (satu isolate = satu deployment).
 * Gagal apa pun → tanpa tag; halaman webinar tetap utuh.
 * Hanya halaman yang merender tombol beli yang disisipi: pengunjung lain tak
 * perlu menghabiskan kuota data.
 */

const BUY_LINK = /href="[^"]*\/dashboard\/webinar\/beli\//;
const ENTRY_JS = /<script[^>]+type="module"[^>]*\ssrc="(\/assets\/[^"]+\.js)"/;
const ENTRY_CSS = /<link[^>]+rel="stylesheet"[^>]*\shref="(\/assets\/[^"]+\.css)"/;
const RETRY_AFTER_FAILURE_MS = 60_000;

let memo = null; // { urls, at, ok }
export function __resetSpaAssetsMemo() {
  memo = null;
}

export async function spaAssetUrls(env, origin) {
  if (memo && (memo.ok || Date.now() - memo.at < RETRY_AFTER_FAILURE_MS)) return memo.urls;
  let urls = [];
  try {
    if (env?.ASSETS?.fetch) {
      const res = await env.ASSETS.fetch(new Request(`${origin}/`));
      if (res.ok) {
        const html = await res.text();
        const js = html.match(ENTRY_JS)?.[1];
        const css = html.match(ENTRY_CSS)?.[1];
        urls = [js, css].filter(Boolean);
      }
    }
  } catch {
    urls = [];
  }
  memo = { urls, at: Date.now(), ok: urls.length > 0 };
  return urls;
}

export function injectSpaPrefetch(html, urls) {
  if (!urls.length || !BUY_LINK.test(html)) return html;
  const at = html.indexOf('</head>');
  if (at === -1) return html;
  const tags = urls
    .map((u) => `<link rel="prefetch" href="${u}" as="${u.endsWith('.css') ? 'style' : 'script'}" crossorigin>`)
    .join('');
  return html.slice(0, at) + tags + html.slice(at);
}

/** Bungkus respons halaman webinar. Selain HTML 200 GET, dikembalikan apa adanya. */
export async function withSpaPrefetch(response, env, request) {
  if (request.method !== 'GET' || response.status !== 200) return response;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;
  const html = await response.clone().text();
  if (!BUY_LINK.test(html)) return response;
  const urls = await spaAssetUrls(env, new URL(request.url).origin);
  const out = injectSpaPrefetch(html, urls);
  if (out === html) return response;
  return new Response(out, { status: response.status, headers: response.headers });
}
