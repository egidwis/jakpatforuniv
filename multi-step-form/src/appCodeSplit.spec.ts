import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * ⚠️ PENJAGA REGRESI UKURAN BUNDEL. Sampai Nov 2026 seluruh aplikasi (6,2 MB,
 * 1,8 MB brotli) ada di SATU berkas JS, termasuk heic2any 1,3 MB yang hanya
 * dipakai saat responden mengunggah foto HEIC. Akibatnya /login dan /pages
 * blank lama di ponsel. Tidak ada yang sadar karena tidak ada yang gagal.
 *
 * Aturan:
 *   1. App.tsx hanya boleh mengimpor STATIS modul di EAGER_ALLOWED — rute yang
 *      dibuka langsung oleh orang luar (responden, login). Halaman lain wajib
 *      lewat lazyNamed()/lazy().
 *   2. heic2any di seluruh src/ hanya boleh muncul sebagai `import('heic2any')`.
 *
 * Menambah halaman eager = keputusan sadar: tambahkan ke daftar DAN jelaskan.
 */
const EAGER_ALLOWED = new Set([
    'react',
    'sonner',
    'react-router-dom',
    './components/LanguageSwitcher',
    './i18n/LanguageContext',
    './pages/LoginPage',
    './pages/ResetPasswordPage',
    './pages/ForgotPasswordPage',
    './components/PrivateRoute',
    './pages/public/PublicFormPage',
    './utils/subdomain',
    './pages/public/SurveyListingPage',
    './pages/public/SurveyPage',
    './context/AuthContext',
    './components/CampaignTracker',
    './components/BootLoader',
    './components/RouteErrorBoundary',
    './pages/NotFoundPage',
    './utils/lazyRoute',
    './utils/storedSession',
    './bootSignals',
    './components/InternalDashboard.css',
    './styles.css',
]);

const src = path.resolve(__dirname);
const app = readFileSync(path.join(src, 'App.tsx'), 'utf8');

describe('App.tsx — code splitting', () => {
    it('impor statis hanya dari daftar eager', () => {
        const statics = [...app.matchAll(/^import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
        expect(statics.length).toBeGreaterThan(5);
        const offenders = statics.filter((s) => !EAGER_ALLOWED.has(s));
        expect(offenders).toEqual([]);
    });

    it('halaman dashboard benar-benar dimuat lazy', () => {
        for (const mod of ['./components/DashboardLayout', './pages/dashboard/StatusPage', './components/MultiStepForm', './components/InternalDashboardWithLayout']) {
            expect(app).toContain(`import('${mod}')`);
        }
    });

    /*
     * ⚠️ Direktif @tailwind HANYA ada di components/InternalDashboard.css. Dulu
     * berkas itu ikut eager lewat InternalDashboardWithLayout; begitu dashboard
     * admin jadi lazy, SELURUH utilitas Tailwind pindah ke chunk CSS-nya dan
     * /login, /pages, /f tampil tanpa gaya (tertangkap di uji tangkapan layar).
     * Urutan juga mengikat: Tailwind dulu, styles.css sesudahnya (styles.css
     * warisan sengaja menang — lihat memori styles-css-tailwind-cascade).
     */
    it('CSS Tailwind diimpor eager, SEBELUM styles.css', () => {
        const tw = app.indexOf("import './components/InternalDashboard.css';");
        const legacy = app.indexOf("import './styles.css';");
        expect(tw).toBeGreaterThan(-1);
        expect(tw).toBeLessThan(legacy);
        const twSrc = readFileSync(path.join(src, 'components/InternalDashboard.css'), 'utf8');
        expect(twSrc).toContain('@tailwind utilities;');
    });

    it('ada Suspense + RouteErrorBoundary di tingkat aplikasi', () => {
        expect(app).toMatch(/<RouteErrorBoundary>/);
        expect(app).toMatch(/<Suspense fallback=\{<BootLoader \/>\}>/);
    });
});

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.spec\.ts$/.test(name)) out.push(full);
    }
    return out;
}

describe('heic2any', () => {
    it('tidak pernah diimpor statis di src/', () => {
        const offenders = walk(src).filter((f) => /^\s*import\s+[^;]*['"]heic2any['"]/m.test(readFileSync(f, 'utf8')));
        expect(offenders).toEqual([]);
    });
});

/*
 * browser-image-compression (52 KB minified) hanya dipakai saat unggah gambar,
 * tapi dulu diimpor statis oleh SurveyPage & customForms → ikut di bundel
 * utama SETIAP rute (/login, /pages). Sama seperti heic2any: hanya import().
 */
describe('browser-image-compression', () => {
    it('tidak pernah diimpor statis di src/', () => {
        const offenders = walk(src).filter((f) => /^\s*import\s+[^;(]*['"]browser-image-compression['"]/m.test(readFileSync(f, 'utf8')));
        expect(offenders.map((f) => path.relative(src, f))).toEqual([]);
    });
});
