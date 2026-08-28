import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, ChevronDown, ChevronRight, Globe, Menu, LayoutDashboard, ListPlus, MessageCircle, Sparkles, Wrench } from 'lucide-react';
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
 * - Desktop: Text-only navigation links (My Order, Tools Dropdown [Buat Kuesioner, Data Analyzer], Chat Mimin) rata kanan dengan Avatar Dropdown.
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
    // Termasuk /forms/new, /forms/:id/edit, dan /forms/:id/responses — seluruh
    // pembuat form hidup di bawah prefix ini.
    const isTheFormActive = location.pathname.startsWith('/dashboard/forms');
    const isAnalyzerActive = location.pathname.startsWith('/dashboard/analyzer');
    const isToolsActive = isTheFormActive || isAnalyzerActive;

    return (
        <header className="sticky top-0 z-40 w-full h-14 md:h-16 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
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
                <div className="flex flex-1 items-center justify-end gap-3 lg:gap-6 h-full">
                    {isDesktop ? (
                        /* DESKTOP NAV - Rata Kanan dengan Avatar */
                        <div className="flex items-center gap-4 lg:gap-6 shrink-0 h-full">
                            <nav className="flex items-center gap-4 lg:gap-6 h-full">
                                {/* Dashboard */}
                                <Link
                                    to="/dashboard"
                                    className={`relative flex items-center gap-2 h-14 md:h-16 px-1 text-sm font-bold transition-colors ${
                                        isMyOrdersActive
                                            ? 'text-jfu-primary'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <LayoutDashboard className={`w-4 h-4 shrink-0 transition-colors ${isMyOrdersActive ? 'text-jfu-primary' : 'text-slate-400'}`} />
                                    <span>{t('navMyOrder')}</span>
                                    {isMyOrdersActive && (
                                        <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-jfu-primary rounded-t-full" />
                                    )}
                                </Link>

                                {/* Tools Dropdown (Buat Kuesioner + Data Analyzer) */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        className={`relative flex items-center gap-1.5 h-14 md:h-16 px-1 text-sm font-bold transition-colors outline-none cursor-pointer ${
                                            isToolsActive
                                                ? 'text-jfu-primary'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        <Wrench className={`w-4 h-4 shrink-0 transition-colors ${isToolsActive ? 'text-jfu-primary' : 'text-slate-400'}`} />
                                        <span>Tools</span>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold leading-none rounded-full bg-blue-100 text-blue-800 uppercase tracking-tight border border-blue-200/80">
                                            New
                                        </span>
                                        <ChevronDown className={`w-3.5 h-3.5 transition-colors ${isToolsActive ? 'text-jfu-primary' : 'text-slate-400'}`} />
                                        {isToolsActive && (
                                            <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-jfu-primary rounded-t-full" />
                                        )}
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-56 p-1.5 shadow-lg border-slate-200">
                                        <DropdownMenuItem
                                            onClick={() => navigate('/dashboard/forms')}
                                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                                isTheFormActive ? 'bg-jfu-primary/10 text-jfu-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <ListPlus className={`w-4 h-4 ${isTheFormActive ? 'text-jfu-primary' : 'text-slate-500'}`} />
                                                <span className="text-sm">{t('navTheForm')}</span>
                                            </div>
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold leading-none rounded-full bg-amber-100 text-amber-800 uppercase tracking-tight border border-amber-200/80">
                                                Beta
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => navigate('/dashboard/analyzer')}
                                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                                isAnalyzerActive ? 'bg-jfu-primary/10 text-jfu-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Sparkles className={`w-4 h-4 ${isAnalyzerActive ? 'text-indigo-600' : 'text-slate-500'}`} />
                                                <span className="text-sm">Data Analyzer</span>
                                            </div>
                                            <span className="px-1.5 py-0.5 text-[9px] font-bold leading-none rounded-full bg-indigo-100 text-indigo-800 uppercase tracking-tight border border-indigo-200/80">
                                                AI
                                            </span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Chat Mimin */}
                                <Link
                                    to="/dashboard/chat"
                                    className={`relative flex items-center gap-2 h-14 md:h-16 px-1 text-sm font-bold transition-colors ${
                                        isChatActive
                                            ? 'text-jfu-primary'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <MessageCircle className={`w-4 h-4 shrink-0 transition-colors ${isChatActive ? 'text-jfu-primary' : 'text-slate-400'}`} />
                                    <span>{t('navChatMimin')}</span>
                                    {isChatActive && (
                                        <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-jfu-primary rounded-t-full" />
                                    )}
                                </Link>
                            </nav>

                            {/* Avatar Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full p-1 hover:bg-slate-100 transition-colors outline-none">
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
                            <SheetContent side="right" className="w-[85vw] max-w-xs p-0 flex flex-col justify-between bg-white border-l border-slate-200/80 shadow-2xl overflow-hidden">
                                {/* 1. HEADER: User Profile Info (Padded for Close X button) */}
                                <div className="p-4 pr-12 border-b border-slate-100 bg-slate-50/50">
                                    <SheetHeader className="text-left sr-only">
                                        <SheetTitle>Mobile Menu</SheetTitle>
                                    </SheetHeader>
                                    <div className="flex items-center gap-3">
                                        <span className="w-10 h-10 rounded-full bg-jfu-primary/10 border border-jfu-primary/20 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
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
                                            <p className="text-sm font-bold truncate text-slate-900">
                                                {user?.user_metadata?.full_name || 'User'}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. BODY NAVIGATION: Clear Groups & Badges */}
                                <div className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">
                                    {/* Group A: Menu Utama */}
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1.5">
                                            Menu Utama
                                        </p>
                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard"
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                                    isMyOrdersActive
                                                        ? 'bg-jfu-primary text-white shadow-xs'
                                                        : 'text-slate-700 hover:bg-slate-100/80'
                                                }`}
                                            >
                                                <LayoutDashboard className={`w-4 h-4 shrink-0 ${isMyOrdersActive ? 'text-white' : 'text-slate-500'}`} />
                                                <span>{t('navMyOrder')}</span>
                                            </Link>
                                        </SheetClose>

                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard/chat"
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                                    isChatActive
                                                        ? 'bg-jfu-primary text-white shadow-xs'
                                                        : 'text-slate-700 hover:bg-slate-100/80'
                                                }`}
                                            >
                                                <MessageCircle className={`w-4 h-4 shrink-0 ${isChatActive ? 'text-white' : 'text-slate-500'}`} />
                                                <span>{t('navChatMimin')}</span>
                                            </Link>
                                        </SheetClose>
                                    </div>

                                    {/* Group B: Tools & Fitur */}
                                    <div className="space-y-1 pt-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1.5">
                                            Tools &amp; Fitur
                                        </p>

                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard/forms"
                                                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                                    isTheFormActive
                                                        ? 'bg-jfu-primary text-white shadow-xs'
                                                        : 'text-slate-700 hover:bg-slate-100/80'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <ListPlus className={`w-4 h-4 shrink-0 ${isTheFormActive ? 'text-white' : 'text-slate-500'}`} />
                                                    <span>{t('navTheForm')}</span>
                                                </div>
                                                <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${isTheFormActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200/60'}`}>
                                                    Beta
                                                </span>
                                            </Link>
                                        </SheetClose>

                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard/analyzer"
                                                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                                    isAnalyzerActive
                                                        ? 'bg-jfu-primary text-white shadow-xs'
                                                        : 'text-slate-700 hover:bg-slate-100/80'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Sparkles className={`w-4 h-4 shrink-0 ${isAnalyzerActive ? 'text-white' : 'text-indigo-500'}`} />
                                                    <span>Data Analyzer</span>
                                                </div>
                                                <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${isAnalyzerActive ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800 border border-indigo-200/60'}`}>
                                                    AI
                                                </span>
                                            </Link>
                                        </SheetClose>
                                    </div>

                                    {/* Group C: Akun Pengguna */}
                                    <div className="space-y-1 pt-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1.5">
                                            Akun
                                        </p>
                                        <SheetClose asChild>
                                            <Link
                                                to="/dashboard/profile"
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                                    location.pathname === '/dashboard/profile'
                                                        ? 'bg-jfu-primary text-white shadow-xs'
                                                        : 'text-slate-700 hover:bg-slate-100/80'
                                                }`}
                                            >
                                                <User className={`w-4 h-4 shrink-0 ${location.pathname === '/dashboard/profile' ? 'text-white' : 'text-slate-500'}`} />
                                                <span>{t('navProfile')}</span>
                                            </Link>
                                        </SheetClose>
                                    </div>
                                </div>

                                {/* 3. FOOTER: Preferences & Sign Out */}
                                <div className="p-4 border-t border-slate-100 bg-slate-50/60 space-y-2">
                                    {/* Language Switcher Bar */}
                                    <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white border border-slate-200/70 shadow-xs">
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                                            <span>{t('language')}</span>
                                        </div>
                                        <LanguageSwitcher />
                                    </div>

                                    {/* Sign Out */}
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
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
