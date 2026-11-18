import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Sesi belum terbaca: getSession tak pernah selesai saat render pertama.
vi.mock('../utils/supabase', () => ({
    supabase: {
        auth: {
            getSession: () => new Promise(() => {}),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => {},
        },
    },
}));
vi.mock('@/i18n/LanguageContext', () => ({ useLanguage: () => ({ language: 'id' }) }));
vi.mock('../i18n/LanguageContext', () => ({ useLanguage: () => ({ language: 'id' }) }));

import { AuthProvider } from './AuthContext';

const setLocation = (pathname: string, hostname = 'jakpatforuniv.com') => {
    (globalThis as any).window = { location: { pathname, hostname, search: '' } };
};

const render = () =>
    renderToStaticMarkup(createElement(AuthProvider, null, createElement('p', null, 'ANAK')));

describe('AuthProvider saat sesi dibaca (dulu: layar putih)', () => {
    beforeEach(() => setLocation('/login'));
    afterEach(() => { delete (globalThis as any).window; });

    it('menampilkan loader, bukan kosong, dan belum merender anak', () => {
        const html = render();
        expect(html).toContain('jfu-initial-loader');
        expect(html).not.toContain('ANAK');
    });

    it('/pages → skeleton daftar survei, bukan loader generik', () => {
        setLocation('/pages');
        const html = render();
        expect(html).toContain('data-boot-skeleton="pages"');
        expect(html).toContain('Daftar Survei Terbaru');
        expect(html).not.toContain('jfu-initial-loader');
    });

    it('/pages/:slug → skeleton survei', () => {
        setLocation('/pages/survei-abc');
        expect(render()).toContain('data-boot-skeleton="survey"');
    });
});
