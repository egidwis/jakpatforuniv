// Simple Mayar API proxy to avoid CORS issues
// This is a simplified version that focuses on the core functionality

export async function onRequest(context) {
  // Set CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  // Only accept POST method
  if (context.request.method !== 'POST') {
    console.log("Method not allowed:", context.request.method);
    return new Response(JSON.stringify({ 
      success: false,
      message: 'Method Not Allowed' 
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    // Parse request body
    const requestData = await context.request.json();
    console.log("Request data received:", JSON.stringify(requestData));
    
    // Get API key from environment variables
    const apiKey = context.env.VITE_MAYAR_API_KEY;
    
    if (!apiKey) {
      console.error('Mayar API key not found in environment variables');
      return new Response(JSON.stringify({
        success: false,
        message: 'Mayar API key not configured'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Set up the Mayar API request
    const mayarEndpoint = 'https://api.mayar.id/hl/v1/payment/create';
    console.log(`Sending request to Mayar API: ${mayarEndpoint}`);
    
    // Prepare headers
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Add webhook token if available
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;
    if (webhookToken) {
      headers['X-Webhook-Token'] = webhookToken;
      console.log("Added webhook token to headers");
    }

    // Send request to Mayar API
    const response = await fetch(mayarEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestData)
    });

    console.log("Mayar API response status:", response.status);

    // Parse response from Mayar
    const responseText = await response.text();
    console.log("Raw response text:", responseText);
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log("Parsed response data:", JSON.stringify(responseData));
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON response from Mayar API',
        rawResponse: responseText
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Return response from Mayar with CORS headers
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error proxying to Mayar API:', error);
    
    return new Response(JSON.stringify({
      success: false,
      message: 'Error proxying to Mayar API: ' + error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
