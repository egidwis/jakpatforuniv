// Cloudflare Function untuk proxy ke Mayar API
// Mengatasi masalah CORS dengan meneruskan permintaan ke Mayar API

export async function onRequest(context) {
  // Log untuk debugging
  console.log("Mayar proxy function called with method:", context.request.method);

  // Set CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Token, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    console.log("Handling OPTIONS preflight request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    console.log("Method not allowed:", context.request.method);
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST, OPTIONS',
        ...corsHeaders
      }
    });
  }

  try {
    // Parse request body
    const requestData = await context.request.json();
    console.log("Request data received:", JSON.stringify(requestData));

    // Ambil Mayar API key dari request body atau environment variables
    let apiKey = '';

    // Coba ambil dari request body terlebih dahulu
    if (requestData.apiKey) {
      apiKey = requestData.apiKey;
      // Hapus apiKey dari requestData agar tidak dikirim ke Mayar
      delete requestData.apiKey;
      console.log("Using API key from request body");
    } else {
      // Jika tidak ada di request body, coba ambil dari environment variables
      apiKey = context.env.VITE_MAYAR_API_KEY;
      console.log("Using API key from environment variables");
    }

    if (!apiKey) {
      console.error('Mayar API key not found in request or environment variables');
      return new Response(JSON.stringify({
        success: false,
        message: 'Mayar API key not provided'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Tentukan endpoint yang akan digunakan
    const endpoint = requestData.endpoint || 'https://api.mayar.id/hl/v1/payment/create';
    console.log("Using endpoint:", endpoint);

    // Hapus endpoint dari requestData jika ada
    const { endpoint: _, ...mayarRequestData } = requestData;

    // Siapkan headers
    let headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Tambahkan webhook token jika tersedia
    let webhookToken = '';
    if (requestData.webhookToken) {
      webhookToken = requestData.webhookToken;
      headers['X-Webhook-Token'] = webhookToken;
      delete mayarRequestData.webhookToken;
      console.log("Added webhook token from request body to headers");
    } else {
      webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;
      if (webhookToken) {
        headers['X-Webhook-Token'] = webhookToken;
        console.log("Added webhook token from environment variables to headers");
      }
    }

    console.log(`Proxying request to Mayar API: ${endpoint}`);
    console.log('Request headers:', JSON.stringify(headers));
    console.log('Request data:', JSON.stringify(mayarRequestData));

    // Tentukan metode HTTP yang akan digunakan (default: POST)
    const method = requestData.method || 'POST';
    console.log(`Using HTTP method: ${method}`);

    // Buat opsi fetch berdasarkan metode
    const fetchOptions = {
      method: method,
      headers: headers
    };

    // Tambahkan body hanya jika bukan GET request
    if (method !== 'GET') {
      fetchOptions.body = JSON.stringify(mayarRequestData);
    }

    console.log('Fetch options:', JSON.stringify(fetchOptions, null, 2));

    // Kirim request ke Mayar API
    const response = await fetch(endpoint, fetchOptions);

    console.log("Mayar API response status:", response.status);

    // Parse response dari Mayar
    const responseText = await response.text();
    console.log("Raw response text:", responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log("Parsed response data:", JSON.stringify(responseData));
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      responseData = {
        error: "Invalid JSON response",
        rawResponse: responseText
      };
    }

    // Return response dari Mayar dengan header CORS
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error proxying to Mayar API:', error);

    // Coba dapatkan detail error yang lebih spesifik
    let errorMessage = error.message;
    let errorStatus = 500;

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Network error connecting to Mayar API. Please check your internet connection.';
    } else if (error.name === 'SyntaxError') {
      errorMessage = 'Invalid response from Mayar API. Please try again later.';
    }

    console.log("Returning error response:", errorMessage);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error proxying to Mayar API: ' + errorMessage,
      error: {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }), {
      status: errorStatus,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });
  }
}
