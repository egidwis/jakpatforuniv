import { describe, it, expect } from 'vitest';
import { authStorageKeyFor, hasStoredSession, isOAuthReturn, dashboardPreloadsFor } from './storedSession';

describe('authStorageKeyFor — sama dengan bawaan supabase-js', () => {
    it('sb-<subdomain pertama>-auth-token', () => {
        expect(authStorageKeyFor('https://abcd1234.supabase.co')).toBe('sb-abcd1234-auth-token');
    });
    it('URL tak valid → null', () => {
        expect(authStorageKeyFor('')).toBeNull();
        expect(authStorageKeyFor('bukan url')).toBeNull();
    });
});

describe('hasStoredSession', () => {
    const key = 'sb-x-auth-token';
    const store = (v: string | null) => ({ getItem: (k: string) => (k === key ? v : null) });

    it('ada token dengan refresh_token → true', () => {
        expect(hasStoredSession(store(JSON.stringify({ access_token: 'a', refresh_token: 'r' })), key)).toBe(true);
    });
    it('kosong / rusak / tanpa refresh_token → false', () => {
        expect(hasStoredSession(store(null), key)).toBe(false);
        expect(hasStoredSession(store('{rusak'), key)).toBe(false);
        expect(hasStoredSession(store(JSON.stringify({ access_token: 'a' })), key)).toBe(false);
        expect(hasStoredSession(store('null'), key)).toBe(false);
    });
    it('storage melempar (mode privat ketat) → false, tidak melempar', () => {
        const throwing = { getItem: () => { throw new Error('SecurityError'); } };
        expect(hasStoredSession(throwing, key)).toBe(false);
    });
    it('kunci null → false', () => {
        expect(hasStoredSession(store('{}'), null)).toBe(false);
    });
});

describe('isOAuthReturn', () => {
    it.each([
        ['?code=abc', '', true],
        ['?foo=1&code=abc', '', true],
        ['', '#access_token=xyz&refresh_token=r', true],
        ['', '#error=access_denied', false],
        ['?custom_form_id=1', '', false],
        ['', '', false],
    ])('search=%s hash=%s → %s', (search, hash, expected) => {
        expect(isOAuthReturn(search, hash)).toBe(expected);
    });
});

describe('dashboardPreloadsFor', () => {
    /*
     * ⚠️ Tanpa sesi: NOL preload. Pengunjung "Beli tiket" yang belum login
     * dialihkan ke /login; dulu 19 chunk dashboard tetap diunduh (+0,6 s di 4G
     * lambat) dan dibatalkan saat ia menekan Back — dicurigai ikut memacetkan
     * koneksi Safari (layar putih pada percobaan kedua, 19 Nov 2026).
     */
    it.each([
        ['/dashboard', '', '', false, []],
        ['/dashboard/webinar/beli/kelas-a', '', '', false, []],
        ['/login', '', '', true, []],
        ['/pages', '', '', true, []],
        ['/dashboardx', '', '', true, []],
        ['/dashboard', '', '', true, ['layout', 'status']],
        ['/dashboard/', '', '', true, ['layout', 'status']],
        ['/dashboard/forms', '', '', true, ['layout']],
        ['/dashboard/webinar/beli/kelas-a', '', '', true, ['layout', 'webinarGate', 'webinarCheckout']],
        ['/dashboard/webinar/beli/kelas-a/', '', '', true, ['layout', 'webinarGate', 'webinarCheckout']],
        ['/dashboard/webinar', '', '', true, ['layout', 'webinarGate']],
        // Kembali dari Google: sesi belum tersimpan, tapi sebentar lagi ada.
        ['/dashboard', '', '#access_token=a&refresh_token=b', false, ['layout', 'status']],
        ['/dashboard/webinar/beli/x', '?code=c', '', false, ['layout', 'webinarGate', 'webinarCheckout']],
    ] as const)('%s %s %s sesi=%s → %j', (pathname, search, hash, session, expected) => {
        expect(dashboardPreloadsFor(pathname, search, hash, session)).toEqual(expected);
    });
});
