import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FileText,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

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
    }
  ];

  const isProfileActive = location.pathname.startsWith('/dashboard/profile');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row">


      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-screen w-64 bg-white dark:bg-gray-800 border-r z-50 transition-transform duration-200
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Sidebar content unchanged... */}
        <div className="flex flex-col h-full">
          <div className="p-6 border-b">
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
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${location.pathname.startsWith(item.path)
                    ? 'dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }
                `}
                style={location.pathname.startsWith(item.path) ? { backgroundColor: 'rgba(0, 145, 255, 0.05)', color: '#0091ff' } : {}}
                onClick={() => setIsSidebarOpen(false)}
              >
                {item.icon}
                {item.label}
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
                onClick={() => setIsSidebarOpen(false)}
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
                    ringColor: isProfileActive ? '#0091ff' : 'transparent',
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
      <main className="flex-1 min-w-0 overflow-y-auto h-screen md:pl-64">
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
        <Outlet context={{ isSidebarOpen, toggleSidebar }} />
      </main>
    </div>
  );
}
