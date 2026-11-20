import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { Combobox, rankSuggestions } from './combobox';

const SAMPLE_UNIVERSITIES = [
    'Universitas Negeri Jakarta (UNJ)',
    'Universitas Indonesia (UI)',
    'Universitas Gadjah Mada (UGM)',
    'Politeknik Negeri Samarinda (Polnes)',
    'Politeknik Negeri Malang (Polinema)',
    'Institut Teknologi Bandung (ITB)',
    'Bina Nusantara University (BINUS)',
    'Universitas Diponegoro (UNDIP)',
];

describe('rankSuggestions', () => {
    it('memprioritaskan kecocokan di awal kata/singkatan dan membatasi jumlah saran', () => {
        const res = rankSuggestions(SAMPLE_UNIVERSITIES, 'pol', 2);
        expect(res).toEqual([
            'Politeknik Negeri Samarinda (Polnes)',
            'Politeknik Negeri Malang (Polinema)',
        ]);
    });

    it('menemukan kampus berdasarkan singkatan dalam tanda kurung', () => {
        const res = rankSuggestions(SAMPLE_UNIVERSITIES, 'ugm', 6);
        expect(res).toEqual(['Universitas Gadjah Mada (UGM)']);
    });

    it('mengembalikan daftar kosong bila tidak ada yang cocok agar input custom ditawarkan', () => {
        expect(rankSuggestions(SAMPLE_UNIVERSITIES, 'Universitas Nusantara Baru', 6)).toEqual([]);
    });
});

describe('Combobox mode predictive vs dropdown', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: () => 'id',
            setItem: () => {},
            removeItem: () => {},
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('mode predictive tidak merender tombol panah dropdown', () => {
        const html = renderToStaticMarkup(
            createElement(
                LanguageProvider,
                null,
                createElement(Combobox, {
                    mode: 'predictive',
                    value: 'Politeknik Negeri Samarinda (Polnes)',
                    onChange: () => {},
                    options: SAMPLE_UNIVERSITIES,
                }),
            ),
        );
        expect(html).not.toContain('Buka pilihan');
        expect(html).toContain('role="combobox"');
        expect(html).toContain('aria-autocomplete="list"');
    });

    it('mode dropdown tetap merender tombol panah dropdown', () => {
        const html = renderToStaticMarkup(
            createElement(
                LanguageProvider,
                null,
                createElement(Combobox, {
                    mode: 'dropdown',
                    value: 'Perpajakan',
                    onChange: () => {},
                    options: ['Perpajakan', 'Manajemen'],
                }),
            ),
        );
        expect(html).toContain('Buka pilihan');
    });
});
