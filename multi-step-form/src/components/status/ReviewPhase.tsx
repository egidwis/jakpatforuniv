import { Link } from 'react-router-dom';
import { AlertCircle, Bot, FileText, Link2, Trash2, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import type { FormSubmission } from '@/utils/supabase';
import { getCurrentStepIndex } from '@/components/ProgressTracker';
import { isAutoReviewed } from './deriveOrderUiState';

interface ReviewPhaseProps {
    submission: FormSubmission;
    onDelete: () => void;
    /** Fase ① sedang berjalan (`getActiveDashboardPhase(ui.currentStep) === 1`)
     * — kartu default terbuka. Kalau tidak (sudah lewat/belum sampai), default
     * tertutup; user tetap bisa expand manual. */
    active: boolean;
}

const ctaButtonClass = 'max-md:w-full min-h-11 md:min-h-9 justify-center whitespace-nowrap';
const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';

/** Chip status review — dipasang di trigger accordion Fase ① (lihat
 * `ReviewPhase` di bawah). `t` dioper sebagai parameter (bukan
 * `useLanguage()` di dalam fungsi ini) karena fungsi ini bukan komponen
 * React — pemanggil (StatusPage) yang sudah berada dalam render komponen
 * menyediakan `t`. */
export function getReviewChip(submission: FormSubmission, t: (key: TranslationKey) => string) {
    const step = getCurrentStepIndex(submission);
    if (step === -1) {
        return (
            <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-rose-50 border-rose-200 text-rose-600">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                {t('reviewChipRejected')}
            </span>
        );
    }
    if (step === 0) {
        return (
            <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-gray-50 border-gray-200 text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                {t('reviewChipPending')}
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-emerald-50 border-emerald-200 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t('reviewChipApproved')}
        </span>
    );
}

/**
 * Fase ① — identitas survei (link, jumlah pertanyaan, kriteria, deskripsi)
 * dan status review. Semua info survei yang dulu tinggal di header kartu
 * pindah ke sini (keputusan product owner 2026-07-19): header kartu kini
 * minimal, identitas lengkap dimiliki fase ini. Dibungkus jadi collapse
 * card satu-item, mengikuti pola accordion Fase ② — trigger menampilkan
 * link/ringkasan survei + chip status review (dulu ada di header Fase),
 * expand untuk detail lengkap + banner status.
 */
export function ReviewPhase({ submission, onDelete, active }: ReviewPhaseProps) {
    const { t } = useLanguage();
    const step = getCurrentStepIndex(submission);
    const rejected = step === -1;
    const inReview = step === 0;

    const desc = (submission.description || '').trim();
    const description = /^form description not available$/i.test(desc) ? '' : desc;

    return (
        <Accordion type="single" collapsible defaultValue={active ? 'review' : undefined} className="rounded-xl border border-gray-100 divide-y divide-gray-100">
            <AccordionItem value="review" className="border-b-0 px-3">
                <AccordionTrigger className="min-h-11 py-2.5 gap-2 hover:no-underline">
                    <span className="flex flex-1 items-center gap-2 min-w-0 text-left">
                        {submission.survey_url ? (
                            <span className="flex items-center gap-1.5 min-w-0 text-sm">
                                <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="truncate text-[#1a1a1a] font-medium">{submission.survey_url.replace(/^https?:\/\//, '')}</span>
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 min-w-0 text-sm">
                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="truncate text-[#1a1a1a] font-medium">{submission.question_count} {t('questionsUnit')}</span>
                            </span>
                        )}
                        <span className="flex-1" />
                        {getReviewChip(submission, t)}
                    </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3 pt-1.5 space-y-3">
                    {rejected && (
                        <div className="rounded-xl border p-3 border-rose-200 bg-rose-50/60">
                            <div className="flex gap-2.5">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                                <div className="flex-1 min-w-0">
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
                                    <div className="flex max-md:flex-col flex-wrap gap-2 mt-3">
                                        <Link to="/dashboard/submit-iklan" className="max-md:w-full">
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
                                </div>
                            </div>
                        </div>
                    )}

                    {inReview && (
                        <div className="rounded-xl border p-3 border-gray-200 bg-gray-50">
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {isAutoReviewed(submission) ? t('calloutReviewAuto') : t('calloutReviewManual')}
                            </p>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        {/* Stack satu kolom, bukan class `grid` — styles.css legacy
                            `.grid { gap: 1.5rem }` menang cascade & merenggangkan baris. */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-sm">
                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="text-[#1a1a1a] font-medium">{submission.question_count} {t('questionsUnit')}</span>
                            </div>
                            {submission.criteria_responden && (
                                <div className="flex items-start gap-1.5 text-sm">
                                    <Users className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                    <span className="text-[#1a1a1a]">{submission.criteria_responden}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 text-sm">
                                {isAutoReviewed(submission) ? (
                                    <Bot className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                ) : (
                                    <UserCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                )}
                                <span className="text-[#1a1a1a]">{isAutoReviewed(submission) ? t('reviewMethodAuto') : t('reviewMethodManual')}</span>
                            </div>
                        </div>
                        {description && (
                            <p className="text-sm text-gray-600 leading-relaxed pt-1.5">{description}</p>
                        )}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
