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
    AlertCircle,
    MapPin,
    ImageIcon,
    User,
    Search,
    Filter,
    ArrowLeft,
    ChevronRight,
    Download,
    Trash2,
    Plus,
    FileText,
    AlertTriangle,
    ArrowDownUp
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

interface SubmissionsManagerViewProps {
    pageId: string;
    pageTitle: string;
    rewardAmount: number;
    rewardCount: number;
    onBack: () => void;
}

export function SubmissionsManagerView({
    pageId,
    pageTitle,
    rewardAmount,
    rewardCount,
    onBack,
}: SubmissionsManagerViewProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [respondents, setRespondents] = useState<MergedRespondent[]>([]);
    const [existingWinners, setExistingWinners] = useState<ExistingWinner[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [criteria, setCriteria] = useState<string>('');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [previewProof, setPreviewProof] = useState<string | null>(null);

    // Proof deletion states
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    // Filter and Sort states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterWallet, setFilterWallet] = useState('all');
    const [filterProvince, setFilterProvince] = useState('all');
    const [sortByEligible, setSortByEligible] = useState(true);

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
                const uniqueSanitized = new Set<string>();
                jakpatIds.forEach((rawId: string) => {
                    if (!rawId) return;
                    uniqueSanitized.add(sanitizeJakpatId(rawId));
                });
                const sanitizedList = Array.from(uniqueSanitized).filter(Boolean);

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

                const uniqueOriginals = [...new Set(jakpatIds.filter(Boolean).map((id: string) => id.trim()))];
                for (let i = 0; i < uniqueOriginals.length; i += BATCH_SIZE) {
                    const batch = uniqueOriginals.slice(i, i + BATCH_SIZE);
                    const { data: mdBatch } = await supabase
                        .from('respondents-masterdata')
                        .select('*')
                        .in('jakpat_id', batch);
                    if (mdBatch) allMdData.push(...mdBatch);
                }

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
                    .filter((w: any) => w.page_id !== pageId)
                    .map((w: any) => w.jakpat_id)
            );

            // 4. Fetch existing winners for THIS survey
            const { data: existingData } = await supabase
                .from('survey_winners')
                .select('*')
                .eq('page_id', pageId)
                .order('selected_at', { ascending: true });

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

                if (!pr.proof_url) reasons.push('Tidak upload bukti (proof)');

                const isRecentWinner = recentWinnerIds.has(pr.jakpat_id);
                if (isRecentWinner) reasons.push('Sudah menang dalam 6 bulan terakhir');

                if (md.last_redeem_at) {
                    try {
                        const redeemDate = new Date(md.last_redeem_at);
                        if (!isNaN(redeemDate.getTime()) && redeemDate > sixMonthsAgo) {
                            if (!isRecentWinner) {
                                reasons.push(`Terakhir redeem: ${md.last_redeem_at}`);
                            }
                        }
                    } catch {
                        // ignore
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

    // Extract storage path from full Supabase URL
    const getStoragePath = (url: string): string | null => {
        try {
            const match = url.match(/\/storage\/v1\/object\/public\/page-uploads\/(.+)$/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    };

    // Delete single proof image
    const handleDeleteProof = async (respondent: MergedRespondent) => {
        if (!respondent.proof_url) return;
        setDeletingId(respondent.respondent_id);
        
        try {
            const filePath = getStoragePath(respondent.proof_url);
            if (filePath) {
                const { error: storageError } = await supabase.storage
                    .from('page-uploads')
                    .remove([filePath]);
                if (storageError) console.warn('Storage delete warning:', storageError);
            }

            const { error: dbError } = await supabase
                .from('page_respondents')
                .update({ proof_url: null })
                .eq('id', respondent.respondent_id);

            if (dbError) throw dbError;

            setRespondents(prev => prev.map(r => 
                r.respondent_id === respondent.respondent_id ? 
                { 
                    ...r, 
                    proof_url: null, 
                    is_eligible: false, 
                    ineligible_reasons: [...r.ineligible_reasons.filter(x => !x.includes('bukti')), 'Tidak upload bukti (proof)']
                } : r
            ));

            window.dispatchEvent(new Event('proof-storage-changed'));
            toast.success('Proof berhasil dihapus');
        } catch (error) {
            console.error('Error deleting proof:', error);
            toast.error('Gagal menghapus proof');
        } finally {
            setDeletingId(null);
        }
    };

    // Bulk delete all proofs
    const handleBulkDeleteProofs = async () => {
        const respondentsWithProof = respondents.filter(r => r.proof_url);
        if (respondentsWithProof.length === 0) return;

        setBulkDeleting(true);
        try {
            const filePaths = respondentsWithProof
                .map(r => getStoragePath(r.proof_url!))
                .filter(Boolean) as string[];

            if (filePaths.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('page-uploads')
                    .remove(filePaths);
                if (storageError) console.warn('Bulk storage delete warning:', storageError);
            }

            const { error: dbError } = await supabase
                .from('page_respondents')
                .update({ proof_url: null })
                .eq('page_id', pageId)
                .not('proof_url', 'is', null);

            if (dbError) throw dbError;

            setRespondents(prev => prev.map(r => ({ 
                ...r, 
                proof_url: null,
                is_eligible: false,
                ineligible_reasons: [...r.ineligible_reasons.filter(x => !x.includes('bukti')), 'Tidak upload bukti (proof)']
            })));

            window.dispatchEvent(new Event('proof-storage-changed'));
            toast.success(`${respondentsWithProof.length} proof berhasil dihapus`);
            setShowBulkConfirm(false);
        } catch (error) {
            console.error('Error bulk deleting proofs:', error);
            toast.error('Gagal menghapus proof');
        } finally {
            setBulkDeleting(false);
        }
    };

    // Combined filtered & sorted list
    const filteredRespondents = useMemo(() => {
        const existingWinnerJakpatIds = new Set(existingWinners.map(w => w.jakpat_id));
        
        let filtered = respondents.filter(r => {
            // Except existing winners if in selection mode to avoid selecting twice
            if (isSelectionMode && existingWinnerJakpatIds.has(r.jakpat_id)) return false;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = (r.ktp_name || '').toLowerCase().includes(q) || (r.display_name || '').toLowerCase().includes(q);
                const matchId = r.jakpat_id.toLowerCase().includes(q);
                if (!matchName && !matchId) return false;
            }
            if (filterWallet !== 'all' && r.ewallet_provider !== filterWallet) return false;
            if (filterProvince !== 'all' && r.province !== filterProvince) return false;
            return true;
        });

        return filtered.sort((a, b) => {
            if (sortByEligible) {
                if (a.is_eligible !== b.is_eligible) {
                    return a.is_eligible ? -1 : 1; // Eligible first
                }
            }

            const aHasMasterdata = !!a.user_id ? 1 : 0;
            const bHasMasterdata = !!b.user_id ? 1 : 0;
            if (aHasMasterdata !== bHasMasterdata) {
                return bHasMasterdata - aHasMasterdata;
            }
            return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
        });
    }, [respondents, existingWinners, searchQuery, filterWallet, filterProvince, sortByEligible, isSelectionMode]);

    const walletProviders = useMemo(() => {
        const providers = new Set(respondents.map(r => r.ewallet_provider).filter(Boolean) as string[]);
        return Array.from(providers).sort();
    }, [respondents]);

    const provinces = useMemo(() => {
        const provs = new Set(respondents.map(r => r.province).filter(Boolean) as string[]);
        return Array.from(provs).sort();
    }, [respondents]);

    const hasExistingWinners = existingWinners.length > 0;
    const eligibleCount = filteredRespondents.filter(r => r.is_eligible).length;
    const totalProofCount = respondents.filter(r => r.proof_url).length;

    const toggleSelect = (jakpatId: string, isEligible: boolean) => {
        if (!isEligible) {
            toast.error('Responden ini tidak memenuhi syarat (Not Eligible)');
            return;
        }

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

    const handleRandomPick = () => {
        const pool = filteredRespondents.filter(r => r.is_eligible);
        if (pool.length === 0) {
            toast.error('Tidak ada responden eligible untuk di-pick');
            return;
        }
        const needed = rewardCount - existingWinners.length;
        const count = Math.min(needed, pool.length);
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, count);
        setSelectedIds(new Set(picked.map(p => p.jakpat_id)));
        toast.success(`${count} responden dipilih secara random`);
    };

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

            const { error } = await supabase.from('survey_winners').insert(winners);
            if (error) throw error;

            toast.success(`${winners.length} pemenang berhasil disimpan! 🎉`);
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            fetchData();
        } catch (error: any) {
            console.error('Error saving winners:', error);
            toast.error('Gagal menyimpan pemenang');
        } finally {
            setSaving(false);
        }
    };

    const exportToCSV = () => {
        if (existingWinners.length === 0) return;
        const headers = ['Jakpat ID', 'User ID', 'Email', 'Nama', 'No. E-Wallet', 'NIK/NPWP', 'Kota/Kab Provinsi', 'Judul Survey', 'Kirim Ke', 'NOMINAL'];
        const rows = existingWinners.map(w => [
            w.jakpat_id, w.user_id ?? '', w.email ?? '', w.respondent_name ?? '',
            w.e_wallet_number ?? '', w.ktp_number ?? '', [w.city, w.province].filter(Boolean).join(', '),
            pageTitle, w.ewallet_provider ?? '', w.reward_amount || rewardAmount || 0,
        ]);
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pemenang_${pageTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDeleteWinner = async (winnerId: string, respondentName: string) => {
        if (!confirm(`Hapus ${respondentName || 'pemenang ini'} dari daftar pemenang?`)) return;
        try {
            const { error } = await supabase.from('survey_winners').delete().eq('id', winnerId);
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
                    <span className="hover:text-blue-600 cursor-pointer hover:underline" onClick={onBack}>Pages</span>
                    <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                    <span className="truncate max-w-[200px] md:max-w-md" title={pageTitle}>{pageTitle}</span>
                    <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                    <span className="text-gray-900 font-semibold shrink-0">
                        {hasExistingWinners && !isSelectionMode ? 'Submissions & Pemenang' : 'Submissions List'}
                    </span>
                </nav>
            </div>

            {/* Content Header & Proof Bulk Delete */}
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 shrink-0 bg-white">
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-900">Submissions</h2>
                    </div>
                    {rewardCount > 0 && (
                        <>
                            <span className="text-gray-300">|</span>
                            <p className="text-sm text-gray-600 font-medium">Reward: Rp {(rewardAmount || 0).toLocaleString('id-ID')} × {rewardCount}</p>
                        </>
                    )}
                </div>

                {/* Bulk Proof Delete Action */}
                {totalProofCount > 0 && !loading && (
                    <div className="flex items-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shadow-sm shrink-0">
                        <div className="flex items-center gap-2 text-xs text-amber-800 mr-3">
                            <FileText className="h-4 w-4" />
                            <span><strong>{totalProofCount}</strong> file proof (~{((totalProofCount * 100) / 1024).toFixed(0)} KB)</span>
                        </div>
                        {!showBulkConfirm ? (
                            <Button
                                variant="outline" size="sm"
                                className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 bg-white"
                                onClick={() => setShowBulkConfirm(true)}
                            >
                                <Trash2 className="h-3 w-3 mr-1" /> Hapus File Proof
                            </Button>
                        ) : (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                                <span className="text-xs text-red-700 font-bold hidden md:inline ml-2">Yakin?</span>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>Batal</Button>
                                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleBulkDeleteProofs} disabled={bulkDeleting}>
                                    {bulkDeleting ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> ...</> : 'Ya, Hapus Semua'}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto bg-gray-50/30">
                <div className="p-6 h-full flex flex-col">
                    {loading ? (
                        <div className="flex flex-1 items-center justify-center min-h-[300px]">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                <span className="text-sm text-gray-500">Memuat data submissions...</span>
                            </div>
                        </div>
                    ) : hasExistingWinners && !isSelectionMode ? (
                        /* ===== WINNER LIST VIEW ===== */
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2 text-green-800 text-sm">
                                    <div className="h-6 w-6 rounded-full bg-green-200 flex items-center justify-center"><Check className="w-4 h-4 text-green-700" /></div>
                                    <span><strong>{existingWinners.length}</strong> pemenang sudah dipilih</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-green-300 text-green-800 hover:bg-green-100 bg-white font-semibold" onClick={exportToCSV}>
                                        <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50 bg-white font-semibold" onClick={() => setIsSelectionMode(true)}>
                                        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Lihat Semua Submissions / Tambah Pemenang
                                    </Button>
                                </div>
                            </div>

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
                                                <TableHead className="text-xs font-semibold whitespace-nowrap">Lokasi</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap text-right">Nominal</TableHead>
                                                <TableHead className="text-xs font-semibold whitespace-nowrap w-10"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {existingWinners.map(w => (
                                                <TableRow key={w.id} className="hover:bg-gray-50/50">
                                                    <TableCell><span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded inline-block">{w.jakpat_id}</span></TableCell>
                                                    <TableCell className="text-xs text-gray-600 font-mono">{w.user_id ?? '—'}</TableCell>
                                                    <TableCell className="text-xs text-gray-600 max-w-[180px] truncate" title={w.email || ''}>{w.email || '—'}</TableCell>
                                                    <TableCell className="text-sm font-medium text-gray-900 whitespace-nowrap">{w.respondent_name || '—'}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-700">{w.e_wallet_number ? `${w.ewallet_provider} - ${w.e_wallet_number}` : '—'}</TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-600">{w.ktp_number || '—'}</TableCell>
                                                    <TableCell className="text-xs text-gray-600 whitespace-nowrap">{[w.city, w.province].filter(Boolean).join(', ') || '—'}</TableCell>
                                                    <TableCell className="text-sm font-semibold text-gray-700 text-right whitespace-nowrap">Rp {(w.reward_amount || rewardAmount || 0).toLocaleString('id-ID')}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Button variant="ghost" size="sm" onClick={() => handleDeleteWinner(w.id, w.respondent_name || '')} className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700">
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
                        /* ===== SUBMISSIONS / SELECTION VIEW ===== */
                        <div className="flex-1 flex flex-col space-y-4">
                            {criteria && (
                                <div className="bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800 shadow-sm mx-auto w-full">
                                    <span className="font-semibold block mb-1">Syarat Responden Survey Ini:</span> 
                                    {criteria}
                                </div>
                            )}

                            <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                {/* Table Toolbar */}
                                <div className="p-4 border-b border-gray-100 flex flex-col gap-3 bg-gray-50/50">
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
                                                {walletProviders.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                            <select
                                                value={filterProvince}
                                                onChange={(e) => setFilterProvince(e.target.value)}
                                                className="h-9 text-sm border border-gray-200 rounded-md px-3 bg-white text-gray-700 cursor-pointer shadow-sm focus:border-blue-500 outline-none"
                                            >
                                                <option value="all">Semua Provinsi</option>
                                                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                            {(searchQuery || filterWallet !== 'all' || filterProvince !== 'all') && (
                                                <button onClick={() => { setSearchQuery(''); setFilterWallet('all'); setFilterProvince('all'); }} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1">Reset</button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isSelectionMode && selectedIds.size > 0 && (
                                                <Button variant="outline" size="sm" className="text-xs text-gray-600 bg-white border-gray-200 hover:bg-gray-50 font-semibold h-9" onClick={() => setSelectedIds(new Set())}>
                                                    Clear Selection
                                                </Button>
                                            )}
                                            {isSelectionMode && (
                                                <Button onClick={handleRandomPick} size="sm" className="text-xs font-semibold h-9 bg-blue-600 hover:bg-blue-700 shadow-sm" disabled={filteredRespondents.length === 0}>
                                                    <Shuffle className="w-4 h-4 mr-1.5" />
                                                    Random Pick {Math.min(rewardCount - existingWinners.length, eligibleCount)}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Main Submissions Table */}
                                <div className="flex-1 overflow-auto min-h-[300px]">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm border-b border-gray-200">
                                            <TableRow className="hover:bg-transparent">
                                                {isSelectionMode && <TableHead className="w-12 text-center"></TableHead>}
                                                <TableHead className="text-xs font-semibold text-gray-600">Jakpat ID</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSortByEligible(!sortByEligible)}>
                                                    <div className="flex items-center justify-between gap-2">
                                                        Status
                                                        <ArrowDownUp className="w-3.5 h-3.5 text-gray-400" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">Nama Lengkap</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">Lokasi</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">E-Wallet</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600 text-right">Proof</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredRespondents.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={isSelectionMode ? 7 : 6} className="h-48 text-center text-gray-400">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <Filter className="w-6 h-6 text-gray-300 mb-1" />
                                                            <span className="font-medium text-sm text-gray-500">Tidak ada responden yang cocok</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredRespondents.map(r => (
                                                    <TableRow
                                                        key={r.respondent_id}
                                                        className={`transition-colors border-b border-gray-100 ${isSelectionMode && selectedIds.has(r.jakpat_id) ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}
                                                    >
                                                        {isSelectionMode && (
                                                            <TableCell className="text-center py-3">
                                                                <Checkbox
                                                                    checked={selectedIds.has(r.jakpat_id)}
                                                                    onCheckedChange={() => toggleSelect(r.jakpat_id, r.is_eligible)}
                                                                    disabled={!r.is_eligible}
                                                                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                                />
                                                            </TableCell>
                                                        )}
                                                        <TableCell className="py-3">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-mono text-xs font-semibold text-gray-700">{r.jakpat_id}</span>
                                                                <span className="text-[10px] text-gray-400 font-mono">UID: {r.user_id || '—'}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-3 max-w-[200px]">
                                                            {r.is_eligible ? (
                                                                <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] border border-emerald-200/60">
                                                                    <Check className="w-3 h-3" /> Eligible
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-col gap-1.5 items-start">
                                                                    <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] border border-red-200/60">
                                                                        <AlertCircle className="w-3 h-3" /> Not Eligible
                                                                    </span>
                                                                    <div className="flex flex-col gap-0.5">
                                                                        {r.ineligible_reasons.map((reason, i) => (
                                                                            <span key={i} className="text-[10px] text-red-500 font-medium leading-tight line-clamp-1" title={reason}>• {reason}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium py-3">
                                                            {r.ktp_name || r.display_name || <span className="text-gray-400 italic text-xs font-normal">Not in masterdata</span>}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-gray-600 py-3">
                                                            {r.city || r.province ? <span>{[r.city, r.province].filter(Boolean).join(', ')}</span> : <span className="text-gray-300">—</span>}
                                                        </TableCell>
                                                        <TableCell className="text-xs py-3">
                                                            {r.e_wallet_number ? (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="font-semibold text-blue-700 uppercase tracking-wider text-[10px]">{r.ewallet_provider}</span>
                                                                    <span className="font-mono text-gray-600">{r.e_wallet_number}</span>
                                                                </div>
                                                            ) : <span className="text-gray-300">—</span>}
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            {r.proof_url ? (
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" onClick={() => setPreviewProof(getCdnUrl(r.proof_url!))} title="Lihat Bukti">
                                                                        <ImageIcon className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={() => handleDeleteProof(r)} disabled={deletingId === r.respondent_id} title="Hapus Bukti Permanent">
                                                                        {deletingId === r.respondent_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                                    </Button>
                                                                </div>
                                                            ) : <span className="text-xs text-gray-400">—</span>}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky Actions Footer (For Winner Selection) */}
            {(!hasExistingWinners || isSelectionMode) && !loading && (
                <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-between items-center shrink-0 z-10 shadow-lg relative">
                    <div className="text-sm text-gray-500 font-medium">
                        {isSelectionMode ? (
                            <>Dipilih: <span className="text-gray-900 font-bold">{selectedIds.size}</span> dari yang dibutuhkan ({rewardCount - existingWinners.length})</>
                        ) : (
                            <>Total: <span className="text-gray-900 font-bold">{respondents.length}</span> Submissions</>
                        )}
                    </div>
                    <div className="flex gap-3 items-center">
                        {hasExistingWinners && isSelectionMode && (
                            <Button variant="ghost" onClick={() => setIsSelectionMode(false)} className="font-semibold text-gray-600 hover:text-gray-900" disabled={saving}>
                                Batal Pilih Pemenang
                            </Button>
                        )}
                        {!isSelectionMode && rewardCount > 0 && rewardCount > existingWinners.length && (
                            <Button onClick={() => setIsSelectionMode(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 px-6 shadow-sm">
                                <Trophy className="w-4 h-4 mr-2" /> Mode Pilih Pemenang
                            </Button>
                        )}
                        {isSelectionMode && (
                            <Button
                                onClick={handleConfirmWinners}
                                disabled={selectedIds.size === 0 || saving || selectedIds.size > (rewardCount - existingWinners.length)}
                                className="bg-green-600 hover:bg-green-700 text-white font-semibold h-10 px-6 shadow-sm"
                            >
                                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : <><Check className="w-4 h-4 mr-2" /> Confirm {selectedIds.size} Pemenang</>}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Proof Preview Modal */}
            <Dialog open={!!previewProof} onOpenChange={(open) => !open && setPreviewProof(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl bg-transparent sm:rounded-2xl p-0 overflow-hidden flex flex-col items-center justify-center">
                    <DialogTitle className="sr-only">Proof Preview</DialogTitle>
                    {previewProof && (
                        <div className="relative group max-h-[85vh] w-full flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
                            <img src={previewProof} alt="Proof" className="max-h-[85vh] w-auto max-w-full object-contain rounded-xl shadow-lg ring-1 ring-white/10" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
