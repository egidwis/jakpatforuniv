/**
 * Pembacaan sesi awal yang TIDAK BISA menggantung selamanya.
 *
 * supabase-js menunggu navigator.locks tanpa batas (`_acquireLock(-1)`). Kunci
 * yang dipegang dokumen beku (bfcache, tab latar yang dibekukan Android/iOS)
 * membuat getSession() tak pernah selesai — dulu layar putih, sejak d93aabd
 * loader selamanya. Setelah AUTH_BOOT_TIMEOUT_MS aplikasi lanjut tanpa sesi
 * (PrivateRoute → /login); kalau sesi akhirnya tiba, tetap diterapkan.
 */
export const AUTH_BOOT_TIMEOUT_MS = 8000;

export type AuthBootOutcome = 'ok' | 'timeout' | 'error' | 'late';

export function bootSession<S>(
    getSession: () => Promise<S | null>,
    apply: (session: S | null, outcome: AuthBootOutcome) => void,
    report: (outcome: 'timeout' | 'error', error?: unknown) => void,
    timeoutMs: number = AUTH_BOOT_TIMEOUT_MS,
): () => void {
    let settled = false;
    let cancelled = false;

    const timer = setTimeout(() => {
        if (settled || cancelled) return;
        settled = true;
        report('timeout', undefined);
        apply(null, 'timeout');
    }, timeoutMs);

    const onOk = (session: S | null) => {
        if (cancelled) return;
        if (settled) {
            apply(session, 'late');
            return;
        }
        settled = true;
        clearTimeout(timer);
        apply(session, 'ok');
    };
    const onError = (err: unknown) => {
        if (cancelled || settled) return;
        settled = true;
        clearTimeout(timer);
        report('error', err);
        apply(null, 'error');
    };

    try {
        getSession().then(onOk, onError);
    } catch (err) {
        onError(err);
    }

    return () => {
        cancelled = true;
        clearTimeout(timer);
    };
}
