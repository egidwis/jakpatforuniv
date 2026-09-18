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
    isCancelled?: boolean;
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
                    <span className="text-slate-900 font-semibold truncate text-sm">{card.dateRange}</span>
                    {/* ⚠️ Dulu di sini ada konstanta "Mulai 15.00 WIB" — dan ia salah
                        untuk SELURUH order Kilat: gelombangnya 08/11/14/17, nol yang
                        tayang jam 15. Jamnya sekarang diturunkan dari instant jadwalnya
                        sendiri, dan Kilat yang gelombangnya belum ditetapkan tidak
                        menampilkan angka apa pun. */}
                    {startHour ? (
                        <span className="text-xs text-slate-500 font-medium">
                            {t('airingStartTimeAt', { time: startHour })}
                        </span>
                    ) : card.info.isKilat ? (
                        <span className="text-xs text-slate-500 font-medium italic">
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
 * Fase ③ — Penayangan:
 * 1. Halaman Iklan (link publik + views counter) di paling atas sebagai
 *    ringkasan kampanye publik yang live/selesai.
 * 2. Daftar ringkas status tayang tiap jadwal yang lunas (tanggal tayang).
 * 3. Hint informatif / CTA opsional olah data riset dengan AI.
 */
export function PublicationPhase({ cards, pageInfo, isCancelled }: PublicationPhaseProps) {
    const { t } = useLanguage();
    const paidCards = cards.filter((c) => c.booking.state === 'paid');
    const hasCompleted = paidCards.some((c) => c.publication.state === 'completed');
    const hasLive = paidCards.some((c) => c.publication.state === 'live');
    const hasScheduledOnly = !hasCompleted && !hasLive && paidCards.some((c) => c.publication.state === 'scheduled');

    if (!pageInfo?.slug && paidCards.length === 0) {
        return (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200/70 bg-slate-50/40 text-xs text-slate-400">
                <span>{isCancelled ? t('publicationCancelledNote') : t('publicationPendingActivation')}</span>
                <span className="text-[10px] font-semibold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full border border-slate-200/60">
                    {isCancelled ? t('reviewChipCancelled') : (cards.length === 0 ? t('publicationNotActive') : t('extStatusWaitingPayment'))}
                </span>
            </div>
        );
    }

    // Order Kilat tidak memakai halaman iklan publik, jadi blok tautan di bawah
    // tidak pernah punya isi untuknya — `pageInfo` sengaja dikosongkan di sumber
    // data (getSurveyPagesBySubmissionIds, "gerbang privasi"). Tanpa baris ini
    // Fase ③ Kilat menampilkan tanggal tayang tanpa keterangan apa pun, dan
    // peneliti wajar mengira halaman iklannya gagal terbit.
    //
    // ⚠️ Hanya tampil pada order Kilat LUNAS. Yang belum lunas punya
    // `paidCards.length === 0` dan `pageInfo` undefined, jadi ia sudah tertangkap
    // early-return di atas dengan teks `publicationPendingActivation` — yang
    // memang benar untuknya. Itu disengaja: menambahkan cabang Kilat ke sana
    // memaksa komponen ini tahu soal Kilat di dua tempat, dan peneliti yang
    // belum membayar belum perlu penjelasan jalur distribusi.
    const isKilatOrder = cards.some((c) => c.info.isKilat);

    return (
        <div className="space-y-3">
            {isKilatOrder && (
                <p className="px-1 text-xs leading-relaxed text-slate-500">
                    {t('publicationKilatNote')}
                </p>
            )}

            {/* 1. Halaman Iklan & Total Views (Paling Atas di Step 3) */}
            {pageInfo?.slug && (
                <div className="flex items-center justify-between gap-2 px-1">
                    <a
                        href={publicPagePath(pageInfo.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm font-semibold text-jfu-primary hover:text-jfu-dark hover:underline min-w-0"
                    >
                        <ExternalLink className="w-4 h-4 shrink-0" />
                        <span className="truncate">{t('adPageLinkLabel')}</span>
                    </a>
                    {typeof pageInfo.views === 'number' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-jfu-primary shrink-0 bg-blue-50 border border-blue-200/70 px-2.5 py-1 rounded-full">
                            <Eye className="w-3.5 h-3.5" />
                            {new Intl.NumberFormat('id-ID').format(pageInfo.views)} {t('viewsUnit')}
                        </span>
                    )}
                </div>
            )}

            {/* 2. Baris jadwal penayangan yang lunas */}
            {paidCards.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 divide-y divide-slate-100 overflow-hidden shadow-2xs">
                    {paidCards.map((card) => (
                        <PublicationRow key={card.key} card={card} />
                    ))}
                </div>
            )}

            {/* 3. Banner CTA saat survei terjadwal (menunggu waktu tayang) */}
            {hasScheduledOnly && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4 rounded-xl bg-blue-50/40 border border-blue-200/70 shadow-2xs hover:border-blue-300/80 transition-all">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-jfu-primary flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <p className="text-sm leading-snug">
                            <span className="font-bold text-slate-900">{t('publicationScheduledPrefix')}</span>{' '}
                            <span className="text-slate-600">{t('publicationScheduledHint')}</span>
                        </p>
                    </div>
                    <Link
                        to="/dashboard/analyzer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-blue-200/90 hover:border-blue-300 hover:bg-blue-50 text-jfu-primary font-bold text-sm shadow-2xs transition-all shrink-0 active:scale-95"
                    >
                        <span>{t('publicationScheduledCtaBtn')}</span>
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            )}

            {/* 4. Hint saat survei sedang tayang secara real-time */}
            {hasLive && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-blue-50/40 border border-blue-200/70 text-sm text-slate-700 leading-relaxed shadow-2xs">
                    <Lightbulb className="w-4 h-4 text-jfu-primary shrink-0" />
                    <p>
                        <span className="font-bold text-slate-900">{t('publicationLivePrefix')}</span>{' '}
                        <span className="text-slate-600">
                            {t('publicationLiveHint')}{' '}
                            <Link to="/dashboard/analyzer" className="font-bold underline text-jfu-primary hover:text-jfu-dark">
                                Data Analyzer AI
                            </Link>.
                        </span>
                    </p>
                </div>
            )}

            {/* 5. Area CTA opsional saat survei selesai ditayangkan */}
            {hasCompleted && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4 rounded-xl bg-blue-50/40 border border-blue-200/70 shadow-2xs hover:border-blue-300/80 transition-all">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-jfu-primary flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <p className="text-sm leading-snug">
                            <span className="font-bold text-slate-900">{t('publicationCompletedPrefix')}</span>{' '}
                            <span className="text-slate-600">{t('publicationCompletedHint')}</span>
                        </p>
                    </div>
                    <Link
                        to="/dashboard/analyzer/new"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-blue-200/90 hover:border-blue-300 hover:bg-blue-50 text-jfu-primary font-bold text-sm shadow-2xs transition-all shrink-0 active:scale-95"
                    >
                        <span>{t('publicationCtaBtn')}</span>
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            )}
        </div>
    );
}
