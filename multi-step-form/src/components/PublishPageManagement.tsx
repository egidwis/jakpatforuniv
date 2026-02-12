import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, Search, ExternalLink, RefreshCw, PenLine } from 'lucide-react';
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
                        full_name
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Publish Page Management</h1>
                    <p className="text-muted-foreground">Manage survey pages, schedule, and view performance.</p>
                </div>
                <Button onClick={fetchPages} variant="outline" size="sm" disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="flex items-center gap-4 bg-white p-2 rounded-lg border shadow-sm max-w-md">
                <Search className="w-4 h-4 text-gray-400 ml-2" />
                <Input
                    placeholder="Search by title, researcher..."
                    className="border-0 focus-visible:ring-0 h-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Custom Tabs */}
            <div className="w-full">
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                    {['draft', 'published', 'finish'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`
                                flex-1 flex items-center justify-center py-2.5 text-sm font-medium rounded-md transition-all
                                ${activeTab === tab
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                            `}
                        >
                            {tab === 'draft' && 'Draft / Scheduled'}
                            {tab === 'published' && 'Published (On-going)'}
                            {tab === 'finish' && 'Finished'}
                        </button>
                    ))}
                </div>

                <div className="mt-6">
                    <Card>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                </div>
                            ) : filteredPages.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                    No pages found in this category.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Page Title & Slug</TableHead>
                                            <TableHead>Researcher</TableHead>
                                            <TableHead>Schedule</TableHead>
                                            <TableHead>Stats</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredPages.map((page) => (
                                            <TableRow key={page.id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-gray-900">{page.title}</span>
                                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                                            <span className="font-mono bg-gray-100 px-1 rounded">/{page.slug}</span>
                                                            {page.form_submissions?.title && (
                                                                <span className="truncate max-w-[150px]" title={page.form_submissions.title}>
                                                                    • {page.form_submissions.title}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col text-sm">
                                                        <span className="font-medium">{page.form_submissions?.full_name || 'Unknown'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1 text-xs">
                                                        {page.publish_start_date ? (
                                                            <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded w-fit">
                                                                Start: {new Date(page.publish_start_date).toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 italic">No start date</span>
                                                        )}
                                                        {page.publish_end_date ? (
                                                            <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded w-fit">
                                                                End: {new Date(page.publish_end_date).toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 italic">No end date</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-4">
                                                        <div className="flex flex-col items-center">
                                                            <Button
                                                                variant="ghost"
                                                                className="h-auto p-0 hover:bg-transparent"
                                                                onClick={() => setViewRespondentsPage(page)}
                                                            >
                                                                <span className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer decoration-blue-200 decoration-2 underline-offset-4 hover:underline">
                                                                    {page.page_respondents?.[0]?.count || 0}
                                                                </span>
                                                            </Button>
                                                            <span className="text-[10px] text-gray-500 uppercase">Respondents</span>
                                                        </div>
                                                        <div className="h-8 w-px bg-gray-200" />
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-lg font-bold text-gray-900">
                                                                {page.views_count || 0}
                                                            </span>
                                                            <span className="text-[10px] text-gray-500 uppercase">Views</span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => window.open(`/pages/${page.slug}`, '_blank')}
                                                            title="View Live Page"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            onClick={() => handleEditPage(page)}
                                                            className="bg-blue-600 hover:bg-blue-700"
                                                        >
                                                            <PenLine className="w-4 h-4 mr-1" /> Edit
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {isPageBuilderOpen && selectedPage && (
                <PageBuilderModal
                    isOpen={isPageBuilderOpen}
                    onClose={handleCloseBuilder}
                    onSuccess={handleCloseBuilder}
                    initialData={selectedPage}
                    submissionId={selectedPage.submission_id}
                />
            )}

            {viewRespondentsPage && (
                <RespondentsListModal
                    isOpen={!!viewRespondentsPage}
                    onClose={() => setViewRespondentsPage(null)}
                    pageId={viewRespondentsPage.id}
                    pageTitle={viewRespondentsPage.title}
                />
            )}
        </div>
    );
}
