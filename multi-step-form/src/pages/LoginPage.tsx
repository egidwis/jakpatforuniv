import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, signInWithPassword, signUp } from '../utils/supabase';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
    const { session, loading } = useAuth();
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    // Form States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');

    // If user is already logged in, redirect to dashboard
    if (!loading && session) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleGoogleLogin = async () => {
        try {
            setIsLoggingIn(true);
            await signInWithGoogle();
        } catch (error) {
            console.error('Login error:', error);
            toast.error('Failed to login with Google');
            setIsLoggingIn(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        if (mode === 'signup' && !fullName) {
            toast.error('Please enter your full name');
            return;
        }

        try {
            setIsLoggingIn(true);
            if (mode === 'login') {
                await signInWithPassword(email, password);
                // Redirect handled by AuthContext/Navigate
            } else {
                await signUp(email, password, fullName);
                toast.success('Registration successful! Please check your email to verify your account.');
                setMode('login'); // Switch to login after signup
            }
        } catch (error: any) {
            console.error('Auth error:', error);
            toast.error(error.message || 'Authentication failed');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 from-blue-50 to-indigo-50 dark:bg-gray-900 px-4">
            {/* Background Decor */}
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
                        {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        {mode === 'login' ? 'Masuk ke dashboard Jakpat for Universities' : 'Sign up to start your journey'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                    <Button
                        variant="outline"
                        className="w-full h-11 relative overflow-hidden group transition-all border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-medium"
                        onClick={handleGoogleLogin}
                        disabled={isLoggingIn}
                        type="button"
                    >
                        <div className="absolute left-4 top-1/2 -translate-y-1/2">
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        </div>
                        <span className="font-semibold">
                            Continue with Google
                        </span>
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white/80 dark:bg-gray-800/80 px-2 text-gray-500 backdrop-blur-sm">Or continue with</span>
                        </div>
                    </div>

                    <form onSubmit={handleEmailAuth} className="space-y-4">
                        {mode === 'signup' && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName} onChange={e => setFullName(e.target.value)}
                                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700"
                                    placeholder="John Doe"
                                    disabled={isLoggingIn}
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Email</label>
                            <input
                                type="email"
                                value={email} onChange={e => setEmail(e.target.value)}
                                className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700"
                                placeholder="name@example.com"
                                disabled={isLoggingIn}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Password</label>
                            <input
                                type="password"
                                value={password} onChange={e => setPassword(e.target.value)}
                                className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700"
                                placeholder="••••••••"
                                disabled={isLoggingIn}
                            />
                        </div>

                        <Button
                            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            type="submit"
                            disabled={isLoggingIn}
                        >
                            {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {mode === 'login' ? 'Sign In' : 'Create Account'}
                        </Button>
                    </form>

                    <div className="text-center text-sm">
                        {mode === 'login' ? (
                            <>
                                Don't have an account?{' '}
                                <button onClick={() => setMode('signup')} className="font-semibold text-blue-600 hover:text-blue-500 underline decoration-blue-600/30">
                                    Sign up
                                </button>
                            </>
                        ) : (
                            <>
                                Already have an account?{' '}
                                <button onClick={() => setMode('login')} className="font-semibold text-blue-600 hover:text-blue-500 underline decoration-blue-600/30">
                                    Sign in
                                </button>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
