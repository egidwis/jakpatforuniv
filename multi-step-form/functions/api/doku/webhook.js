// Cloudflare Function untuk webhook DOKU
// Menerima notifikasi pembayaran dari DOKU dan memperbarui status di database
//
// ============================================================================
// KENAPA FILE INI PENUH CEK `res.ok` — baca sebelum menyederhanakannya
// ============================================================================
// Insiden 2026-08-10 (invoice JFU-INV-d7a41f-1786333513279, Rp 499.500): DOKU
// mencatat notifikasi TERKIRIM & SUKSES, tapi invoices/transactions/
// form_submissions tidak berubah sama sekali dan order tersangkut "Menunggu
// channel" berjam-jam.
//
// Sebabnya: dulu semua tulis di sini memakai `fetch` mentah ke PostgREST TANPA
// memeriksa `res.ok`. `fetch` tidak melempar error pada HTTP 4xx/5xx, jadi blok
// `catch (dbError)` di bawah hampir tidak pernah kena — webhook bisa "berhasil"
// tanpa menulis apa pun lalu balas 200. DOKU melihat 200, tidak pernah retry,
// pembayaran hilang permanen tanpa jejak. Cloudflare Workers Logs & Logpush
// tidak tersedia untuk project Pages, jadi tidak ada jejak platform juga.
//
// Tiga aturan yang menutupnya, dan ketiganya harus tetap berdiri:
//   1. Semua panggilan PostgREST lewat sbFetch() — melempar error kalau !res.ok.
//   2. PATCH yang penting memakai `Prefer: return=representation` dan MEMERIKSA
//      array balikannya. Array kosong = 0 baris cocok = kegagalan diam-diam yang
//      dari luar tampak seperti sukses.
//   3. Kegagalan tulis membalas HTTP 500 supaya DOKU retry (dibatasi
//      MAX_WRITE_ATTEMPTS agar tidak jadi badai), mencatat baris di
//      doku_webhook_events, dan mengirim email ke admin.
// ============================================================================

import { sendWebhookAlert } from './_webhook-alert.js';

// Setelah sekian kali percobaan gagal untuk satu invoice, berhenti meminta DOKU
// retry (balas 200) — kegagalannya jelas bukan transien lagi. Baris audit dan
// email alert tetap ada, jadi tidak ada yang hilang; yang berhenti hanya retry.
const MAX_WRITE_ATTEMPTS = 5;

// ============================================================================
// PENOLAKAN PUN HARUS PUNYA JEJAK (2026-08-31)
// ============================================================================
// sql/54 menutup kegagalan TULIS. Yang masih buta: kegagalan MASUK. Ketiga
// jalan penolakan di bawah dulu `return` sebelum recordWebhookEvent() sempat
// dipanggil, jadi dari sisi kita "DOKU tidak pernah menelepon" dan "DOKU
// menelepon lalu kita tolak" terlihat SAMA PERSIS: nol baris.
//
// Terukur mahal 2026-08-31 (invoice JFU-ac75fa15-1788158299791, Rp 555.000):
// notification URL produk QRIS di dashboard DOKU menunjuk BO DOKU sendiri.
// Membuktikannya butuh screenshot dashboard DOKU, karena database kita tidak
// bisa membedakan kedua kemungkinan itu.
//
// Nilai-nilai ini WAJIB ada di CHECK constraint doku_webhook_events (sql/77).
// Menambah nilai baru di sini tanpa migrasi = INSERT ditolak 400 oleh PostgREST
// = penolakannya gagal dicatat = persis kebutaan yang sedang ditutup.
export const REJECT_OUTCOMES = {
  auth: 'rejected_auth',        // ditolak di gerbang autentikasi  → 401
  payload: 'rejected_payload',  // lolos auth tapi badannya tak terbaca → 400
  crash: 'handler_crashed',     // error tak terduga di handler    → 500
};

/**
 * Nomor invoice dari badan mentah, tanpa mempercayainya.
 *
 * Dipakai HANYA untuk memberi nama pada baris audit penolakan — request yang
 * ditolak tidak pernah menyentuh database selain lewat `recordWebhookEvent`.
 * TIDAK PERNAH melempar: badan request yang ditolak justru yang paling mungkin
 * bukan JSON, dan sebuah lemparan di sini akan menghapus jejak yang sedang
 * dicoba direkam.
 */
export function sniffInvoiceNumber(rawBodyText) {
  if (!rawBodyText || typeof rawBodyText !== 'string') return null;
  try {
    const d = JSON.parse(rawBodyText);
    return d?.order?.invoice_number || d?.trxId || d?.payout?.invoice_number || null;
  } catch {
    return null;
  }
}

/**
 * Gerbang autentikasi DOKU — memberi VERDICT, bukan Response.
 *
 * Sengaja dipisah dari `onRequest`: selama ia membalas sendiri, setiap cabang
 * penolakan adalah `return` yang melewati pencatatan. Sebagai fungsi murni ia
 * memaksa pemanggilnya melewati SATU titik yang mencatat, dan bisa diuji tanpa
 * Cloudflare (lihat webhook.spec.js).
 *
 * Urutannya TIDAK boleh dibalik: cek secret harus mendahului deteksi format,
 * karena format dipilih dari header yang DIKIRIM PEMANGGIL — tanpa itu penyerang
 * bebas memilih cabang terlemah.
 */
export async function verifyDokuAuth({ headers, requestUrl, env, rawBodyText }) {
  // ── Gerbang 1: secret di URL ──────────────────────────────────────────────
  const providedSecret = new URL(requestUrl).searchParams.get('k');
  const expectedSecret = env.DOKU_WEBHOOK_SECRET;
  const secretOk = !!expectedSecret && providedSecret === expectedSecret;

  if (!secretOk) {
    if (env.WEBHOOK_ENFORCE_SECRET === 'true') {
      console.error('[webhook] Rejected: missing/invalid ?k= secret (enforcement on)');
      return { ok: false, httpStatus: 401, error: 'Unauthorized', detail: 'Secret ?k= hilang/salah (enforcement hidup).' };
    }
    console.warn('[webhook] MISSING SECRET — request without valid ?k= was still processed (enforcement off). Update the DOKU Notification URL, then set WEBHOOK_ENFORCE_SECRET=true.');
  }

  const secretKey = env.DOKU_SECRET_KEY;
  const ourClientId = env.DOKU_CLIENT_ID || env.VITE_DOKU_CLIENT_ID;

  // ── Gerbang 2: deteksi format lalu validasi sesuai formatnya ──────────────
  // SNAP (Sub Account/SAC): CHANNEL-ID: H2H + X-PARTNER-ID
  // SNAP B2B (Payouts):     X-Client-Key + X-Signature + X-Timestamp
  // Jokul (legacy):         Client-Id + Signature (HMAC-SHA256)
  const channelId = headers.get('CHANNEL-ID') || headers.get('Channel-Id');
  const isSnapFormat = channelId === 'H2H' || headers.get('X-PARTNER-ID') || headers.get('X-Partner-Id');

  const xClientKey = headers.get('x-client-key') || headers.get('X-Client-Key');
  const xSignature = headers.get('x-signature') || headers.get('X-Signature');
  const xTimestamp = headers.get('x-timestamp') || headers.get('X-Timestamp');
  const isSnapB2BFormat = !!xClientKey && !!xSignature && !!xTimestamp;

  if (isSnapFormat) {
    // DOKU SNAP VA tidak mengirim Signature dalam format HMAC yang sama, jadi
    // validasinya lewat kecocokan X-PARTNER-ID dengan Client ID kita.
    const snapPartnerId = headers.get('X-PARTNER-ID') || headers.get('X-Partner-Id');
    const snapExternalId = headers.get('X-EXTERNAL-ID') || headers.get('X-External-Id');
    const snapTimestamp = headers.get('X-TIMESTAMP') || headers.get('X-Timestamp');

    console.log(`[SNAP Webhook] CHANNEL-ID: ${channelId}, X-PARTNER-ID: ${snapPartnerId}, X-EXTERNAL-ID: ${snapExternalId}, X-TIMESTAMP: ${snapTimestamp}`);
    console.log(`[SNAP Webhook] Signature headers (logged, not enforced): X-SIGNATURE: ${headers.get('X-SIGNATURE') || headers.get('X-Signature')}`);

    if (!snapPartnerId || !snapExternalId || !snapTimestamp) {
      console.error('[SNAP Webhook] Missing required SNAP headers');
      return { ok: false, httpStatus: 401, error: 'Missing SNAP headers', detail: 'Header SNAP wajib tidak lengkap.' };
    }

    // Fail-closed: tanpa DOKU_CLIENT_ID kita tidak bisa memvalidasi siapa pun.
    if (!ourClientId || snapPartnerId !== ourClientId) {
      console.error(`[SNAP Webhook] X-PARTNER-ID mismatch or DOKU_CLIENT_ID unset: got ${snapPartnerId}`);
      return { ok: false, httpStatus: 401, error: 'Partner ID mismatch', detail: `X-PARTNER-ID tidak cocok (dapat ${snapPartnerId}) atau DOKU_CLIENT_ID kosong.` };
    }

    console.log('[SNAP Webhook] Validated OK via X-PARTNER-ID match');
    return { ok: true, format: 'snap' };
  }

  if (isSnapB2BFormat) {
    console.log(`[SNAP B2B Webhook] X-CLIENT-KEY: ${xClientKey}, X-TIMESTAMP: ${xTimestamp}`);

    if (!ourClientId || xClientKey !== ourClientId) {
      console.error(`[SNAP B2B Webhook] X-CLIENT-KEY mismatch or DOKU_CLIENT_ID unset: got ${xClientKey}`);
      return { ok: false, httpStatus: 401, error: 'Client Key mismatch', detail: `X-CLIENT-KEY tidak cocok (dapat ${xClientKey}) atau DOKU_CLIENT_ID kosong.` };
    }

    console.log('[SNAP B2B Webhook] Validated OK via X-CLIENT-KEY match');
    return { ok: true, format: 'snap_b2b' };
  }

  // ── Jokul (legacy HMAC-SHA256) ────────────────────────────────────────────
  const incomingSignature = headers.get('Signature');
  const clientId = headers.get('Client-Id');
  const requestId = headers.get('Request-Id');
  const requestTimestamp = headers.get('Request-Timestamp');

  if (!incomingSignature || !clientId || !requestId || !requestTimestamp || !secretKey) {
    console.error('Missing required Jokul webhook headers or secret key', {
      incomingSignature: !!incomingSignature,
      clientId: !!clientId,
      requestId: !!requestId,
      requestTimestamp: !!requestTimestamp,
      secretKey: !!secretKey,
    });
    return { ok: false, httpStatus: 401, error: 'Unauthorized or missing headers', detail: 'Header Jokul wajib / DOKU_SECRET_KEY tidak lengkap.' };
  }

  const requestTarget = new URL(requestUrl).pathname;

  // 1. Digest: Base64(SHA256(Raw Request Body))
  const enc = new TextEncoder();
  const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(rawBodyText));
  const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signFor = async (target) => {
    const stringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${target}\nDigest:${digest}`;
    const buf = await crypto.subtle.sign('HMAC', key, enc.encode(stringToSign));
    return 'HMACSHA256=' + btoa(String.fromCharCode(...new Uint8Array(buf)));
  };

  const mySignature = await signFor(requestTarget);
  if (incomingSignature !== mySignature) {
    console.error('Signature mismatch!');
    console.error('Incoming:', incomingSignature);
    console.error('Calculated:', mySignature);

    // Fallback kalau yang beda hanya trailing slash pada Request-Target.
    const fallbackTarget = requestTarget.endsWith('/') ? requestTarget.slice(0, -1) : requestTarget + '/';
    if (incomingSignature !== (await signFor(fallbackTarget))) {
      return { ok: false, httpStatus: 401, error: 'Invalid Signature', detail: 'Signature Jokul tidak cocok (termasuk varian trailing slash).' };
    }
  }

  return { ok: true, format: 'jokul' };
}

export async function onRequest(context) {
  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    });
  }

  // ======================================================================
  // SATU PINTU MASUK, SATU TITIK PENCATATAN.
  //
  // Badan request dibaca DULUAN supaya penolakan pun bisa menyebut nomor
  // invoice-nya. Itu aman: `verifyDokuAuth` tidak mempercayai isinya — badan
  // cuma dipakai untuk menghitung digest Jokul dan untuk memberi nama pada
  // baris audit. Urutan "cek secret SEBELUM deteksi format" tetap dijaga, kini
  // di dalam fungsi itu.
  // ======================================================================
  let rawBodyText = '';
  try {
    rawBodyText = await context.request.text();

    const auth = await verifyDokuAuth({
      headers: context.request.headers,
      requestUrl: context.request.url,
      env: context.env,
      rawBodyText,
    });

    if (!auth.ok) {
      return await rejectAndLog(context, {
        rawBodyText,
        outcome: REJECT_OUTCOMES.auth,
        httpStatus: auth.httpStatus,
        errorMessage: auth.detail,
        responseBody: { error: auth.error },
      });
    }

    // Dulu `JSON.parse` telanjang di sini: badan yang bukan JSON jatuh ke catch
    // terluar, dibalas 500 TANPA jejak, lalu DOKU retry 5x untuk sesuatu yang
    // tidak akan pernah berubah. Sekarang 400 + tercatat.
    let requestData;
    try {
      requestData = JSON.parse(rawBodyText);
    } catch (parseErr) {
      return await rejectAndLog(context, {
        rawBodyText,
        outcome: REJECT_OUTCOMES.payload,
        httpStatus: 400,
        errorMessage: `Badan request bukan JSON: ${parseErr?.message || parseErr}`,
        responseBody: { error: 'Invalid JSON body' },
      });
    }
    console.log('Valid DOKU Webhook received:', JSON.stringify(requestData));

    // ─── Payout Webhook Handler ──────────────────────────────────────
    // If the request contains a payout object, update doku_payouts and return 200
    if (requestData.payout) {
      const payoutInvoice = requestData.payout.invoice_number;
      const payoutStatus = requestData.payout.status;
      console.log(`[Webhook Payout] Payout callback received. Invoice: ${payoutInvoice}, Status: ${payoutStatus}`);
      
      let payoutError = null;
      if (payoutInvoice) {
        try {
          const sb = resolveSupabase(context.env);
          console.log(`[Webhook Payout] Updating doku_payouts status for invoice ${payoutInvoice} to ${payoutStatus}`);
          await sbFetch(
            `${sb.url}/rest/v1/doku_payouts?invoice_number=eq.${encodeURIComponent(payoutInvoice)}`,
            {
              method: 'PATCH',
              headers: sb.headers,
              body: JSON.stringify({ status: payoutStatus })
            },
            'payout PATCH doku_payouts'
          );
        } catch (dbError) {
          // Payout bukan jalur penerimaan pembayaran, jadi tetap balas 200 —
          // tapi jangan lagi hilang tanpa jejak seperti dulu.
          payoutError = dbError?.message || String(dbError);
          console.error('[Webhook Payout] Error updating doku_payouts table:', dbError);
        }
      }

      await recordWebhookEvent(context.env, {
        invoiceNumber: payoutInvoice,
        dokuStatus: payoutStatus,
        outcome: 'payout',
        httpStatus: 200,
        errorMessage: payoutError,
        rawPayload: requestData
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Payout webhook processed successfully',
        invoiceNumber: payoutInvoice,
        status: payoutStatus
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // ─── End Payout Webhook Handler ──────────────────────────────────

    // ─── Jakpat Mission Router ───────────────────────────────────────
    // Forward JM-* invoices to jakpatmission worker, then return 200.
    // All existing jakpatforuniv logic below is untouched.
    const jmInvoice = requestData.order?.invoice_number || requestData.trxId || '';
    if (jmInvoice.startsWith('JM-')) {
      console.log(`[Webhook Router] Forwarding JM invoice to jakpatmission: ${jmInvoice}`);
      let forwardError = null;
      try {
        const forwardRes = await fetch(
          'https://jakpatmission.product-d79.workers.dev/api/doku/webhook',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rawBodyText,
          }
        );
        console.log(`[Webhook Router] Forward response: ${forwardRes.status}`);
        if (!forwardRes.ok) {
          forwardError = `jakpatmission membalas HTTP ${forwardRes.status}`;
        }
      } catch (fwdError) {
        forwardError = fwdError?.message || String(fwdError);
        console.error('[Webhook Router] Forward failed:', fwdError);
      }

      // jakpatmission punya database & dashboard sendiri, jadi kegagalan forward
      // tidak dialertkan di sini — cukup dicatat supaya bisa ditelusuri.
      await recordWebhookEvent(context.env, {
        invoiceNumber: jmInvoice,
        outcome: 'forwarded_jm',
        httpStatus: 200,
        errorMessage: forwardError,
        rawPayload: requestData
      });

      // Always return 200 to DOKU regardless of forward result
      return new Response(JSON.stringify({
        success: true, forwarded: true, to: 'jakpatmission', invoiceNumber: jmInvoice
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // ─── End Jakpat Mission Router ───────────────────────────────────

    // Ekstrak data pembayaran dari webhook DOKU (mendukung format Jokul maupun SNAP)
    const invoiceNumber = requestData.order?.invoice_number || requestData.trxId;
    const amount = requestData.order?.amount || requestData.paidAmount?.value;
    const status = requestData.transaction?.status || requestData.order?.status || (requestData.trxId ? 'SUCCESS' : '');

    // Actual payment channel the customer used (QRIS / Virtual Account / e-wallet
    // / card / retail outlet). DOKU reports this in the success notification.
    // We capture the most specific identifier available across Jokul and SNAP
    // notification shapes and store the raw code; the frontend maps it to a
    // friendly label. `channel.id` (e.g. "VIRTUAL_ACCOUNT_BCA", "QRIS") is the
    // most descriptive; fall back to service/acquirer/SNAP fields.
    // Jokul checkout notifications carry channel.id; some shapes only carry
    // service.id + acquirer.id (e.g. VIRTUAL_ACCOUNT + BSI → combine them);
    // SNAP VA notifications use virtualAccountData / additionalInfo.channelCode.
    // formatPaymentChannel() on the frontend maps whatever raw code we store
    // to a friendly label and prettifies unknown codes.
    const serviceId = requestData.service?.id || null;
    const acquirerId = requestData.acquirer?.id || null;
    const paymentChannel =
      requestData.channel?.id ||
      (serviceId && acquirerId ? `${serviceId}_${acquirerId}` : serviceId || acquirerId) ||
      requestData.additionalInfo?.channel ||
      requestData.additionalInfo?.channelCode ||
      (requestData.virtualAccountData ? 'VIRTUAL_ACCOUNT' : null) ||
      requestData.paymentType ||
      null;

    if (!paymentChannel && (status === 'SUCCESS' || status === 'PAID')) {
      // A paid notification whose channel we couldn't extract = a payload
      // shape we haven't seen; dump it so the chain above can be extended.
      console.warn('[Webhook] Could not extract payment channel from a success notification. Full payload:', JSON.stringify(requestData));
    }

    if (!invoiceNumber) {
      console.error('Invoice Number / Payment ID not found in webhook data');
      return await rejectAndLog(context, {
        rawBodyText,
        outcome: REJECT_OUTCOMES.payload,
        httpStatus: 400,
        errorMessage: 'Payload lolos autentikasi tapi tidak memuat order.invoice_number maupun trxId.',
        responseBody: { error: 'Invoice Number not found' },
      });
    }

    console.log(`Webhook DOKU: Invoice: ${invoiceNumber}, Status: ${status}`);

    // Map status DOKU ke status aplikasi
    let appStatus = 'pending';

    // DOKU menggunakan SUCCESS untuk berhasil
    if (status === 'SUCCESS' || status === 'PAID') {
      appStatus = 'completed';
    } else if (status === 'FAILED' || status === 'EXPIRED') {
      appStatus = 'failed';
    } else {
      appStatus = 'pending';
    }

    console.log(`Payment ${invoiceNumber} status updated to ${appStatus}${paymentChannel ? `, channel: ${paymentChannel}` : ''}`);

    // ======================================================================
    // FASE TULIS DB — setiap kegagalan sekarang punya nama, jejak, dan akibat.
    // ======================================================================
    let outcome = 'ok';
    let errorMessage = null;
    try {
      const result = await processPaymentUpdate(context.env, {
        invoiceNumber,
        amount,
        appStatus,
        paymentChannel
      });
      outcome = result.outcome;
      errorMessage = result.errorMessage || null;
    } catch (dbError) {
      // Dulu blok ini hanya console.error lalu tetap balas 200 — itu persis
      // yang membuat pembayaran hilang diam-diam pada insiden 2026-08-10.
      // Sekarang ia punya akibat: baris audit, email, dan retry dari DOKU.
      console.error('Error updating database:', dbError);
      outcome = 'write_failed';
      errorMessage = dbError?.message || String(dbError);
    }

    // Hanya kegagalan TULIS yang layak di-retry DOKU. amount_mismatch dan
    // no_submission_found adalah masalah data — mengulanginya tidak mengubah
    // apa pun, hanya membuang percobaan dan membanjiri log.
    let httpStatus = 200;
    let attempt = null;
    if (outcome === 'write_failed') {
      const priorFailures = await countPriorWriteFailures(context.env, invoiceNumber);
      attempt = priorFailures + 1;
      httpStatus = attempt < MAX_WRITE_ATTEMPTS ? 500 : 200;
      console.error(
        `[Webhook] Tulis DB gagal untuk ${invoiceNumber} (percobaan ${attempt}/${MAX_WRITE_ATTEMPTS}) — membalas HTTP ${httpStatus}. ${errorMessage}`
      );
    }

    await recordWebhookEvent(context.env, {
      invoiceNumber,
      dokuStatus: status,
      appStatus,
      paymentChannel,
      amount,
      outcome,
      httpStatus,
      errorMessage,
      rawPayload: requestData
    });

    // Alert hanya untuk yang butuh manusia. Untuk write_failed cukup pada
    // percobaan PERTAMA — kalau tidak, retry DOKU berubah jadi banjir email.
    const needsAlert =
      outcome === 'amount_mismatch' ||
      outcome === 'no_submission_found' ||
      (outcome === 'write_failed' && attempt === 1);

    if (needsAlert) {
      const alertPromise = sendWebhookAlert(context.env, {
        invoiceNumber,
        outcome,
        errorMessage,
        amount,
        dokuStatus: status,
        paymentChannel,
        httpStatus,
        attempt
      });
      // waitUntil supaya email tidak menambah latensi balasan ke DOKU.
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(alertPromise);
      } else {
        await alertPromise;
      }
    }

    return new Response(JSON.stringify({
      success: outcome === 'ok',
      message: outcome === 'ok'
        ? 'Webhook received and processed successfully'
        : `Webhook received but not fully processed (${outcome})`,
      invoiceNumber,
      status: appStatus,
      outcome
    }), {
      status: httpStatus,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Crash tak terduga di handler. Dulu ini pun tidak meninggalkan jejak:
    // balas 500, DOKU retry 5x, menyerah, dan kalau errornya deterministik
    // (mis. bentuk payload baru yang bikin kode ini melempar) pembayarannya
    // hilang persis seperti insiden 2026-08-10 — tanpa satu baris pun untuk
    // ditelusuri. 500 tetap dipertahankan supaya DOKU retry; yang ditambahkan
    // hanya jejaknya.
    console.error('Error processing DOKU webhook:', error);

    return await rejectAndLog(context, {
      rawBodyText,
      outcome: REJECT_OUTCOMES.crash,
      httpStatus: 500, // Walaupun DOKU butuh 200, jika error syntax/kode harus 500
      errorMessage: error?.stack || error?.message || String(error),
      responseBody: {
        success: false,
        message: 'Error processing webhook: ' + error.message,
      },
    });
  }
}

// ============================================================================
// Helper Supabase
// ============================================================================

/**
 * FAIL-CLOSED. Dulu di sini ada rantai
 * `SERVICE_ROLE_KEY || VITE_ANON_KEY || ANON_KEY` — artinya kalau service key
 * hilang, webhook diam-diam turun ke anon key, SETIAP tulis ditolak RLS, dan
 * kita tetap membalas 200. Ranjau persis sejenis insiden 2026-08-10. Sekarang
 * ketiadaan service key adalah error yang terdengar.
 */
function resolveSupabase(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('VITE_SUPABASE_URL/SUPABASE_URL tidak ada di environment');
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY tidak ada di environment — webhook menolak turun ke anon key ' +
      '(semua tulis akan ditolak RLS tanpa suara)'
    );
  }

  return {
    url,
    key,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  };
}

/**
 * `fetch` yang benar-benar gagal ketika Supabase menolak.
 *
 * `fetch` bawaan hanya menolak pada error jaringan — HTTP 401/404/500 lewat
 * sebagai resolusi normal. Setiap panggilan PostgREST di file ini WAJIB lewat
 * sini; itu satu-satunya alasan blok `catch` di onRequest sekarang berfungsi.
 */
async function sbFetch(url, init, label) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} gagal — HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return res;
}

/**
 * PATCH yang memastikan ada baris yang benar-benar berubah.
 *
 * PostgREST membalas 200 + `[]` ketika filter tidak cocok dengan baris mana pun.
 * Dari luar itu tampak persis seperti sukses — dan itulah bentuk kegagalan yang
 * paling berbahaya di sini, karena uang sudah diterima tapi tidak ada status
 * yang berpindah.
 */
async function sbPatchExpectingRows(sb, path, body, label) {
  const res = await sbFetch(
    `${sb.url}/rest/v1/${path}`,
    {
      method: 'PATCH',
      headers: { ...sb.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    },
    label
  );
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`${label} tidak mengubah baris apa pun (0 baris cocok dengan filternya)`);
  }
  return rows;
}

// ============================================================================
// Fase tulis DB — STEP 0..5
//
// Melempar error kalau ada tulis yang gagal; onRequest menerjemahkannya jadi
// outcome 'write_failed' + HTTP 500 supaya DOKU retry. Mengembalikan outcome
// non-'ok' untuk kegagalan yang retry-nya TIDAK akan menolong.
// ============================================================================
async function processPaymentUpdate(env, { invoiceNumber, amount, appStatus, paymentChannel }) {
  const sb = resolveSupabase(env);
  const encodedInvoice = encodeURIComponent(invoiceNumber);

  // ====================================================================
  // STEP 0: AMOUNT VERIFICATION — must happen BEFORE any DB write.
  // The transactions PATCH below is the first write; if this check came
  // after it, a forged webhook could still flip transactions.status to
  // 'completed' even though the invoice stays unpaid.
  // SNAP sends paidAmount.value as a decimal STRING (e.g. "10000.00"),
  // so compare with Number() on BOTH sides.
  // ====================================================================
  const invAmountRes = await sbFetch(
    `${sb.url}/rest/v1/invoices?payment_id=eq.${encodedInvoice}&select=amount&limit=1`,
    { headers: sb.headers },
    'STEP 0 SELECT invoices.amount'
  );
  const invAmountRows = await invAmountRes.json();
  let expectedAmount = Array.isArray(invAmountRows) && invAmountRows.length > 0
    ? Number(invAmountRows[0].amount)
    : null;

  // Legacy rows may exist only in transactions (pre-invoices flow).
  if (expectedAmount === null) {
    const txnAmountRes = await sbFetch(
      `${sb.url}/rest/v1/transactions?payment_id=eq.${encodedInvoice}&select=amount&limit=1`,
      { headers: sb.headers },
      'STEP 0 SELECT transactions.amount'
    );
    const txnAmountRows = await txnAmountRes.json();
    expectedAmount = Array.isArray(txnAmountRows) && txnAmountRows.length > 0
      ? Number(txnAmountRows[0].amount)
      : null;
  }

  if (expectedAmount !== null && !Number.isNaN(expectedAmount)) {
    const webhookAmount = Number(amount);
    if (Number.isNaN(webhookAmount) || webhookAmount !== expectedAmount) {
      // Do NOT write anything. Retry tidak akan menolong — angkanya memang
      // beda — jadi balas 200 dan panggil admin lewat alert.
      console.error(`[Webhook] AMOUNT MISMATCH for ${invoiceNumber}: webhook amount=${JSON.stringify(amount)}, expected=${expectedAmount}. No DB writes performed. Raw payload was logged above.`);
      return {
        outcome: 'amount_mismatch',
        errorMessage: `Webhook membawa ${JSON.stringify(amount)}, invoice di database bernilai ${expectedAmount}. Tidak ada yang ditulis.`
      };
    }
  }

  // ====================================================================
  // STEP 1: Try to find form_submission_id from transactions OR invoices
  // ====================================================================
  let formSubmissionId = null;

  // 1a. Try transactions first (Scenario A: user pays directly after submit)
  // 0 baris di sini SAH — itu Skenario B (invoice dibuat admin, tanpa baris
  // transactions; terukur 17 invoice seperti itu per 2026-08-10). Karena itu
  // yang ini TIDAK memakai sbPatchExpectingRows, tapi tetap wajib res.ok.
  const transactionUpdate = { status: appStatus };
  // Record the channel when DOKU provides it (kept separate from the gateway).
  if (paymentChannel) {
    transactionUpdate.payment_channel = paymentChannel;
  }
  const updateTransactionResponse = await sbFetch(
    `${sb.url}/rest/v1/transactions?payment_id=eq.${encodedInvoice}`,
    {
      method: 'PATCH',
      headers: { ...sb.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(transactionUpdate)
    },
    'STEP 1a PATCH transactions'
  );
  const updatedTransactions = await updateTransactionResponse.json();

  if (Array.isArray(updatedTransactions) && updatedTransactions.length > 0) {
    formSubmissionId = updatedTransactions[0].form_submission_id;
    console.log(`Found form_submission_id from transactions: ${formSubmissionId}`);
  }

  // 1b. If no transaction found, look up invoice directly (Scenario B: admin-created invoice)
  if (!formSubmissionId) {
    console.log(`No transaction found for payment_id ${invoiceNumber}, checking invoices table...`);
    const invoiceLookupRes = await sbFetch(
      `${sb.url}/rest/v1/invoices?payment_id=eq.${encodedInvoice}&select=form_submission_id,entity_type,extend_id&limit=1`,
      { headers: sb.headers },
      'STEP 1b SELECT invoices'
    );
    const invoiceLookup = await invoiceLookupRes.json();
    if (Array.isArray(invoiceLookup) && invoiceLookup.length > 0) {
      formSubmissionId = invoiceLookup[0].form_submission_id;
      console.log(`Found form_submission_id from invoices: ${formSubmissionId}`);
    }
  }

  if (!formSubmissionId) {
    // DOKU menerima uang untuk invoice yang tidak kita kenal. Retry tidak akan
    // memunculkan barisnya — ini butuh manusia menelusuri, bukan mesin mengulang.
    console.error(`Could not find form_submission_id for payment_id ${invoiceNumber} in either transactions or invoices!`);
    return {
      outcome: 'no_submission_found',
      errorMessage: `Invoice ${invoiceNumber} tidak ada di transactions maupun invoices.`
    };
  }

  // ====================================================================
  // STEP 2: Update invoice status by payment_id
  // ====================================================================
  //
  // 0 baris di sini SAH — alasannya persis sama dengan STEP 1a, dan dulu blok
  // ini tidak mengikutinya. `sbPatchExpectingRows` MELEMPAR saat 0 baris cocok,
  // padahal ada satu kelas pembayaran yang barisnya memang hanya ada di
  // `transactions`: `create-payment.js` baru mulai menulis `invoices` sejak
  // 2026-07-01, dan sisipan gandanya boleh gagal separuh. Terukur 2026-08-19:
  // 243 transaksi tanpa invoice pasangan, 162 masih `pending`.
  //
  // Akibat lemparannya bukan kecil: write_failed -> HTTP 500 -> DOKU retry 5x
  // -> menyerah. Uang sudah diterima, `form_submissions.payment_status` tidak
  // pernah berpindah, dan ordernya terdampar sampai ada manusia turun tangan.
  //
  // Jadi: 0 baris ditoleransi HANYA kalau STEP 1a menemukan transaksinya.
  // Kalau dua-duanya kosong, itu kegagalan sungguhan — biarkan melempar.
  const invoicePatchRes = await sbFetch(
    `${sb.url}/rest/v1/invoices?payment_id=eq.${encodedInvoice}`,
    {
      method: 'PATCH',
      headers: { ...sb.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        status: appStatus === 'completed' ? 'paid' : appStatus,
        paid_at: appStatus === 'completed' ? new Date().toISOString() : null
      })
    },
    'STEP 2 PATCH invoices'
  );
  const invoiceUpdateData = await invoicePatchRes.json();
  const paidInvoice = Array.isArray(invoiceUpdateData) && invoiceUpdateData.length > 0
    ? invoiceUpdateData[0]
    : null;
  const paidTransaction = Array.isArray(updatedTransactions) && updatedTransactions.length > 0
    ? updatedTransactions[0]
    : null;

  if (!paidInvoice && !paidTransaction) {
    // Tidak terjangkau lewat STEP 1 (yang sudah pulang lebih awal kalau kedua
    // tabel kosong), tapi ditulis eksplisit supaya invariannya dijaga mesin,
    // bukan diingat orang.
    throw new Error(
      `STEP 2 PATCH invoices tidak mengubah baris apa pun dan STEP 1a juga tidak ` +
      `menemukan transaksi untuk ${invoiceNumber}`
    );
  }
  if (!paidInvoice) {
    console.warn(
      `[Webhook] ${invoiceNumber} tidak punya baris invoices — dilanjutkan dari transactions saja.`
    );
  }
  console.log('Invoice PATCH:', JSON.stringify(invoiceUpdateData));

  // ====================================================================
  // STEP 3: Apakah JADWAL INI lunas? — bukan "apakah ORDER ini lunas?"
  // ====================================================================
  //
  // Dulu blok ini mengambil `invoices?form_submission_id=eq.…` terbaru tanpa
  // filter apa pun, lalu STEP 4 memakai statusnya untuk menulis
  // `payment_status`. Sebelum Task 13 itu hampir selalu benar karena satu order
  // hanya punya satu tagihan hidup. Sekarang tidak: `canTopUp` di
  // ScheduleCardList berlingkup PER JADWAL, jadi satu order boleh punya dua
  // tagihan terbuka sekaligus.
  //
  // Bayar yang lebih tua -> yang terpungut yang lebih baru dan masih `pending`
  // -> order ditulis `pending` PADAHAL UANGNYA MASUK, dan `submission_status`
  // tidak pernah jadi 'paid'. Yang ikut mati di hilirnya: ensure_survey_page()
  // (halaman iklan tidak lahir), notify_primary_ads_live() +
  // notify_primary_ads_completed() (keduanya menyaring payment_status='paid'),
  // dan gerbang 409 di create-payment.
  //
  // Baris yang BARUSAN dibayar sudah ada di tangan lewat `return=representation`
  // di STEP 2 — termasuk `schedule_id`-nya. Dipakai, bukan diambil ulang.
  const paidScheduleId = paidInvoice?.schedule_id ?? paidTransaction?.schedule_id ?? null;
  // Baris lama sebelum sql/51 ber-schedule_id NULL. Untuk mereka pertahankan
  // perilaku lama supaya tidak ada regresi pada data historis.
  const scopeFilter = paidScheduleId
    ? `schedule_id=eq.${encodeURIComponent(paidScheduleId)}`
    : `form_submission_id=eq.${formSubmissionId}`;
  const latestInvoiceRes = await sbFetch(
    `${sb.url}/rest/v1/invoices?${scopeFilter}&order=created_at.desc&limit=1`,
    { headers: sb.headers },
    'STEP 3 SELECT invoice terbaru'
  );
  const latestInvoices = await latestInvoiceRes.json();
  console.log(
    `Latest invoice SELECT (lingkup: ${paidScheduleId ? `schedule ${paidScheduleId}` : `order ${formSubmissionId}`}):`,
    JSON.stringify(latestInvoices)
  );

  // ====================================================================
  // STEP 4: Determine form payment_status from latest invoice
  // ====================================================================
  let formPaymentStatus = appStatus === 'completed' ? 'paid' : appStatus;
  let formSubmissionStatus = appStatus === 'completed' ? 'paid' : undefined;

  if (Array.isArray(latestInvoices) && latestInvoices.length > 0) {
    const latestStatus = latestInvoices[0].status;
    formPaymentStatus = latestStatus === 'paid' ? 'paid' : (latestStatus || 'pending');
    formSubmissionStatus = latestStatus === 'paid' ? 'paid' : undefined;
  }

  // ====================================================================
  // STEP 5: Route update based on entity_type (extend vs submission)
  // ====================================================================
  const txn = paidTransaction;
  const isExtendPayment = txn && txn.entity_type === 'extend' && txn.extend_id;

  if (isExtendPayment) {
    // ───── EXTEND PAYMENT ─────
    // Langsung ke `ad_schedules`, bukan lagi lewat view `form_submissions_extend`
    // (langkah contract Task 11). Dua pemetaan yang WAJIB dibawa:
    //   view.id                → source_id  (BUKAN ad_schedules.id)
    //   view.submission_status → status
    // dan filter `source_table` yang dulu dikerjakan view harus ikut eksplisit,
    // kalau tidak `source_id` bisa bertabrakan dengan id jadwal ordinal 1.
    //
    // Yang HILANG dan memang boleh hilang: `extend_view_update()` ikut
    // menyegarkan `review_status` dari induk. Di jalur ini induknya tidak
    // disentuh, jadi anaknya sudah sinkron sebelum & sesudah — terukur nol
    // baris menyimpang 2026-08-30. Propagasi tetap dijaga
    // `sync_ad_schedule_from_submission` saat induk yang berubah.
    console.log(`[Extend] Updating extend ${txn.extend_id} payment_status to ${formPaymentStatus}`);
    await sbPatchExpectingRows(
      sb,
      `ad_schedules?source_table=eq.form_submissions_extend&source_id=eq.${txn.extend_id}`,
      {
        payment_status: formPaymentStatus,
        ...(formSubmissionStatus === 'paid' ? { status: 'scheduled' } : {})
      },
      'STEP 5 PATCH ad_schedules (jadwal ke-2 dst.)'
    );

    // Check if banner update is needed (new rewards = new banner).
    // Efek sekunder: sengaja ditelan sendiri supaya kegagalannya tidak membuat
    // pembayaran yang SUDAH tercatat lunas ikut dianggap gagal & di-retry.
    if (formPaymentStatus === 'paid') {
      try {
        // ⚠️ `is_new_month` pada view = `is_new_period` pada ad_schedules.
        const extRes = await sbFetch(
          `${sb.url}/rest/v1/ad_schedules?source_table=eq.form_submissions_extend&source_id=eq.${txn.extend_id}&select=is_new_period,additional_prize_per_winner`,
          { headers: sb.headers },
          'STEP 5 SELECT jadwal ke-2 dst. untuk cek banner'
        );
        const extData = await extRes.json();
        const ext = Array.isArray(extData) && extData.length > 0 ? extData[0] : null;
        if (ext && (ext.is_new_period || (ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0))) {
          console.log(`[Extend] Setting requires_banner_update=true for submission ${formSubmissionId}`);
          await sbFetch(
            `${sb.url}/rest/v1/survey_pages?submission_id=eq.${formSubmissionId}`,
            {
              method: 'PATCH',
              headers: sb.headers,
              body: JSON.stringify({ requires_banner_update: true })
            },
            'STEP 5 PATCH survey_pages.requires_banner_update'
          );
        }
      } catch (extErr) {
        console.error('[Extend] Error checking banner update:', extErr);
      }
    }
  } else {
    // ───── REGULAR SUBMISSION PAYMENT ─────
    console.log(`Updating form ${formSubmissionId} payment_status to ${formPaymentStatus} (based on latest invoice)`);
    await sbPatchExpectingRows(
      sb,
      `form_submissions?id=eq.${formSubmissionId}`,
      {
        payment_status: formPaymentStatus,
        ...(formSubmissionStatus ? { submission_status: formSubmissionStatus } : {})
      },
      'STEP 5 PATCH form_submissions'
    );

    // Record a one-time voucher redemption (e.g. ILKOMUNY) on confirmed
    // payment. The UNIQUE(auth_user_id, voucher_code) constraint in
    // voucher_redemptions (sql/35) is the authoritative "once per account"
    // gate; ignore-duplicates makes a repeat a harmless no-op.
    // Efek sekunder — ditelan sendiri, alasan sama seperti blok banner di atas.
    if (formPaymentStatus === 'paid') {
      try {
        const subRes = await sbFetch(
          `${sb.url}/rest/v1/form_submissions?id=eq.${formSubmissionId}&select=auth_user_id,voucher_code&limit=1`,
          { headers: sb.headers },
          'SELECT voucher_code'
        );
        const subRows = await subRes.json();
        const sub = Array.isArray(subRows) && subRows.length > 0 ? subRows[0] : null;
        const code = sub && sub.voucher_code ? String(sub.voucher_code).toUpperCase() : null;
        const LIMITED_VOUCHERS = ['ILKOMUNY'];
        if (sub && sub.auth_user_id && code && LIMITED_VOUCHERS.includes(code)) {
          const vrRes = await fetch(`${sb.url}/rest/v1/voucher_redemptions`, {
            method: 'POST',
            headers: { ...sb.headers, 'Prefer': 'resolution=ignore-duplicates' },
            body: JSON.stringify({
              auth_user_id: sub.auth_user_id,
              voucher_code: code,
              form_submission_id: formSubmissionId
            })
          });
          if (!vrRes.ok) {
            const vrText = await vrRes.text();
            console.warn(`[Webhook] voucher_redemptions insert non-OK (${vrRes.status}) for user ${sub.auth_user_id} / ${code}: ${vrText}`);
          }
        }
      } catch (vrErr) {
        console.error('[Webhook] Error recording voucher redemption:', vrErr);
      }
    }
  }

  return { outcome: 'ok' };
}

// ============================================================================
// Jejak permanen — doku_webhook_events (sql/54)
// ============================================================================

/**
 * Berapa kali invoice ini sudah gagal ditulis dan belum diselesaikan.
 * Dipakai untuk membatasi retry DOKU. Kalau query-nya sendiri gagal (Supabase
 * benar-benar mati), kembalikan 0 — artinya kita tetap meminta retry, yang
 * memang perilaku yang diinginkan saat gangguan transien.
 */
/**
 * Satu-satunya cara keluar untuk request yang DITOLAK — mencatat dulu, baru
 * membalas.
 *
 * Ada supaya "tidak ada baris" kembali berarti satu hal saja: DOKU memang tidak
 * pernah menelepon. Selama penolakan bisa `return` sendiri-sendiri, kalimat itu
 * ambigu, dan ambiguitasnya mahal (lihat blok REJECT_OUTCOMES di atas).
 *
 * ⚠️ Endpoint ini publik, jadi ini juga jalur banjir: siapa pun bisa mem-POST
 * sampah dan menumbuhkan tabel. Dua pembatasnya: `raw_payload` HANYA disimpan
 * kalau badannya JSON yang sah dan di bawah RAW_PAYLOAD_MAX_CHARS (sampah acak
 * dari pemindai internet tidak lolos keduanya), dan penolakan TIDAK pernah
 * memicu email alert — kalau tidak, satu pemindai bisa jadi badai email.
 * Kalau tabelnya tetap tumbuh liar, saring per outcome sebelum membuang jejaknya.
 */
const RAW_PAYLOAD_MAX_CHARS = 20_000;

async function rejectAndLog(context, { rawBodyText, outcome, httpStatus, errorMessage, responseBody }) {
  let rawPayload = null;
  if (typeof rawBodyText === 'string' && rawBodyText.length > 0 && rawBodyText.length <= RAW_PAYLOAD_MAX_CHARS) {
    try {
      rawPayload = JSON.parse(rawBodyText);
    } catch {
      rawPayload = null; // bukan JSON — cukup dicatat lewat error_message
    }
  }

  await recordWebhookEvent(context.env, {
    invoiceNumber: sniffInvoiceNumber(rawBodyText),
    outcome,
    httpStatus,
    errorMessage,
    rawPayload,
  });

  return new Response(JSON.stringify(responseBody), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function countPriorWriteFailures(env, invoiceNumber) {
  if (!invoiceNumber) return 0;
  try {
    const sb = resolveSupabase(env);
    const res = await sbFetch(
      `${sb.url}/rest/v1/doku_webhook_events` +
      `?invoice_number=eq.${encodeURIComponent(invoiceNumber)}` +
      `&outcome=eq.write_failed&resolved_at=is.null&select=id&limit=${MAX_WRITE_ATTEMPTS + 1}`,
      { headers: sb.headers },
      'SELECT doku_webhook_events (hitung kegagalan)'
    );
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.error('[Webhook] Gagal menghitung kegagalan sebelumnya:', err);
    return 0;
  }
}

/**
 * Satu baris per notifikasi DOKU yang lolos autentikasi.
 *
 * TIDAK PERNAH melempar: kegagalan mencatat tidak boleh menjatuhkan webhook
 * yang sebenarnya berhasil. Kalau ini pun gagal, alert email tetap jadi lapisan
 * terakhir — ia tidak bergantung pada Supabase sama sekali.
 */
async function recordWebhookEvent(env, event) {
  try {
    const sb = resolveSupabase(env);
    const numericAmount = Number(event.amount);

    await sbFetch(
      `${sb.url}/rest/v1/doku_webhook_events`,
      {
        method: 'POST',
        headers: { ...sb.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          invoice_number: event.invoiceNumber || null,
          doku_status: event.dokuStatus || null,
          app_status: event.appStatus || null,
          payment_channel: event.paymentChannel || null,
          amount: Number.isFinite(numericAmount) ? numericAmount : null,
          outcome: event.outcome,
          http_status: event.httpStatus,
          error_message: event.errorMessage || null,
          raw_payload: event.rawPayload ?? null
        })
      },
      'INSERT doku_webhook_events'
    );

    // Percobaan yang berhasil membersihkan jejak kegagalannya sendiri, jadi
    // banner admin hanya menyisakan yang benar-benar masih perlu dilihat.
    if (event.outcome === 'ok' && event.invoiceNumber) {
      await sbFetch(
        `${sb.url}/rest/v1/doku_webhook_events` +
        `?invoice_number=eq.${encodeURIComponent(event.invoiceNumber)}` +
        `&outcome=neq.ok&resolved_at=is.null`,
        {
          method: 'PATCH',
          headers: { ...sb.headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            resolved_at: new Date().toISOString(),
            resolved_by: 'auto:webhook'
          })
        },
        'PATCH doku_webhook_events (auto-resolve)'
      );
    }
  } catch (err) {
    console.error('[Webhook] Gagal mencatat doku_webhook_events:', err);
  }
}
