import { webinarOpenFor } from './_access.js';
import { dokuRequest } from '../doku/_helpers.js';
import { caller, CORS, json, resolveService, rest, SLUG_RE } from './_server.js';

const LINK_MINUTES = 30;
const DEFAULT_SAC_ID = 'SAC-7926-1778565828595';

// Naikkan bila teks S&K webinar berubah; nilainya disimpan per order sebagai bukti.
export const TERMS_VERSION = '2026-11-webinar-1';
export const CONSENT_VERSION = '2026-11-webinar-1';

const isComplete = (p) => Boolean(
  p?.full_name?.trim() && p?.phone_number?.trim() && p?.university?.trim() && p?.department?.trim() && p?.status?.trim()
);

export function buildWebinarCheckoutPayload({ env, origin, order, buyer }) {
  const email = String(buyer.email);
  const payload = {
    order: {
      amount: order.amount,
      invoice_number: order.invoice_number,
      currency: 'IDR',
      callback_url: `${origin}/dashboard/webinar/tiket/${order.order_id}`,
      auto_redirect: true,
      line_items: [{ name: String(order.item_name).substring(0, 255), price: order.amount, quantity: 1 }],
    },
    payment: { payment_due_date: LINK_MINUTES, payment_method_types: ['QRIS'] },
    customer: {
      id: email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50),
      name: String(buyer.name || 'Peserta').substring(0, 255),
      email: email.substring(0, 128),
    },
    additional_info: {
      account: { id: env.DOKU_SAC_WEBINAR_ID || env.VITE_DOKU_SAC_JFU_ID || env.DOKU_SAC_JFU_ID || DEFAULT_SAC_ID },
    },
  };
  const phone = String(buyer.phone || '').replace(/[^0-9]/g, '').substring(0, 16);
  if (phone) payload.customer.phone = phone;
  return payload;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!webinarOpenFor(user.email)) return json(403, { error: 'Webinar belum dibuka', code: 'not_open' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  if (typeof body?.slug !== 'string' || !SLUG_RE.test(body.slug)) return json(400, { error: 'Acara tidak dikenali' });
  if (body.termsAccepted !== true) return json(400, { error: 'Persetujuan S&K wajib', code: 'terms_required' });

  let sb;
  try { sb = resolveService(env); } catch (err) { return json(500, { error: err.message }); }

  try {
    // Biodata dari server, supaya snapshot order tidak bisa dipalsukan dari browser.
    const [profile] = await rest(
      sb,
      `profiles?id=eq.${user.id}&select=full_name,phone_number,university,department,status,referral_source`,
      {},
      'SELECT profiles'
    );
    if (!isComplete(profile)) return json(409, { error: 'Lengkapi profil dulu', code: 'profile_incomplete' });

    const buyer = {
      email: user.email,
      name: profile.full_name.trim(),
      phone: profile.phone_number.trim(),
    };
    const marketing = body.marketingConsent === true;

    const seat = await rest(sb, 'rpc/webinar_reserve_seat', {
      method: 'POST',
      body: JSON.stringify({
        p_slug: body.slug,
        p_auth_user_id: user.id,
        p_buyer_email: user.email,
        p_buyer: {
          name: buyer.name,
          phone: buyer.phone,
          university: profile.university,
          major: profile.department,
          status: profile.status,
          referral: profile.referral_source ?? null,
        },
        p_terms_version: TERMS_VERSION,
        p_marketing_consent: marketing,
        p_consent_version: marketing ? CONSENT_VERSION : null,
      }),
    }, 'RPC webinar_reserve_seat');

    switch (seat?.result) {
      case 'not_found':
        return json(404, { error: 'Acara tidak ditemukan', code: 'not_found' });
      case 'rejected':
        return json(409, { error: 'Penjualan tidak tersedia', code: 'not_for_sale', state: seat.state });
      case 'already_owned':
        return json(200, { result: 'already_owned', orderId: seat.order_id });
      case 'preparing':
        return json(409, { error: 'Tagihan sedang disiapkan, coba lagi sebentar', code: 'preparing', orderId: seat.order_id });
      case 'reused':
        return json(200, { result: 'reused', orderId: seat.order_id, paymentUrl: seat.payment_url });
      case 'created':
        break;
      default:
        throw new Error(`webinar_reserve_seat membalas bentuk tak dikenal: ${JSON.stringify(seat).slice(0, 200)}`);
    }

    const origin = new URL(request.url).origin;
    const doku = await dokuRequest(
      env, 'POST', '/checkout/v1/payment',
      buildWebinarCheckoutPayload({ env, origin, order: seat, buyer })
    );
    const paymentUrl = doku?.data?.response?.payment?.url;

    if (!doku?.ok || !paymentUrl) {
      console.error('[webinar/checkout] DOKU menolak:', doku?.status, JSON.stringify(doku?.data).slice(0, 400));
      // Lepas kursinya sekarang, supaya pembeli bisa langsung mencoba lagi.
      await rest(
        sb,
        `webinar_orders?id=eq.${seat.order_id}&status=eq.pending`,
        { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) },
        'PATCH webinar_orders (DOKU gagal)'
      ).catch((err) => console.error('[webinar/checkout]', err));
      return json(502, { error: 'Pembayaran belum bisa dibuat, coba lagi', code: 'doku_failed' });
    }

    const saved = await rest(
      sb,
      `webinar_orders?id=eq.${seat.order_id}&status=eq.pending`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          payment_url: paymentUrl,
          doku_request_id: doku.requestId ?? null,
          payment_expires_at: new Date(Date.now() + LINK_MINUTES * 60_000).toISOString(),
        }),
      },
      'PATCH webinar_orders (link)'
    );
    if (!Array.isArray(saved) || saved.length === 0) {
      throw new Error(`Link ${seat.invoice_number} tidak tersimpan (0 baris)`);
    }

    return json(200, { result: 'created', orderId: seat.order_id, paymentUrl });
  } catch (err) {
    console.error('[webinar/checkout]', err);
    return json(500, { error: 'Terjadi kendala. Coba lagi beberapa saat.' });
  }
}
