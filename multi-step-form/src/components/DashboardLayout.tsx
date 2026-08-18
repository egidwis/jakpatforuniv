import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FileText,
  FileSpreadsheet,
  MessageSquare,
  LogOut,
  User,
  ChevronRight
} from 'lucide-react';
import { Button } from './ui/button';

import { LanguageSwitcher } from './LanguageSwitcher';
import jfuIcon from '../assets/jfu-icon.png';
import { getOwnProfile, isProfileComplete } from '../utils/supabase';

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Reset avatar error when user profile changes
  useEffect(() => {
    setAvatarError(false);
  }, [user?.user_metadata?.avatar_url]);

  // Banner ajakan melengkapi profil (user Google / user lama). Dicek ulang tiap
  // pindah halaman agar hilang segera setelah profil dilengkapi.
  useEffect(() => {
    let cancelled = false;
    getOwnProfile().then((profile) => {
      if (!cancelled) setProfileIncomplete(!isProfileComplete(profile));
    });
    return () => { cancelled = true; };
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    {
      label: 'Ad Order Form',
      path: '/dashboard/submit',
      icon: <FileText className="w-5 h-5" />
    },
    {
      label: 'Track Status',
      path: '/dashboard/status',
      icon: <LayoutDashboard className="w-5 h-5" />
    },
    {
      label: 'Support',
      path: '/dashboard/chat',
      icon: <MessageSquare className="w-5 h-5" />
    },
    {
      label: 'JFU Form',
      path: '/dashboard/forms',
      icon: <FileSpreadsheet className="w-5 h-5" />,
      badge: 'BETA'
    }
  ];

  // Bottom tab bar (mobile only) mirrors the sidebar's destinations, plus Profil.
  const mobileNavItems = [
    ...navItems,
    { label: 'Profil', path: '/dashboard/profile', icon: <User className="w-5 h-5" /> }
  ];

  // Full-screen editors manage their own mobile chrome (sticky toolbar, AI bottom
  // sheet) — a second fixed bottom bar here would collide with those.
  const hideMobileNav = /^\/dashboard\/forms\/(new|[^/]+\/edit)$/.test(location.pathname);

  const isProfileActive = location.pathname.startsWith('/dashboard/profile');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 flex-col justify-between">
        <div className="flex flex-col h-full">
          {/* Logo Branding */}
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <img src={jfuIcon} alt="JFU Icon" className="w-10 h-10 object-contain flex-shrink-0" />
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent leading-tight" style={{ backgroundImage: 'linear-gradient(to right, #0091ff, #0077cc)' }}>
                  Dashboard
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">Jakpat For Universities</p>
              </div>
            </div>
          </div>

          <div className="flex-1 py-6 px-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${location.pathname.startsWith(item.path)
                    ? 'dark:bg-blue-900/20 dark:text-blue-400 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }
                `}
                style={location.pathname.startsWith(item.path) ? { backgroundColor: 'rgba(0, 145, 255, 0.06)', color: '#0091ff' } : {}}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className="p-4 border-t space-y-3">
            {/* Language Switcher */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide uppercase">Language</span>
              <LanguageSwitcher />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-700" />

            {/* Profile Link + Sign Out */}
            <div className="flex items-center gap-2">
              <Link
                to="/dashboard/profile"
                title="Lihat Profil"
                className={`
                  flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-lg transition-all duration-150 group
                  ${isProfileActive
                    ? 'dark:bg-blue-900/20 dark:text-blue-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }
                `}
                style={isProfileActive ? { backgroundColor: 'rgba(0, 145, 255, 0.06)' } : {}}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ring-2 transition-all duration-150"
                  style={{
                    backgroundColor: 'rgba(0, 145, 255, 0.1)',
                    boxShadow: isProfileActive ? '0 0 0 2px #0091ff' : '0 0 0 2px transparent'
                  }}
                >
                  {user?.user_metadata?.avatar_url && !avatarError ? (
                    <img 
                      src={user.user_metadata.avatar_url} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full object-cover" 
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <User className="w-4 h-4" style={{ color: '#0091ff' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                    {user?.user_metadata?.full_name || 'User'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {user?.email}
                  </p>
                </div>
                <ChevronRight
                  className="w-4 h-4 flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-400 transition-colors"
                  style={isProfileActive ? { color: '#0091ff' } : {}}
                />
              </Link>

              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign Out" className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 min-w-0 md:pl-64 ${hideMobileNav ? '' : 'pb-16 md:pb-0'}`}>
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
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      {!hideMobileNav && (
        <nav className="flex md:!hidden fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium"
                style={{ color: isActive ? '#0091ff' : undefined }}
              >
                <span className={isActive ? '' : 'text-gray-500 dark:text-gray-400'}>{item.icon}</span>
                <span className={`truncate max-w-full px-1 ${isActive ? 'font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                  {item.label}
                </span>
                {item.badge && (
                  <span className="text-[8px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 px-1 rounded-full uppercase tracking-wider leading-tight">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
