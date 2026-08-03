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
    .replace(/^jakpat\.net\/s\//i, '')
    .replace(/^jakpat\./i, '');
}

/**
 * Every Jakpat ID we have seen looks like five alphanumeric characters with at
 * least one digit (ks8oh, qt0yt, 50bx0, 0bxr5, 8uvvh, 2fuad, z8wii, vq4c9),
 * while the junk fails one of those two conditions — `indah`, `dimas`, `andra`
 * (five letters, no digit); `lal`, `mon`, `ayu` (too short); `jakpat123` (too
 * long).
 *
 * ⚠️ ADVISORY ONLY — DO NOT PROMOTE THIS TO A HARD BLOCK without evidence.
 * That sample came from duplicate rows only, which is both biased and tiny.
 * Rejecting a real ID is far more damaging than the silent filtering that
 * happens today. Before this is allowed to block a submit:
 *   1. count how many existing page_respondents rows would fail this pattern,
 *   2. confirm the canonical format with Jakpat or the lottery platform,
 *   3. ship it as this soft warning first and watch it,
 *   4. only then consider blocking.
 *
 * @returns a human-readable warning, or null when nothing looks off.
 */
export function jakpatIdWarning(value: string): string | null {
  const id = normalizeJakpatId(value);
  if (!id) return null;

  if (!/^[a-zA-Z0-9]+$/.test(id)) {
    return 'Jakpat ID biasanya hanya berisi huruf dan angka. Coba cek lagi.';
  }
  if (id.length !== 5) {
    return 'Jakpat ID biasanya 5 karakter. Coba cek lagi.';
  }
  if (!/[0-9]/.test(id)) {
    return 'Jakpat ID biasanya memuat minimal satu angka. Pastikan ini bukan nama kamu.';
  }
  return null;
}
