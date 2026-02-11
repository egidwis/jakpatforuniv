
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { updateFormDetails } from '../utils/supabase';
import { toast } from 'sonner';

interface EditFormDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: {
        id: string;
        formTitle: string;
        formUrl: string;
        questionCount?: number;
        duration?: number;
    } | null;
    onUpdate: () => void;
}

export function EditFormDetailsModal({ isOpen, onClose, submission, onUpdate }: EditFormDetailsModalProps) {
    const [title, setTitle] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [questionCount, setQuestionCount] = useState('');
    const [duration, setDuration] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (submission) {
            setTitle(submission.formTitle || '');
            setFormUrl(submission.formUrl || '');
            setQuestionCount(submission.questionCount?.toString() || '');
            setDuration(submission.duration?.toString() || '');
        }
    }, [submission]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!submission) return;

        setLoading(true);
        try {
            await updateFormDetails(
                submission.id,
                {
                    title,
                    survey_url: formUrl,
                    question_count: parseInt(questionCount) || 0,
                    duration: parseInt(duration) || 0,
                }
            );
            toast.success('Form details updated successfully');
            onUpdate();
            onClose();
        } catch (error) {
            console.error('Error updating form details:', error);
            toast.error('Failed to update form details');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Edit Form Details</DialogTitle>
                    <DialogDescription>
                        Update the basic information for this survey.
                    </DialogDescription>
                </DialogHeader>

                <form id="edit-form-details" onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Survey Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Survey Preferensi Konsumen"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="url">Survey URL</Label>
                        <Input
                            id="url"
                            value={formUrl}
                            onChange={(e) => setFormUrl(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="q_count">Question Count</Label>
                            <Input
                                id="q_count"
                                type="number"
                                value={questionCount}
                                onChange={(e) => setQuestionCount(e.target.value)}
                                placeholder="10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="duration">Duration (Days)</Label>
                            <Input
                                id="duration"
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                placeholder="3"
                            />
                        </div>
                    </div>
                </form>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" form="edit-form-details" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">
                        {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
