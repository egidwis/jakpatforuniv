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
// tinggal dibuka saat produknya siap. Kilat comingSoon tapi tetap klikabel:
// mengarah ke halaman edukasinya (pintu masuk submit-kilat).
const PRODUCTS: Product[] = [
    { id: 'ads', icon: BarChart3, titleKey: 'productAdsTitle', hookKey: 'productAdsHook', descKey: 'productAdsDesc', to: '/dashboard/submit-iklan' },
    { id: 'kilat', icon: Zap, titleKey: 'productKilatTitle', hookKey: 'productKilatHook', descKey: 'productKilatDesc', to: '/dashboard/submit-kilat', comingSoon: true },
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
                                {/* Hook membingkai produk sebagai pilihan strategi (reach vs
                                    speed), bukan sekadar metode distribusi. */}
                                <span className={`font-semibold ${product.comingSoon ? 'text-gray-500' : 'text-jfu-primary'}`}>
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
                            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4"
                        >
                            {inner}
                        </div>
                    );
                }

                if (product.comingSoon) {
                    // Coming soon tapi klikabel — menuju halaman edukasi produknya,
                    // dengan tampilan tetap redup supaya hirarki produk utama terjaga.
                    return (
                        <Link
                            key={product.id}
                            to={product.to}
                            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 hover:bg-white hover:border-gray-300 hover:shadow-sm transition-all"
                        >
                            {inner}
                            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                        </Link>
                    );
                }

                return (
                    <Link
                        key={product.id}
                        to={product.to}
                        // Tanpa hover:-translate-y — kartu ini bersarang rapat di dalam
                        // card luar "Buat Order"; mengangkatnya bikin border dalam &
                        // luar bertumpuk/glitchy. Cukup shadow + border yang menguat.
                        className="flex items-center gap-3 rounded-xl border border-jfu-primary/25 bg-white p-4 shadow-sm hover:shadow-card hover:border-jfu-primary/40 transition-shadow"
                    >
                        {inner}
                        <ChevronRight className="w-4 h-4 text-jfu-primary/50 shrink-0" />
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
 *
 * Hanya dirender saat user punya order — saat belum ada order, empty state
 * Order Saya-lah yang menampilkan ProductCardGrid (satu pintu masuk, tanpa
 * duplikasi CTA). Default collapsed; toggle manual diingat lintas sesi.
 */
export function CreateOrderCards() {
    const { t } = useLanguage();
    const [open, setOpen] = useState<boolean>(false);

    const handleOpenChange = (value: string) => {
        setOpen(value === 'products');
    };

    return (
        // Wadah putih (border/shadow/radius) menempel di Root, bukan di
        // Trigger — jadi bentuknya persisten dari pill collapsed sampai
        // card terbuka; hanya konten & tinggi di dalamnya yang berubah.
        <AccordionPrimitive.Root
            type="single"
            collapsible
            value={open ? 'products' : ''}
            onValueChange={handleOpenChange}
            className="mb-5 rounded-2xl border border-jfu-primary/[0.12] bg-white shadow-card overflow-hidden"
        >
            <AccordionPrimitive.Item value="products">
                <AccordionPrimitive.Trigger
                    // Tint hover cuma untuk state pill (collapsed) — saat terbuka baris
                    // judul bukan target klik utama, jadi tidak perlu ikut ter-highlight.
                    className={`w-full flex items-center transition-colors ${open
                        ? 'justify-between px-4 pt-4 pb-2 text-left'
                        : 'min-h-11 justify-center gap-2 px-4 py-2.5 hover:bg-jfu-primary/[0.04]'
                        }`}
                >
                    {open ? (
                        <>
                            <span className="text-sm font-bold text-[#1a1a1a] dark:text-white">{t('navCreateOrder')}</span>
                            <span className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-jfu-primary hover:bg-jfu-primary/[0.08] transition-colors">
                                <ChevronDown className="w-4 h-4 transition-transform duration-200 rotate-180" />
                            </span>
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4 text-jfu-primary" />
                            <span className="text-sm font-semibold text-jfu-primary">{t('createNewOrder')}</span>
                            <ChevronDown className="w-4 h-4 text-jfu-primary/60 transition-transform duration-200" />
                        </>
                    )}
                </AccordionPrimitive.Trigger>

                <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="px-4 pb-4">
                        <ProductCardGrid />
                    </div>
                </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
        </AccordionPrimitive.Root>
    );
}
