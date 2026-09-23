import type { ExistingPage } from './types';

/**
 * Apa yang harus diketahui admin tentang halaman iklan SEBELUM me-reset order
 * ke antrean review.
 *
 * Reset tidak menyentuh halaman. Tapi order batal yang punya halaman adalah
 * persis bentuk insiden 08ef25ac ("asda"): halaman sisa pelunasan yang dibatalkan
 * tetap terbit, dan tanpa tanggal ia tayang selamanya. Dialognya menyebut
 * FAKTA dari baris halaman — bukan tebakan — supaya admin tahu apakah ada yang
 * masih harus dibereskan di papan Jadwal.
 *
 * Urutan cabang = urutan yang menentukan apa yang dilihat responden:
 * draft menang (gerbang `is_published`), lalu disembunyikan (feed membuangnya),
 * lalu ditutup sistem (sql/99), lalu jendela.
 */
export type ResetPageState = 'draft' | 'hidden' | 'auto_closed' | 'open' | 'ended';

export interface ResetPageWarning {
  slug: string;
  state: ResetPageState;
  respondents: number;
}

export function resetPageWarningOf(
  page: ExistingPage | undefined,
  now: number = Date.now(),
): ResetPageWarning | null {
  if (!page) return null;
  const respondents = page.respondents_count ?? 0;
  const base = { slug: page.slug, respondents };
  if (!page.is_published) return { ...base, state: 'draft' };
  if (page.is_hidden) return { ...base, state: 'hidden' };
  if (page.auto_closed_at) return { ...base, state: 'auto_closed' };
  const end = page.publish_end_date ? Date.parse(page.publish_end_date) : null;
  // Tanggal selesai NULL = tayang selamanya di feed — justru kasus terburuk.
  if (end === null || Number.isNaN(end) || end > now) return { ...base, state: 'open' };
  return { ...base, state: 'ended' };
}

export const RESET_PAGE_STATE_LABEL: Record<ResetPageState, string> = {
  draft: 'belum terbit',
  hidden: 'tersembunyi',
  auto_closed: 'jendela tertutup otomatis',
  open: 'masih tayang',
  ended: 'sudah selesai tayang',
};

/** Kalimat penutup per keadaan — apa yang terjadi pada halaman sesudah Reset. */
export const RESET_PAGE_STATE_NOTE: Record<ResetPageState, string> = {
  draft: 'Halaman tidak ikut berubah.',
  hidden: 'Halaman tidak ikut berubah dan tetap tersembunyi sampai ditampilkan lagi di papan Jadwal.',
  auto_closed: 'Halaman tidak ikut berubah; jendelanya dibuka lagi otomatis hanya setelah order dibayar.',
  open: 'Halaman ini masih tayang ke responden. Sembunyikan dulu di papan Jadwal.',
  ended: 'Halaman tidak ikut berubah.',
};
