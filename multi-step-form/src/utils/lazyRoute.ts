import { lazy, type ComponentType } from 'react';

/**
 * Rute lazy yang tahan deploy.
 *
 * Setiap push ke main = deploy, dan nama chunk berganti hash. Tab yang terbuka
 * sejak sebelum deploy lalu pindah ke rute lazy memanggil chunk yang sudah tak
 * ada → `import()` gagal. Dulu (satu bundel) masalah ini tak ada; code
 * splitting membawanya, jadi penangkalnya ikut di sini:
 *   gagal pertama  → tandai waktu di sessionStorage, muat ulang SEKALI
 *                    (index.html baru menunjuk chunk baru);
 *   gagal lagi <10s → lempar ke RouteErrorBoundary (jangan reload berputar).
 */
export const RELOAD_MARKER_KEY = 'jfu-chunk-reload-at';
const RELOAD_WINDOW_MS = 10_000;

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface ReloadDeps {
    storage: MarkerStorage;
    reload: () => void;
    now: () => number;
}

/**
 * Batas tunggu sesudah reload(). Normalnya halaman ter-unload jauh sebelum
 * ini dan timer ikut mati. Kalau tidak (reload diabaikan/diblokir browser),
 * jangan biarkan Suspense di fallback selamanya — lempar ke boundary.
 */
export const RELOAD_STUCK_MS = 4_000;

function defaultDeps(): ReloadDeps {
    return {
        storage: window.sessionStorage,
        reload: () => window.location.reload(),
        now: () => Date.now(),
    };
}

export async function importWithReload<M>(loader: () => Promise<M>, deps?: ReloadDeps): Promise<M> {
    try {
        return await loader();
    } catch (err) {
        let d: ReloadDeps;
        try {
            d = deps ?? defaultDeps();
            const last = Number(d.storage.getItem(RELOAD_MARKER_KEY) || 0);
            if (last && d.now() - last < RELOAD_WINDOW_MS) throw err;
            d.storage.setItem(RELOAD_MARKER_KEY, String(d.now()));
        } catch {
            // Storage tak tersedia (mode privat ketat) atau baru saja reload:
            // tanpa penanda kita tak bisa mencegah putaran reload — serahkan ke boundary.
            throw err;
        }
        d.reload();
        // Halaman sedang dimuat ulang; Suspense tetap di fallback. Kalau ternyata
        // tidak ter-unload dalam RELOAD_STUCK_MS, galat asli dilempar ke boundary.
        return new Promise<M>((_, reject) => {
            setTimeout(() => reject(err), RELOAD_STUCK_MS);
        });
    }
}

/** `lazy()` untuk ekspor bernama: `lazyNamed(() => import('./X'), 'X')`. */
export function lazyNamed<M, K extends keyof M>(loader: () => Promise<M>, name: K) {
    return lazy(() =>
        importWithReload(loader).then((m) => ({ default: m[name] as unknown as ComponentType<any> })),
    );
}
