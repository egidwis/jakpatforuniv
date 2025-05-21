export function onRequest(context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mayar Webhook Test</title>
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
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    input, textarea, select {
      width: 100%;
      padding: 8px;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      font-family: inherit;
      font-size: 14px;
      background-color: #2a2a2a;
      color: #e0e0e0;
    }
    textarea {
      height: 150px;
      font-family: monospace;
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
    }
    .success {
      background-color: #064e3b;
      border: 1px solid #065f46;
      color: #4ade80;
    }
    .error {
      background-color: #7f1d1d;
      border: 1px solid #991b1b;
      color: #f87171;
    }
    .loading {
      background-color: #374151;
      border: 1px solid #4b5563;
      color: #e5e7eb;
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
  <h1>Mayar Webhook Test</h1>
  <p>Gunakan halaman ini untuk menguji webhook Mayar dengan mengirim payload simulasi.</p>

  <div class="form-group">
    <label for="webhookUrl">Webhook URL:</label>
    <input type="text" id="webhookUrl" value="/.netlify/functions/webhook" placeholder="Contoh: /.netlify/functions/webhook">
  </div>

  <div class="form-group">
    <label for="eventType">Tipe Event:</label>
    <select id="eventType">
      <option value="payment.success">payment.success</option>
      <option value="payment.failed">payment.failed</option>
      <option value="payment.expired">payment.expired</option>
    </select>
  </div>

  <div class="form-group">
    <label for="paymentId">ID Pembayaran:</label>
    <input type="text" id="paymentId" placeholder="Contoh: pay_123456789">
  </div>

  <div class="form-group">
    <label for="webhookToken">Webhook Token (untuk signature):</label>
    <input type="text" id="webhookToken" placeholder="Webhook token dari .env.local">
  </div>

  <div class="form-group">
    <label for="payload">Payload JSON:</label>
    <textarea id="payload" placeholder="Payload akan dibuat otomatis berdasarkan input di atas"></textarea>
  </div>

  <button id="generateButton">Generate Payload</button>
  <button id="testButton">Kirim Webhook</button>
  <button id="backButton">Kembali ke Status</button>

  <div id="result" class="result loading">Hasil akan ditampilkan di sini...</div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const webhookUrlInput = document.getElementById('webhookUrl');
      const eventTypeSelect = document.getElementById('eventType');
      const paymentIdInput = document.getElementById('paymentId');
      const webhookTokenInput = document.getElementById('webhookToken');
      const payloadTextarea = document.getElementById('payload');
      const generateButton = document.getElementById('generateButton');
      const testButton = document.getElementById('testButton');
      const backButton = document.getElementById('backButton');
      const resultDiv = document.getElementById('result');

      // Kembali ke halaman status
      backButton.addEventListener('click', function() {
        window.location.href = '/webhook-status';
      });

      // Generate random payment ID if empty
      if (!paymentIdInput.value) {
        paymentIdInput.value = 'pay_test_' + Date.now();
      }

      // Fungsi untuk menghasilkan payload berdasarkan input
      function generatePayload() {
        const eventType = eventTypeSelect.value;
        const paymentId = paymentIdInput.value || 'pay_test_' + Date.now();

        const payload = {
          type: eventType,
          data: {
            id: paymentId,
            status: eventType === 'payment.success' ? 'completed' :
                   eventType === 'payment.failed' ? 'failed' : 'expired',
            amount: 100000,
            created_at: new Date().toISOString()
          }
        };

        payloadTextarea.value = JSON.stringify(payload, null, 2);
        return payload;
      }

      // Generate payload saat halaman dimuat
      generatePayload();

      // Generate payload saat tombol diklik
      generateButton.addEventListener('click', function() {
        generatePayload();
        resultDiv.className = 'result loading';
        resultDiv.textContent = 'Payload dibuat. Klik "Kirim Webhook" untuk menguji.';
      });

      // Fungsi untuk menghitung signature
      async function calculateSignature(payload, token) {
        const encoder = new TextEncoder();
        const data = encoder.encode(payload);
        const key = encoder.encode(token);

        // Gunakan Web Crypto API untuk menghitung HMAC-SHA256
        const cryptoKey = await crypto.subtle.importKey(
          'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);

        // Konversi ke hex string
        return Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }

      // Kirim webhook saat tombol diklik
      testButton.addEventListener('click', async function() {
        resultDiv.className = 'result loading';
        resultDiv.textContent = 'Mengirim webhook...';

        try {
          const webhookUrl = webhookUrlInput.value;
          const payload = payloadTextarea.value;
          const webhookToken = webhookTokenInput.value;

          // Hitung signature jika webhook token tersedia
          let headers = {
            'Content-Type': 'application/json'
          };

          let signatureInfo = 'No webhook token provided, signature not calculated';

          if (webhookToken) {
            const signature = await calculateSignature(payload, webhookToken);
            headers['x-mayar-signature'] = signature;
            signatureInfo = `Signature calculated: ${signature.substring(0, 10)}...`;
          }

          // Log request details
          console.log('Sending webhook request:', {
            url: webhookUrl,
            method: 'POST',
            headers: Object.keys(headers),
            payloadLength: payload.length
          });

          // Kirim request ke webhook URL
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: headers,
            body: payload
          });

          let responseData;
          try {
            // Coba parse sebagai JSON
            responseData = await response.json();
            responseData = JSON.stringify(responseData, null, 2);
          } catch (e) {
            // Jika bukan JSON, ambil sebagai text
            responseData = await response.text();
          }

          // Tampilkan hasil
          resultDiv.className = response.ok ? 'result success' : 'result error';
          resultDiv.innerHTML = `
<strong>Status:</strong> ${response.status} ${response.statusText}
<strong>Webhook URL:</strong> ${webhookUrl}
<strong>Signature:</strong> ${signatureInfo}
<strong>Headers:</strong> ${Object.keys(headers).join(', ')}

<strong>Response:</strong>
${responseData}`;
        } catch (error) {
          resultDiv.className = 'result error';
          resultDiv.innerHTML = `
<strong>Error:</strong> ${error.message}
<strong>Webhook URL:</strong> ${webhookUrlInput.value}

<strong>Details:</strong>
${error.stack || 'No stack trace available'}`;
        }
      });
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
