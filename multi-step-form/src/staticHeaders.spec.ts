import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * /assets/* = keluaran Vite ber-hash (nama berubah setiap isinya berubah),
 * jadi aman di-cache selamanya. Dulu bawaan Pages: max-age=14400 +
 * must-revalidate → responden harian dari app Jakpat merevalidasi tiap 4 jam.
 * ⚠️ Syaratnya: public/assets TIDAK BOLEH ada (berkas tanpa hash di sana akan
 * ikut immutable dan tak pernah diperbarui), dan pola nama Vite tetap ber-hash.
 */
const root = path.resolve(__dirname, '..');
const headers = readFileSync(path.join(root, 'public/_headers'), 'utf8');

describe('public/_headers', () => {
    it('/assets/* immutable setahun', () => {
        const block = headers.slice(headers.indexOf('/assets/*'));
        expect(headers).toMatch(/^\/assets\/\*$/m);
        expect(block).toMatch(/Cache-Control: public, max-age=31536000, immutable/);
    });

    it('public/assets tidak ada (hanya berkas ber-hash di /assets)', () => {
        expect(existsSync(path.join(root, 'public/assets'))).toBe(false);
    });

    it('pola nama keluaran Vite memuat [hash]', () => {
        const cfg = readFileSync(path.join(root, 'vite.config.js'), 'utf8');
        for (const key of ['assetFileNames', 'chunkFileNames', 'entryFileNames']) {
            const m = cfg.match(new RegExp(`${key}:\\s*'([^']+)'`));
            expect(m?.[1]).toMatch(/^assets\/.*\[hash\]/);
        }
    });

    it('HTML SPA tidak ikut di-cache permanen', () => {
        expect(headers).not.toMatch(/^\/\*$/m);
        expect(headers).not.toMatch(/index\.html/);
    });
});
