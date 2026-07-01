// Cloudflare Function: create a self-service DOKU payment SERVER-SIDE.
//
// Replaces the old client-side flow where the browser called /api/doku/checkout
// and then inserted the `transactions` + `invoices` rows itself via the anon key.
// Doing it here with the SERVICE_ROLE key lets us (a) enable RLS on `invoices`
// without breaking the public retry / user checkout flows, and (b) derive the
// amount from the DB instead of trusting a client-supplied value (anti-tampering).
//
// Used by src/utils/payment.ts::createPayment (PaymentRetryPage + PaymentCheckoutPage).

import { dokuRequest } from './_helpers.js';

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
    // SERVICE_ROLE is required so the inserts bypass RLS. Fall back to anon only
    // for local/dev where the service key may be absent.
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

    // 1. Read the submission — this is the source of truth for the amount and
    //    customer details. Never trust an amount sent by the client.
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/form_submissions?id=eq.${encodeURIComponent(formSubmissionId)}` +
        `&select=id,total_cost,title,full_name,email,phone_number,payment_status&limit=1`,
      { headers: sbHeaders }
    );
    const subs = await subRes.json();
    if (!Array.isArray(subs) || subs.length === 0) {
      return json({ error: 'Form submission not found' }, 404);
    }
    const sub = subs[0];

    // Guard: don't create a fresh payment for an already-paid submission.
    if (sub.payment_status === 'paid') {
      return json({ error: 'Submission is already paid' }, 409);
    }

    const amount = Number(sub.total_cost);
    if (!amount || amount <= 0) {
      return json({ error: 'Invalid submission amount' }, 400);
    }

    // 2. Invoice number — same self-service format as before (JFU-<8chars>-<ts>).
    const invoiceNumber = `JFU-${String(formSubmissionId).substring(0, 8)}-${Date.now()}`;

    // 3. Create the DOKU checkout (reuse the shared, signed request helper).
    const resolvedOrigin = origin || new URL(request.url).origin;
    const sacId =
      env.VITE_DOKU_SAC_JFU_ID || env.DOKU_SAC_JFU_ID || 'SAC-7926-1778565828595';

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

    const doku = await dokuRequest(env, 'POST', '/checkout/v1/payment', dokuPayload);
    const paymentUrl = doku?.data?.response?.payment?.url;

    if (!doku.ok || !paymentUrl) {
      console.error('[create-payment] DOKU error:', doku.status, JSON.stringify(doku.data));
      return json({ error: 'Failed to create DOKU payment', details: doku.data }, 502);
    }

    // 4. Persist BOTH rows via service_role (bypasses RLS). Doing this here also
    //    fixes the old bug where a logged-out retry silently failed the
    //    transactions insert (anon RLS) and created only an invoice.
    const transactionRow = {
      form_submission_id: formSubmissionId,
      payment_id: invoiceNumber,
      payment_method: 'doku',
      amount,
      status: 'pending',
      payment_url: paymentUrl,
    };
    const invoiceRow = {
      form_submission_id: formSubmissionId,
      payment_id: invoiceNumber,
      invoice_url: paymentUrl,
      amount,
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
      // The DOKU link exists and is valid; the webhook can still reconcile by
      // payment_id later. Surface the DB failure but return the URL so the user
      // can still pay.
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
