import { Link } from 'react-router-dom';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { FormSubmission } from '@/utils/supabase';

interface RevisionNoticeProps {
    submission: FormSubmission;
    onDelete: () => void;
}

/**
 * Banner card-level untuk order yang perlu revisi (ditolak review) — satu-satunya
 * state yang TIDAK melebur ke baris periode: order ditolak berarti belum ada
 * periode tayang yang bermakna, dan CTA-nya (ajukan ulang/hapus) milik order.
 */
export function RevisionNotice({ submission, onDelete }: RevisionNoticeProps) {
    const { t } = useLanguage();

    const ctaButtonClass = 'max-md:w-full min-h-11 md:min-h-9 justify-center whitespace-nowrap';
    const ctaRoyal = 'rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all';

    return (
        <div className="rounded-xl border p-4 mb-4 border-rose-200 bg-rose-50/60">
            <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
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
                    {/* max-md:flex-col (bukan flex-col md:flex-row): .flex-col legacy
                        styles.css menang atas md:flex-row di cascade. */}
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
    );
}
