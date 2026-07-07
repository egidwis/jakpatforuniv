import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, updateUserPassword } from '../utils/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
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
                        Atur Password Baru
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        Masukkan password baru untuk akun Jakpat for Universities kamu
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {checking ? (
                        <div className="flex items-center justify-center py-8 text-gray-500">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memeriksa tautan…
                        </div>
                    ) : done ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                            <CheckCircle2 className="w-12 h-12 text-green-500" />
                            <p className="text-gray-700 dark:text-gray-300 font-medium">
                                Password berhasil diperbarui.
                            </p>
                            <p className="text-sm text-gray-500">Mengarahkan ke halaman login…</p>
                        </div>
                    ) : !recoveryReady ? (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan
                                baru dari halaman login.
                            </p>
                            <Button
                                variant="outline"
                                className="w-full h-11"
                                onClick={() => navigate('/login', { replace: true })}
                            >
                                Kembali ke Login
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Password Baru</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700"
                                    placeholder="••••••••"
                                    disabled={isSubmitting}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Konfirmasi Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700"
                                    placeholder="••••••••"
                                    disabled={isSubmitting}
                                    autoComplete="new-password"
                                />
                            </div>
                            <Button
                                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                type="submit"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Simpan Password Baru
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
