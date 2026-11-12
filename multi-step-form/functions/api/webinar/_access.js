// Saklar masa uji. DIMATIKAN 12 Nov 2026: webinar terbuka untuk semua akun.
//
// Menyalakannya lagi (true) di sini DAN di src/utils/webinarAccess.ts (spec
// memastikan keduanya sama) mengembalikan masa uji:
// - checkout, my, sync menolak akun di luar WEBINAR_PREVIEW_EMAILS (403);
// - events mengembalikan daftar kosong + open:false, jadi section & menu homepage
//   tersembunyi;
// - event (API checkout) menjawab 404;
// - halaman publik /webinar menjawab 404; /webinar/<slug> hanya untuk acara
//   is_test atau link pratinjau; link gabung tetap jalan (token hanya milik pembeli).
//
// Sesudah rilis, acara uji (is_test) tetap bisa dibuka dan dibeli siapa pun yang
// tahu URL-nya (keputusan pemilik produk 12 Nov: risikonya kecil, pembayaran
// nyasar di-refund admin). Acara uji tidak masuk daftar selama is_listed=false.
export const WEBINAR_PREVIEW_ONLY = false;
export const WEBINAR_PREVIEW_EMAILS = ['tegar@jakpat.net'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// Uji lokal (`npm run dev:full`): masa uji terbuka untuk semua akun bila
// .dev.vars berisi WEBINAR_LOCAL_OPEN=true DAN permintaan datang ke localhost.
// Produksi tidak pernah memenuhi syarat kedua, jadi variabel yang telanjur
// diisi di dashboard Cloudflare pun tidak membuka apa-apa.
export function webinarLocalOpen(env, request) {
  if (env?.WEBINAR_LOCAL_OPEN !== 'true' || !request?.url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

export function webinarPreviewOnly(env, request) {
  return WEBINAR_PREVIEW_ONLY && !webinarLocalOpen(env, request);
}

export function webinarOpenFor(email, env, request) {
  if (!webinarPreviewOnly(env, request)) return true;
  const normalized = String(email || '').trim().toLowerCase();
  return normalized !== '' && WEBINAR_PREVIEW_EMAILS.includes(normalized);
}
