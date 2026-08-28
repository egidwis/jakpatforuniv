import { Link } from 'react-router-dom';
import { ChevronRight, BarChart3, Zap } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

interface Product {
    id: string;
    icon: typeof BarChart3;
    titleKey: TranslationKey;
    /** Kalimat pembuka pendek yang membingkai produk sebagai pilihan strategi
     * (reach vs speed), bukan sekadar metode distribusi. */
    hookKey: TranslationKey;
    descKey: TranslationKey;
    to?: string;
    isActionModal?: boolean;
    comingSoon?: boolean;
    hidden?: boolean;
}

const PRODUCTS: Product[] = [
    { id: 'ads', icon: BarChart3, titleKey: 'productAdsTitle', hookKey: 'productAdsHook', descKey: 'productAdsDesc', to: '/dashboard/submit-iklan' },
    { id: 'kilat', icon: Zap, titleKey: 'productKilatTitle', hookKey: 'productKilatHook', descKey: 'productKilatDesc', comingSoon: true },
];

/**
 * Grid kartu produk — dipakai dua tempat yang tidak pernah tampil bersamaan:
 * hub "Buat Order" (saat user punya order) dan empty state Order Saya (saat
 * belum ada order, sebagai pengganti tombol generik "Buat Order Pertama").
 */
export function ProductCardGrid() {
    const { t } = useLanguage();
    const visible = PRODUCTS.filter((p) => !p.hidden);

    const renderProductCard = (product: Product) => {
        const Icon = product.icon;
        const isComingSoon = !!product.comingSoon;

        const inner = (
            <div className="flex flex-col items-start gap-2.5 w-full h-full">
                <div className="w-full flex items-center justify-between">
                    <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isComingSoon
                                ? 'bg-amber-50 text-amber-500 border border-amber-200/80 shadow-2xs'
                                : 'bg-white/20 text-white shadow-xs'
                        }`}
                    >
                        <Icon className="w-4.5 h-4.5" />
                    </span>
                    {isComingSoon ? (
                        <span className="rounded-full border border-slate-200/90 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {t('comingSoon')}
                        </span>
                    ) : (
                        <ChevronRight className="w-4 h-4 text-white/80 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <span
                        className={`text-sm sm:text-base font-bold block ${
                            isComingSoon ? 'text-slate-800' : 'text-white'
                        }`}
                    >
                        {t(product.titleKey)}
                    </span>
                    <span
                        className={`block text-xs mt-1.5 leading-relaxed ${
                            isComingSoon ? 'text-slate-500' : 'text-white/85'
                        }`}
                    >
                        <span
                            className={`font-semibold ${
                                isComingSoon ? 'text-slate-600' : 'text-white'
                            }`}
                        >
                            {t(product.hookKey)}
                        </span>{' '}
                        {t(product.descKey)}
                    </span>
                </div>
            </div>
        );

        if (!product.to || isComingSoon) {
            return (
                <div
                    key={product.id}
                    aria-disabled="true"
                    className="h-full rounded-2xl border border-slate-200/80 bg-white/40 backdrop-blur-xs p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col cursor-not-allowed select-none"
                >
                    {inner}
                </div>
            );
        }

        return (
            <Link
                key={product.id}
                to={product.to}
                className="h-full rounded-2xl bg-gradient-to-r from-jfu-primary to-jfu-light text-white p-4 sm:p-5 shadow-md shadow-jfu-primary/20 hover:shadow-lg hover:shadow-jfu-primary/30 hover:-translate-y-0.5 transition-all duration-200 group flex flex-col border-0"
            >
                {inner}
            </Link>
        );
    };

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {visible.map(renderProductCard)}
        </div>
    );
}

/**
 * Hub produk di homepage — Versi A: Clean card dengan heading sejajar My Order
 */
export function CreateOrderCards() {
    const { t } = useLanguage();

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-bold text-[#1a1a1a] dark:text-white truncate">
                    {t('createNewOrder')}
                </h2>
            </div>
            <ProductCardGrid />
        </div>
    );
}


