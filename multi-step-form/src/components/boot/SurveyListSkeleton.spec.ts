import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SurveyListPageSkeleton, SurveyDetailSkeleton, SurveyListCardsSkeleton } from './SurveyListSkeleton';
import { BOOT_COPY } from './bootRoute';

describe('SurveyListPageSkeleton', () => {
    it.each(['id', 'en'] as const)('menampilkan merek + judul asli daftar survei (%s)', (lang) => {
        const html = renderToStaticMarkup(createElement(SurveyListPageSkeleton, { lang }));
        expect(html).toContain('Jakpat for Universities');
        expect(html).toContain(`>${BOOT_COPY[lang].heading}<`);
        expect(html).toContain(`>${BOOT_COPY[lang].subtitle}<`);
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain(`aria-label="${BOOT_COPY[lang].loadingList}"`);
    });

    it('murni tampilan: tak ada tautan/tombol yang bisa diklik saat memuat', () => {
        const html = renderToStaticMarkup(createElement(SurveyListPageSkeleton, { lang: 'id' }));
        expect(html).not.toMatch(/<a[\s>]/);
        expect(html).not.toMatch(/<button[\s>]/);
    });
});

describe('SurveyListCardsSkeleton', () => {
    it('enam kartu, satu status', () => {
        const html = renderToStaticMarkup(createElement(SurveyListCardsSkeleton, { label: 'x' }));
        expect(html.split('data-skeleton-card').length - 1).toBe(6);
        expect(html.split('role="status"').length - 1).toBe(1);
    });
});

describe('SurveyDetailSkeleton', () => {
    it.each(['id', 'en'] as const)('teks "memuat survei" terlihat, bukan hanya spinner (%s)', (lang) => {
        const html = renderToStaticMarkup(createElement(SurveyDetailSkeleton, { lang }));
        expect(html).toContain(`>${BOOT_COPY[lang].loadingSurvey}<`);
        expect(html).toContain('role="status"');
        expect(html).not.toMatch(/<button[\s>]/);
    });
});
