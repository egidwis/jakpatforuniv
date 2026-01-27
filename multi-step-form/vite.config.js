import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {},
  },
  configureServer(server) {
    // Tampilkan pesan saat server start (ini mungkin tidak muncul di terminal user karena clearscreen, tapi kita coba)
    console.log('-------------------------------------------');
    console.log('🔥 VITE PROXY MIDDLEWARE LOADED 🔥');
    console.log('-------------------------------------------');

    server.middlewares.use((req, res, next) => {
      // Log SEMUA request yang masuk untuk memastikan middleware jalan
      // Filter log HMR/CSS/JS supaya tidak spammy, fokus ke API
      if (!req.url.includes('@vite') && !req.url.includes('node_modules') && !req.url.match(/\.(css|js|map|json|png|svg)$/)) {
        console.log('>> Incoming Request:', req.method, req.url);
      }

      if (req.url.includes('/api/mayar-proxy')) {
        console.log('✅ HIT /api/mayar-proxy DETECTED!');

        if (req.method !== 'POST') {
          console.log('❌ Method not allowed:', req.method);
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            console.log('📦 Body received, length:', body.length);

            if (!body) {
              res.statusCode = 400;
              res.end(JSON.stringify({ message: 'Empty body' }));
              return;
            }

            const data = JSON.parse(body);
            const { endpoint, apiKey } = data;

            if (!endpoint || !apiKey) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Missing endpoint or apiKey' }));
              return;
            }

            console.log(`🚀 Forwarding to Mayar: ${endpoint}`);

            // Fetch ke Mayar
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify(data) // Kirim full data lagi, Mayar akan ignore field extra
            });

            console.log(`⬅️ Mayar Response Status: ${response.status}`);

            const responseText = await response.text();

            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(responseText); // Return apa adanya dari Mayar

          } catch (error) {
            console.error('💥 Internal Proxy Error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ message: error.message }));
          }
        });

        return; // Stop chain
      }

      next();
    });
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
