import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Globe, LogOut, Mail } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ProfileForm, getAcademicStatusLabel, type ProfileDraftSnapshot } from '@/components/ProfileForm';
import { Skeleton } from '@/components/ui/skeleton';

function initialsFrom(name: string, email: string): string {
    const src = (name || email || 'U').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return src.slice(0, 2).toUpperCase();
}

/**
 * Halaman profil researcher (konsep 1 akun = 1 researcher).
 * Tata letak 2 kolom (4:8) selaras dengan /dashboard:
 * - Kiri: ringkasan identitas akun, konteks invoice, bahasa, dan keluar.
 * - Kanan: satu kartu form terpadu tanpa banner promosi atau kartu warna-warni.
 */
export function ProfilePage() {
    const { user, signOut } = useAuth();
    const { t, language } = useLanguage();
    const isEn = language === 'en';
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextPath = searchParams.get('next');

    const [isOnboarding, setIsOnboarding] = useState(false);
    const [avatarError, setAvatarError] = useState(false);
    const [draft, setDraft] = useState<ProfileDraftSnapshot>({
        fullName: '',
        phoneNumber: '',
        university: '',
        department: '',
        status: '',
        loading: true,
    });

    const handleDraftChange = useCallback((next: ProfileDraftSnapshot) => {
        setDraft(next);
    }, []);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const displayName =
        draft.fullName.trim() ||
        user?.user_metadata?.full_name ||
        user?.email?.split('@')[0] ||
        'Researcher';
    const email = user?.email || '';
    const avatarUrl = user?.user_metadata?.avatar_url;
    const provider = user?.app_metadata?.provider === 'google' ? 'Google' : 'Email';
    const statusLabel = draft.status ? getAcademicStatusLabel(draft.status, t) : '';
    const hasAffiliation = Boolean(statusLabel || draft.university.trim() || draft.department.trim());

    return (
        <div className="max-w-5xl mx-auto max-md:px-4 md:px-6 pt-5 lg:pt-8 pb-6">
            {/* Dua kolom (4:8) selaras dengan StatusPage. ⚠️ Tanpa `relative` pada <aside>
                karena `.relative` di styles.css mengalahkan `lg:sticky`. */}
            <div className="grid lg:grid-cols-12 gap-6 items-start">
                {/* Kolom Kiri: Identitas Akun & Preferensi */}
                <aside className="lg:col-span-4 lg:sticky lg:top-24">
                    <section
                        aria-label={isEn ? 'Account summary' : 'Ringkasan akun'}
                        className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] overflow-hidden"
                    >
                        <div className="p-5 sm:p-6">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/70 text-jfu-primary font-bold text-base flex items-center justify-center overflow-hidden shrink-0">
                                    {avatarUrl && !avatarError ? (
                                        <img
                                            src={avatarUrl}
                                            alt={displayName}
                                            className="w-12 h-12 object-cover"
                                            onError={() => setAvatarError(true)}
                                        />
                                    ) : (
                                        <span>{initialsFrom(displayName, email)}</span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    {draft.loading ? (
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-32 rounded bg-slate-100" />
                                            <Skeleton className="h-3 w-44 rounded bg-slate-100" />
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-[15px] font-bold text-slate-900 leading-snug truncate m-0">
                                                {displayName}
                                            </p>
                                            {email && (
                                                <p className="text-xs text-slate-500 truncate mt-0.5 m-0">
                                                    {email}
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {!draft.loading && hasAffiliation && (
                                <dl className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs m-0">
                                    {statusLabel && (
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="text-slate-400 shrink-0">
                                                {isEn ? 'Role' : 'Status'}
                                            </dt>
                                            <dd className="font-semibold text-slate-700 text-right truncate m-0">
                                                {statusLabel}
                                            </dd>
                                        </div>
                                    )}
                                    {draft.university.trim() && (
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="text-slate-400 shrink-0">
                                                {isEn ? 'Institution' : 'Institusi'}
                                            </dt>
                                            <dd className="font-medium text-slate-700 text-right leading-snug m-0">
                                                {draft.university.trim()}
                                            </dd>
                                        </div>
                                    )}
                                    {draft.department.trim() && (
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="text-slate-400 shrink-0">
                                                {t('department')}
                                            </dt>
                                            <dd className="font-medium text-slate-700 text-right truncate m-0">
                                                {draft.department.trim()}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            )}

                            {!draft.loading && (
                                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                                        {isEn ? `Signed in with ${provider}` : `Masuk lewat ${provider}`}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Catatan konteks invoice (atau pengingat onboarding bila profil belum lengkap) */}
                        <div
                            className={`px-5 sm:px-6 py-3.5 border-t text-xs leading-relaxed ${
                                isOnboarding
                                    ? 'bg-amber-50/75 border-amber-100 text-amber-900'
                                    : 'bg-slate-50/70 border-slate-100 text-slate-500'
                            }`}
                        >
                            {isOnboarding ? (
                                t('onboardingDesc')
                            ) : (
                                <>
                                    {t('profileDesc')}{' '}
                                    <span className="text-slate-600 font-medium">
                                        {isEn
                                            ? 'Invoice details can still be edited at checkout.'
                                            : 'Detail invoice tetap dapat diubah saat checkout.'}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Preferensi Bahasa & Keluar */}
                        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                    <Globe className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                                    {t('language')}
                                </span>
                                <LanguageSwitcher />
                            </div>
                            <button
                                type="button"
                                onClick={handleSignOut}
                                className="w-full h-9 flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/60 text-xs font-semibold transition-colors cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                                {t('signOut')}
                            </button>
                        </div>
                    </section>
                </aside>

                {/* Kolom Kanan: Satu Kartu Form Terpadu */}
                <div className="lg:col-span-8 min-w-0">
                    <ProfileForm
                        layout="card"
                        heading={isOnboarding ? t('profileCompleteTitle') : t('profileTitle')}
                        subheading={
                            isOnboarding
                                ? (isEn ? 'Fill in your researcher biodata once to unlock survey orders.' : 'Lengkapi biodata peneliti sekali sebelum memasang survei.')
                                : (isEn ? 'Manage your contact information and academic affiliation.' : 'Kelola informasi kontak dan afiliasi akademik Anda.')
                        }
                        continueAfterSave={!!nextPath}
                        onLoaded={setIsOnboarding}
                        onDraftChange={handleDraftChange}
                        onSaved={() => {
                            if (nextPath) {
                                navigate(nextPath, { replace: true });
                            } else {
                                setIsOnboarding(false);
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
