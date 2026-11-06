// POST /api/webinar/watch {orderId}: URL tonton rekaman untuk pemilik tiket (Fase 5A).
//
// Satu-satunya pintu keluar URL R2 untuk pembeli. URL berlaku 3 jam (presigned GET);
// pemutar meminta yang baru bila habis dan melanjutkan dari detik yang sama.
// Penghalang ringan, bukan DRM: watermark email akun + 4 karakter kode tiket
// dirender pemutar di atas video.

import { buildEventView } from './_view.js';
import { CORS, json } from './_server.js';
import { recordingConfig, presignGet } from './_recording.js';
import { ownedOrderRequest, watermarkText, WATCH_SECONDS } from './_recordingAccess.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const gate = await ownedOrderRequest(env, request, 'tonton');
    if (gate.response) return gate.response;
    const { user, order } = gate;

    const config = recordingConfig(env);
    if (!config) {
      console.error('[webinar/watch] secret R2 belum diisi');
      return json(503, { error: 'Video belum bisa diputar. Coba lagi nanti.', code: 'storage_unconfigured' });
    }

    const event = order.webinar_events;
    const { recording_object_key: key, materials_path: materials, ...publicEvent } = event;
    return json(200, {
      video_url: await presignGet(config, key, WATCH_SECONDS),
      expires_at: new Date(Date.now() + WATCH_SECONDS * 1000).toISOString(),
      minutes: event.recording_minutes ?? null,
      has_materials: Boolean(materials),
      watermark: watermarkText(user.email, order.ticket_code),
      event: buildEventView({ ...publicEvent, webinar_offer_state: { state: 'closed' } }),
    });
  } catch (err) {
    console.error('[webinar/watch]', err);
    return json(500, { error: 'Video belum bisa diputar. Coba muat ulang.' });
  }
}
