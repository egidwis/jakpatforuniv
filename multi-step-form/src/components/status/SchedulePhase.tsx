import { Fragment, useState, type ReactNode } from 'react';
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
import { calculateAdCostPerDay, calculateTotalAdCost, calculateDiscount, calculatePpn, getKilatAddonCost, voucherInstantOf } from '@/utils/cost-calculator';
import {
    pickDefaultExpandedKey,
    fmtShort,
    type ScheduleCard,
    type IncentiveInfo,
} from './airingPeriods';
import { formatIDR } from '@/utils/currency';

const WIB = 'Asia/Jakarta';

const formatDateLong = (d: string) =>
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: WIB });

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
    if (state === 'choose_schedule') return { bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-800', dot: 'bg-amber-500' };
    if (state === 'awaiting_invoice') return { bg: 'bg-slate-100 border-slate-200/80', text: 'text-slate-600', dot: 'bg-slate-400' };
    if (state === 'too_late_today') return { bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-700', dot: 'bg-rose-500' };
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
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${style.bg} ${style.text}`}>
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
const valueTone = (muted?: boolean) => (muted ? 'text-slate-400' : 'text-slate-900');

interface RowDef {
    key: string;
    icon: ReactNode;
    label: string;
    value: ReactNode;
}

const formatWithWeekday = (d: Date | null, withYear = true) => {
    if (!d) return '';
    const weekday = d.toLocaleDateString('id-ID', { timeZone: WIB, weekday: 'short' });
    const day = d.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric' });
    const month = d.toLocaleDateString('id-ID', { timeZone: WIB, month: 'long' });
    const year = d.toLocaleDateString('id-ID', { timeZone: WIB, year: 'numeric' });
    return withYear ? `${weekday}, ${day} ${month} ${year}` : `${weekday}, ${day} ${month}`;
};

const formatDateRangeClean = (start: Date | null, end: Date | null, fallback?: string) => {
    if (!start && !end) return fallback || '—';
    if (start && !end) return formatWithWeekday(start, true);
    if (!start && end) return formatWithWeekday(end, true);
    if (start && end) {
        if (start.getTime() === end.getTime()) {
            return formatWithWeekday(start, true);
        }
        const sYear = start.toLocaleDateString('id-ID', { timeZone: WIB, year: 'numeric' });
        const eYear = end.toLocaleDateString('id-ID', { timeZone: WIB, year: 'numeric' });

        if (sYear === eYear) {
            return `${formatWithWeekday(start, false)} – ${formatWithWeekday(end, true)}`;
        }
        return `${formatWithWeekday(start, true)} – ${formatWithWeekday(end, true)}`;
    }
    return fallback || '—';
};

const formatPeriodBatch = (batch: string) => {
    const parts = batch.split('-');
    if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
            const d = new Date(year, month - 1, 1);
            return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        }
    }
    return batch;
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
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500 font-medium whitespace-nowrap pt-0.5 pr-1">
                        <span className="text-slate-400 shrink-0">{row.icon}</span>
                        {row.label}
                    </dt>
                    <dd className={`text-sm font-semibold min-w-0 break-words ${valueTone(muted)}`}>{row.value}</dd>
                </Fragment>
            ))}
        </dl>
    );
}

function Section({ label, sublabel, children }: { label: string; sublabel?: ReactNode; children?: ReactNode }) {
    return (
        <div>
            <div className="mb-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                {sublabel && <p className="text-xs text-slate-500 font-normal mt-0.5">{sublabel}</p>}
            </div>
            {children}
        </div>
    );
}

function IncentiveValue({ info, muted }: { info: IncentiveInfo; muted?: boolean }) {
    const { t } = useLanguage();
    if (info.mode === 'plain') {
        const text = `@${formatIDR(info.prizePerWinner!)} · ${info.winnerCount} ${t('winner')}`;
        return <span className={valueTone(muted)}>{text}</span>;
    }
    if (info.mode === 'new_pool') {
        const text = `@${formatIDR(info.prizePerWinner!)} · ${info.winnerCount} ${t('winner')}`;
        return (
            <span className="inline-flex items-center gap-1.5">
                <span className={valueTone(muted)}>{text}</span>
                <Badge variant="outline" className="text-[10px] text-amber-800 bg-amber-50 border-amber-200/80 font-bold py-0">
                    {t('incentiveNewPeriod')}
                </Badge>
            </span>
        );
    }
    if (info.mode === 'accumulated') {
        return (
            <span className={`font-semibold ${valueTone(muted)}`}>+{formatIDR(info.additionalPrize!)}</span>
        );
    }
    return <span className="text-xs text-slate-500 font-normal">{t('incentiveNoAdditionNote')}</span>;
}

const iconCls = 'w-3.5 h-3.5 text-slate-400 shrink-0';
const ctaButtonClass = 'max-md:w-full min-h-9 text-xs px-4 justify-center whitespace-nowrap';
const ctaRoyal = 'rounded-full font-bold text-white bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary shadow-xs hover:shadow transition-all';
const ctaSoftRose = 'rounded-full font-semibold bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 shadow-2xs transition-all gap-1.5';
const ctaSoftAmber = 'rounded-full font-semibold bg-white text-amber-800 border border-amber-300 hover:bg-amber-50 shadow-2xs transition-all gap-1.5';

function InfoSection({ card, submission, muted }: { card: ScheduleCard; submission: FormSubmission; muted?: boolean }) {
    const { t } = useLanguage();
    const [showBreakdown, setShowBreakdown] = useState(false);
    const rows: RowDef[] = [];
    const bState = card?.booking?.state;
    const b = card?.booking || {};

    // Panjang tayang diturunkan dari rentang tanggalnya (akhir-eksklusif), BUKAN dari
    // kolom `duration` — keduanya bisa berbeda, dan yang salah adalah kolomnya. Baris
    // ini bersebelahan langsung dengan `formattedRange`, jadi memakai kolom mentah
    // berarti memajang dua angka yang saling menyangkal di satu baris.
    // Cadangan ke `duration` hanya untuk jadwal yang belum bertanggal sama sekali.
    const duration = card?.info?.airingDays || card?.info?.duration || 1;
    const totalHours = duration * 24;
    const formattedRange = formatDateRangeClean(card?.startDate, card?.endDate, card?.dateRange);
    const startTimeWib = card?.startDate
        ? card.startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: WIB }).replace(':', '.')
        : '15.00';

    let airingValue: ReactNode;
    if (bState === 'expired') {
        airingValue = (
            <span className="text-rose-600/90 font-medium text-xs sm:text-sm">
                {t('scheduleSlotReleased')}
            </span>
        );
    } else if (bState === 'too_late_today') {
        airingValue = (
            <span className="text-rose-600/90 font-medium text-xs sm:text-sm">
                {t('scheduleTooLate')}
            </span>
        );
    } else if (bState === 'in_review') {
        airingValue = (
            <span className="text-gray-400 font-normal text-xs sm:text-sm">
                {t('schedulePendingReview')}
            </span>
        );
    } else if (bState === 'choose_schedule') {
        airingValue = (
            <span className="text-gray-400 font-normal text-xs sm:text-sm">
                {t('scheduleNotYetChosen')}
            </span>
        );
    } else if (bState === 'cancelled') {
        airingValue = (
            <span className="text-gray-400 font-normal text-xs sm:text-sm">
                {t('scheduleCancelled')}
            </span>
        );
    } else {
        airingValue = (
            <div>
                <div className={`font-semibold text-sm ${valueTone(muted)}`}>{formattedRange}</div>
                {card?.startDate && (
                    <div className="text-xs text-gray-500 font-normal mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>Mulai <strong className="font-medium text-gray-700">{startTimeWib} WIB</strong></span>
                        <span className="text-gray-300">•</span>
                        <span>Durasi <strong className="font-medium text-gray-700">{duration} Hari ({totalHours} Jam)</strong></span>
                    </div>
                )}
            </div>
        );
    }

    rows.push({ key: 'airingDate', icon: <CalendarCheck className={iconCls} />, label: t('airingDateLabel'), value: airingValue });
    if (card?.info?.incentive) {
        rows.push({ key: 'prize', icon: <Gift className={iconCls} />, label: t('rewardRespondentLabel'), value: <IncentiveValue info={card.info.incentive} muted={muted} /> });
    }

    const hasValidDate = bState !== 'expired' && bState !== 'too_late_today' && bState !== 'in_review' && bState !== 'choose_schedule' && bState !== 'cancelled';
    const batchValue = hasValidDate && card?.info?.periodBatch
        ? <span className={valueTone(muted)}>{formatPeriodBatch(card.info.periodBatch)}</span>
        : <span className="text-gray-400 font-normal text-xs sm:text-sm">{t('periodAwaitingSchedule')}</span>;

    rows.push({ key: 'batch', icon: <CalendarRange className={iconCls} />, label: t('periodBatchLabel'), value: batchValue });

    // Payment calculations
    const questionCount = submission?.question_count || 0;
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
    const discount = calculateDiscount(
        voucherCode, adCost, incentiveCost, duration, voucherInstantOf(submission?.created_at),
    );

    const subtotal = Math.max(0, adCost + kilatAddon - discount + incentiveCost);
    const ppn = calculatePpn(subtotal);
    const grandTotal = subtotal + ppn;

    // Total Payment Row with expandable breakdown
    const totalPaymentValue = (
        <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-bold text-sm ${muted ? 'text-slate-400' : 'text-jfu-primary'}`}>
                    {formatIDR(grandTotal)}
                </span>
                <button
                    type="button"
                    onClick={() => setShowBreakdown((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-jfu-primary transition-colors py-0.5 px-1.5 rounded-md hover:bg-slate-100/80 cursor-pointer"
                >
                    <span>{showBreakdown ? t('hideCostBreakdown') : t('viewCostBreakdown')}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
                </button>
            </div>
            {showBreakdown && (
                <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 space-y-2 text-xs font-normal text-slate-600">
                    <div className="flex justify-between items-center">
                        <span>
                            {t('adCostLabel')}{' '}
                            <span className="text-[11px] text-slate-400 font-normal">
                                ({questionCount} Qs | {formatIDR(costPerDay)}{isKilat ? ' rate' : ` × ${duration} hari`})
                            </span>
                        </span>
                        <span className="font-semibold text-slate-900">{formatIDR(adCost)}</span>
                    </div>
                    {kilatAddon > 0 && (
                        <div className="flex justify-between items-center">
                            <span className="flex items-center gap-1">
                                <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> Add-on JFU Kilat
                            </span>
                            <span className="font-semibold text-amber-600">{formatIDR(kilatAddon)}</span>
                        </div>
                    )}
                    {discount > 0 && (
                        <div className="flex justify-between items-center">
                            <span>Diskon ({voucherCode})</span>
                            <span className="font-semibold text-emerald-600">-{formatIDR(discount)}</span>
                        </div>
                    )}
                    {incentiveCost > 0 && (
                        <div className="flex justify-between items-center">
                            <span>
                                {t('totalRewardLabel')}{' '}
                                {prizePerWinner > 0 && winnerCount > 0 && (
                                    <span className="text-[11px] text-slate-400 font-normal">
                                        ({formatIDR(prizePerWinner)} × {winnerCount} {t('winner')})
                                    </span>
                                )}
                            </span>
                            <span className="font-semibold text-slate-900">{formatIDR(incentiveCost)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/80">
                        <span>Subtotal (DPP)</span>
                        <span className="font-semibold text-slate-900">{formatIDR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span>PPN (11%)</span>
                        <span className="font-semibold text-slate-900">{formatIDR(ppn)}</span>
                    </div>
                </div>
            )}
        </div>
    );

    rows.push({
        key: 'totalPayment',
        icon: <CreditCard className={iconCls} />,
        label: t('totalPaymentLabel'),
        value: totalPaymentValue,
    });

    // Invoice / Receipt Row
    let invoiceValue: ReactNode;
    if (b.isPaidForLabel && b.invoicePaymentId) {
        invoiceValue = (
            <a
                href={`/invoices/${b.invoicePaymentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-jfu-primary hover:text-jfu-dark hover:underline inline-flex items-center gap-1"
            >
                <FileText className="w-3.5 h-3.5" />
                {t('viewReceiptLink')}
                <ExternalLink className="w-3 h-3 ml-0.5" />
            </a>
        );
    } else if (b.state === 'waiting_payment' && b.invoicePaymentId) {
        invoiceValue = (
            <a
                href={`/invoices/${b.invoicePaymentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-jfu-primary hover:text-jfu-dark hover:underline inline-flex items-center gap-1"
            >
                <FileText className="w-3.5 h-3.5" />
                {t('viewInvoiceLink')}
                <ExternalLink className="w-3 h-3 ml-0.5" />
            </a>
        );
    } else if (b.state === 'expired') {
        invoiceValue = <span className="text-rose-600 italic font-medium text-xs sm:text-sm">{t('invoiceExpired')}</span>;
    } else if (b.state === 'too_late_today') {
        invoiceValue = <span className="text-rose-600 italic font-medium text-xs sm:text-sm">{t('invoicePaymentClosedToday')}</span>;
    } else if (b.state === 'choose_schedule') {
        invoiceValue = <span className="text-slate-400 italic font-normal text-xs sm:text-sm">{t('invoiceAwaitingSchedule')}</span>;
    } else if (b.state === 'cancelled') {
        invoiceValue = <span className="text-slate-400 italic font-normal text-xs sm:text-sm">{t('invoiceCancelled')}</span>;
    } else {
        invoiceValue = <span className="text-slate-400 italic font-normal text-xs sm:text-sm">{t('invoiceAwaitingIssue')}</span>;
    }

    rows.push({
        key: 'invoice',
        icon: <FileText className={iconCls} />,
        label: b.isPaidForLabel ? t('receiptRowLabel') : t('invoiceRowLabel'),
        value: invoiceValue,
    });

    const sublabel = card?.info?.createdAt ? `${t('submittedOn')} ${formatDateLong(card.info.createdAt)}` : undefined;

    return (
        <Section label={t('sectionInfo')} sublabel={sublabel}>
            <RowGrid rows={rows} muted={muted} />
        </Section>
    );
}

function ScheduleBanner({ card, onReschedule }: { card: ScheduleCard; onReschedule: () => void }) {
    const { t } = useLanguage();
    const b = card.booking;

    if (b.state === 'in_review') {
        return (
            <div className="rounded-xl border p-3.5 border-slate-200/80 bg-slate-50/80">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                    {t('scheduleEmptyPending')}
                </p>
            </div>
        );
    }
    if (b.state === 'awaiting_invoice') {
        /*
          ⚠️ JELASKAN KENAPA, JANGAN CUMA MENYEMBUNYIKAN TOMBOLNYA.
          Kalau jadwal ini dipindah sesudah tagihannya terbit, tagihan lama
          berhenti berlaku (sql/60) dan yang baru belum ada. Tanpa keterangan
          ini peneliti hanya melihat tombol bayarnya lenyap — dan tidak ada
          apa pun di layar yang memberi tahu ia harus menunggu tagihan baru,
          apalagi bahwa link lama di emailnya tidak boleh dibayar.
          Tanggal lamanya DISEBUT supaya ia bisa mencocokkan sendiri dengan
          email tagihan yang sudah terlanjur diterima.
        */
        if (b.staleBilledFor) {
            return (
                <div className="rounded-xl border p-3.5 border-amber-200/80 bg-amber-50/70">
                    <div className="flex items-start gap-2.5">
                        <CalendarClock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <div className="min-w-0 space-y-1">
                            <p className="text-sm font-bold text-slate-900 leading-snug">
                                Tagihan lama sudah tidak berlaku
                            </p>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Tagihan sebelumnya diterbitkan untuk jadwal{' '}
                                <strong className="font-semibold text-slate-900">
                                    {fmtShort(b.staleBilledFor)}
                                </strong>
                                , sedangkan jadwal kamu sekarang{' '}
                                <strong className="font-semibold text-slate-900">{card.dateRange}</strong>.
                                Karena tanggalnya berubah, tagihan itu dibatalkan otomatis.
                            </p>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                <strong className="font-semibold text-slate-900">Jangan bayar link lama</strong>{' '}
                                yang mungkin sudah kamu terima — pembayarannya tidak akan
                                dihitung untuk jadwal baru ini. Tim kami akan menerbitkan
                                tagihan pengganti sesuai tanggal barunya.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className="rounded-xl border p-3.5 border-slate-200/80 bg-slate-50/80">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                    {card.kind === 'extend' ? t('calloutAwaitingInvoiceSchedule') : t('calloutAwaitingInvoice')}
                </p>
            </div>
        );
    }
    if (b.state === 'choose_schedule') {
        return (
            <div className="rounded-xl border p-3.5 sm:p-4 border-amber-200/80 bg-amber-50/70 shadow-2xs">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <CalendarClock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug">{t('bannerTitleChooseSchedule')}</p>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{t('bannerSubChooseSchedule')}</p>
                        </div>
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
        const payLabel = t('payNow');
        const deadlineTime = b.deadline
            ? b.deadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'
            : null;
        const bannerTitle = deadlineTime
            ? `${t('bannerTitleWaitingPayment')} (${deadlineTime})`
            : t('bannerTitleWaitingPayment');
        /*
          ⚠️ AKIBAT TENGGATNYA BEDA, JADI KALIMATNYA HARUS BEDA.
          `deadlineCause` sudah dihitung sejak lama tapi tidak pernah dirender,
          jadi satu kalimat dipakai untuk ketiga keadaan — dan ia hanya benar
          untuk salah satunya:
            'slot'   -> reservasi peneliti sendiri, lepas 1 jam. Benar.
            'cutoff' -> slot milik peneliti yang TIDAK punya tenggat lepas:
                        `slot_reserved_at` NULL/rusak, jadi `slotReleaseDeadline`
                        null dan slotnya tidak pernah lepas sendiri. Batas yang
                        tersisa cuma 14.00 WIB, dan itu tidak melepas slot — yang
                        habis adalah waktu kami menyiapkan halaman iklan.
                        BUKAN "dipesan lewat jam 13.00": pemesanan hari-H sudah
                        ditutup 13.00, jadi hold 1 jam selalu tiba lebih dulu.
            null     -> slot dipesan admin, atau jadwal ke-2 dst. `deadline`
                        sengaja dikosongkan di `deriveOrderUiState`: pelepasannya
                        MANUAL lewat dashboard admin, jadi tidak ada jam yang
                        jujur bisa disebut. Yang benar adalah alasannya —
                        slotnya terbatas dan bisa habis.
        */
        const deadlineSubKey = b.deadlineCause === 'slot'
            ? 'bannerSubWaitingPaymentSlot'
            : b.deadlineCause === 'cutoff'
                ? 'bannerSubWaitingPaymentCutoff'
                : 'bannerSubWaitingPaymentSlotsLimited';

        return (
            <div className="rounded-xl border p-3.5 sm:p-4 border-amber-200/80 bg-amber-50/70 shadow-2xs">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug">{bannerTitle}</p>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{t(deadlineSubKey)}</p>
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
            <div className="rounded-xl border p-3.5 sm:p-4 border-rose-200/80 bg-rose-50/70 shadow-2xs">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug">{t('bannerTitleExpired')}</p>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                                {card.kind === 'extend' ? t('scheduleExpiredHint') : t('bannerSubExpired')}
                            </p>
                        </div>
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
            <div className="rounded-xl border p-3.5 sm:p-4 border-rose-200/80 bg-rose-50/70 shadow-2xs">
                <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <Clock className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug">{t('bannerTitleTooLateToday')}</p>
                            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{t('bannerSubTooLateToday')}</p>
                        </div>
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
            <div className="rounded-xl border p-3.5 border-slate-200/80 bg-slate-50/80">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
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
                <p className="text-sm text-slate-400 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center">
                    {t('scheduleEmptyRejected')}
                </p>
            ) : (
                <>
                    <Accordion
                        type="single"
                        collapsible
                        defaultValue={active ? pickDefaultExpandedKey(cards) : undefined}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/40 divide-y divide-slate-100 overflow-hidden shadow-2xs"
                    >
                        {cards.map((card) => {
                            const shortId = `#${card.info.bookingId}`;
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
                            <AccordionItem key={card.key} value={card.key} className="border-b-0 px-3.5">
                                <AccordionPrimitive.Header className="flex items-center gap-1 [&[data-state=open]>svg]:rotate-180">
                                    <AccordionPrimitive.Trigger
                                        aria-label={`${card.label} Booking ID: ${shortId}`}
                                        className="flex flex-1 items-center gap-1.5 min-h-11 py-2.5 min-w-0 text-left font-medium hover:bg-slate-100/40 transition-colors"
                                    >
                                        {/* Tampilkan "Booking ID: #ID" pada tiap kartu */}
                                        <span className={`text-xs font-bold shrink-0 ${mutedId ? 'text-slate-400' : 'text-slate-900'}`}>
                                            <span>Booking ID: </span>
                                            <span className="font-mono">{shortId}</span>
                                        </span>
                                        <CopyOrderIdButton id={card.info.bookingId} />
                                        <span className="flex-1" />
                                        <ScheduleChip card={card} />
                                    </AccordionPrimitive.Trigger>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200" />
                                </AccordionPrimitive.Header>
                                <AccordionContent className="pb-4 pt-1.5 space-y-4 bg-white -mx-3.5 px-3.5 border-t border-slate-100">
                                    <ScheduleBanner card={card} onReschedule={onReschedule} />
                                    <InfoSection card={card} submission={submission} muted={pendingReview} />
                                </AccordionContent>
                            </AccordionItem>
                            );
                        })}
                    </Accordion>
                    {/* Phase 4 — sengaja masih mati. Menyalakannya menunggu **Task 13**,
                        bukan Task 11 (pemilik produk 2026-08-18).

                        Yang mengunci: sistem tidak punya harga untuk jadwal ke-2.
                        `ScheduleForm.handleSaveCreate` menulis `total_cost: 0` dan admin
                        mengetik nilainya belakangan di `InvoiceForm` — tanpa rumus, tanpa
                        validasi; 7 dari 13 baris `form_submissions_extend` di produksi
                        bernilai 0 atau di bawah Rp 10.000. `cost-calculator` hanya melayani
                        order pertama. Task 13 yang melahirkan harga per jadwal.

                        Separuh HILIR-nya sudah jadi: begitu sebuah baris jadwal ada tanpa
                        invoice, `airingPeriods.ts` menjatuhkannya ke `awaiting_invoice`
                        (chip + copy dua bahasa + SLA), dan tombol bayar per kartu di
                        `BookingSection` sudah berfungsi. Yang hilang cuma hulunya.

                        Alasan lengkap, termasuk opsi "ajukan, bukan pesan" yang sengaja
                        tidak diambil: `docs/jadwal-iklan-progress.md` §00G. */}
                    <div className="mt-3">
                        <Button
                            variant="outline"
                            onClick={() => toast.info(t('scheduleAgainComingSoon'))}
                            className="w-full text-xs font-semibold text-slate-600 border border-dashed border-slate-300 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-400 hover:text-slate-700 rounded-xl min-h-11 px-4 gap-2 transition-all shadow-none justify-center"
                        >
                            <Plus className="w-4 h-4 shrink-0 text-slate-400" />
                            <span>{t('scheduleAdAgain')}</span>
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/80 border border-slate-300/80 px-2 py-0.5 rounded-full ml-1 shrink-0">
                                {t('comingSoonBadge')}
                            </span>
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
