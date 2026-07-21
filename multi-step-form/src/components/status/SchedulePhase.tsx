import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle,
    Banknote,
    CalendarClock,
    CalendarDays,
    CalendarRange,
    Clock,
    Copy,
    CreditCard,
    ExternalLink,
    Eye,
    FileText,
    Gift,
    Hash,
    PlayCircle,
    Ticket,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { extendStatusLabelKey, extendStatusStyle } from '@/utils/extend-ui';
import { getCurrentStepIndex } from '@/components/ProgressTracker';
import type { FormSubmission, FormSubmissionExtend } from '@/utils/supabase';
import type { ExtendPaymentInfo } from '@/components/ProgressTracker';
import type { OrderUiState } from './deriveOrderUiState';
import {
    buildScheduleCards,
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
    ui: OrderUiState;
    extends_: FormSubmissionExtend[];
    extendPayments: Record<string, ExtendPaymentInfo>;
    invoiceId: string | null;
    pageInfo?: { views: number; slug: string | null };
    onReschedule: () => void;
}

function ScheduleChip({ card }: { card: ScheduleCard }) {
    const style = extendStatusStyle(card.chipStatus);
    return (
        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            {card.chipLabel}
        </span>
    );
}

/** ID jadwal yang bisa di-tap untuk menyalin UUID lengkap (pelaporan komplain). */
function CopyableOrderId({ id }: { id: string }) {
    const { t } = useLanguage();
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(id);
            toast.success(t('orderIdCopied'));
        } catch {
            /* clipboard tidak tersedia — biarkan senyap */
        }
    };
    return (
        <button
            type="button"
            onClick={copy}
            title={id}
            className="inline-flex items-center gap-1.5 font-mono text-[#1a1a1a] hover:text-jfu-primary transition-colors"
        >
            #{id.slice(0, 8).toUpperCase()}
            <Copy className="w-3 h-3 text-gray-400" />
        </button>
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
 * Info/Booking & Pembayaran/Penayangan dalam satu kartu, supaya kolom value
 * ketiga section rata kiri — `auto` per-section dulu dicoba dan membuat
 * "Order ID" dan "Total Biaya" punya lebar kolom label sendiri-sendiri
 * (tidak sejajar). Lebar dipilih pas untuk label terpanjang di kartu ini,
 * "Insentif pemenang". Dua pasangan per baris juga sudah dicoba dan gagal —
 * value panjang ("Menunggu jadwal dipilih") melebarkan kolom bersama
 * sehingga value pendek menyisakan lubang di tengah baris.
 * `[display:grid]`, BUKAN class `grid`: styles.css legacy punya
 * `.grid { gap: 1.5rem }` yang menang cascade dan memaksa gap 24px.
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

/** Sub-blok Info/Booking & Pembayaran/Penayangan dalam satu kartu jadwal.
 * Pengelompokan mengandalkan jarak (baris rapat 6px, antar section 16px via
 * space-y induk) + label kontras — tanpa garis pembatas (divider dicoba dan
 * dinilai user mengganggu). */
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
    if (info.mode === 'plain') {
        return <span>{info.winnerCount} × {formatRupiah(info.prizePerWinner!)}</span>;
    }
    if (info.mode === 'new_pool') {
        return (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
                {info.winnerCount} × {formatRupiah(info.prizePerWinner!)}
                <Badge variant="outline" className="px-1.5 py-0 h-4 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full">
                    {t('incentiveNewPeriod')}
                </Badge>
            </span>
        );
    }
    if (info.mode === 'accumulated') {
        return (
            <span>
                +{formatRupiah(info.additionalPrize!)}
                <span className="block text-xs text-gray-500 font-normal">{t('incentiveAccumulated')}</span>
            </span>
        );
    }
    return <span className="text-xs text-gray-500 font-normal">{t('incentiveNoAdditionNote')}</span>;
}

const iconCls = 'w-3.5 h-3.5';

function InfoSection({ card }: { card: ScheduleCard }) {
    const { t } = useLanguage();
    const rows: RowDef[] = [
        { key: 'id', icon: <Hash className={iconCls} />, label: t('orderId'), value: <CopyableOrderId id={card.info.id} /> },
    ];
    if (card.info.createdAt) {
        rows.push({ key: 'created', icon: <CalendarDays className={iconCls} />, label: t('submittedOn'), value: formatDateLong(card.info.createdAt) });
    }
    rows.push({ key: 'duration', icon: <Clock className={iconCls} />, label: t('adDuration'), value: `${card.info.duration} ${t('days')}` });
    if (card.info.periodBatch) {
        rows.push({ key: 'batch', icon: <CalendarRange className={iconCls} />, label: t('periodBatchLabel'), value: <span className="font-mono text-xs">{card.info.periodBatch}</span> });
    }
    if (card.info.incentive) {
        rows.push({ key: 'prize', icon: <Gift className={iconCls} />, label: t('detailPrize'), value: <IncentiveValue info={card.info.incentive} /> });
    }
    return (
        <Section label={t('sectionInfo')}>
            <RowGrid rows={rows} />
        </Section>
    );
}

const BOOKING_STATUS_TONE: Record<ScheduleCard['booking']['state'], string> = {
    choose_schedule: 'text-amber-700',
    awaiting_invoice: 'text-gray-500',
    waiting_payment: 'text-amber-700',
    expired: 'text-rose-600',
    cancelled: 'text-gray-500',
    paid: 'text-emerald-700',
};

/** Label dishare dengan chip trigger (extend-ui) untuk state yang sama-sama
 * ada di enum shared — hanya choose_schedule/awaiting_invoice yang punya
 * kunci sendiri karena bukan bagian dari status extend/publikasi. */
function bookingStatusLabel(state: ScheduleCard['booking']['state'], t: (key: TranslationKey) => string): string {
    if (state === 'choose_schedule') return t('bookingStatusChooseSchedule');
    if (state === 'awaiting_invoice') return t('bookingStatusAwaitingInvoice');
    return t(extendStatusLabelKey(state));
}

const ctaButtonClass = 'max-md:w-full min-h-11 md:min-h-9 justify-center whitespace-nowrap';
const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';

function BookingSection({ card, onReschedule }: { card: ScheduleCard; onReschedule: () => void }) {
    const { t } = useLanguage();
    const b = card.booking;
    const rows: RowDef[] = [
        { key: 'cost', icon: <Banknote className={iconCls} />, label: t('totalCost'), value: formatRupiah(b.amount || 0) },
    ];
    if (card.info.voucherCode) {
        rows.push({ key: 'voucher', icon: <Ticket className={iconCls} />, label: t('voucherLabel'), value: <span className="font-mono text-xs">{card.info.voucherCode}</span> });
    }
    rows.push({
        key: 'status',
        icon: <CreditCard className={iconCls} />,
        label: t('statusLabel'),
        value: <span className={`font-semibold ${BOOKING_STATUS_TONE[b.state]}`}>{bookingStatusLabel(b.state, t)}</span>,
    });
    if (b.invoicePaymentId) {
        rows.push({
            key: 'invoice',
            icon: <FileText className={iconCls} />,
            label: b.isPaidForLabel ? t('receiptRowLabel') : t('invoiceRowLabel'),
            value: (
                <a
                    href={`/invoices/${b.invoicePaymentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jfu-primary hover:underline"
                >
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
                                        <strong>{b.deadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</strong>{' '}
                                        {t('calloutPayBeforeSuffix')}
                                    </>
                                ) : (
                                    t('calloutPaymentGeneric')
                                )}
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

const PUB_STATUS_TONE: Record<ScheduleCard['publication']['state'], string> = {
    none: 'text-gray-400',
    scheduled: 'text-purple-700',
    live: 'text-emerald-700',
    completed: 'text-gray-500',
};

/** 'none' tidak pernah dirender (guard `booking.state !== 'paid'` di bawah
 * selalu lolos duluan sebelum publication.state bisa 'none') — tetap perlu
 * ditangani karena PublicationState mewajibkan Record lengkap. */
function publicationStatusLabel(state: ScheduleCard['publication']['state'], t: (key: TranslationKey) => string): string {
    if (state === 'none') return '-';
    return t(extendStatusLabelKey(state));
}

function PublicationSection({ card }: { card: ScheduleCard }) {
    const { t } = useLanguage();
    if (card.booking.state !== 'paid') return null;
    const p = card.publication;
    const rows: RowDef[] = [
        { key: 'range', icon: <CalendarRange className={iconCls} />, label: t('airingScheduleLabel'), value: card.dateRange },
        { key: 'status', icon: <PlayCircle className={iconCls} />, label: t('statusLabel'), value: <span className={`font-semibold ${PUB_STATUS_TONE[p.state]}`}>{publicationStatusLabel(p.state, t)}</span> },
    ];
    return (
        <Section label={t('sectionPublication')}>
            <RowGrid rows={rows} />
        </Section>
    );
}

/**
 * Fase ② — Jadwal Iklan: list kartu setara (asli + tiap perpanjangan), tiap
 * kartu membawa tiga blok sendiri (Info, Booking & Pembayaran, Penayangan).
 * Menggantikan model stepper — tidak ada lagi simbol "langkah" terpisah dari
 * datanya. Halaman & total views ditaruh order-level di bawah list (satu
 * halaman dipakai semua jadwal, views akumulatif — bukan milik satu jadwal).
 */
export function SchedulePhase({ submission, ui, extends_, extendPayments, invoiceId, pageInfo, onReschedule }: SchedulePhaseProps) {
    const { t } = useLanguage();
    const step = getCurrentStepIndex(submission);
    const cards = buildScheduleCards(submission, ui, extends_, extendPayments, invoiceId ?? null, t);
    const showChips = cards.length > 1;

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
                    defaultValue={pickDefaultExpandedKey(cards)}
                    className="rounded-xl border border-gray-100 divide-y divide-gray-100"
                >
                    {cards.map((card) => (
                        <AccordionItem key={card.key} value={card.key} className="border-b-0 px-3">
                            <AccordionTrigger aria-label={`${card.label} ${card.dateRange}`} className="min-h-11 py-2.5 gap-2 hover:no-underline">
                                <span className="flex flex-1 items-center gap-2 min-w-0 text-left">
                                    {/* "Jadwal Iklan" sudah jadi judul fase di atas (PhaseRail) —
                                        tidak diulang di trigger. Satu kartu: tanggal jadi teks utama.
                                        Banyak kartu (extend): cukup nomor urut "#N" buat membedakan,
                                        bukan label penuh "Jadwal Iklan N" yang mengulang kata fase. */}
                                    <span className={`text-xs font-bold shrink-0 ${card.booking.state === 'cancelled' ? 'text-gray-400' : 'text-[#1a1a1a]'}`}>
                                        {showChips ? `#${card.ordinal}` : card.dateRange}
                                    </span>
                                    {showChips && (
                                        <span className="text-[11px] text-gray-500 truncate min-w-0">{card.dateRange}</span>
                                    )}
                                    <span className="flex-1" />
                                    {showChips && <ScheduleChip card={card} />}
                                </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-3 pt-1.5 space-y-4">
                                <InfoSection card={card} />
                                <BookingSection card={card} onReschedule={onReschedule} />
                                <PublicationSection card={card} />
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}

            {pageInfo?.slug && (
                <div className="flex items-center justify-between gap-2 mt-3 px-0.5">
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
