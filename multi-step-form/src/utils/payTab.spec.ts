import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { payInSameTab, payInSameTabNow } from './payTab';

/*
 * Bayar di tab yang sama untuk ponsel/tablet (keputusan 20 Nov 2026). Di iPhone,
 * tab `about:blank` yang dibuka lebih dulu langsung aktif: bila apa pun tertunda,
 * pembeli menatap tab PUTIH, dan refresh tetap putih. Desktop tetap tab baru.
 * Berlaku untuk webinar DAN iklan (Jadwal & Bayar).
 */
describe('payInSameTab', () => {
    it.each([
        { label: 'iPhone', env: { hoverNone: true, coarsePointer: true, maxTouchPoints: 5 }, expected: true },
        { label: 'Android', env: { hoverNone: true, coarsePointer: true, maxTouchPoints: 5 }, expected: true },
        { label: 'iPad (UA "Macintosh", tanpa trackpad)', env: { hoverNone: true, coarsePointer: true, maxTouchPoints: 5 }, expected: true },
        { label: 'iPad dengan trackpad', env: { hoverNone: false, coarsePointer: false, maxTouchPoints: 5 }, expected: true },
        { label: 'Mac / PC tanpa layar sentuh', env: { hoverNone: false, coarsePointer: false, maxTouchPoints: 0 }, expected: false },
        { label: 'Windows layar sentuh (diterima: tab sama tetap jalan)', env: { hoverNone: false, coarsePointer: false, maxTouchPoints: 10 }, expected: true },
        { label: 'pena tunggal di desktop', env: { hoverNone: false, coarsePointer: false, maxTouchPoints: 1 }, expected: false },
    ])('$label → tab sama: $expected', ({ env, expected }) => {
        expect(payInSameTab(env)).toBe(expected);
    });

    const fakeWindow = (hoverNone: boolean, coarse: boolean, maxTouchPoints: number) => ({
        matchMedia: (q: string) => ({ matches: q === '(hover: none)' ? hoverNone : q === '(pointer: coarse)' ? coarse : false }),
        navigator: { maxTouchPoints },
    }) as unknown as Window;

    it('payInSameTabNow membaca matchMedia & maxTouchPoints', () => {
        expect(payInSameTabNow(fakeWindow(true, true, 5))).toBe(true);
        expect(payInSameTabNow(fakeWindow(false, false, 0))).toBe(false);
    });

    it('payInSameTabNow tidak pernah melempar; tanpa matchMedia tetap pakai maxTouchPoints', () => {
        const throwing = { matchMedia: () => { throw new Error('x'); }, navigator: { maxTouchPoints: 5 } } as unknown as Window;
        expect(payInSameTabNow(throwing)).toBe(false);
        expect(payInSameTabNow({ navigator: { maxTouchPoints: 5 } } as unknown as Window)).toBe(true);
        expect(payInSameTabNow({} as Window)).toBe(false);
    });
});

describe('tab about:blank hanya dibuka bila BUKAN ponsel/tablet', () => {
    const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
    const GUARDED = /payInSameTabNow\(\)\s*\?\s*null\s*:\s*window\.open\('about:blank', '_blank'\)/g;

    it.each([
        '../pages/dashboard/webinar/WebinarCheckoutPage.tsx',
        '../pages/dashboard/JadwalDanBayarPage.tsx',
    ])('%s: setiap about:blank dijaga payInSameTabNow()', (rel) => {
        const code = read(rel);
        const blanks = code.match(/window\.open\('about:blank'/g) ?? [];
        expect(blanks).toHaveLength(1);
        expect(code.match(GUARDED) ?? []).toHaveLength(blanks.length);
    });

    it('WebinarCheckoutPage: satu-satunya window.open adalah tab bayar desktop', () => {
        expect(read('../pages/dashboard/webinar/WebinarCheckoutPage.tsx').match(/window\.open\(/g)).toHaveLength(1);
    });
});
