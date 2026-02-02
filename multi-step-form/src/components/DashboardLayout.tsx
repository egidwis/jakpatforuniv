import { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  LogOut,
  User
} from 'lucide-react';
import { Button } from './ui/button';

import { LanguageSwitcher } from './LanguageSwitcher';

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const navItems = [
    {
      label: 'Submit Survey',
      path: '/dashboard/submit',
      icon: <FileText className="w-5 h-5" />
    },
    {
      label: 'Track Status',
      path: '/dashboard/status',
      icon: <LayoutDashboard className="w-5 h-5" />
    },
    {
      label: 'Bantuan',
      path: '/dashboard/chat',
      icon: <MessageSquare className="w-5 h-5" />
    }
  ];

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
              <img src="/src/assets/jfu-icon.png" alt="JFU Icon" className="w-10 h-10 object-contain flex-shrink-0" />
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent leading-tight" style={{ backgroundImage: 'linear-gradient(to right, #0091ff, #0077cc)' }}>
                  JFU Dashboard
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">Jakpat For University</p>
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

          <div className="p-4 border-t space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 145, 255, 0.1)' }}>
                {user?.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Profile" className="w-8 h-8 rounded-full" />
                ) : (
                  <User className="w-4 h-4" style={{ color: '#0091ff' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                  {user?.user_metadata?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-between">
              <div className="flex gap-1">

                <LanguageSwitcher />
              </div>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign Out" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto h-screen md:pl-64">
        <Outlet context={{ isSidebarOpen, toggleSidebar }} />
      </main>
    </div>
  );
}
