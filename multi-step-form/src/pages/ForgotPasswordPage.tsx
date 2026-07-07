import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from '../utils/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MailCheck, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Halaman khusus "Lupa password?". Meminta email, mengecek keberadaannya lewat
 * /api/auth/check-email (service role, server-side), lalu:
 *  - terdaftar    → kirim tautan reset + tampilkan layar konfirmasi.
 *  - tidak ada    → tampilkan error eksplisit "email tidak terdaftar".
 *  - tidak pasti  → fail-open ke pesan netral (server misconfig / error).
 */
export default function ForgotPasswordPage() {
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
            // 1. Cek keberadaan email di server (aman, service role).
            //    exists: true | false | null (null = tidak pasti → perlakukan netral).
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
                exists = null; // jaringan/endpoint gagal → fail-open netral
            }

            // 2. Email jelas tidak terdaftar → beri tahu user, jangan kirim apa pun.
            if (exists === false) {
                setNotRegistered(true);
                return;
            }

            // 3. Terdaftar (true) atau tidak pasti (null) → kirim tautan reset.
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 from-blue-50 to-indigo-50 dark:bg-gray-900 px-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl -translate-y-1/2"></div>
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl translate-y-1/2"></div>
            </div>

            <Card className="w-full max-w-md border-0 shadow-xl bg-white/80 backdrop-blur-sm dark:bg-gray-800/80">
                <CardHeader className="text-center space-y-2 pb-6">
                    <div className="mx-auto w-16 h-16 flex items-center justify-center mb-2">
                        <img src="/favicon.webp" alt="Jakpat Logo" className="w-16 h-16 object-contain" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {sent ? 'Cek Email Kamu' : 'Lupa Password'}
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        {sent
                            ? 'Kami sudah mengirim tautan untuk mengatur ulang password'
                            : 'Masukkan email akunmu, kami kirimkan tautan reset password'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {sent ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                            <MailCheck className="w-12 h-12 text-green-500" />
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Jika <span className="font-semibold text-gray-800 dark:text-gray-200">{email.trim()}</span> terdaftar,
                                tautan reset password sudah dikirim. Cek inbox (dan folder spam) kamu.
                            </p>
                            <Link to="/login" className="w-full">
                                <Button variant="outline" className="w-full h-11">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Login
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setNotRegistered(false); }}
                                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700"
                                    placeholder="name@example.com"
                                    disabled={isSubmitting}
                                    autoFocus
                                />
                                {notRegistered && (
                                    <p className="text-xs text-red-600 flex items-start gap-1 mt-1.5 font-medium">
                                        Email ini tidak terdaftar di sistem kami. Periksa kembali, atau{' '}
                                        <Link to="/login" className="underline font-semibold whitespace-nowrap">daftar akun baru</Link>.
                                    </p>
                                )}
                            </div>

                            <Button
                                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                type="submit"
                                disabled={isSubmitting || !emailValid}
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Kirim Tautan Reset
                            </Button>

                            <div className="text-center">
                                <Link to="/login" className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 inline-flex items-center gap-1">
                                    <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Login
                                </Link>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
