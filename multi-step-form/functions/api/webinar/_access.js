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

export function webinarOpenFor(email) {
  if (!WEBINAR_PREVIEW_ONLY) return true;
  const normalized = String(email || '').trim().toLowerCase();
  return normalized !== '' && WEBINAR_PREVIEW_EMAILS.includes(normalized);
}
