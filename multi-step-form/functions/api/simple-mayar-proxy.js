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
    // Log the raw request for debugging
    console.log("Raw request:", {
      method: context.request.method,
      url: context.request.url,
      headers: Object.fromEntries(context.request.headers.entries())
    });

    // Parse request body with error handling
    let requestData;
    try {
      requestData = await context.request.json();
      console.log("Request data received:", JSON.stringify(requestData));
    } catch (parseError) {
      console.error("Error parsing request JSON:", parseError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON in request body: ' + parseError.message
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Validate request data
    if (!requestData.amount || !requestData.name || !requestData.email) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing required fields: amount, name, email'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Ensure minimum amount is 500 (Mayar requirement)
    const minAmount = 500;
    if (requestData.amount < minAmount) {
      console.log(`Adjusting amount from ${requestData.amount} to minimum ${minAmount} as required by Mayar`);
      requestData.amount = minAmount;
    }

    // Get API key from environment variables
    const apiKey = context.env.VITE_MAYAR_API_KEY;

    // Log environment variables for debugging (without revealing full key)
    console.log('Environment variables available:', Object.keys(context.env));
    if (apiKey) {
      console.log('Mayar API key found, first 10 chars:', apiKey.substring(0, 10) + '...');
    } else {
      console.error('Mayar API key not found in environment variables');
    }

    // For testing, use a hardcoded API key if not found in environment
    // This is a temporary solution for debugging
    const finalApiKey = apiKey || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGU3YTc0Zi02MWJlLTRiNmMtYjUwNi1jYjk4ZWQ2MzliOWUiLCJhY2NvdW50SWQiOiIyYmQ1NzViZS02YjgwLTQ1OTYtYjFkZi1iODNlZjNkMzVmZDUiLCJjcmVhdGVkQXQiOiIxNzQ3NzUwNzMzODQ3Iiwicm9sZSI6ImRldmVsb3BlciIsInN1YiI6InByb2R1Y3RAamFrcGF0Lm5ldCIsIm5hbWUiOiJKYWtwYXQgIiwibGluayI6Impha3BhdCIsImlzU2VsZkRvbWFpbiI6bnVsbCwiaWF0IjoxNzQ3NzUwNzMzfQ.Cy7Lx6VKR2YjyplRbnl3muPpYmnyta8gZau-dgBehBr3cCQ3wI__cW5Ws_W83-_SDINCozLRtLYc7kKTyjmf-_hf6O7MhJbznP7-cwiuL1M_dAbQygW09s0EjFQklKtoRaaiAOXsyf44pIgjeiMczoUxNotk0vnzD_Poeo6a1utadmgxJCBwWEMnSeJRvPVK1VuKaie_gOfMtxY558llcZEBado4BgNbQ6PEmV8buetz3WX8XwF-Dw3g75aTJW3DJI_0zzIdPsw2QTbA7k6Xni7URL4MN9_TVLpcaIGzEFAevrvNoLP17HvuTx6rF0Cw8mAeU5aVofxcVJx049KYjA';

    console.log('Using API key (first 10 chars):', finalApiKey.substring(0, 10) + '...');

    // Set up the Mayar API request
    const mayarEndpoint = 'https://api.mayar.id/hl/v1/payment/create';
    console.log(`Sending request to Mayar API: ${mayarEndpoint}`);

    // Prepare headers
    const headers = {
      'Authorization': `Bearer ${finalApiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Add webhook token if available
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN;
    if (webhookToken) {
      headers['X-Webhook-Token'] = webhookToken;
      console.log("Added webhook token to headers");
    }

    // Log the full request for debugging
    console.log("Full Mayar request:", {
      url: mayarEndpoint,
      method: 'POST',
      headers: headers,
      body: requestData
    });

    // Send request to Mayar API
    console.log("Sending request to Mayar API with body:", JSON.stringify(requestData));

    try {
      const response = await fetch(mayarEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestData)
      });

      console.log("Mayar API response status:", response.status);

      // Log response headers for debugging
      console.log("Mayar API response headers:", Object.fromEntries(response.headers.entries()));

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

      // Check if we have a valid payment URL in the response
      let paymentUrl = null;
      let paymentId = null;

      // Try to extract payment URL from different response formats
      if (responseData.data && responseData.data.link) {
        paymentUrl = responseData.data.link;
        paymentId = responseData.data.id || '';
        console.log('Found payment URL in format 1 (data.data.link)');
      } else if (responseData.data && responseData.data.url) {
        paymentUrl = responseData.data.url;
        paymentId = responseData.data.id || '';
        console.log('Found payment URL in format 2 (data.data.url)');
      } else if (responseData.url) {
        paymentUrl = responseData.url;
        paymentId = responseData.id || '';
        console.log('Found payment URL in format 3 (data.url)');
      } else if (responseData.payment_url) {
        paymentUrl = responseData.payment_url;
        paymentId = responseData.id || '';
        console.log('Found payment URL in format 4 (data.payment_url)');
      }

      // Log the extracted payment URL and ID
      if (paymentUrl) {
        console.log('Extracted payment URL:', paymentUrl);
        console.log('Extracted payment ID:', paymentId);
      } else {
        console.error('Could not extract payment URL from response:', responseData);
      }

      // Return response from Mayar with CORS headers
      return new Response(JSON.stringify(responseData), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (fetchError) {
      console.error("Error fetching from Mayar API:", fetchError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Error fetching from Mayar API: ' + fetchError.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

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
