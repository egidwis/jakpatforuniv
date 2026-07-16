import { FileText, Gift, Users, Link as LinkIcon, CalendarDays, Info } from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from './ui/accordion';
import { useLanguage } from '../i18n/LanguageContext';
import { UserExtendHistory } from './UserExtendHistory';
import type { FormSubmission, FormSubmissionExtend } from '@/utils/supabase';
import type { ExtendPaymentInfo } from './ProgressTracker';

const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

interface OrderDetailsSectionProps {
    submission: FormSubmission;
    extends_: FormSubmissionExtend[];
    extendPayments: Record<string, ExtendPaymentInfo>;
    invoiceId?: string | null;
    isPaid: boolean;
}

/**
 * Info non-esensial kartu order, default tertutup: meta survei, tanggal
 * pengajuan, invoice, riwayat perpanjangan, dan copy ekspektasi layanan.
 */
export function OrderDetailsSection({ submission, extends_, extendPayments, invoiceId, isPaid }: OrderDetailsSectionProps) {
    const { t } = useLanguage();

    const rows: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
        {
            icon: <FileText className="w-4 h-4 text-gray-400 shrink-0" />,
            label: t('detailQuestions'),
            value: `${submission.question_count}`,
        },
    ];

    if (submission.winner_count && submission.prize_per_winner) {
        rows.push({
            icon: <Gift className="w-4 h-4 text-gray-400 shrink-0" />,
            label: t('detailPrize'),
            value: `${submission.winner_count} × ${formatRupiah(submission.prize_per_winner)}`,
        });
    }

    if (submission.criteria_responden) {
        rows.push({
            icon: <Users className="w-4 h-4 text-gray-400 shrink-0" />,
            label: t('detailCriteria'),
            value: submission.criteria_responden,
        });
    }

    if (submission.survey_url) {
        rows.push({
            icon: <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" />,
            label: t('detailSurveyLink'),
            value: (
                <a
                    href={submission.survey_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jfu-primary hover:text-jfu-dark hover:underline break-all"
                >
                    {t('viewSurvey')}
                </a>
            ),
        });
    }

    rows.push({
        icon: <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />,
        label: t('submittedOn'),
        value: new Date(submission.created_at || new Date()).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }),
    });

    if (isPaid && invoiceId) {
        rows.push({
            icon: <FileText className="w-4 h-4 text-gray-400 shrink-0" />,
            label: 'Invoice',
            value: (
                <a
                    href={`/invoices/${invoiceId}`}
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
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details" className="border-b-0 mt-4">
                {/* Trigger DNA: pill lembut, label semibold normal-case */}
                <AccordionTrigger className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-[#555] hover:no-underline hover:border-jfu-primary/30 hover:text-jfu-primary transition-colors">
                    {t('orderDetails')}
                </AccordionTrigger>
                <AccordionContent className="pt-3">
                    <div className="md:grid md:grid-cols-2 md:gap-x-8">
                        <dl className="space-y-2.5">
                            {rows.map((row) => (
                                <div key={row.label} className="flex items-start gap-2.5 text-sm">
                                    <span className="mt-0.5">{row.icon}</span>
                                    <dt className="text-[#666] w-32 shrink-0">{row.label}</dt>
                                    <dd className="text-[#1a1a1a] min-w-0">{row.value}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="mt-4 md:mt-0">
                            {/* Info layanan: panel tint biru muda ala landing */}
                            <div className="rounded-xl border border-jfu-primary/15 bg-jfu-primary/[0.04] overflow-hidden">
                                <div className="flex items-start gap-2.5 p-3">
                                    <Info className="w-4 h-4 text-jfu-primary/70 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-[#1a1a1a]">{t('aboutService')}</p>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('aboutServiceBody')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Riwayat perpanjangan durasi (readonly) */}
                    <UserExtendHistory extends_={extends_} payments={extendPayments} />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
