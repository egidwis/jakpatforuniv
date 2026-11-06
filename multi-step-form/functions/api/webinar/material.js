// POST /api/webinar/material {orderId}: link unduh materi (PPT/PDF) untuk pemilik
// tiket (Fase 5A). Signed URL Supabase Storage 10 menit dari bucket privat
// webinar-materials (sql/131); syarat aksesnya sama dengan menonton rekaman.

import { CORS, json, sbFetch } from './_server.js';
import { MATERIAL_SECONDS, ownedOrderRequest } from './_recordingAccess.js';

const BUCKET = 'webinar-materials';

/** "materi-olah-data-spss.pdf" dari slug acara + ekstensi berkas asli. */
export function materialFileName(slug, path) {
  const ext = (String(path).match(/\.([a-z0-9]+)$/i)?.[1] || 'pdf').toLowerCase();
  return `materi-${slug || 'webinar'}.${ext}`;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const gate = await ownedOrderRequest(env, request, 'materi');
    if (gate.response) return gate.response;
    const { sb, order } = gate;
    const event = order.webinar_events;
    if (!event.materials_path) return json(404, { error: 'Materi belum tersedia', code: 'no_material' });

    const path = event.materials_path.split('/').map(encodeURIComponent).join('/');
    const res = await sbFetch(`${sb.url}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: sb.headers,
      body: JSON.stringify({ expiresIn: MATERIAL_SECONDS }),
    }, 'Storage sign webinar-materials');
    const signed = (await res.json())?.signedURL;
    if (typeof signed !== 'string' || !signed.startsWith('/')) throw new Error('Storage sign: signedURL tidak ada');

    const sep = signed.includes('?') ? '&' : '?';
    const name = materialFileName(event.slug, event.materials_path);
    return json(200, {
      url: `${sb.url}/storage/v1${signed}${sep}download=${encodeURIComponent(name)}`,
      file_name: name,
      expires_at: new Date(Date.now() + MATERIAL_SECONDS * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[webinar/material]', err);
    return json(500, { error: 'Materi belum bisa diunduh. Coba lagi sebentar.' });
  }
}
