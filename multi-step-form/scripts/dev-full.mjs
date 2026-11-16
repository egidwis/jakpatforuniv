#!/usr/bin/env node
// `npm run dev:full`: uji lokal yang paling mirip produksi.
//   1. .dev.vars dibuat dari .env (scripts/dev-vars.mjs; tanpa kunci DOKU & email)
//   2. vite build --mode localtest  (bundel sama dengan produksi; masa uji
//      webinar terbuka di localhost, lihat src/utils/webinarAccess.ts)
//   3. wrangler pages dev dist      (semua Pages Function + _middleware di workerd)
//
// Wrangler 4 butuh Node >= 22. Bila Node aktif lebih tua, script mencari Node 22+
// di nvm. Sengaja tidak memakai .nvmrc: Cloudflare Pages membacanya saat build
// produksi, dan versi Node build produksi tidak boleh ikut berubah.
//
// Datanya database PRODUKSI. Aman untuk melihat tampilan dan menyunting draft;
// bayar dimatikan (checkout.js) dan email tidak terkirim (tanpa kunci).
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || '8788';
const major = (v) => Number(String(v).replace(/^v/, '').split('.')[0]);

function findNode22() {
  if (major(process.version) >= 22) return process.execPath;
  const nvmDir = path.join(process.env.NVM_DIR || path.join(homedir(), '.nvm'), 'versions', 'node');
  if (!existsSync(nvmDir)) return null;
  const candidates = readdirSync(nvmDir)
    .filter((v) => major(v) >= 22)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of candidates) {
    const bin = path.join(nvmDir, v, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
    if (existsSync(bin)) return bin;
  }
  return null;
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// Cek port sebelum build, supaya tidak menunggu build lalu gagal di akhir.
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(Number(port), '127.0.0.1');
  });
}

if (!(await portFree(PORT))) {
  console.error(`✗ Port ${PORT} sedang dipakai, kemungkinan dev:full sebelumnya masih jalan.`);
  console.error(`  Hentikan dengan Ctrl+C di terminal itu, atau lihat prosesnya: lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
  console.error(`  Atau pakai port lain: PORT=8789 npm run dev:full`);
  process.exit(1);
}

const node22 = findNode22();
if (!node22) {
  console.error('✗ Wrangler 4 butuh Node 22 atau lebih baru. Pasang dulu: nvm install 22');
  process.exit(1);
}

run(process.execPath, [path.join(root, 'scripts', 'dev-vars.mjs')]);
run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'localtest']);

console.log(`\n▶ Uji lokal di http://localhost:${PORT}  (database PRODUKSI; bayar & email mati)\n`);
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const child = spawn(node22, [wrangler, 'pages', 'dev', 'dist', '--port', PORT], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
