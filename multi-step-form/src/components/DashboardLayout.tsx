import { useEffect, useState } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { AppNav } from './AppNav';
import { SpecialMissionRunningBanner } from './SpecialMissionRunningBanner';
import { ProfileCompletionSheet } from './ProfileCompletionSheet';
import { getOwnProfile, isProfileComplete } from '../utils/supabase';

export function DashboardLayout() {
  const location = useLocation();
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  // Chat mengatur tingginya sendiri (full-height di bawah navbar),
  // jadi tanpa padding bawah dari layout.
  const isChat = location.pathname.startsWith('/dashboard/chat');
  const isMyOrders = location.pathname === '/dashboard' || location.pathname === '/dashboard/status';

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
      {isMyOrders && <SpecialMissionRunningBanner />}

      {/* Selaras dengan gate di flow submit: banner membuka drawer profil di
          tempat, bukan menavigasi ke /dashboard/profile. */}
      {profileIncomplete && location.pathname !== '/dashboard/profile' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center">
          <span className="text-xs text-amber-800">
            Profil Anda belum lengkap.{' '}
            <button
              type="button"
              onClick={() => setProfileSheetOpen(true)}
              className="font-semibold underline hover:text-amber-900"
            >
              Lengkapi sekarang
            </button>{' '}
            agar bisa memasang survei.
          </span>
        </div>
      )}

      <ProfileCompletionSheet
        open={profileSheetOpen}
        onOpenChange={setProfileSheetOpen}
        onCompleted={() => {
          setProfileSheetOpen(false);
          setProfileIncomplete(false);
        }}
      />

      <main className={isChat ? 'min-w-0' : 'min-w-0 pb-10'}>
        <Outlet />
      </main>
    </div>
  );
}
