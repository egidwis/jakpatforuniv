import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, BarChart3, Zap, MessageCircle, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
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
    /** Label tombol aksi di kartu produk aktif. */
    ctaKey: TranslationKey;
    to?: string;
    isActionModal?: boolean;
    comingSoon?: boolean;
    /** Chip kanan "Baru" menggantikan "Tersedia" — produk yang baru dibuka.
     * Tanpa tanggal berakhir: dicabut manual (keputusan product owner 26 Okt 2026). */
    isNew?: boolean;
    hidden?: boolean;
}

/**
 * Satu-satunya daftar produk di dashboard. Produk baru cukup satu entri di
 * sini — ia muncul sebagai baris baru di kartu "Buat Order Baru".
 */
const PRODUCTS: Product[] = [
    { id: 'ads', icon: BarChart3, accent: 'blue', titleKey: 'productAdsTitle', hookKey: 'productAdsHook', descKey: 'productAdsDesc', ctaKey: 'createAdOrderBtn', isActionModal: true },
    // `comingSoon` dicabut per akun oleh pemanggil (`onOpenKilatModal`), bukan
    // di sini: pintu Kilat dibuka bertahap — admin & akun uji dulu (Phase 5 §5.6).
    { id: 'kilat', icon: Zap, accent: 'amber', titleKey: 'productKilatTitle', hookKey: 'productKilatHook', descKey: 'productKilatDesc', ctaKey: 'createKilatOrderBtn', isActionModal: true, comingSoon: true, isNew: true },
];

/**
 * Satu warna per produk, dipakai di SEMUA bagian kartunya (bingkai, tile, chip,
 * tombol) supaya dua produk terbaca beda sekilas. Selaras dengan chip jenis
 * order di kartu My Order: Iklan biru, Kilat amber (petir = kuning).
 * Tombol aksi sengaja LEMBUT (latar muda + garis + teks berwarna) dan baru terisi
 * saat disorot: dua tombol solid bertumpuk menjadi blok warna terkuat di
 * dashboard, mengalahkan kartu order yang menjadi isi utamanya. Teks amber-700
 * di atas latar muda ±5:1; teks putih di atas amber/oranye solid hanya ±2:1,
 * dan amber-700+ sebagai latar terbaca cokelat — jangan dikembalikan.
 */
const ACCENT = {
    blue: {
        card: 'border-blue-200/90 from-blue-50/70 via-blue-50/20 hover:border-jfu-primary focus:ring-jfu-primary/30',
        tile: 'bg-gradient-to-br from-jfu-primary to-jfu-light text-white shadow-xs shadow-jfu-primary/25',
        title: 'group-hover:text-jfu-primary',
        chip: 'border-blue-200/80 bg-blue-100/70 text-jfu-primary',
        divider: 'border-blue-100/80',
        cta: 'border-blue-200 bg-white/70 text-jfu-primary group-hover:border-jfu-primary group-hover:bg-jfu-primary group-hover:text-white',
    },
    amber: {
        card: 'border-amber-200/90 from-amber-50/80 via-amber-50/25 hover:border-amber-500 focus:ring-amber-400/40',
        tile: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-xs shadow-orange-500/25',
        title: 'group-hover:text-orange-600',
        chip: 'border-amber-200/80 bg-amber-100/80 text-amber-700',
        divider: 'border-amber-100',
        cta: 'border-amber-300/80 bg-white/70 text-amber-700 group-hover:border-amber-600 group-hover:bg-amber-600 group-hover:text-white',
    },
} satisfies Record<Product['accent'], Record<string, string>>;

/**
 * Baris produk di dalam kartu "Buat Order Baru". Dulu grid kartu besar sejajar;
 * kini daftar baris supaya produk ketiga dst. tidak menyempitkan kartu di
 * desktop atau mendorong My Order jauh ke bawah di ponsel.
 */
export function ProductCardGrid({ onOpenAdsModal, onOpenKilatModal, onSelect }: {
    onOpenAdsModal?: () => void;
    /** Diisi HANYA untuk akun yang boleh memesan Kilat (`canUseKilatSelfServe`). */
    onOpenKilatModal?: () => void;
    /** Dipanggil begitu sebuah produk dipilih — dipakai pemanggil yang membungkus daftar ini dalam
     *  panel sementara (lembar bawah ponsel) supaya panelnya menutup sendiri. */
    onSelect?: () => void;
}) {
    const { t } = useLanguage();
    const visible = PRODUCTS.filter((p) => !p.hidden);

    const renderProductRow = (product: Product) => {
        const Icon = product.icon;
        const tone = ACCENT[product.accent];
        const onOpen = product.id === 'kilat' ? onOpenKilatModal : onOpenAdsModal;
        const isComingSoon = !!product.comingSoon && !(product.id === 'kilat' && onOpenKilatModal);

        if (product.isActionModal && !isComingSoon) {
            return (
                <button
                    key={product.id}
                    type="button"
                    onClick={() => { onSelect?.(); onOpen?.(); }}
                    className={`w-full text-left p-4 rounded-xl border bg-gradient-to-b to-white shadow-xs hover:shadow-md transition-all duration-200 group cursor-pointer block focus:outline-none focus:ring-2 ${tone.card}`}
                >
                    <div className="flex items-center justify-between gap-2.5 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone.tile}`}>
                                <Icon className="w-4 h-4" />
                            </span>
                            <span className={`text-sm font-bold text-slate-900 transition-colors truncate ${tone.title}`}>
                                {t(product.titleKey)}
                            </span>
                        </div>

                        {/* "Tersedia" hanya lawan dari "Segera Hadir" — kartu berwarna & tombolnya
                            sudah mengatakannya. Produk baru memakai slot yang sama untuk "Baru". */}
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                            {t(product.isNew ? 'newBadge' : 'productAvailable')}
                        </span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-600 line-clamp-2">
                        <span className="font-semibold text-slate-800">
                            {t(product.hookKey)}
                        </span>{' '}
                        {t(product.descKey)}
                    </p>

                    <div className={`mt-3.5 pt-2.5 border-t ${tone.divider}`}>
                        <span className={`w-full py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${tone.cta}`}>
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>{t(product.ctaKey)}</span>
                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                    </div>
                </button>
            );
        }

        if (!product.to || isComingSoon) {
            return (
                <div
                    key={product.id}
                    aria-disabled="true"
                    className="w-full text-left p-3.5 sm:p-4 rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 opacity-80 cursor-not-allowed select-none"
                >
                    <div className="flex items-center justify-between gap-2.5 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-400 border border-slate-200/80">
                                <Icon className="w-4 h-4" />
                            </span>
                            <span className="text-sm font-bold text-slate-500 truncate">
                                {t(product.titleKey)}
                            </span>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200/90 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {t('comingSoon')}
                        </span>
                    </div>

                    <p className="text-xs leading-relaxed line-clamp-2 text-slate-400">
                        <span className="font-semibold text-slate-500">
                            {t(product.hookKey)}
                        </span>{' '}
                        {t(product.descKey)}
                    </p>
                </div>
            );
        }

        return (
            <Link
                key={product.id}
                to={product.to}
                onClick={onSelect}
                className={`w-full text-left p-4 rounded-xl border bg-gradient-to-b to-white shadow-xs hover:shadow-md transition-all duration-200 group cursor-pointer block focus:outline-none focus:ring-2 ${tone.card}`}
            >
                <div className="flex items-center justify-between gap-2.5 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone.tile}`}>
                            <Icon className="w-4 h-4" />
                        </span>
                        <span className={`text-sm font-bold text-slate-900 transition-colors truncate ${tone.title}`}>
                            {t(product.titleKey)}
                        </span>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                        {t('productAvailable')}
                    </span>
                </div>

                <p className="text-xs leading-relaxed text-slate-600 line-clamp-2">
                    <span className="font-semibold text-slate-800">
                        {t(product.hookKey)}
                    </span>{' '}
                    {t(product.descKey)}
                </p>

                <div className={`mt-3.5 pt-2.5 border-t ${tone.divider}`}>
                    <span className={`w-full py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${tone.cta}`}>
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{t(product.ctaKey)}</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                </div>
            </Link>
        );
    };

    return <div className="p-3 sm:p-4 space-y-2.5">{visible.map(renderProductRow)}</div>;
}

/** Kaki "Chat Mimin" — dipakai kartu Create (desktop) dan lembar tombol "Order baru" (ponsel),
 *  supaya pintu ke Chat Mimin satu bentuk di mana pun. */
function ChatMiminFooter({ onNavigate }: { onNavigate?: () => void }) {
    const { t } = useLanguage();
    return (
        <Link
            to="/dashboard/chat"
            onClick={onNavigate}
            className="group flex items-center gap-2 px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/50 hover:bg-slate-100/70 text-xs text-slate-500 hover:text-jfu-primary transition-colors"
        >
            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 min-w-0">{t('createOrderChatCta')}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all" />
        </Link>
    );
}

/**
 * Kartu aksi dashboard (kolom kiri desktop, di atas My Order di ponsel).
 *
 * Tiga tingkat bobot dalam SATU kartu: kepala "Buat Order Baru" → tombol aksi produk
 * (bobot utama: tile ikon berwarna, judul tebal, tombol aksi CTA) → kaki Chat Mimin
 * (bobot rendah: teks kecil abu, ikon polos tanpa tile).
 */
export function CreateOrderCards({ onOpenAdsModal, onOpenKilatModal }: {
    onOpenAdsModal?: () => void;
    onOpenKilatModal?: () => void;
}) {
    const { t } = useLanguage();

    return (
        <section
            aria-labelledby="create-order-heading"
            className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] overflow-hidden"
        >
            {/* Satu baris, tinggi tetap 64px: kepala "My Order" di sebelahnya (StatusPage)
                memakai ritme yang sama supaya tepi bawah keduanya sejajar di desktop. */}
            <div className="flex items-center h-14 lg:h-16 px-4 sm:px-5 border-b border-slate-100">
                <h2 id="create-order-heading" className="text-base font-bold text-slate-900 dark:text-white">
                    {t('createNewOrder')}
                </h2>
            </div>

            <ProductCardGrid onOpenAdsModal={onOpenAdsModal} onOpenKilatModal={onOpenKilatModal} />

            <ChatMiminFooter />
        </section>
    );
}

/**
 * Tombol melayang "Order baru" (ponsel). SELALU membuka lembar bawah yang isinya sama dengan kartu
 * Create di desktop (baris produk + kaki Chat Mimin) — bukan langsung ke modal Iklan:
 *   - Chat Mimin tak lagi punya ikon sendiri di toolbar (sempit), jadi lembar inilah pintunya;
 *   - Kilat otomatis aktif di sini begitu pemanggil mengisi `onOpenKilatModal` (akun yang boleh
 *     memesan Kilat), tanpa menyentuh tombol ini (sebelumnya "langsung ke Iklan" menyembunyikannya).
 * Harganya satu ketukan lebih panjang untuk memesan; peneliti ponsel lebih sering mengecek status.
 */
export function NewOrderFab({ onOpenAdsModal, onOpenKilatModal }: {
    onOpenAdsModal?: () => void;
    onOpenKilatModal?: () => void;
}) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={t('createNewOrder')}
                title={t('createNewOrder')}
                className="lg:hidden fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 inline-flex items-center gap-2 h-12 pl-4 pr-5 rounded-full bg-gradient-to-br from-jfu-primary to-jfu-light text-white text-sm font-bold shadow-[0_10px_24px_-6px_rgba(25,118,210,0.55)] active:scale-95 transition-transform"
            >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
                {t('newOrderFab')}
            </button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="bottom" className="p-0 gap-0 rounded-t-2xl max-h-[85dvh] overflow-y-auto">
                    <SheetHeader className="px-5 pt-5 pb-1 text-left">
                        <SheetTitle className="text-base font-bold text-slate-900">{t('createNewOrder')}</SheetTitle>
                        <SheetDescription className="sr-only">{t('createOrderSubtitle')}</SheetDescription>
                    </SheetHeader>
                    <ProductCardGrid onOpenAdsModal={onOpenAdsModal} onOpenKilatModal={onOpenKilatModal} onSelect={() => setOpen(false)} />
                    <ChatMiminFooter onNavigate={() => setOpen(false)} />
                </SheetContent>
            </Sheet>
        </>
    );
}
