import { applyWebinarVoucher, resolveWebinarVoucher, voucherLabel } from './_vouchers.js';
import { formatPrice } from './_view.js';
import { caller, CORS, json, resolveService, rest, SLUG_RE } from './_server.js';
import { webinarOpenFor } from './_access.js';

/**
 * Pratinjau voucher di halaman beli. Hanya menghitung; harga yang ditagih tetap
 * ditentukan webinar_reserve_seat saat checkout.
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!webinarOpenFor(user.email, env, request)) return json(403, { error: 'Webinar belum dibuka', code: 'not_open' });

  const params = new URL(request.url).searchParams;
  const slug = params.get('slug') || '';
  const code = (params.get('code') || '').slice(0, 40);
  if (!SLUG_RE.test(slug)) return json(404, { error: 'Acara tidak ditemukan' });

  const resolved = resolveWebinarVoucher(code);
  if (!resolved.ok) return json(200, { valid: false, reason: resolved.reason, message: resolved.message });

  try {
    const [event] = await rest(
      resolveService(env),
      `webinar_events?slug=eq.${slug}&status=eq.published&select=price`,
      {},
      'SELECT webinar_events (voucher)'
    );
    if (!event || !Number.isFinite(event.price)) return json(404, { error: 'Acara tidak ditemukan' });
    const total = applyWebinarVoucher(event.price, resolved.entry);
    return json(200, {
      valid: true,
      code: resolved.entry.code,
      label: voucherLabel(resolved.entry),
      price: event.price,
      discount: event.price - total,
      total,
      discount_label: `−${formatPrice(event.price - total)}`,
      total_label: formatPrice(total),
      message: `${voucherLabel(resolved.entry)} digunakan.`,
    });
  } catch (err) {
    console.error('[webinar/voucher]', err);
    return json(500, { error: 'Voucher belum bisa dicek' });
  }
}
