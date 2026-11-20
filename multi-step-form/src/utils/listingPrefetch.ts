/**
 * Data /pages yang sudah diminta skrip inline index.html (#jfu-listing-prefetch)
 * SEBELUM React jalan — di 4G lambat kueri ini dulu baru mulai ±2,5 s, setelah JS
 * utama diunduh & dijalankan (Fase 3, 20 Nov 2026).
 *
 * Sekali pakai: slot selalu dihapus saat diambil, jadi tombol "Coba lagi" dan
 * pemuatan ulang berikutnya memakai kueri segar. Slot yang lebih tua dari 30 s
 * (atau jamnya mundur) dibuang — pemanggil lalu memakai kueri biasa.
 *
 * Isinya anon & baris mentah PostgREST; filter jadwal/Kilat/urutan di
 * SurveyListingPage tetap otoritatif. Dijaga src/listingPrefetch.spec.ts.
 */
export const LISTING_PREFETCH_MAX_AGE_MS = 30_000;

type PrefetchHost = { __jfuListing?: { at?: unknown; rows?: unknown } };

const browserHost = (): PrefetchHost | undefined =>
    typeof window === 'undefined' ? undefined : (window as unknown as PrefetchHost);

export function takeListingPrefetch(
    host: PrefetchHost | undefined = browserHost(),
    nowMs: number = Date.now(),
): Promise<unknown> | null {
    if (!host) return null;
    const slot = host.__jfuListing;
    host.__jfuListing = undefined;
    if (!slot || typeof slot.at !== 'number') return null;
    const rows = slot.rows as Promise<unknown> | undefined;
    if (!rows || typeof rows.then !== 'function') return null;
    const age = nowMs - slot.at;
    if (age < 0 || age > LISTING_PREFETCH_MAX_AGE_MS) return null;
    return rows;
}
