import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmbientBackdrop, type AmbientVariant } from './AmbientBackdrop';

/*
 * Aura latar = SATU elemen tetap ber-radial-gradient (CSS di AmbientBackdrop.css).
 * Dulu 3–5 elemen anak ber-filter blur besar + transform-gpu per halaman.
 */
describe('AmbientBackdrop', () => {
    it.each(['login', 'dashboard', 'pages', 'invoice'] as AmbientVariant[])('varian %s: satu elemen dekoratif tanpa anak & tanpa style inline', (variant) => {
        const html = renderToStaticMarkup(createElement(AmbientBackdrop, { variant }));
        expect(html.match(/<div/g)).toHaveLength(1);
        expect(html).toMatch(/^<div [^>]*><\/div>$/);
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain(`jfu-aura--${variant}`);
        expect(html).toMatch(/class="[^"]*\bjfu-aura\b(?!-)/);
        expect(html).toMatch(/class="[^"]*\bfixed\b[^"]*\binset-0\b[^"]*\bpointer-events-none\b/);
        expect(html).not.toContain('style=');
    });
});
