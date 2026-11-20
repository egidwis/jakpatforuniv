/**
 * Data /pages yang sudah diminta skrip inline index.html (#jfu-listing-prefetch)
 * SEBELUM React jalan — di 4G lambat kueri ini dulu baru mulai ±2,5 s, setelah JS
 * utama diunduh & dijalankan, lalu kartu masih menunggu RPC hadiah (Fase 3,
 * 20 Nov 2026).
 *
 * - `rows`: baris mentah PostgREST survey_pages (anon).
 * - `rewards`: baris RPC get_batch_rewards_bulk untuk id submission unik di
 *   `rows` (superset dari yang tampil), atau `null` bila tak ada id / > 200 id —
 *   pemanggil lalu memanggil RPC sendiri.
 *
 * Sekali pakai: slot selalu dihapus saat diambil, jadi tombol "Coba lagi" dan
 * pemuatan ulang berikutnya memakai kueri segar. Slot yang lebih tua dari 30 s
 * (atau jamnya mundur) dibuang — pemanggil lalu memakai kueri biasa.
 *
 * Filter jadwal/Kilat/urutan di SurveyListingPage tetap otoritatif.
 * Dijaga src/listingPrefetch.spec.ts.
 */
export const LISTING_PREFETCH_MAX_AGE_MS = 30_000;

export type ListingPrefetch = { rows: Promise<unknown>; rewards: Promise<unknown> | null };

type PrefetchHost = { __jfuListing?: { at?: unknown; rows?: unknown; rewards?: unknown } };

const browserHost = (): PrefetchHost | undefined =>
    typeof window === 'undefined' ? undefined : (window as unknown as PrefetchHost);

const isThenable = (v: unknown): v is Promise<unknown> =>
    !!v && typeof (v as { then?: unknown }).then === 'function';

export function takeListingPrefetch(
    host: PrefetchHost | undefined = browserHost(),
    nowMs: number = Date.now(),
): ListingPrefetch | null {
    if (!host) return null;
    const slot = host.__jfuListing;
    host.__jfuListing = undefined;
    if (!slot || typeof slot.at !== 'number' || !isThenable(slot.rows)) return null;
    const age = nowMs - slot.at;
    if (age < 0 || age > LISTING_PREFETCH_MAX_AGE_MS) return null;
    return { rows: slot.rows, rewards: isThenable(slot.rewards) ? slot.rewards : null };
}
