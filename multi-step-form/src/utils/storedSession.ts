/**
 * Cek sesi TANPA memuat supabase-js — dipakai sebelum React jalan (App.tsx saat
 * modul dievaluasi) untuk memutuskan apakah chunk dashboard layak diunduh.
 *
 * ⚠️ KEMBAR: skrip boot inline di index.html membaca kunci yang sama (dijaga
 * src/bootSkeletonContract.spec.ts). Kunci = bawaan supabase-js
 * (`sb-<subdomain pertama URL>-auth-token`); kalau createClient kelak diberi
 * `auth.storageKey` kustom, ubah keduanya.
 */
export function authStorageKeyFor(supabaseUrl: string): string | null {
    try {
        const ref = new URL(supabaseUrl).hostname.split('.')[0];
        return ref ? `sb-${ref}-auth-token` : null;
    } catch {
        return null;
    }
}

type ReadableStorage = Pick<Storage, 'getItem'>;

/** Ada sesi tersimpan yang masih bisa di-refresh. Tidak pernah melempar. */
export function hasStoredSession(storage: ReadableStorage | null | undefined, key: string | null): boolean {
    if (!storage || !key) return false;
    try {
        const raw = storage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!parsed && typeof parsed === 'object' && typeof parsed.refresh_token === 'string' && parsed.refresh_token !== '';
    } catch {
        return false;
    }
}

/** Baru kembali dari OAuth (PKCE `?code=` atau implicit `#access_token=`). */
export function isOAuthReturn(search: string, hash: string): boolean {
    try {
        if (new URLSearchParams(search).has('code')) return true;
    } catch {
        /* abaikan */
    }
    return /(^#|&)access_token=/.test(hash);
}

export type DashboardPreload = 'layout' | 'status' | 'webinarGate' | 'webinarCheckout';

/**
 * Chunk dashboard yang diunduh SEJAJAR dengan pembacaan sesi saat aplikasi
 * dibuka langsung di /dashboard. Tanpa sesi (dan bukan kembali dari OAuth) =
 * kosong: PrivateRoute akan mengalihkan ke /login, dan unduhan itu sia-sia.
 */
export function dashboardPreloadsFor(pathname: string, search: string, hash: string, hasSession: boolean): DashboardPreload[] {
    const p = pathname.toLowerCase();
    if (!/^\/dashboard(\/|$)/.test(p)) return [];
    if (!hasSession && !isOAuthReturn(search, hash)) return [];
    if (/^\/dashboard\/?$/.test(p)) return ['layout', 'status'];
    if (/^\/dashboard\/webinar\/beli\/[^/]+\/?$/.test(p)) return ['layout', 'webinarGate', 'webinarCheckout'];
    if (/^\/dashboard\/webinar(\/|$)/.test(p)) return ['layout', 'webinarGate'];
    return ['layout'];
}
