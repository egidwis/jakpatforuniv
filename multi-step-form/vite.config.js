import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

// Dev-only bridge: menjalankan Cloudflare Pages Functions asli di
// functions/api/doku/sac/*.js saat `vite dev`, karena runtime Pages tidak ada
// di dev server. Node 20+ menyediakan Web API yang dipakai functions tersebut
// (Request, Response, fetch, crypto.subtle), jadi dev dan prod tetap satu
// jalur kode — tidak ada duplikasi logika.
//
// Pola inilah yang benar untuk SEMUA jembatan di berkas ini. Checkout dulu
// jadi pengecualian (`dokuProxyPlugin` menulis ulang logikanya) dan salinannya
// menyimpang sampai merusak data produksi — lihat catatan panjang di
// `dokuCheckoutDevPlugin` di bawah sebelum menulis jembatan baru.
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

// Dev-only bridge for the self-service checkout Pages Function
// functions/api/doku/create-payment.js. Same rationale as the SAC bridge above:
// the Pages runtime isn't present under `vite dev`, so we import the real
// onRequest handler and run it on Node's Web APIs — one code path for dev+prod.
// Without this, POST /api/doku/create-payment returns 404 on port 5173 and the
// user-dashboard self-service checkout fails ("Gagal membuat pembayaran DOKU").
function dokuCreatePaymentDevPlugin() {
  return {
    name: 'doku-create-payment-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !/^\/api\/doku\/create-payment(\?|$)/.test(req.url)) return next();

        (async () => {
          const modulePath = pathToFileURL(
            path.resolve(__dirname, 'functions/api/doku/create-payment.js')
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
          console.error('💥 DOKU create-payment dev bridge error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        });
      });
    },
  };
}

// Dev-only bridge for the forgot-password email existence check
// functions/api/auth/check-email.js. Same rationale as the DOKU bridges: the
// Pages runtime isn't present under `vite dev`, so we import the real onRequest
// handler and run it on Node's Web APIs — one code path for dev+prod.
function authCheckEmailDevPlugin() {
  return {
    name: 'auth-check-email-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !/^\/api\/auth\/check-email(\?|$)/.test(req.url)) return next();

        (async () => {
          const modulePath = pathToFileURL(
            path.resolve(__dirname, 'functions/api/auth/check-email.js')
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
          console.error('💥 auth check-email dev bridge error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        });
      });
    },
  };
}



// Dev-only bridge for the admin manual-invoice Pages Function
// functions/api/doku/checkout.js. Same rationale as the bridges above: the
// Pages runtime isn't present under `vite dev`, so we import the real
// onRequest handler and run it on Node's Web APIs — one code path for dev+prod.
//
// ⚠️ INI DULU SALINAN TANGAN (`dokuProxyPlugin`), DAN SALINANNYA MENYIMPANG.
//
// Sampai 2026-09-10 berkas ini menyusun sendiri payload, tanda tangan HMAC,
// dan respons DOKU untuk endpoint checkout. Dua penyimpangan lolos tanpa satu
// pun error:
//
//   1. `request_id` DIBUANG dari respons. Salinan itu membuat `requestId`,
//      menandatanganinya, mengirimnya sebagai header — lalu memulangkan badan
//      mentah DOKU. `createManualInvoice` membaca `data.request_id ?? null`,
//      jadi setiap tagihan yang terbit dari lokal lahir dengan
//      `invoices.doku_request_id = NULL`. Cancel Order API menuntut nilai itu
//      sebagai `original_request_id`, jadi tagihan itu TIDAK BISA DIMATIKAN —
//      selamanya. Terukur di produksi: dari 42 tagihan sejak sql/84, tepat 2
//      yang kehilangannya, dan dua-duanya diterbitkan dari localhost.
//
//   2. Routing Sub Account HILANG. `checkout.js` menyisipkan
//      `additional_info.account.id` (SAC JFU); salinannya tidak. Karena `.env`
//      memakai kredensial PRODUKSI, tagihan uji dari lokal menerbitkan link
//      DOKU sungguhan yang uangnya mendarat di akun yang salah.
//
// Keduanya lolos dari `dueDate.spec.js` karena penjaga itu hanya menyapu
// `functions/api/doku/`, sementara salinannya hidup di sini.
//
// Yang dijaga sekarang bukan perilaku dev, melainkan janji bahwa dev dan
// produksi menjalankan SATU berkas yang sama — sehingga apa pun yang terbukti
// di lokal tetap benar sesudah deploy. Ditegakkan oleh
// functions/api/doku/devBridge.spec.js.
//
// Catatan: gerbang admin di functions/api/doku/_middleware.js tidak ikut jalan
// di dev (middleware Pages tidak ada di sini) — sama seperti sebelumnya, jadi
// bukan pelonggaran baru.
function dokuCheckoutDevPlugin() {
  return {
    name: 'doku-checkout-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !/^\/api\/doku\/checkout(\?|$)/.test(req.url)) return next();

        (async () => {
          const modulePath = pathToFileURL(
            path.resolve(__dirname, 'functions/api/doku/checkout.js')
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
            headers: {
              'content-type': req.headers['content-type'] || 'application/json',
              // Diteruskan supaya bentuk permintaannya sama dengan produksi.
              // `checkout.js` sendiri tidak membacanya — yang memeriksanya
              // adalah `_middleware.js`, yang tidak jalan di dev.
              ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
            },
            body: body || undefined,
          });

          const response = await onRequest({ request, env });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch((error) => {
          console.error('💥 DOKU checkout dev bridge error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        });
      });
    },
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
            },
            redirect: 'follow'
          })
            .then(async (fetchRes) => {
              const html = await fetchRes.text();
              res.statusCode = fetchRes.status;
              res.setHeader('Content-Type', 'text/html');
              res.setHeader('X-Final-Url', fetchRes.url);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              res.setHeader('Access-Control-Expose-Headers', 'X-Final-Url');
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

// Dev-only bridge for Cloudflare Pages Function functions/api/chat.js
function chatDevPlugin() {
  return {
    name: 'chat-dev-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !/^\/api\/chat(\?|$)/.test(req.url)) return next();

        (async () => {
          const modulePath = pathToFileURL(
            path.resolve(__dirname, 'functions/api/chat.js')
          ).href;
          const { onRequestPost } = await import(modulePath);

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

          const response = await onRequestPost({ request, env });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch((error) => {
          console.error('💥 Chat dev bridge error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dokuCheckoutDevPlugin(), dokuSacFunctionsDevPlugin(), dokuCreatePaymentDevPlugin(), authCheckEmailDevPlugin(), googleFormsProxyPlugin(), chatDevPlugin()],
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
