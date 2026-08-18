import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ProfileForm } from '@/components/ProfileForm';
import { useLanguage } from '@/i18n/LanguageContext';

/** Breakpoint sm Tailwind — di bawahnya drawer jadi bottom sheet. */
const DESKTOP_QUERY = '(min-width: 640px)';

function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
    useEffect(() => {
        const mq = window.matchMedia(DESKTOP_QUERY);
        const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return isDesktop;
}

interface ProfileCompletionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Dipanggil setelah profil tersimpan lengkap — lanjutkan flow yang tertunda. */
    onCompleted: () => void;
}

/**
 * Drawer gate kelengkapan profil. Menggantikan redirect ke /dashboard/profile:
 * user melengkapi biodata di tempat, lalu flow lanjut tanpa berpindah halaman.
 * Desktop: slide dari kanan (konsisten dengan DetailSheet dashboard admin);
 * mobile: bottom sheet. Ditutup tanpa simpan → tidak ada yang hilang.
 */
export function ProfileCompletionSheet({ open, onOpenChange, onCompleted }: ProfileCompletionSheetProps) {
    const { t } = useLanguage();
    const isDesktop = useIsDesktop();

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isDesktop ? 'right' : 'bottom'}
                className={
                    isDesktop
                        ? 'flex w-full flex-col p-0 sm:max-w-xl overflow-y-auto bg-white'
                        : 'rounded-t-2xl border-t-0 p-0 max-h-[88vh] overflow-y-auto bg-white'
                }
            >
                <div className="px-5 py-6 md:px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                    <SheetHeader className="text-left mb-5">
                        <SheetTitle className="text-gray-900">{t('profileSheetTitle')}</SheetTitle>
                        <SheetDescription className="text-gray-500">{t('profileSheetDesc')}</SheetDescription>
                    </SheetHeader>
                    <ProfileForm continueAfterSave onSaved={onCompleted} />
                </div>
            </SheetContent>
        </Sheet>
    );
}
