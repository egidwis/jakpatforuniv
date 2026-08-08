import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, getCdnUrl } from '@/utils/supabase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatRespondentDate, formatRespondentTime } from './types';

// ─────────────────────────────────────────────────────────────
// Daftar responden + pembersihan file proof.
//
// Dipanen dari SubmissionsManagerView (464 baris), yang sekitar setengahnya
// adalah kerangka layar-penuh — breadcrumb, header sticky, toolbar, footer cacah
// — dan sekarang disediakan DetailSheet. Yang tersisa di sini: mengambil data,
// menghapus proof, dan merender tabelnya.
//
// Pengambilan data dipisah jadi hook supaya DRAWER yang memegang daftar lengkap:
// ia butuh itu untuk ekspor CSV, cacah tombol, dan pemicu hapus-massal di slot
// `nav`. Tanpa pemisahan ini, ekspor CSV harus menembak query kedua untuk data
// yang sudah ada di memori.
// ─────────────────────────────────────────────────────────────

export interface MergedRespondent {
    respondent_id: string;
    jakpat_id: string;
    proof_url: string | null;
    ewallet_provider: string | null;
    e_wallet_number: string | null;
    /** JSONB, di-key dengan `custom_fields[].label` oleh SurveyPage. */
    custom_answers: Record<string, any> | null;
    submitted_at: string;
    loi_seconds: number | null;
}

/** Ekstrak path storage dari URL Supabase penuh. */
function getStoragePath(url: string): string | null {
    const match = url.match(/\/storage\/v1\/object\/public\/page-uploads\/(.+)$/);
    return match ? match[1] : null;
}

export function usePageRespondents(pageId: string | null) {
    const [loading, setLoading] = useState(true);
    const [respondents, setRespondents] = useState<MergedRespondent[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        if (!pageId) {
            setRespondents([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('page_respondents')
                    .select('*')
                    .eq('page_id', pageId)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                if (cancelled) return;
                setRespondents((data || []).map((pr: any) => ({
                    respondent_id: pr.id,
                    jakpat_id: pr.jakpat_id,
                    proof_url: pr.proof_url,
                    ewallet_provider: pr.ewallet_provider,
                    e_wallet_number: pr.e_wallet_number,
                    custom_answers: pr.custom_answers,
                    submitted_at: pr.created_at,
                    loi_seconds: pr.loi_seconds,
                })));
            } catch (error) {
                console.error('Gagal memuat responden:', error);
                if (!cancelled) toast.error('Gagal memuat data responden');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pageId]);

    const deleteProof = useCallback(async (respondent: MergedRespondent) => {
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
                r.respondent_id === respondent.respondent_id ? { ...r, proof_url: null } : r
            ));
            // Meteran storage di sidebar bergantung pada event ini.
            window.dispatchEvent(new Event('proof-storage-changed'));
            toast.success('Proof berhasil dihapus');
        } catch (error) {
            console.error('Error deleting proof:', error);
            toast.error('Gagal menghapus proof');
        } finally {
            setDeletingId(null);
        }
    }, []);

    const bulkDeleteProofs = useCallback(async () => {
        if (!pageId) return;
        const withProof = respondents.filter(r => r.proof_url);
        if (withProof.length === 0) return;

        setBulkDeleting(true);
        try {
            const filePaths = withProof
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

            setRespondents(prev => prev.map(r => ({ ...r, proof_url: null })));
            window.dispatchEvent(new Event('proof-storage-changed'));
            toast.success(`${withProof.length} proof berhasil dihapus`);
        } catch (error) {
            console.error('Error bulk deleting proofs:', error);
            toast.error('Gagal menghapus proof');
        } finally {
            setBulkDeleting(false);
        }
    }, [pageId, respondents]);

    const proofCount = useMemo(
        () => respondents.filter(r => r.proof_url).length,
        [respondents]
    );

    return { loading, respondents, deletingId, bulkDeleting, deleteProof, bulkDeleteProofs, proofCount };
}

/** Lebar kolom dipusatkan supaya header dan baris tidak bisa bergeser sendiri-sendiri. */
const COL = {
    time: 'w-[104px] shrink-0',
    id: 'w-[96px] shrink-0',
    loi: 'w-[68px] shrink-0 hidden sm:block',
    wallet: 'flex-1 min-w-0',
    proof: 'w-[64px] shrink-0 text-right',
};

export function RespondentTable({
    respondents,
    loading,
    deletingId,
    onDeleteProof,
    emptyLabel = 'Tidak ada responden yang cocok.',
}: {
    respondents: MergedRespondent[];
    loading: boolean;
    deletingId: string | null;
    onDeleteProof: (r: MergedRespondent) => void;
    emptyLabel?: string;
}) {
    const [previewProof, setPreviewProof] = useState<string | null>(null);

    if (loading) {
        return (
            <div className="divide-y divide-gray-100">
                {Array(6).fill(0).map((_, i) => (
                    <div key={`skeleton-respondent-${i}`} className="flex items-center gap-3 px-1 py-2.5">
                        <div className="w-[104px] h-4 bg-gray-100 animate-pulse rounded shrink-0" />
                        <div className="w-[96px] h-4 bg-gray-200 animate-pulse rounded shrink-0" />
                        <div className="flex-1 h-3 bg-gray-100 animate-pulse rounded" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <>
            <div className="sticky top-0 z-10 -mx-5 bg-gray-50 border-y border-gray-200 px-5 h-9 flex items-center gap-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <span className={COL.time}>Waktu</span>
                <span className={COL.id}>Jakpat ID</span>
                <span className={COL.loi}>LOI</span>
                <span className={COL.wallet}>E-Wallet</span>
                <span className={COL.proof}>Proof</span>
            </div>

            {respondents.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">{emptyLabel}</p>
            ) : (
                <div className="divide-y divide-gray-100">
                    {respondents.map(r => (
                        <div key={r.respondent_id} className="flex items-center gap-3 py-2.5 hover:bg-gray-50/70 transition-colors">
                            <div className={cn(COL.time, 'leading-tight')}>
                                <span className="block text-[11px] font-medium text-gray-700">
                                    {formatRespondentDate(r.submitted_at)}
                                </span>
                                <span className="block text-[10px] font-mono text-gray-400">
                                    {formatRespondentTime(r.submitted_at)} WIB
                                </span>
                            </div>
                            <span className={cn(COL.id, 'font-mono text-[11px] font-semibold text-gray-800 truncate')}>
                                {r.jakpat_id}
                            </span>
                            <span className={cn(COL.loi, 'font-mono text-[11px] text-gray-500')}>
                                {r.loi_seconds !== null && r.loi_seconds !== undefined
                                    ? `${Math.floor(r.loi_seconds / 60)}m ${r.loi_seconds % 60}s`
                                    : <span className="text-gray-300">—</span>}
                            </span>
                            <div className={cn(COL.wallet, 'flex items-baseline gap-1.5 min-w-0')}>
                                {r.ewallet_provider ? (
                                    <>
                                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                                            {r.ewallet_provider}
                                        </span>
                                        <span className="truncate font-mono text-[11px] text-gray-600">
                                            {r.e_wallet_number || '—'}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs text-gray-300">—</span>
                                )}
                            </div>
                            <div className={cn(COL.proof, 'flex items-center justify-end gap-0.5')}>
                                {r.proof_url ? (
                                    <>
                                        <Button
                                            variant="ghost" size="sm"
                                            className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                            onClick={() => setPreviewProof(getCdnUrl(r.proof_url!))}
                                            title="Lihat bukti"
                                        >
                                            <ImageIcon className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost" size="sm"
                                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => onDeleteProof(r)}
                                            disabled={deletingId === r.respondent_id}
                                            title="Hapus bukti permanen"
                                        >
                                            {deletingId === r.respondent_id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <Trash2 className="h-3.5 w-3.5" />}
                                        </Button>
                                    </>
                                ) : (
                                    <span className="text-xs text-gray-300">—</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={!!previewProof} onOpenChange={(open) => !open && setPreviewProof(null)}>
                <DialogContent className="max-w-3xl border-none shadow-2xl bg-transparent sm:rounded-2xl p-0 overflow-hidden flex flex-col items-center justify-center">
                    <DialogTitle className="sr-only">Pratinjau Proof</DialogTitle>
                    {previewProof && (
                        <div className="relative max-h-[85vh] w-full flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
                            <img src={previewProof} alt="Proof" className="max-h-[85vh] w-auto max-w-full object-contain rounded-xl shadow-lg ring-1 ring-white/10" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
