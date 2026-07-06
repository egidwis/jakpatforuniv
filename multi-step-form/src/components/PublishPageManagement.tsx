import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import { isLive, compareDisplayOrder } from '@/utils/adOrdering';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, ExternalLink, RefreshCw, PenLine, Plus, Trophy, ChevronLeft, ChevronRight, Check, Download, Loader2, Users, AlertTriangle, GripVertical } from 'lucide-react';
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { SubmissionsManagerView } from './SubmissionsManagerView';
import { toast } from 'sonner';
import { fetchProfileNames } from '../utils/profileNames';

interface PageData {
    id: string;
    slug: string;
    title: string;
    is_published: boolean;
    is_extra_ad: boolean;
    views_count: number;
    publish_start_date: string | null;
    publish_end_date: string | null;
    display_order?: number | null;
    submission_id: string;
    created_at: string;
    form_submissions?: {
        title: string;
        full_name: string;
        auth_user_id?: string | null;
        university?: string;
        prize_per_winner?: number;
        winner_count?: number;
    };
    owner_name?: string;
    current_winners_count?: number;
    has_pending_proofs?: boolean;
    page_respondents?: { count: number }[];
    requires_banner_update?: boolean;
}

export function PublishPageManagement() {
    const [pages, setPages] = useState<PageData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('ad');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    });
    const [searchQuery, setSearchQuery] = useState('');

    const handlePrevMonth = () => {
        const [y, m] = selectedMonth.split('-');
        const date = new Date(parseInt(y), parseInt(m) - 2, 1);
        setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        const [y, m] = selectedMonth.split('-');
        const date = new Date(parseInt(y), parseInt(m), 1);
        setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };

    const formatMonth = (ym: string) => {
        const [y, m] = ym.split('-');
        const date = new Date(parseInt(y), parseInt(m) - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const currentMonthPages = useMemo(() => {
        return pages.filter(p => {
            const dateStr = p.publish_start_date || p.created_at;
            if (!dateStr) return false;
            try {
                return new Date(dateStr).toISOString().slice(0, 7) === selectedMonth;
            } catch (e) {
                return false;
            }
        });
    }, [pages, selectedMonth]);

    // Page Builder State
    const [isPageBuilderOpen, setIsPageBuilderOpen] = useState(false);
    const [selectedPage, setSelectedPage] = useState<PageData | null>(null);

    // Submissions Manager View State
    const [activeSubmissionPage, setActiveSubmissionPage] = useState<PageData | null>(null);

    // Period Winners Modal State
    const [showPeriodWinners, setShowPeriodWinners] = useState(false);
    const [periodWinnersLoading, setPeriodWinnersLoading] = useState(false);
    const [periodWinners, setPeriodWinners] = useState<{
        pageTitle: string;
        pageId: string;
        rewardAmount: number;
        winners: {
            jakpat_id: string;
            user_id: number | null;
            email: string | null;
            respondent_name: string | null;
            ewallet_provider: string | null;
            e_wallet_number: string | null;
            ktp_number: string | null;
            city: string | null;
            province: string | null;
            reward_amount: number | null;
        }[];
    }[]>([]);

    const pagesWithWinnersInMonth = useMemo(() => {
        return currentMonthPages.filter(p => (p.current_winners_count || 0) > 0);
    }, [currentMonthPages]);

    const fetchPeriodWinners = useCallback(async () => {
        const pageIds = pagesWithWinnersInMonth.map(p => p.id);
        if (pageIds.length === 0) return;

        setPeriodWinnersLoading(true);
        try {
            const { data, error } = await supabase
                .from('survey_winners')
                .select('*')
                .in('page_id', pageIds)
                .order('selected_at', { ascending: true });

            if (error) throw error;

            // Group by page
            const grouped: Record<string, typeof periodWinners[0]> = {};
            pagesWithWinnersInMonth.forEach(p => {
                grouped[p.id] = {
                    pageTitle: p.title,
                    pageId: p.id,
                    rewardAmount: p.form_submissions?.prize_per_winner || 0,
                    winners: [],
                };
            });

            (data || []).forEach((w: any) => {
                if (!grouped[w.page_id]) return;
                grouped[w.page_id].winners.push({
                    jakpat_id: w.jakpat_id,
                    user_id: null,
                    email: null,
                    respondent_name: w.respondent_name,
                    ewallet_provider: w.ewallet_provider,
                    e_wallet_number: w.e_wallet_number,
                    ktp_number: null,
                    city: null,
                    province: null,
                    reward_amount: w.reward_amount,
                });
            });

            setPeriodWinners(Object.values(grouped).filter(g => g.winners.length > 0));
            setShowPeriodWinners(true);
        } catch (error) {
            console.error('Error fetching period winners:', error);
            toast.error('Gagal memuat data pemenang');
        } finally {
            setPeriodWinnersLoading(false);
        }
    }, [pagesWithWinnersInMonth]);

    const exportPeriodWinnersCSV = useCallback(() => {
        if (periodWinners.length === 0) return;
        const headers = ['Judul Page', 'Jakpat ID', 'User ID', 'Email', 'Nama', 'Provider E-Wallet', 'No. E-Wallet', 'NIK/NPWP', 'Lokasi', 'Nominal'];
        const rows: string[][] = [];
        periodWinners.forEach(group => {
            group.winners.forEach(w => {
                rows.push([
                    group.pageTitle,
                    w.jakpat_id,
                    String(w.user_id ?? ''),
                    w.email ?? '',
                    w.respondent_name ?? '',
                    w.ewallet_provider ?? '',
                    w.e_wallet_number ?? '',
                    w.ktp_number ?? '',
                    [w.city, w.province].filter(Boolean).join(', '),
                    String(w.reward_amount ?? ''),
                ]);
            });
        });
        const csvContent = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pemenang_${selectedMonth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV berhasil di-download');
    }, [periodWinners, selectedMonth]);

    const fetchPages = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('survey_pages')
                .select(`
                    *,
                    form_submissions (
                        title,
                        full_name,
                        auth_user_id,
                        university,
                        prize_per_winner,
                        winner_count
                    ),
                    page_respondents (
                        count
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const pagesWithWinners = data || [];
            const ownerNames = await fetchProfileNames(
              pagesWithWinners.map((p: any) => p.form_submissions?.auth_user_id)
            );
            pagesWithWinners.forEach((p: any) => {
              const authId = p.form_submissions?.auth_user_id;
              // Linked page: auth account name (never biodata/Nama Invoice).
              // Orphan page (no auth_user_id): its Nama Invoice — accepted exception.
              p.owner_name = authId
                ? (ownerNames.get(authId)?.name || '')
                : (p.form_submissions?.full_name || '');
            });
            const pageIds = pagesWithWinners.map(p => p.id);

            if (pageIds.length > 0) {
                const { data: winnersData } = await supabase
                    .from('survey_winners')
                    .select('page_id')
                    .in('page_id', pageIds);

                const pagesNeedingProofsCheck = pagesWithWinners.filter(p => {
                    const s = p.form_submissions;
                    const hasRewards = !!s?.prize_per_winner && s.prize_per_winner > 0;
                    return hasRewards && (s?.winner_count || 0) > 0;
                }).map(p => p.id);

                let pagesWithProofs = new Set<string>();
                if (pagesNeedingProofsCheck.length > 0) {
                    const chunkSize = 10;
                    for (let i = 0; i < pagesNeedingProofsCheck.length; i += chunkSize) {
                        const batch = pagesNeedingProofsCheck.slice(i, i + chunkSize);
                        const promises = batch.map(id =>
                            supabase
                                .from('page_respondents')
                                .select('page_id')
                                .eq('page_id', id)
                                .not('proof_url', 'is', null)
                                .neq('proof_url', '')
                                .limit(1)
                        );
                        const results = await Promise.all(promises);
                        results.forEach(res => {
                            if (res.data && res.data.length > 0) {
                                pagesWithProofs.add(res.data[0].page_id);
                            }
                        });
                    }
                }

                const winnerCounts: Record<string, number> = {};
                if (winnersData) {
                    winnersData.forEach(w => {
                        if (w.page_id) {
                            winnerCounts[w.page_id] = (winnerCounts[w.page_id] || 0) + 1;
                        }
                    });
                }

                pagesWithWinners.forEach(p => {
                    p.current_winners_count = winnerCounts[p.id] || 0;
                    p.has_pending_proofs = pagesWithProofs.has(p.id);
                });
            }

            setPages(pagesWithWinners);
        } catch (error: any) {
            console.error('Error fetching pages:', error);
            toast.error('Failed to load pages');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPages();
    }, []);

    // ==================== LIVE ORDER (drag-to-reorder) ====================
    // Currently-live ads (not month-scoped — exactly the set the app/web display).
    // Single flat list, ALL types draggable (compareDisplayOrder = 3-band sort).
    // Default for not-yet-placed pages: new regular & announcement surface at the
    // TOP, new extra ads sink to the BOTTOM. Admins can drag any item anywhere
    // (incl. a regular/announcement below the extras for a pilot/test); saving pins
    // the exact order.
    const livePages = useMemo(() => {
        const now = Date.now();
        return pages.filter(p => isLive(p, now)).sort(compareDisplayOrder);
    }, [pages]);

    const [orderedLive, setOrderedLive] = useState<PageData[]>([]);
    const [savingOrder, setSavingOrder] = useState(false);
    const dragIndexRef = useRef<number | null>(null);

    // Keep the working order in sync whenever the live set changes (e.g. after fetch).
    useEffect(() => {
        setOrderedLive(livePages);
    }, [livePages]);

    const orderDirty = useMemo(
        () => orderedLive.map(p => p.id).join(',') !== livePages.map(p => p.id).join(','),
        [orderedLive, livePages]
    );

    const handleDragStart = (index: number) => { dragIndexRef.current = index; };
    const handleDragEnter = (index: number) => {
        const from = dragIndexRef.current;
        if (from === null || from === index) return;
        setOrderedLive(prev => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            return next;
        });
        dragIndexRef.current = index;
    };
    const handleDragEnd = () => { dragIndexRef.current = null; };

    const handleSaveOrder = async () => {
        setSavingOrder(true);
        try {
            const orderedIds = orderedLive.map(p => p.id);
            const { error } = await supabase.rpc('set_survey_pages_order', { ordered_ids: orderedIds });
            if (error) throw error;
            toast.success('Urutan iklan live berhasil disimpan');
            await fetchPages();
        } catch (e) {
            console.error('Failed to save live order:', e);
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Gagal menyimpan urutan: ' + msg);
        } finally {
            setSavingOrder(false);
        }
    };

    const filterPages = (tab: string) => {
        return currentMonthPages.filter(page => {
            // Search Filter
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch =
                page.title?.toLowerCase().includes(searchLower) ||
                page.slug?.toLowerCase().includes(searchLower) ||
                page.form_submissions?.full_name?.toLowerCase().includes(searchLower) ||
                page.owner_name?.toLowerCase().includes(searchLower);

            if (!matchesSearch) return false;

            // Tab Filter
            if (tab === 'ad') {
                return !!page.submission_id;
            }
            if (tab === 'announcement') {
                return !page.submission_id;
            }

            // 'all'
            return true;
        });
    };

    const handleEditPage = (page: PageData) => {
        setSelectedPage(page);
        setIsPageBuilderOpen(true);
    };

    const handleCloseBuilder = () => {
        setIsPageBuilderOpen(false);
        setSelectedPage(null);
        fetchPages(); // Refresh data
    };

    // Sort by status priority: Draft > Scheduled > Live > Finished
    const getStatusPriority = (page: PageData) => {
        const now = new Date();
        const startDate = page.publish_start_date ? new Date(page.publish_start_date) : null;
        const endDate = page.publish_end_date ? new Date(page.publish_end_date) : null;

        if (!page.is_published) return 0; // Draft
        if (startDate && startDate > now) return 1; // Scheduled
        if (endDate && endDate < now) return 3; // Finished
        return 2; // Live
    };

    const filteredPages = filterPages(activeTab).sort((a, b) => {
        const statusDiff = getStatusPriority(a) - getStatusPriority(b);
        if (statusDiff !== 0) return statusDiff;

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    if (activeSubmissionPage) {
        return (
            <div className="h-full pt-4 md:pt-0 overflow-hidden bg-gray-50/50">
                <SubmissionsManagerView
                    pageId={activeSubmissionPage.id}
                    pageTitle={activeSubmissionPage.title}
                    rewardAmount={activeSubmissionPage.form_submissions?.prize_per_winner || 0}
                    rewardCount={activeSubmissionPage.form_submissions?.winner_count || 5}
                    onBack={() => {
                        setActiveSubmissionPage(null);
                        fetchPages();
                    }}
                />
            </div>
        );
    }

    return (
        <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">
            {/* Unified Toolbar Container */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]">
                {/* Top Row: Period Selector, Announcement, Refresh */}
                <div className="flex flex-row items-center gap-4 w-full">
                    {/* Period Selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-600">Periode</span>
                        <div className="flex items-center gap-3 bg-gray-50/80 p-1.5 rounded-lg border border-gray-200/50">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-white hover:shadow-sm"
                                onClick={handlePrevMonth}
                            >
                                <ChevronLeft className="h-4 w-4 text-gray-600" />
                            </Button>
                            <h2 className="text-sm font-semibold min-w-[140px] text-center text-gray-700 select-none">
                                {formatMonth(selectedMonth)}
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-white hover:shadow-sm"
                                onClick={handleNextMonth}
                            >
                                <ChevronRight className="h-4 w-4 text-gray-600" />
                            </Button>
                        </div>
                    </div>

                    {/* Lihat Pemenang + Announcement & Refresh */}
                    <div className="flex items-center gap-3 ml-auto shrink-0">
                        {pagesWithWinnersInMonth.length > 0 && (
                            <Button
                                onClick={fetchPeriodWinners}
                                variant="outline"
                                size="sm"
                                disabled={periodWinnersLoading}
                                className="h-9 text-xs font-semibold border-amber-200 text-amber-700 hover:bg-amber-50 bg-white shadow-sm"
                            >
                                {periodWinnersLoading ? (
                                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                ) : (
                                    <Trophy className="w-4 h-4 mr-1.5" />
                                )}
                                Lihat Pemenang
                            </Button>
                        )}
                        <Button
                            onClick={() => {
                                setSelectedPage(null);
                                setIsPageBuilderOpen(true);
                            }}
                            variant="default"
                            size="sm"
                            className="h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Announcement Page
                        </Button>

                        <Button
                            onClick={fetchPages}
                            variant="outline"
                            size="sm"
                            disabled={loading}
                            className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shrink-0 shadow-sm"
                            title="Refresh data"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                {/* Bottom Row: Search & Pills */}
                <div className="flex flex-wrap items-center gap-4 w-full">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-[400px]">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search by title, researcher..."
                            className="pl-9 bg-white border-gray-200 focus:border-blue-500 transition-all h-9 text-sm w-full shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Tabs */}
                    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                        {[
                            { id: 'ad', label: 'Ad Page', count: currentMonthPages.filter(p => !!p.submission_id).length, color: 'bg-blue-50 text-blue-700' },
                            { id: 'announcement', label: 'Announcement', count: currentMonthPages.filter(p => !p.submission_id).length, color: 'bg-purple-50 text-purple-700' },
                            { id: 'live', label: 'Live', count: livePages.length, color: 'bg-green-50 text-green-700' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap h-9
                                    ${activeTab === tab.id
                                        ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}
                                `}
                            >
                                {tab.label}
                                <span className={`
                                    px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[18px] text-center
                                    ${activeTab === tab.id ? 'bg-white/20 text-white' : tab.color}
                                `}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Live ordering section — drag-to-reorder the currently-live ad listing */}
            {activeTab === 'live' && (
                <div className="flex-1 min-h-0 overflow-auto pb-4 pr-2">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                            <div className="flex items-start gap-2 text-xs text-gray-500 max-w-2xl">
                                <GripVertical className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                <span>
                                    Seret untuk mengatur urutan iklan yang sedang <span className="font-semibold text-green-700">live</span>.
                                    Urutan dipakai di mobile app & web listing (mengabaikan filter periode).
                                    Page baru: <span className="font-medium">regular & announcement</span> muncul di atas, <span className="font-medium">extra ads</span> di bawah — semua bebas diseret (termasuk menaruh regular/announcement paling bawah). Save untuk mengunci urutan.
                                </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {orderDirty && (
                                    <Button variant="outline" size="sm" onClick={() => setOrderedLive(livePages)} disabled={savingOrder} className="h-9 text-xs">
                                        Reset
                                    </Button>
                                )}
                                <Button size="sm" onClick={handleSaveOrder} disabled={!orderDirty || savingOrder} className="h-9 text-xs bg-blue-600 hover:bg-blue-700">
                                    {savingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                                    Save Order
                                </Button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
                        ) : orderedLive.length === 0 ? (
                            <div className="py-12 text-center text-gray-400 text-sm">Tidak ada iklan yang sedang live saat ini.</div>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {orderedLive.map((page, index) => (
                                    <li
                                        key={page.id}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragEnter={() => handleDragEnter(index)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDragEnd={handleDragEnd}
                                        className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow transition-shadow cursor-grab active:cursor-grabbing"
                                    >
                                        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                                        <span className="w-6 text-center text-xs font-bold text-gray-400 shrink-0">{index + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-gray-900 text-sm truncate">{page.title}</div>
                                            {page.submission_id && page.owner_name && (
                                                <div className="text-[11px] text-gray-500 truncate">
                                                    {page.owner_name}{page.form_submissions?.university ? ` - ${page.form_submissions.university}` : ''}
                                                </div>
                                            )}
                                        </div>
                                        {page.is_extra_ad ? (
                                            <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[11px] border border-amber-100 shrink-0">Extra Ad</span>
                                        ) : !page.submission_id ? (
                                            <span className="font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full text-[11px] border border-purple-100 shrink-0">Announcement</span>
                                        ) : (
                                            <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[11px] border border-blue-100 shrink-0">Survey Ad</span>
                                        )}
                                        <span className="text-[11px] text-gray-400 shrink-0 hidden md:inline">{page.views_count || 0} views</span>
                                        <Button variant="outline" size="sm" onClick={() => handleEditPage(page)} title="Edit Page" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 border-gray-200 shrink-0">
                                            <PenLine className="w-4 h-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Main Table Card */}
            {activeTab !== 'live' && (
            <div className="flex-1 min-h-0 overflow-auto pb-4 pr-2">
                <Table className="min-w-[1200px] border-separate border-spacing-y-3 table-fixed">
                    <colgroup>
                        <col style={{ width: '350px' }} />
                        <col style={{ width: '150px' }} />
                        <col style={{ width: '250px' }} />
                        <col style={{ width: '200px' }} />
                        <col style={{ width: '250px' }} />
                    </colgroup>
                    <TableHeader className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur shadow-sm rounded-xl">
                        <TableRow className="border-none hover:bg-transparent">
                            <TableHead className="w-[350px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 rounded-l-xl pl-6 border-y border-l border-transparent">Page Info</TableHead>
                            <TableHead className="w-[150px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 border-y border-transparent">Type</TableHead>
                            <TableHead className="w-[250px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 border-y border-transparent">Status</TableHead>
                            <TableHead className="w-[200px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 border-y border-transparent">Statistic</TableHead>
                            <TableHead className="w-[250px] text-right text-xs font-bold text-gray-500 uppercase tracking-wider h-12 rounded-r-xl pr-4 border-y border-r border-transparent">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <TableRow key={`skeleton-${i}`} className="bg-white border-none shadow-sm rounded-xl">
                                    <TableCell className="border-y border-l border-gray-200 rounded-l-xl pl-6 py-4">
                                        <div className="h-5 w-3/4 bg-gray-200 animate-pulse rounded mb-2"></div>
                                        <div className="h-3 w-32 bg-gray-100 animate-pulse rounded"></div>
                                    </TableCell>
                                    <TableCell className="border-y border-gray-200 py-4">
                                        <div className="h-5 w-20 bg-gray-200 animate-pulse rounded-full"></div>
                                    </TableCell>
                                    <TableCell className="border-y border-gray-200 py-4">
                                        <div className="h-5 w-20 bg-gray-200 animate-pulse rounded-full mb-2"></div>
                                        <div className="h-3 w-24 bg-gray-100 animate-pulse rounded mb-1"></div>
                                        <div className="h-3 w-24 bg-gray-100 animate-pulse rounded"></div>
                                    </TableCell>
                                    <TableCell className="border-y border-gray-200 py-4">
                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <div className="h-4 w-12 bg-gray-200 animate-pulse rounded mb-1"></div>
                                                <div className="h-3 w-20 bg-gray-100 animate-pulse rounded"></div>
                                            </div>
                                            <div>
                                                <div className="h-4 w-12 bg-gray-200 animate-pulse rounded mb-1"></div>
                                                <div className="h-3 w-16 bg-gray-100 animate-pulse rounded"></div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right border-y border-r border-gray-200 rounded-r-xl pr-4 py-4">
                                        <div className="flex justify-end gap-2">
                                            <div className="h-8 w-8 bg-gray-200 animate-pulse rounded"></div>
                                            <div className="h-8 w-8 bg-gray-200 animate-pulse rounded"></div>
                                            <div className="h-8 w-24 bg-blue-200 animate-pulse rounded"></div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : filteredPages.length === 0 ? (
                            <TableRow className="bg-white border-none shadow-sm rounded-xl">
                                <TableCell colSpan={5} className="h-48 text-center border border-gray-200 rounded-xl">
                                    <div className="p-8 text-center text-gray-500">
                                        No pages found in this category.
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredPages.map((page) => (
                                <TableRow key={page.id} className="bg-white hover:bg-gray-50/80 transition-shadow shadow-sm hover:shadow border-none rounded-xl group align-top [&>td]:align-top">
                                    <TableCell className="border-y border-l border-gray-200 rounded-l-xl pl-6 py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-semibold text-gray-900">{page.title}</span>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono">
                                                <span>ID: {page.id}</span>
                                            </div>
                                            {page.submission_id && page.owner_name && (
                                                <div className="text-xs text-gray-500 font-medium mt-1">
                                                    {page.owner_name}
                                                    {page.form_submissions?.university ? ` - ${page.form_submissions.university}` : ''}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="border-y border-gray-200">
                                        <div className="flex flex-col text-sm">
                                            {page.is_extra_ad ? (
                                                <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full w-fit text-[11px] border border-amber-100">Extra Ad</span>
                                            ) : !page.submission_id ? (
                                                <span className="font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full w-fit text-[11px] border border-purple-100">Announcement</span>
                                            ) : (
                                                <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full w-fit text-[11px] border border-blue-100">Survey Ad</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="border-y border-gray-200">
                                        <div className="flex flex-col gap-1.5 text-xs">
                                            {(() => {
                                                const now = new Date();
                                                const startDate = page.publish_start_date ? new Date(page.publish_start_date) : null;
                                                const endDate = page.publish_end_date ? new Date(page.publish_end_date) : null;

                                                if (!page.is_published) {
                                                    return <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full w-fit">Drafted</span>;
                                                }
                                                if (endDate && endDate < now) {
                                                    return <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full w-fit">Completed</span>;
                                                }
                                                if (startDate && startDate > now) {
                                                    return <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full w-fit">Scheduled</span>;
                                                }
                                                return <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded-full w-fit">Live</span>;
                                            })()}

                                            {page.submission_id && (
                                                <div className="flex flex-col mt-1 gap-1">
                                                    {page.publish_start_date ? (
                                                        <span className="text-gray-500 text-[11px]">
                                                            Start: {new Date(page.publish_start_date).toLocaleDateString()}, {new Date(page.publish_start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    ) : null}
                                                    {page.publish_end_date ? (
                                                        <span className="text-gray-500 text-[11px]">
                                                            End: {new Date(page.publish_end_date).toLocaleDateString()}, {new Date(page.publish_end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            )}

                                            {/* Banner Update Warning */}
                                            {page.requires_banner_update && (
                                                <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md">
                                                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                                    <span className="text-[10px] font-semibold text-amber-700">Banner perlu diupdate</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="border-y border-gray-200">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex flex-col">
                                                {page.submission_id ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-gray-900">
                                                            {page.page_respondents?.[0]?.count || 0}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-bold text-gray-400">-</span>
                                                )}
                                                <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Respondents</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-900">{page.views_count || 0}</span>
                                                <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Views</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right border-y border-r border-gray-200 rounded-r-xl pr-4">
                                        <div className="flex justify-end gap-1.5 items-center pt-0.5">
                                            {page.submission_id && (
                                                <>
                                                    {(() => {
                                                        const s = page.form_submissions;
                                                        const hasRewards = !!s?.prize_per_winner && s.prize_per_winner > 0;
                                                        const expectedWinners = hasRewards ? (s?.winner_count || 0) : 0;
                                                        const currentWinners = page.current_winners_count || 0;

                                                        // Provide visual cue if it needs winners
                                                        const needsWinners = expectedWinners > 0 && currentWinners < expectedWinners;
                                                        const isCompleted = expectedWinners > 0 && !needsWinners && !page.has_pending_proofs;

                                                        return (
                                                            <>
                                                                {isCompleted && !needsWinners && (
                                                                    <div title="Semua file bukti telah dibersihkan" className="flex items-center justify-center bg-green-50 text-green-600 rounded-full h-6 w-6 border border-green-200/60 shadow-sm shrink-0">
                                                                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                                    </div>
                                                                )}
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => setActiveSubmissionPage(page)}
                                                                    title={needsWinners ? "Select Winners" : "View Submissions & Winners"}
                                                                    className={`h-8 px-4 text-white shadow-sm transition-all duration-300 flex items-center bg-blue-600 hover:bg-blue-700 ${
                                                                        needsWinners ? "relative pr-7" : ""
                                                                    }`}
                                                                >
                                                                    Submissions
                                                                    {needsWinners && (
                                                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-2 w-2">
                                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                                                                        </span>
                                                                    )}
                                                                </Button>
                                                            </>
                                                        );
                                                    })()}
                                                </>
                                            )}

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEditPage(page)}
                                                title="Edit Page"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 border-gray-200 shrink-0"
                                            >
                                                <PenLine className="w-4 h-4" />
                                            </Button>

                                            {page.is_published && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => window.open(`/pages/${page.slug}`, '_blank')}
                                                    title="View Live Page"
                                                    className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 border-gray-200 shrink-0"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Button>
                                            )}

                                            {/* Clear Banner Flag Button */}
                                            {page.requires_banner_update && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={async () => {
                                                        try {
                                                            const { error } = await supabase
                                                                .from('survey_pages')
                                                                .update({ requires_banner_update: false })
                                                                .eq('id', page.id);
                                                            if (error) throw error;
                                                            toast.success('Banner flag cleared');
                                                            fetchPages();
                                                        } catch (err) {
                                                            toast.error('Failed to clear banner flag');
                                                        }
                                                    }}
                                                    title="Banner sudah diupdate, clear flag"
                                                    className="h-8 px-2.5 text-amber-600 hover:text-amber-700 border-amber-200 hover:bg-amber-50 shrink-0 text-[10px] font-semibold"
                                                >
                                                    <Check className="w-3.5 h-3.5 mr-1" />
                                                    Banner OK
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            )}

            {
                isPageBuilderOpen && (
                    <PageBuilderModal
                        isOpen={isPageBuilderOpen}
                        onClose={handleCloseBuilder}
                        onSuccess={handleCloseBuilder}
                        initialData={selectedPage || undefined}
                        submissionId={selectedPage?.submission_id}
                    />
                )
            }


            {/* Period Winners Modal */}
            <Dialog open={showPeriodWinners} onOpenChange={setShowPeriodWinners}>
                <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-amber-500" />
                                <span>Daftar Pemenang — {formatMonth(selectedMonth)}</span>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-semibold border-green-200 text-green-700 hover:bg-green-50 bg-white shadow-sm"
                                onClick={exportPeriodWinnersCSV}
                                disabled={periodWinners.length === 0}
                            >
                                <Download className="w-3.5 h-3.5 mr-1.5" />
                                Export CSV
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto space-y-5 pr-1">
                        {periodWinners.length === 0 ? (
                            <div className="text-center text-gray-400 py-12">Tidak ada pemenang ditemukan.</div>
                        ) : (
                            periodWinners.map((group) => (
                                <div key={group.pageId} className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm font-semibold text-gray-900">{group.pageTitle}</span>
                                        </div>
                                        <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">{group.winners.length} pemenang</span>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="text-xs hover:bg-transparent">
                                                <TableHead className="text-xs font-semibold">Jakpat ID</TableHead>
                                                <TableHead className="text-xs font-semibold">User ID</TableHead>
                                                <TableHead className="text-xs font-semibold">Email</TableHead>
                                                <TableHead className="text-xs font-semibold">Nama</TableHead>
                                                <TableHead className="text-xs font-semibold">E-Wallet</TableHead>
                                                <TableHead className="text-xs font-semibold">NIK/NPWP</TableHead>
                                                <TableHead className="text-xs font-semibold">Lokasi</TableHead>
                                                <TableHead className="text-xs font-semibold text-right">Nominal</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {group.winners.map((w, i) => (
                                                <TableRow key={`${group.pageId}-${w.jakpat_id}-${i}`} className="hover:bg-gray-50/50">
                                                    <TableCell className="text-xs font-mono">{w.jakpat_id}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-600">{w.user_id ?? '—'}</TableCell>
                                                    <TableCell className="text-xs text-gray-600 max-w-[160px] truncate" title={w.email || ''}>{w.email || '—'}</TableCell>
                                                    <TableCell className="text-sm font-medium text-gray-900 whitespace-nowrap">{w.respondent_name || '—'}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-700">{w.ewallet_provider ? `${w.ewallet_provider} — ${w.e_wallet_number || ''}` : '—'}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-600">{w.ktp_number || '—'}</TableCell>
                                                    <TableCell className="text-xs text-gray-600 whitespace-nowrap">{[w.city, w.province].filter(Boolean).join(', ') || '—'}</TableCell>
                                                    <TableCell className="text-sm font-semibold text-gray-700 text-right whitespace-nowrap">Rp {(w.reward_amount || 0).toLocaleString('id-ID')}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    );
}
