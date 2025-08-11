// Cloudflare Function untuk proxy verifikasi pembayaran Mayar
// Mengatasi masalah CORS dengan meneruskan permintaan ke Mayar API

export async function onRequest(context) {
  // Log untuk debugging
  console.log("Mayar verify function called with method:", context.request.method);

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    console.log("Handling OPTIONS preflight request for verify");
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Token',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Hanya terima metode POST
  if (context.request.method !== 'POST') {
    console.log("Method not allowed for verify:", context.request.method);
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Token'
      }
    });
  }

  try {
    // Parse request body
    const requestData = await context.request.json();

    // Ambil Mayar API key dari request
    let apiKey = '';

    // Coba ambil dari request body
    if (requestData.apiKey) {
      apiKey = requestData.apiKey;
      // Hapus apiKey dari requestData agar tidak dikirim ke Mayar
      delete requestData.apiKey;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Mayar API key not provided in request'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Tentukan endpoint yang akan digunakan
    const endpoint = requestData.endpoint;
    console.log("Verify endpoint:", endpoint);

    if (!endpoint) {
      console.log("No endpoint specified for verification");
      return new Response(JSON.stringify({
        success: false,
        message: 'Endpoint not specified'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.log(`Proxying verification request to Mayar API: ${endpoint}`);

    // Siapkan headers
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    console.log("Verify request headers:", JSON.stringify(headers));

    // Tentukan metode HTTP yang akan digunakan (default: GET)
    const method = requestData.method || 'GET';
    console.log(`Using HTTP method for verify: ${method}`);

    // Kirim request ke Mayar API
    const response = await fetch(endpoint, {
      method: method,
      headers: headers
    });

    console.log("Verify API response status:", response.status);

    // Parse response dari Mayar
    const responseText = await response.text();
    console.log("Raw verify response text:", responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log("Parsed verify response data:", JSON.stringify(responseData));
    } catch (parseError) {
      console.error("Error parsing JSON verify response:", parseError);
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
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error proxying verification to Mayar API:', error);

    // Coba dapatkan detail error yang lebih spesifik
    let errorMessage = error.message;
    let errorStatus = 500;

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Network error connecting to Mayar API for verification. Please check your internet connection.';
    } else if (error.name === 'SyntaxError') {
      errorMessage = 'Invalid response from Mayar verification API. Please try again later.';
    }

    console.log("Returning verify error response:", errorMessage);

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
