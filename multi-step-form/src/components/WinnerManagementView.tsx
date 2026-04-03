import { useState, useEffect, useMemo } from 'react';
import { supabase, getCdnUrl } from '@/utils/supabase';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Loader2,
    Trophy,
    Shuffle,
    Check,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    MapPin,
    Clock,
    ImageIcon,
    User,
    Search,
    Filter,
    ArrowLeft,
    ChevronRight,
    Download,
    Trash2,
    Plus,
} from 'lucide-react';
import { toast } from 'sonner';

interface MergedRespondent {
    respondent_id: string;
    jakpat_id: string;
    proof_url: string | null;
    ewallet_provider: string | null;
    e_wallet_number: string | null;
    custom_answers: any;
    submitted_at: string;
    // Masterdata
    user_id: number | null;
    ktp_name: string | null;
    display_name: string | null;
    email: string | null;
    city: string | null;
    province: string | null;
    ktp_number: string | null;
    phone_number_gift: string | null;
    last_redeem_at: string | null;
    // Computed
    is_eligible: boolean;
    ineligible_reasons: string[];
}

interface ExistingWinner {
    id: string;
    jakpat_id: string;
    respondent_name: string | null;
    reward_amount: number | null;
    reward_status: string;
    ewallet_provider: string | null;
    e_wallet_number: string | null;
    selected_at: string;
    notes: string | null;
    // Masterdata (enriched)
    user_id: number | null;
    email: string | null;
    ktp_number: string | null;
    city: string | null;
    province: string | null;
}

interface WinnerManagementViewProps {
    pageId: string;
    pageTitle: string;
    rewardAmount: number;
    rewardCount: number;
    onBack: () => void;
}

export function WinnerManagementView({
    pageId,
    pageTitle,
    rewardAmount,
    rewardCount,
    onBack,
}: WinnerManagementViewProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [respondents, setRespondents] = useState<MergedRespondent[]>([]);
    const [existingWinners, setExistingWinners] = useState<ExistingWinner[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showNotEligible, setShowNotEligible] = useState(false);
    const [criteria, setCriteria] = useState<string>('');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [previewProof, setPreviewProof] = useState<string | null>(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterWallet, setFilterWallet] = useState('all');
    const [filterProvince, setFilterProvince] = useState('all');

    // Fetch all data
    useEffect(() => {
        if (pageId) {
            fetchData();
        }
    }, [pageId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch respondents
            const { data: prData, error: prError } = await supabase
                .from('page_respondents')
                .select('*')
                .eq('page_id', pageId)
                .order('created_at', { ascending: true });

            if (prError) throw prError;

            // 2. Fetch masterdata for all jakpat_ids
            const jakpatIds = (prData || []).map((r: any) => r.jakpat_id);
            let masterdataMap: Record<string, any> = {};

            // Helper to sanitize Jakpat IDs (mimics spreadsheet: extract after /s/ + remove spaces + lowercase)
            const sanitizeJakpatId = (rawId: string | null): string => {
                if (!rawId) return '';
                let id = String(rawId);
                const match = id.match(/\/s\/(.+)/);
                if (match && match[1]) {
                    id = match[1];
                }
                return id.replace(/\s+/g, '').toLowerCase();
            };

            if (jakpatIds.length > 0) {
                // Deduplicate sanitized IDs for efficient querying
                const uniqueSanitized = new Set<string>();
                jakpatIds.forEach((rawId: string) => {
                    if (!rawId) return;
                    uniqueSanitized.add(sanitizeJakpatId(rawId));
                });
                const sanitizedList = Array.from(uniqueSanitized).filter(Boolean);

                // Batch query in chunks of 50 to avoid PostgREST URL length limits
                const BATCH_SIZE = 50;
                const allMdData: any[] = [];
                for (let i = 0; i < sanitizedList.length; i += BATCH_SIZE) {
                    const batch = sanitizedList.slice(i, i + BATCH_SIZE);
                    const { data: mdBatch } = await supabase
                        .from('respondents-masterdata')
                        .select('*')
                        .in('jakpat_id', batch);
                    if (mdBatch) allMdData.push(...mdBatch);
                }

                // Also try fetching by original (unsanitized) IDs in case DB has exact matches
                const uniqueOriginals = [...new Set(jakpatIds.filter(Boolean).map((id: string) => id.trim()))];
                for (let i = 0; i < uniqueOriginals.length; i += BATCH_SIZE) {
                    const batch = uniqueOriginals.slice(i, i + BATCH_SIZE);
                    const { data: mdBatch } = await supabase
                        .from('respondents-masterdata')
                        .select('*')
                        .in('jakpat_id', batch);
                    if (mdBatch) allMdData.push(...mdBatch);
                }

                // Build map using sanitized keys (deduplicates naturally)
                allMdData.forEach((m: any) => {
                    const key = sanitizeJakpatId(m.jakpat_id);
                    if (key) {
                        masterdataMap[key] = m;
                    }
                });
            }

            // 3. Fetch recent winners (last 6 months) across ALL surveys
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const { data: recentWinners } = await supabase
                .from('survey_winners')
                .select('jakpat_id, selected_at, page_id')
                .gte('selected_at', sixMonthsAgo.toISOString());

            const recentWinnerIds = new Set(
                (recentWinners || [])
                    .filter((w: any) => w.page_id !== pageId) // Exclude current survey
                    .map((w: any) => w.jakpat_id)
            );

            // 4. Fetch existing winners for THIS survey
            const { data: existingData } = await supabase
                .from('survey_winners')
                .select('*')
                .eq('page_id', pageId)
                .order('selected_at', { ascending: true });

            // Enrich existing winners with masterdata
            const enrichedWinners: ExistingWinner[] = (existingData || []).map((w: any) => {
                const lookupKey = sanitizeJakpatId(w.jakpat_id);
                const md = masterdataMap[lookupKey] || {};
                return {
                    ...w,
                    user_id: md.user_id || null,
                    email: md.email || null,
                    ktp_number: md.ktp_number || null,
                    city: md.city || null,
                    province: md.province || null,
                };
            });
            setExistingWinners(enrichedWinners);

            // 5. Fetch criteria from form_submissions
            const { data: pageData } = await supabase
                .from('survey_pages')
                .select('submission_id, form_submissions(criteria_responden)')
                .eq('id', pageId)
                .single();

            if (pageData?.form_submissions) {
                setCriteria((pageData.form_submissions as any).criteria_responden || '');
            }

            // 6. Merge and categorize
            const merged: MergedRespondent[] = (prData || []).map((pr: any) => {
                const lookupKey = sanitizeJakpatId(pr.jakpat_id);
                const md = masterdataMap[lookupKey] || {};
                const reasons: string[] = [];

                // Check eligibility
                const hasProof = !!pr.proof_url;
                if (!hasProof) reasons.push('Tidak upload bukti (proof)');

                const isRecentWinner = recentWinnerIds.has(pr.jakpat_id);
                if (isRecentWinner) reasons.push('Sudah menang dalam 6 bulan terakhir');

                // Check last_redeem_at from masterdata
                if (md.last_redeem_at) {
                    try {
                        const redeemDate = new Date(md.last_redeem_at);
                        if (!isNaN(redeemDate.getTime()) && redeemDate > sixMonthsAgo) {
                            if (!isRecentWinner) { // avoid duplicate reason
                                reasons.push(`Terakhir redeem: ${md.last_redeem_at}`);
                            }
                        }
                    } catch {
                        // ignore parse error
                    }
                }

                return {
                    respondent_id: pr.id,
                    jakpat_id: pr.jakpat_id,
                    proof_url: pr.proof_url,
                    ewallet_provider: pr.ewallet_provider,
                    e_wallet_number: pr.e_wallet_number,
                    custom_answers: pr.custom_answers,
                    submitted_at: pr.created_at,
                    user_id: md.user_id || null,
                    ktp_name: md.ktp_name || null,
                    display_name: md.display_name || null,
                    email: md.email || null,
                    city: md.city || null,
                    province: md.province || null,
                    ktp_number: md.ktp_number || null,
                    phone_number_gift: md.phone_number_gift || null,
                    last_redeem_at: md.last_redeem_at || null,
                    is_eligible: reasons.length === 0,
                    ineligible_reasons: reasons,
                };
            });

            setRespondents(merged);
        } catch (error: any) {
            console.error('Error fetching data:', error);
            toast.error('Gagal memuat data responden');
        } finally {
            setLoading(false);
        }
    };

    // Split eligible / not eligible
    const eligible = useMemo(() => {
        const existingWinnerJakpatIds = new Set(existingWinners.map(w => w.jakpat_id));
        const filtered = respondents.filter(r => r.is_eligible && !existingWinnerJakpatIds.has(r.jakpat_id));
        
        return filtered.sort((a, b) => {
            const aHasMasterdata = !!a.user_id ? 1 : 0;
            const bHasMasterdata = !!b.user_id ? 1 : 0;
            if (aHasMasterdata !== bHasMasterdata) {
                return bHasMasterdata - aHasMasterdata; // 1 (has data) comes before 0 (no data)
            }
            return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
        });
    }, [respondents, existingWinners]);
    
    const notEligible = useMemo(() => respondents.filter(r => !r.is_eligible), [respondents]);

    // Get unique wallet providers & provinces for filter dropdowns
    const walletProviders = useMemo(() => {
        const providers = new Set(eligible.map(r => r.ewallet_provider).filter(Boolean) as string[]);
        return Array.from(providers).sort();
    }, [eligible]);

    const provinces = useMemo(() => {
        const provs = new Set(eligible.map(r => r.province).filter(Boolean) as string[]);
        return Array.from(provs).sort();
    }, [eligible]);

    // Filtered eligible list
    const filteredEligible = useMemo(() => {
        return eligible.filter(r => {
            // Search by name or jakpat_id
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = (r.ktp_name || '').toLowerCase().includes(q) || (r.display_name || '').toLowerCase().includes(q);
                const matchId = r.jakpat_id.toLowerCase().includes(q);
                if (!matchName && !matchId) return false;
            }
            // Filter by wallet provider
            if (filterWallet !== 'all' && r.ewallet_provider !== filterWallet) return false;
            // Filter by province
            if (filterProvince !== 'all' && r.province !== filterProvince) return false;
            return true;
        });
    }, [eligible, searchQuery, filterWallet, filterProvince]);

    // Already selected as winners for this survey?
    const hasExistingWinners = existingWinners.length > 0;

    // Toggle checkbox
    const toggleSelect = (jakpatId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(jakpatId)) {
                next.delete(jakpatId);
            } else {
                next.add(jakpatId);
            }
            return next;
        });
    };

    // Random pick (from filtered list)
    const handleRandomPick = () => {
        const pool = filteredEligible;
        const count = Math.min(rewardCount, pool.length);
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, count);
        setSelectedIds(new Set(picked.map(p => p.jakpat_id)));
        toast.success(`${count} responden dipilih secara random`);
    };

    // Confirm winners
    const handleConfirmWinners = async () => {
        if (selectedIds.size === 0) {
            toast.error('Pilih minimal 1 pemenang');
            return;
        }

        setSaving(true);
        try {
            const winners = respondents
                .filter(r => selectedIds.has(r.jakpat_id))
                .map(r => ({
                    page_id: pageId,
                    jakpat_id: r.jakpat_id,
                    respondent_name: r.ktp_name || r.display_name || r.jakpat_id,
                    reward_amount: rewardAmount,
                    reward_status: 'selected',
                    ewallet_provider: r.ewallet_provider,
                    e_wallet_number: r.e_wallet_number,
                    selected_by: 'product@jakpat.net',
                }));

            const { error } = await supabase
                .from('survey_winners')
                .insert(winners);

            if (error) throw error;

            toast.success(`${winners.length} pemenang berhasil disimpan! 🎉`);
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            fetchData(); // Refresh to show winner list view
        } catch (error: any) {
            console.error('Error saving winners:', error);
            if (error.code === '23505') {
                toast.error('Beberapa responden sudah terpilih sebagai pemenang');
            } else {
                toast.error('Gagal menyimpan pemenang');
            }
        } finally {
            setSaving(false);
        }
    };

    // Export winners to CSV for finance team
    const exportToCSV = () => {
        if (existingWinners.length === 0) return;

        const headers = ['Jakpat ID', 'User ID', 'Email', 'Nama', 'No. E-Wallet (hanya nomor)', 'NIK/NPWP', 'Kota/Kab Provinsi', 'Judul Survey', 'Kirim Ke', 'NOMINAL'];

        const rows = existingWinners.map(w => [
            w.jakpat_id,
            w.user_id ?? '',
            w.email ?? '',
            w.respondent_name ?? '',
            w.e_wallet_number ?? '',
            w.ktp_number ?? '',
            [w.city, w.province].filter(Boolean).join(', '),
            pageTitle,
            w.ewallet_provider ?? '',
            w.reward_amount || rewardAmount || 0,
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => {
                const str = String(cell);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pemenang_${pageTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('File CSV berhasil di-download');
    };

    // Delete individual winner
    const handleDeleteWinner = async (winnerId: string, respondentName: string) => {
        if (!confirm(`Hapus ${respondentName || 'pemenang ini'} dari daftar pemenang?`)) return;
        
        try {
            const { error } = await supabase
                .from('survey_winners')
                .delete()
                .eq('id', winnerId);

            if (error) throw error;
            
            toast.success('Pemenang berhasil dihapus');
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error('Gagal menghapus pemenang');
        }
    };



    return (
        <div className="flex flex-col h-full w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Breadcrumb Header */}
            <div className="flex items-center px-6 py-4 border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-10 w-full shrink-0">
                <button 
                    onClick={onBack} 
                    className="mr-4 p-1.5 rounded-md hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-900 border border-transparent hover:border-gray-300 bg-white shadow-sm"
                    title="Kembali ke Daftar Halaman"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <nav className="flex items-center text-sm font-medium text-gray-500 overflow-hidden w-full">
                    <span 
                        className="hover:text-blue-600 cursor-pointer hover:underline"
                        onClick={onBack}
                    >
                        Pages
                    </span>
                    <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                    <span className="truncate max-w-[200px] md:max-w-md" title={pageTitle}>
                        {pageTitle}
                    </span>
                    <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                    <span className="text-gray-900 font-semibold shrink-0">
                        {hasExistingWinners && !isSelectionMode ? 'Daftar Pemenang Terpilih' : 'Pemilihan Pemenang'}
                    </span>
                </nav>
            </div>

            {/* Page Content Header */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 shrink-0 bg-white">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        <h2 className="text-lg font-semibold text-gray-900">
                            {hasExistingWinners && !isSelectionMode ? 'Manajemen Pemenang' : 'Pemilihan Pemenang'}
                        </h2>
                    </div>
                    <span className="text-gray-300">|</span>
                    <p className="text-sm text-gray-600 font-medium">
                        Reward: Rp {(rewardAmount || 0).toLocaleString('id-ID')} × {rewardCount}
                    </p>
                </div>
                {criteria && (
                    <div className="bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800 max-w-lg shadow-sm">
                        <span className="font-semibold block mb-1">Criteria Responden:</span> 
                        {criteria}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto bg-gray-50/30">
                <div className="p-6 h-full flex flex-col">
                    {loading ? (
                        <div className="flex flex-1 items-center justify-center min-h-[300px]">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                <span className="text-sm text-gray-500">Memuat data responden...</span>
                            </div>
                        </div>
                    ) : hasExistingWinners && !isSelectionMode ? (
                        /* ===== WINNER LIST VIEW (already selected) ===== */
                        <div className="flex-1 space-y-4">
                            {/* Summary */}
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2 text-green-800 text-sm">
                                    <div className="h-6 w-6 rounded-full bg-green-200 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-green-700" />
                                    </div>
                                    <span><strong>{existingWinners.length}</strong> pemenang sudah dipilih</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs border-green-300 text-green-800 hover:bg-green-100 bg-white font-semibold"
                                        onClick={exportToCSV}
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5" />
                                        Export CSV
                                    </Button>
                                    {existingWinners.length < rewardCount && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50 bg-white font-semibold"
                                            onClick={() => setIsSelectionMode(true)}
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                                            Pilih Pemenang
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Winner Table - Finance Format */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-gray-50/80">
                                            <TableRow>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">Jakpat ID</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">User ID</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">Email</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">Nama</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">No. E-Wallet</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">NIK/NPWP</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">Kota/Kab, Provinsi</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">Kirim Ke</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap text-right">Nominal</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap w-10"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {existingWinners.map(w => (
                                                <TableRow key={w.id} className="hover:bg-gray-50/50">
                                                    <TableCell>
                                                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded inline-block">{w.jakpat_id}</span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-600 font-mono">{w.user_id ?? '—'}</TableCell>
                                                    <TableCell className="text-xs text-gray-600 max-w-[180px] truncate" title={w.email || ''}>{w.email || '—'}</TableCell>
                                                    <TableCell className="text-sm font-medium text-gray-900 whitespace-nowrap">{w.respondent_name || '—'}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-700">{w.e_wallet_number || '—'}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-600">{w.ktp_number || '—'}</TableCell>
                                                    <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                                                        {w.city || w.province
                                                            ? [w.city, w.province].filter(Boolean).join(', ')
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {w.ewallet_provider ? (
                                                            <span className="font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] uppercase border border-blue-100">{w.ewallet_provider}</span>
                                                        ) : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-sm font-semibold text-gray-700 text-right whitespace-nowrap">
                                                        Rp {(w.reward_amount || rewardAmount || 0).toLocaleString('id-ID')}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteWinner(w.id, w.respondent_name || '')}
                                                            className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                                                            title="Hapus pemenang"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ===== SELECTION VIEW ===== */
                        <div className="flex-1 flex flex-col space-y-4">
                            {/* Main Content Area: Split Filters & Table */}
                            <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                {/* Table Toolbar */}
                                <div className="p-4 border-b border-gray-100 flex flex-col gap-3 bg-gray-50/50">
                                    {/* Mini Summary */}
                                    <div className="flex items-center gap-3 text-xs font-semibold">
                                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1.5 rounded-md shadow-sm text-gray-700">
                                            <User className="w-3.5 h-3.5 text-gray-400" />
                                            <span>Total: {respondents.length}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-md shadow-sm text-green-700">
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Eligible: {eligible.length}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-md shadow-sm text-blue-700">
                                            <Trophy className="w-3.5 h-3.5" />
                                            <span>Dipilih: {selectedIds.size} / {rewardCount}</span>
                                        </div>
                                    </div>

                                    {/* Filters */}
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap flex-1">
                                            <div className="relative min-w-[200px] flex-1 max-w-sm">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <Input
                                                    placeholder="Cari nama / Jakpat ID..."
                                                    className="pl-9 h-9 text-sm bg-white border-gray-200 focus:border-blue-500 shadow-sm"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                />
                                            </div>
                                        <select
                                            value={filterWallet}
                                            onChange={(e) => setFilterWallet(e.target.value)}
                                            className="h-9 text-sm border border-gray-200 rounded-md px-3 bg-white text-gray-700 cursor-pointer shadow-sm focus:border-blue-500 outline-none"
                                        >
                                            <option value="all">Semua E-Wallet</option>
                                            {walletProviders.map(p => (
                                                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={filterProvince}
                                            onChange={(e) => setFilterProvince(e.target.value)}
                                            className="h-9 text-sm border border-gray-200 rounded-md px-3 bg-white text-gray-700 cursor-pointer shadow-sm focus:border-blue-500 outline-none"
                                        >
                                            <option value="all">Semua Provinsi</option>
                                            {provinces.map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                        {(searchQuery || filterWallet !== 'all' || filterProvince !== 'all') && (
                                            <button
                                                onClick={() => { setSearchQuery(''); setFilterWallet('all'); setFilterProvince('all'); }}
                                                className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2">
                                            {(searchQuery || filterWallet !== 'all' || filterProvince !== 'all') && (
                                                <span className="text-xs text-gray-500 mr-2 flex items-center gap-1 font-medium bg-gray-100 px-2 py-1 rounded border border-gray-200">
                                                    <Filter className="w-3 h-3" />
                                                    Menampilkan {filteredEligible.length} dr {eligible.length}
                                                </span>
                                            )}
                                            {selectedIds.size > 0 && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-xs text-gray-600 bg-white border-gray-200 hover:bg-gray-50 font-semibold h-9"
                                                    onClick={() => setSelectedIds(new Set())}
                                                >
                                                    Clear Selection
                                                </Button>
                                            )}
                                            <Button
                                                onClick={handleRandomPick}
                                                size="sm"
                                                className="text-xs font-semibold h-9 bg-blue-600 hover:bg-blue-700 shadow-sm"
                                                disabled={filteredEligible.length === 0}
                                            >
                                                <Shuffle className="w-4 h-4 mr-1.5" />
                                                Random Pick {Math.min(rewardCount, filteredEligible.length)} Pemenang
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Eligible Table */}
                                <div className="flex-1 overflow-auto min-h-[300px]">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm border-b border-gray-200">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="w-12 text-center"></TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">Jakpat ID</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">User ID</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600"><User className="w-3.5 h-3.5 inline mr-1 text-gray-400" />Nama</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600"><MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />Lokasi</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">E-Wallet</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600 text-right"><ImageIcon className="w-3.5 h-3.5 inline mr-1 text-gray-400" />Proof</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredEligible.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="h-48 text-center text-gray-400">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <Filter className="w-8 h-8 text-gray-300 mb-1" />
                                                            <span className="font-medium text-gray-500">Tidak ada responden yang eligible / cocok dengan filter</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredEligible.map(r => (
                                                    <TableRow
                                                        key={r.respondent_id}
                                                        className={`cursor-pointer transition-colors border-b border-gray-100 ${selectedIds.has(r.jakpat_id) ? 'bg-blue-50/70 border-l-2 border-l-blue-500' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}`}
                                                        onClick={() => toggleSelect(r.jakpat_id)}
                                                    >
                                                        <TableCell className="text-center py-3">
                                                            <Checkbox
                                                                checked={selectedIds.has(r.jakpat_id)}
                                                                onCheckedChange={() => toggleSelect(r.jakpat_id)}
                                                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">{r.jakpat_id}</span>
                                                        </TableCell>
                                                        <TableCell className="text-xs text-gray-500 font-mono py-3">
                                                            {r.user_id || <span className="text-gray-300">—</span>}
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium py-3">
                                                            {r.ktp_name || r.display_name || <span className="text-gray-400 italic text-xs font-normal">Not in masterdata</span>}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-gray-600 py-3">
                                                            {r.city || r.province ? (
                                                                <span>{[r.city, r.province].filter(Boolean).join(', ')}</span>
                                                            ) : (
                                                                <span className="text-gray-300">—</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs py-3">
                                                            {r.e_wallet_number ? (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] capitalize border border-blue-100 w-fit">{r.ewallet_provider}</span>
                                                                    <span className="font-mono text-gray-600">{r.e_wallet_number}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300">—</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            {r.proof_url && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPreviewProof(getCdnUrl(r.proof_url!));
                                                                    }}
                                                                    title="Lihat Bukti"
                                                                >
                                                                    <ImageIcon className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            {/* Not Eligible Section (Collapsible) */}
                            {notEligible.length > 0 && (
                                <div className="border border-red-100 rounded-xl overflow-hidden bg-white shadow-sm">
                                    <button
                                        onClick={() => setShowNotEligible(!showNotEligible)}
                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-red-50/50 transition-colors text-sm text-gray-700 font-medium"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-md bg-red-100 flex items-center justify-center">
                                                <AlertCircle className="w-4 h-4 text-red-600" />
                                            </div>
                                            <span>Not Eligible <span className="inline-flex items-center justify-center px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs ml-2 font-bold">{notEligible.length}</span></span>
                                        </div>
                                        {showNotEligible ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                    </button>
                                    {showNotEligible && (
                                        <div className="divide-y divide-gray-100 border-t border-red-50 max-h-[400px] overflow-y-auto bg-gray-50/30">
                                            {notEligible.map(r => (
                                                <div key={r.respondent_id} className="flex items-center justify-between px-5 py-3 text-sm">
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-mono bg-white border border-gray-200 px-2 py-1 rounded shadow-sm text-xs">{r.jakpat_id}</span>
                                                        <span className="text-gray-700 font-medium">{r.ktp_name || r.display_name || <span className="text-gray-400 italic font-normal">Nameless</span>}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {r.ineligible_reasons.map((reason, i) => (
                                                            <span key={i} className="text-red-600 flex items-center gap-1.5 text-xs font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                                                {reason.includes('bukti') && <ImageIcon className="w-3 h-3 text-red-500" />}
                                                                {reason.includes('menang') && <Clock className="w-3 h-3 text-red-500" />}
                                                                {reason.includes('redeem') && <Clock className="w-3 h-3 text-red-500" />}
                                                                {reason}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky Actions Footer */}
            {(!hasExistingWinners || isSelectionMode) && !loading && (
                <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-between items-center shrink-0 z-10 shadow-lg relative">
                    <div className="text-sm text-gray-500 font-medium">
                        Dipilih: <span className="text-gray-900 font-bold">{selectedIds.size}</span> dari yang dibutuhkan ({rewardCount - existingWinners.length})
                    </div>
                    <div className="flex gap-3 items-center">
                        {hasExistingWinners && (
                            <Button
                                variant="ghost"
                                onClick={() => setIsSelectionMode(false)}
                                className="font-semibold text-gray-600 hover:text-gray-900"
                                disabled={saving}
                            >
                                Batal
                            </Button>
                        )}
                        <Button
                            onClick={handleConfirmWinners}
                            disabled={selectedIds.size === 0 || saving || selectedIds.size > (rewardCount - existingWinners.length)}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold h-10 px-6 shadow-sm"
                        >
                            {saving ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan Pemenang...</>
                            ) : (
                                <><Check className="w-4 h-4 mr-2" /> Confirm {selectedIds.size} Pemenang</>
                            )}
                        </Button>
                    </div>
                </div>
            )}

            {/* Proof Preview Modal */}
            <Dialog open={!!previewProof} onOpenChange={(open) => !open && setPreviewProof(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl bg-transparent sm:rounded-2xl p-0 overflow-hidden flex flex-col items-center justify-center">
                    <DialogTitle className="sr-only">Proof Preview</DialogTitle>
                    {previewProof && (
                        <div className="relative group max-h-[85vh] w-full flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
                            <img 
                                src={previewProof} 
                                alt="Proof Verification" 
                                className="max-h-[85vh] w-auto max-w-full object-contain rounded-xl shadow-lg ring-1 ring-white/10"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}
