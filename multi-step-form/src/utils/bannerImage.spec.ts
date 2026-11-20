import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BANNER_SIZES, BANNER_WIDTHS, bannerSources, nextBannerStage } from './bannerImage';

/**
 * Fase 3 (20 Nov 2026): banner kartu /pages lewat Cloudflare Images
 * Transformations (format URL /cdn-cgi/image/…). Banner asli JPEG 1280 px,
 * 112–127 KB; di ponsel tampil ±358 px. `cf.image` di Pages Functions tidak
 * terbukti jalan, jadi yang dipakai format URL resmi + jatuh ke /cdn/ asli.
 */
const CDN = '/cdn/page-uploads/banners/1795075353103-Kuning-22.jpg';
const T = (w: number) => `/cdn-cgi/image/width=${w},fit=scale-down,format=auto,onerror=redirect${CDN}`;

describe('bannerSources', () => {
    it('path /cdn/ → src 800 px, srcSet 480/800/1200, sizes grid 1/2/3 kolom', () => {
        expect(bannerSources(CDN)).toEqual({
            src: T(800),
            srcSet: `${T(480)} 480w, ${T(800)} 800w, ${T(1200)} 1200w`,
            sizes: '(min-width: 1024px) 380px, (min-width: 768px) 50vw, 100vw',
        });
        expect(BANNER_WIDTHS).toEqual([480, 800, 1200]);
        expect(BANNER_SIZES).toBe('(min-width: 1024px) 380px, (min-width: 768px) 50vw, 100vw');
    });

    it.each([
        ['URL eksternal', 'https://example.com/banner.jpg'],
        ['berkas public/', '/default-ad-banner.jpg'],
        ['mirip tapi bukan /cdn/', '/cdnx/page-uploads/a.jpg'],
        ['sudah ditransformasi', '/cdn-cgi/image/width=800/cdn/page-uploads/a.jpg'],
        ['kosong', ''],
        ['null', null],
        ['undefined', undefined],
    ])('%s → null (img biasa, perilaku lama)', (_label, url) => {
        expect(bannerSources(url)).toBeNull();
    });
});

describe('nextBannerStage — gagal Transformations → /cdn/ asli → panel merek', () => {
    it.each([
        ['cf', 'plain'],
        ['plain', 'failed'],
        ['failed', 'failed'],
    ] as const)('%s → %s', (from, to) => {
        expect(nextBannerStage(from)).toBe(to);
    });
});

describe('kartu /pages memakai bannerSources dengan jalur jatuh', () => {
    const src = readFileSync(path.resolve(__dirname, '../pages/public/SurveyListingPage.tsx'), 'utf8');

    it('banner kartu lewat bannerSources, error ditangani bertahap (bukan langsung gagal)', () => {
        expect(src).toContain('bannerSources(');
        expect(src).toContain('nextBannerStage(');
        expect(src).not.toContain('onError={() => markBannerFailed(page.id)}');
    });
});
