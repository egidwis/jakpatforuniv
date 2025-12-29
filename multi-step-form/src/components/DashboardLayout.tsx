import { useState } from 'react';
import { FileText, CreditCard, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

type Page = 'submissions' | 'transactions';

export function DashboardLayout({ children, onLogout }: DashboardLayoutProps) {
  const [currentPage, setCurrentPage] = useState<Page>('submissions');

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
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
              J
            </div>
            <div className="flex flex-col">
              <h2 className="font-semibold text-sm">Internal Dashboard</h2>
              <p className="text-xs text-muted-foreground">Jakpat for Universities</p>
            </div>
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
                onClick={() => setCurrentPage(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-8">
          {/* Pass currentPage to children via cloneElement or context */}
          {typeof children === 'function' ? children({ currentPage }) : children}
        </div>
      </main>
    </div>
  );
}
