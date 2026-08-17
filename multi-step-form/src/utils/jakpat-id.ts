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
 * Strip the wrappers people actually paste. Never rejects, never reshapes the
 * ID itself.
 *
 * Case is left alone on purpose. Stored values are read as-is by the lottery
 * platform, and whether their matching is case-sensitive is still an open
 * question with them — lowercasing here could silently break a match that
 * works today. Revisit once that is answered.
 */
export function normalizeJakpatId(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^jakpat\.net\/s\//i, '');
}

/**
 * Advisory check for standard Jakpat ID format.
 * Non-standard formats (such as IDs containing '.', '-', '_') are allowed without warning.
 *
 * @returns a human-readable warning, or null when nothing looks off.
 */
export function jakpatIdWarning(value: string): string | null {
  const id = normalizeJakpatId(value);
  if (!id) return null;

  // Allow '.', '-', '_' or other non-alphanumeric characters without warning
  if (/[._-]/.test(id)) {
    return null;
  }

  if (id.length !== 5) {
    return 'Jakpat ID biasanya 5 karakter. Coba cek lagi.';
  }
  if (!/[0-9]/.test(id)) {
    return 'Jakpat ID biasanya memuat minimal satu angka. Pastikan ini bukan nama kamu.';
  }
  return null;
}
