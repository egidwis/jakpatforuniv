// Cloudflare Pages Function to close/deactivate a Mayar payment link
// Endpoint: GET https://api.mayar.id/hl/v1/payment/close/{id}

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const { paymentId } = await context.request.json();

    if (!paymentId) {
      return new Response(JSON.stringify({ message: 'Missing paymentId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const apiKey = context.env.VITE_MAYAR_API_KEY;
    if (!apiKey) {
      console.warn('Mayar API key not configured, skipping close');
      return new Response(JSON.stringify({ message: 'API key not configured, skipped' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log(`Closing Mayar payment link: ${paymentId}`);

    const response = await fetch(`https://api.mayar.id/hl/v1/payment/close/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    const responseText = await response.text();
    console.log(`Mayar close response (${response.status}):`, responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawResponse: responseText };
    }

    return new Response(JSON.stringify({
      success: response.ok,
      status: response.status,
      data: responseData
    }), {
      status: response.ok ? 200 : response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error closing Mayar payment link:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error closing payment link: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
