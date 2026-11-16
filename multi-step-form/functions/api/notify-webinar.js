import { NOTIFY_KINDS, sendOrderNotification } from './webinar/_notify.js';
import { resolveService, UUID_RE } from './webinar/_server.js';

// Dipanggil pg_cron/pg_net (webinar_notify_tick, sql/136b) sekali per peserta, bukan
// dari frontend, jadi wajib membawa ?k=<CRON_NOTIFY_SECRET>. Pola sama dengan
// notify-ad-live.js. Body: { order_id, kind }. Penanda di webinar_orders sudah diisi
// tick sebelum memanggil; di sini hanya mengirim dan mencatat galat.

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

  let body;
  try { body = await request.json(); } catch { body = null; }
  const orderId = body?.order_id;
  const kind = body?.kind;
  if (typeof orderId !== 'string' || !UUID_RE.test(orderId) || !NOTIFY_KINDS.includes(kind)) {
    console.error('[notify-webinar] Body tidak dikenali', JSON.stringify(body).slice(0, 200));
    return respond(400, { error: 'Body harus { order_id, kind }' });
  }

  try {
    const result = await sendOrderNotification({ env, sb: resolveService(env), orderId, kind });
    if (result.sent === false) {
      console.error('[notify-webinar]', orderId, result.error);
      return respond(502, { error: 'Email gagal dikirim', detail: result.error });
    }
    return respond(200, result);
  } catch (err) {
    console.error('[notify-webinar]', orderId, kind, err?.message || err);
    return respond(500, { error: 'Email belum bisa diproses' });
  }
}
