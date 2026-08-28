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
    <div className="min-h-screen bg-[#f8fafc] font-jakarta dark:bg-gray-900 relative">
      {/* Modern Mesh Aurora Glow (Konsep 1: Biru Jakpat + Sky Cyan + Warm Rose Pink — Terdistribusi di bawah Navbar/Banner) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none" aria-hidden="true">
        {/* Titik 1: Mid-Right — Pendaran Biru Jakpat Cerah & Sky Blue (Di bawah Navbar) */}
        <div
          className="absolute top-[22%] -right-[6%] md:right-[2%] w-[600px] md:w-[850px] h-[600px] md:h-[850px] rounded-full pointer-events-none transform-gpu"
          style={{
            background: 'radial-gradient(circle at center, rgba(24, 124, 255, 0.22) 0%, rgba(56, 189, 248, 0.14) 45%, transparent 75%)',
            filter: 'blur(90px)',
          }}
        />

        {/* Titik 2: Mid-Left — Aksen Warm Rose / Blush Pink yang Hidup */}
        <div
          className="absolute top-[28%] -left-[8%] md:-left-[4%] w-[550px] md:w-[800px] h-[550px] md:h-[800px] rounded-full pointer-events-none transform-gpu"
          style={{
            background: 'radial-gradient(circle at center, rgba(251, 113, 133, 0.18) 0%, rgba(244, 114, 182, 0.10) 45%, transparent 75%)',
            filter: 'blur(95px)',
          }}
        />

        {/* Titik 3: Lower-Right — Aksen Soft Rose Pink Hangat */}
        <div
          className="absolute top-[60%] -right-[5%] md:right-[4%] w-[550px] md:w-[750px] h-[550px] md:h-[750px] rounded-full pointer-events-none transform-gpu"
          style={{
            background: 'radial-gradient(circle at center, rgba(244, 114, 182, 0.16) 0%, rgba(251, 113, 133, 0.08) 50%, transparent 75%)',
            filter: 'blur(95px)',
          }}
        />

        {/* Titik 4: Lower-Left — Pendaran Sky Cyan & Biru Jakpat Segar */}
        <div
          className="absolute top-[65%] -left-[6%] md:left-[0%] w-[600px] md:w-[850px] h-[600px] md:h-[850px] rounded-full pointer-events-none transform-gpu"
          style={{
            background: 'radial-gradient(circle at center, rgba(14, 165, 233, 0.20) 0%, rgba(24, 124, 255, 0.12) 45%, transparent 75%)',
            filter: 'blur(95px)',
          }}
        />

        {/* Titik 5: Bottom-Center — Pendaran Lembut Penyeimbang di Bagian Bawah */}
        <div
          className="absolute -bottom-[5%] left-[25%] md:left-[35%] w-[500px] md:w-[700px] h-[500px] md:h-[700px] rounded-full pointer-events-none transform-gpu"
          style={{
            background: 'radial-gradient(circle at center, rgba(56, 189, 248, 0.18) 0%, rgba(24, 124, 255, 0.10) 50%, transparent 75%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <AppNav />
        {isMyOrders && <SpecialMissionRunningBanner />}

        {/* Selaras dengan gate di flow submit: banner membuka drawer profil di
            tempat, bukan menavigasi ke /dashboard/profile. */}
        {profileIncomplete && location.pathname !== '/dashboard/profile' && (
          <div className="bg-amber-50/90 backdrop-blur-xs border-b border-amber-200 px-4 py-2.5 text-center relative z-20">
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

        <main className={isChat ? 'min-w-0 flex-1' : 'min-w-0 pb-10 flex-1'}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
