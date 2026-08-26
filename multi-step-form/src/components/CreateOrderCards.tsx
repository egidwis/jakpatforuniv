import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Plus, ChevronDown, ChevronRight, BarChart3, Zap } from 'lucide-react';
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
        const inner = (
            <div className="flex flex-col items-start gap-2.5 w-full h-full">
                <div className="w-full flex items-center justify-between">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${product.comingSoon ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-jfu-primary'}`}>
                        <Icon className="w-4.5 h-4.5" />
                    </span>
                    {product.comingSoon ? (
                        <span className="rounded-full border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {t('comingSoon')}
                        </span>
                    ) : (
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <span className={`text-sm font-bold block ${product.comingSoon ? 'text-slate-500' : 'text-slate-900'}`}>
                        {t(product.titleKey)}
                    </span>
                    <span className={`block text-xs mt-1 leading-relaxed ${product.comingSoon ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span className={`font-bold ${product.comingSoon ? 'text-slate-500' : 'text-jfu-primary'}`}>
                            {t(product.hookKey)}
                        </span>{' '}
                        {t(product.descKey)}
                    </span>
                </div>
            </div>
        );

        if (!product.to) {
            return (
                <div
                    key={product.id}
                    aria-disabled="true"
                    className="h-full rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-xs flex flex-col"
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
                    className="h-full rounded-xl border border-slate-200/80 bg-white/95 p-4 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col group"
                >
                    {inner}
                </Link>
            );
        }

        return (
            <Link
                key={product.id}
                to={product.to}
                className="h-full rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs hover:shadow-md hover:border-jfu-primary/40 transition-all group flex flex-col"
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
            className="mb-5 rounded-lg bg-gradient-to-r from-jfu-primary to-jfu-light text-white shadow-md shadow-jfu-primary/20 hover:shadow-lg hover:shadow-jfu-primary/30 transition-all duration-200 overflow-hidden border-0"
        >
            <AccordionPrimitive.Item value="products">
                <AccordionPrimitive.Trigger
                    className={`w-full flex items-center transition-all ${open
                        ? 'justify-between px-5 pt-4 pb-2.5 text-left cursor-pointer'
                        : 'min-h-12 justify-center gap-2.5 px-5 py-3.5 group cursor-pointer'
                        }`}
                >
                    {open ? (
                        <>
                            <span className="text-sm font-bold text-white tracking-wide">{t('navCreateOrder')}</span>
                            <span className="flex items-center justify-center w-7 h-7 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors">
                                <ChevronDown className="w-4 h-4 transition-transform duration-200 rotate-180" />
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center group-hover:scale-110 group-hover:bg-white/30 transition-all">
                                <Plus className="w-4 h-4 stroke-[2.5]" />
                            </span>
                            <span className="text-sm font-bold text-white tracking-wide">{t('createNewOrder')}</span>
                            <ChevronDown className="w-4 h-4 text-white/80 group-hover:text-white group-hover:translate-y-0.5 transition-all" />
                        </>
                    )}
                </AccordionPrimitive.Trigger>

                <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="px-5 pb-5 pt-1.5">
                        <ProductCardGrid />
                    </div>
                </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
        </AccordionPrimitive.Root>
    );
}
