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
