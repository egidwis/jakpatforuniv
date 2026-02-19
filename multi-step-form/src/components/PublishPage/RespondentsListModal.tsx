import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, FileText, Trash2, AlertTriangle } from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';

interface Respondent {
    id: string;
    respondent_name: string;
    jakpat_id: string;
    proof_url: string;
    created_at: string;
    contact_info?: string;
    e_wallet_number?: string;
}

interface RespondentsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    pageId: string;
    pageTitle: string;
}

export function RespondentsListModal({ isOpen, onClose, pageId, pageTitle }: RespondentsListModalProps) {
    const [respondents, setRespondents] = useState<Respondent[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    useEffect(() => {
        if (isOpen && pageId) {
            fetchRespondents();
            setShowBulkConfirm(false);
        }
    }, [isOpen, pageId]);

    const fetchRespondents = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('page_respondents')
                .select('*')
                .eq('page_id', pageId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRespondents(data || []);
        } catch (error) {
            console.error('Error fetching respondents:', error);
        } finally {
            setLoading(false);
        }
    };

    // Extract storage path from full Supabase URL
    const getStoragePath = (url: string): string | null => {
        try {
            // URL e.g.: https://xxx.supabase.co/storage/v1/object/public/page-uploads/proof-123-file.png
            const match = url.match(/\/storage\/v1\/object\/public\/page-uploads\/(.+)$/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    };

    // Delete single proof image
    const handleDeleteProof = async (respondent: Respondent) => {
        if (!respondent.proof_url) return;

        setDeletingId(respondent.id);
        try {
            const filePath = getStoragePath(respondent.proof_url);

            // 1. Delete file from storage
            if (filePath) {
                const { error: storageError } = await supabase.storage
                    .from('page-uploads')
                    .remove([filePath]);

                if (storageError) {
                    console.warn('Storage delete warning:', storageError);
                    // Continue anyway - file might already be gone
                }
            }

            // 2. Update database - set proof_url to null
            const { error: dbError } = await supabase
                .from('page_respondents')
                .update({ proof_url: null })
                .eq('id', respondent.id);

            if (dbError) throw dbError;

            // 3. Update local state
            setRespondents(prev =>
                prev.map(r => r.id === respondent.id ? { ...r, proof_url: '' } : r)
            );

            // 4. Notify sidebar to refresh storage meter
            window.dispatchEvent(new Event('proof-storage-changed'));

            toast.success('Proof berhasil dihapus');
        } catch (error) {
            console.error('Error deleting proof:', error);
            toast.error('Gagal menghapus proof');
        } finally {
            setDeletingId(null);
        }
    };

    // Bulk delete all proofs for this survey
    const handleBulkDeleteProofs = async () => {
        const respondentsWithProof = respondents.filter(r => r.proof_url);
        if (respondentsWithProof.length === 0) return;

        setBulkDeleting(true);
        try {
            // 1. Collect all file paths
            const filePaths = respondentsWithProof
                .map(r => getStoragePath(r.proof_url))
                .filter(Boolean) as string[];

            // 2. Delete files from storage (batch)
            if (filePaths.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('page-uploads')
                    .remove(filePaths);

                if (storageError) {
                    console.warn('Bulk storage delete warning:', storageError);
                }
            }

            // 3. Update database - set proof_url to null for all respondents of this page
            const { error: dbError } = await supabase
                .from('page_respondents')
                .update({ proof_url: null })
                .eq('page_id', pageId)
                .not('proof_url', 'is', null);

            if (dbError) throw dbError;

            // 4. Update local state
            setRespondents(prev =>
                prev.map(r => ({ ...r, proof_url: '' }))
            );

            // 5. Notify sidebar to refresh storage meter
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

    const proofCount = respondents.filter(r => r.proof_url).length;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between mr-4">
                        <div>
                            <DialogTitle>Respondents List</DialogTitle>
                            <DialogDescription className="mt-1">
                                Survey: <span className="font-medium text-foreground">{pageTitle}</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Bulk Actions Bar */}
                {proofCount > 0 && !loading && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                        <div className="flex items-center gap-2 text-sm text-amber-800">
                            <FileText className="h-4 w-4" />
                            <span><strong>{proofCount}</strong> proof screenshot tersimpan (~{((proofCount * 100) / 1024).toFixed(0)} KB)</span>
                        </div>
                        {!showBulkConfirm ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 bg-white"
                                onClick={() => setShowBulkConfirm(true)}
                            >
                                <Trash2 className="h-3 w-3 mr-1" /> Hapus Semua Proof
                            </Button>
                        ) : (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                                <div className="flex items-center gap-1.5 text-xs text-red-700">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span>Yakin hapus {proofCount} gambar?</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setShowBulkConfirm(false)}
                                    disabled={bulkDeleting}
                                >
                                    Batal
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={handleBulkDeleteProofs}
                                    disabled={bulkDeleting}
                                >
                                    {bulkDeleting ? (
                                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Menghapus...</>
                                    ) : (
                                        'Ya, Hapus'
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-auto mt-4 border rounded-md">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                    ) : respondents.length === 0 ? (
                        <div className="flex h-40 flex-col items-center justify-center text-gray-500">
                            <FileText className="h-10 w-10 mb-2 opacity-50" />
                            <p>No respondents yet.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Jakpat ID</TableHead>
                                    <TableHead>Contact / E-Wallet</TableHead>
                                    <TableHead className="text-right">Proof</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {respondents.map((respondent) => (
                                    <TableRow key={respondent.id}>
                                        <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                            {moment(respondent.created_at).format('DD MMM YYYY HH:mm')}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {respondent.respondent_name}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                                                {respondent.jakpat_id}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            <div className="flex flex-col gap-0.5">
                                                <span>{respondent.contact_info || '-'}</span>
                                                <span className="text-xs text-gray-400">{respondent.e_wallet_number}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {respondent.proof_url ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => window.open(respondent.proof_url, '_blank')}
                                                        title="View Proof"
                                                    >
                                                        <ExternalLink className="h-4 w-4 text-blue-600" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => handleDeleteProof(respondent)}
                                                        disabled={deletingId === respondent.id}
                                                        title="Delete Proof"
                                                    >
                                                        {deletingId === respondent.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t mt-auto">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
