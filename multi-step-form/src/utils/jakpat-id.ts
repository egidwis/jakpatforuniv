/**
 * Jakpat ID hygiene for the public respondent form.
 *
 * The third-party lottery platform matches `jakpat_id` against its own database
 * to pay winners. An ID it cannot find silently drops that respondent from the
 * draw — they filled in the survey, uploaded proof, and never learn they were
 * never in the running. The survey page template already warns people not to
 * paste the `https://jakpat.net/s/` prefix and they paste it anyway, so the fix
 * is to correct the input rather than scold it.
 *
 * Deliberately split in two:
 *   normalizeJakpatId — always applied, only ever removes wrapping noise
 *   jakpatIdWarning   — advisory only, never blocks submit (see below)
 */

/**
 * Strip the wrappers people actually paste (https://jakpat.net/s/..., stray spaces).
 * Preserves the ID itself, including custom usernames (e.g. tegarerputra) and default IDs (JAKPAT.50BX0).
 * Case is left alone on purpose.
 */
export function normalizeJakpatId(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^jakpat\.net\/s\//i, '');
}

/**
 * Advisory check for common respondent input mistakes:
 * - Entering an email address (contains '@')
 * - Pasting non-Jakpat links (contains slashes or external web domains)
 * - Entering a phone number instead of Jakpat ID
 *
 * Custom Jakpat IDs (e.g. tegarerputra), standard IDs (JAKPAT.50BX0, 50BX0),
 * and other user-chosen formats pass without warning.
 *
 * @returns a human-readable warning, or null when nothing looks off.
 */
export function jakpatIdWarning(value: string): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  const id = normalizeJakpatId(trimmed);
  if (!id) return null;

  // Check if respondent entered an email address
  if (id.includes('@')) {
    return 'Kamu memasukkan alamat email. Mohon masukkan Jakpat ID kamu.';
  }

  // Check if respondent accidentally pasted a non-Jakpat URL or external link
  if (
    id.includes('/') ||
    /^(docs\.google|forms\.gle|bit\.ly|linktr\.ee|instagram\.com|facebook\.com|t\.me|drive\.google)/i.test(id) ||
    /\.(com|org|net|id|edu|co|io|app)\//i.test(id)
  ) {
    return 'Tampaknya kamu memasukkan tautan lain. Mohon masukkan Jakpat ID kamu.';
  }

  // Check if respondent entered a phone number (e.g. 081234567890, +628123456789)
  if (/^(\+?62|0)8[0-9]{8,}$/.test(id)) {
    return 'Kamu memasukkan nomor HP. Mohon masukkan Jakpat ID dari aplikasi Jakpat.';
  }

  return null;
}
