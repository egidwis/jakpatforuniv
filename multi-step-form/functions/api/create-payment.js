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
    // Parse request body
    const requestData = await context.request.json();
    const { 
      amount, 
      title, 
      description, 
      customer, 
      transaction_id,
      success_redirect_url,
      failure_redirect_url
    } = requestData;
    
    // Validasi input
    if (!amount || !title || !customer || !transaction_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Missing required fields: amount, title, customer, transaction_id' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Ambil Mayar API key dari environment variables
    const apiKey = context.env.VITE_MAYAR_API_KEY;
    
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Mayar API key not configured' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Siapkan data untuk Mayar API
    const mayarRequestData = {
      name: customer.name || 'Customer',
      email: customer.email || 'customer@example.com',
      amount: amount,
      mobile: customer.phone || '08123456789',
      description: description || title,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 jam
      redirectUrl: success_redirect_url || `${new URL(context.request.url).origin}/success?payment_id={id}`,
      failureUrl: failure_redirect_url || `${new URL(context.request.url).origin}/payment-failed?payment_id={id}`,
      webhookUrl: `${new URL(context.request.url).origin}/.netlify/functions/webhook`
    };
    
    console.log('Creating payment with Mayar:', {
      ...mayarRequestData,
      amount: `${amount} (${(amount / 100).toLocaleString('id-ID')} IDR)`,
      apiKeyLength: apiKey.length
    });
    
    // Kirim request ke Mayar API
    const response = await fetch('https://api.mayar.id/hl/v1/payment/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mayarRequestData)
    });
    
    // Parse response dari Mayar
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('Mayar API error:', responseData);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Error creating payment with Mayar: ' + (responseData.message || response.statusText)
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Ekstrak data yang diperlukan dari response Mayar
    const paymentData = {
      id: responseData.data.id,
      payment_url: responseData.data.link,
      amount: amount,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    console.log('Payment created successfully:', paymentData);
    
    // Return data pembayaran
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment created successfully',
      ...paymentData
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error creating payment:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Error creating payment: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
