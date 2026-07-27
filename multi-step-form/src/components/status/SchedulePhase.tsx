import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
    AlertCircle,
    Banknote,
    CalendarCheck,
    CalendarClock,
    CalendarDays,
    CalendarRange,
    ChevronDown,
    Clock,
    Copy,
    CreditCard,
    ExternalLink,
    FileText,
    Gift,
    Megaphone,
    Ticket,
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
import { getCurrentStepIndex } from '@/components/ProgressTracker';
import type { FormSubmission } from '@/utils/supabase';
import { calculateAdCostPerDay, calculateTotalAdCost, calculateDiscount } from '@/utils/cost-calculator';
import {
    pickDefaultExpandedKey,
    type ScheduleCard,
    type IncentiveInfo,
} from './airingPeriods';

const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

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

interface RowDef {
    key: string;
    icon: ReactNode;
    label: string;
    value: ReactNode;
}

/**
 * Baris data gaya kuitansi: SATU pasangan label:value per baris di semua
 * viewport. Kolom label FIXED (`9.5rem`, bukan `auto`) dan di-share oleh
 * Info Booking & Detail Pembayaran dalam satu kartu, supaya kolom value kedua
 * section rata kiri.
 */
function RowGrid({ rows }: { rows: RowDef[] }) {
    if (rows.length === 0) return null;
    return (
        <dl className="[display:grid] grid-cols-[9.5rem_1fr] gap-x-3 gap-y-1.5 items-center">
            {rows.map((row) => (
                <Fragment key={row.key}>
                    <dt className="flex items-center gap-1.5 text-xs text-[#888] whitespace-nowrap">
                        <span className="text-gray-400 shrink-0">{row.icon}</span>
                        {row.label}
                    </dt>
                    <dd className="text-sm text-[#1a1a1a] font-medium min-w-0">{row.value}</dd>
                </Fragment>
            ))}
        </dl>
    );
}

/** Sub-blok Info Booking / Detail Pembayaran dalam satu kartu jadwal. */
function Section({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">{label}</p>
            {children}
        </div>
    );
}

function IncentiveValue({ info }: { info: IncentiveInfo }) {
    const { t } = useLanguage();
    if (info.mode === 'plain' || info.mode === 'new_pool') {
        const perWinner = info.prizePerWinner || 0;
        const count = info.winnerCount || 0;
        const total = perWinner * count;
        return (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
                <span className="text-gray-500 font-normal">
                    {formatRupiah(perWinner)} × {count} =
                </span>
                <span className="font-semibold text-[#1a1a1a]">
                    {formatRupiah(total)}
                </span>
                {info.mode === 'new_pool' && (
                    <Badge variant="outline" className="px-1.5 py-0 h-4 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full">
                        {t('incentiveNewPeriod')}
                    </Badge>
                )}
            </span>
        );
    }
    if (info.mode === 'accumulated') {
        return (
            <span>
                <span className="font-semibold text-[#1a1a1a]">+{formatRupiah(info.additionalPrize!)}</span>
                <span className="block text-xs text-gray-500 font-normal">{t('incentiveAccumulated')}</span>
            </span>
        );
    }
    return <span className="text-xs text-gray-500 font-normal">{t('incentiveNoAdditionNote')}</span>;
}

const iconCls = 'w-3.5 h-3.5';

function InfoSection({ card }: { card: ScheduleCard }) {
    const { t } = useLanguage();
    const rows: RowDef[] = [];
    if (card.info.createdAt) {
        rows.push({ key: 'created', icon: <CalendarDays className={iconCls} />, label: t('submittedOn'), value: formatDateLong(card.info.createdAt) });
    }
    const durationText = `${card.info.duration} ${t('days')}`;
    const airingValue = (
        <span className="inline-flex flex-col">
            <span className="inline-flex items-center gap-1.5">
                <span className="font-medium text-[#1a1a1a]">{card.dateRange}</span>
                <span className="text-gray-500 font-normal text-xs">({durationText})</span>
            </span>
            {/* Jam tayang serentak 15.00 WIB — sebelumnya cuma disebut di wizard
                dan hilang begitu order jadi, sehingga user mengira tayang pagi.
                Tidak dirender untuk jadwal yang belum dipilih ("—"). */}
            {card.dateRange !== '—' && (
                <span className="block text-xs text-gray-500 font-normal">{t('airingStartTimeNote')}</span>
            )}
        </span>
    );
    rows.push({ key: 'airingDate', icon: <CalendarCheck className={iconCls} />, label: t('airingDateLabel'), value: airingValue });

    if (card.info.periodBatch) {
        rows.push({ key: 'batch', icon: <CalendarRange className={iconCls} />, label: t('periodBatchLabel'), value: <span className="font-mono text-xs">{card.info.periodBatch}</span> });
    }
    if (card.info.incentive) {
        rows.push({ key: 'prize', icon: <Gift className={iconCls} />, label: t('rewardRespondentLabel'), value: <IncentiveValue info={card.info.incentive} /> });
    }
    return (
        <Section label={t('sectionInfo')}>
            <RowGrid rows={rows} />
        </Section>
    );
}

const ctaButtonClass = 'max-md:w-full min-h-11 md:min-h-9 justify-center whitespace-nowrap';
const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';

function BookingSection({ card, submission, onReschedule }: { card: ScheduleCard; submission: FormSubmission; onReschedule: () => void }) {
    const { t } = useLanguage();
    const b = card.booking;
    const questionCount = submission.question_count || 0;
    const costPerDay = calculateAdCostPerDay(questionCount);
    const duration = card.info.duration || 0;
    const adCost = calculateTotalAdCost(questionCount, duration);

    let adCostValue: ReactNode = null;
    if (costPerDay > 0) {
        adCostValue = (
            <span className="inline-flex items-center gap-1 flex-wrap">
                <span className="text-gray-500 font-normal">
                    {formatRupiah(costPerDay)} <span className="text-gray-400 text-xs">({questionCount} Qs)</span> × {duration} {t('days')} =
                </span>
                <span className="font-semibold text-[#1a1a1a]">{formatRupiah(adCost)}</span>
            </span>
        );
    } else {
        adCostValue = <span className="font-semibold text-[#1a1a1a]">{formatRupiah(adCost)}</span>;
    }

    let totalReward = 0;
    if (card.info.incentive) {
        if (card.info.incentive.mode === 'plain' || card.info.incentive.mode === 'new_pool') {
            totalReward = (card.info.incentive.prizePerWinner || 0) * (card.info.incentive.winnerCount || 0);
        } else if (card.info.incentive.mode === 'accumulated') {
            totalReward = card.info.incentive.additionalPrize || 0;
        }
    }

    const rows: RowDef[] = [
        { key: 'adCost', icon: <Megaphone className={iconCls} />, label: t('adCostLabel'), value: adCostValue },
        { key: 'totalReward', icon: <Gift className={iconCls} />, label: t('totalRewardLabel'), value: <span className="font-semibold text-[#1a1a1a]">{formatRupiah(totalReward)}</span> },
    ];

    if (card.info.voucherCode) {
        const discount = calculateDiscount(card.info.voucherCode, adCost, totalReward, duration);
        const voucherElement = (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-bold text-gray-800 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-xs uppercase tracking-wide">
                    {card.info.voucherCode}
                </span>
                {discount > 0 && (
                    <span className="text-emerald-600 font-semibold text-xs">
                        (-{formatRupiah(discount)})
                    </span>
                )}
            </span>
        );
        rows.push({ key: 'voucher', icon: <Ticket className={iconCls} />, label: t('voucherCodeRowLabel'), value: voucherElement });
    }

    rows.push({
        key: 'totalPayment',
        icon: <Banknote className="w-3.5 h-3.5 text-jfu-primary" />,
        label: t('totalPaymentLabel'),
        value: <span className="text-base font-bold text-[#1a1a1a]">{formatRupiah(b.amount || 0)}</span>,
    });

    if (b.invoicePaymentId && b.state !== 'expired') {
        rows.push({
            key: 'invoice',
            icon: <FileText className={iconCls} />,
            label: b.isPaidForLabel ? t('receiptRowLabel') : t('invoiceRowLabel'),
            value: (
                <a
                    href={`/invoices/${b.invoicePaymentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-jfu-primary hover:underline"
                >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    {b.isPaidForLabel ? t('viewReceiptLink') : t('viewInvoiceLink')}
                </a>
            ),
        });
    }

    let banner: ReactNode = null;
    if (b.state === 'awaiting_invoice') {
        banner = (
            <div className="rounded-xl border p-3 mt-2 border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 leading-relaxed">
                    {card.kind === 'extend' ? t('calloutAwaitingInvoiceExtend') : t('calloutAwaitingInvoice')}
                </p>
            </div>
        );
    } else if (b.state === 'choose_schedule') {
        banner = (
            <div className="rounded-xl border p-3 mt-2 border-amber-200 bg-amber-50/60">
                <div className="flex gap-2.5">
                    <CalendarClock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div className="flex-1 min-w-0 md:flex md:items-center md:justify-between md:gap-3">
                        <p className="text-sm text-[#1a1a1a] leading-relaxed min-w-0">{t('calloutChooseSchedule')}</p>
                        <div className="shrink-0 max-md:mt-2.5">
                            <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                                {t('chooseSchedule')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    } else if (b.state === 'waiting_payment') {
        const isExternal = card.kind === 'original' ? b.isExternalLink : true;
        const payLabel = card.kind === 'extend' ? t('payExtension') : t('payNow');
        banner = (
            <div className="rounded-xl border p-3 mt-2 border-amber-200 bg-amber-50/60">
                <div className="flex gap-2.5">
                    <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div className="flex-1 min-w-0 md:flex md:items-center md:justify-between md:gap-3">
                        <div className="min-w-0">
                            <p className="text-sm text-[#1a1a1a] leading-relaxed">
                                {b.deadline ? (
                                    <>
                                        {t('calloutPayBefore')}{' '}
                                        <strong>{b.deadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB</strong>{' '}
                                        {/* Konsekuensinya beda: reservasi 1 jam habis = slot
                                            dilepas; batas 14.00 WIB habis = slot tetap ada tapi
                                            iklan tidak bisa tayang di jadwal itu. */}
                                        {b.deadlineCause === 'cutoff'
                                            ? t('calloutPayBeforeSuffixCutoff')
                                            : t('calloutPayBeforeSuffix')}
                                    </>
                                ) : (
                                    t('calloutPaymentGeneric')
                                )}
                            </p>
                            {/* Alasan di balik desakan bayar: kuota tayang harian
                                terbatas dan urutan publish mengikuti urutan
                                pembayaran masuk. */}
                            <p className="text-xs text-gray-600 leading-relaxed mt-1.5">
                                {t('paymentQuotaPriorityNote')}
                            </p>
                        </div>
                        {b.payUrl && (
                            <div className="shrink-0 max-md:mt-2.5">
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
            </div>
        );
    } else if (b.state === 'expired') {
        banner = (
            <div className="rounded-xl border p-3 mt-2 border-rose-200 bg-rose-50/60">
                <div className="flex gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <div className="flex-1 min-w-0 md:flex md:items-center md:justify-between md:gap-3">
                        <p className="text-sm text-[#1a1a1a] leading-relaxed min-w-0">
                            {card.kind === 'extend' ? t('extendExpiredHint') : t('calloutExpired')}
                        </p>
                        {card.kind === 'original' && (
                            <div className="shrink-0 max-md:mt-2.5">
                                <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                                    {t('rescheduleSlot')}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    } else if (b.state === 'too_late_today') {
        // Slot TIDAK dilepas di sini — untuk slot user-booked aturan 1 jam yang
        // melepasnya, untuk slot admin-booked melepas otomatis sama saja
        // membatalkan keputusan admin. Kartu hanya berhenti menawarkan bayar.
        banner = (
            <div className="rounded-xl border p-3 mt-2 border-rose-200 bg-rose-50/60">
                <div className="flex gap-2.5">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <div className="flex-1 min-w-0 md:flex md:items-center md:justify-between md:gap-3">
                        <p className="text-sm text-[#1a1a1a] leading-relaxed min-w-0">{t('calloutTooLateToday')}</p>
                        {card.kind === 'original' && (
                            <div className="shrink-0 max-md:mt-2.5">
                                <Button size="sm" onClick={onReschedule} className={`${ctaButtonClass} ${ctaRoyal}`}>
                                    {t('rescheduleSlot')}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    } else if (b.state === 'cancelled') {
        banner = (
            <div className="rounded-xl border p-3 mt-2 border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 leading-relaxed">
                    {t('calloutCancelledSchedule')}
                </p>
            </div>
        );
    }

    return (
        <Section label={t('sectionBookingPayment')}>
            <RowGrid rows={rows} />
            {banner}
        </Section>
    );
}

/**
 * Fase ② — Jadwal Iklan: list kartu setara (asli + tiap perpanjangan), tiap
 * kartu membawa dua blok sendiri (Info Booking, Detail Pembayaran).
 */
export function SchedulePhase({ submission, cards, onReschedule, active }: SchedulePhaseProps) {
    const { t } = useLanguage();
    const step = getCurrentStepIndex(submission);

    return (
        <div>
            {cards.length === 0 ? (
                <p className="text-sm text-gray-400 rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center">
                    {step === -1 ? t('scheduleEmptyRejected') : t('scheduleEmptyPending')}
                </p>
            ) : (
                <Accordion
                    type="single"
                    collapsible
                    defaultValue={active ? pickDefaultExpandedKey(cards) : undefined}
                    className="rounded-xl border border-gray-100 divide-y divide-gray-100"
                >
                    {cards.map((card) => {
                        const shortId = `#${card.info.id.slice(0, 8).toUpperCase()}`;
                        return (
                        <AccordionItem key={card.key} value={card.key} className="border-b-0 px-3">
                            <AccordionPrimitive.Header className="flex items-center gap-1 [&[data-state=open]>svg]:rotate-180">
                                <AccordionPrimitive.Trigger
                                    aria-label={`${card.label} Booking ID: ${shortId}`}
                                    className="flex flex-1 items-center gap-1 min-h-11 py-2.5 min-w-0 text-left font-medium transition-all"
                                >
                                    {/* Tampilkan "Booking ID: #ID" pada tiap kartu */}
                                    <span className={`text-xs font-bold shrink-0 ${card.booking.state === 'cancelled' ? 'text-gray-400' : 'text-[#1a1a1a]'}`}>
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
                                <InfoSection card={card} />
                                <BookingSection card={card} submission={submission} onReschedule={onReschedule} />
                            </AccordionContent>
                        </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
        </div>
    );
}
