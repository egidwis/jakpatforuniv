import { Link } from 'react-router-dom';
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    CreditCard,
    ExternalLink,
    FileText,
    Hourglass,
    PlayCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { normalizeScheduleDate } from '../ProgressTracker';
import type { FormSubmission } from '@/utils/supabase';
import type { OrderUiState } from './deriveOrderUiState';
import type { OriginalPanelState } from './airingPeriods';

const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

const formatDate = (d: string) =>
    normalizeScheduleDate(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

interface PeriodActionPanelProps {
    state: OriginalPanelState;
    submission: FormSubmission;
    ui: OrderUiState;
    onReschedule: () => void;
}

/**
 * Panel "sekarang gimana & apa langkah berikutnya" milik PERIODE ASLI —
 * eks-NextStepCallout yang melebur ke dalam baris periode (di atas stepper).
 * Tanggal yang dipakai selalu tanggal periode asli, bukan tanggal efektif
 * perpanjangan. State revisi TIDAK di sini (banner card-level RevisionNotice).
 */
export function PeriodActionPanel({ state, submission, ui, onReschedule }: PeriodActionPanelProps) {
    const { t } = useLanguage();

    // Panel Soft DNA: tint sangat muda + border 1px senada yang samar.
    const tones = {
        info: 'border-jfu-primary/15 bg-jfu-primary/[0.04]',
        warning: 'border-amber-200 bg-amber-50/60',
        danger: 'border-rose-200 bg-rose-50/60',
        success: 'border-emerald-200 bg-emerald-50/50',
    } as const;

    const iconClasses = 'w-5 h-5 shrink-0 mt-0.5';

    let tone: keyof typeof tones = 'info';
    let icon = <Hourglass className={`${iconClasses} text-jfu-primary/70`} />;
    let body: React.ReactNode = null;
    let cta: React.ReactNode = null;

    // max-md:w-full (bukan `w-full md:w-auto`): legacy styles.css punya .w-full
    // sendiri yang dimuat setelah Tailwind — varian max-* aman dari cascade itu.
    const ctaButtonClass = 'max-md:w-full min-h-11 md:min-h-9 justify-center whitespace-nowrap';
    const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';

    switch (state) {
        case 'review_manual':
            icon = <FileText className={`${iconClasses} text-jfu-primary/70`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutReviewManual')}</p>;
            break;

        case 'review_auto':
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutReviewAuto')}</p>;
            break;

        case 'choose_schedule':
            tone = 'warning';
            icon = <CalendarClock className={`${iconClasses} text-amber-600`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutChooseSchedule')}</p>;
            cta = (
                <div className="max-md:mt-3">
                    <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                        {t('chooseSchedule')}
                    </Button>
                </div>
            );
            break;

        case 'payment': {
            tone = 'warning';
            icon = <CreditCard className={`${iconClasses} text-amber-600`} />;
            // Kejujuran deadline: jam hanya untuk slot user-booked (slot_reserved_at + 1 jam)
            body = (
                <>
                    <p className="text-sm text-[#1a1a1a] leading-relaxed">
                        {ui.paymentDeadline ? (
                            <>
                                {t('calloutPayBefore')}{' '}
                                <strong>
                                    {ui.paymentDeadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                </strong>{' '}
                                {t('calloutPayBeforeSuffix')}
                            </>
                        ) : (
                            t('calloutPaymentGeneric')
                        )}
                    </p>
                    {submission.total_cost > 0 && (
                        <p className="text-sm font-bold text-[#1a1a1a] mt-1">{formatRupiah(submission.total_cost)}</p>
                    )}
                </>
            );
            const isExternal = !!ui.finalPaymentLink && !ui.finalPaymentLink.startsWith('/dashboard');
            const label = (
                <>
                    <CreditCard className="w-4 h-4" />
                    {t('payNow')}
                    {isExternal && <ExternalLink className="w-3.5 h-3.5 opacity-70" />}
                </>
            );
            cta = ui.finalPaymentLink ? (
                <div className="max-md:mt-3">
                    {isExternal ? (
                        <a href={ui.finalPaymentLink} target="_blank" rel="noopener noreferrer" className="block max-md:w-full md:inline-block">
                            <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal} gap-1.5`}>
                                {label}
                            </Button>
                        </a>
                    ) : (
                        <Link to={ui.finalPaymentLink} className="block max-md:w-full md:inline-block">
                            <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal} gap-1.5`}>
                                {label}
                            </Button>
                        </Link>
                    )}
                </div>
            ) : null;
            break;
        }

        case 'awaiting_invoice':
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutAwaitingInvoice')}</p>;
            break;

        case 'expired':
            tone = 'danger';
            icon = <AlertCircle className={`${iconClasses} text-rose-600`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutExpired')}</p>;
            cta = (
                <div className="max-md:mt-3">
                    <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                        {t('rescheduleSlot')}
                    </Button>
                </div>
            );
            break;

        case 'ready_to_launch':
            tone = 'success';
            icon = <CheckCircle2 className={`${iconClasses} text-emerald-600`} />;
            body = (
                <p className="text-sm text-[#1a1a1a] leading-relaxed">
                    {t('calloutReadyPrefix')}{' '}
                    {submission.start_date && <strong>{formatDate(submission.start_date)}, 15:00 WIB</strong>}
                    .
                </p>
            );
            break;

        case 'live':
            tone = 'success';
            icon = <PlayCircle className={`${iconClasses} text-emerald-600`} />;
            body = (
                <>
                    <p className="text-sm text-[#1a1a1a] leading-relaxed">
                        {t('calloutLivePrefix')}{' '}
                        {submission.end_date && <strong>{formatDate(submission.end_date)}</strong>}
                        .
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                        {t('respondentExpectation')}
                    </p>
                </>
            );
            break;

        case 'completed':
            tone = 'success';
            icon = <CheckCircle2 className={`${iconClasses} text-emerald-600`} />;
            body = (
                <p className="text-sm text-[#1a1a1a] leading-relaxed">
                    {t('calloutCompletedPrefix')}{' '}
                    {submission.end_date && <strong>{formatDate(submission.end_date)}</strong>}
                    . {t('calloutCompletedSuffix')}
                </p>
            );
            break;
    }

    return (
        <div className={`rounded-xl border p-4 mb-3 ${tones[tone]}`}>
            <div className="flex gap-3">
                {icon}
                {/* Desktop: pesan kiri + CTA kanan; mobile: bertumpuk full-width */}
                <div className="flex-1 min-w-0 md:flex md:items-center md:justify-between md:gap-4">
                    <div className="min-w-0 md:flex-1">{body}</div>
                    {cta && <div className="shrink-0">{cta}</div>}
                </div>
            </div>
        </div>
    );
}
