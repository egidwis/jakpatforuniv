import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, ChevronDown, Globe, Menu, ShoppingBag, FileText, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useMediaQuery } from '../lib/utils';
import logoMark from '../assets/Jakpat Navbar Logo.webp';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetClose,
} from './ui/sheet';

/**
 * Header Dashboard User:
 * - Desktop: Text-only navigation links (My Order, The Form (coming soon), Chat Mimin) rata kanan dengan Avatar Dropdown.
 * - Mobile: Hamburger menu yang membuka Side Sheet dengan menu lengkap dan Switch Bahasa.
 */
export function AppNav() {
    const { user, signOut } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const [avatarError, setAvatarError] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    
    // Gunakan useMediaQuery untuk menjamin tidak ada tumpang tindih elemen antara mobile & desktop
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    const handleSignOut = async () => {
        setMobileOpen(false);
        await signOut();
        navigate('/login');
    };

    const isMyOrdersActive = location.pathname === '/dashboard' || location.pathname === '/dashboard/status';
    const isChatActive = location.pathname.startsWith('/dashboard/chat');

    return (
        <header className="sticky top-0 z-40 h-14 md:h-16 bg-white/90 backdrop-blur shadow-[0_4px_20px_rgba(25,118,210,0.08)]">
            <div className="max-w-5xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4">
                {/* Logo & Brand */}
                <Link
                    to="/dashboard"
                    className="flex items-center gap-2 shrink-0"
                    title={t('backToOrders')}
                >
                    <img src={logoMark} alt="Jakpat for Universities" className="h-7 md:h-8 w-auto" />
                    <span className="hidden sm:inline text-xs md:text-sm font-bold text-jfu-primary leading-tight">
                        Jakpat for Universities
                    </span>
                </Link>

                {/* Right Side Items Container */}
                <div className="flex flex-1 items-center justify-end gap-2 lg:gap-4">
                    {isDesktop ? (
                        /* DESKTOP NAV - Rata Kanan dengan Avatar */
                        <div className="flex items-center gap-5 lg:gap-6 shrink-0">
                            <nav className="flex items-center gap-4 lg:gap-5">
                                {/* My Order */}
                                <Link
                                    to="/dashboard"
                                    className={`text-sm font-medium transition-colors ${
                                        isMyOrdersActive
                                            ? 'text-jfu-primary font-semibold'
                                            : 'text-gray-600 hover:text-jfu-primary'
                                    }`}
                                >
                                    {t('navMyOrder')}
                                </Link>

                                {/* The Form (coming soon) */}
                                <span
                                    className="relative inline-flex items-center text-sm font-medium text-gray-400 cursor-default select-none"
                                    title="The Form - Coming Soon"
                                >
                                    <span>{t('navTheForm')}</span>
                                    <span className="ml-1 -mt-2.5 px-1 py-0.5 text-[9px] font-bold leading-none rounded bg-amber-100 text-amber-700 uppercase tracking-tighter border border-amber-200/80">
                                        Soon
                                    </span>
                                </span>

                                {/* Chat Mimin */}
                                <Link
                                    to="/dashboard/chat"
                                    className={`text-sm font-medium transition-colors ${
                                        isChatActive
                                            ? 'text-jfu-primary font-semibold'
                                            : 'text-gray-600 hover:text-jfu-primary'
                                    }`}
                                >
                                    {t('navChatMimin')}
                                </Link>
                            </nav>

                            {/* Avatar Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger className="flex items-center gap-1 rounded-full p-0.5 hover:bg-jfu-primary/[0.08] transition-colors outline-none">
                                    <span className="w-8 h-8 rounded-full bg-jfu-primary/10 border border-jfu-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                                        {user?.user_metadata?.avatar_url && !avatarError ? (
                                            <img
                                                src={user.user_metadata.avatar_url}
                                                alt="Profile"
                                                className="w-8 h-8 rounded-full object-cover"
                                                onError={() => setAvatarError(true)}
                                            />
                                        ) : (
                                            <User className="w-4 h-4 text-jfu-primary" />
                                        )}
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 p-1">
                                    <div className="px-2 py-2">
                                        <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">
                                            {user?.user_metadata?.full_name || 'User'}
                                        </p>
                                        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                                    </div>
                                    <DropdownMenuSeparator />
                                    <div className="px-2 py-1.5 flex items-center justify-between gap-3 text-xs text-gray-700 dark:text-gray-200">
                                        <span className="flex items-center gap-1.5 text-gray-600 font-medium">
                                            <Globe className="w-3.5 h-3.5 text-gray-500" />
                                            {t('language')}
                                        </span>
                                        <LanguageSwitcher />
                                    </div>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => navigate('/dashboard/profile')} className="cursor-pointer">
                                        <User className="w-4 h-4 mr-2 text-gray-500" />
                                        {t('navProfile')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600">
                                        <LogOut className="w-4 h-4 mr-2" />
                                        {t('signOut')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ) : (
                        /* MOBILE NAV - Hamburger Menu Drawer */
                        <div className="flex items-center gap-2 shrink-0">
                            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                            <SheetTrigger asChild>
                                <button
                                    type="button"
                                    className="p-2 rounded-lg text-gray-600 hover:text-jfu-primary hover:bg-gray-100 transition-colors focus:outline-none"
                                    aria-label="Open menu"
                                >
                                    <Menu className="w-6 h-6" />
                                </button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-4/5 max-w-xs p-5 flex flex-col justify-between">
                                <SheetHeader className="text-left border-b border-gray-100 pb-4">
                                    <SheetTitle className="sr-only">Mobile Menu</SheetTitle>
                                    <div className="flex items-center gap-3">
                                        <span className="w-10 h-10 rounded-full bg-jfu-primary/10 border border-jfu-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                                            {user?.user_metadata?.avatar_url && !avatarError ? (
                                                <img
                                                    src={user.user_metadata.avatar_url}
                                                    alt="Profile"
                                                    className="w-10 h-10 rounded-full object-cover"
                                                    onError={() => setAvatarError(true)}
                                                />
                                            ) : (
                                                <User className="w-5 h-5 text-jfu-primary" />
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold truncate text-gray-900">
                                                {user?.user_metadata?.full_name || 'User'}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                                        </div>
                                    </div>
                                </SheetHeader>

                                <div className="flex-1 py-4 space-y-4 overflow-y-auto">
                                    {/* Navigation links */}
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
                                            Menu
                                        </p>
                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard"
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                                    isMyOrdersActive
                                                        ? 'bg-jfu-primary/10 text-jfu-primary font-semibold'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                <ShoppingBag className="w-4 h-4 text-jfu-primary" />
                                                <span>{t('navMyOrder')}</span>
                                            </Link>
                                        </SheetClose>

                                        <div
                                            className="flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-400 cursor-default select-none"
                                        >
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-4 h-4 text-gray-400" />
                                                <span>{t('navTheForm')}</span>
                                            </div>
                                            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                                SOON
                                            </span>
                                        </div>

                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard/chat"
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                                    isChatActive
                                                        ? 'bg-jfu-primary/10 text-jfu-primary font-semibold'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                                }`}
                                            >
                                                <MessageCircle className="w-4 h-4 text-jfu-primary" />
                                                <span>{t('navChatMimin')}</span>
                                            </Link>
                                        </SheetClose>
                                    </div>

                                    <div className="border-t border-gray-100 pt-4 space-y-3">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                                            {t('language')}
                                        </p>
                                        <div className="px-2">
                                            <LanguageSwitcher />
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 pt-4 space-y-1">
                                        <SheetClose asChild>
                                            <button
                                                type="button"
                                                onClick={() => navigate('/dashboard/profile')}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                                            >
                                                <User className="w-4 h-4 text-gray-500" />
                                                <span>{t('navProfile')}</span>
                                            </button>
                                        </SheetClose>
                                    </div>
                                </div>

                                {/* Sign Out at the bottom */}
                                <div className="border-t border-gray-100 pt-3">
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span>{t('signOut')}</span>
                                    </button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                    )}
                </div>
            </div>
        </header>
    );
}
