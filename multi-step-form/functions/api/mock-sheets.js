// Mock Google Sheets endpoint untuk testing
// Simulasi Google Apps Script web app

export async function onRequest(context) {
  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    console.log('Mock Sheets API called with method:', context.request.method);

    let requestData = {};
    
    // Parse request data
    if (context.request.method === 'POST') {
      try {
        requestData = await context.request.json();
        console.log('Received data:', JSON.stringify(requestData, null, 2));
      } catch (parseError) {
        console.log('Could not parse JSON, trying text...');
        const textData = await context.request.text();
        console.log('Received text data:', textData);
        requestData = { raw_data: textData };
      }
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock successful response
    const mockResponse = {
      success: true,
      message: 'Data successfully received by mock Google Sheets',
      timestamp: new Date().toISOString(),
      received_data: {
        form_id: requestData.form_id || 'unknown',
        title: requestData.title || 'No title',
        email: requestData.email || 'No email',
        action: requestData.action || 'No action',
        data_fields: Object.keys(requestData).length
      },
      mock: true,
      note: 'This is a mock response for testing. Replace with real Google Apps Script when fixed.'
    };

    console.log('Sending mock response:', mockResponse);

    return new Response(JSON.stringify(mockResponse, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Mock Sheets API error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      message: 'Mock Sheets API error',
      error: error.message,
      timestamp: new Date().toISOString(),
      mock: true
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
