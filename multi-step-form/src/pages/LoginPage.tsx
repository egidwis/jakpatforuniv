import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, signInWithPassword, signUp } from '../utils/supabase';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import logoMark from '../assets/Jakpat Navbar Logo.webp';
import { ACADEMIC_STATUS_OPTIONS, DEPARTMENT_OPTIONS, UNIVERSITY_OPTIONS, REFERRAL_SOURCE_OPTIONS, collapseReferralSource } from '../constants/biodata';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageContext';

const inputClass = "flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-jfu-primary/10 focus:border-jfu-primary transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white";

export default function LoginPage() {
    const { session, loading } = useAuth();
    const { t } = useLanguage();
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [showPassword, setShowPassword] = useState(false);

    // Form States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [university, setUniversity] = useState('');
    const [department, setDepartment] = useState('');
    const [status, setStatus] = useState('');
    const [referralSource, setReferralSource] = useState('');
    const [referralSourceOther, setReferralSourceOther] = useState('');

    const location = useLocation();
    const from = location.state?.from?.pathname || '/dashboard';

    // If user is already logged in, redirect to dashboard or original destination
    if (!loading && session) {
        return <Navigate to={from} replace />;
    }

    const handleGoogleLogin = async () => {
        try {
            setIsLoggingIn(true);
            await signInWithGoogle();
        } catch (error) {
            console.error('Login error:', error);
            toast.error('Gagal masuk dengan Google');
            setIsLoggingIn(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Mohon isi email dan password');
            return;
        }
        if (mode === 'signup') {
            if (!fullName.trim()) {
                toast.error('Mohon isi nama lengkap Anda');
                return;
            }
            if (!phoneNumber.trim() || phoneNumber.trim().length < 10) {
                toast.error('Mohon isi nomor telepon yang valid (min. 10 digit)');
                return;
            }
            if (!university.trim()) {
                toast.error('Mohon isi universitas/institusi Anda');
                return;
            }
            if (!department.trim()) {
                toast.error('Mohon pilih jurusan Anda');
                return;
            }
            if (!status) {
                toast.error('Mohon pilih status akademik Anda');
                return;
            }
        }

        try {
            setIsLoggingIn(true);
            if (mode === 'login') {
                await signInWithPassword(email, password);
                // Redirect handled by AuthContext/Navigate
            } else {
                await signUp(email, password, {
                    fullName: fullName.trim(),
                    phoneNumber: phoneNumber.trim(),
                    university: university.trim(),
                    department: department.trim(),
                    status,
                    referralSource: referralSource
                        ? collapseReferralSource(referralSource, referralSourceOther)
                        : undefined,
                });
                toast.success('Pendaftaran berhasil! Silakan cek email Anda untuk verifikasi.');
                setMode('login'); // Switch to login after signup
            }
        } catch (error: any) {
            console.error('Auth error:', error);
            toast.error(error.message || 'Autentikasi gagal');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="relative min-h-screen w-full flex flex-col justify-between bg-[#f8fafc] dark:bg-gray-900 px-4 py-8 overflow-hidden selection:bg-blue-100 selection:text-jfu-primary">
            {/* Centered Ambient Aura Glow (Pusat pendaran dari tengah di balik kartu login) */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none flex items-center justify-center">
                {/* 1. Main Central Radial Glow (Pusat Biru Jakpat & Sky Blue) */}
                <div
                    className="absolute w-[700px] h-[700px] sm:w-[950px] sm:h-[950px] rounded-full transform-gpu"
                    style={{
                        background: 'radial-gradient(circle at center, rgba(24, 124, 255, 0.32) 0%, rgba(56, 189, 248, 0.22) 42%, rgba(244, 114, 182, 0.16) 65%, transparent 80%)',
                        filter: 'blur(95px)',
                    }}
                />

                {/* 2. Soft Pink/Rose Accent Ambient (Sedikit di kiri-atas tengah) */}
                <div
                    className="absolute -top-[12%] left-1/2 -translate-x-[65%] w-[550px] h-[550px] rounded-full transform-gpu"
                    style={{
                        background: 'radial-gradient(circle, rgba(251, 113, 133, 0.22) 0%, transparent 70%)',
                        filter: 'blur(100px)',
                    }}
                />

                {/* 3. Soft Sky Blue Ambient (Sedikit di kanan-bawah tengah) */}
                <div
                    className="absolute -bottom-[12%] left-1/2 translate-x-[15%] w-[600px] h-[600px] rounded-full transform-gpu"
                    style={{
                        background: 'radial-gradient(circle, rgba(24, 124, 255, 0.25) 0%, transparent 70%)',
                        filter: 'blur(100px)',
                    }}
                />
            </div>

            <div className="relative z-10 flex-1 flex items-center justify-center py-4">
                <div className="w-full max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-slate-200/90 dark:border-gray-700 shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden p-6 sm:p-8">
                    {/* Brand Header */}
                    <div className="flex flex-col items-center text-center mb-6">
                    <Link to="/dashboard" className="inline-block mb-3 hover:opacity-90 transition-opacity">
                        <img src={logoMark} alt="Jakpat for Universities" className="h-8 md:h-9 w-auto object-contain" />
                    </Link>
                    <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {mode === 'login' ? t('authWelcomeBack') : t('authCreateAccount')}
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                        {mode === 'login' ? t('authLoginSubtitle') : t('authSignupSubtitle')}
                    </p>
                </div>

                {/* Segmented Control Switcher */}
                <div className="[display:grid] grid-cols-2 p-1 bg-slate-100/90 dark:bg-gray-700/60 rounded-xl mb-6 border border-slate-200/60 dark:border-gray-600">
                    <button
                        type="button"
                        onClick={() => setMode('login')}
                        className={`py-2 text-xs font-bold rounded-lg transition-all ${
                            mode === 'login'
                                ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        {t('authTabLogin')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className={`py-2 text-xs font-bold rounded-lg transition-all ${
                            mode === 'signup'
                                ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-white shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        {t('authTabSignup')}
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Google Login Button */}
                    <Button
                        variant="outline"
                        className="w-full h-11 relative overflow-hidden group transition-all border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white text-slate-700 font-bold rounded-xl shadow-2xs flex items-center justify-center gap-2.5"
                        onClick={handleGoogleLogin}
                        disabled={isLoggingIn}
                        type="button"
                    >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        <span className="text-xs font-bold">
                            {mode === 'login' ? t('authLoginWithGoogle') : t('authSignupWithGoogle')}
                        </span>
                    </Button>

                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                            <span className="bg-white dark:bg-gray-800 px-3 text-slate-400 font-semibold">{t('authOrWithEmail')}</span>
                        </div>
                    </div>

                    <form onSubmit={handleEmailAuth} className="space-y-3.5">
                        {mode === 'signup' && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authFullName')}</label>
                                    <input
                                        type="text"
                                        value={fullName} onChange={e => setFullName(e.target.value)}
                                        className={inputClass}
                                        placeholder={t('authFullNamePlaceholder')}
                                        disabled={isLoggingIn}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authWhatsApp')}</label>
                                    <input
                                        type="tel"
                                        value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                                        className={inputClass}
                                        placeholder={t('authWhatsAppPlaceholder')}
                                        disabled={isLoggingIn}
                                    />
                                </div>
                                <div className="[display:grid] grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authUniversity')}</label>
                                        <input
                                            type="text"
                                            list="university-options"
                                            value={university} onChange={e => setUniversity(e.target.value)}
                                            className={inputClass}
                                            placeholder={t('authUniversityPlaceholder')}
                                            disabled={isLoggingIn}
                                        />
                                        <datalist id="university-options">
                                            {UNIVERSITY_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                                        </datalist>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authDepartment')}</label>
                                        <input
                                            type="text"
                                            list="department-options"
                                            value={department} onChange={e => setDepartment(e.target.value)}
                                            className={inputClass}
                                            placeholder={t('authDepartmentPlaceholder')}
                                            disabled={isLoggingIn}
                                        />
                                        <datalist id="department-options">
                                            {DEPARTMENT_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authAcademicStatus')}</label>
                                    <select
                                        value={status} onChange={e => setStatus(e.target.value)}
                                        className={inputClass}
                                        disabled={isLoggingIn}
                                    >
                                        <option value="">{t('authAcademicStatusPlaceholder')}</option>
                                        {ACADEMIC_STATUS_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 dark:text-gray-300">
                                        {t('authReferralSource')} <span className="font-normal text-slate-400">({t('optional') || 'opsional'})</span>
                                    </label>
                                    <select
                                        value={referralSource} onChange={e => setReferralSource(e.target.value)}
                                        className={inputClass}
                                        disabled={isLoggingIn}
                                    >
                                        <option value="">{t('authReferralSourcePlaceholder')}</option>
                                        {REFERRAL_SOURCE_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    {referralSource === 'Lainnya' && (
                                        <input
                                            type="text"
                                            value={referralSourceOther} onChange={e => setReferralSourceOther(e.target.value)}
                                            className={`${inputClass} mt-1.5`}
                                            placeholder={t('authReferralSourceOther')}
                                            disabled={isLoggingIn}
                                        />
                                    )}
                                </div>
                            </>
                        )}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authEmail')}</label>
                            <input
                                type="email"
                                value={email} onChange={e => setEmail(e.target.value)}
                                className={inputClass}
                                placeholder={t('authEmailPlaceholder')}
                                disabled={isLoggingIn}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('authPassword')}</label>
                                {mode === 'login' && (
                                    <Link
                                        to="/forgot-password"
                                        className="text-xs font-bold text-jfu-primary hover:underline"
                                    >
                                        {t('authForgotPassword')}
                                    </Link>
                                )}
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    className={`${inputClass} pr-10`}
                                    placeholder={t('authPasswordPlaceholder')}
                                    disabled={isLoggingIn}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors cursor-pointer"
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <Button
                            className="w-full h-11 bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white font-bold rounded-xl shadow-xs hover:shadow transition-all text-sm gap-1.5 mt-2"
                            type="submit"
                            disabled={isLoggingIn}
                        >
                            {isLoggingIn ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <span>{mode === 'login' ? t('authSubmitLogin') : t('authSubmitSignup')}</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </Button>
                    </form>
                    </div>
                </div>
            </div>

            {/* Clean bottom footer */}
            <footer className="relative z-10 w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 pb-2 text-xs text-slate-400 border-t border-slate-200/60 dark:border-gray-800">
                <p>© {new Date().getFullYear()} Jakpat for Universities. All rights reserved.</p>
                <div className="flex items-center gap-2">
                    <LanguageSwitcher />
                </div>
            </footer>
        </div>
    );
}
