import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, updateUserPassword } from '../utils/supabase';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { toast } from 'sonner';
import logoMark from '../assets/Jakpat Navbar Logo.webp';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageContext';

const inputClass = "flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-jfu-primary/10 focus:border-jfu-primary transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white";

export default function ResetPasswordPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    // recoveryReady: sesi recovery dari link email sudah terbentuk
    const [recoveryReady, setRecoveryReady] = useState(false);
    const [checking, setChecking] = useState(true);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        // Supabase memparse token recovery dari URL dan memancarkan event PASSWORD_RECOVERY.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
                setRecoveryReady(true);
                setChecking(false);
            }
        });

        // Fallback: jika sesi sudah ada saat halaman dibuka (mis. event sudah lewat).
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setRecoveryReady(true);
            setChecking(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            toast.error('Password minimal 8 karakter');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Konfirmasi password tidak cocok');
            return;
        }

        try {
            setIsSubmitting(true);
            await updateUserPassword(password);
            setDone(true);
            toast.success('Password berhasil diperbarui');
            // Keluar dari sesi recovery lalu arahkan ke login.
            await supabase.auth.signOut();
            setTimeout(() => navigate('/login', { replace: true }), 2000);
        } catch (error: any) {
            console.error('Reset password error:', error);
            toast.error(error.message || 'Gagal memperbarui password');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col justify-between bg-[#f8fafc] dark:bg-gray-900 px-4 py-8 selection:bg-blue-100 selection:text-jfu-primary">
            <div className="flex-1 flex items-center justify-center py-4">
                <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-slate-200/90 dark:border-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-4px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden p-6 sm:p-8">
                    {/* Brand Header */}
                    <div className="flex flex-col items-center text-center mb-6">
                        <Link to="/dashboard" className="inline-block mb-3 hover:opacity-90 transition-opacity">
                            <img src={logoMark} alt="Jakpat for Universities" className="h-8 md:h-9 w-auto object-contain" />
                        </Link>
                        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                            {t('resetPasswordTitle')}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                            {t('resetPasswordSubtitle')}
                        </p>
                    </div>

                    {checking ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-jfu-primary" />
                            <span className="text-xs font-semibold">{t('resetPasswordChecking')}</span>
                        </div>
                    ) : done ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 mb-1">
                                <CheckCircle2 className="w-7 h-7" />
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {t('resetPasswordSuccessTitle')}
                            </p>
                            <p className="text-xs text-slate-500">{t('resetPasswordSuccessDesc')}</p>
                        </div>
                    ) : !recoveryReady ? (
                        <div className="text-center py-4 space-y-4">
                            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 mx-auto">
                                <Lock className="w-7 h-7" />
                            </div>
                            <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                                {t('resetPasswordInvalidDesc')}
                            </p>
                            <Link to="/login" className="w-full block pt-1">
                                <Button variant="outline" className="w-full h-11 border-slate-200 font-bold text-slate-700 hover:bg-slate-50 rounded-xl">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> {t('forgotPasswordBackToLogin')}
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('resetPasswordNewPasswordLabel')}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className={inputClass}
                                    placeholder={t('resetPasswordNewPasswordPlaceholder')}
                                    disabled={isSubmitting}
                                    autoComplete="new-password"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('resetPasswordConfirmLabel')}</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    className={inputClass}
                                    placeholder={t('resetPasswordConfirmPlaceholder')}
                                    disabled={isSubmitting}
                                    autoComplete="new-password"
                                />
                            </div>
                            <Button
                                className="w-full h-11 bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white font-bold rounded-xl shadow-xs hover:shadow transition-all text-sm gap-1.5"
                                type="submit"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <span>{t('resetPasswordSubmit')}</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </Button>
                        </form>
                    )}
                </div>
            </div>

            {/* Clean bottom footer */}
            <footer className="w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 pb-2 text-xs text-slate-400 border-t border-slate-200/60 dark:border-gray-800">
                <p>© {new Date().getFullYear()} Jakpat for Universities. All rights reserved.</p>
                <div className="flex items-center gap-2">
                    <LanguageSwitcher />
                </div>
            </footer>
        </div>
    );
}
