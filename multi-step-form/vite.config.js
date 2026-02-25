import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Custom Vite plugin to proxy /api/mayar-proxy requests to Mayar API
// This replaces the Cloudflare Pages Functions (functions/api/mayar-proxy.js)
// when running locally with `npm run dev`.
function mayarProxyPlugin() {
  return {
    name: 'mayar-proxy',
    configureServer(server) {
      console.log('-------------------------------------------');
      console.log('🔥 MAYAR PROXY PLUGIN LOADED 🔥');
      console.log('-------------------------------------------');

      server.middlewares.use((req, res, next) => {
        // Debug: log non-asset requests
        if (
          !req.url.includes('@vite') &&
          !req.url.includes('node_modules') &&
          !req.url.match(/\.(css|js|map|json|png|svg|woff|ttf|ico)$/)
        ) {
          console.log('>> Incoming Request:', req.method, req.url);
        }

        if (
          req.url.includes('/api/mayar-proxy') ||
          req.url.includes('/api/simple-mayar-proxy')
        ) {
          console.log('✅ HIT ' + req.url + ' DETECTED! Method: ' + req.method);

          // Handle CORS Preflight
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader(
              'Access-Control-Allow-Headers',
              'Content-Type, Authorization, X-Webhook-Token, Accept'
            );
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            console.log('❌ Method not allowed:', req.method);
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              console.log('📦 Body received, length:', body.length);

              if (!body) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Empty body' }));
                return;
              }

              const data = JSON.parse(body);
              const { endpoint, apiKey, webhookToken, ...rest } = data;

              if (!endpoint || !apiKey) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({ message: 'Missing endpoint or apiKey' })
                );
                return;
              }

              console.log(`🚀 Forwarding to Mayar: ${endpoint}`);

              const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              };

              if (webhookToken) {
                headers['X-Webhook-Token'] = webhookToken;
              }

              // Forward to Mayar
              const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(rest),
              });

              console.log(`⬅️ Mayar Response Status: ${response.status}`);

              const responseText = await response.text();

              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(responseText);
            } catch (error) {
              console.error('💥 Internal Proxy Error:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: error.message }));
            }
          });

          return; // Stop middleware chain
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mayarProxyPlugin()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {},
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
