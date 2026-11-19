import { describe, it, expect } from 'vitest';
import { bootKindFor, bootLoaderSubtitle, BOOT_KIND_CASES } from './bootRoute';

/**
 * Penentu skeleton saat boot. Tabel kasusnya (BOOT_KIND_CASES) dipakai DUA kali:
 * di sini terhadap versi React, dan di src/bootSkeletonContract.spec.ts terhadap
 * skrip inline di index.html — supaya dua penentu kembar itu tidak bisa berbeda.
 */
describe('bootKindFor', () => {
    it.each(BOOT_KIND_CASES)('$host $path $search $hash sesi=$signedIn → $kind', ({ path, host, search, hash, signedIn, kind }) => {
        expect(bootKindFor(path, host, search, hash ?? '', signedIn ?? false)).toBe(kind);
    });
});

describe('bootLoaderSubtitle', () => {
    it('area peneliti tetap "workspace"', () => {
        expect(bootLoaderSubtitle('/dashboard/forms')).toBe('Menyiapkan workspace kamu...');
        expect(bootLoaderSubtitle('/login')).toBe('Menyiapkan workspace kamu...');
        expect(bootLoaderSubtitle('/register')).toBe('Menyiapkan workspace kamu...');
    });
    it('halaman responden/umum tidak memakai bahasa peneliti', () => {
        expect(bootLoaderSubtitle('/f/abc')).toBe('Memuat halaman...');
        expect(bootLoaderSubtitle('/payment-success')).toBe('Memuat halaman...');
    });
});
