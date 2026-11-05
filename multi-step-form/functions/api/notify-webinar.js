import { dispatchWebinarNotifications } from './webinar/_notify.js';
import { resolveService } from './webinar/_server.js';

// Dipanggil pg_cron/pg_net (webinar_notify_tick, sql/135 + sql/135b), bukan dari
// frontend, jadi wajib membawa ?k=<CRON_NOTIFY_SECRET>. Pola sama dengan
// notify-ad-live.js. Satu panggilan = satu batch; sisanya diambil tick berikutnya.

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  const provided = new URL(request.url).searchParams.get('k');
  const expected = env.CRON_NOTIFY_SECRET;
  if (!expected || provided !== expected) {
    console.error('[notify-webinar] Ditolak: ?k= kosong/salah');
    return respond(401, { error: 'Unauthorized' });
  }

  try {
    const result = await dispatchWebinarNotifications({ env, sb: resolveService(env), limit: 20 });
    return respond(200, result);
  } catch (err) {
    console.error('[notify-webinar]', err?.message || err);
    return respond(500, { error: 'Antrean email belum bisa diproses' });
  }
}
