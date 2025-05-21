export function onRequest(context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webhook Status</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      background-color: #1a1a1a;
      color: #e0e0e0;
    }
    h1 {
      color: #ffffff;
      margin-bottom: 20px;
    }
    .card {
      background-color: #2a2a2a;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .status-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #3a3a3a;
    }
    .status-item:last-child {
      border-bottom: none;
    }
    .status-label {
      font-weight: 500;
    }
    .status-value {
      font-family: monospace;
    }
    .status-ok {
      color: #4ade80;
    }
    .status-warning {
      color: #facc15;
    }
    .status-error {
      color: #f87171;
    }
    button {
      background-color: #4a5568;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      margin-right: 10px;
    }
    button:hover {
      background-color: #2d3748;
    }
    .result {
      margin-top: 20px;
      padding: 15px;
      border-radius: 5px;
      white-space: pre-wrap;
      font-family: monospace;
      overflow-x: auto;
      background-color: #2a2a2a;
      border: 1px solid #3a3a3a;
    }
    a {
      color: #60a5fa;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>Webhook Status</h1>
  <p>Halaman ini menampilkan status konfigurasi webhook Mayar.</p>

  <div class="card">
    <h2>Environment Variables</h2>
    <div id="env-status">Loading...</div>
  </div>

  <div class="card">
    <h2>Webhook Configuration</h2>
    <div id="webhook-status">Loading...</div>
  </div>

  <div class="card">
    <h2>Actions</h2>
    <button id="testWebhookBtn">Test Webhook</button>
    <button id="refreshBtn">Refresh Status</button>
    <button id="backBtn">Kembali ke Beranda</button>
  </div>

  <div id="result" class="result">Results will appear here...</div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const envStatusDiv = document.getElementById('env-status');
      const webhookStatusDiv = document.getElementById('webhook-status');
      const resultDiv = document.getElementById('result');
      const testWebhookBtn = document.getElementById('testWebhookBtn');
      const refreshBtn = document.getElementById('refreshBtn');
      const backBtn = document.getElementById('backBtn');

      // Kembali ke beranda
      backBtn.addEventListener('click', function() {
        window.location.href = '/';
      });

      // Fungsi untuk memeriksa environment variables
      async function checkEnvironmentVariables() {
        try {
          const response = await fetch('/api/env-vars');
          const data = await response.json();

          const hasMayarApiKey = data.VITE_MAYAR_API_KEY && data.VITE_MAYAR_API_KEY.length > 20;
          const hasMayarWebhookToken = data.VITE_MAYAR_WEBHOOK_TOKEN && data.VITE_MAYAR_WEBHOOK_TOKEN.length > 20;

          let html = '<div class="status-item">';
          html += '<span class="status-label">Mayar API Key:</span>';
          html += \`<span class="status-value \${hasMayarApiKey ? 'status-ok' : 'status-error'}">\`;
          html += hasMayarApiKey ? '✓ Configured' : '✗ Not configured';
          html += '</span></div>';

          html += '<div class="status-item">';
          html += '<span class="status-label">Mayar Webhook Token:</span>';
          html += \`<span class="status-value \${hasMayarWebhookToken ? 'status-ok' : 'status-error'}">\`;
          html += hasMayarWebhookToken ? '✓ Configured' : '✗ Not configured';
          html += '</span></div>';

          html += '<div class="status-item">';
          html += '<span class="status-label">Available Environment Variables:</span>';
          html += \`<span class="status-value">\${data.debug?.envKeys?.join(', ') || 'None'}</span>\`;
          html += '</div>';

          envStatusDiv.innerHTML = html;
          return { hasMayarApiKey, hasMayarWebhookToken };
        } catch (error) {
          envStatusDiv.innerHTML = \`<div class="status-error">Error: \${error.message}</div>\`;
          return { hasMayarApiKey: false, hasMayarWebhookToken: false };
        }
      }

      // Fungsi untuk memeriksa konfigurasi webhook
      function checkWebhookConfiguration(envStatus) {
        const webhookUrl = \`\${window.location.origin}/webhook\`;
        const isCloudflare = window.location.hostname.includes('pages.dev') ||
                            window.location.hostname.includes('jakpatforuniv.com');

        let html = '<div class="status-item">';
        html += '<span class="status-label">Webhook URL:</span>';
        html += \`<span class="status-value" id="webhook-url">\${webhookUrl}</span></div>\`;

        html += '<div class="status-item">';
        html += '<span class="status-label">Deployment Platform:</span>';
        html += \`<span class="status-value">\${isCloudflare ? 'Cloudflare Pages' : 'Local Development'}</span></div>\`;

        html += '<div class="status-item">';
        html += '<span class="status-label">Webhook Handler:</span>';
        html += '<span class="status-value" id="webhook-handler-status">Checking...</span></div>';

        html += '<div class="status-item">';
        html += '<span class="status-label">Ready for Mayar:</span>';
        html += '<span class="status-value" id="mayar-ready-status">Checking...</span></div>';

        webhookStatusDiv.innerHTML = html;

        // Cek apakah webhook handler tersedia
        checkWebhookHandler();
      }

      // Cek apakah webhook handler tersedia dengan berbagai metode
      async function checkWebhookHandler() {
        try {
          const webhookUrl = document.getElementById('webhook-url').textContent;
          const handlerStatus = document.getElementById('webhook-handler-status');
          const mayarReadyStatus = document.getElementById('mayar-ready-status');

          // Coba OPTIONS request terlebih dahulu
          try {
            const optionsResponse = await fetch(webhookUrl, {
              method: 'OPTIONS'
            });

            if (optionsResponse.ok) {
              handlerStatus.textContent = '✓ Available (OPTIONS supported)';
              handlerStatus.className = 'status-ok';
              mayarReadyStatus.textContent = '✓ Ready';
              mayarReadyStatus.className = 'status-ok';
              return;
            }
          } catch (optionsError) {
            console.log('OPTIONS request failed:', optionsError.message);
          }

          // Jika OPTIONS gagal, coba HEAD request
          try {
            const headResponse = await fetch(webhookUrl, {
              method: 'HEAD'
            });

            if (headResponse.status === 405) {
              // 405 Method Not Allowed menunjukkan endpoint ada tapi tidak mendukung HEAD
              handlerStatus.textContent = '✓ Available (HEAD not supported)';
              handlerStatus.className = 'status-ok';
              mayarReadyStatus.textContent = '? Might be available (OPTIONS not supported)';
              mayarReadyStatus.className = 'status-warning';
              return;
            }
          } catch (headError) {
            console.log('HEAD request failed:', headError.message);
          }

          // Jika semua gagal, coba GET request sebagai fallback
          const getResponse = await fetch(webhookUrl, {
            method: 'GET'
          });

          if (getResponse.status === 405) {
            // 405 Method Not Allowed menunjukkan endpoint ada tapi tidak mendukung GET
            handlerStatus.textContent = '✓ Available (GET not supported)';
            handlerStatus.className = 'status-ok';
            mayarReadyStatus.textContent = '? Might be available (OPTIONS not supported)';
            mayarReadyStatus.className = 'status-warning';
          } else if (getResponse.ok) {
            handlerStatus.textContent = '✓ Available';
            handlerStatus.className = 'status-ok';
            mayarReadyStatus.textContent = '? Might be available (OPTIONS not supported)';
            mayarReadyStatus.className = 'status-warning';
          } else {
            handlerStatus.textContent = '✗ Not available (Status: ' + getResponse.status + ')';
            handlerStatus.className = 'status-error';
            mayarReadyStatus.textContent = '✗ Not ready';
            mayarReadyStatus.className = 'status-error';
          }
        } catch (error) {
          const handlerStatus = document.getElementById('webhook-handler-status');
          handlerStatus.textContent = '✗ Error checking handler: ' + error.message;
          handlerStatus.className = 'status-error';
          document.getElementById('mayar-ready-status').textContent = '✗ Not ready';
          document.getElementById('mayar-ready-status').className = 'status-error';
        }
      }
      }

      // Fungsi untuk menguji webhook
      testWebhookBtn.addEventListener('click', function() {
        window.location.href = '/test-webhook';
      });

      // Fungsi untuk refresh status
      refreshBtn.addEventListener('click', async function() {
        envStatusDiv.innerHTML = 'Loading...';
        webhookStatusDiv.innerHTML = 'Loading...';
        resultDiv.textContent = 'Refreshing status...';

        const envStatus = await checkEnvironmentVariables();
        checkWebhookConfiguration(envStatus);

        resultDiv.textContent = 'Status refreshed at ' + new Date().toLocaleTimeString();
      });

      // Periksa status saat halaman dimuat
      (async function() {
        const envStatus = await checkEnvironmentVariables();
        checkWebhookConfiguration(envStatus);
        resultDiv.textContent = 'Status loaded at ' + new Date().toLocaleTimeString();
      })();
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
    },
  });
}
