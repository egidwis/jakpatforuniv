import { useEffect } from 'react';
import { ProfileForm } from '@/components/ProfileForm';
import { useLanguage } from '@/i18n/LanguageContext';
import { X } from 'lucide-react';

interface ProfileCompletionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Dipanggil setelah profil tersimpan lengkap — lanjutkan flow yang tertunda. */
    onCompleted: () => void;
}

/**
 * Modal popup kelengkapan profil.
 * - Desktop: Centered modal popup yang ramping, rounded, dan berkelas.
 * - Mobile: Bottom sheet drawer dengan drag handle indicator.
 */
export function ProfileCompletionSheet({ open, onOpenChange, onCompleted }: ProfileCompletionSheetProps) {
    const { t } = useLanguage();

    // Lock body scroll saat modal terbuka
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    // Handle ESC key untuk menutup modal (jangan tutup bila popup autocomplete yang menangkap Escape)
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) onOpenChange(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onOpenChange]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) onOpenChange(false);
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-completion-sheet-title"
                className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200/90 shadow-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
            >
                {/* Mobile Drag Handle Indicator */}
                <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-white shrink-0">
                    <div className="w-10 h-1 bg-slate-200 rounded-full" />
                </div>

                {/* Header */}
                <div className="max-sm:px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-100 bg-white flex items-start justify-between gap-4 shrink-0">
                    <div className="min-w-0">
                        <h2
                            id="profile-completion-sheet-title"
                            className="text-base sm:text-lg font-bold text-slate-900 tracking-[-0.015em] leading-snug"
                        >
                            {t('profileSheetTitle')}
                        </h2>
                        <p className="text-xs sm:text-[13px] text-slate-500 leading-relaxed mt-0.5">
                            {t('profileSheetDesc')}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        aria-label={t('closePopup')}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable Form Body */}
                <div className="overflow-y-auto max-sm:px-5 sm:px-7 py-5 sm:py-6 flex-1 overscroll-contain">
                    <ProfileForm layout="sheet" continueAfterSave onSaved={onCompleted} />
                </div>
            </div>
        </div>
    );
}
