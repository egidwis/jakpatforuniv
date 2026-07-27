import { ExternalLink, Eye } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { extendStatusLabelKey, extendStatusStyle } from '@/utils/extend-ui';
import { pickPublicationHighlight, type ScheduleCard } from './airingPeriods';

interface PublicationPhaseProps {
    cards: ScheduleCard[];
    pageInfo?: { views: number; slug: string | null };
}

/** Chip status heading Fase ③ — jadwal paling relevan (tayang > terjadwal
 * terdekat > selesai terakhir). `t` dioper sebagai parameter (pola yang sama
 * dengan `getReviewChip`) karena fungsi ini bukan komponen React — dipanggil
 * dari StatusPage sebelum render `<Phase>`. */
export function getPublicationChip(cards: ScheduleCard[], t: (key: TranslationKey) => string) {
    const picked = pickPublicationHighlight(cards);
    if (!picked) return null;
    const style = extendStatusStyle(picked.state);
    return (
        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            {t(extendStatusLabelKey(picked.state))}
        </span>
    );
}

function PublicationRow({ card }: { card: ScheduleCard }) {
    const { t } = useLanguage();
    const style = extendStatusStyle(card.publication.state);
    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-gray-400 shrink-0">#{card.ordinal}</span>
                {/* Dua baris, bukan satu: chip status memakan sisi kanan, jadi
                    di mobile keterangan jam tidak muat disandingkan. */}
                <span className="flex flex-col min-w-0">
                    <span className="text-[#1a1a1a] truncate">{card.dateRange}</span>
                    {card.dateRange !== '—' && (
                        <span className="text-[11px] text-gray-500">{t('airingStartTimeNote')}</span>
                    )}
                </span>
            </span>
            <span className={`flex items-center gap-1.5 text-xs font-semibold shrink-0 ${style.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                {t(extendStatusLabelKey(card.publication.state))}
            </span>
        </div>
    );
}

/**
 * Fase ③ — Penayangan: daftar ringkas status tayang tiap jadwal yang sudah
 * lunas (tanggal tayang) di atas — data paling spesifik ke order ini duluan
 * — Halaman Iklan (link + views, order-level, dipakai bersama seluruh
 * jadwal/extend) di bawahnya. Menggantikan sub-section Penayangan yang dulu
 * ada di tiap kartu Fase ② — dipisah supaya Fase ② bisa berhenti murni di
 * status pembayaran ("Lunas") tanpa ikut melompat ke status tayang.
 */
export function PublicationPhase({ cards, pageInfo }: PublicationPhaseProps) {
    const { t } = useLanguage();
    const paidCards = cards.filter((c) => c.booking.state === 'paid');

    if (!pageInfo?.slug && paidCards.length === 0) {
        return (
            <p className="text-sm text-gray-400 rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center">
                {t('publicationEmptyState')}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {paidCards.length > 0 && (
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                    {paidCards.map((card) => (
                        <PublicationRow key={card.key} card={card} />
                    ))}
                </div>
            )}
            {pageInfo?.slug && (
                <div className="flex items-center justify-between gap-2 px-0.5">
                    <a
                        href={`/pages/${pageInfo.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium text-jfu-primary hover:underline min-w-0"
                    >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{t('adPageLinkLabel')}</span>
                    </a>
                    {typeof pageInfo.views === 'number' && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-jfu-primary shrink-0">
                            <Eye className="w-3.5 h-3.5" />
                            {new Intl.NumberFormat('id-ID').format(pageInfo.views)} {t('viewsUnit')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
