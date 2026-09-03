import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
    AlertCircle,
    Bookmark,
    CalendarCheck,
    CalendarClock,
    CalendarRange,
    ChevronDown,
    Clock,
    CreditCard,
    ExternalLink,
    FileText,
    Gift,
    Layers,
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
import {
    airingStartHourWib,
    pickDefaultExpandedKey,
    fmtShort,
    type ScheduleCard,
    type IncentiveInfo,
} from './airingPeriods';
import { formatIDR } from '@/utils/currency';
import { isAutoReviewed } from './deriveOrderUiState';

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
    if (state === 'awaiting_admin_schedule') return t('bookingStatusAwaitingAdminSchedule');
    if (state === 'awaiting_invoice') return t('bookingStatusAwaitingInvoice');
    if (state === 'too_late_today') return t('bookingStatusTooLateToday');
    // Di luar enum shared: `extendStatusLabelKey` tidak mengenalnya, dan
    // memetakannya ke 'cancelled' akan berbunyi "Dibatalkan" untuk pesanan
    // yang justru masih hidup — yang batal cuma tanggalnya.
    if (state === 'slot_cancelled') return t('bookingStatusSlotCancelled');
    return t(extendStatusLabelKey(state));
}

/** Warna (bg+teks+dot) dishare dengan `extendStatusStyle` untuk state yang
 * overlap — dulu ada palet terpisah `BOOKING_STATUS_TONE` yang driftnya
 * nyata (mis. "Lunas" tampil emerald di baris Status tapi biru di chip
 * trigger untuk kartu yang sama). Hanya choose_schedule/awaiting_invoice/
 * too_late_today (di luar enum shared) yang dapat warna sendiri. */
const TONE_SLATE = { bg: 'bg-slate-100 border-slate-200/80', text: 'text-slate-600', dot: 'bg-slate-400' };
const TONE_AMBER = { bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-800', dot: 'bg-amber-500' };

function bookingStatusStyle(state: ScheduleCard['booking']['state']): { bg: string; text: string; dot: string } {
    // ⚠️ WARNA MENGIKUTI MAKNA, DAN FASE ② TIDAK PUNYA KEADAAN GAGAL.
    //   slate  = bukan giliranmu, tim sedang bekerja
    //   amber  = giliranmu, ada yang perlu diselesaikan
    //   emerald= selesai (lewat `extendStatusStyle`)
    //
    // ROSE DICABUT DARI FASE ②. Dulu `expired`, `too_late_today`, dan
    // `cancelled` semuanya merah — padahal tidak satu pun benar-benar gagal:
    // ketiganya bisa dilanjutkan peneliti atau tim, dan kuesionernya tetap
    // lolos review. Merah membuat pesanan yang masih hidup terbaca seperti
    // hangus, dan itu memicu chat "pesanan saya batal ya?" yang tidak perlu.
    if (state === 'choose_schedule') return TONE_AMBER;
    // Abu, bukan amber: amber di kartu ini berarti "giliranmu". Bolanya di
    // admin, jadi warnanya tidak boleh memanggil.
    if (state === 'awaiting_admin_schedule') return TONE_SLATE;
    if (state === 'awaiting_invoice') return TONE_SLATE;
    // Giliran peneliti: tanggalnya harus diganti. Amber, bukan rose.
    if (state === 'too_late_today') return TONE_AMBER;
    if (state === 'expired') return TONE_AMBER;
    // Tidak ada yang gagal dan tidak ada yang perlu peneliti kerjakan —
    // bolanya di tim.
    if (state === 'slot_cancelled') return TONE_SLATE;
    // ⚠️ Sengaja TIDAK mengubah `EXTEND_STATUS_STYLES.cancelled` yang dipakai
    // bersama papan admin & airing bar: di sana merah masih punya arti. Yang
    // diperbaiki cuma Fase ②, tempat chip-nya dulu rose sementara bannernya
    // slate — dua warna untuk satu keadaan di satu kartu.
    if (state === 'cancelled') return TONE_SLATE;
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

const formatDateRangeTrigger = (start: Date | null, end: Date | null) => {
    if (!start && !end) return null;
    if (start && !end) {
        return start.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (!start && end) {
        return end.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (start && end) {
        if (start.getTime() === end.getTime()) {
            return start.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' });
        }
        const sDay = start.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric' });
        const sMonth = start.toLocaleDateString('id-ID', { timeZone: WIB, month: 'short' });
        const sYear = start.toLocaleDateString('id-ID', { timeZone: WIB, year: 'numeric' });
        const eDay = end.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric' });
        const eMonth = end.toLocaleDateString('id-ID', { timeZone: WIB, month: 'short' });
        const eYear = end.toLocaleDateString('id-ID', { timeZone: WIB, year: 'numeric' });

        if (sYear === eYear) {
            if (sMonth === eMonth) {
                return `${sDay} – ${eDay} ${eMonth} ${eYear}`;
            }
            return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${eYear}`;
        }
        return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`;
    }
    return null;
};

function getScheduleTriggerTitle(card: ScheduleCard, t: (k: TranslationKey) => string): string {
    const dateRangeText = formatDateRangeTrigger(card.startDate, card.endDate);

    if (card.kind === 'original') {
        if (dateRangeText) {
            return dateRangeText;
        }
        return t('airingPeriodLabel');
    } else {
        if (dateRangeText) {
            return `${t('scheduleExtensionPrefix')}: ${dateRangeText}`;
        }
        return t('scheduleExtensionLabel');
    }
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
const ctaSoftAmber = 'rounded-full font-semibold bg-white text-amber-800 border border-amber-300 hover:bg-amber-50 shadow-2xs transition-all gap-1.5';

/**
 * ⚠️ `submission` SENGAJA TIDAK LAGI DITERIMA. Dulu ia dipakai untuk menghitung
 * ulang harga dari `question_count`/`distribution_type` — jalur yang sekarang
 * ditutup: uangnya datang jadi dari `card.money`. Menerimanya lagi berarti
 * membuka pintu untuk hitungan kedua yang diam-diam menyimpang dari admin.
 */
function InfoSection({ card, muted }: { card: ScheduleCard; muted?: boolean }) {
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

    /*
      ⚠️ ATURAN EMAS: JANGAN MENAMPILKAN JAM YANG BELUM DITETAPKAN SIAPA PUN.

      Dua kebohongan pernah hidup di tiga baris ini:

        1. Kilat yang gelombangnya belum ditugaskan menyimpan `start_date`
           pukul 00:00 WIB sebagai penampung. Membacanya sebagai jam tayang
           membuat kartunya berbunyi "Mulai 00.00 WIB" — jam yang tidak pernah
           diputuskan siapa pun, untuk iklan yang justru sedang menunggu
           keputusan itu.
        2. Cadangan `: '15.00'` menebak jam untuk jadwal yang bahkan belum
           punya tanggal.

      Sekarang `null` berarti "tidak ada jam yang jujur bisa disebut", dan
      barisnya DIHILANGKAN, bukan diisi tebakan.
    */
    // Satu turunan untuk kedua fase — lihat `airingStartHourWib`. Fase ③ dulu
    // memakai konstanta 15.00 dan karena itu salah untuk SELURUH order Kilat.
    const startTimeWib = card ? airingStartHourWib(card) : null;
    const kilatHourPending = !!card?.info?.isKilat && card.info.kilatSlotHour == null;

    const penayanganBox = (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-1.5 mb-4">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <CalendarCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{t('airingDateLabel')}</span>
            </div>
            {bState === 'expired' ? (
                <p className="text-amber-800/90 font-medium text-xs sm:text-sm pt-0.5">
                    {t('scheduleSlotReleased')}
                </p>
            ) : bState === 'too_late_today' ? (
                <p className="text-amber-800/90 font-medium text-xs sm:text-sm pt-0.5">
                    {t('scheduleTooLate')}
                </p>
            ) : bState === 'in_review' ? (
                <p className="text-slate-400 font-normal text-xs sm:text-sm pt-0.5">
                    {t('schedulePendingReview')}
                </p>
            ) : bState === 'choose_schedule' ? (
                <p className="text-slate-400 font-normal text-xs sm:text-sm pt-0.5">
                    {t('scheduleNotYetChosen')}
                </p>
            ) : bState === 'cancelled' ? (
                <p className="text-slate-400 font-normal text-xs sm:text-sm pt-0.5">
                    {t('scheduleCancelled')}
                </p>
            ) : (
                <div className="space-y-1 pt-0.5">
                    <div className={`font-bold text-sm ${valueTone(muted)}`}>
                        {formattedRange}
                    </div>
                    {card?.startDate && (
                        <div className="text-xs text-slate-500 font-normal flex items-center gap-1.5 flex-wrap">
                            {startTimeWib ? (
                                <span>Mulai <strong className="font-semibold text-slate-700">{startTimeWib} WIB</strong></span>
                            ) : (
                                <span className="italic">{t('scheduleKilatHourPending')}</span>
                            )}
                            {!kilatHourPending && (
                                <>
                                    <span className="text-slate-300">•</span>
                                    <span>Durasi <strong className="font-semibold text-slate-700">{duration} Hari ({totalHours} Jam)</strong></span>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (card?.info?.bookingId) {
        rows.push({
            key: 'bookingId',
            icon: <Bookmark className={iconCls} />,
            label: 'Booking ID',
            value: <span className={`font-mono text-xs font-normal text-slate-600 ${valueTone(muted)}`}>#{card.info.bookingId}</span>,
        });
    }
    if (card?.info?.incentive) {
        rows.push({ key: 'prize', icon: <Gift className={iconCls} />, label: t('rewardRespondentLabel'), value: <IncentiveValue info={card.info.incentive} muted={muted} /> });
    }

    // `awaiting_admin_schedule` ikut: sama seperti `choose_schedule`, tanggalnya
    // memang BELUM ADA — yang berbeda cuma siapa yang akan menetapkannya.
    const hasValidDate = bState !== 'expired' && bState !== 'too_late_today' && bState !== 'in_review'
        && bState !== 'choose_schedule' && bState !== 'awaiting_admin_schedule' && bState !== 'cancelled';
    const batchValue = hasValidDate && card?.info?.periodBatch
        ? <span className={valueTone(muted)}>{formatPeriodBatch(card.info.periodBatch)}</span>
        : <span className="text-gray-400 font-normal text-xs sm:text-sm">{t('periodAwaitingSchedule')}</span>;

    rows.push({ key: 'batch', icon: <CalendarRange className={iconCls} />, label: t('periodBatchLabel'), value: batchValue });

    /*
      ⚠️ UANG JADWAL INI DIBACA, BUKAN DIHITUNG ULANG.

      Sampai sekarang blok ini menghitung seluruh harganya dari nol memakai
      tarif HARI INI (`calculateTotalAdCost` dkk.), sementara drawer admin
      membaca `ad_schedules.total_cost` yang tersimpan. Untuk order lama kedua
      layar memberi angka berbeda — dan yang dilihat peneliti adalah angka yang
      tidak pernah ada di tagihan mana pun. Untuk jadwal ke-2 dst. lebih buruk
      lagi: rumus ORDER dipakai untuk baris perpanjangan, jadi dua jadwal yang
      ditagih berbeda tampil dengan harga yang sama.

      `deriveScheduleMoney` (dipanggil di `buildScheduleCards`) adalah fungsi
      yang SAMA PERSIS dengan yang dipakai kartu admin. Aturannya: kalau sudah
      pernah ditagih, tampilkan yang ditagih; hitung ulang hanya untuk jadwal
      yang memang belum punya tagihan — di situ ia penawaran, bukan catatan,
      dan kartunya menyebutnya begitu (`costIsEstimateNote`).
    */
    const money = card.money;

    const totalPaymentValue = (
        <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-bold text-sm ${muted ? 'text-slate-400' : 'text-jfu-primary'}`}>
                    {formatIDR(money.total)}
                </span>
                {(money.lines || money.note) && (
                    <button
                        type="button"
                        onClick={() => setShowBreakdown((prev) => !prev)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-jfu-primary transition-colors py-0.5 px-1.5 rounded-md hover:bg-slate-100/80 cursor-pointer"
                    >
                        <span>{showBreakdown ? t('hideCostBreakdown') : t('viewCostBreakdown')}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
                    </button>
                )}
            </div>
            {money.isEstimate && (
                <p className="text-[11px] text-slate-500 font-normal leading-relaxed">{t('costIsEstimateNote')}</p>
            )}
            {showBreakdown && (
                <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 space-y-2 text-xs font-normal text-slate-600">
                    {money.lines
                        ? money.lines.map((line, i) => (
                            <div key={`${line.label}-${i}`} className="flex justify-between items-center gap-3">
                                <span className="min-w-0">
                                    {line.tone === 'addon' ? (
                                        <span className="inline-flex items-center gap-1">
                                            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> {line.label}
                                        </span>
                                    ) : line.label}
                                    {line.hint && (
                                        <span className="text-[11px] text-slate-400 font-normal"> ({line.hint})</span>
                                    )}
                                </span>
                                <span className={`font-semibold shrink-0 ${
                                    line.tone === 'discount' ? 'text-emerald-600'
                                        : line.tone === 'addon' ? 'text-amber-600'
                                            : 'text-slate-900'
                                }`}>
                                    {line.amount < 0 ? `-${formatIDR(Math.abs(line.amount))}` : formatIDR(line.amount)}
                                </span>
                            </div>
                        ))
                        : <p className="leading-relaxed">{money.note}</p>}
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

    /*
      Sebagian sudah dibayar — 24 jadwal di produksi. Sampai sekarang kartu
      peneliti hanya menyebut harga penuh, jadi orang yang sudah menyetor
      Rp 100.000 dari Rp 233.100 tetap dibilang berutang Rp 233.100 sementara
      admin melihat sisanya Rp 133.100. Angkanya sudah lama tersedia dari
      `fetchScheduleBilling`; yang belum ada cuma jalur ke layar ini.

      Barisnya hanya muncul saat memang ada selisih: jadwal yang lunas atau
      yang belum dibayar sama sekali tidak butuh dua baris tambahan.
    */
    if (b.paid > 0 && b.outstanding > 0) {
        rows.push({
            key: 'paidSoFar',
            icon: <CreditCard className={iconCls} />,
            label: t('paidSoFarLabel'),
            value: <span className="text-emerald-700 font-semibold">{formatIDR(b.paid)}</span>,
        });
        rows.push({
            key: 'outstanding',
            icon: <CreditCard className={iconCls} />,
            label: t('outstandingLabel'),
            value: <span className="text-amber-800 font-bold">{formatIDR(b.outstanding)}</span>,
        });
    }

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
        invoiceValue = <span className="text-amber-800 italic font-medium text-xs sm:text-sm">{t('invoiceExpired')}</span>;
    } else if (b.state === 'too_late_today') {
        invoiceValue = <span className="text-amber-800 italic font-medium text-xs sm:text-sm">{t('invoicePaymentClosedToday')}</span>;
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
            {penayanganBox}
            <RowGrid rows={rows} muted={muted} />
        </Section>
    );
}

/* ─────────────────────────────────────────────────────────────────────
   BANNER FASE ② — SATU ANATOMI UNTUK SEMUA KONDISI.

   Sebelumnya tiap cabang merakit `<div>`-nya sendiri, dan hasilnya sepuluh
   banner dengan tiga bentuk berbeda: sebagian punya judul, sebagian cuma satu
   paragraf; sebagian memakai ikon, sebagian tidak; teks "siapa yang
   mengerjakan" kadang jadi baris isi, kadang duduk di kolom CTA. Bentuknya
   sekarang dipaksa satu:

       ◍  Judul singkat (2–4 kata)
          Apa yang sedang terjadi — satu kalimat.
          Langkah berikutnya / siapa yang mengerjakan.

          [ CTA ]   ← hanya bila ini giliran peneliti

   Bagian yang tidak berlaku DIHILANGKAN, bukan diganti kalimat pengisi —
   itu sebabnya `lines` menerima `null` dan menyaringnya, bukan menerima
   string kosong.

   ⚠️ NOL WARNA MERAH DI FASE ②. Tidak ada satu pun keadaannya yang
   benar-benar gagal; semuanya bisa dilanjutkan peneliti atau tim. Lihat
   catatan panjangnya di `bookingStatusStyle`.
   ───────────────────────────────────────────────────────────────────── */
type BannerTone = 'slate' | 'amber';

const BANNER_TONE: Record<BannerTone, { box: string; icon: string }> = {
    /** Bukan giliranmu — tim sedang bekerja. */
    slate: { box: 'border-slate-200/80 bg-slate-50/80', icon: 'text-slate-500' },
    /** Giliranmu, ada yang perlu diselesaikan. */
    amber: { box: 'border-amber-200/80 bg-amber-50/70', icon: 'text-amber-600' },
};

function Banner({ tone, icon, title, lines, cta }: {
    tone: BannerTone;
    icon: ReactNode;
    title: string;
    /** Kalimat isi, urut. `null`/`false` disaring — lihat aturan emas. */
    lines: (ReactNode | null | false)[];
    cta?: ReactNode;
}) {
    const style = BANNER_TONE[tone];
    const body = lines.filter(Boolean);
    return (
        <div className={`rounded-xl border p-3.5 sm:p-4 shadow-2xs ${style.box}`}>
            <div className="flex max-md:flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`shrink-0 mt-0.5 ${style.icon}`}>{icon}</span>
                    <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-slate-900 leading-snug">{title}</p>
                        {body.map((line, i) => (
                            <p key={i} className="text-xs text-slate-600 leading-relaxed">{line}</p>
                        ))}
                    </div>
                </div>
                {cta && <div className="shrink-0 max-md:w-full max-md:mt-1 md:ml-auto">{cta}</div>}
            </div>
        </div>
    );
}

/**
 * Blok "tagihan gabungan" di kartu peneliti — dipakai kartu LEAD (di dalam
 * banner bayar) dan kartu yang sudah lunas (di bawah banner).
 *
 * ⚠️ DUA ANGKA, KEDUANYA DISEBUT. "Porsi pesanan ini" menjawab *berapa harga
 * pesanan ini*, "TOTAL DIBAYAR" menjawab *berapa yang akan ditagih halaman
 * DOKU*. Sebelum ini hanya yang pertama yang tampil, tepat di sebelah tombol
 * yang membuka yang kedua — untuk grup 3 pesanan @Rp 1,11jt, tiga kartu sama
 * berbunyi Rp 1.110.000 dan ketiganya membuka halaman Rp 3.330.000. Membuang
 * salah satunya menghidupkan lagi cacat itu dari sisi yang berlawanan.
 */
function GroupBillBlock({ group, portion, t }: {
    group: NonNullable<ScheduleCard['booking']['group']>;
    /** Porsi jadwal INI. `null` = jangan tampilkan barisnya. */
    portion: number | null;
    t: (key: TranslationKey, params?: Record<string, string>) => string;
}) {
    return (
        <span className="block rounded-lg border border-blue-200/70 bg-blue-50/50 px-2.5 py-2 space-y-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-900">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                {t('groupBillChip', { count: String(group.memberCount) })}
            </span>
            {portion != null && (
                <span className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span>{t('groupBillPortion')}</span>
                    <span className="tabular-nums">{formatIDR(portion)}</span>
                </span>
            )}
            <span className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900 border-t border-blue-200/70 pt-1">
                <span>{t('groupBillTotal')}</span>
                <span className="tabular-nums">{formatIDR(group.total)}</span>
            </span>
            {group.others.length > 0 && (
                <span className="block pt-0.5">
                    <span className="block text-[11px] text-slate-500">{t('groupBillAlsoIncluded')}</span>
                    {group.others.map((o, i) => (
                        <span key={i} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                            <span className="truncate">· {o.title}</span>
                            <span className="tabular-nums shrink-0">{formatIDR(o.amount)}</span>
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
}

const bannerIcon = 'w-4 h-4';

function ScheduleBanner({ card, onReschedule, canSelfReschedule }: {
    card: ScheduleCard;
    onReschedule: () => void;
    /**
     * Apakah peneliti ini BERHAK menentukan tanggalnya sendiri.
     *
     * Diturunkan dari `isAutoReviewed(submission)` di pemanggil — predikat yang
     * SUDAH ADA di `deriveOrderUiState.ts` dan sudah dipakai untuk memilih antara
     * callout `choose_schedule` dan `awaiting_admin_schedule`. Sengaja tidak
     * ditulis ulang di sini: dua definisi "siapa yang memilih jadwal" akan
     * menyimpang, dan yang menyimpang diam-diam adalah yang menentukan apakah
     * seorang peneliti boleh mengunci slot.
     */
    canSelfReschedule: boolean;
}) {
    const { t } = useLanguage();
    const b = card.booking;

    /** Kalimat penutup untuk keadaan yang tanggalnya harus diganti: entah
     *  peneliti yang memilih sendiri, entah tim yang mengerjakannya. Salah
     *  satu SELALU benar, jadi tidak ada keadaan tanpa langkah berikutnya. */
    const nextStepLine = (selfKey: TranslationKey) =>
        canSelfReschedule ? t(selfKey) : t('rescheduleHandledByTeam');

    /** Tombol jadwal-ulang — hanya untuk jadwal pertama jalur auto-review.
     *  Jadwal ke-2 dst. tidak punya alur pemilihan tanggal mandiri, dan order
     *  jalur manual tanggalnya milik admin (keputusan produk 2026-08-25). */
    const rescheduleCta = card.kind === 'original' && canSelfReschedule ? (
        <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftAmber}`}>
            <RotateCcw className="w-3.5 h-3.5" />
            {t('rescheduleSlot')}
        </Button>
    ) : undefined;

    if (b.state === 'in_review') {
        return (
            <Banner
                tone="slate"
                icon={<Clock className={bannerIcon} />}
                title={t('bannerTitleInReview')}
                lines={[t('bannerSubInReview')]}
            />
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

          Kedua tanggalnya DISEBUT supaya ia bisa mencocokkan sendiri dengan
          email tagihan yang sudah terlanjur diterima — dan justru karena
          kalimatnya bergantung pada dua tanggal, cabang ini hanya dipakai
          bila keduanya benar-benar ada (aturan emas). Kalau jadwalnya belum
          bertanggal, banner biasa yang tampil.
        */
        if (b.staleBilledFor && card.startDate) {
            return (
                <Banner
                    tone="amber"
                    icon={<CalendarClock className={bannerIcon} />}
                    title={t('bannerTitleStaleInvoice')}
                    lines={[
                        t('bannerSubStaleInvoice', {
                            oldDate: fmtShort(b.staleBilledFor),
                            newDate: card.dateRange,
                        }),
                        t('bannerSubStaleInvoiceWait'),
                    ]}
                />
            );
        }
        return (
            <Banner
                tone="slate"
                icon={<Clock className={bannerIcon} />}
                title={t('bannerTitleAwaitingInvoice')}
                lines={[card.kind === 'extend' ? t('bannerSubAwaitingInvoiceSchedule') : t('bannerSubAwaitingInvoice')]}
            />
        );
    }

    // Sudah disetujui, tapi TIM yang menetapkan jadwalnya. Warnanya slate, bukan
    // amber — menawarkan "Pilih Tanggal" di sini akan mengundang peneliti
    // memesan slot yang admin juga sedang pesan: balapan `slot_booked_by`, dan
    // ujungnya tagihan basi.
    if (b.state === 'awaiting_admin_schedule') {
        return (
            <Banner
                tone="slate"
                icon={<CalendarClock className={bannerIcon} />}
                title={t('bannerTitleAwaitingAdminSchedule')}
                lines={[t('bannerSubAwaitingAdminSchedule')]}
            />
        );
    }

    if (b.state === 'choose_schedule') {
        return (
            <Banner
                tone="amber"
                icon={<CalendarClock className={bannerIcon} />}
                title={t('bannerTitleChooseSchedule')}
                lines={[t('bannerSubChooseSchedule')]}
                cta={
                    <Button size="sm" variant="outline" onClick={onReschedule} className={`${ctaButtonClass} ${ctaSoftAmber}`}>
                        <CalendarClock className="w-3.5 h-3.5" />
                        {t('chooseSchedule')}
                    </Button>
                }
            />
        );
    }

    if (b.state === 'waiting_payment') {
        const isExternal = card.kind === 'original' ? b.isExternalLink : true;
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

          ⚠️ ATURAN EMAS: `{time}` hanya boleh muncul kalau `deadline` MEMANG
          ada. Kalau ia null, varian ketiga yang dipakai — dan varian itu
          sengaja tidak menyebut jam apa pun.
        */
        const deadlineTime = b.deadline
            ? b.deadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: WIB }).replace(':', '.') + ' WIB'
            : null;
        const deadlineLine = deadlineTime && b.deadlineCause === 'slot'
            ? t('bannerSubWaitingPaymentSlot', { time: deadlineTime })
            : deadlineTime && b.deadlineCause === 'cutoff'
                ? t('bannerSubWaitingPaymentCutoff', { time: deadlineTime })
                : t('bannerSubWaitingPaymentSlotsLimited');

        /*
          Sebagian sudah dibayar (24 jadwal di produksi). State-nya SENGAJA
          tetap `waiting_payment`: yang berubah cuma angka dan satu kalimat.
          Menambah BookingState baru berarti menyentuh seluruh matriks banner,
          chip, dan urutan kartu untuk keuntungan nol.
        */
        const isPartial = b.paid > 0 && b.outstanding > 0;

        /*
          ⚠️ ANGGOTA GRUP YANG BUKAN LEAD TIDAK PUNYA TOMBOL, DAN ITU BUKAN
          KEHILANGAN FUNGSI — ia satu-satunya cara menjawab "berapa yang saya
          bayar" dengan jujur. Link DOKU-nya menagih total grup; kartu ini cuma
          tahu porsinya sendiri. Menunjuk ke lead memindahkan pertanyaannya ke
          kartu yang memang memegang seluruh jawabannya.

          Tujuannya `/invoices/<payment_id>` (BUKAN anchor ke kartu lead):
          kartu lead bisa sedang tersaring filter dashboard, sementara dokumen
          grupnya selalu memuat seluruh bundel dan link bayarnya sekaligus.
        */
        if (b.group && !b.group.isLead) {
            return (
                <Banner
                    tone="slate"
                    icon={<Layers className={bannerIcon} />}
                    title={t('groupBillFollowerTitle')}
                    lines={[
                        t('groupBillFollowerBody', {
                            count: String(b.group.memberCount - 1),
                            title: b.group.leadTitle,
                        }),
                        t('groupBillFollowerHint'),
                    ]}
                    cta={
                        <Link to={`/invoices/${b.group.paymentId}`} className="block max-md:w-full md:inline-block">
                            <Button size="sm" variant="outline" className={`${ctaButtonClass} gap-1.5`}>
                                <FileText className="w-3.5 h-3.5" />
                                {t('groupBillFollowerCta')}
                            </Button>
                        </Link>
                    }
                />
            );
        }

        const payLabel = b.group
            ? t('groupBillPayCta', { amount: formatIDR(b.group.total) })
            : isPartial ? t('payRemaining') : t('payNow');

        return (
            <Banner
                tone="amber"
                icon={<CreditCard className={bannerIcon} />}
                title={isPartial ? t('bannerTitleWaitingPaymentPartial') : t('bannerTitleWaitingPayment')}
                lines={[
                    b.group && <GroupBillBlock key="grp" group={b.group} portion={b.amount} t={t} />,
                    isPartial && t('bannerSubPartiallyPaid', {
                        paid: formatIDR(b.paid),
                        due: formatIDR(b.outstanding),
                    }),
                    deadlineLine,
                ]}
                cta={b.payUrl ? (
                    isExternal ? (
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
                    )
                ) : undefined}
            />
        );
    }

    if (b.state === 'slot_cancelled') {
        /* Dulu keadaan ini memakai banner `expired` — jadi peneliti diberi tahu
           slotnya "dilepas OTOMATIS" padahal seorang admin menekannya, lalu
           diberi tombol "Jadwalkan Ulang" yang MENGHIDUPKAN KEMBALI jadwal yang
           baru saja dibatalkan (penjaganya sekarang di `rebookSlotForSubmission`).
           Nol CTA di sini bukan kelalaian: tidak ada langkah milik peneliti. */
        return (
            <Banner
                tone="slate"
                icon={<AlertCircle className={bannerIcon} />}
                title={t('bannerTitleSlotCancelled')}
                lines={[t('bannerSubSlotCancelled')]}
            />
        );
    }

    if (b.state === 'expired') {
        return (
            <Banner
                tone="amber"
                icon={<AlertCircle className={bannerIcon} />}
                title={t('bannerTitleExpired')}
                lines={[
                    ...(card.kind === 'extend'
                        ? [t('scheduleExpiredHint')]
                        : [t('bannerSubExpired'), nextStepLine('bannerSubPickNewDate')]),
                    /*
                      Grup yang kedaluwarsa mati SEKALIGUS — satu link, satu masa
                      berlaku. Menyebutnya di sini mencegah peneliti mencari-cari
                      "tagihan yang lain" yang memang tidak pernah terpisah.
                    */
                    b.group && t('groupBillExpiredNote'),
                ]}
                cta={rescheduleCta}
            />
        );
    }

    if (b.state === 'too_late_today') {
        /* ⚠️ "Hari ini" DIBUANG. `isPaymentTooLateForDate` cocok untuk tanggal
           lampau MANA PUN, jadi order yang tertinggal seminggu pun dulu
           berbunyi "Waktu Penyiapan Hari Ini Telah Lewat". Sebut tanggalnya —
           dan kalau tanggalnya entah kenapa tidak ada, hilangkan barisnya
           sekalian, jangan menebak. */
        return (
            <Banner
                tone="amber"
                icon={<Clock className={bannerIcon} />}
                title={t('bannerTitleTooLateToday')}
                lines={[
                    card.startDate && t('bannerSubTooLateToday', { date: formatWithWeekday(card.startDate, true) }),
                    card.kind === 'original' && nextStepLine('bannerSubPickNextDate'),
                ]}
                cta={rescheduleCta}
            />
        );
    }

    if (b.state === 'cancelled') {
        return (
            <Banner
                tone="slate"
                icon={<AlertCircle className={bannerIcon} />}
                title={t('bannerTitleCancelledSchedule')}
                lines={[t('calloutCancelledSchedule')]}
            />
        );
    }

    /* `paid` sengaja tanpa banner: order lunas tidak menunggu apa pun, dan Fase
       ③ yang bercerita soal penayangannya. */
    return null;
}

/**
 * Fase ② — Jadwal Iklan: list kartu setara (asli + tiap perpanjangan), tiap
 * kartu membawa dua blok sendiri (Info Booking, Detail Pembayaran).
 */
export function SchedulePhase({ submission, cards, onReschedule, active }: SchedulePhaseProps) {
    const { t } = useLanguage();
    // Satu perhitungan untuk seluruh kartu order ini — hak menjadwalkan melekat
    // pada ORDER, bukan pada jadwal. Lihat catatan di prop `canSelfReschedule`.
    const selfReschedule = isAutoReviewed(submission);

    return (
        <div>
            {cards.length === 0 ? (
                /* Order tanpa kartu jadwal adalah yang MATI — menunggu perbaikan
                   atau dibatalkan. Order yang masih direview sudah punya kartunya
                   sendiri (Booking ID terbit sejak submit, lihat
                   `buildScheduleCards`). Kalimatnya sengaja netral: untuk order
                   batal, menyuruh "selesaikan revisi" adalah instruksi yang
                   tidak punya jalan keluar. */
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
                            const triggerTitle = getScheduleTriggerTitle(card, t);
                            /* Judul diredam untuk kartu yang belum aktif (review) maupun yang sudah dibatalkan */
                            const mutedTitle = card.booking.state === 'in_review' || card.booking.state === 'cancelled';
                            const pendingReview = card.booking.state === 'in_review';
                            return (
                            <AccordionItem key={card.key} value={card.key} className="border-b-0 px-3.5">
                                <AccordionPrimitive.Header className="flex items-center gap-1 [&[data-state=open]>svg]:rotate-180">
                                    <AccordionPrimitive.Trigger
                                        aria-label={triggerTitle}
                                        className="flex flex-1 items-center gap-2 min-h-11 py-2.5 min-w-0 text-left font-medium hover:bg-slate-100/40 transition-colors"
                                    >
                                        <span className={`text-xs font-bold truncate ${mutedTitle ? 'text-slate-400' : 'text-slate-900'}`}>
                                            {triggerTitle}
                                        </span>
                                        <span className="flex-1" />
                                        <ScheduleChip card={card} />
                                    </AccordionPrimitive.Trigger>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200" />
                                </AccordionPrimitive.Header>
                                <AccordionContent className="pb-4 pt-1.5 space-y-4 bg-white -mx-3.5 px-3.5 border-t border-slate-100">
                                    <ScheduleBanner card={card} onReschedule={onReschedule} canSelfReschedule={selfReschedule} />
                                    {/*
                                      ⚠️ CHIP GRUP TETAP ADA SESUDAH LUNAS. Justru di
                                      situ ia paling berguna: satu transfer Rp 3,33jt
                                      untuk tiga pesanan hanya bisa dicocokkan dengan
                                      mutasi bank kalau layarnya mengatakan ketiganya
                                      memang satu pembayaran. `paid` tidak punya banner
                                      (sengaja), jadi barisnya hidup di sini.
                                    */}
                                    {card.booking.group && card.booking.state === 'paid' && (
                                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                                            <Layers className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                            <span>{t('groupBillPaidNote', { count: String(card.booking.group.memberCount - 1) })}</span>
                                            <Link
                                                to={`/invoices/${card.booking.group.paymentId}`}
                                                className="font-semibold text-jfu-primary hover:underline shrink-0"
                                            >
                                                {t('viewReceiptLink')}
                                            </Link>
                                        </p>
                                    )}
                                    <InfoSection card={card} muted={pendingReview} />
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
