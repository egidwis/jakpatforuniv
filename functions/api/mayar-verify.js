// Cloudflare Function untuk proxy verifikasi pembayaran Mayar
// Mengatasi masalah CORS dengan meneruskan permintaan ke Mayar API

export async function onRequest(context) {
  // Log untuk debugging
  console.log("Mayar verify proxy function called with method:", context.request.method);

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

  // Hanya terima metode POST (yang akan digunakan untuk melakukan GET ke Mayar API)
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
    const endpoint = requestData.endpoint || 'https://api.mayar.id/hl/v1/payment/status';
    console.log("Using endpoint:", endpoint);

    if (!endpoint) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Endpoint not specified'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Siapkan headers
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    };

    console.log(`Proxying verification request to Mayar API: ${endpoint}`);
    console.log('Request headers:', JSON.stringify(headers));

    // Kirim request ke Mayar API
    const response = await fetch(endpoint, {
      method: requestData.method || 'GET',
      headers: headers
    });

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
    console.error('Error proxying verification to Mayar API:', error);

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
      message: 'Error proxying verification to Mayar API: ' + errorMessage,
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
