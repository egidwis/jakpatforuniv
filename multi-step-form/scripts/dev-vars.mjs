#!/usr/bin/env node
// Membuat .dev.vars (dibaca `wrangler pages dev`) dari .env untuk uji lokal.
//
// Dipanggil oleh `npm run dev:full`, jadi selalu ditulis ulang dari .env.
// Hanya kunci di ALLOW yang disalin. Kunci DOKU dan email SENGAJA tidak ikut:
// uji lokal memakai database produksi, jadi laptop tidak boleh menerbitkan
// tagihan DOKU atau mengirim email sungguhan. Fitur yang butuh kunci itu akan
// gagal di lokal, dan memang begitu seharusnya; uji di produksi.
//
// WEBINAR_LOCAL_OPEN=true membuka masa uji webinar untuk semua akun, hanya
// untuk permintaan ke localhost (lihat functions/api/webinar/_access.js).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const outPath = path.join(root, '.dev.vars');

const ALLOW = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_EMAILS',
  'OPENROUTER_API_KEY',
];

const LOCAL_ONLY = {
  WEBINAR_LOCAL_OPEN: 'true',
};

if (!existsSync(envPath)) {
  console.error('✗ .env tidak ditemukan di', root);
  process.exit(1);
}

const parsed = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  parsed[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}

const out = {};
for (const key of ALLOW) if (parsed[key]) out[key] = parsed[key];
Object.assign(out, LOCAL_ONLY);

const missing = ['SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !out[k]);
if (!out.VITE_SUPABASE_URL && !out.SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
if (missing.length) {
  console.error(`✗ .env belum berisi: ${missing.join(', ')}`);
  process.exit(1);
}

const body = [
  '# Dibuat otomatis oleh scripts/dev-vars.mjs dari .env. Jangan diedit; jangan di-commit.',
  '# Kunci DOKU dan email sengaja tidak disalin (uji lokal = database produksi).',
  ...Object.entries(out).map(([k, v]) => `${k}=${JSON.stringify(v)}`),
  '',
].join('\n');

writeFileSync(outPath, body, { mode: 0o600 });
console.log(`✓ .dev.vars ditulis (${Object.keys(out).length} kunci; tanpa DOKU & email)`);
