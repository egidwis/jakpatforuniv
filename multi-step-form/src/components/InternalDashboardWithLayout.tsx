import { useState, useEffect } from 'react';
import { FileText, CreditCard, LogOut, Menu, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn, useMediaQuery } from '@/lib/utils';
import { InternalDashboard } from './InternalDashboard';
import { TransactionsPage } from './TransactionsPage';

type Page = 'submissions' | 'transactions';

export function InternalDashboardWithLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [currentPage, setCurrentPage] = useState<Page>('submissions');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Media query untuk detect desktop (md breakpoint = 768px)
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Wait for client-side mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Force light theme for internal dashboard - disable ALL dark mode
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
    // Also set explicit background
    document.body.style.backgroundColor = '#f9fafb';

    // Check if already authenticated in session
    const auth = sessionStorage.getItem('internal_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }

    // Cleanup: restore theme on unmount
    return () => {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const isDark = savedTheme === 'dark' ||
        (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      document.body.style.backgroundColor = '';
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      }
    };
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'jakpat2024') {
      sessionStorage.setItem('internal_auth', 'true');
      setIsAuthenticated(true);
    } else {
      alert('Password salah!');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('internal_auth');
    setIsAuthenticated(false);
    setPassword('');
  };

  const handlePageChange = (page: Page) => {
    setCurrentPage(page);
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md space-y-8 p-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-2xl mb-4">
              J
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Internal Dashboard</h2>
            <p className="text-gray-500 mt-2">Jakpat for Universities</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
              Login
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      id: 'submissions' as Page,
      label: 'Submissions',
      icon: FileText,
    },
    {
      id: 'transactions' as Page,
      label: 'Transactions',
      icon: CreditCard,
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Force light theme styles for all inputs */}
      <style>{`
        #root input,
        #root textarea,
        #root select {
          background-color: white !important;
          color: #111827 !important;
          border-color: #d1d5db !important;
        }
        #root input:focus,
        #root textarea:focus,
        #root select:focus {
          border-color: #3b82f6 !important;
        }
      `}</style>

      {/* Sidebar - Always visible on desktop, sliding on mobile */}
      <aside
        className={cn(
          'fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                J
              </div>
              <div className="flex flex-col">
                <h2 className="font-semibold text-sm text-gray-900">Internal Dashboard</h2>
                <p className="text-xs text-gray-500">Jakpat for Universities</p>
              </div>
            </div>
            {/* Close button - only visible on mobile */}
            {!isDesktop && (
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handlePageChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Backdrop overlay for mobile - Only render on mobile */}
      {!isDesktop && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Header with Hamburger - Only render on mobile */}
        {!isDesktop && (
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <Menu className="h-5 w-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                  J
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-xs text-gray-900">Internal Dashboard</h2>
                  <p className="text-[10px] text-gray-500">Jakpat for Universities</p>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {currentPage === 'submissions' ? (
            <InternalDashboard hideAuth={true} onLogout={handleLogout} />
          ) : (
            <div className="container mx-auto p-4 md:p-8">
              <TransactionsPage />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
