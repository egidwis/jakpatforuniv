import { useLanguage } from '@/i18n/LanguageContext';
import { bootKindFor, bootLoaderSubtitle } from './boot/bootRoute';
import { SurveyDetailSkeleton, SurveyListPageSkeleton } from './boot/SurveyListSkeleton';

/**
 * Pengganti layar kosong selama aplikasi belum siap (sesi dibaca di AuthProvider,
 * chunk rute lazy dimuat). Sadar rute: halaman responden mendapat skeleton yang
 * bentuknya sama dengan halaman aslinya; rute lain mendapat loader bermerek yang
 * markupnya IDENTIK dengan loader statis di index.html (CSS-nya di <head> sana),
 * jadi peralihan HTML → React tidak berkedip.
 */
export function BootLoader() {
    const { language } = useLanguage();
    const loc = typeof window !== 'undefined' ? window.location : { pathname: '/', hostname: '', search: '' };
    const kind = bootKindFor(loc.pathname, loc.hostname, loc.search);

    if (kind === 'pages') return <SurveyListPageSkeleton lang={language} />;
    if (kind === 'survey') return <SurveyDetailSkeleton lang={language} />;

    return (
        <div className="jfu-initial-loader" role="status" aria-label="Memuat Jakpat for Universities">
            <div className="jfu-loader-glow" />
            <div className="jfu-loader-card">
                <div className="jfu-loader-logo-wrap">
                    <img src="/favicon.webp" alt="" className="jfu-loader-logo" />
                </div>
                <div className="jfu-loader-title">Jakpat for Universities</div>
                <div className="jfu-loader-subtitle">{bootLoaderSubtitle(loc.pathname)}</div>
                <div className="jfu-progress-track">
                    <div className="jfu-progress-bar" />
                </div>
            </div>
        </div>
    );
}
