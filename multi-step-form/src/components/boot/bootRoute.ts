import { subdomainUserFrom } from '@/utils/subdomain';

/**
 * Skeleton apa yang tampil saat aplikasi belum siap (JS diunduh, sesi dibaca,
 * chunk lazy dimuat). Responden yang membuka /pages di ponsel harus langsung
 * melihat bentuk "daftar survei Jakpat", bukan layar putih atau loader peneliti.
 *
 * ⚠️ KEMBAR: skrip inline di <head> index.html memutuskan hal yang sama sebelum
 * JS ada. Ubah aturan di sini → ubah di sana. BOOT_KIND_CASES dijalankan
 * terhadap keduanya (bootRoute.spec.ts & src/bootSkeletonContract.spec.ts).
 */
export type BootKind = 'pages' | 'survey' | 'app';
export type BootLang = 'id' | 'en';

export function bootKindFor(pathname: string, hostname: string, search: string): BootKind {
    // Subdomain pengguna (budi.jakpatforuniv.com) dilayani PublicFormPage, bukan /pages.
    if (subdomainUserFrom(hostname, search)) return 'app';
    const p = pathname.toLowerCase();
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

const APEX = 'jakpatforuniv.com';
/** Kasus bersama untuk penentu React & penentu inline index.html. */
export const BOOT_KIND_CASES: Array<{ path: string; host: string; search: string; kind: BootKind }> = [
    { path: '/pages', host: APEX, search: '', kind: 'pages' },
    { path: '/pages/', host: APEX, search: '', kind: 'pages' },
    { path: '/PAGES', host: APEX, search: '', kind: 'pages' },
    { path: '/pages', host: 'submit.jakpatforuniv.com', search: '', kind: 'pages' },
    { path: '/pages', host: 'localhost', search: '', kind: 'pages' },
    { path: '/pages/survei-abc', host: APEX, search: '', kind: 'survey' },
    { path: '/pages/survei-abc/', host: APEX, search: '', kind: 'survey' },
    { path: '/pages/a/b', host: APEX, search: '', kind: 'app' },
    { path: '/pagesx', host: APEX, search: '', kind: 'app' },
    { path: '/login', host: APEX, search: '', kind: 'app' },
    { path: '/', host: APEX, search: '', kind: 'app' },
    { path: '/pages', host: 'budi.jakpatforuniv.com', search: '', kind: 'app' },
    { path: '/pages', host: 'budi.localhost', search: '', kind: 'app' },
    { path: '/pages', host: APEX, search: '?user=budi', kind: 'app' },
    { path: '/pages/abc', host: APEX, search: '?username=budi', kind: 'app' },
];
