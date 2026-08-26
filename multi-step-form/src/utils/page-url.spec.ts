import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { publicPagePath, publicPageUrl } from './page-url';

describe('publicPagePath', () => {
  it('memakai bentuk /pages/{slug}', () => {
    expect(publicPagePath('survei-pengguna-mrt-jakarta')).toBe('/pages/survei-pengguna-mrt-jakarta');
  });

  /**
   * ⚠️ INI TES YANG SEBENARNYA.
   *
   * Dua tes di atas & di bawah hanya menjaga bentuknya stabil; yang menangkap
   * bug aslinya adalah yang ini — helper diadu dengan literal rute di App.tsx.
   * Cacat yang melahirkan berkas ini bukan "helper-nya salah ketik", melainkan
   * "admin menulis URL yang tidak punya rute", dan satu-satunya cara sebuah tes
   * bisa tahu itu adalah dengan membaca daftar rutenya sendiri.
   */
  it('cocok dengan rute yang benar-benar terdaftar di App.tsx', () => {
    const app = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

    // Bentuk rute react-router: '/pages/:slug' → path helper untuk slug apa pun.
    const routePattern = publicPagePath(':slug');
    expect(app).toContain(`path="${routePattern}"`);

    // Dan pastikan bentuk lama benar-benar tidak punya rute — kalau suatu hari
    // seseorang menambahkannya, tes ini gugur dan keputusannya jadi sadar.
    expect(app).not.toContain('path="/p/:slug"');
  });
});

describe('publicPageUrl', () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it('menempelkan origin di depan path yang sama', () => {
    (globalThis as { window?: unknown }).window = {
      location: { origin: 'https://submit.jakpatforuniv.com' },
    };
    expect(publicPageUrl('kuesioner-persepsi-ideologi')).toBe(
      'https://submit.jakpatforuniv.com/pages/kuesioner-persepsi-ideologi'
    );
  });
});
