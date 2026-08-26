import { ExternalLink, Eye, Sparkles, Lightbulb, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { extendStatusLabelKey, extendStatusStyle } from '@/utils/extend-ui';
import { publicPagePath } from '@/utils/page-url';
import { airingStartHourWib, pickPublicationHighlight, type ScheduleCard } from './airingPeriods';

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
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            {t(extendStatusLabelKey(picked.state))}
        </span>
    );
}

function PublicationRow({ card }: { card: ScheduleCard }) {
    const { t } = useLanguage();
    const style = extendStatusStyle(card.publication.state);
    const startHour = airingStartHourWib(card);
    return (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm bg-white hover:bg-slate-50/50 transition-colors">
            <span className="flex items-center gap-2 min-w-0">
                {/* Dua baris, bukan satu: chip status memakan sisi kanan, jadi
                    di mobile keterangan jam tidak muat disandingkan. */}
                <span className="flex flex-col min-w-0">
                    <span className="text-slate-900 font-semibold truncate text-xs sm:text-sm">{card.dateRange}</span>
                    {/* ⚠️ Dulu di sini ada konstanta "Mulai 15.00 WIB" — dan ia salah
                        untuk SELURUH order Kilat: gelombangnya 08/11/14/17, nol yang
                        tayang jam 15. Jamnya sekarang diturunkan dari instant jadwalnya
                        sendiri, dan Kilat yang gelombangnya belum ditetapkan tidak
                        menampilkan angka apa pun. */}
                    {startHour ? (
                        <span className="text-[11px] text-slate-500 font-medium">
                            {t('airingStartTimeAt', { time: startHour })}
                        </span>
                    ) : card.info.isKilat ? (
                        <span className="text-[11px] text-slate-500 font-medium italic">
                            {t('scheduleKilatHourPending')}
                        </span>
                    ) : null}
                </span>
            </span>
            <span className={`flex items-center gap-1.5 text-xs font-bold shrink-0 ${style.text}`}>
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
    const hasCompleted = paidCards.some((c) => c.publication.state === 'completed');
    const hasLiveOrScheduled = !hasCompleted && paidCards.some((c) => c.publication.state === 'live' || c.publication.state === 'scheduled');

    if (!pageInfo?.slug && paidCards.length === 0) {
        return (
            <p className="text-sm text-slate-400 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-3 py-4 text-center">
                {t('publicationEmptyState')}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {paidCards.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 divide-y divide-slate-100 overflow-hidden shadow-2xs">
                    {paidCards.map((card) => (
                        <PublicationRow key={card.key} card={card} />
                    ))}
                </div>
            )}

            {/* Hint saat survei sedang tayang / terjadwal */}
            {hasLiveOrScheduled && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 leading-relaxed shadow-2xs">
                    <Lightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                    <p>
                        Respon responden sedang dihimpun. Setelah selesai, Anda bisa langsung mengolah visualisasi &amp; draf laporan riset di{' '}
                        <Link to="/dashboard/analyzer" className="font-bold underline text-amber-950 hover:text-indigo-600">
                            Data Analyzer AI
                        </Link>.
                    </p>
                </div>
            )}

            {/* CTA Card saat survei selesai ditayangkan */}
            {hasCompleted && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/90 border border-indigo-100 text-xs shadow-2xs">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600 shrink-0 mt-0.5">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="font-bold text-indigo-950">Survei telah selesai ditayangkan?</p>
                            <p className="text-indigo-800/80 text-[11px] leading-relaxed mt-0.5">
                                Export CSV respon kuesioner Anda dan olah grafik, tabulasi silang, serta draf narasi riset dengan AI.
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/dashboard/analyzer/new"
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-xs active:scale-95"
                    >
                        <span>Olah Data</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            )}

            {pageInfo?.slug && (
                <div className="flex items-center justify-between gap-2 px-1">
                    <a
                        href={publicPagePath(pageInfo.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-jfu-primary hover:text-jfu-dark hover:underline min-w-0"
                    >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{t('adPageLinkLabel')}</span>
                    </a>
                    {typeof pageInfo.views === 'number' && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-jfu-primary shrink-0 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-full">
                            <Eye className="w-3.5 h-3.5" />
                            {new Intl.NumberFormat('id-ID').format(pageInfo.views)} {t('viewsUnit')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
