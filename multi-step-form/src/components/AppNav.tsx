import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, ChevronDown, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import logoMark from '../assets/Jakpat Navbar Logo.webp';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';

/**
 * Navbar tunggal untuk semua viewport — satu-satunya chrome navigasi
 * (BottomNav dihapus). Logo = pulang ke Order Saya (homepage); Buat Order
 * hidup sebagai kartu produk di homepage, bukan menu nav.
 *
 * Aturan cascade styles.css: node yang di-toggle visibilitasnya per
 * breakpoint harus node polos (span/div tanpa flex/grid sendiri).
 */
export function AppNav() {
    const { user, signOut } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const [avatarError, setAvatarError] = useState(false);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const isChatActive = location.pathname.startsWith('/dashboard/chat');

    return (
        <header className="sticky top-0 z-40 h-14 md:h-16 bg-white/90 backdrop-blur shadow-[0_4px_20px_rgba(25,118,210,0.08)]">
            <div className="max-w-4xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4">
                <Link
                    to="/dashboard/status"
                    className="flex items-center gap-2.5 shrink-0"
                    title={t('backToOrders')}
                >
                    <img src={logoMark} alt="Jakpat for Universities" className="h-8 w-auto" />
                    <span className="hidden md:inline text-sm font-bold text-jfu-primary leading-tight">
                        Jakpat <span className="font-medium text-[#666]">for Universities</span>
                    </span>
                </Link>

                <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
                    {/* Switcher bahasa tampil langsung hanya di desktop;
                        di mobile pindah ke dalam dropdown avatar. */}
                    <span className="hidden md:block">
                        <LanguageSwitcher />
                    </span>

                    <Link
                        to="/dashboard/chat"
                        aria-label={t('navHelp')}
                        title={t('navHelp')}
                        className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${isChatActive
                            ? 'bg-jfu-primary/[0.12] text-jfu-primary'
                            : 'text-[#555] hover:text-jfu-primary hover:bg-jfu-primary/[0.08]'
                            }`}
                    >
                        <MessageCircle className="w-5 h-5" strokeWidth={isChatActive ? 2.4 : 2} />
                    </Link>

                    <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full pl-1 pr-1.5 py-1 hover:bg-jfu-primary/[0.08] transition-colors outline-none">
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
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <div className="px-2 py-1.5">
                                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                    {user?.user_metadata?.full_name || 'User'}
                                </p>
                                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                            </div>
                            <DropdownMenuSeparator />
                            {/* Bahasa di mobile: baris non-menu-item agar klik
                                toggle tidak menutup dropdown. */}
                            <span className="md:hidden">
                                <span className="px-2 py-1.5 flex items-center justify-between gap-3">
                                    <span className="text-sm text-gray-700 dark:text-gray-200">{t('language')}</span>
                                    <LanguageSwitcher />
                                </span>
                                <DropdownMenuSeparator />
                            </span>
                            <DropdownMenuItem onClick={() => navigate('/dashboard/profile')} className="cursor-pointer">
                                <User className="w-4 h-4 mr-2" />
                                {t('navProfile')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600">
                                <LogOut className="w-4 h-4 mr-2" />
                                {t('signOut')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
