import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * Layar putih tanpa jejak (laporan 19 Nov 2026, Safari iPhone) — jaring di
 * akar aplikasi. Galat di atas RouteErrorBoundary lama (LanguageProvider,
 * Router, AuthProvider) dulu membuat React melepas seluruh pohon: putih total.
 */
const reportClientEvent = vi.fn();
vi.mock('./utils/clientLog', () => ({ reportClientEvent }));

const { RouteErrorBoundary } = await import('./components/RouteErrorBoundary');
const { staticFailureHtml, markBootMounted } = await import('./bootSignals');

const main = readFileSync(path.resolve(__dirname, 'main.tsx'), 'utf8');

describe('main.tsx — jaring akar', () => {
    it('createRoot memakai onUncaughtError', () => {
        expect(main).toMatch(/createRoot\([^)]*\{[\s\S]*onUncaughtError/);
    });

    it('RouteErrorBoundary membungkus LanguageProvider (paling luar)', () => {
        const render = main.slice(main.indexOf('.render('));
        const boundary = render.indexOf('<RouteErrorBoundary');
        const lang = render.indexOf('<LanguageProvider>');
        expect(boundary).toBeGreaterThan(-1);
        expect(boundary).toBeLessThan(lang);
    });
});

describe('RouteErrorBoundary', () => {
    it('componentDidCatch mengirim laporan react-boundary', () => {
        const b = new RouteErrorBoundary({ children: null });
        const err = new Error('pecah');
        b.componentDidCatch(err, { componentStack: '\n    at X' } as never);
        expect(reportClientEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'react-boundary', error: err }));
    });
});

describe('bootSignals', () => {
    it('staticFailureHtml: tombol Muat Ulang, hanya gaya inline (CSS utama bisa saja tak termuat)', () => {
        const html = staticFailureHtml();
        expect(html).toContain('Muat Ulang');
        expect(html).toContain('location.reload()');
        expect(html).not.toMatch(/class="/);
    });

    it('markBootMounted menandai window.__jfuBoot.mounted', () => {
        const w = { __jfuBoot: { mounted: false } } as unknown as Window;
        markBootMounted(w);
        expect((w as unknown as { __jfuBoot: { mounted: boolean } }).__jfuBoot.mounted).toBe(true);
        expect(() => markBootMounted({} as Window)).not.toThrow();
    });
});
