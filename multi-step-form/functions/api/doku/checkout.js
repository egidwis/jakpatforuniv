export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const rawBodyText = await context.request.text();
    const requestData = JSON.parse(rawBodyText);
    
    // Dari .env.local
    const clientId = context.env.DOKU_CLIENT_ID || context.env.VITE_DOKU_CLIENT_ID;
    const secretKey = context.env.DOKU_SECRET_KEY;
    
    if (!clientId || !secretKey) {
      return new Response(JSON.stringify({ error: "DOKU credentials missing in environment" }), { 
        status: 500, 
        headers: {'Content-Type': 'application/json'} 
      });
    }

    // Build the payload for DOKU
    const dokuPayload = {
      order: {
        amount: requestData.amount,
        invoice_number: requestData.invoice_number,
        currency: "IDR",
        callback_url: requestData.callback_url || undefined,
        auto_redirect: true
      },
      payment: {
        payment_due_date: requestData.payment_due_date || 60 // menit
      },
      customer: {
        // ID: alphanumeric doang
        id: requestData.customer.email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50),
        name: requestData.customer.name.substring(0, 255),
        email: requestData.customer.email.substring(0, 128)
      }
    };
    
    if (requestData.customer.phone) {
      dokuPayload.customer.phone = requestData.customer.phone.replace(/[^0-9]/g, '').substring(0, 16);
    }
    
    // Manual invoice info description (can be passed via requestData.description)
    if (requestData.description) {
         // DOKU doesn't have an exact `description` field for basic checkout except in line_items,
         // but we can put it there if needed. For now we will just use basic info.
    }

    const bodyString = JSON.stringify(dokuPayload);
    
    // Generate Signature Components
    const requestId = crypto.randomUUID();
    const requestTimestamp = new Date().toISOString().slice(0, 19) + "Z"; // UTC ISO8601 tanpa millisecond
    const requestTarget = "/checkout/v1/payment";

    // 1. Generate Digest: Base64(SHA256(Minified JSON Body))
    const enc = new TextEncoder();
    const digestBuffer = await crypto.subtle.digest('SHA-256', enc.encode(bodyString));
    const digest = btoa(String.fromCharCode(...new Uint8Array(digestBuffer)));
    
    // 2. Component String To Sign
    const componentStringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
    
    // 3. Generate HMAC SHA-256 Signature
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
    
    const signature = "HMACSHA256=" + btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Tentukan URL: pakai Sandbox by default, cek apakah client-id produksi
    let apiUrl = "https://api-sandbox.doku.com/checkout/v1/payment";
    
    // Jika Client ID tidak mengandung "-0253-", mungkin produksi, dsb (sesuaikan)
    // Atau jika ada variabel ENV eksplisit
    if (context.env.DOKU_ENV === 'production' || context.env.VITE_DOKU_ENV === 'production') {
       apiUrl = "https://api.doku.com/checkout/v1/payment";
    }

    console.log("Sending DOKU Request to:", apiUrl);
    console.log("Request-Id:", requestId);
    console.log("Payload:", bodyString);

    const dokuResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Id": clientId,
        "Request-Id": requestId,
        "Request-Timestamp": requestTimestamp,
        "Signature": signature
      },
      body: bodyString
    });

    const resultText = await dokuResponse.text();
    
    if (!dokuResponse.ok) {
        console.error("DOKU Error Response:", resultText);
        return new Response(JSON.stringify({ 
           error: "Failed from DOKU API", 
           details: JSON.parse(resultText) 
        }), { 
           status: dokuResponse.status, 
           headers: {'Content-Type': 'application/json'} 
        });
    }

    // Return the successful result from DOKU directly to frontend
    return new Response(resultText, { 
      status: 200, 
      headers: {'Content-Type': 'application/json'} 
    });
    
  } catch (error) {
    console.error("Error creating DOKU payment:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: {'Content-Type': 'application/json'} 
    });
  }
}
