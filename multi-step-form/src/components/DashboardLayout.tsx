import { useEffect, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { AppNav } from './AppNav';
import { getOwnProfile, isProfileComplete } from '../utils/supabase';

export function DashboardLayout() {
  const location = useLocation();
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  // Chat mengatur tingginya sendiri (full-height di bawah navbar),
  // jadi tanpa padding bawah dari layout.
  const isChat = location.pathname.startsWith('/dashboard/chat');

  // Banner ajakan melengkapi profil (user Google / user lama). Dicek ulang tiap
  // pindah halaman agar hilang segera setelah profil dilengkapi.
  useEffect(() => {
    let cancelled = false;
    getOwnProfile().then((profile) => {
      if (!cancelled) setProfileIncomplete(!isProfileComplete(profile));
    });
    return () => { cancelled = true; };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-jfu-bg font-jakarta dark:bg-gray-900">
      <AppNav />

      {profileIncomplete && location.pathname !== '/dashboard/profile' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center">
          <span className="text-xs text-amber-800">
            Profil Anda belum lengkap.{' '}
            <Link to="/dashboard/profile" className="font-semibold underline hover:text-amber-900">
              Lengkapi sekarang
            </Link>{' '}
            agar bisa memasang survei.
          </span>
        </div>
      )}

      <main className={isChat ? 'min-w-0' : 'min-w-0 pb-10'}>
        <Outlet />
      </main>
    </div>
  );
}
