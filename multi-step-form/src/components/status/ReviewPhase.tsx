import { useState } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
    AlertCircle,
    Bot,
    CheckCircle2,
    ChevronDown,
    FileText,
    Link2,
    Loader2,
    PenLine,
    Trash2,
    UserCheck,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
} from '@/components/ui/accordion';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { InfoTooltip } from './InfoTooltip';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import {
    updateFormStatus,
    updateFormDetails,
    type AdScheduleEntry,
    type FormSubmission,
} from '@/utils/supabase';
import type { ReviewHistoryEntry } from '@/components/submissions/types';
import { isAutoReviewed } from './deriveOrderUiState';
import { toast } from 'sonner';

/**
 * Keadaan review sebuah order — sumbu sendiri sejak `sql/46`, tidak lagi
 * disimpulkan dari langkah stepper.
 *
 * Bedanya nyata: dulu chip ini dibaca dari `getCurrentStepIndex`, yang
 * mencampur review dengan tayang. Order yang **ditolak** tapi terlanjur punya
 * tanggal jatuh ke langkah 2 dan chipnya menyala hijau "Disetujui" — 70 order
 * ada di keadaan itu per 2026-08-08 (65 spam, 5 rejected).
 */
export type ReviewState = 'rejected' | 'pending' | 'approved';

export function reviewStateOf(first: AdScheduleEntry): ReviewState {
    if (['rejected', 'spam'].includes(first.reviewStatus)) return 'rejected';
    return first.reviewStatus === 'approved' ? 'approved' : 'pending';
}

interface ReviewPhaseProps {
    submission: FormSubmission;
    /** Jadwal pertama (ordinal 1) — pembawa sumbu review order ini. */
    first: AdScheduleEntry;
    onDelete: () => void;
    onDataUpdated?: () => void;
    /** Fase ① sedang berjalan (`getActiveDashboardPhase(ui.currentStep) === 1`)
     * — kartu default terbuka. Kalau tidak (sudah lewat/belum sampai), default
     * tertutup; user tetap bisa expand manual. */
    active: boolean;
}

/** Chip status review — dipasang di trigger accordion Fase ① (lihat
 * `ReviewPhase` di bawah). `t` dioper sebagai parameter (bukan
 * `useLanguage()` di dalam fungsi ini) karena fungsi ini bukan komponen
 * React — pemanggil (StatusPage) yang sudah berada dalam render komponen
 * menyediakan `t`. */
export function getReviewChip(first: AdScheduleEntry, t: (key: TranslationKey) => string) {
    const state = reviewStateOf(first);
    if (state === 'rejected') {
        return (
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shrink-0 bg-rose-50 border-rose-200/80 text-rose-700">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {t('reviewChipRejected')}
            </span>
        );
    }
    if (state === 'pending') {
        return (
            <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shrink-0 bg-sky-50 border-sky-200/80 text-sky-700">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                {t('reviewChipPending')}
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shrink-0 bg-emerald-50 border-emerald-200/80 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t('reviewChipApproved')}
        </span>
    );
}

/**
 * Metode review sebagai chip + tooltip. Label chip menyebut SUMBER form
 * (Google Forms / Manual) karena itulah yang menentukan bisa-tidaknya diperiksa
 * otomatis; tooltip menjelaskan SIAPA yang mereview. Dulu dua fakta ini
 * dipadatkan jadi satu kalimat ("Review Otomatis - Google Form") yang jadi
 * panjang tanpa memperjelas apa pun.
 *
 * Belum ada chip Microsoft Forms: jalur itu belum diimplementasikan, dan
 * `forms.office.com` saat ini jatuh ke `submission_method='manual'` (lihat
 * `isManualForm` di StepCheckout) — jadi ia memang tampil sebagai "Manual".
 *
 * Ikon dibiarkan DI LUAR chip supaya baris ini rata kiri dengan baris "N
 * pertanyaan" & kriteria di atasnya — chip-nya sendiri cuma memuat label.
 * Keterangan pindah ke ⓘ di sebelah kanan chip, pola yang sama dengan rumus
 * biaya di Fase ②.
 */
function ReviewMethodChip({ auto }: { auto: boolean }) {
    const { t } = useLanguage();
    return (
        <>
            {auto ? (
                <Bot className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : (
                <UserCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            )}
            <span className="text-[#1a1a1a] font-bold text-xs">
                {t(auto ? 'reviewMethodAuto' : 'reviewMethodManual')}
            </span>
            <InfoTooltip content={t(auto ? 'reviewMethodAutoHint' : 'reviewMethodManualHint')} />
        </>
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
export function ReviewPhase({ submission, first, onDelete, onDataUpdated, active }: ReviewPhaseProps) {
    const { t } = useLanguage();
    const state = reviewStateOf(first);
    const rejected = state === 'rejected';
    const inReview = state === 'pending';

    const [isSubmittingReReview, setIsSubmittingReReview] = useState(false);
    const [isEditLinkOpen, setIsEditLinkOpen] = useState(false);
    const [newSurveyUrl, setNewSurveyUrl] = useState(submission.survey_url || '');
    const [isSavingLink, setIsSavingLink] = useState(false);

    /** Selama masih di step 0 metodenya PASTI manual — `isAutoReviewed` cuma
     * label retrospektif untuk order yang sudah lolos, jadi baru dipercaya
     * setelah review kelar. */
    const showsAutoMethod = !inReview && isAutoReviewed(submission);

    const handleRequestReReview = async () => {
        if (!submission.id) return;
        setIsSubmittingReReview(true);
        try {
            const newHistoryEntry: ReviewHistoryEntry = {
                action: 'in_review',
                notes: 'Peneliti mengajukan review ulang setelah perbaikan kuesioner.',
                timestamp: new Date().toISOString(),
            };
            const updatedHistory = [
                ...((submission as any).review_history || []),
                newHistoryEntry,
            ];
            await updateFormStatus(submission.id, 'in_review', submission.admin_notes, updatedHistory);
            toast.success('Pengajuan review ulang berhasil dikirimkan ke tim reviewer.');
            onDataUpdated?.();
        } catch (error) {
            console.error('Failed to request re-review:', error);
            toast.error('Gagal mengajukan review ulang. Silakan coba lagi.');
        } finally {
            setIsSubmittingReReview(false);
        }
    };

    const handleSaveNewLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!submission.id || !newSurveyUrl.trim()) return;
        setIsSavingLink(true);
        try {
            // Hanya tautannya — judul/jumlah pertanyaan/durasi sengaja TIDAK ikut
            // dikirim supaya suntingan admin tidak tertimpa salinan lokal yang basi.
            await updateFormDetails(submission.id, {
                survey_url: newSurveyUrl.trim(),
            });
            const newHistoryEntry: ReviewHistoryEntry = {
                action: 'in_review',
                notes: 'Peneliti memperbarui tautan survei dan mengajukan review ulang.',
                timestamp: new Date().toISOString(),
            };
            const updatedHistory = [
                ...((submission as any).review_history || []),
                newHistoryEntry,
            ];
            await updateFormStatus(submission.id, 'in_review', submission.admin_notes, updatedHistory);
            toast.success('Link kuesioner diperbarui dan diajukan untuk review ulang.');
            setIsEditLinkOpen(false);
            onDataUpdated?.();
        } catch (error) {
            console.error('Failed to update survey URL:', error);
            toast.error('Gagal memperbarui link kuesioner.');
        } finally {
            setIsSavingLink(false);
        }
    };

    return (
        <>
            <Accordion type="single" collapsible defaultValue={active ? 'review' : undefined} className="rounded-xl border border-slate-200/80 bg-slate-50/40 divide-y divide-slate-100 overflow-hidden shadow-2xs">
                <AccordionItem value="review" className="border-b-0 px-3.5">
                    <AccordionPrimitive.Header className="flex items-center gap-1 [&[data-state=open]>svg]:rotate-180">
                        <AccordionPrimitive.Trigger className="flex flex-1 items-center gap-2 min-h-11 py-2.5 min-w-0 text-left font-medium hover:bg-slate-100/40 transition-colors">
                            <span className="flex items-center gap-1.5 min-w-0 text-sm">
                                <ReviewMethodChip auto={showsAutoMethod} />
                            </span>
                            <span className="flex-1 min-w-2" />
                            {getReviewChip(first, t)}
                        </AccordionPrimitive.Trigger>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200" />
                    </AccordionPrimitive.Header>
                    <AccordionContent className="pb-4 pt-1.5 space-y-3.5 bg-white -mx-3.5 px-3.5 border-t border-slate-100">
                        {rejected && (
                            <div className="rounded-xl border p-4 border-amber-200/90 bg-amber-50/60 shadow-xs space-y-3.5">
                                <div className="flex items-start gap-2.5">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                                    <div className="flex-1 min-w-0 space-y-3">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 leading-snug">{t('reviewTitleRejected')}</p>
                                            <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
                                                {t('reviewSubRejected')}
                                            </p>
                                        </div>

                                        {submission.admin_notes && (
                                            <div className="bg-white/95 border border-amber-200/90 rounded-lg p-3 text-xs space-y-1 shadow-xs">
                                                <span className="font-semibold text-amber-900 block text-[11px] uppercase tracking-wider">
                                                    {t('reviewerNotesTitle')}:
                                                </span>
                                                <p className="whitespace-pre-line leading-relaxed text-gray-800 font-normal">
                                                    &ldquo;{submission.admin_notes}&rdquo;
                                                </p>
                                            </div>
                                        )}

                                        {submission.detected_keywords && submission.detected_keywords.length > 0 && (
                                            <div className="rounded-lg bg-rose-50 border border-rose-200/80 px-3 py-2 text-xs text-rose-700 font-medium">
                                                {t('calloutDetectedKeywords')} {submission.detected_keywords.join(', ')}
                                            </div>
                                        )}

                                        <p className="text-xs text-gray-600 font-normal">
                                            {t('reviewGuideText')}
                                        </p>

                                        <div className="pt-1">
                                            {/* Desktop & Tablet: Horizontal left-aligned row */}
                                            <div className="hidden sm:flex items-center gap-2 flex-wrap">
                                                <Button
                                                    size="sm"
                                                    disabled={isSubmittingReReview}
                                                    onClick={handleRequestReReview}
                                                    className="rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light hover:from-jfu-primary hover:to-jfu-light shadow-sm text-xs px-4 h-9 gap-1.5 transition-all"
                                                >
                                                    {isSubmittingReReview ? (
                                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('submittingReReview')}</>
                                                    ) : (
                                                        <><CheckCircle2 className="w-3.5 h-3.5" /> {t('btnConfirmFixed')}</>
                                                    )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setNewSurveyUrl(submission.survey_url || '');
                                                        setIsEditLinkOpen(true);
                                                    }}
                                                    className="rounded-full font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-xs px-3.5 h-9 gap-1.5 shadow-xs transition-all"
                                                >
                                                    <PenLine className="w-3.5 h-3.5 text-gray-500" /> {t('btnChangeLink')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={onDelete}
                                                    className="rounded-full font-semibold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-xs px-3.5 h-9 gap-1.5 shadow-xs transition-all ml-auto"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> {t('btnDeleteForm')}
                                                </Button>
                                            </div>

                                            {/* Mobile View (< 640px) */}
                                            <div className="sm:hidden space-y-2">
                                                <Button
                                                    size="sm"
                                                    disabled={isSubmittingReReview}
                                                    onClick={handleRequestReReview}
                                                    className="w-full rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light hover:from-jfu-primary hover:to-jfu-light shadow-sm text-xs px-4 h-10 gap-1.5 transition-all justify-center"
                                                >
                                                    {isSubmittingReReview ? (
                                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('submittingReReview')}</>
                                                    ) : (
                                                        <><CheckCircle2 className="w-3.5 h-3.5" /> {t('btnConfirmFixed')}</>
                                                    )}
                                                </Button>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setNewSurveyUrl(submission.survey_url || '');
                                                            setIsEditLinkOpen(true);
                                                        }}
                                                        className="w-full rounded-full font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-xs px-2.5 h-9 gap-1.5 shadow-xs transition-all justify-center"
                                                    >
                                                        <PenLine className="w-3.5 h-3.5 text-gray-500" /> {t('btnChangeLink')}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={onDelete}
                                                        className="w-full rounded-full font-semibold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-xs px-2.5 h-9 gap-1.5 shadow-xs transition-all justify-center"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" /> {t('btnDeleteForm')}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {inReview && (
                            <div className="rounded-xl border p-3 border-gray-200 bg-gray-50">
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    {t('calloutReviewManual')}
                                </p>
                            </div>
                        )}

                        <dl className="[display:grid] grid-cols-[auto_1fr] sm:grid-cols-[9.5rem_1fr] gap-x-3 gap-y-2.5 items-start pt-1">
                            <dt className="flex items-center gap-1.5 text-xs text-[#888] whitespace-nowrap pt-0.5 pr-1">
                                <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {t('questionnaireLabel')}
                            </dt>
                            <dd className="text-sm font-medium min-w-0 break-words">
                                {submission.survey_url ? (
                                    <a
                                        href={submission.survey_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="truncate text-blue-600 font-medium hover:text-blue-700 hover:underline block"
                                        title={submission.survey_url}
                                    >
                                        {submission.survey_url.replace(/^https?:\/\//, '')}
                                    </a>
                                ) : (
                                    <span className="text-gray-400 font-normal">—</span>
                                )}
                            </dd>

                            <dt className="flex items-center gap-1.5 text-xs text-[#888] whitespace-nowrap pt-0.5 pr-1">
                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {t('questionsCountLabel')}
                            </dt>
                            <dd className="text-sm font-semibold text-gray-900 min-w-0 break-words">
                                {submission.question_count} {t('questionsItemUnit')}
                            </dd>

                            <dt className="flex items-center gap-1.5 text-xs text-[#888] whitespace-nowrap pt-0.5 pr-1">
                                <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {t('criteriaRespondentLabel')}
                            </dt>
                            <dd className="text-sm font-semibold text-gray-900 min-w-0 break-words">
                                {submission.criteria_responden || '—'}
                            </dd>
                        </dl>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>

            {/* Modal Ganti Link Form */}
            <Dialog open={isEditLinkOpen} onOpenChange={setIsEditLinkOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Ganti Link Kuesioner</DialogTitle>
                        <DialogDescription>
                            Masukkan URL kuesioner baru Anda (misal Google Form / Microsoft Form publik) untuk diajukan review ulang.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveNewLink} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <label htmlFor="new-survey-url" className="text-xs font-semibold text-slate-700">
                                URL Kuesioner Baru
                            </label>
                            <Input
                                id="new-survey-url"
                                type="url"
                                placeholder="https://forms.gle/..."
                                value={newSurveyUrl}
                                onChange={(e) => setNewSurveyUrl(e.target.value)}
                                required
                                className="text-xs"
                            />
                        </div>
                        <DialogFooter className="flex gap-2 justify-end pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditLinkOpen(false)}
                                disabled={isSavingLink}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isSavingLink || !newSurveyUrl.trim()}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                            >
                                {isSavingLink ? (
                                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Menyimpan...</>
                                ) : (
                                    'Simpan & Ajukan Review'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
