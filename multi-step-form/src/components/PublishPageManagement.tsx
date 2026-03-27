import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Search, ExternalLink, RefreshCw, PenLine, Plus } from 'lucide-react';
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { RespondentsListModal } from './PublishPage/RespondentsListModal';
import { toast } from 'sonner';

interface PageData {
    id: string;
    slug: string;
    title: string;
    is_published: boolean;
    views_count: number;
    publish_start_date: string | null;
    publish_end_date: string | null;
    submission_id: string;
    created_at: string;
    form_submissions?: {
        title: string;
        full_name: string;
        university?: string;
    };
    page_respondents?: { count: number }[];
}

export function PublishPageManagement() {
    const [pages, setPages] = useState<PageData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('published');
    const [searchQuery, setSearchQuery] = useState('');

    // Page Builder State
    const [isPageBuilderOpen, setIsPageBuilderOpen] = useState(false);
    const [selectedPage, setSelectedPage] = useState<PageData | null>(null);

    // Respondents Modal State
    const [viewRespondentsPage, setViewRespondentsPage] = useState<PageData | null>(null);

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
                        university
                    ),
                    page_respondents (
                        count
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPages(data || []);
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

    const filterPages = (tab: string) => {
        const now = new Date();
        return pages.filter(page => {
            // Search Filter
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch =
                page.title?.toLowerCase().includes(searchLower) ||
                page.slug?.toLowerCase().includes(searchLower) ||
                page.form_submissions?.full_name?.toLowerCase().includes(searchLower);

            if (!matchesSearch) return false;

            // Tab Filter
            const startDate = page.publish_start_date ? new Date(page.publish_start_date) : null;
            const endDate = page.publish_end_date ? new Date(page.publish_end_date) : null;

            if (tab === 'draft') {
                // Not published OR published but start date is in future
                return !page.is_published || (startDate && startDate > now);
            }
            if (tab === 'published') {
                // Published AND (started OR no start) AND (not ended OR no end)
                if (!page.is_published) return false; // Must be marked published
                if (startDate && startDate > now) return false; // Future start is Draft
                if (endDate && endDate < now) return false; // Past end is Finish
                return true;
            }
            if (tab === 'finish') {
                // End date is passed
                return endDate && endDate < now;
            }
            return false;
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

    const filteredPages = filterPages(activeTab);

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-6">
            {/* Unified Toolbar Container */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                {/* Top Row: Search and Actions */}
                <div className="flex flex-row items-center gap-4 w-full">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search by title, researcher..."
                            className="pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm w-full shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Action Button */}
                    <div className="flex items-center shrink-0">
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
                    </div>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                {/* Bottom Row: Filters & Refresh */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Tabs */}
                    <div className="flex items-center gap-2 p-1 bg-gray-50/80 backdrop-blur-sm rounded-lg border border-gray-100/50 w-max max-w-full overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                        {[
                            { id: 'draft', label: 'Draft / Scheduled', count: pages.filter(p => !p.is_published || (p.publish_start_date && new Date(p.publish_start_date) > new Date())).length, color: 'bg-gray-100 text-gray-700' },
                            { id: 'published', label: 'Published (On-going)', count: pages.filter(p => p.is_published && (!p.publish_start_date || new Date(p.publish_start_date) <= new Date()) && (!p.publish_end_date || new Date(p.publish_end_date) > new Date())).length, color: 'bg-blue-50 text-blue-700' },
                            { id: 'finish', label: 'Finished', count: pages.filter(p => p.publish_end_date && new Date(p.publish_end_date) < new Date()).length, color: 'bg-emerald-50 text-emerald-700' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0
                                    ${activeTab === tab.id
                                        ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}
                                `}
                            >
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Refresh */}
                    <div className="flex items-center ml-auto shrink-0">
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
            </div>

            {/* Main Table Card */}
            <div className="h-[calc(100vh-210px)] min-h-[400px]">
                <div className="overflow-auto h-full w-full pb-4 pr-2">
                    <Table className="border-separate border-spacing-y-3">
                        <TableHeader className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur shadow-sm rounded-xl">
                            <TableRow className="border-none hover:bg-transparent">
                                <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider h-12 rounded-l-xl pl-4">Page Info</TableHead>
                                <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Type</TableHead>
                                <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Status</TableHead>
                                <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Statistic</TableHead>
                                <TableHead className="text-right text-xs font-bold text-gray-500 uppercase tracking-wider h-12 rounded-r-xl pr-4">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`} className="bg-white border-none shadow-sm rounded-xl">
                                        <TableCell className="border-y border-l border-gray-200 rounded-l-xl pl-4 py-4">
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
                                        <TableCell className="border-y border-l border-gray-200 rounded-l-xl pl-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="font-semibold text-gray-900">{page.title}</span>
                                                    <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono">
                                                        <span>ID: {page.id}</span>
                                                    </div>
                                                    {page.submission_id && page.form_submissions?.full_name && (
                                                        <div className="text-xs text-gray-500 font-medium mt-1">
                                                            {page.form_submissions.full_name}
                                                            {page.form_submissions.university ? ` - ${page.form_submissions.university}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="border-y border-gray-200">
                                                <div className="flex flex-col text-sm">
                                                    {!page.submission_id ? (
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
                                                </div>
                                            </TableCell>
                                            <TableCell className="border-y border-gray-200">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex flex-col">
                                                        {page.submission_id ? (
                                                            <button
                                                                onClick={() => setViewRespondentsPage(page)}
                                                                className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer hover:underline text-left"
                                                            >
                                                                {page.page_respondents?.[0]?.count || 0}
                                                            </button>
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
                                                <div className="flex justify-end gap-1.5 items-start pt-0.5">
                                                    {page.is_published && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => window.open(`/pages/${page.slug}`, '_blank')}
                                                            title="View Live Page"
                                                            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                        </Button>
                                                    )}

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleEditPage(page)}
                                                        title="Edit Page"
                                                        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 border-gray-200"
                                                    >
                                                        <PenLine className="w-4 h-4" />
                                                    </Button>

                                                    {page.submission_id && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => setViewRespondentsPage(page)}
                                                            title="View Submission"
                                                            className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white"
                                                        >
                                                            Submissions
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
            </div>

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

            {
                viewRespondentsPage && (
                    <RespondentsListModal
                        isOpen={!!viewRespondentsPage}
                        onClose={() => setViewRespondentsPage(null)}
                        pageId={viewRespondentsPage.id}
                        pageTitle={viewRespondentsPage.title}
                    />
                )
            }
        </div >
    );
}
