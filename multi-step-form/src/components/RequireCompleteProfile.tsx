import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getOwnProfile, isProfileComplete } from '../utils/supabase';
import { Loader2 } from 'lucide-react';

/**
 * Gate kelengkapan profil researcher — dipasang HANYA pada route
 * /dashboard/submit. Order form tidak lagi menanyakan biodata (StepTwo
 * dihapus), jadi snapshot form_submissions bergantung pada profil yang
 * lengkap. User Google dan user lama yang belum lengkap diarahkan ke
 * halaman profil dulu; halaman dashboard lain tetap bebas diakses.
 */
export default function RequireCompleteProfile({ children }: { children: React.ReactNode }) {
    const [checking, setChecking] = useState(true);
    const [complete, setComplete] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getOwnProfile().then((profile) => {
            if (cancelled) return;
            setComplete(isProfileComplete(profile));
            setChecking(false);
        });
        return () => { cancelled = true; };
    }, []);

    if (checking) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!complete) {
        return <Navigate to="/dashboard/profile?next=/dashboard/submit" replace />;
    }

    return <>{children}</>;
}
