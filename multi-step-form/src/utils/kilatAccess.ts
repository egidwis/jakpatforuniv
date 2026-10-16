import { KILAT_PILOT_EMAILS, KILAT_SELF_SERVE_OPEN } from './constants';

/** Email admin yang dilewatkan trigger sql/117 — sama dengan pemeriksaan dashboard internal. */
const ADMIN_EMAIL = 'product@jakpat.net';

/**
 * Boleh memesan JFU Kilat sendiri (kartu Kilat, wizard `?product=kilat`)?
 *
 * Tiga pintu, satu tempat (Phase 5 §5.6):
 *   - `KILAT_SELF_SERVE_OPEN` — dibuka untuk semua (Push B);
 *   - admin — menguji wizard selama pintu tertutup;
 *   - `KILAT_PILOT_EMAILS` — akun uji non-admin (Push Uji).
 *
 * Hanya menyembunyikan pintu. Aturan gelombang ditegakkan trigger untuk
 * SETIAP peneliti, jadi pintu yang bocor tidak bisa memesan gelombang tak sah.
 */
export function canUseKilatSelfServe(email: string | null | undefined): boolean {
  if (KILAT_SELF_SERVE_OPEN) return true;
  const e = (email || '').trim().toLowerCase();
  if (!e) return false;
  return e === ADMIN_EMAIL || KILAT_PILOT_EMAILS.includes(e);
}
