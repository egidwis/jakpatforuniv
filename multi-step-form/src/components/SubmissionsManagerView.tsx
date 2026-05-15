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
import { Input } from '@/components/ui/input';
import {
    Loader2,
    Check,
    ImageIcon,
    Search,
    Filter,
    ArrowLeft,
    ChevronRight,
    Trash2,
    FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAutoAnimate } from '@formkit/auto-animate/react';

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
    const [animationParent] = useAutoAnimate<HTMLTableSectionElement>();
    const [loading, setLoading] = useState(true);
    const [loadProgress, setLoadProgress] = useState(0);
    const [loadText, setLoadText] = useState('Memuat data submissions...');
    const [respondents, setRespondents] = useState<MergedRespondent[]>([]);
    const [existingWinners, setExistingWinners] = useState<ExistingWinner[]>([]);
    const [criteria, setCriteria] = useState<string>('');
    const [previewProof, setPreviewProof] = useState<string | null>(null);

    // Proof deletion states
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProvince, setFilterProvince] = useState('all');

    // Fetch all data
    useEffect(() => {
        if (pageId) {
            fetchData();
        }
    }, [pageId]);

    const fetchData = async () => {
        setLoading(true);
        setLoadProgress(10);
        setLoadText('Mengambil data dari server...');
        try {
            // 1. Fetch respondents
            const { data: prData, error: prError } = await supabase
                .from('page_respondents')
                .select('*')
                .eq('page_id', pageId)
                .order('created_at', { ascending: true });

            if (prError) throw prError;

            setLoadProgress(40);
            setLoadText('Mendapatkan riwayat pemenang...');
            // 2. Fetch recent winners (last 6 months) across ALL surveys
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

            // 3. Fetch existing winners for THIS survey
            const { data: existingData } = await supabase
                .from('survey_winners')
                .select('*')
                .eq('page_id', pageId)
                .order('selected_at', { ascending: true });

            const enrichedWinners: ExistingWinner[] = (existingData || []).map((w: any) => ({
                ...w,
                user_id: null,
                email: null,
                ktp_number: null,
                city: null,
                province: null,
            }));
            setExistingWinners(enrichedWinners);

            // 4. Fetch criteria from form_submissions
            const { data: pageData } = await supabase
                .from('survey_pages')
                .select('submission_id, form_submissions(criteria_responden)')
                .eq('id', pageId)
                .single();

            if (pageData?.form_submissions) {
                setCriteria((pageData.form_submissions as any).criteria_responden || '');
            }

            setLoadProgress(85);
            setLoadText('Menggabungkan dan menganalisis data...');
            // 5. Merge and categorize
            const merged: MergedRespondent[] = (prData || []).map((pr: any) => {
                const reasons: string[] = [];

                if (!pr.proof_url) reasons.push('Tidak upload bukti (proof)');

                const isRecentWinner = recentWinnerIds.has(pr.jakpat_id);
                if (isRecentWinner) reasons.push('Sudah menang dalam 6 bulan terakhir');

                return {
                    respondent_id: pr.id,
                    jakpat_id: pr.jakpat_id,
                    proof_url: pr.proof_url,
                    ewallet_provider: pr.ewallet_provider,
                    e_wallet_number: pr.e_wallet_number,
                    custom_answers: pr.custom_answers,
                    submitted_at: pr.created_at,
                    user_id: null,
                    ktp_name: null,
                    display_name: null,
                    email: null,
                    city: null,
                    province: null,
                    ktp_number: null,
                    phone_number_gift: null,
                    last_redeem_at: null,
                    is_eligible: reasons.length === 0,
                    ineligible_reasons: reasons,
                };
            });

            setRespondents(merged);
            setLoadProgress(100);
            setLoadText('Selesai!');
        } catch (error: any) {
            console.error('Error fetching data:', error);
            toast.error('Gagal memuat data responden');
        } finally {
            setTimeout(() => setLoading(false), 300);
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
        let filtered = respondents.filter(r => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchId = r.jakpat_id.toLowerCase().includes(q);
                if (!matchId) return false;
            }
            if (filterProvince !== 'all' && r.province !== filterProvince) return false;
            return true;
        });

        return filtered.sort((a, b) => {
            return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
        });
    }, [respondents, searchQuery, filterProvince]);

    const provinces = useMemo(() => {
        const provs = new Set(respondents.map(r => r.province).filter(Boolean) as string[]);
        return Array.from(provs).sort();
    }, [respondents]);

    const hasExistingWinners = existingWinners.length > 0;
    const totalProofCount = respondents.filter(r => r.proof_url).length;



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
            {/* Floating Header - Sticky */}
            <div className="border-b border-gray-200 bg-white/95 backdrop-blur-md sticky top-0 z-20 shrink-0 shadow-sm px-6 py-4 flex flex-col gap-2.5">
                {/* Row 1: Breadcrumb */}
                <div className="flex items-center">
                    <button 
                        onClick={onBack} 
                        className="mr-3 p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900"
                        title="Kembali ke Daftar Halaman"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <nav className="flex items-center text-sm font-medium text-gray-500 overflow-hidden w-full">
                        <span className="hover:text-blue-600 cursor-pointer hover:underline" onClick={onBack}>Pages</span>
                        <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                        <span className="text-gray-900 font-semibold shrink-0">Submissions</span>
                    </nav>
                </div>

                {/* Row 2: Page Title + Reward Info */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                    <h2 className="text-lg font-semibold text-gray-900">{pageTitle}</h2>
                    {rewardCount > 0 && (
                        <>
                            <span className="text-gray-300">|</span>
                            <span className="text-sm font-medium text-gray-600">Reward: Rp {(rewardAmount || 0).toLocaleString('id-ID')} × {rewardCount}</span>
                        </>
                    )}
                </div>

                {/* Row 3: Criteria */}
                {criteria && (
                    <div className="bg-blue-50 border border-blue-100 rounded px-4 py-2 text-xs text-blue-800">
                        <strong className="font-semibold block mb-0.5">Syarat Responden Survey Ini:</strong>
                        <span className="opacity-90">{criteria}</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto bg-gray-50/30">
                <div className="p-6 h-full flex flex-col">
                    {loading ? (
                        <div className="flex flex-1 flex-col items-center justify-center min-h-[300px] w-full max-w-sm mx-auto">
                            <div className="flex flex-col items-center gap-5 w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                                <div className="p-3 bg-blue-50 rounded-full">
                                    <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                                </div>
                                <div className="w-full space-y-2">
                                    <div className="flex justify-between w-full text-xs font-semibold text-gray-700">
                                        <span>{loadText}</span>
                                        <span className="text-blue-600">{loadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100/80 rounded-full h-2 overflow-hidden ring-1 ring-inset ring-gray-200/50">
                                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${loadProgress}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : hasExistingWinners ? (
                        /* ===== WINNER LIST VIEW ===== */
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2 text-green-800 text-sm">
                                    <div className="h-6 w-6 rounded-full bg-green-200 flex items-center justify-center"><Check className="w-4 h-4 text-green-700" /></div>
                                    <span><strong>{existingWinners.length}</strong> pemenang sudah dipilih</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Bulk Proof Delete Action */}
                                    {totalProofCount > 0 && !loading && (
                                        <div className="flex items-center bg-white border border-amber-200 rounded-md pl-3 pr-1 py-0.5 shadow-sm shrink-0 h-8">
                                            <div className="flex items-center gap-2 text-xs text-amber-800 mr-2">
                                                <FileText className="h-3.5 w-3.5" />
                                                <span><strong>{totalProofCount}</strong> file proof (~{((totalProofCount * 100) / 1024).toFixed(0)} KB)</span>
                                            </div>
                                            {!showBulkConfirm ? (
                                                <Button
                                                    variant="outline" size="sm"
                                                    className="h-6 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100 bg-amber-50"
                                                    onClick={() => setShowBulkConfirm(true)}
                                                >
                                                    <Trash2 className="h-3 w-3 mr-1" /> Hapus File Proof
                                                </Button>
                                            ) : (
                                                <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
                                                    <span className="text-[11px] text-red-700 font-bold hidden xl:inline ml-1">Yakin hapus?</span>
                                                    <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>Batal</Button>
                                                    <Button variant="destructive" size="sm" className="h-6 text-[11px] px-2" onClick={handleBulkDeleteProofs} disabled={bulkDeleting}>
                                                        {bulkDeleting ? <><Loader2 className="h-3 w-3 mr-0.5 animate-spin" /> ...</> : 'Ya, Hapus'}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

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
                        /* ===== SUBMISSIONS VIEW ===== */
                        <div className="flex-1 flex flex-col space-y-4">

                            <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                {/* Table Toolbar */}
                                <div className="p-4 border-b border-gray-100 flex flex-col gap-3 bg-gray-50/50">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap flex-1">
                                            <div className="relative min-w-[200px] flex-1 max-w-sm">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <Input
                                                    placeholder="Cari Jakpat ID..."
                                                    className="pl-9 h-9 text-sm bg-white border-gray-200 focus:border-blue-500 shadow-sm"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                />
                                            </div>
                                            {searchQuery && (
                                                <button onClick={() => setSearchQuery('')} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1">Reset</button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Main Submissions Table */}
                                <div className="flex-1 overflow-auto min-h-[300px]">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm border-b border-gray-200">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="text-xs font-semibold text-gray-600">Waktu Submit</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">Jakpat ID</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">E-Wallet Provider</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600">E-Wallet Number</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-600 text-right">Proof</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody ref={animationParent}>
                                            {filteredRespondents.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-48 text-center text-gray-400">
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
                                                        className="transition-colors border-b border-gray-100 hover:bg-gray-50"
                                                    >
                                                        <TableCell className="py-3">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-xs text-gray-700 font-medium whitespace-nowrap">
                                                                    {new Date(r.submitted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
                                                                    {new Date(r.submitted_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')} WIB
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            <span className="font-mono text-xs font-semibold text-gray-700">{r.jakpat_id}</span>
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            {r.ewallet_provider ? (
                                                                <span className="font-semibold text-blue-700 uppercase tracking-wider text-[10px]">{r.ewallet_provider}</span>
                                                            ) : <span className="text-gray-300 text-xs">—</span>}
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            {r.e_wallet_number ? (
                                                                <span className="font-mono text-xs text-gray-600">{r.e_wallet_number}</span>
                                                            ) : <span className="text-gray-300 text-xs">—</span>}
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

            {/* Sticky Footer */}
            {!loading && (
                <div className="px-6 py-3 border-t border-gray-200 bg-white flex justify-between items-center shrink-0 z-10">
                    <div className="text-sm text-gray-500 font-medium">
                        Total: <span className="text-gray-900 font-bold">{respondents.length}</span> Submissions
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
