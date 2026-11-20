import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getOwnProfile, updateOwnProfile, isProfileComplete, getAuthUser, type ResearcherProfile, supabase } from '@/utils/supabase';
import { ACADEMIC_STATUS_OPTIONS, DEPARTMENT_OPTIONS, UNIVERSITY_OPTIONS, REFERRAL_SOURCE_OPTIONS, collapseReferralSource, expandReferralSource } from '@/constants/biodata';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

const getInputClass = (hasError: boolean) =>
    `w-full px-3.5 py-2.5 rounded-xl border transition-colors duration-150 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
        hasError
            ? 'border-red-500 hover:border-red-600 focus:ring-red-500/15 focus:border-red-500'
            : 'border-slate-200 hover:border-slate-300 focus:ring-jfu-primary/15 focus:border-jfu-primary'
    }`;

// Dynamic translations helper for options (tanpa emoji — nilai DB tetap persis sama)
export const getAcademicStatusLabel = (val: string, t: (key: any) => string) => {
    switch (val) {
        case 'Dosen': return t('academicStatusDosen');
        case 'Mahasiswa S3 (Doktor)': return t('academicStatusS3');
        case 'Mahasiswa S2 (Master)': return t('academicStatusS2');
        case 'Mahasiswa S1 (Sarjana)': return t('academicStatusS1');
        case 'Mahasiswa D3 (Diploma)': return t('academicStatusD3');
        case 'Pelajar SMA/SMK': return t('academicStatusSMA');
        default: return val;
    }
};

const getReferralLabel = (val: string, t: (key: any) => string) => {
    switch (val) {
        case 'Tiktok': return t('referralTiktok');
        case 'Instagram': return t('referralInstagram');
        case 'LinkedIn': return t('referralLinkedIn');
        case 'Website Jakpat': return t('referralWebsiteJakpat');
        case 'Blog Jakpat': return t('referralBlogJakpat');
        case 'Google Search': return t('referralGoogleSearch');
        case 'Chat GPT': return t('referralChatGPT');
        case 'Rekomendasi Dosen': return t('referralRekomendasiDosen');
        case 'Rekomendasi Teman': return t('referralRekomendasiTeman');
        case 'Lainnya': return t('referralLainnya');
        default: return val;
    }
};

/**
 * Cek gate kelengkapan profil (dipakai flow submit-iklan sebelum masuk form).
 * Sama dengan kriteria penyimpanan: kolom profil lengkap DAN sudah pernah
 * disimpan setelah rilis skema baru (flag user_metadata.profile_filled_v2).
 */
export async function isProfileGateSatisfied(): Promise<boolean> {
    const [profile, user] = await Promise.all([
        getOwnProfile(),
        getAuthUser(),
    ]);
    return isProfileComplete(profile) && user?.user_metadata?.profile_filled_v2 === true;
}

export interface ProfileDraftSnapshot {
    fullName: string;
    phoneNumber: string;
    university: string;
    department: string;
    status: string;
    loading: boolean;
}

interface ProfileFormProps {
    /** Dipanggil setelah simpan sukses (mis. tutup drawer & lanjutkan flow). */
    onSaved?: () => void;
    /** Dipanggil sekali setelah data profil termuat, membawa status onboarding. */
    onLoaded?: (isOnboarding: boolean) => void;
    /** Mengirim nilai form terkini ke parent (mis. pratinjau kartu identitas di ProfilePage). */
    onDraftChange?: (draft: ProfileDraftSnapshot) => void;
    /** Label tombol jadi "Simpan & Lanjutkan" saat onboarding. */
    continueAfterSave?: boolean;
    /** `card`: satu kartu putih terpadu (halaman Profil). `sheet`: isi rata di dalam modal sheet. */
    layout?: 'card' | 'sheet';
    /** Judul & subjudul kartu saat `layout="card"`. */
    heading?: string;
    subheading?: string;
}

interface SavedValues {
    fullName: string;
    phoneNumber: string;
    university: string;
    department: string;
    status: string;
    referralSource: string;
    referralSourceOther: string;
}

const EMPTY_VALUES: SavedValues = {
    fullName: '',
    phoneNumber: '',
    university: '',
    department: '',
    status: '',
    referralSource: '',
    referralSourceOther: '',
};

/**
 * Form biodata researcher (konsep 1 akun = 1 researcher) — dipakai di dua
 * tempat: halaman /dashboard/profile dan ProfileCompletionSheet (drawer gate
 * kelengkapan profil di flow submit-iklan). Biodata ini menjadi sumber
 * prefill order form & default Detail Invoice.
 */
export function ProfileForm({
    onSaved,
    onLoaded,
    onDraftChange,
    continueAfterSave = false,
    layout = 'sheet',
    heading,
    subheading,
}: ProfileFormProps) {
    const { user } = useAuth();
    const { t, language } = useLanguage();
    const isEn = language === 'en';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);
    const [initialValues, setInitialValues] = useState<SavedValues>(EMPTY_VALUES);

    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [university, setUniversity] = useState('');
    const [department, setDepartment] = useState('');
    const [status, setStatus] = useState('');
    const [referralSource, setReferralSource] = useState('');
    const [referralSourceOther, setReferralSourceOther] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        const load = async () => {
            const profile: ResearcherProfile | null = await getOwnProfile();
            const complete = isProfileComplete(profile);
            // Cek apakah profil sudah pernah disimpan setelah rilis ini (lewat user_metadata)
            const hasFilledAfterRelease = user?.user_metadata?.profile_filled_v2 === true;
            const needsOnboarding = !(complete && hasFilledAfterRelease);
            setIsOnboarding(needsOnboarding);

            if (profile && !needsOnboarding) {
                const ref = expandReferralSource(profile.referral_source);
                const loaded: SavedValues = {
                    fullName: profile.full_name || '',
                    phoneNumber: profile.phone_number || '',
                    university: profile.university || '',
                    department: profile.department || '',
                    status: profile.status || '',
                    referralSource: ref.source,
                    referralSourceOther: ref.other,
                };
                setFullName(loaded.fullName);
                setPhoneNumber(loaded.phoneNumber);
                setUniversity(loaded.university);
                setDepartment(loaded.department);
                setStatus(loaded.status);
                setReferralSource(loaded.referralSource);
                setReferralSourceOther(loaded.referralSourceOther);
                setInitialValues(loaded);
                setErrors({});
            } else {
                setFullName('');
                setPhoneNumber('');
                setUniversity('');
                setDepartment('');
                setStatus('');
                setReferralSource('');
                setReferralSourceOther('');
                setInitialValues(EMPTY_VALUES);
                setErrors({});
            }
            setLoading(false);
            onLoaded?.(needsOnboarding);
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        onDraftChange?.({
            fullName,
            phoneNumber,
            university,
            department,
            status,
            loading,
        });
    }, [fullName, phoneNumber, university, department, status, loading, onDraftChange]);

    const isDirty = useMemo(() => (
        fullName !== initialValues.fullName ||
        phoneNumber !== initialValues.phoneNumber ||
        university !== initialValues.university ||
        department !== initialValues.department ||
        status !== initialValues.status ||
        referralSource !== initialValues.referralSource ||
        referralSourceOther !== initialValues.referralSourceOther
    ), [fullName, phoneNumber, university, department, status, referralSource, referralSourceOther, initialValues]);

    const handleReset = () => {
        setFullName(initialValues.fullName);
        setPhoneNumber(initialValues.phoneNumber);
        setUniversity(initialValues.university);
        setDepartment(initialValues.department);
        setStatus(initialValues.status);
        setReferralSource(initialValues.referralSource);
        setReferralSourceOther(initialValues.referralSourceOther);
        setErrors({});
    };

    const clearError = (field: string) => {
        if (!errors[field]) return;
        setErrors((prev) => {
            const copy = { ...prev };
            delete copy[field];
            return copy;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        if (!fullName.trim()) {
            newErrors.fullName = t('errFullNameRequired');
        }
        if (!phoneNumber.trim()) {
            newErrors.phoneNumber = t('errPhoneNumberRequired');
        } else if (phoneNumber.trim().length < 10) {
            newErrors.phoneNumber = t('errPhoneNumberMin');
        }
        if (!university.trim()) {
            newErrors.university = t('errUniversityRequired');
        }
        if (!department.trim()) {
            newErrors.department = t('errDepartmentRequired');
        }
        if (!status) {
            newErrors.status = t('errAcademicStatusRequired');
        }
        if (!referralSource) {
            newErrors.referralSource = t('errReferralRequired');
        }
        if (referralSource === 'Lainnya' && !referralSourceOther.trim()) {
            newErrors.referralSourceOther = t('errReferralOtherRequired');
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            toast.error(t('fillRequiredFields'));
            return;
        }

        try {
            setSaving(true);
            setErrors({});
            const nextSaved: SavedValues = {
                fullName: fullName.trim(),
                phoneNumber: phoneNumber.trim(),
                university: university.trim(),
                department: department.trim(),
                status,
                referralSource,
                referralSourceOther: referralSource === 'Lainnya' ? referralSourceOther.trim() : '',
            };
            await updateOwnProfile({
                full_name: nextSaved.fullName,
                phone_number: nextSaved.phoneNumber,
                university: nextSaved.university,
                department: nextSaved.department,
                status: nextSaved.status,
                referral_source: nextSaved.referralSource
                    ? collapseReferralSource(nextSaved.referralSource, nextSaved.referralSourceOther)
                    : null,
            });

            // Tandai bahwa user sudah mengisi profil setelah rilis ini (simpan ke user_metadata)
            await supabase.auth.updateUser({
                data: { profile_filled_v2: true },
            });

            setInitialValues(nextSaved);
            setFullName(nextSaved.fullName);
            setPhoneNumber(nextSaved.phoneNumber);
            setUniversity(nextSaved.university);
            setDepartment(nextSaved.department);
            setReferralSourceOther(nextSaved.referralSourceOther);

            toast.success(t('profileSaveSuccess'));
            setIsOnboarding(false);
            onSaved?.();
        } catch (error: any) {
            console.error('Error saving profile:', error);
            toast.error(error.message || t('profileSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const isCard = layout === 'card';
    const sectionPad = isCard ? 'max-sm:px-5 sm:px-7 py-5 sm:py-6' : 'py-5 first:pt-0';

    if (loading) {
        return (
            <div
                aria-busy="true"
                aria-label={isEn ? 'Loading profile' : 'Memuat profil'}
                className={isCard
                    ? 'rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] overflow-hidden'
                    : 'space-y-5'
                }
            >
                {isCard && (
                    <div className="max-sm:px-5 sm:px-7 py-5 border-b border-slate-100 space-y-2">
                        <Skeleton className="h-5 w-40 rounded-md bg-slate-100" />
                        <Skeleton className="h-3.5 w-64 rounded-md bg-slate-100" />
                    </div>
                )}
                <div className={isCard ? 'max-sm:px-5 sm:px-7 py-6 space-y-6' : 'space-y-5'}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Skeleton className="h-3.5 w-24 rounded bg-slate-100" />
                            <Skeleton className="h-10 w-full rounded-xl bg-slate-100" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-3.5 w-24 rounded bg-slate-100" />
                            <Skeleton className="h-10 w-full rounded-xl bg-slate-100" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Skeleton className="h-3.5 w-24 rounded bg-slate-100" />
                            <Skeleton className="h-10 w-full rounded-xl bg-slate-100" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-3.5 w-24 rounded bg-slate-100" />
                            <Skeleton className="h-10 w-full rounded-xl bg-slate-100" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                            <Skeleton key={n} className="h-10 w-full rounded-xl bg-slate-100" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const canSubmit = !saving && (isOnboarding || continueAfterSave || isDirty);

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className={isCard
                ? 'rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)]'
                : 'divide-y divide-slate-100'
            }
        >
            {isCard && heading && (
                <div className="max-sm:px-5 sm:px-7 py-5 border-b border-slate-100 rounded-t-2xl">
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-[-0.015em]">
                        {heading}
                    </h1>
                    {subheading && (
                        <p className="text-xs sm:text-[13px] text-slate-500 mt-1 leading-relaxed">
                            {subheading}
                        </p>
                    )}
                </div>
            )}

            <div className="divide-y divide-slate-100">
                {/* Bagian 1: Data Diri */}
                <section className={sectionPad}>
                    <h2 className="text-[13px] font-semibold text-slate-900 mb-3.5">
                        {t('profilePersonalData')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                        <div className="space-y-1.5">
                            <label htmlFor="fullName" className="block text-xs font-medium text-slate-600">
                                {t('fullName')} <span className="text-rose-500">*</span>
                            </label>
                            <input
                                id="fullName"
                                type="text"
                                autoComplete="name"
                                className={getInputClass(!!errors.fullName)}
                                value={fullName}
                                onChange={(e) => {
                                    setFullName(e.target.value);
                                    clearError('fullName');
                                }}
                                placeholder={t('fullNamePlaceholder')}
                            />
                            {errors.fullName && (
                                <p className="text-xs text-rose-600 font-medium">{errors.fullName}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="phoneNumber" className="block text-xs font-medium text-slate-600">
                                {t('phoneNumber')} <span className="text-rose-500">*</span>
                            </label>
                            <input
                                id="phoneNumber"
                                type="tel"
                                autoComplete="tel"
                                inputMode="tel"
                                className={`${getInputClass(!!errors.phoneNumber)} tabular-nums`}
                                value={phoneNumber}
                                onChange={(e) => {
                                    setPhoneNumber(e.target.value);
                                    clearError('phoneNumber');
                                }}
                                placeholder="08xxxxxxxxxx"
                            />
                            {errors.phoneNumber && (
                                <p className="text-xs text-rose-600 font-medium">{errors.phoneNumber}</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Bagian 2: Informasi Akademik */}
                <section className={sectionPad}>
                    <h2 className="text-[13px] font-semibold text-slate-900 mb-3.5">
                        {t('academicInfo')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                        <div className="space-y-1.5">
                            <label htmlFor="university" className="block text-xs font-medium text-slate-600">
                                {t('university')} <span className="text-rose-500">*</span>
                            </label>
                            <Combobox
                                id="university"
                                mode="predictive"
                                value={university}
                                onChange={(val) => {
                                    setUniversity(val);
                                    clearError('university');
                                }}
                                options={UNIVERSITY_OPTIONS}
                                placeholder={t('universityPlaceholder')}
                                error={!!errors.university}
                            />
                            {errors.university && (
                                <p className="text-xs text-rose-600 font-medium">{errors.university}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="department" className="block text-xs font-medium text-slate-600">
                                {t('department')} <span className="text-rose-500">*</span>
                            </label>
                            <Combobox
                                id="department"
                                value={department}
                                onChange={(val) => {
                                    setDepartment(val);
                                    clearError('department');
                                }}
                                options={DEPARTMENT_OPTIONS}
                                placeholder={t('departmentPlaceholder')}
                                error={!!errors.department}
                            />
                            {errors.department && (
                                <p className="text-xs text-rose-600 font-medium">{errors.department}</p>
                            )}
                        </div>
                    </div>

                    {/* Status Akademik — pilihan pill langsung tanpa emoji */}
                    <div className="mt-5 space-y-2">
                        <span id="academic-status-label" className="block text-xs font-medium text-slate-600">
                            {t('academicStatus')} <span className="text-rose-500">*</span>
                        </span>
                        <div
                            role="radiogroup"
                            aria-labelledby="academic-status-label"
                            className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                        >
                            {ACADEMIC_STATUS_OPTIONS.map((opt) => {
                                const selected = status === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => {
                                            setStatus(opt.value);
                                            clearError('status');
                                        }}
                                        className={`min-h-10 px-3 py-2 rounded-xl border text-left text-xs sm:text-[13px] leading-snug transition-all duration-150 flex items-center justify-between gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary/30 ${
                                            selected
                                                ? 'border-jfu-primary bg-blue-50/70 text-jfu-primary font-semibold shadow-2xs'
                                                : errors.status
                                                    ? 'border-rose-300 bg-white text-slate-700 hover:border-rose-400'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/70'
                                        }`}
                                    >
                                        <span className="truncate">{getAcademicStatusLabel(opt.value, t)}</span>
                                        {selected && <Check className="w-3.5 h-3.5 shrink-0 text-jfu-primary" aria-hidden="true" />}
                                    </button>
                                );
                            })}
                        </div>
                        {errors.status && (
                            <p className="text-xs text-rose-600 font-medium">{errors.status}</p>
                        )}
                    </div>
                </section>

                {/* Bagian 3: Sumber Referensi */}
                <section className={sectionPad}>
                    <div className="max-w-md space-y-2">
                        <label htmlFor="referralSource" className="block text-xs font-medium text-slate-600">
                            {t('referralTitle')} <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                            <select
                                id="referralSource"
                                className={`${getInputClass(!!errors.referralSource)} appearance-none pr-10 cursor-pointer`}
                                value={referralSource}
                                onChange={(e) => {
                                    setReferralSource(e.target.value);
                                    if (e.target.value !== 'Lainnya') setReferralSourceOther('');
                                    clearError('referralSource');
                                }}
                            >
                                <option value="">{t('referralPlaceholder')}</option>
                                {REFERRAL_SOURCE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {getReferralLabel(opt.value, t)}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                aria-hidden="true"
                                className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                            />
                        </div>
                        {errors.referralSource && (
                            <p className="text-xs text-rose-600 font-medium">{errors.referralSource}</p>
                        )}

                        {referralSource === 'Lainnya' && (
                            <div className="pt-1 space-y-1.5">
                                <input
                                    type="text"
                                    className={getInputClass(!!errors.referralSourceOther)}
                                    value={referralSourceOther}
                                    onChange={(e) => {
                                        setReferralSourceOther(e.target.value);
                                        clearError('referralSourceOther');
                                    }}
                                    placeholder={t('referralSourceOtherPlaceholder')}
                                />
                                {errors.referralSourceOther && (
                                    <p className="text-xs text-rose-600 font-medium">{errors.referralSourceOther}</p>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Footer Aksi */}
            <div
                className={isCard
                    ? 'max-sm:px-5 sm:px-7 py-4 bg-slate-50/60 border-t border-slate-100 rounded-b-2xl flex flex-wrap items-center justify-between gap-3'
                    : 'sticky -bottom-5 sm:-bottom-6 z-10 -mx-5 sm:-mx-7 max-sm:px-5 sm:px-7 py-4 bg-white/95 backdrop-blur-xs border-t border-slate-100 flex flex-wrap items-center justify-between gap-3'
                }
            >
                <p className="text-xs text-slate-500 m-0">
                    {isOnboarding || continueAfterSave ? (
                        isEn ? 'All fields marked * are required.' : 'Semua kolom bertanda * wajib diisi.'
                    ) : isDirty ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                            {isEn ? 'Unsaved changes' : 'Ada perubahan belum disimpan'}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                            <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                            {isEn ? 'All changes saved' : 'Profil tersimpan'}
                        </span>
                    )}
                </p>

                <div className="flex items-center gap-2 ml-auto">
                    {isDirty && !isOnboarding && !continueAfterSave && (
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={saving}
                            className="h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {t('cancel')}
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="h-9 px-5 rounded-xl bg-jfu-primary hover:bg-jfu-dark text-white text-xs sm:text-[13px] font-semibold shadow-2xs transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {continueAfterSave && isOnboarding ? t('saveAndContinue') : t('saveProfile')}
                    </button>
                </div>
            </div>
        </form>
    );
}
