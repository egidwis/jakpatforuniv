import { useLanguage } from '../i18n/LanguageContext';
import logoMark from '../assets/Jakpat Navbar Logo.webp';

interface UniversalFooterProps {
    /** Lebar maksimal kontainer isi footer agar sejajar dengan konten halaman. */
    maxWidthClass?: string;
    /** Buka halaman legal di tab baru (berguna di dashboard agar pekerjaan tidak hilang). */
    openInNewTab?: boolean;
    className?: string;
}

const COPY = {
    id: {
        navLabel: 'Navigasi footer',
        privacy: 'Kebijakan Privasi',
        terms: 'Syarat & Ketentuan',
    },
    en: {
        navLabel: 'Footer navigation',
        privacy: 'Privacy Policy',
        terms: 'Terms & Conditions',
    },
} as const;

/**
 * Footer universal untuk seluruh halaman pengguna/pengunjung (dashboard peneliti,
 * halaman publik, serta halaman status/pembayaran). Selaras dengan footer
 * landing page: brand di kiri, 2 tautan legal di tengah, hak cipta di kanan.
 *
 * ⚠️ Jangan memakai class `footer` agar tidak tertimpa aturan `.footer` warisan
 * di `styles.css`. Tautan legal memakai `<a>` (bukan `<Link>`) karena dilayani
 * Cloudflare Pages Functions, bukan React Router.
 */
export function UniversalFooter({
    maxWidthClass = 'max-w-5xl',
    openInNewTab = false,
    className = '',
}: UniversalFooterProps) {
    const { language } = useLanguage();
    const copy = COPY[language] ?? COPY.id;
    const year = new Date().getFullYear();
    const linkProps = openInNewTab
        ? { target: '_blank' as const, rel: 'noopener noreferrer' }
        : {};

    return (
        <footer
            role="contentinfo"
            className={`w-full max-md:px-4 md:px-6 pb-6 pt-2 ${className}`.trim()}
        >
            <div
                className={`${maxWidthClass} mx-auto pt-5 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-3.5 sm:gap-5 text-center sm:text-left`}
            >
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                    <img
                        src={logoMark}
                        alt="Jakpat for Universities"
                        width={20}
                        height={20}
                        loading="lazy"
                        className="h-5 w-auto grayscale opacity-50"
                    />
                    <span>Jakpat for Universities</span>
                </div>

                <nav
                    aria-label={copy.navLabel}
                    className="flex flex-wrap items-center justify-center gap-5 text-xs font-normal text-slate-400"
                >
                    <a
                        href="/privacy-policy"
                        {...linkProps}
                        className="hover:text-slate-600 transition-colors"
                    >
                        {copy.privacy}
                    </a>
                    <a
                        href="/terms-conditions"
                        {...linkProps}
                        className="hover:text-slate-600 transition-colors"
                    >
                        {copy.terms}
                    </a>
                </nav>

                <p className="text-xs text-slate-400 m-0">
                    © {year} Jakpat for Universities.
                </p>
            </div>
        </footer>
    );
}
