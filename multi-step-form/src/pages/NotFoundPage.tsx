import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * URL tak dikenal (salah ketik, tautan lama). Dulu rute `*` publik tidak punya
 * anak yang cocok, jadi yang tampil hanya footer di atas layar kosong — gejala
 * yang sama dengan keluhan "blank putih".
 */
const COPY = {
    id: {
        title: 'Halaman tidak ditemukan',
        desc: 'Alamat yang kamu buka tidak ada atau sudah dipindahkan.',
        home: 'Beranda',
        surveys: 'Daftar Survei',
        dashboard: 'Dashboard Peneliti',
    },
    en: {
        title: 'Page not found',
        desc: 'The address you opened does not exist or has moved.',
        home: 'Home',
        surveys: 'Survey List',
        dashboard: 'Researcher Dashboard',
    },
} as const;

const LINK =
    'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976D2]';

export function NotFoundPage() {
    const { language } = useLanguage();
    const copy = COPY[language] ?? COPY.id;
    return (
        <section className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm font-bold tracking-widest text-[#1976D2]">404</p>
            <h1 className="text-2xl font-bold text-slate-900">{copy.title}</h1>
            <p className="max-w-md text-sm text-slate-600">{copy.desc}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {/* `/` = landing statis (dilayani Functions, bukan SPA) → navigasi penuh. */}
                <a href="/" className={`${LINK} bg-[#1976D2] text-white`}>{copy.home}</a>
                <Link to="/pages" className={`${LINK} bg-[#1976D2]/10 text-[#1976D2]`}>{copy.surveys}</Link>
                <Link to="/dashboard" className={`${LINK} bg-[#1976D2]/10 text-[#1976D2]`}>{copy.dashboard}</Link>
            </div>
        </section>
    );
}
