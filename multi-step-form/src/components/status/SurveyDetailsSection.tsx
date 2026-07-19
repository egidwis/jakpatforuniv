import { AlignLeft, Users } from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../ui/accordion';
import { useLanguage } from '../../i18n/LanguageContext';
import type { FormSubmission } from '@/utils/supabase';

/**
 * Accordion "Detail Survei" (default tertutup): info tentang SURVEI yang
 * diiklankan — deskripsi + kriteria responden. Info administrasi per jadwal
 * (Order ID, durasi, insentif, invoice) ada di baris jadwal iklan masing-
 * masing (PeriodInfo di AiringPeriodsSection), bukan di sini.
 */
export function SurveyDetailsSection({ submission }: { submission: FormSubmission }) {
    const { t } = useLanguage();

    // Import Google Form tanpa deskripsi menghasilkan placeholder literal —
    // jangan ditampilkan seolah deskripsi asli.
    const desc = (submission.description || '').trim();
    const description = /^form description not available$/i.test(desc) ? '' : desc;

    const rows: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [];

    if (description) {
        rows.push({
            icon: <AlignLeft className="w-4 h-4 text-gray-400 shrink-0" />,
            label: t('detailDescription'),
            value: description,
        });
    }

    if (submission.criteria_responden) {
        rows.push({
            icon: <Users className="w-4 h-4 text-gray-400 shrink-0" />,
            label: t('detailCriteria'),
            value: submission.criteria_responden,
        });
    }

    if (rows.length === 0) return null;

    return (
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="survey-details" className="border-b-0">
                <AccordionTrigger className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-[#555] hover:no-underline hover:border-jfu-primary/30 hover:text-jfu-primary transition-colors">
                    {t('surveyDetails')}
                </AccordionTrigger>
                <AccordionContent className="pt-3">
                    <dl className="space-y-2.5">
                        {rows.map((row) => (
                            <div key={row.label} className="flex items-start gap-2.5 text-sm">
                                <span className="mt-0.5">{row.icon}</span>
                                <dt className="text-[#666] w-32 shrink-0">{row.label}</dt>
                                <dd className="text-[#1a1a1a] min-w-0">{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
