import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Info, Sparkles, LogOut } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ProfileForm } from '@/components/ProfileForm';

/**
 * Halaman profil researcher (konsep 1 akun = 1 researcher).
 * Dua mode dalam satu komponen:
 * - Onboarding: profil belum lengkap (user Google / user lama) → wajib diisi
 *   sebelum bisa memasang survei.
 * - Edit: profil sudah lengkap → tempat mengubah biodata kapan saja.
 * Form + logic simpan hidup di ProfileForm (dipakai juga oleh
 * ProfileCompletionSheet, drawer gate profil di flow submit-iklan).
 */
export function ProfilePage() {
    const { signOut } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };
    const [searchParams] = useSearchParams();
    const nextPath = searchParams.get('next');

    const [isOnboarding, setIsOnboarding] = useState(false);

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    {isOnboarding ? t('profileCompleteTitle') : t('profileTitle')}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                    {isOnboarding ? t('onboardingDesc') : t('profileDesc')}
                </p>
            </div>

            {/* Callout Info Card (Always Visible) */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 mb-8 flex gap-4 items-start shadow-sm">
                <div className="p-2 bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 rounded-xl flex-shrink-0 mt-0.5">
                    <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-2 flex-1">
                    <h4 className="text-sm font-semibold text-blue-950 dark:text-blue-100">{t('makeResearchEasier')}</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed font-medium">
                        {t('profilePageCalloutText')}
                    </p>
                    <div className="flex items-center gap-1.5 pt-1 text-[11px] text-blue-600/80 dark:text-blue-400/80 font-medium">
                        <Info className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{t('invoiceDetailsChangeable')}</span>
                    </div>
                </div>
            </div>

            <ProfileForm
                continueAfterSave={!!nextPath}
                onLoaded={setIsOnboarding}
                onSaved={() => {
                    if (nextPath) {
                        navigate(nextPath, { replace: true });
                    } else {
                        setIsOnboarding(false);
                    }
                }}
            />

            {/* Bahasa & keluar — juga tersedia di dropdown avatar AppNav;
                dipertahankan di sini sebagai akses eksplisit di mobile. */}
            <div className="md:hidden mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide uppercase">Language</span>
                    <LanguageSwitcher />
                </div>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    {t('signOut')}
                </button>
            </div>
        </div>
    );
}
