// Cloudflare Function untuk webhook DOKU
// Menerima notifikasi pembayaran dari DOKU dan memperbarui status di database

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
  // SECRET URL CHECK — must run BEFORE format detection. The format branch
  // (SNAP / SNAP B2B / Jokul) is chosen from headers the CALLER sends, so an
  // attacker can pick the weakest branch; the secret only closes that if it
  // applies to every branch without exception.
  // Rollout: with WEBHOOK_ENFORCE_SECRET !== 'true' requests without the
  // secret are still processed but logged (stage A); set it to 'true' once
  // the DOKU dashboard Notification URL carries ?k=<secret> (stage B).
  // ======================================================================
  {
    const requestUrl = new URL(context.request.url);
    const providedSecret = requestUrl.searchParams.get('k');
    const expectedSecret = context.env.DOKU_WEBHOOK_SECRET;
    const secretOk = !!expectedSecret && providedSecret === expectedSecret;

    if (!secretOk) {
      if (context.env.WEBHOOK_ENFORCE_SECRET === 'true') {
        console.error('[webhook] Rejected: missing/invalid ?k= secret (enforcement on)');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      console.warn('[webhook] MISSING SECRET — request without valid ?k= was still processed (enforcement off). Update the DOKU Notification URL, then set WEBHOOK_ENFORCE_SECRET=true.');
    }
  }

  try {
    const rawBodyText = await context.request.text();
    const headers = context.request.headers;

    const secretKey = context.env.DOKU_SECRET_KEY;
    const ourClientId = context.env.DOKU_CLIENT_ID || context.env.VITE_DOKU_CLIENT_ID;

    // ====================================================================
    // DETECT FORMAT: SNAP (Sub Account/SAC) vs SNAP B2B (Payouts) vs Jokul (legacy)
    // SNAP notifications use CHANNEL-ID: H2H and X-PARTNER-ID headers
    // SNAP B2B notifications use X-Client-Key, X-Signature, X-Timestamp headers
    // Jokul notifications use Client-Id and Signature headers
    // ====================================================================
    const channelId = headers.get('CHANNEL-ID') || headers.get('Channel-Id');
    const isSnapFormat = channelId === 'H2H' || headers.get('X-PARTNER-ID') || headers.get('X-Partner-Id');

    const xClientKey = headers.get('x-client-key') || headers.get('X-Client-Key');
    const xSignature = headers.get('x-signature') || headers.get('X-Signature');
    const xTimestamp = headers.get('x-timestamp') || headers.get('X-Timestamp');
    const isSnapB2BFormat = !!xClientKey && !!xSignature && !!xTimestamp;

    if (isSnapFormat) {
      // ================================================================
      // SNAP FORMAT VALIDATION (Sub Account / SAC notifications)
      // DOKU SNAP VA notifications do NOT send Signature/X-Signature in
      // the same HMAC-SHA256 format. They use a different SNAP BI symmetric
      // signature (HMAC-SHA512 with different string-to-sign format).
      // Since the notification headers from DOKU dashboard show no signature
      // header at all, we validate via X-PARTNER-ID matching our client ID.
      // ================================================================
      const snapPartnerId = headers.get('X-PARTNER-ID') || headers.get('X-Partner-Id');
      const snapExternalId = headers.get('X-EXTERNAL-ID') || headers.get('X-External-Id');
      const snapTimestamp = headers.get('X-TIMESTAMP') || headers.get('X-Timestamp');

      console.log(`[SNAP Webhook] CHANNEL-ID: ${channelId}, X-PARTNER-ID: ${snapPartnerId}, X-EXTERNAL-ID: ${snapExternalId}, X-TIMESTAMP: ${snapTimestamp}`);
      // Log the real SNAP signature (NOT enforced yet) — material for building
      // proper SNAP BI HMAC verification from actual payloads, not guesses.
      console.log(`[SNAP Webhook] Signature headers (logged, not enforced): X-SIGNATURE: ${headers.get('X-SIGNATURE') || headers.get('X-Signature')}`);

      if (!snapPartnerId || !snapExternalId || !snapTimestamp) {
        console.error("[SNAP Webhook] Missing required SNAP headers");
        return new Response(JSON.stringify({ error: "Missing SNAP headers" }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate that X-PARTNER-ID matches our configured DOKU Client ID.
      // Fail-closed: without DOKU_CLIENT_ID configured we cannot validate anyone.
      if (!ourClientId || snapPartnerId !== ourClientId) {
        console.error(`[SNAP Webhook] X-PARTNER-ID mismatch or DOKU_CLIENT_ID unset: got ${snapPartnerId}`);
        return new Response(JSON.stringify({ error: "Partner ID mismatch" }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log("[SNAP Webhook] Validated OK via X-PARTNER-ID match");
    } else if (isSnapB2BFormat) {
      // ================================================================
      // SNAP B2B FORMAT VALIDATION (Payouts / Disbursements / etc.)
      // ================================================================
      console.log(`[SNAP B2B Webhook] X-CLIENT-KEY: ${xClientKey}, X-TIMESTAMP: ${xTimestamp}`);

      // Validate that X-CLIENT-KEY matches our configured DOKU Client ID.
      // Fail-closed: without DOKU_CLIENT_ID configured we cannot validate anyone.
      if (!ourClientId || xClientKey !== ourClientId) {
        console.error(`[SNAP B2B Webhook] X-CLIENT-KEY mismatch or DOKU_CLIENT_ID unset: got ${xClientKey}`);
        return new Response(JSON.stringify({ error: "Client Key mismatch" }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log("[SNAP B2B Webhook] Validated OK via X-CLIENT-KEY match");
    } else {
      // ================================================================
      // JOKUL FORMAT VALIDATION (legacy HMAC-SHA256 signature)
      // ================================================================
      const incomingSignature = headers.get('Signature');
      const clientId = headers.get('Client-Id');
      const requestId = headers.get('Request-Id');
      const requestTimestamp = headers.get('Request-Timestamp');

      if (!incomingSignature || !clientId || !requestId || !requestTimestamp || !secretKey) {
        console.error("Missing required Jokul webhook headers or secret key", {
          incomingSignature: !!incomingSignature,
          clientId: !!clientId,
          requestId: !!requestId,
          requestTimestamp: !!requestTimestamp,
          secretKey: !!secretKey
        });
        return new Response(JSON.stringify({ error: "Unauthorized or missing headers" }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Target path adalah path relative url, contoh: /api/doku/webhook
      const requestTarget = new URL(context.request.url).pathname;

      // 1. Generate Digest: Base64(SHA256(Raw Request Body))
      const enc = new TextEncoder();
      const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(rawBodyText));
      const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));
      
      // 2. String To Sign
      const componentStringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
      
      // 3. Generate HMAC SHA-256 Signature Server kita
      const key = await crypto.subtle.importKey(
        'raw', 
        enc.encode(secretKey), 
        { name: 'HMAC', hash: 'SHA-256' }, 
        false, 
        ['sign']
      );
      
      const signatureBuffer = await crypto.subtle.sign(
        'HMAC', 
        key, 
        enc.encode(componentStringToSign)
      );
      
      const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
      const mySignature = "HMACSHA256=" + base64Sig;

      let isSignatureValid = (incomingSignature === mySignature);

      // 4. Bandingkan Signature dari DOKU dengan hasil hitung kita
      if (!isSignatureValid) {
         console.error("Signature mismatch!");
         console.error("Incoming:", incomingSignature);
         console.error("Calculated:", mySignature);
         
         // Fallback for trailing slash mismatch if needed
         const fallbackTarget = requestTarget.endsWith("/") ? requestTarget.slice(0, -1) : requestTarget + "/";
         const fallbackString = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${fallbackTarget}\nDigest:${digest}`;
         const sigBuf2 = await crypto.subtle.sign('HMAC', key, enc.encode(fallbackString));
         const fallbackSig = "HMACSHA256=" + btoa(String.fromCharCode(...new Uint8Array(sigBuf2)));
         
         if (incomingSignature !== fallbackSig) {
            return new Response(JSON.stringify({ error: "Invalid Signature" }), {
               status: 401,
               headers: { 'Content-Type': 'application/json' }
            });
         }
      }
    }

    // Parse request body sekarang (karena aman)
    const requestData = JSON.parse(rawBodyText);
    console.log('Valid DOKU Webhook received:', JSON.stringify(requestData));

    // ─── Payout Webhook Handler ──────────────────────────────────────
    // If the request contains a payout object, update doku_payouts and return 200
    if (requestData.payout) {
      const payoutInvoice = requestData.payout.invoice_number;
      const payoutStatus = requestData.payout.status;
      console.log(`[Webhook Payout] Payout callback received. Invoice: ${payoutInvoice}, Status: ${payoutStatus}`);
      
      if (payoutInvoice) {
        try {
          const env = context.env;
          const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
          const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
          
          if (supabaseUrl && supabaseKey) {
            console.log(`[Webhook Payout] Updating doku_payouts status for invoice ${payoutInvoice} to ${payoutStatus}`);
            const payoutUpdateRes = await fetch(
              `${supabaseUrl}/rest/v1/doku_payouts?invoice_number=eq.${encodeURIComponent(payoutInvoice)}`,
              {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: payoutStatus })
              }
            );
            console.log(`[Webhook Payout] Update response status: ${payoutUpdateRes.status}`);
          }
        } catch (dbError) {
          console.error('[Webhook Payout] Error updating doku_payouts table:', dbError);
        }
      }
      
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
      } catch (fwdError) {
        console.error('[Webhook Router] Forward failed:', fwdError);
      }
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
      return new Response(JSON.stringify({ error: 'Invoice Number not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
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

    // Update status di database Supabase
    try {
      const env = context.env;
      const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
      // Gunakan SERVICE_ROLE_KEY jika ada (agar bisa menembus RLS dan mengupdate payment_status)
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
         throw new Error('Supabase credentials not found in environment');
      }
      
      // ====================================================================
      // STEP 0: AMOUNT VERIFICATION — must happen BEFORE any DB write.
      // The transactions PATCH below is the first write; if this check came
      // after it, a forged webhook could still flip transactions.status to
      // 'completed' even though the invoice stays unpaid.
      // SNAP sends paidAmount.value as a decimal STRING (e.g. "10000.00"),
      // so compare with Number() on BOTH sides.
      // ====================================================================
      const lookupHeaders = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      };
      const encodedInvoice = encodeURIComponent(invoiceNumber);

      const invAmountRes = await fetch(
        `${supabaseUrl}/rest/v1/invoices?payment_id=eq.${encodedInvoice}&select=amount&limit=1`,
        { headers: lookupHeaders }
      );
      const invAmountRows = await invAmountRes.json();
      let expectedAmount = Array.isArray(invAmountRows) && invAmountRows.length > 0
        ? Number(invAmountRows[0].amount)
        : null;

      // Legacy rows may exist only in transactions (pre-invoices flow).
      if (expectedAmount === null) {
        const txnAmountRes = await fetch(
          `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${encodedInvoice}&select=amount&limit=1`,
          { headers: lookupHeaders }
        );
        const txnAmountRows = await txnAmountRes.json();
        expectedAmount = Array.isArray(txnAmountRows) && txnAmountRows.length > 0
          ? Number(txnAmountRows[0].amount)
          : null;
      }

      if (expectedAmount !== null && !Number.isNaN(expectedAmount)) {
        const webhookAmount = Number(amount);
        if (Number.isNaN(webhookAmount) || webhookAmount !== expectedAmount) {
          // Do NOT write anything; reply 200 so DOKU stops retrying. Status
          // stays 'pending' for an admin to reconcile.
          console.error(`[Webhook] AMOUNT MISMATCH for ${invoiceNumber}: webhook amount=${JSON.stringify(amount)}, expected=${expectedAmount}. No DB writes performed. Raw payload was logged above.`);
          return new Response(JSON.stringify({
            success: false,
            message: 'Amount mismatch — notification ignored',
            invoiceNumber
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // ====================================================================
      // STEP 1: Try to find form_submission_id from transactions OR invoices
      // ====================================================================
      let formSubmissionId = null;

      // 1a. Try transactions first (Scenario A: user pays directly after submit)
      const transactionUrl = `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${invoiceNumber}`;
      const transactionUpdate = { status: appStatus };
      // Record the channel when DOKU provides it (kept separate from the gateway).
      if (paymentChannel) {
        transactionUpdate.payment_channel = paymentChannel;
      }
      const updateTransactionResponse = await fetch(transactionUrl, {
        method: 'PATCH',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(transactionUpdate)
      });
      const updatedTransactions = await updateTransactionResponse.json();

      if (updatedTransactions && updatedTransactions.length > 0) {
        formSubmissionId = updatedTransactions[0].form_submission_id;
        console.log(`Found form_submission_id from transactions: ${formSubmissionId}`);
      }

      // 1b. If no transaction found, look up invoice directly (Scenario B: admin-created invoice)
      if (!formSubmissionId) {
        console.log(`No transaction found for payment_id ${invoiceNumber}, checking invoices table...`);
        const invoiceLookupRes = await fetch(
          `${supabaseUrl}/rest/v1/invoices?payment_id=eq.${invoiceNumber}&select=form_submission_id,entity_type,extend_id&limit=1`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const invoiceLookup = await invoiceLookupRes.json();
        if (invoiceLookup && invoiceLookup.length > 0) {
          formSubmissionId = invoiceLookup[0].form_submission_id;
          console.log(`Found form_submission_id from invoices: ${formSubmissionId}`);
        }
      }

      // ====================================================================
      // STEP 2: Update invoice status by payment_id
      // ====================================================================
      if (formSubmissionId) {
        const invoiceUpdateRes = await fetch(`${supabaseUrl}/rest/v1/invoices?payment_id=eq.${invoiceNumber}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              status: appStatus === 'completed' ? 'paid' : appStatus,
              paid_at: appStatus === 'completed' ? new Date().toISOString() : null
            })
        });
        const invoiceUpdateData = await invoiceUpdateRes.json();
        console.log(`Invoice PATCH response (status ${invoiceUpdateRes.status}):`, JSON.stringify(invoiceUpdateData));

        // ====================================================================
        // STEP 3: Get the LATEST invoice for this form_submission_id
        // ====================================================================
        const latestInvoiceRes = await fetch(
          `${supabaseUrl}/rest/v1/invoices?form_submission_id=eq.${formSubmissionId}&order=created_at.desc&limit=1`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const latestInvoices = await latestInvoiceRes.json();
        console.log(`Latest invoice SELECT response (status ${latestInvoiceRes.status}):`, JSON.stringify(latestInvoices));

        // ====================================================================
        // STEP 4: Determine form payment_status from latest invoice
        // ====================================================================
        let formPaymentStatus = appStatus === 'completed' ? 'paid' : appStatus;
        let formSubmissionStatus = appStatus === 'completed' ? 'paid' : undefined;

        if (latestInvoices && latestInvoices.length > 0) {
          const latestStatus = latestInvoices[0].status;
          formPaymentStatus = latestStatus === 'paid' ? 'paid' : (latestStatus || 'pending');
          formSubmissionStatus = latestStatus === 'paid' ? 'paid' : undefined;
        }

        // ====================================================================
        // STEP 5: Route update based on entity_type (extend vs submission)
        // ====================================================================
        const txn = updatedTransactions && updatedTransactions.length > 0 ? updatedTransactions[0] : null;
        const isExtendPayment = txn && txn.entity_type === 'extend' && txn.extend_id;

        if (isExtendPayment) {
          // ───── EXTEND PAYMENT ─────
          console.log(`[Extend] Updating extend ${txn.extend_id} payment_status to ${formPaymentStatus}`);
          await fetch(
            `${supabaseUrl}/rest/v1/form_submissions_extend?id=eq.${txn.extend_id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                payment_status: formPaymentStatus,
                ...(formSubmissionStatus === 'paid' ? { submission_status: 'scheduled' } : {})
              })
            }
          );

          // Check if banner update is needed (new rewards = new banner)
          if (formPaymentStatus === 'paid') {
            try {
              const extRes = await fetch(
                `${supabaseUrl}/rest/v1/form_submissions_extend?id=eq.${txn.extend_id}&select=is_new_month,additional_prize_per_winner`,
                {
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              const extData = await extRes.json();
              const ext = extData && extData.length > 0 ? extData[0] : null;
              if (ext && (ext.is_new_month || (ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0))) {
                console.log(`[Extend] Setting requires_banner_update=true for submission ${formSubmissionId}`);
                await fetch(
                  `${supabaseUrl}/rest/v1/survey_pages?submission_id=eq.${formSubmissionId}`,
                  {
                    method: 'PATCH',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ requires_banner_update: true })
                  }
                );
              }
            } catch (extErr) {
              console.error('[Extend] Error checking banner update:', extErr);
            }
          }
        } else {
          // ───── REGULAR SUBMISSION PAYMENT ─────
          console.log(`Updating form ${formSubmissionId} payment_status to ${formPaymentStatus} (based on latest invoice)`);
          await fetch(
            `${supabaseUrl}/rest/v1/form_submissions?id=eq.${formSubmissionId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                payment_status: formPaymentStatus,
                ...(formSubmissionStatus ? { submission_status: formSubmissionStatus } : {})
              })
            }
          );

          // Record a one-time voucher redemption (e.g. ILKOMUNY) on confirmed
          // payment. The UNIQUE(auth_user_id, voucher_code) constraint in
          // voucher_redemptions (sql/35) is the authoritative "once per account"
          // gate; ignore-duplicates makes a repeat a harmless no-op.
          if (formPaymentStatus === 'paid') {
            try {
              const subRes = await fetch(
                `${supabaseUrl}/rest/v1/form_submissions?id=eq.${formSubmissionId}&select=auth_user_id,voucher_code&limit=1`,
                { headers: lookupHeaders }
              );
              const subRows = await subRes.json();
              const sub = Array.isArray(subRows) && subRows.length > 0 ? subRows[0] : null;
              const code = sub && sub.voucher_code ? String(sub.voucher_code).toUpperCase() : null;
              const LIMITED_VOUCHERS = ['ILKOMUNY'];
              if (sub && sub.auth_user_id && code && LIMITED_VOUCHERS.includes(code)) {
                const vrRes = await fetch(`${supabaseUrl}/rest/v1/voucher_redemptions`, {
                  method: 'POST',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=ignore-duplicates'
                  },
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
      } else {
        console.error(`Could not find form_submission_id for payment_id ${invoiceNumber} in either transactions or invoices!`);
      }

    } catch (dbError) {
      console.error('Error updating database:', dbError);
      // DOKU mewajibkan HTTP 200 apapun yang terjadi agar webhook tidak re-try terus jika error db
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook received and processed successfully',
      invoiceNumber,
      status: appStatus
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing DOKU webhook:', error);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error processing webhook: ' + error.message
    }), {
      status: 500, // Walaupun DOKU butuh 200, jika error syntax/kode harus 500
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
