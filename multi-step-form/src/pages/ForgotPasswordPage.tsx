import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from '../utils/supabase';
import { Button } from '@/components/ui/button';
import { Loader2, MailCheck, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import logoMark from '../assets/Jakpat Navbar Logo.webp';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageContext';

const inputClass = "flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-jfu-primary/10 focus:border-jfu-primary transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white";

export default function ForgotPasswordPage() {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [notRegistered, setNotRegistered] = useState(false);

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setNotRegistered(false);

        if (!emailValid) {
            toast.error('Masukkan alamat email yang valid');
            return;
        }

        setIsSubmitting(true);
        try {
            let exists: boolean | null = null;
            try {
                const res = await fetch('/api/auth/check-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim() }),
                });
                if (res.ok) {
                    const json = await res.json();
                    exists = json?.exists ?? null;
                }
            } catch {
                exists = null;
            }

            if (exists === false) {
                setNotRegistered(true);
                return;
            }

            await sendPasswordResetEmail(email.trim());
            setSent(true);
        } catch (error: any) {
            console.error('Forgot password error:', error);
            toast.error(error.message || 'Gagal mengirim tautan reset');
        } finally {
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
                            {sent ? t('forgotPasswordCheckEmailTitle') : t('forgotPasswordTitle')}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                            {sent
                                ? t('forgotPasswordCheckEmailSubtitle')
                                : t('forgotPasswordSubtitle')}
                        </p>
                    </div>

                    {sent ? (
                        <div className="flex flex-col items-center justify-center py-4 text-center space-y-4">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
                                <MailCheck className="w-7 h-7" />
                            </div>
                            <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed max-w-xs">
                                {t('forgotPasswordSentNotice', { email: email.trim() })}
                            </p>
                            <Link to="/login" className="w-full pt-2">
                                <Button variant="outline" className="w-full h-11 border-slate-200 font-bold text-slate-700 hover:bg-slate-50 rounded-xl">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> {t('forgotPasswordBackToLogin')}
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700 dark:text-gray-300">{t('forgotPasswordEmailLabel')}</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setNotRegistered(false); }}
                                    className={inputClass}
                                    placeholder={t('authEmailPlaceholder')}
                                    disabled={isSubmitting}
                                    autoFocus
                                />
                                {notRegistered && (
                                    <p className="text-xs text-rose-600 flex items-start gap-1 mt-1.5 font-medium">
                                        {t('forgotPasswordEmailNotRegistered')}{' '}
                                        <Link to="/login" className="underline font-bold whitespace-nowrap">{t('forgotPasswordRegisterLink')}</Link>.
                                    </p>
                                )}
                            </div>

                            <Button
                                className="w-full h-11 bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white font-bold rounded-xl shadow-xs hover:shadow transition-all text-sm gap-1.5"
                                type="submit"
                                disabled={isSubmitting || !emailValid}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <span>{t('forgotPasswordSubmit')}</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </Button>

                            <div className="text-center pt-2">
                                <Link to="/login" className="text-xs font-bold text-slate-500 hover:text-jfu-primary inline-flex items-center gap-1.5 transition-colors">
                                    <ArrowLeft className="w-3.5 h-3.5" /> {t('forgotPasswordBackToLogin')}
                                </Link>
                            </div>
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
