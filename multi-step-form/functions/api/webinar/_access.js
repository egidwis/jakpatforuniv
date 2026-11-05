// Masa uji sebelum rilis: webinar hanya terbuka untuk akun di daftar ini.
//
// Saat rilis, ubah WEBINAR_PREVIEW_ONLY menjadi false di sini DAN di
// src/utils/webinarAccess.ts (spec memastikan keduanya sama), lalu deploy.
//
// Selama masa uji:
// - checkout, my, sync menolak akun lain (403);
// - events mengembalikan daftar kosong + open:false untuk selain daftar ini,
//   jadi section & menu homepage tidak muncul;
// - event (API checkout) menjawab 404 untuk selain daftar ini;
// - halaman publik /webinar menjawab 404; /webinar/<slug> hanya untuk acara
//   is_test atau link pratinjau; link gabung tetap jalan (token hanya milik pembeli).
export const WEBINAR_PREVIEW_ONLY = true;
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
