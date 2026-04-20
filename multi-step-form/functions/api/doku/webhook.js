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
      const supabaseUrl = context.env.VITE_SUPABASE_URL;
      const supabaseKey = context.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
         throw new Error('Supabase credentials not found in environment');
      }
      
      // Update transaction status by payment_id
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
      
      // Get form_submission_id from transaction
      if (updatedTransactions && updatedTransactions.length > 0) {
        const formSubmissionId = updatedTransactions[0].form_submission_id;

        // Update form submission payment status
        const updateFormResponse = await fetch(
            `${supabaseUrl}/rest/v1/form_submissions?id=eq.${formSubmissionId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                payment_status: appStatus === 'completed' ? 'paid' : appStatus,
                submission_status: appStatus === 'completed' ? 'paid' : undefined
              })
            }
        );
        
        // Update invoice status if this is a manual invoice
        await fetch(`${supabaseUrl}/rest/v1/invoices?payment_id=eq.${invoiceNumber}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: appStatus === 'completed' ? 'paid' : appStatus,
              paid_at: appStatus === 'completed' ? new Date().toISOString() : null
            })
        });
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
