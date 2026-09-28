/**
 * Matikan satu link pembayaran DOKU — `POST /checkout/v3/cancellations`.
 *
 * Dipindahkan dari `create-payment.js` (28 Sep 2026, sql/102) supaya pembaruan
 * tagihan tempo (`_tempo.js`) dan webhook tidak jadi salinan KETIGA dan
 * KEEMPAT. Modul berawalan `_` bukan rute, jadi aman diimpor Pages Function
 * mana pun — presedennya `_helpers.js`, `_webhook-alert.js`.
 *
 * ⚠️ KEMBARAN `functions/api/doku/cancel-order.js`, DAN ITU DISENGAJA.
 * Endpoint itu admin-gated di `_middleware.js`, sementara pemanggil modul ini
 * bekerja TANPA sesi admin (checkout swalayan peneliti, resolver `/bayar/`,
 * webhook DOKU). Langkah tanda tangannya WAJIB identik dengan
 * `cancel-order.js` (digest -> component string -> HMAC). Kalau satu berubah,
 * ubah keduanya.
 *
 * TIDAK PERNAH MELEMPAR: setiap pemanggilnya sedang di tengah pekerjaan lain
 * (menerbitkan tagihan, mencatat pembayaran), dan kegagalan mematikan link
 * tidak boleh menggagalkan itu. Jawabannya lewat nilai balik.
 */
export async function cancelDokuOrder(env, invoiceNumber, originalRequestId, note = 'Digantikan tagihan baru (jalur swalayan)') {
  // Tanpa `original_request_id` API-nya tidak bisa dipanggil sama sekali —
  // seluruh tagihan pra-sql/84 begitu, dan nilainya tidak bisa dipulihkan.
  // Alasan lengkapnya di `cancel-order.js`.
  if (!originalRequestId) {
    return { cancelled: false, reason: 'no_request_id' };
  }

  const clientId = env.DOKU_CLIENT_ID || env.VITE_DOKU_CLIENT_ID;
  const secretKey = env.DOKU_SECRET_KEY;
  if (!clientId || !secretKey) {
    return { cancelled: false, reason: 'credentials_missing' };
  }

  const REQUEST_TARGET = '/checkout/v3/cancellations';
  const bodyString = JSON.stringify({
    order: { invoice_number: invoiceNumber },
    payment: { original_request_id: originalRequestId },
    note,
  });

  try {
    const enc = new TextEncoder();
    const requestId = crypto.randomUUID();
    const requestTimestamp = new Date().toISOString().slice(0, 19) + 'Z';

    const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(bodyString));
    const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));
    const componentStringToSign =
      `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}` +
      `\nRequest-Target:${REQUEST_TARGET}\nDigest:${digest}`;

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(componentStringToSign));
    const signature = 'HMACSHA256=' + btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const base = (env.DOKU_ENV === 'production' || env.VITE_DOKU_ENV === 'production')
      ? 'https://api.doku.com'
      : 'https://api-sandbox.doku.com';

    const res = await fetch(base + REQUEST_TARGET, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': requestTimestamp,
        'Signature': signature,
      },
      body: bodyString,
    });

    if (!res.ok) {
      // Tiga penolakan yang WAJAR: sudah dibayar, sudah kedaluwarsa, kanal
      // kartu. Ketiganya bukan kerusakan — daftar lengkapnya di cancel-order.js.
      const text = await res.text().catch(() => '');
      return { cancelled: false, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { cancelled: true, reason: null };
  } catch (e) {
    return { cancelled: false, reason: e?.message || 'Panggilan ke DOKU gagal' };
  }
}
