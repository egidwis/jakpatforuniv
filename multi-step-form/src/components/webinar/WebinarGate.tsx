import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { webinarOpenFor } from '@/utils/webinarAccess';

/** Webinar terbuka untuk akun ini? Selama masa uji hanya akun di daftar izin. */
export function useWebinarOpen(): boolean {
    const { user } = useAuth();
    return webinarOpenFor(user?.email);
}

/** Rute /dashboard/webinar/*: akun lain dikembalikan ke beranda. Penegak sebenarnya tetap server. */
export function WebinarGate() {
    const open = useWebinarOpen();
    return open ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
