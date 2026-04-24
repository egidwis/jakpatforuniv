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

  try {
    const rawBodyText = await context.request.text();
    const headers = context.request.headers;
    
    // Ambil header yang diperlukan untuk validasi DOKU
    const incomingSignature = headers.get('Signature');
    const clientId = headers.get('Client-Id');
    const requestId = headers.get('Request-Id');
    const requestTimestamp = headers.get('Request-Timestamp');
    
    const secretKey = context.env.DOKU_SECRET_KEY;

    if (!incomingSignature || !clientId || !requestId || !requestTimestamp || !secretKey) {
      console.error("Missing required webhook headers or secret key");
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
    
    const mySignature = "HMACSHA256=" + btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // 4. Bandingkan Signature dari DOKU dengan hasil hitung kita
    if (incomingSignature !== mySignature) {
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

    // Parse request body sekarang (karena aman)
    const requestData = JSON.parse(rawBodyText);
    console.log('Valid DOKU Webhook received:', JSON.stringify(requestData));

    // Ekstrak data pembayaran dari webhook DOKU
    const invoiceNumber = requestData.order?.invoice_number;
    const amount = requestData.order?.amount;
    const status = requestData.transaction?.status || requestData.order?.status || '';

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

    console.log(`Payment ${invoiceNumber} status updated to ${appStatus}`);

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
      // STEP 1: Try to find form_submission_id from transactions OR invoices
      // ====================================================================
      let formSubmissionId = null;

      // 1a. Try transactions first (Scenario A: user pays directly after submit)
      const transactionUrl = `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${invoiceNumber}`;
      const updateTransactionResponse = await fetch(transactionUrl, {
        method: 'PATCH',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status: appStatus })
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
          `${supabaseUrl}/rest/v1/invoices?payment_id=eq.${invoiceNumber}&select=form_submission_id&limit=1`,
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
        // STEP 5: Update form_submissions based on latest invoice status
        // ====================================================================
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
