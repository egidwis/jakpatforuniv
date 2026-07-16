import { Link } from 'react-router-dom';
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    Clock,
    CreditCard,
    ExternalLink,
    FileText,
    Hourglass,
    PlayCircle,
    Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { useLanguage } from '../i18n/LanguageContext';
import { normalizeScheduleDate, type ExtendPaymentInfo } from './ProgressTracker';
import type { FormSubmission } from '@/utils/supabase';
import type { OrderUiState } from './status/deriveOrderUiState';

const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

const formatDate = (d: string) =>
    normalizeScheduleDate(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

interface NextStepCalloutProps {
    submission: FormSubmission;
    ui: OrderUiState;
    invoiceId?: string | null;
    extendPayments: Record<string, ExtendPaymentInfo>;
    onReschedule: () => void;
    onDelete: () => void;
}

/**
 * Elemen kunci kartu order: satu panel "apa yang terjadi sekarang & apa
 * langkah berikutnya" per state, dengan CTA-nya. Menjawab pertanyaan yang
 * biasanya ditanyakan ke admin (kapan tayang, status review, pembayaran).
 */
export function NextStepCallout({ submission, ui, invoiceId, extendPayments, onReschedule, onDelete }: NextStepCalloutProps) {
    const { t } = useLanguage();

    // Panel Soft DNA: tint sangat muda + border 1px senada yang samar.
    // Semantik tone tetap: payment/warning = amber, danger/revision = rose,
    // success = emerald, info = biru DNA.
    const tones = {
        info: 'border-jfu-primary/15 bg-jfu-primary/[0.04]',
        warning: 'border-amber-200 bg-amber-50/60',
        danger: 'border-rose-200 bg-rose-50/60',
        revision: 'border-rose-200 bg-rose-50/60',
        success: 'border-emerald-200 bg-emerald-50/50',
    } as const;

    const iconClasses = 'w-5 h-5 shrink-0 mt-0.5';

    let tone: keyof typeof tones = 'info';
    let icon = <Clock className={`${iconClasses} text-jfu-primary/70`} />;
    let body: React.ReactNode = null;
    let cta: React.ReactNode = null;

    const ctaButtonClass = 'w-full md:w-auto min-h-11 md:min-h-9 justify-center';
    // CTA primer DNA: pill gradient biru + glow (pola .btn-primary landing).
    const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';
    const ctaNavy = ctaRoyal;

    switch (ui.callout) {
        case 'revision':
            tone = 'revision';
            icon = <AlertCircle className={`${iconClasses} text-rose-600`} />;
            body = (
                <>
                    <p className="text-sm font-semibold text-[#1a1a1a]">{t('revisionNeededTitle')}</p>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                        {t('revisionNeededDescPart1')}{' '}
                        <a href="/homepage/terms-conditions.html" target="_blank" rel="noopener noreferrer" className="text-rose-700 underline hover:text-rose-800">
                            {t('termsConditions')}
                        </a>
                        {t('revisionNeededDescPart2')}
                    </p>
                    {submission.detected_keywords && submission.detected_keywords.length > 0 && (
                        <p className="text-xs text-rose-700 mt-2">
                            {t('calloutDetectedKeywords')} {submission.detected_keywords.join(', ')}
                        </p>
                    )}
                </>
            );
            cta = (
                <div className="flex flex-col md:flex-row gap-2 mt-3">
                    <Link to="/dashboard/submit-iklan" className="w-full md:w-auto">
                        <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal}`}>
                            {t('resubmit')}
                        </Button>
                    </Link>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={onDelete}
                        className={`${ctaButtonClass} rounded-full font-semibold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 gap-1.5`}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('delete')}
                    </Button>
                </div>
            );
            break;

        case 'review_manual':
            icon = <FileText className={`${iconClasses} text-jfu-primary/70`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutReviewManual')}</p>;
            break;

        case 'review_auto':
            icon = <Hourglass className={`${iconClasses} text-jfu-primary/70`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutReviewAuto')}</p>;
            break;

        case 'choose_schedule':
            tone = 'warning';
            icon = <CalendarClock className={`${iconClasses} text-amber-600`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutChooseSchedule')}</p>;
            cta = (
                <div className="mt-3">
                    <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                        {t('chooseSchedule')}
                    </Button>
                </div>
            );
            break;

        case 'payment': {
            tone = 'warning';
            icon = <CreditCard className={`${iconClasses} text-amber-600`} />;
            // Kejujuran deadline: jam hanya ditampilkan untuk slot user-booked
            // (slot_reserved_at + 1 jam). Order invoice-admin pakai kalimat generik.
            body = (
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
            );
            const isExternal = !!ui.finalPaymentLink && !ui.finalPaymentLink.startsWith('/dashboard');
            const label = (
                <>
                    <CreditCard className="w-4 h-4" />
                    {t('payNow')}
                    {submission.total_cost > 0 && ` — ${formatRupiah(submission.total_cost)}`}
                    {isExternal && <ExternalLink className="w-3.5 h-3.5 opacity-70" />}
                </>
            );
            cta = ui.finalPaymentLink ? (
                <div className="mt-3">
                    {isExternal ? (
                        <a href={ui.finalPaymentLink} target="_blank" rel="noopener noreferrer" className="block w-full md:w-auto md:inline-block">
                            <Button size="sm" className={`${ctaButtonClass} ${ctaNavy} gap-1.5`}>
                                {label}
                            </Button>
                        </a>
                    ) : (
                        <Link to={ui.finalPaymentLink} className="block w-full md:w-auto md:inline-block">
                            <Button size="sm" className={`${ctaButtonClass} ${ctaNavy} gap-1.5`}>
                                {label}
                            </Button>
                        </Link>
                    )}
                </div>
            ) : null;
            break;
        }

        case 'awaiting_invoice':
            icon = <Hourglass className={`${iconClasses} text-jfu-primary/70`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutAwaitingInvoice')}</p>;
            break;

        case 'expired':
            tone = 'danger';
            icon = <AlertCircle className={`${iconClasses} text-rose-600`} />;
            body = <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('calloutExpired')}</p>;
            cta = (
                <div className="mt-3">
                    <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                        {t('rescheduleSlot')}
                    </Button>
                </div>
            );
            break;

        case 'extend_payment':
            tone = 'warning';
            icon = <AlertCircle className={`${iconClasses} text-amber-600`} />;
            body = (
                <>
                    <p className="text-sm font-semibold text-[#1a1a1a]">{t('extendWaitingPaymentAlertTitle')}</p>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{t('extendWaitingPaymentAlert')}</p>
                </>
            );
            cta = (
                <div className="flex flex-col gap-2 mt-3">
                    {ui.eff.waitingPaymentExtends.map((ext) => {
                        const pay = ext.id ? extendPayments[ext.id] : null;
                        if (!pay?.paymentUrl) return null;
                        return (
                            <a key={ext.id} href={pay.paymentUrl} target="_blank" rel="noopener noreferrer" className="block w-full md:w-auto md:inline-block">
                                <Button size="sm" className={`${ctaButtonClass} ${ctaNavy} gap-1.5`}>
                                    <CreditCard className="w-4 h-4" />
                                    {t('payExtension')}
                                    {pay.amount > 0 && ` — ${formatRupiah(pay.amount)}`}
                                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                                </Button>
                            </a>
                        );
                    })}
                </div>
            );
            break;

        case 'ready_to_launch':
            tone = 'success';
            icon = <CheckCircle2 className={`${iconClasses} text-emerald-600`} />;
            body = (
                <p className="text-sm text-[#1a1a1a] leading-relaxed">
                    {t('calloutReadyPrefix')}{' '}
                    {ui.eff.activeStartDate && <strong>{formatDate(ui.eff.activeStartDate)}, 15:00 WIB</strong>}
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
                        {ui.eff.activeEndDate && <strong>{formatDate(ui.eff.activeEndDate)}</strong>}
                        {ui.eff.isExtended && ` (${t('extendedLabel')})`}.
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                        {t('respondentExpectation')}
                    </p>
                </>
            );
            if (invoiceId) {
                cta = (
                    <div className="mt-2">
                        <a
                            href={`/invoices/${invoiceId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-jfu-primary hover:text-jfu-dark underline"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            {t('viewInvoice')}
                        </a>
                    </div>
                );
            }
            break;

        case 'completed':
            tone = 'success';
            icon = <CheckCircle2 className={`${iconClasses} text-emerald-600`} />;
            body = (
                <p className="text-sm text-[#1a1a1a] leading-relaxed">
                    {t('calloutCompletedPrefix')}{' '}
                    {ui.eff.activeEndDate && <strong>{formatDate(ui.eff.activeEndDate)}</strong>}
                    . {t('calloutCompletedSuffix')}
                </p>
            );
            if (invoiceId) {
                cta = (
                    <div className="mt-3">
                        <a href={`/invoices/${invoiceId}`} target="_blank" rel="noopener noreferrer" className="block w-full md:w-auto md:inline-block">
                            <Button size="sm" variant="outline" className={`${ctaButtonClass} rounded-full font-semibold border border-jfu-primary/20 bg-white text-jfu-primary hover:bg-jfu-primary/[0.08] hover:text-jfu-primary gap-1.5`}>
                                <FileText className="w-4 h-4" />
                                {t('downloadReceipt')}
                            </Button>
                        </a>
                    </div>
                );
            }
            break;
    }

    return (
        <div className={`rounded-xl border p-4 ${tones[tone]}`}>
            <div className="flex gap-3">
                {icon}
                <div className="flex-1 min-w-0">
                    {body}
                    {cta}
                </div>
            </div>
        </div>
    );
}
