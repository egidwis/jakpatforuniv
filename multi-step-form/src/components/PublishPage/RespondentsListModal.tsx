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
import { Loader2, ExternalLink, FileText } from 'lucide-react';
import moment from 'moment';

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

    useEffect(() => {
        if (isOpen && pageId) {
            fetchRespondents();
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
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => window.open(respondent.proof_url, '_blank')}
                                                    title="View Proof"
                                                >
                                                    <ExternalLink className="h-4 w-4 text-blue-600" />
                                                </Button>
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
