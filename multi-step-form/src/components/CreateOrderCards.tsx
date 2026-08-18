import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Plus, ChevronDown, ChevronRight, BarChart3, Zap, Target } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

/** Pilihan buka/tutup manual diingat lintas sesi. */
const OPEN_KEY = 'jfu_product_cards_open';

interface Product {
    id: string;
    icon: typeof BarChart3;
    titleKey: TranslationKey;
    /** Kalimat pembuka pendek yang membingkai produk sebagai pilihan strategi
     * (reach vs speed), bukan sekadar metode distribusi. */
    hookKey: TranslationKey;
    descKey: TranslationKey;
    to?: string;
    comingSoon?: boolean;
    hidden?: boolean;
}

// Respondent Access disiapkan tapi masih disembunyikan (hidden: true) —
// tinggal dibuka saat produknya siap. Kilat tetap tampil sebagai comingSoon
// tapi TIDAK klikabel lagi 2026-08-10 — halaman edukasinya (submit-kilat)
// dihapus, jadi tanpa `to` kartu ini otomatis jatuh ke varian non-link.
const PRODUCTS: Product[] = [
    { id: 'ads', icon: BarChart3, titleKey: 'productAdsTitle', hookKey: 'productAdsHook', descKey: 'productAdsDesc', to: '/dashboard/submit-iklan' },
    { id: 'kilat', icon: Zap, titleKey: 'productKilatTitle', hookKey: 'productKilatHook', descKey: 'productKilatDesc', comingSoon: true },
    { id: 'respondent-access', icon: Target, titleKey: 'productRespAccessTitle', hookKey: 'productRespAccessHook', descKey: 'productRespAccessDesc', comingSoon: true, hidden: true },
];

/**
 * Grid kartu produk — dipakai dua tempat yang tidak pernah tampil bersamaan:
 * hub "Buat Order" (saat user punya order) dan empty state Order Saya (saat
 * belum ada order, sebagai pengganti tombol generik "Buat Order Pertama").
 */
export function ProductCardGrid() {
    const { t } = useLanguage();
    const visible = PRODUCTS.filter((p) => !p.hidden);

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((product) => {
                const Icon = product.icon;
                const inner = (
                    <>
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${product.comingSoon ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-jfu-primary'}`}>
                            <Icon className="w-5 h-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${product.comingSoon ? 'text-slate-500' : 'text-slate-900'}`}>
                                    {t(product.titleKey)}
                                </span>
                                {product.comingSoon && (
                                    <span className="rounded-full border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                        {t('comingSoon')}
                                    </span>
                                )}
                            </span>
                            <span className={`block text-xs mt-0.5 leading-relaxed ${product.comingSoon ? 'text-slate-400' : 'text-slate-600'}`}>
                                {/* Hook membingkai produk sebagai pilihan strategi (reach vs
                                    speed), bukan sekadar metode distribusi. */}
                                <span className={`font-bold ${product.comingSoon ? 'text-slate-500' : 'text-jfu-primary'}`}>
                                    {t(product.hookKey)}
                                </span>{' '}
                                {t(product.descKey)}
                            </span>
                        </span>
                    </>
                );

                if (!product.to) {
                    return (
                        <div
                            key={product.id}
                            aria-disabled="true"
                            className="flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4"
                        >
                            {inner}
                        </div>
                    );
                }

                if (product.comingSoon) {
                    return (
                        <Link
                            key={product.id}
                            to={product.to}
                            className="flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all"
                        >
                            {inner}
                            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                        </Link>
                    );
                }

                return (
                    <Link
                        key={product.id}
                        to={product.to}
                        className="flex items-center gap-3.5 rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] hover:border-jfu-primary/40 hover:bg-blue-50/15 transition-all group"
                    >
                        {inner}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                );
            })}
        </div>
    );
}

/**
 * Hub produk di homepage — jalur masuk "Buat Order" setelah menu itu keluar
 * dari navbar. Bisa dikolaps jadi strip "➕ Buat Order Baru" yang selalu
 * terlihat, sehingga affordance untuk order tidak pernah hilang.
 */
export function CreateOrderCards() {
    const { t } = useLanguage();
    const [open, setOpen] = useState<boolean>(false);

    const handleOpenChange = (value: string) => {
        setOpen(value === 'products');
    };

    return (
        <AccordionPrimitive.Root
            type="single"
            collapsible
            value={open ? 'products' : ''}
            onValueChange={handleOpenChange}
            className="mb-5 rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors overflow-hidden"
        >
            <AccordionPrimitive.Item value="products">
                <AccordionPrimitive.Trigger
                    className={`w-full flex items-center transition-all ${open
                        ? 'justify-between px-5 pt-4 pb-2 text-left'
                        : 'min-h-12 justify-center gap-2.5 px-5 py-3 hover:bg-slate-50/80 group'
                        }`}
                >
                    {open ? (
                        <>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{t('navCreateOrder')}</span>
                            <span className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-jfu-primary hover:bg-blue-50 transition-colors">
                                <ChevronDown className="w-4 h-4 transition-transform duration-200 rotate-180" />
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="w-5 h-5 rounded-full bg-blue-50 text-jfu-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-sm font-bold text-slate-800 group-hover:text-jfu-primary transition-colors">{t('createNewOrder')}</span>
                            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-jfu-primary transition-colors" />
                        </>
                    )}
                </AccordionPrimitive.Trigger>

                <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="px-5 pb-5 pt-1">
                        <ProductCardGrid />
                    </div>
                </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
        </AccordionPrimitive.Root>
    );
}
