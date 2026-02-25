import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { createScheduledAd, getScheduledAds } from '../utils/supabase';

// Max 3 ads per day
const MAX_ADS_PER_DAY = 3;

interface PublishAdsModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: any;
    pageSlug?: string;
    onSuccess: () => void;
}

export function PublishAdsModal({ isOpen, onClose, submission, pageSlug, onSuccess }: PublishAdsModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingAds, setIsFetchingAds] = useState(false);

    // Form state
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [startTime, setStartTime] = useState<string>('15:00');

    // We need to count ads per date string "YYYY-MM-DD"
    const [adCountsByDate, setAdCountsByDate] = useState<Record<string, number>>({});

    // Safe accessors
    const researcherName = submission.researcherName || submission.full_name || '-';
    const universityName = submission.university || '-';
    const title = submission.formTitle || submission.title || 'Untitled';
    const submissionDuration = submission.duration || 1;

    // Reset state & fetch ads when opened
    useEffect(() => {
        if (isOpen) {
            setStartDate(null);
            setStartTime('15:00');
            fetchExistingAds();
        }
    }, [isOpen]);

    const fetchExistingAds = async () => {
        setIsFetchingAds(true);
        try {
            const ads = await getScheduledAds();
            const counts: Record<string, number> = {};

            ads.forEach((ad: any) => {
                if (ad.start_date && ad.form_submission_id !== submission.id) {
                    // Ignore this submission's own schedule if editing, 
                    // and parse date using standard format (to local YYYY-MM-DD)
                    const dateObj = new Date(ad.start_date);
                    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                    counts[dateStr] = (counts[dateStr] || 0) + 1;
                }
            });

            setAdCountsByDate(counts);
        } catch (error) {
            console.error("Failed to fetch ads for capacity checking:", error);
            toast.error("Failed to check schedule capacity.");
        } finally {
            setIsFetchingAds(false);
        }
    };

    const getDateString = (date: Date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    // Generate next 14 days
    const getNext14Days = () => {
        const dates = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            dates.push(d);
        }
        return dates;
    };
    const availableDates = getNext14Days();

    // Generate time slots (every 15 minutes, from 00:00 to 23:45)
    const timeSlots = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            const hour = String(h).padStart(2, '0');
            const minute = String(m).padStart(2, '0');
            timeSlots.push(`${hour}:${minute}`);
        }
    }

    // Calculate End Date for display
    let calculatedEndDateStr = '-';
    if (startDate) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const startObj = new Date(startDate);
        startObj.setHours(hours, minutes, 0, 0);

        const endObj = new Date(startObj);
        endObj.setDate(endObj.getDate() + submissionDuration);

        calculatedEndDateStr = `${endObj.toLocaleDateString('id-ID')} pada ${endObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    }

    const handlePublish = async () => {
        if (!startDate || !startTime) {
            toast.error('Please select both start date and time');
            return;
        }

        setIsLoading(true);
        try {
            // 1. Calculate dates
            const [hours, minutes] = startTime.split(':').map(Number);
            const startDateObj = new Date(startDate);
            startDateObj.setHours(hours, minutes, 0, 0);

            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + submissionDuration);

            const adLink = pageSlug ? `https://jakpatforuniv.com/pages/${pageSlug}` : '';

            // 2. Save to Supabase
            await createScheduledAd({
                form_submission_id: submission.id!,
                start_date: startDateObj.toISOString(),
                end_date: endDateObj.toISOString(),
                ad_link: adLink,
                notes: '', // Notes removed from UI
                google_calendar_event_id: '',
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
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Book Ad Schedule</DialogTitle>
                    <DialogDescription>
                        Schedule the ad for "{title}"
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2">
                    {/* Read-only Info */}
                    <div className="flex flex-row gap-4 items-center p-3 bg-slate-50/50 rounded-lg border border-slate-100 shadow-sm">
                        <div className="flex-1">
                            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Researcher</p>
                            <p className="text-sm font-medium text-slate-900">{researcherName}</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-0.5">University</p>
                            <p className="text-sm text-slate-600 truncate" title={universityName}>{universityName}</p>
                        </div>
                    </div>



                    {/* Schedule Inputs */}
                    <div className="flex flex-col gap-4">
                        {/* Left: Date Picker */}
                        <div className="space-y-2">
                            <Label className="flex items-center justify-between">
                                <span>Select Date</span>
                                {isFetchingAds && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                            </Label>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 py-1 px-1">
                                {availableDates.map((date) => {
                                    const dateStr = getDateString(date);
                                    const count = adCountsByDate[dateStr] || 0;
                                    const isFull = count >= MAX_ADS_PER_DAY;
                                    const isSelected = startDate && getDateString(startDate) === dateStr;

                                    let statusColors = 'bg-white border-slate-200 hover:border-blue-400 shadow-sm';
                                    if (isFull) {
                                        statusColors = 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
                                    } else if (isSelected) {
                                        statusColors = 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md';
                                    }

                                    let dotColor = 'bg-emerald-500';
                                    if (isFull) dotColor = 'bg-red-500';
                                    else if (count > 0) dotColor = 'bg-amber-500';

                                    return (
                                        <button
                                            key={dateStr}
                                            type="button"
                                            disabled={isFull}
                                            onClick={() => setStartDate(date)}
                                            className={`flex flex-col items-center justify-center p-1 h-[76px] rounded-xl border transition-all text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${statusColors}`}
                                        >
                                            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                                                {date.toLocaleDateString('id-ID', { weekday: 'short' })}
                                            </span>
                                            <span className={`font-extrabold text-[15px] leading-tight mb-1 ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                                                {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                            </span>
                                            <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                                                <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                                                <span className={`text-[9px] font-semibold ${isFull ? 'text-red-700' : 'text-slate-600'}`}>
                                                    {count}/{MAX_ADS_PER_DAY}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom: Time & Summary in vertical stack */}
                        <div className="flex flex-col gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm">Start Time (WIB)</Label>
                                <Select value={startTime} onValueChange={setStartTime}>
                                    <SelectTrigger>
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                            <SelectValue placeholder="Select time..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {timeSlots.map((time) => (
                                            <SelectItem key={time} value={time}>
                                                {time} WIB
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 p-3 bg-gray-50 rounded-md border border-gray-100">
                                <Label className="text-xs text-gray-500 uppercase tracking-wider">Schedule Summary</Label>

                                <div className="flex flex-row overflow-x-auto gap-2 mt-1 text-sm custom-scrollbar pb-1">
                                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2 rounded-md border border-gray-100 shadow-sm">
                                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Start Date</span>
                                        <span className="font-bold text-gray-900">
                                            {startDate
                                                ? `${startDate.toLocaleDateString('id-ID')} ${startTime}`
                                                : '-'}
                                        </span>
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2 rounded-md border border-gray-100 shadow-sm">
                                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Duration</span>
                                        <span className="font-bold text-gray-900">{submissionDuration} Days</span>
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2 rounded-md border border-gray-100 shadow-sm">
                                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">End Date</span>
                                        <span className="font-bold text-gray-900">
                                            {startDate ? calculatedEndDateStr.replace(' pada ', ' ').replace(' WIB', '') : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handlePublish} disabled={isLoading || !startDate} className="bg-blue-600 hover:bg-blue-700">
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Booking Slot...
                            </>
                        ) : (
                            'Book Schedule'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
