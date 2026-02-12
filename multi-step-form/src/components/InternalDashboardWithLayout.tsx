import { useState, useEffect } from 'react';
import { FileText, CreditCard, LogOut, Menu, X, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';
import { cn, useMediaQuery } from '@/lib/utils';
import { InternalDashboard } from './InternalDashboard';
import { TransactionsPage } from './TransactionsPage';
import { DemographyPage } from './DemographyPage';
import { ConversationsPage } from './ConversationsPage';
import { SchedulingPage } from '../pages/dashboard/SchedulingPage';
import { useAuth } from '../context/AuthContext';
import { getAllChatSessions } from '../utils/supabase';

type Page = 'submissions' | 'transactions' | 'demography' | 'conversations' | 'scheduling';

export function InternalDashboardWithLayout() {
  // Supabase Auth
  const { user, signOut } = useAuth();

  const [currentPage, setCurrentPage] = useState<Page>('submissions');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [unreadConversations, setUnreadConversations] = useState(0);

  // Function to calculate unread conversations
  const checkUnreadConversations = async () => {
    try {
      const sessions = await getAllChatSessions();
      let unread = 0;

      sessions.forEach(session => {
        const lastViewed = localStorage.getItem(`chat_viewed_${session.id}`);
        const lastMessageTime = new Date(session.last_message_at).getTime();
        const createdTime = new Date(session.created_at).getTime();
        const lastViewedTime = lastViewed ? parseInt(lastViewed) : 0;

        // Heuristic: If last_message_at is very close to created_at (e.g. within 2 seconds), 
        // it means the session was just created and likely has no messages yet.
        // We only want to notify if there is *activity* (messages sent).
        const isJustCreated = Math.abs(lastMessageTime - createdTime) < 2000;

        // If message is newer than last view AND it's not just an empty session creation
        if (lastMessageTime > lastViewedTime && !isJustCreated) {
          unread++;
        }
      });

      setUnreadConversations(unread);
    } catch (error) {
      console.error('Failed to check unread conversations', error);
    }
  };

  useEffect(() => {
    // Check initial count
    checkUnreadConversations();

    // Listen for read events from ConversationsPage
    const handleReadEvent = () => checkUnreadConversations();
    window.addEventListener('chat-session-viewed', handleReadEvent);

    // Optional: Polling every minute to check for new messages
    const interval = setInterval(checkUnreadConversations, 60000);

    return () => {
      window.removeEventListener('chat-session-viewed', handleReadEvent);
      clearInterval(interval);
    };
  }, []);

  // Media query untuk detect desktop (md breakpoint = 768px)
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    // Force light theme for internal dashboard - disable ALL dark mode
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
    // Also set explicit background
    document.body.style.backgroundColor = '#f9fafb';

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

  const handleLogout = async () => {
    await signOut();
  };

  const handlePageChange = (page: Page) => {
    setCurrentPage(page);
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
  };

  // If not logged in, show Login Screen (Full Page) WITHOUT Sidebar
  if (!user) {
    return <InternalDashboard />;
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
    {
      id: 'demography' as Page,
      label: 'Demography',
      icon: FileText, // Or Users if imported, standardizing on FileText or similar
    },
    {
      id: 'conversations' as Page,
      label: 'Conversations',
      icon: MessageSquare,
    },
    {
      id: 'scheduling' as Page,
      label: 'Scheduling',
      icon: FileText, // Or Calendar if imported
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
                  'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors', // Changed to justify-between
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </div>
                {item.id === 'conversations' && unreadConversations > 0 && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    isActive
                      ? "bg-white text-blue-600"
                      : "bg-red-500 text-white"
                  )}>
                    {unreadConversations > 99 ? '99+' : unreadConversations}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-semibold text-xs text-gray-900 truncate">
                  {user?.user_metadata?.full_name || 'Admin User'}
                </span>
                <span className="text-[10px] text-gray-500 truncate" title={user?.email}>
                  {user?.email}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
            <InternalDashboard onLogout={handleLogout} hideAuth={true} />
          ) : currentPage === 'transactions' ? (
            <div className="p-4 md:px-6 md:py-4">
              <TransactionsPage />
            </div>
          ) : currentPage === 'demography' ? (
            <div className="container mx-auto p-4 md:p-8">
              <DemographyPage />
            </div>
          ) : currentPage === 'conversations' ? (
            <div className="container mx-auto p-4 md:p-8">
              <ConversationsPage />
            </div>
          ) : (
            <div className="container mx-auto p-4 md:p-8 h-full">
              <SchedulingPage />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
