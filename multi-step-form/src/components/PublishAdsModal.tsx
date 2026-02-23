import { useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Loader2, Link as LinkIcon, Clock } from 'lucide-react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { createScheduledAd } from '../utils/supabase';

interface PublishAdsModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: any; // Using any to accept the transformation from InternalDashboard
    onSuccess: () => void;
}

export function PublishAdsModal({ isOpen, onClose, submission, onSuccess }: PublishAdsModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [startDateTime, setStartDateTime] = useState('');
    const [adLink, setAdLink] = useState('');
    const [notes, setNotes] = useState('');

    // Safe accessors handling both data shapes
    const researcherName = submission.researcherName || submission.full_name || '-';
    const researcherEmail = submission.researcherEmail || submission.email || '-';
    const title = submission.formTitle || submission.title || 'Untitled';


    // Ensure duration exists, default to 1 if not present
    const submissionDuration = submission.duration || 1;

    const handlePublish = async () => {
        if (!startDateTime || !adLink) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsLoading(true);
        try {
            // 1. Calculate dates
            const startDateObj = new Date(startDateTime);
            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + submissionDuration);

            // 2. Save to Supabase
            await createScheduledAd({
                form_submission_id: submission.id!,
                start_date: startDateObj.toISOString(),
                end_date: endDateObj.toISOString(),
                ad_link: adLink,
                notes: notes,
                google_calendar_event_id: '', // No longer syncing to GCal
            });



            toast.success('Ad scheduled successfully!');
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error('Publish Error:', error);
            toast.error(error.message || 'Failed to schedule ad');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Publish Ad Schedule</DialogTitle>
                    <DialogDescription>
                        Schedule the ad for "{title}"
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Read-only Info */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg text-sm">
                        <div>
                            <p className="text-muted-foreground mb-1">Researcher</p>
                            <p className="font-medium">{researcherName}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground mb-1">Email</p>
                            <p className="font-medium">{researcherEmail}</p>
                        </div>
                    </div>

                    {/* Schedule Inputs */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Start Date & Time</Label>
                            <div className="relative">
                                <Input
                                    type="datetime-local"
                                    value={startDateTime}
                                    onChange={(e) => setStartDateTime(e.target.value)}
                                    className="pl-9"
                                />
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Duration: <span className="font-medium text-gray-900">{submissionDuration} Days</span> (Synced from submission)
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Ad Link (Bitly/Shortlink)</Label>
                            <div className="relative">
                                <Input
                                    placeholder="https://"
                                    value={adLink}
                                    onChange={(e) => setAdLink(e.target.value)}
                                    className="pl-9"
                                />
                                <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Notes (Optional)</Label>
                            <Textarea
                                placeholder="Additional notes for the team..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handlePublish} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Publishing...
                            </>
                        ) : (
                            'Schedule Ad'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
