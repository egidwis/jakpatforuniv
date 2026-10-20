import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { ctaButtonClass, ctaRoyal, OrderActionButton } from './OrderActionButton';
import type { OrderSummary, SummaryTone } from './orderSummary';

const WIB = 'Asia/Jakarta';

const TONE: Record<SummaryTone, { box: string; dot: string }> = {
    amber: { box: 'border-amber-200/80 bg-amber-50/70', dot: 'bg-amber-500' },
    slate: { box: 'border-slate-200 bg-slate-50', dot: 'bg-slate-400' },
    emerald: { box: 'border-emerald-200/80 bg-emerald-50/60', dot: 'bg-emerald-500' },
    blue: { box: 'border-blue-200/80 bg-blue-50/60', dot: 'bg-jfu-primary' },
};

/**
 * Kartu ringkas order — HANYA ponsel (`lg:hidden`). Menjawab dua hal tanpa membuka apa pun:
 * "sekarang di mana" dan "apa langkahku". Isi lengkap (Review, tiket, Publication) ada di
 * balik tombol Detail; di desktop kartu selalu terbuka dan komponen ini tak tampil.
 *
 * Saat terbuka, kotak status disembunyikan — banner di dalam kartu sudah mengatakan hal yang
 * sama (dan membawa tombolnya), jadi mengulangnya di atas adalah duplikasi.
 */
export function OrderSummaryBar({ summary, expanded, onToggle, onExpand, onReschedule }: {
    summary: OrderSummary | null;
    expanded: boolean;
    onToggle: () => void;
    /** Untuk aksi `open_detail`: membuka (bukan membalik) kartu. */
    onExpand: () => void;
    onReschedule: () => void;
}) {
    const { t } = useLanguage();
    const tone = summary ? TONE[summary.tone] : null;

    let detailText: string | null = null;
    if (summary?.detail?.kind === 'dateRange') detailText = summary.detail.text;
    if (summary?.detail?.kind === 'payBefore') {
        const { deadline, cause } = summary.detail;
        const time = deadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: WIB }).replace(':', '.') + ' WIB';
        // Tenggat 'bill' bisa berhari-hari lagi — jam saja menyesatkan, jadi tanggalnya ikut.
        const when = cause === 'bill'
            ? `${deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: WIB })}, ${time}`
            : time;
        detailText = t('summaryPayBefore', { when });
    }

    const action = summary?.action ?? null;

    return (
        <div className="lg:hidden bg-white px-5 pt-3 pb-4 space-y-3">
            {summary && tone && !expanded && (
                <div className={`rounded-xl border px-3.5 py-3 ${tone.box}`}>
                    <div className="flex items-start gap-2.5">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug">{t(summary.titleKey)}</p>
                            {detailText && <p className="text-xs text-slate-600 mt-0.5">{detailText}</p>}
                            {summary.moreNeedAction > 0 && (
                                <p className="text-xs font-semibold text-amber-800 mt-1.5">
                                    {t('summaryMoreNeedAction', { count: String(summary.moreNeedAction) })}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2">
                {!expanded && action && (
                    <div className="flex-1 min-w-0 [&_button]:min-h-11 [&_button]:text-sm">
                        {action.kind === 'open_detail' ? (
                            <Button size="sm" onClick={onExpand} className={`${ctaButtonClass} ${ctaRoyal}`}>
                                {t('summaryActionFix')}
                            </Button>
                        ) : (
                            <OrderActionButton action={action} onReschedule={onReschedule} />
                        )}
                    </div>
                )}
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-sm font-semibold text-slate-600 hover:text-jfu-primary hover:bg-slate-50 transition-colors cursor-pointer ${
                        expanded || !action ? 'flex-1 border border-slate-200 bg-white' : ''
                    }`}
                >
                    {expanded ? t('orderDetailsHide') : t('orderDetailsShow')}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
            </div>
        </div>
    );
}
