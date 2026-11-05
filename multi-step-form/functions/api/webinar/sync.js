import { webinarOpenFor } from './_access.js';
import { checkOrderAtDoku } from './_checkStatus.js';
import { caller, CORS, json, resolveService, rest, UUID_RE } from './_server.js';

/**
 * Jaring pengaman bila DOKU tidak menelepon webhook: halaman tiket pembeli
 * memanggil ini selama order masih pending. Intinya ada di _checkStatus.js, yang
 * juga dipakai tombol "Cek ke DOKU" di admin.
 */
export async function onRequest({ request, env, waitUntil }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!webinarOpenFor(user.email, env, request)) return json(403, { error: 'Webinar belum dibuka', code: 'not_open' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  if (typeof body?.orderId !== 'string' || !UUID_RE.test(body.orderId)) return json(400, { error: 'Order tidak dikenali' });

  try {
    const sb = resolveService(env);
    const [order] = await rest(
      sb,
      `webinar_orders?id=eq.${body.orderId}&auth_user_id=eq.${user.id}&select=id,invoice_number,status,created_at,last_status_check_at`,
      {},
      'SELECT webinar_orders (sync)'
    );
    if (!order) return json(404, { error: 'Order tidak ditemukan' });
    if (order.status !== 'pending') return json(200, { status: order.status, checked: false });

    const result = await checkOrderAtDoku({ env, sb, order, statusFilter: 'status=eq.pending', waitUntil });
    return json(200, { status: result.status, checked: result.checked });
  } catch (err) {
    console.error('[webinar/sync]', err);
    return json(500, { error: 'Status belum bisa diperiksa' });
  }
}
