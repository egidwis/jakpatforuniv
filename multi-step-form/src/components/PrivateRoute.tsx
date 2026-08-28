import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] font-jakarta">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center mb-3">
                    <img src="/favicon.webp" alt="Jakpat Logo" className="w-8 h-8 object-contain animate-pulse" />
                </div>
                <div className="w-24 h-1 bg-slate-200 rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 bg-gradient-to-r from-jfu-primary to-sky-400 w-1/2 rounded-full animate-pulse" />
                </div>
            </div>
        );
    }

    if (!session) {
        // Redirect to login page but save the attempted url
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
