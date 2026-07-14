import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getOwnProfile, updateOwnProfile, isProfileComplete, type ResearcherProfile, supabase } from '@/utils/supabase';
import { ACADEMIC_STATUS_OPTIONS, DEPARTMENT_OPTIONS, UNIVERSITY_OPTIONS, REFERRAL_SOURCE_OPTIONS, collapseReferralSource, expandReferralSource } from '@/constants/biodata';
import { Combobox } from '@/components/ui/combobox';
import { Loader2, User, GraduationCap, Megaphone, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

const getInputClass = (hasError: boolean) => 
  `w-full px-4 py-2.5 rounded-xl border transition-all duration-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 ${
    hasError 
      ? 'border-red-500 hover:border-red-600 focus:ring-red-500/20 focus:border-red-500' 
      : 'border-gray-200 hover:border-gray-300 focus:ring-blue-500/20 focus:border-blue-500'
  }`;

// Dynamic translations helper for options
const getAcademicStatusLabel = (val: string, t: any) => {
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

const getReferralLabel = (val: string, t: any) => {
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
 * Halaman profil researcher (konsep 1 akun = 1 researcher).
 * Dua mode dalam satu komponen:
 * - Onboarding: profil belum lengkap (user Google / user lama) → wajib diisi
 *   sebelum bisa memasang survei (di-gate oleh RequireCompleteProfile).
 * - Edit: profil sudah lengkap → tempat mengubah biodata kapan saja.
 * Biodata ini menjadi sumber prefill order form & default Detail Invoice.
 */
export function ProfilePage() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextPath = searchParams.get('next');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isOnboarding, setIsOnboarding] = useState(false);

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
            setIsOnboarding(!complete);
            
            // Cek apakah profil sudah pernah disimpan setelah rilis ini (lewat user_metadata)
            const hasFilledAfterRelease = user?.user_metadata?.profile_filled_v2 === true;

            if (profile && complete && hasFilledAfterRelease) {
                setFullName(profile.full_name || '');
                setPhoneNumber(profile.phone_number || '');
                setUniversity(profile.university || '');
                setDepartment(profile.department || '');
                setStatus(profile.status || '');
                const ref = expandReferralSource(profile.referral_source);
                setReferralSource(ref.source);
                setReferralSourceOther(ref.other);
                setErrors({});
            } else {
                setFullName('');
                setPhoneNumber('');
                setUniversity('');
                setDepartment('');
                setStatus('');
                setReferralSource('');
                setReferralSourceOther('');
                setErrors({});
            }
            setLoading(false);
        };
        load();
    }, [user]);

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
            await updateOwnProfile({
                full_name: fullName.trim(),
                phone_number: phoneNumber.trim(),
                university: university.trim(),
                department: department.trim(),
                status,
                referral_source: referralSource
                    ? collapseReferralSource(referralSource, referralSourceOther)
                    : null,
            });

            // Tandai bahwa user sudah mengisi profil setelah rilis ini (simpan ke user_metadata)
            await supabase.auth.updateUser({
                data: { profile_filled_v2: true }
            });

            toast.success(t('profileSaveSuccess'));
            if (nextPath) {
                navigate(nextPath, { replace: true });
            } else {
                setIsOnboarding(false);
            }
        } catch (error: any) {
            console.error('Error saving profile:', error);
            toast.error(error.message || t('profileSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

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

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                {/* Kontak */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 145, 255, 0.1)', color: '#0091ff' }}>
                            <User size={18} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('profilePersonalData')}</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="fullName" className="text-sm font-medium text-gray-700">{t('fullName')} <span className="text-red-500">*</span></label>
                            <input 
                                id="fullName" 
                                type="text" 
                                className={getInputClass(!!errors.fullName)} 
                                value={fullName}
                                onChange={(e) => {
                                    setFullName(e.target.value);
                                    if (errors.fullName) setErrors(prev => { const copy = { ...prev }; delete copy.fullName; return copy; });
                                }} 
                                placeholder={t('fullNamePlaceholder')} 
                            />
                            {errors.fullName && <p className="text-xs text-red-500 font-medium mt-1">{errors.fullName}</p>}
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">{t('phoneNumber')} <span className="text-red-500">*</span></label>
                            <input 
                                id="phoneNumber" 
                                type="tel" 
                                className={getInputClass(!!errors.phoneNumber)} 
                                value={phoneNumber}
                                onChange={(e) => {
                                    setPhoneNumber(e.target.value);
                                    if (errors.phoneNumber) setErrors(prev => { const copy = { ...prev }; delete copy.phoneNumber; return copy; });
                                }} 
                                placeholder="08xxxxxxxxxx" 
                            />
                            {errors.phoneNumber && <p className="text-xs text-red-500 font-medium mt-1">{errors.phoneNumber}</p>}
                        </div>
                    </div>
                </div>

                {/* Akademik */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <GraduationCap size={18} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('academicInfo')}</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="university" className="text-sm font-medium text-gray-700">{t('university')} <span className="text-red-500">*</span></label>
                            <Combobox 
                                id="university" 
                                value={university} 
                                onChange={(val) => {
                                    setUniversity(val);
                                    if (errors.university) setErrors(prev => { const copy = { ...prev }; delete copy.university; return copy; });
                                }} 
                                options={UNIVERSITY_OPTIONS} 
                                placeholder={t('universityPlaceholder')} 
                                error={!!errors.university}
                            />
                            {errors.university && <p className="text-xs text-red-500 font-medium mt-1">{errors.university}</p>}
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="department" className="text-sm font-medium text-gray-700">{t('department')} <span className="text-red-500">*</span></label>
                            <Combobox 
                                id="department" 
                                value={department} 
                                onChange={(val) => {
                                    setDepartment(val);
                                    if (errors.department) setErrors(prev => { const copy = { ...prev }; delete copy.department; return copy; });
                                }} 
                                options={DEPARTMENT_OPTIONS} 
                                placeholder={t('departmentPlaceholder')} 
                                error={!!errors.department}
                            />
                            {errors.department && <p className="text-xs text-red-500 font-medium mt-1">{errors.department}</p>}
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label htmlFor="status" className="text-sm font-medium text-gray-700">{t('academicStatus')} <span className="text-red-500">*</span></label>
                            <select 
                                id="status" 
                                className={`${getInputClass(!!errors.status)} appearance-none`} 
                                value={status}
                                onChange={(e) => {
                                    setStatus(e.target.value);
                                    if (errors.status) setErrors(prev => { const copy = { ...prev }; delete copy.status; return copy; });
                                }}
                            >
                                <option value="">{t('academicStatusPlaceholder')}</option>
                                {ACADEMIC_STATUS_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {getAcademicStatusLabel(opt.value, t)}
                                    </option>
                                ))}
                            </select>
                            {errors.status && <p className="text-xs text-red-500 font-medium mt-1">{errors.status}</p>}
                        </div>
                    </div>
                </div>

                {/* Referral */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                            <Megaphone size={18} />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                            {t('referralTitle')} <span className="text-red-500">*</span>
                        </h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <select 
                            className={`${getInputClass(!!errors.referralSource)} appearance-none`} 
                            value={referralSource}
                            onChange={(e) => { 
                                setReferralSource(e.target.value); 
                                if (e.target.value !== 'Lainnya') setReferralSourceOther(''); 
                                if (errors.referralSource) setErrors(prev => { const copy = { ...prev }; delete copy.referralSource; return copy; });
                            }}
                        >
                            <option value="">{t('referralPlaceholder')}</option>
                            {REFERRAL_SOURCE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {getReferralLabel(opt.value, t)}
                                </option>
                            ))}
                        </select>
                        {errors.referralSource && <p className="text-xs text-red-500 font-medium mt-1">{errors.referralSource}</p>}
                        
                        {referralSource === 'Lainnya' && (
                            <div className="space-y-2">
                                <input 
                                    type="text" 
                                    className={getInputClass(!!errors.referralSourceOther)} 
                                    value={referralSourceOther}
                                    onChange={(e) => {
                                        setReferralSourceOther(e.target.value);
                                        if (errors.referralSourceOther) setErrors(prev => { const copy = { ...prev }; delete copy.referralSourceOther; return copy; });
                                    }} 
                                    placeholder={t('referralSourceOtherPlaceholder')} 
                                />
                                {errors.referralSourceOther && <p className="text-xs text-red-500 font-medium mt-1">{errors.referralSourceOther}</p>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 rounded-xl text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isOnboarding && nextPath ? t('saveAndContinue') : t('saveProfile')}
                    </button>
                </div>
            </form>
        </div>
    );
}
