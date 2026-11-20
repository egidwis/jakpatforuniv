import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LanguageProvider } from '../i18n/LanguageContext';
import { UniversalFooter } from './UniversalFooter';

function renderFooter(props: Parameters<typeof UniversalFooter>[0] = {}, lang: 'id' | 'en' = 'id') {
    vi.stubGlobal('localStorage', {
        getItem: () => lang,
        setItem: () => {},
        removeItem: () => {},
    });
    return renderToStaticMarkup(
        createElement(LanguageProvider, null, createElement(UniversalFooter, props)),
    );
}

describe('UniversalFooter', () => {
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

    it('menampilkan brand, hanya 2 tautan legal (/privacy-policy & /terms-conditions), dan hak cipta', () => {
        const html = renderFooter();
        expect(html).toContain('Jakpat for Universities');
        expect(html).toContain('href="/privacy-policy"');
        expect(html).toContain('href="/terms-conditions"');
        expect(html).toContain('Kebijakan Privasi');
        expect(html).toContain('Syarat &amp; Ketentuan');
        const links = html.match(/<a\b[^>]*>/g) ?? [];
        expect(links).toHaveLength(2);
    });

    it('mendukung bahasa Inggris (Privacy Policy & Terms & Conditions)', () => {
        const html = renderFooter({}, 'en');
        expect(html).toContain('Privacy Policy');
        expect(html).toContain('Terms &amp; Conditions');
    });

    it('tidak memakai class warisan "footer" yang bertabrakan dengan styles.css', () => {
        const html = renderFooter();
        expect(html).not.toMatch(/class="[^"]*\bfooter\b/);
    });

    it('membuka tab baru saat openInNewTab=true (dashboard peneliti)', () => {
        const html = renderFooter({ openInNewTab: true });
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('footer statis landing page dan SSR /webinar juga hanya memuat 2 tautan legal', () => {
        const root = path.resolve(__dirname, '../..');
        const homeHtml = readFileSync(path.join(root, 'public/homepage/index.html'), 'utf8');
        const homeFooter = homeHtml.match(/<footer class="footer"[\s\S]*?<\/footer>/)?.[0] ?? '';
        expect(homeFooter.match(/<a\b[^>]*>/g)).toHaveLength(2);
        expect(homeFooter).toContain('href="/privacy-policy"');
        expect(homeFooter).toContain('href="/terms-conditions"');

        const webinarSrc = readFileSync(path.join(root, 'functions/webinar/[[path]].js'), 'utf8');
        const webinarFooter = webinarSrc.match(/const footer = \(\) => `[\s\S]*?`;/)?.[0] ?? '';
        expect(webinarFooter.match(/<a\b[^>]*>/g)).toHaveLength(2);
        expect(webinarFooter).toContain('/privacy-policy');
        expect(webinarFooter).toContain('/terms-conditions');
    });
});
