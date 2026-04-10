import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Clock, Info } from 'lucide-react';
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
import { supabase, updateScheduleDates, updateFormStatus } from '../utils/supabase';

// Max 3 regular ads per day, 1 extra ad per day
const MAX_ADS_PER_DAY = 3;
const MAX_EXTRA_ADS_PER_DAY = 1;

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
    const [existingAdId, setExistingAdId] = useState<string | null>(null);
    const [existingIsExtra, setExistingIsExtra] = useState(false);

    // Form state
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [startTime, setStartTime] = useState<string>('15:00');

    // Extra Ad toggle
    const [isExtraMode, setIsExtraMode] = useState(false);

    // We need to count ads per date string "YYYY-MM-DD" — separate for regular and extra
    const [regularCountsByDate, setRegularCountsByDate] = useState<Record<string, number>>({});
    const [extraCountsByDate, setExtraCountsByDate] = useState<Record<string, number>>({});

    // Safe accessors
    const researcherName = submission.researcherName || submission.full_name || '-';
    const universityName = submission.university || '-';
    const title = submission.formTitle || submission.title || 'Untitled';
    const submissionDuration = submission.duration || 1;

    // Active counts based on mode
    const activeCountsByDate = isExtraMode ? extraCountsByDate : regularCountsByDate;
    const activeMaxPerDay = isExtraMode ? MAX_EXTRA_ADS_PER_DAY : MAX_ADS_PER_DAY;

    // Reset state & fetch ads when opened
    useEffect(() => {
        if (isOpen) {
            setStartDate(null);
            setStartTime('15:00');
            setExistingAdId(null);
            setExistingIsExtra(false);
            setIsExtraMode(false);
            fetchExistingAds();
            fetchMySchedule();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, submission?.id]);

    const fetchMySchedule = async () => {
        if (!submission?.id) return;
        try {
            // Check if this submission already has dates set (slot reserved)
            const existingStartDate = submission.start_date;
            if (existingStartDate) {
                setExistingAdId(submission.id); // Use submission ID as reference
                // Check if there's a survey_pages record to determine extra ad status
                const { data: page } = await supabase
                    .from('survey_pages')
                    .select('is_extra_ad')
                    .eq('submission_id', submission.id)
                    .maybeSingle();
                const isExtra = !!page?.is_extra_ad;
                setExistingIsExtra(isExtra);
                setIsExtraMode(isExtra);

                const dateObj = new Date(existingStartDate);
                setStartDate(dateObj);
                const hours = String(dateObj.getHours()).padStart(2, '0');
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                setStartTime(`${hours}:${minutes}`);
            }
        } catch (e) {
            console.error('Error fetching my schedule:', e);
        }
    };

    const fetchExistingAds = async () => {
        setIsFetchingAds(true);
        try {
            // Fetch all submissions that have dates set (active slots)
            // Exclude rejected, spam, and in_review statuses
            const { data: slotsFromSubmissions, error: subError } = await supabase
                .from('form_submissions')
                .select('id, start_date, end_date, submission_status')
                .not('start_date', 'is', null)
                .not('submission_status', 'in', '("rejected","spam","in_review")');

            if (subError) throw subError;

            // Also fetch is_extra_ad from survey_pages for these submissions
            const subIds = (slotsFromSubmissions || []).map((s: any) => s.id);
            let extraAdMap: Record<string, boolean> = {};
            if (subIds.length > 0) {
                const { data: pages } = await supabase
                    .from('survey_pages')
                    .select('submission_id, is_extra_ad')
                    .in('submission_id', subIds);
                if (pages) {
                    pages.forEach((p: any) => { extraAdMap[p.submission_id] = !!p.is_extra_ad; });
                }
            }

            const regularCounts: Record<string, number> = {};
            const extraCounts: Record<string, number> = {};

            (slotsFromSubmissions || []).forEach((slot: any) => {
                if (slot.start_date && slot.end_date && slot.id !== submission.id) {
                    const current = new Date(slot.start_date);
                    current.setHours(0, 0, 0, 0);
                    const endDay = new Date(slot.end_date);
                    endDay.setHours(0, 0, 0, 0);

                    const isExtra = extraAdMap[slot.id] || false;
                    const targetCounts = isExtra ? extraCounts : regularCounts;

                    while (current < endDay) {
                        const dateStr = getDateString(current);
                        targetCounts[dateStr] = (targetCounts[dateStr] || 0) + 1;
                        current.setDate(current.getDate() + 1);
                    }
                }
            });

            setRegularCountsByDate(regularCounts);
            setExtraCountsByDate(extraCounts);
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

        // Validate that ALL days in the booking range have capacity
        const [valHours, valMinutes] = startTime.split(':').map(Number);
        const valStart = new Date(startDate);
        valStart.setHours(valHours, valMinutes, 0, 0);
        const valEnd = new Date(valStart);
        valEnd.setDate(valEnd.getDate() + submissionDuration);

        const checkDay = new Date(valStart);
        checkDay.setHours(0, 0, 0, 0);
        const checkEndDay = new Date(valEnd);
        checkEndDay.setHours(0, 0, 0, 0);

        while (checkDay < checkEndDay) {
            const dayStr = getDateString(checkDay);
            const dayCount = activeCountsByDate[dayStr] || 0;
            if (dayCount >= activeMaxPerDay) {
                const typeLabel = isExtraMode ? 'Extra Ad' : 'iklan';
                toast.error(`Tanggal ${checkDay.toLocaleDateString('id-ID')} sudah penuh (${activeMaxPerDay}/${activeMaxPerDay} ${typeLabel}). Pilih tanggal lain.`);
                return;
            }
            checkDay.setDate(checkDay.getDate() + 1);
        }

        setIsLoading(true);
        try {
            // 1. Calculate dates
            const [hours, minutes] = startTime.split(':').map(Number);
            const startDateObj = new Date(startDate);
            startDateObj.setHours(hours, minutes, 0, 0);

            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + submissionDuration);

            // 2. Save dates to form_submissions + sync to survey_pages (if page exists)
            await updateScheduleDates(
                submission.id!,
                startDateObj.toISOString(),
                endDateObj.toISOString()
            );

            // 3. Update submission status to 'slot_reserved'
            await updateFormStatus(submission.id!, 'slot_reserved');

            // 4. Sync is_extra_ad flag to survey_pages (if page exists)
            // Mobile app sorts by created_at DESC, so shifting Extra Ad back by 1 hour
            // pushes it below regular ads in the listing.
            const syncData: Record<string, any> = { is_extra_ad: isExtraMode };
            if (isExtraMode) {
                syncData.created_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            }

            if (pageSlug) {
                await supabase
                    .from('survey_pages')
                    .update(syncData)
                    .eq('slug', pageSlug);
            } else if (submission.id) {
                await supabase
                    .from('survey_pages')
                    .update(syncData)
                    .eq('submission_id', submission.id);
            }

            toast.success('Slot reserved successfully!');
            onSuccess();
            onClose();

        } catch (error: any) {
            console.error('Publish Error:', error);
            toast.error(error.message || 'Failed to reserve slot');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelSchedule = async () => {
        if (!submission?.id) return;
        setIsLoading(true);
        try {
            // Clear dates from form_submissions
            await supabase
                .from('form_submissions')
                .update({ start_date: null, end_date: null, updated_at: new Date().toISOString() })
                .eq('id', submission.id);

            // Clear dates from survey_pages + reset is_extra_ad
            await supabase
                .from('survey_pages')
                .update({ publish_start_date: null, publish_end_date: null, is_extra_ad: false, updated_at: new Date().toISOString() })
                .eq('submission_id', submission.id);

            // Reset status back to 'approved'
            await updateFormStatus(submission.id, 'approved');

            toast.success('Slot reservation cancelled.');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Cancel Error:', error);
            toast.error('Failed to cancel reservation');
        } finally {
            setIsLoading(false);
        }
    };

    // Reset date selection when toggling mode (unless editing existing)
    const handleModeToggle = (extra: boolean) => {
        setIsExtraMode(extra);
        // Only reset date if not editing existing schedule with same mode
        if (!existingAdId || existingIsExtra !== extra) {
            setStartDate(null);
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

                    {/* Ad Type Toggle */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ad Type</Label>
                        <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                            <button
                                type="button"
                                onClick={() => handleModeToggle(false)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                                    !isExtraMode
                                        ? 'bg-white shadow-sm text-blue-700 ring-1 ring-blue-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Regular Ad
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    !isExtraMode ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                                }`}>
                                    max {MAX_ADS_PER_DAY}/day
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeToggle(true)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                                    isExtraMode
                                        ? 'bg-white shadow-sm text-amber-700 ring-1 ring-amber-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Extra Ad
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isExtraMode ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'
                                }`}>
                                    max {MAX_EXTRA_ADS_PER_DAY}/day
                                </span>
                            </button>
                        </div>

                        {/* Extra Ad info banner */}
                        {isExtraMode && (
                            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>Extra Ad akan ditampilkan di <strong>posisi paling bawah</strong> pada daftar survei publik.</span>
                            </div>
                        )}
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
                                    const count = activeCountsByDate[dateStr] || 0;
                                    const isFull = count >= activeMaxPerDay;
                                    const isSelected = startDate && getDateString(startDate) === dateStr;

                                    let statusColors = 'bg-white border-slate-200 hover:border-blue-400 shadow-sm';
                                    if (isFull) {
                                        statusColors = 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
                                    } else if (isSelected) {
                                        statusColors = isExtraMode
                                            ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600 shadow-md'
                                            : 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md';
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
                                            <span className={`font-extrabold text-[15px] leading-tight mb-1 ${isSelected ? (isExtraMode ? 'text-amber-900' : 'text-blue-900') : 'text-slate-800'}`}>
                                                {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                            </span>
                                            <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                                                <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                                                <span className={`text-[9px] font-semibold ${isFull ? 'text-red-700' : 'text-slate-600'}`}>
                                                    {count}/{activeMaxPerDay}
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
                    {existingAdId && (
                        <Button variant="destructive" onClick={handleCancelSchedule} disabled={isLoading} className="mr-auto">
                            Remove Schedule
                        </Button>
                    )}
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handlePublish} disabled={isLoading || !startDate} className={isExtraMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Booking Slot...
                            </>
                        ) : (
                            isExtraMode ? 'Book Extra Slot' : 'Book Schedule'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
