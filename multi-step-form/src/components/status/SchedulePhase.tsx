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
    return t(extendStatusLabelKey(state));
}

/** Warna (bg+teks+dot) dishare dengan `extendStatusStyle` untuk state yang
 * overlap — dulu ada palet terpisah `BOOKING_STATUS_TONE` yang driftnya
 * nyata (mis. "Lunas" tampil emerald di baris Status tapi biru di chip
 * trigger untuk kartu yang sama). Hanya choose_schedule/awaiting_invoice
 * (di luar enum shared) yang dapat warna sendiri. */
function bookingStatusStyle(state: ScheduleCard['booking']['state']): { bg: string; text: string; dot: string } {
    if (state === 'choose_schedule') return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' };
    if (state === 'awaiting_invoice') return { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-500', dot: 'bg-gray-400' };
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

/** Tombol salin Order ID/ID perpanjangan — dirender TEPAT di samping teks
 * Order ID di dalam trigger. Bukan `<button>` (elemen trigger accordion
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
 * Info & Booking & Pembayaran dalam satu kartu, supaya kolom value kedua
 * section rata kiri — `auto` per-section dulu dicoba dan membuat
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

/** Sub-blok Info/Booking & Pembayaran dalam satu kartu jadwal. Pengelompokan
 * mengandalkan jarak (baris rapat 6px, antar section 16px via space-y induk)
 * + label kontras — tanpa garis pembatas (divider dicoba dan dinilai user
 * mengganggu). */
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
    const rows: RowDef[] = [];
    if (card.info.createdAt) {
        rows.push({ key: 'created', icon: <CalendarDays className={iconCls} />, label: t('submittedOn'), value: formatDateLong(card.info.createdAt) });
    }
    rows.push({ key: 'duration', icon: <Clock className={iconCls} />, label: t('adDuration'), value: `${card.info.duration} ${t('days')}` });
    if (card.dateRange !== '—') {
        rows.push({ key: 'airingDate', icon: <CalendarCheck className={iconCls} />, label: t('airingDateLabel'), value: card.dateRange });
    }
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

const ctaButtonClass = 'max-md:w-full min-h-11 md:min-h-9 justify-center whitespace-nowrap';
const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';

function BookingSection({ card, onReschedule }: { card: ScheduleCard; onReschedule: () => void }) {
    const { t } = useLanguage();
    const b = card.booking;
    const rows: RowDef[] = [
        { key: 'cost', icon: <Banknote className={iconCls} />, label: t('totalCost'), value: formatRupiah(b.amount || 0) },
    ];
    if (card.info.voucherCode) {
        rows.push({ key: 'voucher', icon: <Ticket className={iconCls} />, label: t('voucherLabel'), value: <span className="font-mono">{card.info.voucherCode}</span> });
    }
    /* Status dipindah ke chip judul kartu (`ScheduleChip`, selalu tampil di
       trigger) — baris "Status" di sini dihapus supaya tidak dobel sumber. */
    /* Invoice kedaluwarsa tidak lagi valid untuk dibayar (slot sudah
       dilepas, CTA di banner expired sudah arahkan "Jadwalkan Ulang") —
       link lama disembunyikan supaya tidak menyesatkan user ke invoice mati. */
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

/**
 * Fase ② — Jadwal Iklan: list kartu setara (asli + tiap perpanjangan), tiap
 * kartu membawa dua blok sendiri (Info, Booking & Pembayaran). Status tayang
 * (Terjadwal/Tayang/Selesai) dan Halaman Iklan (link + views, order-level,
 * dipakai bersama semua jadwal) sudah pindah rumah ke Fase ③ Penayangan —
 * fase ini berhenti murni di status pembayaran ("Lunas"), tidak ikut
 * melompat ke status tayang.
 */
export function SchedulePhase({ submission, cards, onReschedule, active }: SchedulePhaseProps) {
    const { t } = useLanguage();
    const step = getCurrentStepIndex(submission);
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
                    defaultValue={active ? pickDefaultExpandedKey(cards) : undefined}
                    className="rounded-xl border border-gray-100 divide-y divide-gray-100"
                >
                    {cards.map((card) => {
                        const shortId = `#${card.info.id.slice(0, 8).toUpperCase()}`;
                        return (
                        <AccordionItem key={card.key} value={card.key} className="border-b-0 px-3">
                            <AccordionPrimitive.Header className="flex items-center gap-1 [&[data-state=open]>svg]:rotate-180">
                                <AccordionPrimitive.Trigger
                                    aria-label={`${card.label} ${showChips ? `#${card.ordinal}` : shortId}`}
                                    className="flex flex-1 items-center gap-1 min-h-11 py-2.5 min-w-0 text-left font-medium transition-all"
                                >
                                    {/* "Jadwal Iklan" sudah jadi judul fase di atas (PhaseRail) —
                                        tidak diulang di trigger. Satu kartu: Order ID jadi teks
                                        utama (dipindah dari section Info, supaya bisa dilihat tanpa
                                        expand). Tanggal tayang pindah ke section Info (bukan di
                                        trigger lagi). Banyak kartu (extend): cukup nomor urut "#N"
                                        buat membedakan, bukan label penuh "Jadwal Iklan N" yang
                                        mengulang kata fase. */}
                                    <span className={`text-xs font-bold shrink-0 ${card.booking.state === 'cancelled' ? 'text-gray-400' : 'text-[#1a1a1a]'} ${showChips ? '' : 'font-mono'}`}>
                                        {showChips ? `#${card.ordinal}` : shortId}
                                    </span>
                                    {/* CopyOrderIdButton bukan `<button>` sungguhan (lihat komentar
                                        di definisinya) — jadi aman dirender di dalam Trigger,
                                        persis di samping teks Order ID/ordinal, sesuai permintaan
                                        user (bukan lagi di ujung kanan row dekat chevron). */}
                                    <CopyOrderIdButton id={card.info.id} />
                                    <span className="flex-1" />
                                    <ScheduleChip card={card} />
                                </AccordionPrimitive.Trigger>
                                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200" />
                            </AccordionPrimitive.Header>
                            <AccordionContent className="pb-3 pt-1.5 space-y-4">
                                <InfoSection card={card} />
                                <BookingSection card={card} onReschedule={onReschedule} />
                            </AccordionContent>
                        </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
        </div>
    );
}
