import { Link } from 'react-router-dom';
import { ChevronRight, BarChart3, Zap, MessageCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

interface Product {
    id: string;
    icon: typeof BarChart3;
    /** Warna tile ikon saat produk aktif — mengikuti chip jenis order di kartu
     * My Order (Iklan biru, Kilat amber). */
    accent: 'blue' | 'amber';
    titleKey: TranslationKey;
    /** Kalimat pembuka pendek yang membingkai produk sebagai pilihan strategi
     * (reach vs speed), bukan sekadar metode distribusi. */
    hookKey: TranslationKey;
    descKey: TranslationKey;
    to?: string;
    isActionModal?: boolean;
    comingSoon?: boolean;
    /** Chip "Baru" untuk produk yang baru dibuka (mis. hari pintu Kilat dibuka). */
    isNew?: boolean;
    hidden?: boolean;
}

/**
 * Satu-satunya daftar produk di dashboard. Produk baru cukup satu entri di
 * sini — ia muncul sebagai baris baru di kartu "Buat Order Baru".
 */
const PRODUCTS: Product[] = [
    { id: 'ads', icon: BarChart3, accent: 'blue', titleKey: 'productAdsTitle', hookKey: 'productAdsHook', descKey: 'productAdsDesc', isActionModal: true },
    { id: 'kilat', icon: Zap, accent: 'amber', titleKey: 'productKilatTitle', hookKey: 'productKilatHook', descKey: 'productKilatDesc', comingSoon: true },
];

const ACCENT_TILE: Record<Product['accent'], string> = {
    blue: 'bg-gradient-to-br from-jfu-primary to-jfu-light text-white shadow-xs shadow-jfu-primary/20',
    amber: 'bg-amber-50 text-amber-500 border border-amber-200/80 shadow-2xs',
};

/**
 * Baris produk di dalam kartu "Buat Order Baru". Dulu grid kartu besar sejajar;
 * kini daftar baris supaya produk ketiga dst. tidak menyempitkan kartu di
 * desktop atau mendorong My Order jauh ke bawah di ponsel.
 */
export function ProductCardGrid({ onOpenAdsModal }: { onOpenAdsModal?: () => void }) {
    const { t } = useLanguage();
    const visible = PRODUCTS.filter((p) => !p.hidden);

    const renderProductRow = (product: Product) => {
        const Icon = product.icon;
        const isComingSoon = !!product.comingSoon;

        const inner = (
            <>
                <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isComingSoon
                            ? 'bg-slate-100 text-slate-400 border border-slate-200/80'
                            : ACCENT_TILE[product.accent]
                    }`}
                >
                    <Icon className="w-[18px] h-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isComingSoon ? 'text-slate-500' : 'text-slate-900'}`}>
                            {t(product.titleKey)}
                        </span>
                        {product.isNew && !isComingSoon && (
                            <span className="rounded-full border border-amber-200/80 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                {t('newBadge')}
                            </span>
                        )}
                    </span>
                    <span className={`block text-xs mt-0.5 leading-relaxed line-clamp-2 ${isComingSoon ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className={`font-semibold ${isComingSoon ? 'text-slate-500' : 'text-slate-700'}`}>
                            {t(product.hookKey)}
                        </span>{' '}
                        {t(product.descKey)}
                    </span>
                </span>
                {isComingSoon ? (
                    <span className="self-center shrink-0 rounded-full border border-slate-200/90 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {t('comingSoon')}
                    </span>
                ) : (
                    <ChevronRight className="self-center w-4 h-4 shrink-0 text-slate-300 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all" />
                )}
            </>
        );

        const rowClass = 'w-full flex items-start gap-3 px-5 py-4 text-left';
        const activeClass = `${rowClass} group cursor-pointer transition-colors hover:bg-jfu-primary/[0.04]`;

        if (product.isActionModal && !isComingSoon) {
            return (
                <button key={product.id} type="button" onClick={onOpenAdsModal} className={activeClass}>
                    {inner}
                </button>
            );
        }

        if (!product.to || isComingSoon) {
            return (
                <div key={product.id} aria-disabled="true" className={`${rowClass} cursor-not-allowed select-none`}>
                    {inner}
                </div>
            );
        }

        return (
            <Link key={product.id} to={product.to} className={activeClass}>
                {inner}
            </Link>
        );
    };

    return <div className="divide-y divide-slate-100">{visible.map(renderProductRow)}</div>;
}

/**
 * Kartu aksi dashboard (kolom kiri desktop, di atas My Order di ponsel).
 *
 * Tiga tingkat bobot dalam SATU kartu: kepala "Buat Order Baru" → baris produk
 * (bobot utama: tile ikon berwarna, judul tebal) → kaki Chat Mimin (bobot
 * rendah: teks kecil abu, ikon polos tanpa tile). Judul sengaja di DALAM kartu,
 * bukan teks lepas di atasnya, supaya kolom kiri berjangkar seperti kartu order.
 *
 * Kaki ini satu-satunya pintu masuk Chat Mimin di dashboard — tautannya sudah
 * dicabut dari navbar dan dari footer kartu order.
 */
export function CreateOrderCards({ onOpenAdsModal }: { onOpenAdsModal?: () => void }) {
    const { t } = useLanguage();

    return (
        <section
            aria-labelledby="create-order-heading"
            className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] overflow-hidden"
        >
            <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                <h2 id="create-order-heading" className="text-base font-bold text-slate-900 dark:text-white">
                    {t('createNewOrder')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{t('createOrderSubtitle')}</p>
            </div>

            <ProductCardGrid onOpenAdsModal={onOpenAdsModal} />

            <Link
                to="/dashboard/chat"
                className="group flex items-center gap-2 px-5 py-3 border-t border-dashed border-slate-200 bg-slate-50/70 text-xs text-slate-500 hover:text-jfu-primary transition-colors"
            >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 min-w-0">{t('createOrderChatCta')}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-jfu-primary transition-colors" />
            </Link>
        </section>
    );
}
