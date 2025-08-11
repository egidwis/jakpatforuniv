// Cloudflare Function untuk menampilkan status webhook Mayar

export async function onRequest(context) {
  // Set CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  // Handle preflight request
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Hanya terima metode GET
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'GET, OPTIONS',
        ...corsHeaders
      }
    });
  }

  try {
    // Cek ketersediaan environment variables
    const apiKey = context.env.VITE_MAYAR_API_KEY || '';
    const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN || '';
    const supabaseUrl = context.env.VITE_SUPABASE_URL || '';
    const supabaseKey = context.env.VITE_SUPABASE_ANON_KEY || '';

    // Buat daftar environment variables yang tersedia
    const availableEnvVars = [];
    for (const key in context.env) {
      availableEnvVars.push(key);
    }

    // Cek ketersediaan webhook handler
    const webhookUrl = new URL(context.request.url);
    const origin = webhookUrl.origin;
    const webhookEndpoint = `${origin}/webhook`;

    // Cek apakah webhook handler tersedia
    let webhookHandlerStatus = 'Unknown';
    let webhookReadyStatus = 'Unknown';
    
    try {
      // Cek ketersediaan webhook handler dengan HEAD request
      const headResponse = await fetch(webhookEndpoint, {
        method: 'HEAD',
      });
      
      webhookHandlerStatus = headResponse.ok ? 'Available (HEAD supported)' : 'Not available';
      
      // Cek ketersediaan OPTIONS method
      const optionsResponse = await fetch(webhookEndpoint, {
        method: 'OPTIONS',
      });
      
      webhookReadyStatus = optionsResponse.ok ? 'Ready' : 'Might be available (OPTIONS not supported)';
    } catch (checkError) {
      console.error('Error checking webhook availability:', checkError);
      webhookHandlerStatus = 'Error checking';
      webhookReadyStatus = 'Unknown';
    }

    // Buat HTML response
    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Webhook Status</title>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          color: #fff;
          background-color: #121212;
          margin: 0;
          padding: 20px;
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 1rem;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .card {
          background-color: #1e1e1e;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .status-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #333;
        }
        .status-item:last-child {
          border-bottom: none;
        }
        .status-label {
          font-weight: bold;
        }
        .status-value {
          text-align: right;
        }
        .configured {
          color: #4caf50;
        }
        .not-configured {
          color: #f44336;
        }
        .warning {
          color: #ff9800;
        }
        .env-vars {
          font-family: monospace;
          background-color: #2a2a2a;
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .button {
          background-color: #3a3a3a;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        .button:hover {
          background-color: #4a4a4a;
        }
        .timestamp {
          font-size: 0.8rem;
          color: #888;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Webhook Status</h1>
        <p>Halaman ini menampilkan status konfigurasi webhook Mayar.</p>
        
        <div class="card">
          <h2>Environment Variables</h2>
          <div class="status-item">
            <div class="status-label">Mayar API Key:</div>
            <div class="status-value ${apiKey ? 'configured' : 'not-configured'}">
              ${apiKey ? '✓ Configured' : '✗ Not Configured'}
            </div>
          </div>
          <div class="status-item">
            <div class="status-label">Mayar Webhook Token:</div>
            <div class="status-value ${webhookToken ? 'configured' : 'not-configured'}">
              ${webhookToken ? '✓ Configured' : '✗ Not Configured'}
            </div>
          </div>
          <div class="status-item">
            <div class="status-label">Available Environment Variables:</div>
            <div class="status-value env-vars">${availableEnvVars.join(', ')}</div>
          </div>
        </div>
        
        <div class="card">
          <h2>Webhook Configuration</h2>
          <div class="status-item">
            <div class="status-label">Webhook URL:</div>
            <div class="status-value">${webhookEndpoint}</div>
          </div>
          <div class="status-item">
            <div class="status-label">Deployment Platform:</div>
            <div class="status-value">Cloudflare Pages</div>
          </div>
          <div class="status-item">
            <div class="status-label">Webhook Handler:</div>
            <div class="status-value ${webhookHandlerStatus.includes('Available') ? 'configured' : 'warning'}">
              ${webhookHandlerStatus.includes('Available') ? '✓' : '⚠️'} ${webhookHandlerStatus}
            </div>
          </div>
          <div class="status-item">
            <div class="status-label">Ready for Mayar:</div>
            <div class="status-value ${webhookReadyStatus === 'Ready' ? 'configured' : 'warning'}">
              ${webhookReadyStatus === 'Ready' ? '✓' : '?'} ${webhookReadyStatus}
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>Actions</h2>
          <div class="button-group">
            <a href="/webhook-test" class="button">Test Webhook</a>
            <button onclick="location.reload()" class="button">Refresh Status</button>
            <a href="/" class="button">Kembali ke Beranda</a>
          </div>
        </div>
        
        <div class="timestamp">
          Status loaded at ${new Date().toLocaleTimeString()}
        </div>
      </div>
    </body>
    </html>
    `;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error generating webhook status:', error);

    return new Response(JSON.stringify({
      success: false,
      message: 'Error generating webhook status: ' + error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}
