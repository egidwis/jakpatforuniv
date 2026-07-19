import { Eye, Clock, CreditCard, ExternalLink, AlertCircle, Hash, Copy, CalendarDays, Gift, Banknote, FileText, CalendarRange } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useLanguage } from '@/i18n/LanguageContext';
import { extendStatusStyle } from '@/utils/extend-ui';
import type { FormSubmission, FormSubmissionExtend } from '@/utils/supabase';
import type { ExtendPaymentInfo } from '@/components/ProgressTracker';
import type { OrderUiState } from './deriveOrderUiState';
import {
    buildAiringPeriods,
    getOriginalPanelState,
    pickDefaultExpandedKey,
    type AiringPeriod,
} from './airingPeriods';
import { PeriodStepper } from './PeriodStepper';
import { PeriodActionPanel } from './PeriodActionPanel';

const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

interface AiringPeriodsSectionProps {
    submission: FormSubmission;
    ui: OrderUiState;
    extends_: FormSubmissionExtend[];
    extendPayments: Record<string, ExtendPaymentInfo>;
    /** views_count dari survey_pages — indikator performa iklan, tampil begitu pernah tayang */
    viewsCount?: number;
    /** payment_id transaksi utama — link invoice jadwal iklan pertama */
    invoiceId?: string | null;
    isPaid: boolean;
    onReschedule: () => void;
}

function PeriodChip({ period }: { period: AiringPeriod }) {
    const style = extendStatusStyle(period.chipStatus);
    return (
        <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            {period.chipLabel}
        </span>
    );
}

/** Baris ringkas periode: label + rentang tanggal (+ chip status saat multi-periode). */
function PeriodRowSummary({ period, showChip }: { period: AiringPeriod; showChip: boolean }) {
    return (
        <span className="flex flex-1 items-center gap-2 min-w-0 text-left">
            <span className={`text-xs font-bold shrink-0 ${period.chipStatus === 'cancelled' ? 'text-gray-400' : 'text-[#1a1a1a]'}`}>
                {period.label}
            </span>
            <span className="text-[11px] text-gray-500 truncate">{period.dateRange}</span>
            <span className="flex-1" />
            {showChip && <PeriodChip period={period} />}
        </span>
    );
}

/**
 * Section periode iklan: semua periode (asli + tiap perpanjangan) sebagai unit
 * setara — masing-masing membawa panel aksi ("sekarang gimana" + CTA) dan
 * stepper monoton miliknya sendiri. Satu periode paling relevan terbuka
 * default; sisanya baris ringkas yang bisa di-tap. Chip status hanya muncul
 * saat multi-periode (order 1 periode: panel+stepper sudah bercerita).
 */
export function AiringPeriodsSection({ submission, ui, extends_, extendPayments, viewsCount, invoiceId, isPaid, onReschedule }: AiringPeriodsSectionProps) {
    const { t } = useLanguage();

    const periods = buildAiringPeriods(submission, ui, extends_, extendPayments, t);
    const hasAired = periods.some((p) => p.chipStatus === 'live' || p.chipStatus === 'completed');
    const showChips = periods.length > 1;
    const originalPanelState = getOriginalPanelState(submission, ui);

    return (
        <div className="mt-4">
            {hasAired && typeof viewsCount === 'number' && (
                <div className="flex justify-end mb-1.5 px-0.5">
                    <span
                        className="flex items-center gap-1 text-[11px] font-semibold text-jfu-primary"
                        title={t('detailViews')}
                    >
                        <Eye className="w-3.5 h-3.5" />
                        {new Intl.NumberFormat('id-ID').format(viewsCount)} views
                    </span>
                </div>
            )}

            <Accordion
                type="single"
                collapsible
                defaultValue={pickDefaultExpandedKey(periods)}
                className="rounded-xl border border-gray-100 divide-y divide-gray-100"
            >
                {periods.map((period) =>
                    period.expandable ? (
                        <AccordionItem key={period.key} value={period.key} className="border-b-0 px-3">
                            <AccordionTrigger className="min-h-11 py-2.5 gap-2 hover:no-underline">
                                <PeriodRowSummary period={period} showChip={showChips} />
                            </AccordionTrigger>
                            <AccordionContent className="pb-3">
                                {period.kind === 'original' && originalPanelState && (
                                    <PeriodActionPanel
                                        state={originalPanelState}
                                        submission={submission}
                                        ui={ui}
                                        onReschedule={onReschedule}
                                    />
                                )}
                                {period.kind === 'extend' && <ExtendActionPanel period={period} />}
                                <PeriodStepper steps={period.steps} currentStep={period.currentStep} />
                                <PeriodInfo
                                    period={period}
                                    submission={submission}
                                    invoiceId={invoiceId}
                                    isPaid={isPaid}
                                />
                            </AccordionContent>
                        </AccordionItem>
                    ) : (
                        /* Extend dibatalkan: baris ringkas non-interaktif, tanpa stepper */
                        <div key={period.key} className="flex items-center min-h-11 py-2.5 px-3 opacity-70">
                            <PeriodRowSummary period={period} showChip={showChips} />
                        </div>
                    )
                )}
            </Accordion>
        </div>
    );
}

/** Panel aksi periode perpanjangan: bayar (nominal + CTA) / notis link kedaluwarsa. */
function ExtendActionPanel({ period }: { period: AiringPeriod }) {
    const { t } = useLanguage();
    const ext = period.ext!;
    const pay = period.pay;
    const canPay =
        (ext.submission_status || '').toLowerCase() === 'waiting_payment' &&
        pay?.status === 'pending' &&
        !!pay?.paymentUrl;

    if (period.hasExpiredPaymentLink) {
        return (
            <div className="rounded-xl border p-4 mb-3 border-rose-200 bg-rose-50/60">
                <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                    <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('extendExpiredHint')}</p>
                </div>
            </div>
        );
    }

    if (!canPay) return null;

    return (
        <div className="rounded-xl border p-4 mb-3 border-amber-200 bg-amber-50/60">
            <div className="flex gap-3">
                <CreditCard className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                <div className="flex-1 min-w-0 md:flex md:items-center md:justify-between md:gap-4">
                    <div className="min-w-0 md:flex-1">
                        <p className="text-sm text-[#1a1a1a] leading-relaxed">{t('extendWaitingPaymentAlert')}</p>
                        {pay!.amount > 0 && (
                            <p className="text-sm font-bold text-[#1a1a1a] mt-1">
                                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(pay!.amount)}
                            </p>
                        )}
                    </div>
                    <div className="shrink-0 max-md:mt-3">
                        <a
                            href={pay!.paymentUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 max-md:w-full min-h-11 md:min-h-9 px-4 text-xs whitespace-nowrap rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 transition-all"
                        >
                            <CreditCard className="w-3.5 h-3.5" />
                            {t('payExtension')}
                            <ExternalLink className="w-3 h-3 opacity-70" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** ID order yang bisa di-tap untuk menyalin UUID lengkap (pelaporan komplain). */
function CopyableOrderId({ id }: { id: string }) {
    const { t } = useLanguage();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(id);
            toast.success(t('orderIdCopied'));
        } catch {
            /* clipboard tidak tersedia (mis. non-HTTPS) — biarkan senyap */
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

interface PeriodInfoProps {
    period: AiringPeriod;
    submission: FormSubmission;
    invoiceId?: string | null;
    isPaid: boolean;
}

/**
 * Info administrasi MILIK satu jadwal iklan (menggantikan section "Info Order"
 * yang ambigu saat multi-jadwal): Order ID (jadwal pertama = submission.id,
 * perpanjangan = ext.id), tanggal diajukan, durasi, periode (batch bulan,
 * dari end_date), insentif sesuai aturan periode, total biaya, dan invoice.
 *
 * Aturan insentif (periode = bulan dari TANGGAL BERAKHIR iklan):
 * - Periode sama: insentif opsional; jika ada, diakumulasi ke pool sebelumnya
 *   (additional_prize_per_winner).
 * - Periode baru: insentif wajib = pool baru (winner_count × prize_per_winner).
 */
function PeriodInfo({ period, submission, invoiceId, isPaid }: PeriodInfoProps) {
    const { t } = useLanguage();
    const ext = period.kind === 'extend' ? period.ext : undefined;

    const id = ext ? ext.id : submission.id;
    const createdAt = ext ? ext.created_at : submission.created_at;
    const duration = ext ? ext.duration : submission.duration;
    const totalCost = ext ? ext.total_cost : submission.total_cost;

    // Invoice per jadwal: jadwal pertama pakai payment_id transaksi utama;
    // perpanjangan pakai payment_id transaksinya sendiri (InvoicePage generik
    // by payment_id, jadi rute /invoices/:paymentId berlaku untuk keduanya).
    const extPaid = !!ext && ['paid', 'scheduled', 'live', 'completed'].includes((ext.submission_status || '').toLowerCase());
    const periodInvoiceId = ext
        ? (extPaid && period.pay?.paymentId) || null
        : (isPaid && invoiceId) || null;

    const rows: Array<{ key: string; icon: React.ReactNode; label: string; value: React.ReactNode }> = [];
    const iconCls = 'w-4 h-4 text-gray-400 shrink-0';

    if (id) {
        rows.push({ key: 'id', icon: <Hash className={iconCls} />, label: t('orderId'), value: <CopyableOrderId id={id} /> });
    }

    if (createdAt) {
        rows.push({
            key: 'created',
            icon: <CalendarDays className={iconCls} />,
            label: t('submittedOn'),
            value: new Date(createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        });
    }

    rows.push({
        key: 'duration',
        icon: <Clock className={iconCls} />,
        label: t('adDuration'),
        value: `${duration} ${t('days')}`,
    });

    if (ext?.period_batch) {
        rows.push({
            key: 'batch',
            icon: <CalendarRange className={iconCls} />,
            label: t('periodBatchLabel'),
            value: <span className="font-mono text-xs">{ext.period_batch}</span>,
        });
    }

    if (ext) {
        if (ext.is_new_month && ext.prize_per_winner && ext.prize_per_winner > 0) {
            // Periode baru → pool insentif baru (wajib)
            rows.push({
                key: 'prize',
                icon: <Gift className={iconCls} />,
                label: t('detailPrize'),
                value: (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {ext.winner_count} × {formatRupiah(ext.prize_per_winner)}
                        <Badge variant="outline" className="px-1.5 py-0 h-4 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full">
                            {t('incentiveNewPeriod')}
                        </Badge>
                    </span>
                ),
            });
        } else if (ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0) {
            // Periode sama → tambahan opsional, diakumulasi ke pool berjalan
            rows.push({
                key: 'prize',
                icon: <Gift className={iconCls} />,
                label: t('detailPrize'),
                value: (
                    <span>
                        +{formatRupiah(ext.additional_prize_per_winner)}
                        <span className="block text-xs text-gray-500">{t('incentiveAccumulated')}</span>
                    </span>
                ),
            });
        }
    } else if (submission.winner_count && submission.prize_per_winner) {
        rows.push({
            key: 'prize',
            icon: <Gift className={iconCls} />,
            label: t('detailPrize'),
            value: `${submission.winner_count} × ${formatRupiah(submission.prize_per_winner)}`,
        });
    }

    if (totalCost > 0) {
        rows.push({
            key: 'cost',
            icon: <Banknote className={iconCls} />,
            label: t('totalCost'),
            value: formatRupiah(totalCost),
        });
    }

    if (periodInvoiceId) {
        rows.push({
            key: 'invoice',
            icon: <FileText className={iconCls} />,
            label: 'Invoice',
            value: (
                <a
                    href={`/invoices/${periodInvoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jfu-primary hover:text-jfu-dark hover:underline"
                >
                    {t('downloadReceipt')}
                </a>
            ),
        });
    }

    return (
        <dl className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
            {rows.map((row) => (
                <div key={row.key} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5">{row.icon}</span>
                    <dt className="text-[#666] w-32 shrink-0">{row.label}</dt>
                    <dd className="text-[#1a1a1a] min-w-0">{row.value}</dd>
                </div>
            ))}
        </dl>
    );
}
