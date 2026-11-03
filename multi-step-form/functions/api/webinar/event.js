import { buildEventView, PUBLIC_EVENT_COLUMNS } from './_view.js';
import { caller, CORS, json, resolveService, rest, SLUG_RE } from './_server.js';
import { WEBINAR_PREVIEW_ONLY, webinarOpenFor } from './_access.js';

/** Satu acara untuk halaman checkout. Acara tak terdaftar tetap bisa dibeli lewat link. */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const slug = new URL(request.url).searchParams.get('slug') || '';
  if (!SLUG_RE.test(slug)) return json(404, { error: 'Acara tidak ditemukan' });
  if (WEBINAR_PREVIEW_ONLY && !webinarOpenFor((await caller(env, request))?.email)) {
    return json(404, { error: 'Acara tidak ditemukan' });
  }

  try {
    const [event] = await rest(
      resolveService(env),
      `webinar_events?slug=eq.${slug}&status=neq.draft&select=${PUBLIC_EVENT_COLUMNS}`,
      {},
      'SELECT webinar_events (satu)'
    );
    if (!event) return json(404, { error: 'Acara tidak ditemukan' });
    return json(200, { event: buildEventView(event) });
  } catch (err) {
    console.error('[webinar/event]', err);
    return json(500, { error: 'Acara belum bisa dimuat' });
  }
}
