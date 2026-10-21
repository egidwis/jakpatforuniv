/**
 * Penolakan kuota harian dari database (sql/111: `assert_daily_ad_quota_days`).
 *
 * Dikenali lewat HINT `daily_quota_full` dulu. Teks "sudah penuh" tetap
 * diterima sebagai cadangan: sql/110 menolak tanpa HINT, dan pesannya bisa
 * datang terbungkus (message/details/hint PostgREST, atau Error biasa dari
 * pemanggil yang melempar ulang).
 */
export function isDailyQuotaFullError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: unknown; details?: unknown; hint?: unknown };
  if (e.hint === 'daily_quota_full') return true;
  return [e.message, e.details, e.hint]
    .filter((v): v is string => typeof v === 'string')
    .some((v) => v.includes('sudah penuh'));
}

/**
 * Penolakan gelombang Kilat dari database (sql/117): kuota per gelombang
 * (`enforce_kilat_wave_quota`) dan klaim peneliti (`validate_kilat_wave_claim`).
 *
 * ⚠️ WAJIB DICEK SEBELUM `isDailyQuotaFullError`: pesan gelombang penuh juga
 * memuat "sudah penuh", jadi cadangan teks di sana akan menelannya sebagai
 * kuota harian Iklan. Di sini hanya HINT yang dipercaya.
 */
export type KilatWaveErrorKind = 'full' | 'closed' | 'away' | 'too_far' | 'invalid';

export function kilatWaveErrorKind(err: unknown): KilatWaveErrorKind | null {
  if (!err || typeof err !== 'object') return null;
  const hint = (err as { hint?: unknown }).hint;
  if (hint === 'kilat_wave_full') return 'full';
  if (hint === 'kilat_wave_closed') return 'closed';
  // sql/122: mode libur menutup semua gelombang sejak tanggal nyala.
  if (hint === 'kilat_admin_away') return 'away';
  // sql/122 K3: peneliti hanya memesan 3 hari kerja mulai hari ini.
  if (hint === 'kilat_wave_too_far') return 'too_far';
  if (hint === 'kilat_wave_invalid') return 'invalid';
  return null;
}
