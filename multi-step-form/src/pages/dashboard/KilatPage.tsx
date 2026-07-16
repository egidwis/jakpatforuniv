import { Link } from 'react-router-dom';
import { Zap, BellRing, Timer, CalendarClock, Tag, ArrowRight, BarChart3 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { KILAT_ADDON_COST } from '../../utils/constants';

/**
 * Pintu masuk produk Kilat (/dashboard/submit-kilat) — halaman edukasi murni.
 * Kilat masih pilot: order langsung belum dibuka ("Segera Hadir"); satu-satunya
 * jalur nyata tetap kode voucher tertentu di checkout flow submit-iklan, dan
 * halaman ini sengaja tidak menyebut mekanisme itu.
 */
export function KilatPage() {
    const { t } = useLanguage();

    const addonPrice = new Intl.NumberFormat('id-ID').format(KILAT_ADDON_COST);

    const facts = [
        { icon: BellRing, label: t('kilatFactPush') },
        { icon: Timer, label: t('kilatFactFast') },
        { icon: CalendarClock, label: t('kilatFactOneDay') },
        { icon: Tag, label: t('kilatFactPrice').replace('{price}', `Rp${addonPrice}`) },
    ];

    return (
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
            <div className="max-w-3xl mx-auto">
                {/* Header edukasi produk — kembaran visual pintu masuk Iklan Survei */}
                <div className="text-center mb-8">
                    <span className="inline-flex w-14 h-14 rounded-2xl bg-amber-400/15 text-amber-500 items-center justify-center mb-4">
                        <Zap className="w-7 h-7" />
                    </span>
                    <div className="flex items-center justify-center gap-2">
                        <h1 className="text-2xl md:text-3xl font-bold text-[#1a1a1a]">{t('productKilatTitle')}</h1>
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                            {t('comingSoon')}
                        </span>
                    </div>
                    <p className="text-sm md:text-base text-[#666] mt-2 max-w-md mx-auto leading-relaxed">
                        <span className="font-semibold text-jfu-primary">{t('productKilatHook')}</span>{' '}
                        {t('productKilatDesc')}
                    </p>
                </div>

                {/* Fakta produk */}
                <div className="grid gap-3 sm:grid-cols-2 mb-8">
                    {facts.map(({ icon: Icon, label }) => (
                        <div
                            key={label}
                            className="flex items-center gap-3 rounded-2xl border border-jfu-primary/[0.12] bg-white p-4 shadow-card"
                        >
                            <span className="inline-flex w-10 h-10 rounded-xl bg-jfu-primary/[0.08] text-jfu-primary items-center justify-center shrink-0">
                                <Icon className="w-5 h-5" />
                            </span>
                            <span className="text-sm text-[#444] leading-snug">{label}</span>
                        </div>
                    ))}
                </div>

                {/* Coming soon + jalan pulang ke produk yang bisa dipesan */}
                <div className="text-center rounded-2xl border border-jfu-primary/[0.12] bg-white p-6 shadow-card">
                    <p className="text-sm text-[#666] mb-4">{t('kilatComingSoonNote')}</p>
                    <Link
                        to="/dashboard/submit-iklan"
                        className="inline-flex items-center justify-center gap-2 min-h-11 rounded-full px-6 font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 transition-all"
                    >
                        <BarChart3 className="w-4 h-4" />
                        {t('kilatStartWithAds')}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
