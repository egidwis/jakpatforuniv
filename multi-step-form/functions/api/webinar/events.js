import { buildListing, PUBLIC_EVENT_COLUMNS } from './_view.js';
import { caller, CORS, json, resolveService, rest } from './_server.js';
import { webinarPreviewOnly, webinarOpenFor } from './_access.js';

/** Daftar publik: dipakai dashboard dan homepage, tanpa login. */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json(405, { error: 'Method Not Allowed' });

  // Masa uji: hanya akun di daftar _access.js yang melihat isi; homepage
  // memakai open:false untuk menyembunyikan menu Webinar.
  if (webinarPreviewOnly(env, request)) {
    const user = await caller(env, request);
    if (!webinarOpenFor(user?.email, env, request)) return json(200, { ...buildListing([]), open: false });
  }

  try {
    const rows = await rest(
      resolveService(env),
      `webinar_events?status=eq.published&is_listed=eq.true&select=${PUBLIC_EVENT_COLUMNS}`,
      {},
      'SELECT webinar_events (daftar)'
    );
    return json(200, { ...buildListing(rows || []), open: true });
  } catch (err) {
    console.error('[webinar/events]', err);
    return json(500, { error: 'Daftar webinar belum bisa dimuat' });
  }
}
