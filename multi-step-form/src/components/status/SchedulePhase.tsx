import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
    AlertCircle,
    CalendarCheck,
    CalendarClock,
    CalendarRange,
    ChevronDown,
    Clock,
    Copy,
    CreditCard,
    ExternalLink,
    FileText,
    Gift,
    Plus,
    RotateCcw,
    Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
} from '@/components/ui/accordion';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { extendStatusLabelKey, extendStatusStyle } from '@/utils/extend-ui';
import type { FormSubmission } from '@/utils/supabase';
import { calculateAdCostPerDay, calculateTotalAdCost, calculateDiscount, calculatePpn, getKilatAddonCost } from '@/utils/cost-calculator';
import {
    pickDefaultExpandedKey,
    type ScheduleCard,
    type IncentiveInfo,
} from './airingPeriods';
import { formatIDR } from '@/utils/currency';

const formatDateLong = (d: string) =>
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

interface SchedulePhaseProps {
    submission: FormSubmission;
    cards: ScheduleCard[];
    onReschedule: () => void;
    /** Fase ② sedang berjalan (`getActiveDashboardPhase(ui.currentStep) === 2`)
     * — kartu paling relevan (`pickDefaultExpandedKey`) default terbuka. Kalau
     * tidak, default semua tertutup; user tetap bisa expand manual. */
    active: boolean;
}

/** Label dishare dengan chip trigger (extend-ui) untuk state yang sama-sama
 * ada di enum shared — hanya choose_schedule/awaiting_invoice yang punya
 * kunci sendiri karena bukan bagian dari status extend/publikasi. */
function bookingStatusLabel(state: ScheduleCard['booking']['state'], t: (key: TranslationKey) => string): string {
    if (state === 'choose_schedule') return t('bookingStatusChooseSchedule');
    if (state === 'awaiting_invoice') return t('bookingStatusAwaitingInvoice');
    if (state === 'too_late_today') return t('bookingStatusTooLateToday');
    return t(extendStatusLabelKey(state));
}

/** Warna (bg+teks+dot) dishare dengan `extendStatusStyle` untuk state yang
 * overlap — dulu ada palet terpisah `BOOKING_STATUS_TONE` yang driftnya
 * nyata (mis. "Lunas" tampil emerald di baris Status tapi biru di chip
 * trigger untuk kartu yang sama). Hanya choose_schedule/awaiting_invoice/
 * too_late_today (di luar enum shared) yang dapat warna sendiri. */
function bookingStatusStyle(state: ScheduleCard['booking']['state']): { bg: string; text: string; dot: string } {
    if (state === 'choose_schedule') return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' };
    if (state === 'awaiting_invoice') return { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-500', dot: 'bg-gray-400' };
    if (state === 'too_late_today') return { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-600', dot: 'bg-rose-400' };
    return extendStatusStyle(state);
}

/** Chip status pembayaran di judul kartu — SELALU tampil (satu jadwal
 * maupun banyak), sama seperti chip "Disetujui" di Fase ①. Menggantikan
 * baris "Status" yang dulu ada di section Booking & Pembayaran, supaya
 * status cuma py satu rumah (chip), bukan dua yang berisiko drift. */
function ScheduleChip({ card }: { card: ScheduleCard }) {
    const { t } = useLanguage();
    if (card.booking.state === 'in_review') return null;
    const style = bookingStatusStyle(card.booking.state);
    return (
        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            {bookingStatusLabel(card.booking.state, t)}
        </span>
    );
}

/** Tombol salin Booking ID/ID perpanjangan — dirender TEPAT di samping teks
 * Booking ID di dalam trigger. Bukan `<button>` (elemen trigger accordion
 * sendiri sudah `<button>` sungguhan — nesting `<button>` di dalamnya
 * invalid HTML), tapi `<span role="button">` yang `stopPropagation()`
 * kliknya supaya tap-to-copy tidak ikut men-toggle accordion di baliknya. */
function CopyOrderIdButton({ id }: { id: string }) {
    const { t } = useLanguage();
    const copy = async (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(id);
            toast.success(t('orderIdCopied'));
        } catch {
            /* clipboard tidak tersedia — biarkan senyap */
        }
    };
    return (
        <span
            role="button"
            tabIndex={0}
            onClick={copy}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    copy(e);
                }
            }}
            title={id}
            aria-label={t('copyOrderId')}
            className="inline-flex shrink-0 p-1 -m-1 rounded-md text-gray-400 hover:text-jfu-primary hover:bg-jfu-primary/[0.06] transition-colors cursor-pointer"
        >
            <Copy className="w-3.5 h-3.5" />
        </span>
    );
}

/**
 * Warna kolom value (kanan). Kartu yang masih menunggu review diredam jadi
 * abu-abu bersama labelnya: angkanya memang sudah final sejak checkout, tapi
 * belum mengikat apa pun sampai admin menyetujui — jangan tampil setegas kartu
 * yang sudah berjalan. Dipakai di semua titik yang dulu hardcode `#1a1a1a`,
 * supaya tidak ada value yang ketinggalan hitam sendirian.
 */
const valueTone = (muted?: boolean) => (muted ? 'text-gray-400' : 'text-[#1a1a1a]');

interface RowDef {
    key: string;
    icon: ReactNode;
    label: string;
    value: ReactNode;
}

const formatDateFullMonth = (d: Date | null) => {
    if (!d) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateRangeClean = (start: Date | null, end: Date | null, fallback?: string) => {
    if (!start && !end) return fallback || '—';
    if (start && !end) return formatDateFullMonth(start);
    if (!start && end) return formatDateFullMonth(end);
    if (start && end) {
        if (start.getTime() === end.getTime()) {
            return formatDateFullMonth(start);
        }
        const sDay = start.getDate();
        const eDay = end.getDate();
        const sMonth = start.toLocaleDateString('id-ID', { month: 'long' });
        const eMonth = end.toLocaleDateString('id-ID', { month: 'long' });
        const sYear = start.getFullYear();
        const eYear = end.getFullYear();

        if (sYear === eYear && sMonth === eMonth) {
            return `${sDay} – ${eDay} ${sMonth} ${sYear}`;
        }
        if (sYear === eYear) {
            return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`;
        }
        return `${formatDateFullMonth(start)} – ${formatDateFullMonth(end)}`;
    }
    return fallback || '—';
};

/**
 * Baris data gaya kuitansi: SATU pasangan label:value per baris di semua
 * viewport. Kolom label adaptif di mobile dan fixed 9.5rem di desktop.
 */
function RowGrid({ rows, muted }: { rows: RowDef[]; muted?: boolean }) {
    if (rows.length === 0) return null;
    return (
        <dl className="[display:grid] grid-cols-[auto_1fr] sm:grid-cols-[9.5rem_1fr] gap-x-3 gap-y-2.5 items-start">
            {rows.map((row) => (
                <Fragment key={row.key}>
                    <dt className="flex items-center gap-1.5 text-xs text-[#888] whitespace-nowrap pt-0.5 pr-1">
                        <span className="text-gray-400 shrink-0">{row.icon}</span>
                        {row.label}
                    </dt>
                    <dd className={`text-sm font-medium min-w-0 break-words ${valueTone(muted)}`}>{row.value}</dd>
                </Fragment>
            ))}
        </dl>
    );
}

function Section({ label, sublabel, children }: { label: string; sublabel?: ReactNode; children?: ReactNode }) {
    return (
        <div>
            <div className="mb-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
                {sublabel && <p className="text-xs text-gray-400 font-normal mt-0.5">{sublabel}</p>}
            </div>
            {children}
        </div>
    );
}

function IncentiveValue({ info, muted }: { info: IncentiveInfo; muted?: boolean }) {
    const { t } = useLanguage();
    if (info.mode === 'plain') {
        const text = `${info.winnerCount} ${t('winner')} · ${formatIDR(info.prizePerWinner!)}/${t('winner')}`;
        return <span className={valueTone(muted)}>{text}</span>;
    }
    if (info.mode === 'new_pool') {
        const text = `${info.winnerCount} ${t('winner')} · ${formatIDR(info.prizePerWinner!)}/${t('winner')}`;
        return (
            <span className="inline-flex items-center gap-1">
                <span className={valueTone(muted)}>{text}</span>
                <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200 font-normal py-0">
                    {t('incentiveNewPeriod')}
                </Badge>
            </span>
        );
    }
    if (info.mode === 'accumulated') {
        return (
            <span className={`font-medium ${valueTone(muted)}`}>+{formatIDR(info.additionalPrize!)}</span>
        );
    }
    return <span className="text-xs text-gray-500 font-normal">{t('incentiveNoAdditionNote')}</span>;
}

const iconCls = 'w-3.5 h-3.5 text-gray-400 shrink-0';
const ctaButtonClass = 'max-md:w-full min-h-9 text-xs px-4 justify-center whitespace-nowrap';
const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';
const ctaSoftRose = 'rounded-full font-semibold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 shadow-sm transition-all gap-1.5';
const ctaSoftAmber = 'rounded-full font-semibold bg-white text-amber-700 border border-amber-300 hover:bg-amber-50 hover:text-amber-800 shadow-sm transition-all gap-1.5';

function InfoSection({ card, muted }: { card: ScheduleCard; muted?: boolean }) {
    const { t } = useLanguage();
    const rows: RowDef[] = [];

    const duration = card?.info?.duration || 1;
    const totalHours = duration * 24;
    const formattedRange = formatDateRangeClean(card?.startDate, card?.endDate, card?.dateRange);

    const airingValue = (
        <div>
            <div className={`font-semibold text-sm ${valueTone(muted)}`}>{formattedRange}</div>
            {card?.startDate && (
                <div className="text-xs text-gray-500 font-normal mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>Mulai <strong className="font-medium text-gray-700">15.00 WIB</strong></span>
                    <span className="text-gray-300">•</span>
                    <span>Durasi <strong className="font-medium text-gray-700">{duration} Hari ({totalHours} Jam)</strong></span>
                </div>
            )}
        </div>
    );

    rows.push({ key: 'airingDate', icon: <CalendarCheck className={iconCls} />, label: t('airingDateLabel'), value: airingValue });
    if (card?.info?.periodBatch) {
        rows.push({ key: 'batch', icon: <CalendarRange className={iconCls} />, label: t('periodBatchLabel'), value: <span className="font-mono text-xs">{card.info.periodBatch}</span> });
    }
    if (card?.info?.incentive) {
        rows.push({ key: 'prize', icon: <Gift className={iconCls} />, label: t('rewardRespondentLabel'), value: <IncentiveValue info={card.info.incentive} muted={muted} /> });
    }

    const sublabel = card?.info?.createdAt ? `${t('submittedOn')} ${formatDateLong(card.info.createdAt)}` : undefined;

    return (
        <Section label={t('sectionInfo')} sublabel={sublabel}>
            <RowGrid rows={rows} muted={muted} />
        </Section>
    );
}

function BookingSection({ card, submission, muted }: { card: ScheduleCard; submission: FormSubmission; muted?: boolean }) {
    const { t } = useLanguage();
    const b = card?.booking || {};
    const questionCount = submission?.question_count || 0;
    const duration = card?.info?.duration || submission?.duration || 0;
    const isKilat = submission?.distribution_type === 'kilat';
    const costPerDay = calculateAdCostPerDay(questionCount);
    const adCost = isKilat ? costPerDay : calculateTotalAdCost(questionCount, duration);
    const kilatAddon = isKilat ? getKilatAddonCost(submission?.voucher_code) : 0;

    let incentiveCost = 0;
    let winnerCount = submission?.winner_count || 0;
    let prizePerWinner = submission?.prize_per_winner || 0;
    if (card?.info?.incentive) {
        if (card.info.incentive.mode === 'plain' || card.info.incentive.mode === 'new_pool') {
            prizePerWinner = card.info.incentive.prizePerWinner || 0;
            winnerCount = card.info.incentive.winnerCount || 0;
            incentiveCost = prizePerWinner * winnerCount;
        } else if (card.info.incentive.mode === 'accumulated') {
            incentiveCost = card.info.incentive.additionalPrize || 0;
        }
    }

    const voucherCode = card?.info?.voucherCode || submission?.voucher_code;
    const discount = calculateDiscount(voucherCode, adCost, incentiveCost, duration);

    const subtotal = Math.max(0, adCost + kilatAddon - discount + incentiveCost);
    const ppn = calculatePpn(subtotal);
    const grandTotal = subtotal + ppn;

    return (
        <Section label={t('sectionBookingPayment')}>
            <div className={`rounded-xl border border-gray-200/80 bg-gray-50/60 p-3.5 space-y-2 text-xs ${muted ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-center">
                    <span className="text-gray-600">
                        {t('adCostLabel')} <span className="text-[11px] text-gray-400 font-normal">({questionCount} Qs | {formatIDR(costPerDay)}{isKilat ? ' rate' : ` × ${duration} hari`})</span>
                    </span>
                    <span className="font-medium text-gray-900">
                        {formatIDR(adCost)}
                    </span>
                </div>
                {kilatAddon > 0 && (
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600 flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> Add-on JFU Kilat
                        </span>
                        <span className="font-medium text-amber-600">{formatIDR(kilatAddon)}</span>
                    </div>
                )}
                {discount > 0 && (
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Diskon ({voucherCode})</span>
                        <span className="font-medium text-emerald-600">-{formatIDR(discount)}</span>
                    </div>
                )}
                {incentiveCost > 0 && (
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">
                            {t('totalRewardLabel')} {prizePerWinner > 0 && winnerCount > 0 && <span className="text-[11px] text-gray-400 font-normal">({formatIDR(prizePerWinner)} × {winnerCount} {t('winner')})</span>}
                        </span>
                        <span className="font-medium text-gray-900">{formatIDR(incentiveCost)}</span>
                    </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-gray-200/60 mt-1 text-gray-600">
                    <span>Subtotal (DPP)</span>
                    <span className="font-medium text-gray-900">{formatIDR(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-600">
                    <span>PPN (11%)</span>
                    <span className="font-medium text-gray-900">{formatIDR(ppn)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-1 text-sm">
                    <span className="text-[#1a1a1a] font-semibold">{t('totalPaymentLabel')}</span>
                    <span className="font-bold text-blue-600">{formatIDR(grandTotal)}</span>
                </div>

                {b.invoicePaymentId && b.state !== 'expired' && (
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200/60 mt-1 text-xs">
                        <span className="text-gray-500">{b.isPaidForLabel ? t('receiptRowLabel') : t('invoiceRowLabel')}</span>
                        <a
                            href={`/invoices/${b.invoicePaymentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            {b.isPaidForLabel ? t('viewReceiptLink') : t('viewInvoiceLink')}
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                    </div>
                )}
            </div>
        </Section>
    );
}

function ScheduleBanner({ card, onReschedule }: { card: ScheduleCard; onReschedule: () => void }) {
    const { t } = useLanguage();
    const b = card.booking;

    if (b.state === 'in_review') {
        return (
            <div className="rounded-xl border p-3.5 border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 leading-relaxed">
                    {t('scheduleEmptyPending')}
                </p>
            </div>
        );
    }
    if (b.state === 'awaiting_invoice') {
        return (
            <div className="rounded-xl border p-3.5 border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 leading-relaxed">
                    {card.kind === 'extend' ? t('calloutAwaitingInvoiceExtend') : t('calloutAwaitingInvoice')}
                </p>
            </div>
        );
    }
    if (b.state === 'choose_schedule') {
        return (
            <div className="rounded-xl border p-3.5 border-amber-200 bg-amber-50/60">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <CalendarClock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <p className="text-sm text-[#1a1a1a] leading-relaxed min-w-0">{t('calloutChooseSchedule')}</p>
                    </div>
                    <div className="shrink-0 max-md:w-full max-md:mt-1 md:ml-auto">
                        <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftAmber}`}>
                            <CalendarClock className="w-3.5 h-3.5" />
                            {t('chooseSchedule')}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }
    if (b.state === 'waiting_payment') {
        const isExternal = card.kind === 'original' ? b.isExternalLink : true;
        const payLabel = card.kind === 'extend' ? t('payExtension') : t('payNow');
        return (
            <div className="rounded-xl border p-3.5 border-amber-200 bg-amber-50/60">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <div className="min-w-0">
                            <p className="text-sm text-[#1a1a1a] leading-relaxed">
                                {b.deadline ? (
                                    <>
                                        {t('calloutPayBefore')}{' '}
                                        <strong>{b.deadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB</strong>{' '}
                                        {b.deadlineCause === 'cutoff'
                                            ? t('calloutPayBeforeSuffixCutoff')
                                            : t('calloutPayBeforeSuffix')}
                                    </>
                                ) : (
                                    t('calloutPaymentGeneric')
                                )}
                            </p>
                            <p className="text-xs text-gray-600 leading-relaxed mt-1">
                                {t('paymentQuotaPriorityNote')}
                            </p>
                        </div>
                    </div>
                    {b.payUrl && (
                        <div className="shrink-0 max-md:w-full max-md:mt-1 md:ml-auto">
                            {isExternal ? (
                                <a href={b.payUrl} target="_blank" rel="noopener noreferrer" className="block max-md:w-full md:inline-block">
                                    <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal} gap-1.5`}>
                                        <CreditCard className="w-3.5 h-3.5" />
                                        {payLabel}
                                        <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                                    </Button>
                                </a>
                            ) : (
                                <Link to={b.payUrl} className="block max-md:w-full md:inline-block">
                                    <Button size="sm" className={`${ctaButtonClass} ${ctaRoyal} gap-1.5`}>
                                        <CreditCard className="w-3.5 h-3.5" />
                                        {payLabel}
                                    </Button>
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (b.state === 'expired') {
        return (
            <div className="rounded-xl border p-3.5 border-rose-200 bg-rose-50/60">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <p className="text-sm text-[#1a1a1a] leading-relaxed min-w-0">
                            {card.kind === 'extend' ? t('extendExpiredHint') : t('calloutExpired')}
                        </p>
                    </div>
                    {card.kind === 'original' && (
                        <div className="shrink-0 max-md:w-full max-md:mt-1 md:ml-auto">
                            <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftRose}`}>
                                <RotateCcw className="w-3.5 h-3.5" />
                                {t('rescheduleSlot')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (b.state === 'too_late_today') {
        return (
            <div className="rounded-xl border p-3.5 border-rose-200 bg-rose-50/60">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <Clock className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <p className="text-sm text-[#1a1a1a] leading-relaxed min-w-0">{t('calloutTooLateToday')}</p>
                    </div>
                    {card.kind === 'original' && (
                        <div className="shrink-0 max-md:w-full max-md:mt-1 md:ml-auto">
                            <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftRose}`}>
                                <RotateCcw className="w-3.5 h-3.5" />
                                {t('rescheduleSlot')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    if (b.state === 'cancelled') {
        return (
            <div className="rounded-xl border p-3.5 border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 leading-relaxed">
                    {t('calloutCancelledSchedule')}
                </p>
            </div>
        );
    }
    return null;
}

/**
 * Fase ② — Jadwal Iklan: list kartu setara (asli + tiap perpanjangan), tiap
 * kartu membawa dua blok sendiri (Info Booking, Detail Pembayaran).
 */
export function SchedulePhase({ submission, cards, onReschedule, active }: SchedulePhaseProps) {
    const { t } = useLanguage();

    return (
        <div>
            {cards.length === 0 ? (
                /* Satu-satunya order tanpa kartu jadwal adalah yang ditolak —
                   order yang masih direview sudah punya kartunya sendiri
                   (Booking ID terbit sejak submit, lihat `buildScheduleCards`). */
                <p className="text-sm text-gray-400 rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center">
                    {t('scheduleEmptyRejected')}
                </p>
            ) : (
                <>
                    <Accordion
                        type="single"
                        collapsible
                        defaultValue={active ? pickDefaultExpandedKey(cards) : undefined}
                        className="rounded-xl border border-gray-100 divide-y divide-gray-100"
                    >
                        {cards.map((card) => {
                            const shortId = `#${card.info.id.slice(0, 8).toUpperCase()}`;
                            /* Booking ID diredam untuk kartu yang belum aktif
                               (review) maupun yang sudah mati (dibatalkan). */
                            const mutedId = card.booking.state === 'in_review' || card.booking.state === 'cancelled';
                            /* Isi kartu diredam KHUSUS saat masih review — lewat
                               `valueTone` per-value, bukan `opacity`/`grayscale` di
                               container: keduanya ikut memudarkan chip & aksen
                               Rupiah, dan `[&_*]:text-*` kalah/menang cascade tak
                               terduga lawan styles.css legacy. */
                            const pendingReview = card.booking.state === 'in_review';
                            return (
                            <AccordionItem key={card.key} value={card.key} className="border-b-0 px-3">
                                <AccordionPrimitive.Header className="flex items-center gap-1 [&[data-state=open]>svg]:rotate-180">
                                    <AccordionPrimitive.Trigger
                                        aria-label={`${card.label} Booking ID: ${shortId}`}
                                        className="flex flex-1 items-center gap-1 min-h-11 py-2.5 min-w-0 text-left font-medium transition-all"
                                    >
                                        {/* Tampilkan "Booking ID: #ID" pada tiap kartu */}
                                        <span className={`text-xs font-bold shrink-0 ${mutedId ? 'text-gray-400' : 'text-[#1a1a1a]'}`}>
                                            <span>Booking ID: </span>
                                            <span className="font-mono">{shortId}</span>
                                        </span>
                                        <CopyOrderIdButton id={card.info.id} />
                                        <span className="flex-1" />
                                        <ScheduleChip card={card} />
                                    </AccordionPrimitive.Trigger>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200" />
                                </AccordionPrimitive.Header>
                                <AccordionContent className="pb-3 pt-1.5 space-y-4">
                                    <ScheduleBanner card={card} onReschedule={onReschedule} />
                                    <InfoSection card={card} muted={pendingReview} />
                                    <BookingSection card={card} submission={submission} muted={pendingReview} />
                                </AccordionContent>
                            </AccordionItem>
                            );
                        })}
                    </Accordion>
                    <div className="mt-2.5">
                        <Button
                            variant="outline"
                            onClick={() => toast.info(t('extendScheduleComingSoon'))}
                            className="w-full text-xs font-semibold text-gray-500 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-100/80 hover:border-gray-400 hover:text-gray-600 rounded-xl min-h-10 px-3.5 gap-2 transition-all shadow-none justify-center"
                        >
                            <Plus className="w-4 h-4 shrink-0 text-gray-400" />
                            <span>{t('scheduleAdAgain')}</span>
                            <span className="text-[10px] font-medium text-gray-500 bg-gray-200/60 border border-gray-300/60 px-2 py-0.5 rounded-full ml-1 shrink-0">
                                {t('comingSoonBadge')}
                            </span>
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
