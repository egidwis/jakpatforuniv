import { useState, useEffect } from 'react';
import { FileText, CreditCard, LogOut, Menu, X, MessageSquare, Globe, HardDrive, BarChart2, Users, Calendar, Bot, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn, useMediaQuery } from '@/lib/utils';
import { InternalDashboard } from './InternalDashboard';
import { TransactionsPage } from './TransactionsPage';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { ConversationsPage } from './ConversationsPage';
import { SchedulingPage } from '../pages/dashboard/SchedulingPage';
import { PublishPageManagement } from './PublishPageManagement';
import { CustomersPage } from './CustomersPage';
import MiminAISetup from '../pages/internal-dash/MiminAISetup';
import { useAuth } from '../context/AuthContext';
import { getAllChatSessions, supabase } from '../utils/supabase';

type Page = 'submissions' | 'transactions' | 'analytics' | 'customers' | 'conversations' | 'scheduling' | 'publish-page' | 'mimin-setup';

export function InternalDashboardWithLayout() {
  // Supabase Auth
  const { user, signOut } = useAuth();

  const [currentPage, setCurrentPage] = useState<Page>('submissions');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem('admin-sidebar-collapsed') === 'true'
  );
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [storageStats, setStorageStats] = useState({ proofCount: 0, bannerCount: 0, contentImageCount: 0 });
  const STORAGE_LIMIT_MB = 102400; // 100 GB Supabase Pro Plan storage limit

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

  const fetchStorageStats = async () => {
    try {
      // 1. Count proof images (page_respondents with proof_url)
      const { count: proofCount } = await supabase
        .from('page_respondents')
        .select('id', { count: 'exact', head: true })
        .not('proof_url', 'is', null);

      // 2. Count unique banner images (survey_pages with banner_url)
      const { data: bannerData } = await supabase
        .from('survey_pages')
        .select('banner_url')
        .not('banner_url', 'is', null)
        .neq('banner_url', '');
      const uniqueBanners = bannerData ? new Set(bannerData.map(d => d.banner_url).filter(Boolean)).size : 0;

      // 3. Estimate content images from block editor (survey_pages with blocks containing images)
      // We count pages that have blocks with image nodes — each page may have ~1-2 images on average
      const { count: pagesWithBlocks } = await supabase
        .from('survey_pages')
        .select('id', { count: 'exact', head: true })
        .not('blocks', 'is', null);
      // Conservative estimate: ~30% of pages have embedded images, avg 1.5 images each
      const estimatedContentImages = Math.round((pagesWithBlocks || 0) * 0.3 * 1.5);

      setStorageStats({
        proofCount: proofCount || 0,
        bannerCount: uniqueBanners,
        contentImageCount: estimatedContentImages,
      });
    } catch (err) {
      console.error('Failed to fetch storage stats', err);
    }
  };

  useEffect(() => {
    // Check initial count
    checkUnreadConversations();
    fetchStorageStats();

    // Listen for read events from ConversationsPage
    const handleReadEvent = () => checkUnreadConversations();
    window.addEventListener('chat-session-viewed', handleReadEvent);

    // Listen for storage change events (from proof deletion)
    const handleStorageChange = () => fetchStorageStats();
    window.addEventListener('proof-storage-changed', handleStorageChange);

    // Optional: Polling every minute to check for new messages
    const interval = setInterval(checkUnreadConversations, 60000);

    return () => {
      window.removeEventListener('chat-session-viewed', handleReadEvent);
      window.removeEventListener('proof-storage-changed', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Media query untuk detect desktop (md breakpoint = 768px)
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Collapsed icon-rail mode is desktop-only; mobile always renders the expanded layout
  const collapsed = isDesktop && isCollapsed;

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

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('admin-sidebar-collapsed', String(next));
  };

  // If not logged in, show Login Screen (Full Page) WITHOUT Sidebar
  if (!user) {
    return <InternalDashboard />;
  }

  // Admin-only guard: redirect non-admin users to /dashboard
  const ADMIN_EMAIL = 'product@jakpat.net';
  if (user.email !== ADMIN_EMAIL) {
    window.location.href = '/dashboard';
    return null;
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
      id: 'analytics' as Page,
      label: 'Analytics',
      icon: BarChart2,
    },
    {
      id: 'customers' as Page,
      label: 'Customers',
      icon: Users,
    },
    {
      id: 'conversations' as Page,
      label: 'Conversations',
      icon: MessageSquare,
    },
    {
      id: 'scheduling' as Page,
      label: 'Ads Schedule',
      icon: Calendar,
    },
    {
      id: 'publish-page' as Page,
      label: 'Pages',
      icon: Globe,
    },
    {
      id: 'mimin-setup' as Page,
      label: 'Mimin AI',
      icon: Bot,
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
      <TooltipProvider delayDuration={0}>
        <aside
          className={cn(
            'fixed md:static inset-y-0 left-0 z-50 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out md:transition-[width] md:duration-200',
            collapsed ? 'w-16' : 'w-64',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          )}
        >
        {/* Header */}
        <div className={cn('flex items-center border-b border-gray-200 px-3', collapsed ? 'flex-col gap-2 py-3' : 'h-14 gap-2')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                J
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Jakpat for Universities</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              'font-semibold text-sm text-gray-900 whitespace-nowrap overflow-hidden transition-all duration-200',
              collapsed ? 'w-0 h-0 opacity-0 -my-1' : 'flex-1 opacity-100'
            )}
          >
            Internal Dashboard
          </span>
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex items-center justify-center p-1.5 rounded-md hover:bg-gray-100 shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4 text-gray-600" />
              : <PanelLeftClose className="h-4 w-4 text-gray-600" />}
          </button>
          {!isDesktop && (
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-md hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-600" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const showUnread = item.id === 'conversations' && unreadConversations > 0;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handlePageChange(item.id)}
                    className={cn(
                      'w-full flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <span className="relative shrink-0">
                      <Icon className="h-4 w-4" />
                      {showUnread && collapsed && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex-1 text-left whitespace-nowrap overflow-hidden transition-all duration-200',
                        collapsed ? 'w-0 opacity-0' : 'ml-3 opacity-100'
                      )}
                    >
                      {item.label}
                    </span>
                    {showUnread && !collapsed && (
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0',
                          isActive ? 'bg-blue-600 text-white' : 'bg-red-500 text-white'
                        )}
                      >
                        {unreadConversations > 99 ? '99+' : unreadConversations}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            );
          })}
        </nav>

        {/* Storage Meter - hidden when collapsed */}
        {!collapsed && (
        <div className="border-t border-gray-200 px-4 py-2.5">
          {(() => {
            // Calculate estimated MB from all sources with different avg sizes
            const proofMB = (storageStats.proofCount * 70) / 1024;    // ~70KB avg (compressed proof screenshots)
            const bannerMB = (storageStats.bannerCount * 300) / 1024;  // ~300KB avg (compressed banner, max 500KB)
            const contentMB = (storageStats.contentImageCount * 70) / 1024; // ~70KB avg (block editor images)
            const estMB = proofMB + bannerMB + contentMB;
            const totalFiles = storageStats.proofCount + storageStats.bannerCount + storageStats.contentImageCount;
            const pct = Math.min((estMB / STORAGE_LIMIT_MB) * 100, 100);
            const isCritical = pct >= 80;
            const isWarning = pct >= 60;
            const barColor = isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-emerald-500';
            const estMBStr = estMB >= 1024 ? `${(estMB / 1024).toFixed(1)} GB` : `${estMB.toFixed(0)} MB`;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-default">
                    <HardDrive className={cn('h-3.5 w-3.5 shrink-0', isCritical ? 'text-red-500' : 'text-gray-400')} />
                    <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={cn('text-[10px] whitespace-nowrap', isCritical ? 'text-red-500 font-semibold' : 'text-gray-400')}>
                      ~{estMBStr} / {STORAGE_LIMIT_MB >= 1024 ? `${(STORAGE_LIMIT_MB / 1024).toFixed(0)} GB` : `${STORAGE_LIMIT_MB} MB`}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Supabase Storage — Proof: {storageStats.proofCount.toLocaleString()} · Banner: {storageStats.bannerCount} · Content: ~{storageStats.contentImageCount} ({totalFiles.toLocaleString()} file)
                </TooltipContent>
              </Tooltip>
            );
          })()}
        </div>
        )}

        {/* Footer */}
        <div className={cn('border-t border-gray-200 bg-gray-50/50 p-3 flex items-center gap-2', collapsed && 'flex-col')}>
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div
            className={cn(
              'flex flex-col overflow-hidden transition-all duration-200',
              collapsed ? 'w-0 h-0 opacity-0 -my-1' : 'flex-1 opacity-100'
            )}
          >
            <span className="font-semibold text-xs text-gray-900 truncate">
              {user?.user_metadata?.full_name || 'Admin User'}
            </span>
            <span className="text-[10px] text-gray-500 truncate" title={user?.email}>
              {user?.email}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Logout</TooltipContent>}
          </Tooltip>
        </div>
        </aside>
      </TooltipProvider>

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
        <main className="flex-1 overflow-auto flex flex-col">
          {currentPage === 'submissions' ? (
            <InternalDashboard onLogout={handleLogout} hideAuth={true} />
          ) : currentPage === 'transactions' ? (
            <TransactionsPage />
          ) : currentPage === 'analytics' ? (
            <div className="container mx-auto p-4 md:p-8">
              <AnalyticsDashboard />
            </div>
          ) : currentPage === 'customers' ? (
            <CustomersPage />
          ) : currentPage === 'conversations' ? (
            <div className="container mx-auto p-4 md:p-8">
              <ConversationsPage />
            </div>
          ) : currentPage === 'publish-page' ? (
            <PublishPageManagement />
          ) : currentPage === 'mimin-setup' ? (
            <div className="container mx-auto p-4 md:p-8 h-full">
              <MiminAISetup />
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
