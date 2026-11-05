import { webinarLocalOpen, webinarOpenFor } from './_access.js';
import { dokuRequest } from '../doku/_helpers.js';
import { caller, CORS, json, resolveService, rest, SLUG_RE } from './_server.js';
import { resolveWebinarVoucher, voucherRpcPayload } from './_vouchers.js';

const LINK_MINUTES = 30;
const DEFAULT_SAC_ID = 'SAC-7926-1778565828595';

// Naikkan bila teks S&K webinar berubah; nilainya disimpan per order sebagai bukti.
export const TERMS_VERSION = '2026-11-webinar-2'; // -2: kalimat perekaman diperhalus (3 Nov)
export const CONSENT_VERSION = '2026-11-webinar-1';

const isComplete = (p) => Boolean(
  p?.full_name?.trim() && p?.phone_number?.trim() && p?.university?.trim() && p?.department?.trim() && p?.status?.trim()
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Kontak khusus order (switch "Sama dengan data akun" dimatikan), sama dengan
 * Detail Invoice di alur iklan. Hanya menentukan ke mana e-tiket dikirim dan nama
 * di kwitansi; pemilik tiket tetap akun yang login (auth_user_id).
 * Mengembalikan null bila tidak dikirim, atau { error } bila tidak sah.
 */
export function parseCustomContact(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object') return { error: 'Data peserta tidak sah' };
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  if (!name || name.length > 120) return { error: 'Nama lengkap wajib diisi' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Email belum benar' };
  const digits = phone.replace(/[^0-9]/g, '');
  if (!/^\+?[0-9\s-]+$/.test(phone) || digits.length < 8 || digits.length > 16) return { error: 'No telepon belum benar' };
  return { name, email, phone };
}

/**
 * `basic: true` = bentuk yang dipakai create-payment.js iklan (terbukti diterima DOKU):
 * tanpa line_items dan tanpa pembatasan metode. Dipakai sebagai cadangan bila DOKU
 * menolak bentuk lengkap; percobaan pertama di produksi (3 Nov) ditolak DOKU.
 */
export function buildWebinarCheckoutPayload({ env, origin, order, buyer, basic = false }) {
  const email = String(buyer.email);
  const payload = {
    order: {
      amount: order.amount,
      invoice_number: order.invoice_number,
      currency: 'IDR',
      callback_url: `${origin}/dashboard/webinar/tiket/${order.order_id}`,
      auto_redirect: true,
      ...(basic ? {} : {
        // DOKU melarang simbol di line_items untuk beberapa kanal; "[UJI]" dll. dibuang.
        line_items: [{ name: String(order.item_name).replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().substring(0, 255) || 'Tiket webinar', price: order.amount, quantity: 1 }],
      }),
    },
    payment: { payment_due_date: LINK_MINUTES, ...(basic ? {} : { payment_method_types: ['QRIS'] }) },
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

/** Ringkas jawaban DOKU untuk log/respons: status + pesan galat, tanpa header atau rahasia. */
export function summarizeDokuError(doku) {
  if (!doku) return null;
  const d = doku.data || {};
  const message = d.error?.message ?? d.message ?? d.error ?? d.raw ?? d;
  return { status: doku.status ?? null, message: String(typeof message === 'string' ? message : JSON.stringify(message)).slice(0, 300) };
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!webinarOpenFor(user.email, env, request)) return json(403, { error: 'Webinar belum dibuka', code: 'not_open' });
  // Uji lokal memakai database produksi: jangan menahan kursi atau menerbitkan
  // tagihan DOKU sungguhan dari laptop.
  if (webinarLocalOpen(env, request)) {
    return json(403, { error: 'Pembayaran dimatikan di uji lokal. Uji bayar di produksi.', code: 'local_test' });
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  if (typeof body?.slug !== 'string' || !SLUG_RE.test(body.slug)) return json(400, { error: 'Acara tidak dikenali' });
  if (body.termsAccepted !== true) return json(400, { error: 'Persetujuan S&K wajib', code: 'terms_required' });
  const custom = parseCustomContact(body.contact);
  if (custom?.error) return json(400, { error: custom.error, code: 'contact_invalid' });
  // Voucher dinilai di server pada saat order dibuat; harga dihitung webinar_reserve_seat.
  let voucher = null;
  if (typeof body.voucherCode === 'string' && body.voucherCode.trim()) {
    const resolved = resolveWebinarVoucher(body.voucherCode);
    if (!resolved.ok) return json(400, { error: resolved.message, code: 'voucher_invalid', reason: resolved.reason });
    voucher = voucherRpcPayload(resolved.entry);
  }

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

    // Tanpa kontak khusus: data akun. Kampus, jurusan, dan status selalu dari profil.
    const buyer = custom ?? {
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
        p_buyer_email: buyer.email,
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
        ...(voucher ? { p_voucher: voucher } : {}),
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
    let doku = await dokuRequest(
      env, 'POST', '/checkout/v1/payment',
      buildWebinarCheckoutPayload({ env, origin, order: seat, buyer })
    );
    let paymentUrl = doku?.data?.response?.payment?.url;
    let firstRejection = null;

    // Validasi ditolak (4xx): invoice belum terbit di DOKU, jadi aman mencoba sekali
    // lagi dengan bentuk dasar yang sama dengan pembayaran iklan.
    if ((!doku?.ok || !paymentUrl) && doku?.status >= 400 && doku?.status < 500) {
      firstRejection = summarizeDokuError(doku);
      console.error('[webinar/checkout] DOKU menolak bentuk lengkap, coba bentuk dasar:', firstRejection);
      doku = await dokuRequest(
        env, 'POST', '/checkout/v1/payment',
        buildWebinarCheckoutPayload({ env, origin, order: seat, buyer, basic: true })
      );
      paymentUrl = doku?.data?.response?.payment?.url;
    }

    if (!doku?.ok || !paymentUrl) {
      console.error('[webinar/checkout] DOKU menolak:', summarizeDokuError(doku), 'percobaan pertama:', firstRejection);
      // Lepas kursinya sekarang, supaya pembeli bisa langsung mencoba lagi.
      await rest(
        sb,
        `webinar_orders?id=eq.${seat.order_id}&status=eq.pending`,
        { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) },
        'PATCH webinar_orders (DOKU gagal)'
      ).catch((err) => console.error('[webinar/checkout]', err));
      // Alasan DOKU ikut dikirim supaya terlihat di tab Network tanpa membuka log Cloudflare.
      return json(502, {
        error: 'Pembayaran belum bisa dibuat, coba lagi',
        code: 'doku_failed',
        doku: { first: firstRejection, last: summarizeDokuError(doku) },
      });
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

    return json(200, {
      result: 'created', orderId: seat.order_id, paymentUrl,
      ...(firstRejection ? { dokuFallback: firstRejection } : {}),
    });
  } catch (err) {
    console.error('[webinar/checkout]', err);
    return json(500, { error: 'Terjadi kendala. Coba lagi beberapa saat.' });
  }
}
