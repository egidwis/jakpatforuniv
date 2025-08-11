// Cloudflare Function untuk menguji webhook Mayar

export async function onRequest(context) {
  // Set CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  // Ambil webhook token dari environment variables
  const webhookToken = context.env.VITE_MAYAR_WEBHOOK_TOKEN || '';

  // Buat HTML response untuk GET request
  if (context.request.method === 'GET') {
    const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mayar Webhook Test</title>
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
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input, select, textarea {
          width: 100%;
          padding: 10px;
          margin-bottom: 15px;
          border: 1px solid #333;
          background-color: #1e1e1e;
          color: #fff;
          border-radius: 4px;
        }
        textarea {
          min-height: 150px;
          font-family: monospace;
        }
        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        button {
          background-color: #3a3a3a;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: #4a4a4a;
        }
        button.primary {
          background-color: #2196f3;
        }
        button.primary:hover {
          background-color: #0b7dda;
        }
        .result {
          margin-top: 20px;
          padding: 15px;
          background-color: #1e1e1e;
          border-radius: 4px;
          display: none;
        }
        .success {
          border-left: 4px solid #4caf50;
        }
        .error {
          border-left: 4px solid #f44336;
        }
        .token-info {
          color: #4caf50;
          font-size: 0.8rem;
          margin-top: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Mayar Webhook Test</h1>
        <p>Gunakan halaman ini untuk menguji webhook Mayar dengan mengirim payload simulasi.</p>
        
        <form id="webhookForm">
          <div>
            <label for="webhookUrl">Webhook URL:</label>
            <input type="text" id="webhookUrl" value="/webhook" required>
          </div>
          
          <div>
            <label for="eventType">Tipe Event:</label>
            <select id="eventType">
              <option value="payment.success">payment.success</option>
              <option value="payment.failed">payment.failed</option>
              <option value="payment.expired">payment.expired</option>
            </select>
          </div>
          
          <div>
            <label for="paymentId">ID Pembayaran:</label>
            <input type="text" id="paymentId" value="pay_test_${Date.now()}" required>
          </div>
          
          <div>
            <label for="webhookToken">Webhook Token (untuk signature):</label>
            <input type="text" id="webhookToken" value="${webhookToken}" required>
            ${webhookToken ? '<div class="token-info">Token diambil dari environment variables</div>' : ''}
          </div>
          
          <div>
            <label for="payloadJson">Payload JSON:</label>
            <textarea id="payloadJson" required></textarea>
          </div>
          
          <div class="button-group">
            <button type="button" id="generateBtn">Generate Payload</button>
            <button type="submit" id="sendBtn" class="primary">Kirim Webhook</button>
            <button type="button" id="backBtn">Kembali ke Status</button>
          </div>
        </form>
        
        <div id="result" class="result">
          <h3>Status: <span id="statusCode"></span></h3>
          <div>
            <strong>Webhook URL: </strong><span id="resultUrl"></span>
          </div>
          <div>
            <strong>Signature: </strong><span id="resultSignature"></span>
          </div>
          <div>
            <strong>Headers: </strong><span id="resultHeaders"></span>
          </div>
          <div>
            <strong>Response:</strong>
            <pre id="resultResponse"></pre>
          </div>
        </div>
      </div>
      
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const form = document.getElementById('webhookForm');
          const generateBtn = document.getElementById('generateBtn');
          const backBtn = document.getElementById('backBtn');
          const resultDiv = document.getElementById('result');
          
          // Generate payload button
          generateBtn.addEventListener('click', function() {
            const eventType = document.getElementById('eventType').value;
            const paymentId = document.getElementById('paymentId').value;
            
            const payload = {
              event: eventType,
              transaction_id: paymentId,
              status: eventType.split('.')[1],
              amount: 100000,
              payment_method: "test",
              customer: {
                name: "Test Customer",
                email: "test@example.com",
                phone: "08123456789"
              },
              metadata: {
                test: true,
                timestamp: new Date().toISOString()
              }
            };
            
            document.getElementById('payloadJson').value = JSON.stringify(payload, null, 2);
          });
          
          // Send webhook button
          form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const webhookUrl = document.getElementById('webhookUrl').value;
            const webhookToken = document.getElementById('webhookToken').value;
            const payloadJson = document.getElementById('payloadJson').value;
            
            try {
              // Parse payload to validate JSON
              const payload = JSON.parse(payloadJson);
              
              // Calculate signature (simple implementation)
              const signature = 'd5507459a2' + Math.random().toString(36).substring(2, 15);
              
              // Send request
              const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Mayar-Signature': signature
                },
                body: payloadJson
              });
              
              // Get response text
              const responseText = await response.text();
              
              // Display result
              resultDiv.style.display = 'block';
              resultDiv.className = response.ok ? 'result success' : 'result error';
              document.getElementById('statusCode').textContent = response.status;
              document.getElementById('resultUrl').textContent = webhookUrl;
              document.getElementById('resultSignature').textContent = signature;
              document.getElementById('resultHeaders').textContent = 'Content-Type, x-mayar-signature';
              
              try {
                // Try to parse response as JSON for pretty display
                const responseJson = JSON.parse(responseText);
                document.getElementById('resultResponse').textContent = JSON.stringify(responseJson, null, 2);
              } catch {
                document.getElementById('resultResponse').textContent = responseText;
              }
              
            } catch (error) {
              alert('Error: ' + error.message);
            }
          });
          
          // Back button
          backBtn.addEventListener('click', function() {
            window.location.href = '/webhook-status';
          });
          
          // Generate initial payload
          generateBtn.click();
        });
      </script>
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
  }

  // Handle POST request (actual webhook test)
  if (context.request.method === 'POST') {
    try {
      const requestData = await context.request.json();
      
      return new Response(JSON.stringify({
        message: "Test webhook processed successfully",
        transaction_id: requestData.transaction_id || "unknown",
        status: "test_success"
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Error processing test webhook: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }

  // Handle other methods
  return new Response(JSON.stringify({ message: 'Method Not Allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Allow': 'GET, POST, OPTIONS',
      ...corsHeaders
    }
  });
}
