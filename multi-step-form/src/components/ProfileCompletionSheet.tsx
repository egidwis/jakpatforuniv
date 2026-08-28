import { useEffect } from 'react';
import { ProfileForm } from '@/components/ProfileForm';
import { useLanguage } from '@/i18n/LanguageContext';
import { UserCheck, X } from 'lucide-react';

interface ProfileCompletionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Dipanggil setelah profil tersimpan lengkap — lanjutkan flow yang tertunda. */
    onCompleted: () => void;
}

/**
 * Modal popup kelengkapan profil (Desain seragam dengan CustomMissionModal / Riset Non-Survei).
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

    // Handle ESC key untuk menutup modal
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onOpenChange]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) onOpenChange(false);
            }}
        >
            <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-gray-100 shadow-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                {/* Mobile Drag Handle Indicator */}
                <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white shrink-0">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/25 shrink-0">
                            <UserCheck className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">
                                {t('profileSheetTitle')}
                            </h2>
                            <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                                {t('profileSheetDesc')}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        aria-label={t('closePopup')}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer shrink-0 ml-3"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable Form Body */}
                <div className="overflow-y-auto p-5 sm:p-8 space-y-5 sm:space-y-6 flex-1 overscroll-contain">
                    <ProfileForm continueAfterSave onSaved={onCompleted} />
                </div>
            </div>
        </div>
    );
}
