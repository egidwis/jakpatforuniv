
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { updateSubmissionCriteria } from '../utils/supabase';
import { toast } from 'sonner';

interface EditCriteriaModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: {
        id: string;
        criteria?: string;
        prize_per_winner?: number;
        winnerCount?: number;
    } | null;
    onUpdate: () => void;
}

export function EditCriteriaModal({ isOpen, onClose, submission, onUpdate }: EditCriteriaModalProps) {
    const [criteria, setCriteria] = useState('');
    const [prizePerWinner, setPrizePerWinner] = useState('');
    const [winnerCount, setWinnerCount] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (submission) {
            setCriteria(submission.criteria || '');
            setPrizePerWinner(submission.prize_per_winner?.toString() || '');
            setWinnerCount(submission.winnerCount?.toString() || '');
        }
    }, [submission]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!submission) return;

        setLoading(true);
        try {
            await updateSubmissionCriteria(
                submission.id,
                criteria,
                parseInt(prizePerWinner) || 0,
                parseInt(winnerCount) || 0
            );
            toast.success('Criteria & Incentive updated successfully');
            onUpdate();
            onClose();
        } catch (error) {
            console.error('Error updating criteria:', error);
            toast.error('Failed to update criteria');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Edit Criteria & Incentive</DialogTitle>
                    <DialogDescription>
                        Update the target audience criteria and incentive details for this survey.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="criteria">Target Audience Criteria</Label>
                        <Textarea
                            id="criteria"
                            value={criteria}
                            onChange={(e) => setCriteria(e.target.value)}
                            placeholder="e.g. Usia 18-25 tahun, Mahasiswa aktif..."
                            className="min-h-[100px]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="prize">Prize per Winner (Rp)</Label>
                            <Input
                                id="prize"
                                type="number"
                                value={prizePerWinner}
                                onChange={(e) => setPrizePerWinner(e.target.value)}
                                placeholder="25000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="winnerCount">Winner Count</Label>
                            <Input
                                id="winnerCount"
                                type="number"
                                value={winnerCount}
                                onChange={(e) => setWinnerCount(e.target.value)}
                                placeholder="10"
                            />
                        </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Total Incentive:</span>
                            <span className="font-bold text-lg text-gray-900 dark:text-gray-100">
                                Rp {((parseInt(prizePerWinner) || 0) * (parseInt(winnerCount) || 0)).toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
