import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

// Dev-only bridge: menjalankan Cloudflare Pages Functions asli di
// functions/api/doku/sac/*.js saat `vite dev`, karena runtime Pages tidak ada
// di dev server. Node 20+ menyediakan Web API yang dipakai functions tersebut
// (Request, Response, fetch, crypto.subtle), jadi dev dan prod tetap satu
// jalur kode — tidak ada duplikasi logika seperti dokuProxyPlugin (checkout).
function dokuSacFunctionsDevPlugin() {
  const HANDLERS = ['balance', 'history', 'payout', 'create', 'transfer'];
  return {
    name: 'doku-sac-functions-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url && req.url.match(/^\/api\/doku\/sac\/([a-z]+)(\?|$)/);
        if (!match || !HANDLERS.includes(match[1])) return next();

        (async () => {
          const modulePath = pathToFileURL(
            path.resolve(__dirname, 'functions/api/doku/sac', `${match[1]}.js`)
          ).href;
          const { onRequest } = await import(modulePath);

          const env = loadEnv('', process.cwd(), '');
          const url = `http://${req.headers.host || 'localhost'}${req.url}`;

          let body;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            body = await new Promise((resolve, reject) => {
              let data = '';
              req.on('data', (chunk) => (data += chunk));
              req.on('end', () => resolve(data));
              req.on('error', reject);
            });
          }

          const request = new Request(url, {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] || 'application/json' },
            body: body || undefined,
          });

          const response = await onRequest({ request, env });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch((error) => {
          console.error('💥 DOKU SAC dev bridge error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        });
      });
    },
  };
}



function dokuProxyPlugin() {
  return {
    name: 'doku-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.includes('/api/doku/checkout')) {
          console.log('✅ HIT ' + req.url + ' DETECTED! Method: ' + req.method);

          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', chunk => body += chunk.toString());

          req.on('end', async () => {
            try {
              if (!body) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Empty body' }));
                return;
              }

              const requestData = JSON.parse(body);

              // Ambil env variables via vite loadEnv
              const env = loadEnv('', process.cwd(), '');
              const clientId = env.VITE_DOKU_CLIENT_ID;
              const secretKey = env.DOKU_SECRET_KEY;

              if (!clientId || !secretKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: "DOKU credentials missing in .env.local" }));
                return;
              }

              const dokuPayload = {
                order: {
                  amount: requestData.amount,
                  invoice_number: requestData.invoice_number,
                  currency: "IDR",
                  callback_url: requestData.callback_url || undefined,
                  auto_redirect: true
                },
                payment: {
                  payment_due_date: requestData.payment_due_date || 60
                },
                customer: {
                  id: requestData.customer.email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50),
                  name: requestData.customer.name.substring(0, 255),
                  email: requestData.customer.email.substring(0, 128)
                }
              };

              if (requestData.customer.phone) {
                dokuPayload.customer.phone = requestData.customer.phone.replace(/[^0-9]/g, '').substring(0, 16);
              }

              const bodyString = JSON.stringify(dokuPayload);
              const requestId = crypto.randomUUID();
              const requestTimestamp = new Date().toISOString().slice(0, 19) + "Z";
              const requestTarget = "/checkout/v1/payment";

              const digest = crypto.createHash('sha256').update(bodyString).digest('base64');
              const componentStringToSign = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
              
              const signature = "HMACSHA256=" + crypto.createHmac('sha256', secretKey).update(componentStringToSign).digest('base64');

              let apiUrl = "https://api-sandbox.doku.com/checkout/v1/payment";
              if (env.VITE_DOKU_ENV === 'production') {
                apiUrl = "https://api.doku.com/checkout/v1/payment";
              }

              console.log(`🚀 Forwarding to DOKU: ${apiUrl}`);

              const dokuResponse = await fetch(apiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Client-Id": clientId,
                  "Request-Id": requestId,
                  "Request-Timestamp": requestTimestamp,
                  "Signature": signature
                },
                body: bodyString
              });

              const resultText = await dokuResponse.text();
              res.statusCode = dokuResponse.status;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(resultText);

            } catch (error) {
              console.error('💥 DOKU Proxy Error:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
          });

          return; // Stop chain
        }

        next();
      });
    }
  };
}

function googleFormsProxyPlugin() {
  return {
    name: 'google-forms-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.includes('/api/google-forms-proxy')) {
          console.log('✅ HIT google-forms-proxy DETECTED! URL: ' + req.url);

          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.statusCode = 200;
            res.end();
            return;
          }

          const urlObj = new URL(req.url, 'http://localhost');
          const targetUrl = urlObj.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
          }

          if (!targetUrl.includes('docs.google.com/forms')) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Only Google Forms URLs are allowed' }));
            return;
          }

          fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          })
            .then(async (fetchRes) => {
              const html = await fetchRes.text();
              res.statusCode = fetchRes.status;
              res.setHeader('Content-Type', 'text/html');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              res.end(html);
            })
            .catch((err) => {
              console.error('💥 local proxy error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: err.message }));
            });

          return;
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dokuProxyPlugin(), dokuSacFunctionsDevPlugin(), googleFormsProxyPlugin()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/cdn': {
        target: 'https://zewuzezbmrmpttysjvpg.supabase.co/storage/v1/object/public',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cdn/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
  },
});
