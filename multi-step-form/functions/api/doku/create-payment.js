// Cloudflare Function: create a self-service DOKU payment SERVER-SIDE.
//
// Replaces the old client-side flow where the browser called /api/doku/checkout
// and then inserted the `transactions` + `invoices` rows itself via the anon key.
// Doing it here with the SERVICE_ROLE key lets us (a) enable RLS on `invoices`
// without breaking the public retry / user checkout flows, and (b) derive the
// amount from the DB instead of trusting a client-supplied value (anti-tampering).
//
// Used by src/utils/payment.ts::createPayment (PaymentRetryPage + PaymentCheckoutPage).
//
// NOTE: Intentionally self-contained (no imports) — each Cloudflare Pages Function
// is bundled as a standalone module. Cross-file ESM imports silently fail.

// ─── Server-side pricing ────────────────────────────────────────────────────
// DUPLICATED from src/utils/cost-calculator.ts + src/utils/constants.ts — the
// two copies MUST be changed together (tiers, vouchers, Kilat add-on, PPN). The
// duplication is unavoidable: Pages Functions can't import from src/. The
// client copy only renders estimates; THIS copy decides what gets charged.

const KILAT_ADDON_COST = 250000;
const KILAT_ADDON_COST_VOUCHER = 200000;

// PPN 11% dipungut di ATAS subtotal (DPP). Pembulatan WAJIB identik dengan
// calculatePpn() di src/utils/cost-calculator.ts, kalau tidak setiap order akan
// men-trigger warning "total_cost mismatch" di bawah.
const PPN_PERCENT = 11;
const PPN_RATE = 0.11;

function calculatePpn(dpp) {
  return Math.round((dpp * PPN_PERCENT) / 100);
}

function calculateAdCostPerDay(questionCount) {
  if (questionCount === 0) return 0;
  if (questionCount <= 15) return 150000;
  if (questionCount <= 30) return 200000;
  if (questionCount <= 50) return 300000;
  if (questionCount <= 70) return 400000;
  return 500000;
}

function calculateDiscount(voucherCode, adCost, incentiveCost, duration) {
  if (!voucherCode) return 0;
  const code = voucherCode.toUpperCase();

  if (code === 'JAKPATUNIV2025') return 0; // expired
  if (code === 'JFUTGRX') {
    const totalBeforeDiscount = adCost + incentiveCost;
    return totalBeforeDiscount > 1000 ? totalBeforeDiscount - 1000 : 0;
  }
  if (code === 'JFUFEB') {
    if (duration === 7) return adCost > 1000000 ? adCost - 1000000 : 0;
    return 0;
  }
  if (code === 'PPISWEDIA' || code === 'TEGARGANTENG') return adCost * 0.2;

  const tenPercentCodes = [
    'JFUTYR', 'SEKARJFU', 'ADINDAJFU', 'RAJAJFU', 'SACIJFU', 'JFUGITA',
    'JFUTANIA', 'JFUEDO', 'JFURAISA', 'JFUANA', 'JFUSALSA', 'JFUNATALIA',
    'JFUSUHUD',
  ];
  if (tenPercentCodes.includes(code)) return adCost * 0.1;

  return 0;
}

// Mirrors calculateTotalCost(SurveyFormData) but takes the snake_case DB row.
// Returns { subtotal, ppn, total } — `total` (subtotal + PPN) is what gets charged.
function computeTotalCostFromSubmission(sub) {
  const questionCount = Number(sub.question_count) || 0;
  const duration = Number(sub.duration) || 0;
  const winnerCount = Number(sub.winner_count) || 0;
  const prizePerWinner = Number(sub.prize_per_winner) || 0;
  const voucherCode = sub.voucher_code || undefined;
  const isKilat = sub.distribution_type === 'kilat';

  const incentiveCost = winnerCount * prizePerWinner;

  let subtotal;
  if (isKilat) {
    // Kilat: base rate (no duration multiplier) + add-on + incentive, no discount
    const adCostBase = calculateAdCostPerDay(questionCount);
    const kilatAddon =
      voucherCode && voucherCode.toUpperCase() === 'JFUSUHUD'
        ? KILAT_ADDON_COST_VOUCHER
        : KILAT_ADDON_COST;
    subtotal = adCostBase + kilatAddon + incentiveCost;
  } else {
    const adCost = calculateAdCostPerDay(questionCount) * duration;
    const discount = calculateDiscount(voucherCode, adCost, incentiveCost, duration);
    subtotal = adCost + incentiveCost - discount;
  }

  const ppn = calculatePpn(subtotal);
  return { subtotal, ppn, total: subtotal + ppn };
}
// ─── End server-side pricing ────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, { Allow: 'POST' });
  }

  try {
    const { formSubmissionId, origin, paymentDueDate } = await request.json();

    if (!formSubmissionId) {
      return json({ error: 'formSubmissionId is required' }, 400);
    }

    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const supabaseKey =
      env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return json({ error: 'Supabase credentials not configured' }, 500);
    }

    const sbHeaders = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    };

    // 1. Read the submission — source of truth for amount and customer details.
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/form_submissions?id=eq.${encodeURIComponent(formSubmissionId)}` +
        `&select=id,total_cost,title,full_name,email,phone_number,payment_status,slot_booked_by,slot_reserved_at` +
        `,question_count,duration,winner_count,prize_per_winner,voucher_code,distribution_type&limit=1`,
      { headers: sbHeaders }
    );
    const subs = await subRes.json();
    if (!Array.isArray(subs) || subs.length === 0) {
      return json({ error: 'Form submission not found' }, 404);
    }
    const sub = subs[0];

    if (sub.payment_status === 'paid') {
      return json({ error: 'Submission is already paid' }, 409);
    }
    if (sub.payment_status === 'expired') {
      return json({ error: 'Payment slot has expired. Please rebook from the dashboard.' }, 409);
    }
    // Defense-in-depth: block if slot timer passed even if payment_status wasn't updated yet
    // (user went directly from email without opening PaymentCheckoutPage first).
    if (sub.slot_booked_by === 'user' && sub.slot_reserved_at) {
      const slotExpiredAt = new Date(sub.slot_reserved_at).getTime() + 3_600_000;
      if (Date.now() > slotExpiredAt) {
        return json({ error: 'Payment slot has expired. Please rebook from the dashboard.' }, 409);
      }
    }

    // The server recomputes the price from the pricing inputs; total_cost in
    // the DB originates from the client (StepCheckout INSERT) and is only
    // trusted as a cross-check. `amount` is the PPN-inclusive grand total that
    // gets charged and stored; `subtotal`/`ppn` are persisted alongside it.
    const { subtotal, ppn, total: amount } = computeTotalCostFromSubmission(sub);
    if (!amount || amount <= 0) {
      return json({ error: 'Invalid submission amount' }, 400);
    }

    const storedTotalCost = Number(sub.total_cost);
    if (storedTotalCost !== amount) {
      // Could be tampering, could be client/server formula drift (e.g. a
      // voucher changed on one side only) — log both values plus the inputs
      // so the two cases can be told apart. Don't treat as an attack outright.
      console.warn(
        `[create-payment] total_cost mismatch for ${formSubmissionId}: db=${storedTotalCost}, server=${amount}. ` +
        `Inputs: question_count=${sub.question_count}, duration=${sub.duration}, winner_count=${sub.winner_count}, ` +
        `prize_per_winner=${sub.prize_per_winner}, voucher_code=${sub.voucher_code}, distribution_type=${sub.distribution_type}. ` +
        `Correcting DB to server value.`
      );
      const fixRes = await fetch(
        `${supabaseUrl}/rest/v1/form_submissions?id=eq.${encodeURIComponent(formSubmissionId)}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ total_cost: amount, subtotal, ppn_amount: ppn }),
        }
      );
      if (!fixRes.ok) {
        console.error(`[create-payment] Failed to correct total_cost (status ${fixRes.status})`);
      }
    }

    // 2. Invoice number — same self-service format (JFU-<8chars>-<ts>).
    const invoiceNumber = `JFU-${String(formSubmissionId).substring(0, 8)}-${Date.now()}`;

    // 3. Build DOKU checkout payload.
    const resolvedOrigin = origin || new URL(request.url).origin;
    const sacId = env.VITE_DOKU_SAC_JFU_ID || env.DOKU_SAC_JFU_ID || 'SAC-7926-1778565828595';
    const dueDate = Number(paymentDueDate) > 0 ? Math.round(Number(paymentDueDate)) : 60;

    const dokuPayload = {
      order: {
        amount,
        invoice_number: invoiceNumber,
        currency: 'IDR',
        callback_url: `${resolvedOrigin}/payment-success?id=${formSubmissionId}&source=gateway`,
        auto_redirect: true,
      },
      payment: { payment_due_date: dueDate },
      customer: {
        id: String(sub.email || 'user').replace(/[^a-zA-Z0-9]/g, '').substring(0, 50),
        name: String(sub.full_name || 'User').substring(0, 255),
        email: String(sub.email || 'user@example.com').substring(0, 128),
      },
    };
    if (sub.phone_number) {
      dokuPayload.customer.phone = String(sub.phone_number).replace(/[^0-9]/g, '').substring(0, 16);
    }
    if (sacId) {
      dokuPayload.additional_info = { account: { id: sacId } };
    }

    // 4. Sign and call DOKU (same signing logic as checkout.js — kept inline because
    //    Cloudflare Pages Functions bundle each file standalone; cross-file imports fail).
    const clientId = env.DOKU_CLIENT_ID || env.VITE_DOKU_CLIENT_ID;
    const secretKey = env.DOKU_SECRET_KEY;
    if (!clientId || !secretKey) {
      return json({ error: 'DOKU credentials not configured' }, 500);
    }

    const bodyString = JSON.stringify(dokuPayload);
    const enc = new TextEncoder();
    const requestId = crypto.randomUUID();
    const requestTimestamp = new Date().toISOString().slice(0, 19) + 'Z';
    const requestTarget = '/checkout/v1/payment';

    const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(bodyString));
    const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));
    const componentStringToSign =
      `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}` +
      `\nRequest-Target:${requestTarget}\nDigest:${digest}`;

    const hmacKey = await crypto.subtle.importKey(
      'raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(componentStringToSign));
    const signature = 'HMACSHA256=' + btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const apiBase =
      env.DOKU_ENV === 'production' || env.VITE_DOKU_ENV === 'production'
        ? 'https://api.doku.com'
        : 'https://api-sandbox.doku.com';

    console.log('[create-payment] POST', apiBase + requestTarget, 'Request-Id:', requestId);

    const dokuRes = await fetch(`${apiBase}${requestTarget}`, {
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

    const dokuText = await dokuRes.text();
    let dokuData;
    try { dokuData = JSON.parse(dokuText); } catch { dokuData = { raw: dokuText }; }

    const paymentUrl = dokuData?.response?.payment?.url;
    if (!dokuRes.ok || !paymentUrl) {
      console.error('[create-payment] DOKU error:', dokuRes.status, dokuText);
      return json({ error: 'Failed to create DOKU payment', details: dokuData }, 502);
    }

    // 5. Persist BOTH rows via service_role (bypasses RLS).
    //    `amount` is the PPN-inclusive grand total; subtotal/ppn_rate/ppn_amount
    //    record the tax breakdown for reconciliation and invoice rendering.
    const transactionRow = {
      form_submission_id: formSubmissionId,
      payment_id: invoiceNumber,
      payment_method: 'doku',
      amount,
      subtotal,
      ppn_rate: PPN_RATE,
      ppn_amount: ppn,
      status: 'pending',
      payment_url: paymentUrl,
    };
    const invoiceRow = {
      form_submission_id: formSubmissionId,
      payment_id: invoiceNumber,
      invoice_url: paymentUrl,
      amount,
      subtotal,
      ppn_rate: PPN_RATE,
      ppn_amount: ppn,
      status: 'pending',
    };

    const [txRes, invRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/transactions`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(transactionRow),
      }),
      fetch(`${supabaseUrl}/rest/v1/invoices`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(invoiceRow),
      }),
    ]);

    if (!txRes.ok || !invRes.ok) {
      console.error(
        `[create-payment] DB insert issue — tx:${txRes.status} inv:${invRes.status} for ${invoiceNumber}`
      );
    }

    return json({ payment_url: paymentUrl, payment_id: invoiceNumber }, 200);
  } catch (error) {
    console.error('[create-payment] Error:', error);
    return json({ error: error.message || 'Internal error' }, 500);
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
