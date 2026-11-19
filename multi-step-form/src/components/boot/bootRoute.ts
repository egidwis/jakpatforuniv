import { subdomainUserFrom } from '@/utils/subdomain';
import { isOAuthReturn } from '@/utils/storedSession';

/**
 * Skeleton apa yang tampil saat aplikasi belum siap (JS diunduh, sesi dibaca,
 * chunk lazy dimuat). Responden yang membuka /pages di ponsel harus langsung
 * melihat bentuk "daftar survei Jakpat", bukan layar putih atau loader peneliti.
 *
 * ⚠️ KEMBAR: skrip inline di <head> index.html memutuskan hal yang sama sebelum
 * JS ada. Ubah aturan di sini → ubah di sana. BOOT_KIND_CASES dijalankan
 * terhadap keduanya (bootRoute.spec.ts & src/bootSkeletonContract.spec.ts).
 */
export type BootKind = 'pages' | 'survey' | 'login' | 'app';
export type BootLang = 'id' | 'en';

export function bootKindFor(pathname: string, hostname: string, search: string, hash = '', signedIn = false): BootKind {
    const p = pathname.toLowerCase();
    // Belum login di /login atau /dashboard/* (PrivateRoute akan mengalihkan ke
    // /login): langsung bentuk kartu login, bukan "Menyiapkan workspace kamu…".
    // Jalur utama: tombol "Beli tiket" di /webinar → /dashboard/webinar/beli/….
    // Kembali dari Google (#access_token / ?code=) = sebentar lagi login → 'app'.
    if (!signedIn && !isOAuthReturn(search, hash) && /^\/(login|dashboard)(\/|$)/.test(p)) return 'login';
    // Subdomain pengguna (budi.jakpatforuniv.com) dilayani PublicFormPage, bukan /pages.
    if (subdomainUserFrom(hostname, search)) return 'app';
    if (/^\/pages\/?$/.test(p)) return 'pages';
    if (/^\/pages\/[^/]+\/?$/.test(p)) return 'survey';
    return 'app';
}

const RESEARCHER_AREA = /^\/(dashboard|login|register)(\/|$)/;

/** Subjudul loader generik: "workspace" hanya bermakna bagi peneliti. */
export function bootLoaderSubtitle(pathname: string): string {
    return RESEARCHER_AREA.test(pathname.toLowerCase()) ? 'Menyiapkan workspace kamu...' : 'Memuat halaman...';
}

/**
 * Teks skeleton. heading/subtitle adalah SUMBER TUNGGAL judul halaman /pages —
 * SurveyListingPage.tsx memakainya, dan index.html menyalinnya (dijaga spec).
 */
export const BOOT_COPY = {
    id: {
        heading: 'Daftar Survei Terbaru',
        subtitle: 'Bantu riset mahasiswa dan menangkan undian saldo e-wallet resmi Jakpat.',
        loadingList: 'Memuat daftar survei terbaru',
        loadingSurvey: 'Memuat survei…',
    },
    en: {
        heading: 'Latest Surveys',
        subtitle: 'Support university research and win official Jakpat e-wallet lucky draws.',
        loadingList: 'Loading latest surveys',
        loadingSurvey: 'Loading survey…',
    },
} as const satisfies Record<BootLang, Record<string, string>>;

export const BOOT_BRAND = 'Jakpat for Universities';

/**
 * Teks skeleton login = SALINAN kunci translations.ts (auth*). index.html tak bisa
 * mengimpor translations.ts (140 KB), jadi disalin; bootSkeletonContract.spec.ts
 * memastikan ketiganya (translations, konstanta ini, index.html) sama.
 */
/** Subjudul LoginPage saat asalnya tombol Beli tiket (hanya bahasa Indonesia, seperti aslinya). */
export const BOOT_LOGIN_WEBINAR_SUBTITLE = 'Masuk atau daftar untuk melanjutkan pembelian tiket webinar';

export function isWebinarPurchasePath(pathname: string): boolean {
    return /^\/dashboard\/webinar\/beli\//.test(pathname.toLowerCase());
}

export const BOOT_LOGIN_COPY = {
    id: {
        heading: 'Selamat Datang Kembali',
        subtitle: 'Masuk ke dashboard Jakpat for Universities',
        tabLogin: 'Masuk',
        tabSignup: 'Daftar Akun',
        google: 'Masuk dengan Google',
        orEmail: 'atau dengan email',
        email: 'Email',
        password: 'Password',
        submit: 'Masuk ke Akun',
    },
    en: {
        heading: 'Welcome Back',
        subtitle: 'Log in to your Jakpat for Universities dashboard',
        tabLogin: 'Log In',
        tabSignup: 'Sign Up',
        google: 'Log in with Google',
        orEmail: 'or with email',
        email: 'Email',
        password: 'Password',
        submit: 'Log In to Account',
    },
} as const satisfies Record<BootLang, Record<string, string>>;

const APEX = 'jakpatforuniv.com';
/** Kasus bersama untuk penentu React & penentu inline index.html. */
export const BOOT_KIND_CASES: Array<{ path: string; host: string; search: string; hash?: string; signedIn?: boolean; kind: BootKind }> = [
    { path: '/pages', host: APEX, search: '', kind: 'pages' },
    { path: '/pages/', host: APEX, search: '', kind: 'pages' },
    { path: '/PAGES', host: APEX, search: '', kind: 'pages' },
    { path: '/pages', host: 'submit.jakpatforuniv.com', search: '', kind: 'pages' },
    { path: '/pages', host: 'localhost', search: '', kind: 'pages' },
    { path: '/pages/survei-abc', host: APEX, search: '', kind: 'survey' },
    { path: '/pages/survei-abc/', host: APEX, search: '', kind: 'survey' },
    { path: '/pages/a/b', host: APEX, search: '', kind: 'app' },
    { path: '/pagesx', host: APEX, search: '', kind: 'app' },
    // Login: pengunjung "Beli tiket" yang belum login (dashboard → /login).
    { path: '/login', host: APEX, search: '', kind: 'login' },
    { path: '/login/', host: APEX, search: '', kind: 'login' },
    { path: '/LOGIN', host: APEX, search: '', kind: 'login' },
    { path: '/login', host: APEX, search: '', signedIn: true, kind: 'app' },
    { path: '/dashboard', host: APEX, search: '', kind: 'login' },
    { path: '/dashboard/webinar/beli/kelas-a', host: APEX, search: '', kind: 'login' },
    { path: '/dashboard/webinar/beli/kelas-a', host: APEX, search: '', signedIn: true, kind: 'app' },
    { path: '/dashboard', host: APEX, search: '', hash: '#access_token=a&refresh_token=b', kind: 'app' },
    { path: '/dashboard', host: APEX, search: '?code=c', kind: 'app' },
    { path: '/dashboardx', host: APEX, search: '', kind: 'app' },
    { path: '/register', host: APEX, search: '', kind: 'app' },
    { path: '/login', host: 'budi.jakpatforuniv.com', search: '', kind: 'login' },
    { path: '/', host: APEX, search: '', kind: 'app' },
    { path: '/pages', host: 'budi.jakpatforuniv.com', search: '', kind: 'app' },
    { path: '/pages', host: 'budi.localhost', search: '', kind: 'app' },
    { path: '/pages', host: APEX, search: '?user=budi', kind: 'app' },
    { path: '/pages/abc', host: APEX, search: '?username=budi', kind: 'app' },
];
