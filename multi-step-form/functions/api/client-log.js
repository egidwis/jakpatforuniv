/**
 * POST /api/client-log — laporan galat dari SPA (sendBeacon).
 *
 * Sampai Nov 2026 SPA tidak meninggalkan jejak apa pun saat gagal: layar putih
 * di ponsel hanya diketahui lewat laporan lisan. Function ini menulis satu
 * baris JSON ke console.error → terlihat di log Cloudflare Pages Functions
 * (Real-time Logs / `wrangler pages deployment tail`). Tanpa tabel, tanpa SQL.
 *
 * Pengirim: src/utils/clientLog.ts dan skrip watchdog inline di index.html.
 * Hanya kolom di ALLOWED yang ditulis; tidak ada email, token, atau query string.
 */

const MAX_BODY = 8 * 1024;
const PER_IP_PER_MINUTE = 20;
const LIMITS = { kind: 64, message: 500, stack: 2000, path: 300, stage: 40, proto: 16, net: 32, ua: 300, build: 40, detail: 1500 };
const ALLOWED = Object.keys(LIMITS);
const NUMBERS = ['sinceNavMs', 'persisted'];

// Pembatas per isolate. Bukan pengaman keras (isolate banyak & berumur pendek),
// cukup untuk mencegah satu tab berulang membanjiri log.
let windowStart = 0;
let perIp = new Map();
export function __resetClientLogLimiter() {
  windowStart = 0;
  perIp = new Map();
}

function overLimit(ip, now) {
  if (now - windowStart > 60_000) {
    windowStart = now;
    perIp = new Map();
  }
  const n = (perIp.get(ip) || 0) + 1;
  perIp.set(ip, n);
  return n > PER_IP_PER_MINUTE;
}

function clean(input) {
  const out = {};
  for (const key of ALLOWED) {
    const v = input[key];
    if (typeof v === 'string' && v) out[key] = v.slice(0, LIMITS[key]);
  }
  for (const key of NUMBERS) {
    const v = input[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.round(v);
    else if (typeof v === 'boolean') out[key] = v;
  }
  if (out.path) out.path = out.path.split(/[?#]/)[0];
  return out;
}

const empty = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') return empty(405);

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return empty(403);

  const text = await request.text();
  if (text.length > MAX_BODY) return empty(413);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return empty(400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.kind !== 'string' || !body.kind) {
    return empty(400);
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (overLimit(ip, Date.now())) return empty(429);

  const cf = request.cf || {};
  console.error(JSON.stringify({
    tag: 'client-log',
    ...clean(body),
    country: typeof cf.country === 'string' ? cf.country : undefined,
    colo: typeof cf.colo === 'string' ? cf.colo : undefined,
    httpProtocol: typeof cf.httpProtocol === 'string' ? cf.httpProtocol : undefined,
  }));
  return empty(204);
}
