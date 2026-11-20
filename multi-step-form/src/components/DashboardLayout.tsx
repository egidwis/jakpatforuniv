import { Suspense, useEffect, useState } from 'react';
import { AmbientBackdrop } from './AmbientBackdrop';
import { useLocation, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppNav } from './AppNav';
import { UniversalFooter } from './UniversalFooter';
import { ProfileCompletionSheet } from './ProfileCompletionSheet';
import { AdminAwayModalHost } from './status/AdminAwayModal';
import { getOwnProfile, isProfileComplete } from '../utils/supabase';

export function DashboardLayout() {
  const location = useLocation();
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

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
    <div className="min-h-screen bg-white font-jakarta dark:bg-gray-900 relative">
      {/* Pendaran latar: satu lapisan radial-gradient, tanpa filter blur (Safari iPhone putih polos, 20 Nov 2026) — lihat AmbientBackdrop.css. */}
      <AmbientBackdrop variant="dashboard" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <AppNav />

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
              agar bisa memakai layanan JFU.
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

        <main className={isChat ? 'min-w-0 flex-1' : 'min-w-0 pb-6 flex-1'}>
          {/* Halaman dashboard dimuat lazy (App.tsx): navbar tetap tampil, hanya
              area konten yang menunggu chunk-nya. */}
          <Suspense
            fallback={
              <div role="status" aria-label="Memuat halaman" className="flex justify-center py-24">
                <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-[#1976D2]" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>

        {!isChat && <UniversalFooter openInNewTab />}

        {/* Satu host modal mode libur untuk seluruh dashboard peneliti — juga
            yang menjaga poller status libur tetap hidup (bukan di akar App:
            halaman publik survei tidak perlu ikut membaca setiap menit). */}
        <AdminAwayModalHost />
      </div>
    </div>
  );
}
