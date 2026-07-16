import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronDown, ChevronUp, ChevronRight, BarChart3, Zap, Target } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

/** Pilihan buka/tutup manual diingat lintas sesi. */
const OPEN_KEY = 'jfu_product_cards_open';

interface Product {
    id: string;
    icon: typeof BarChart3;
    titleKey: TranslationKey;
    descKey: TranslationKey;
    to?: string;
    comingSoon?: boolean;
    hidden?: boolean;
}

/**
 * Hub produk di homepage — jalur masuk "Buat Order" setelah menu itu keluar
 * dari navbar. Bisa dikolaps jadi strip "➕ Buat Order Baru" yang selalu
 * terlihat, sehingga affordance untuk order tidak pernah hilang.
 *
 * Default: user tanpa order → terbuka (onboarding); punya order → tertutup
 * (order tracking tetap dominan). Toggle manual menang dan diingat.
 */
export function CreateOrderCards({ hasOrders }: { hasOrders: boolean }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(OPEN_KEY);
            if (saved !== null) return saved === '1';
        } catch { /* localStorage tidak tersedia — pakai default */ }
        return !hasOrders;
    });

    const toggle = () => {
        setOpen((prev) => {
            try { localStorage.setItem(OPEN_KEY, prev ? '0' : '1'); } catch { /* abaikan */ }
            return !prev;
        });
    };

    // Respondent Access disiapkan tapi masih disembunyikan (hidden: true) —
    // tinggal dibuka saat produknya siap.
    const products: Product[] = [
        { id: 'ads', icon: BarChart3, titleKey: 'productAdsTitle', descKey: 'productAdsDesc', to: '/dashboard/submit' },
        { id: 'kilat', icon: Zap, titleKey: 'productKilatTitle', descKey: 'productKilatDesc', comingSoon: true },
        { id: 'respondent-access', icon: Target, titleKey: 'productRespAccessTitle', descKey: 'productRespAccessDesc', comingSoon: true, hidden: true },
    ];
    const visible = products.filter((p) => !p.hidden);

    if (!open) {
        return (
            <button
                onClick={toggle}
                className="w-full min-h-11 mb-4 flex items-center justify-center gap-2 rounded-full border border-jfu-primary/20 bg-white px-4 py-2.5 text-sm font-semibold text-jfu-primary shadow-sm hover:bg-jfu-primary/[0.06] transition-colors"
            >
                <Plus className="w-4 h-4" />
                {t('createNewOrder')}
                <ChevronDown className="w-4 h-4 text-jfu-primary/60" />
            </button>
        );
    }

    return (
        <section className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-bold text-[#1a1a1a] dark:text-white">{t('navCreateOrder')}</h2>
                <button
                    onClick={toggle}
                    aria-label={t('navCreateOrder')}
                    className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-jfu-primary hover:bg-jfu-primary/[0.08] transition-colors"
                >
                    <ChevronUp className="w-4 h-4" />
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((product) => {
                    const Icon = product.icon;
                    const inner = (
                        <>
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${product.comingSoon ? 'bg-gray-100 text-gray-400' : 'bg-jfu-primary/[0.08] text-jfu-primary'}`}>
                                <Icon className="w-5 h-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className={`text-sm font-bold ${product.comingSoon ? 'text-gray-500' : 'text-[#1a1a1a]'}`}>
                                        {t(product.titleKey)}
                                    </span>
                                    {product.comingSoon && (
                                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                            {t('comingSoon')}
                                        </span>
                                    )}
                                </span>
                                <span className={`block text-xs mt-0.5 leading-relaxed ${product.comingSoon ? 'text-gray-400' : 'text-[#666]'}`}>
                                    {t(product.descKey)}
                                </span>
                            </span>
                        </>
                    );

                    if (product.comingSoon || !product.to) {
                        return (
                            <div
                                key={product.id}
                                aria-disabled="true"
                                className="flex items-center gap-3 rounded-2xl border border-gray-200/70 bg-white/60 p-4"
                            >
                                {inner}
                            </div>
                        );
                    }

                    return (
                        <Link
                            key={product.id}
                            to={product.to}
                            className="flex items-center gap-3 rounded-2xl border border-jfu-primary/[0.06] bg-white p-4 shadow-card hover:-translate-y-0.5 hover:border-jfu-primary/20 transition-all"
                        >
                            {inner}
                            <ChevronRight className="w-4 h-4 text-jfu-primary/50 shrink-0" />
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
