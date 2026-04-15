import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Clock, Info, ArrowLeft, ChevronRight, Plus, Trash2, Copy, Check, CreditCard, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { supabase, updateScheduleDates, updateFormStatus, createInvoice, createTransaction, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, fetchSlotAvailability } from '../utils/supabase';
import type { Invoice, Transaction } from '../utils/supabase';
import { createManualInvoice } from '../utils/payment';
import { calculateAdCostPerDay, calculateTotalAdCost, calculateIncentiveCost, calculateDiscount } from '../utils/cost-calculator';

// Max 3 regular ads per day, 1 extra ad per day
const MAX_ADS_PER_DAY = 3;
const MAX_EXTRA_ADS_PER_DAY = 1;

interface SchedulePaymentViewProps {
    submission: {
        id: string;
        formTitle: string;
        researcherName: string;
        researcherEmail: string;
        university?: string;
        duration?: number;
        start_date?: string;
        end_date?: string;
        questionCount: number;
        winnerCount?: number;
        prize_per_winner?: number;
        voucher_code?: string;
        phone_number?: string;
    };
    existingPageSlug?: string;
    initialStep?: 'schedule' | 'payment';
    onBack: () => void;
}

interface InvoiceItem {
    id: string;
    name: string;
    qty: number;
    price: number;
    category: string;
}

export function SchedulePaymentView({ submission, existingPageSlug, initialStep = 'schedule', onBack }: SchedulePaymentViewProps) {
    // ==================== STEP NAV ====================
    const [currentStep, setCurrentStep] = useState<'schedule' | 'payment'>(initialStep);

    // ==================== SCHEDULE STATE ====================
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingAds, setIsFetchingAds] = useState(false);
    const [existingAdId, setExistingAdId] = useState<string | null>(null);
    const [existingIsExtra, setExistingIsExtra] = useState(false);

    const [startDate, setStartDate] = useState<Date | null>(null);
    const [startTime, setStartTime] = useState<string>('15:00');
    const [isExtraMode, setIsExtraMode] = useState(false);

    const [regularCountsByDate, setRegularCountsByDate] = useState<Record<string, number>>({});
    const [extraCountsByDate, setExtraCountsByDate] = useState<Record<string, number>>({});

    const submissionDuration = submission.duration || 1;
    const calendarRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const clickedOutsideCalendar = calendarRef.current && !calendarRef.current.contains(event.target as Node);
            const clickedOutsideNav = navRef.current && !navRef.current.contains(event.target as Node);
            if (clickedOutsideCalendar && clickedOutsideNav) {
                setStartDate(null);
            }
        }
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);
    const activeCountsByDate = isExtraMode ? extraCountsByDate : regularCountsByDate;
    const activeMaxPerDay = isExtraMode ? MAX_EXTRA_ADS_PER_DAY : MAX_ADS_PER_DAY;

    // ==================== PAYMENT STATE ====================
    const [items, setItems] = useState<InvoiceItem[]>([]);
    const [note, setNote] = useState('');
    const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
    const [existingInvoices, setExistingInvoices] = useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [totalAmount, setTotalAmount] = useState(0);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showNewInvoiceForm, setShowNewInvoiceForm] = useState(false);

    // ==================== SCHEDULE LOGIC ====================

    useEffect(() => {
        fetchExistingAds();
        fetchMySchedule();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submission?.id]);

    // When switching to payment step, load invoices & pre-populate items
    useEffect(() => {
        if (currentStep === 'payment') {
            fetchExistingInvoices();
            initializeInvoiceItems();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep]);

    // Recalculate total whenever items change
    useEffect(() => {
        const total = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
        setTotalAmount(total);
    }, [items]);

    const fetchMySchedule = async () => {
        if (!submission?.id) return;
        try {
            const existingStartDate = submission.start_date;
            if (existingStartDate) {
                setExistingAdId(submission.id);
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
                // Convert to WIB (UTC+7) for display
                // If the stored date is a date-only string (no 'T'), default to 15:00 WIB
                const storedStr = String(existingStartDate);
                if (!storedStr.includes('T')) {
                    setStartTime('15:00');
                } else {
                    const wibFormatter = new Intl.DateTimeFormat('en-GB', {
                        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta'
                    });
                    setStartTime(wibFormatter.format(dateObj));
                }
            }
        } catch (e) {
            console.error('Error fetching my schedule:', e);
        }
    };

    const fetchExistingAds = async () => {
        setIsFetchingAds(true);
        try {
            const { regularCounts, extraCounts } = await fetchSlotAvailability(submission.id);
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

    const timeSlots: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            timeSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    }

    let calculatedEndDateStr = '-';
    let endDateObj: Date | null = null;
    if (startDate) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const startObj = new Date(startDate);
        startObj.setHours(hours, minutes, 0, 0);
        const endObj = new Date(startObj);
        endObj.setDate(endObj.getDate() + submissionDuration);
        endDateObj = endObj;
        calculatedEndDateStr = `${endObj.toLocaleDateString('id-ID')} ${endObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    }

    const handleBookSchedule = async () => {
        if (!startDate || !startTime) {
            toast.error('Silakan pilih tanggal dan waktu');
            return;
        }

        // Guard: submission must be approved before slot reservation
        try {
            const { data: currentSub, error } = await supabase
                .from('form_submissions')
                .select('submission_status')
                .eq('id', submission.id)
                .single();
            
            if (error) throw error;
            
            const status = currentSub?.submission_status || 'in_review';
            const validStatuses = ['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'];
            if (!validStatuses.includes(status)) {
                toast.error('Submission harus di-approve terlebih dahulu sebelum menjadwalkan slot.');
                return;
            }
        } catch (err) {
             console.error("Failed to check submission status", err);
             toast.error("Gagal memvalidasi status submission.");
             return;
        }

        // Validate capacity
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
            const [hours, minutes] = startTime.split(':').map(Number);
            const startDateObj = new Date(startDate);
            startDateObj.setHours(hours, minutes, 0, 0);

            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + submissionDuration);

            await updateScheduleDates(
                submission.id!,
                startDateObj.toISOString(),
                endDateObj.toISOString()
            );

            await updateFormStatus(submission.id!, 'slot_reserved');

            // Set slot_booked_by to 'admin'
            await supabase
                .from('form_submissions')
                .update({ 
                    slot_booked_by: 'admin', 
                    slot_reserved_at: new Date().toISOString() 
                })
                .eq('id', submission.id);

            // Sync is_extra_ad flag to survey_pages
            const syncData: Record<string, any> = { is_extra_ad: isExtraMode };
            if (isExtraMode) {
                syncData.created_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            }

            if (existingPageSlug) {
                await supabase
                    .from('survey_pages')
                    .update(syncData)
                    .eq('slug', existingPageSlug);
            } else if (submission.id) {
                await supabase
                    .from('survey_pages')
                    .update(syncData)
                    .eq('submission_id', submission.id);
            }

            setExistingAdId(submission.id);
            toast.success('Slot berhasil di-booking!');

            // Auto-transition to payment step
            setCurrentStep('payment');
        } catch (error: any) {
            console.error('Book Error:', error);
            toast.error(error.message || 'Gagal booking slot');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelSchedule = async () => {
        if (!submission?.id) return;
        setIsLoading(true);
        try {
            await supabase
                .from('form_submissions')
                .update({ 
                    start_date: null, 
                    end_date: null, 
                    slot_booked_by: null,
                    slot_reserved_at: null,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', submission.id);

            await supabase
                .from('survey_pages')
                .update({ publish_start_date: null, publish_end_date: null, is_extra_ad: false, updated_at: new Date().toISOString() })
                .eq('submission_id', submission.id);

            await updateFormStatus(submission.id, 'approved');

            toast.success('Reservasi slot dibatalkan.');
            setExistingAdId(null);
            setStartDate(null);
            setStartTime('15:00');
            setIsExtraMode(false);
        } catch (error: any) {
            console.error('Cancel Error:', error);
            toast.error('Gagal membatalkan reservasi');
        } finally {
            setIsLoading(false);
        }
    };

    const handleModeToggle = (extra: boolean) => {
        setIsExtraMode(extra);
        if (!existingAdId || existingIsExtra !== extra) {
            setStartDate(null);
        }
    };

    // ==================== PAYMENT LOGIC ====================

    const initializeInvoiceItems = useCallback(() => {
        const duration = submission.duration || 0;
        const questionCount = submission.questionCount || 0;
        const winnerCount = submission.winnerCount || 0;
        const prizePerWinner = submission.prize_per_winner || 0;

        if (submission.voucher_code?.toUpperCase() === 'JFUTGRX') {
            setItems([{
                id: Date.now().toString(),
                name: 'System Testing Fee (JFUTGRX)',
                qty: 1,
                price: 1000,
                category: 'Lainnya'
            }]);
            setNote('Testing Voucher JFUTGRX Applied');
            return;
        }

        const invoiceItems: InvoiceItem[] = [];
        const costPerDay = calculateAdCostPerDay(questionCount);
        const adCost = costPerDay * duration;
        const incentiveCost = calculateIncentiveCost(winnerCount, prizePerWinner);
        const discount = calculateDiscount(submission.voucher_code, adCost, incentiveCost, duration);

        if (costPerDay > 0 && duration > 0) {
            // If there's a discount, apply it to the per-day rate for cleaner display
            const discountedPerDay = discount > 0 ? Math.max(0, costPerDay - Math.ceil(discount / duration)) : costPerDay;
            invoiceItems.push({
                id: Date.now().toString() + '0',
                name: 'Jakpat for University (ads)',
                qty: duration,
                price: discountedPerDay,
                category: 'Jakpat for University (ads)'
            });
        }
        if (prizePerWinner > 0 && winnerCount > 0) {
            invoiceItems.push({
                id: Date.now().toString() + '1',
                name: "Respondent's Incentive",
                qty: winnerCount,
                price: prizePerWinner,
                category: "Respondent's Incentive"
            });
        }

        if (invoiceItems.length === 0) {
            invoiceItems.push({
                id: Date.now().toString(),
                name: 'Jakpat for University (ads)',
                qty: 1,
                price: 0,
                category: 'Jakpat for University (ads)'
            });
        }

        setItems(invoiceItems);
        setNote('');
    }, [submission]);

    const fetchExistingInvoices = async () => {
        if (!submission?.id) return;
        setIsLoadingInvoices(true);
        try {
            let data = await getInvoicesByFormSubmissionId(submission.id);
            if (!data || data.length === 0) {
                const txData = await getTransactionsByFormSubmissionId(submission.id);
                if (txData && txData.length > 0) {
                    data = txData.map((tx: any) => ({
                        id: tx.id,
                        payment_id: tx.payment_id,
                        status: tx.status,
                        amount: tx.amount,
                        invoice_url: tx.payment_url,
                        created_at: tx.created_at,
                    }));
                }
            }
            setExistingInvoices(data || []);
            if (!data || data.length === 0) {
                setShowNewInvoiceForm(true);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setIsLoadingInvoices(false);
        }
    };

    const handleAddItem = () => {
        setItems([...items, { id: Date.now().toString(), name: '', qty: 1, price: 0, category: 'Lainnya' }]);
    };

    const handleRemoveItem = (id: string) => {
        if (items.length === 1) {
            toast.error('Minimal satu item diperlukan');
            return;
        }
        setItems(items.filter(item => item.id !== id));
    };

    const handleItemChange = (id: string, field: keyof InvoiceItem, value: string | number) => {
        setItems(items.map(item => {
            if (item.id === id) {
                const updates: Partial<InvoiceItem> = { [field]: value };
                if (field === 'category') {
                    if (value !== 'Lainnya') {
                        updates.name = value as string;
                    } else {
                        updates.name = '';
                    }
                }
                return { ...item, ...updates };
            }
            return item;
        }));
    };

    const handleCreateInvoice = async () => {
        try {
            setIsCreatingInvoice(true);

            const invalidItems = items.filter(item => !item.name.trim() || item.price < 0 || item.qty < 1);
            if (invalidItems.length > 0) {
                toast.error('Mohon lengkapi semua data item dengan benar');
                return;
            }

            if (totalAmount <= 0) {
                toast.error('Total invoice harus lebih dari 0');
                return;
            }

            const itemSummary = items.map(item => `${item.name} (${item.qty}x)`).join(', ');
            const description = note.trim() ? `${itemSummary} - ${note.trim()}` : itemSummary;

            const noteData = {
                memo: note.trim(),
                items: items.map(({ name, qty, price, category }) => ({ name, qty, price, category }))
            };
            const noteJson = JSON.stringify(noteData);

            const mayarResponse = await createManualInvoice({
                formSubmissionId: submission.id,
                amount: totalAmount,
                description,
                customerInfo: {
                    fullName: submission.researcherName,
                    email: submission.researcherEmail,
                    phoneNumber: submission.phone_number || ''
                }
            });

            const invoiceData: Invoice = {
                form_submission_id: submission.id,
                payment_id: mayarResponse.payment_id,
                invoice_url: mayarResponse.invoice_url,
                amount: totalAmount,
                status: 'pending'
            };

            await createInvoice(invoiceData);

            const transactionData: Transaction = {
                form_submission_id: submission.id,
                payment_id: mayarResponse.payment_id,
                payment_method: 'mayar_manual_invoice',
                amount: totalAmount,
                status: 'pending',
                payment_url: mayarResponse.invoice_url,
                note: noteJson
            };

            await createTransaction(transactionData);

            toast.success('Invoice berhasil dibuat!');
            fetchExistingInvoices(); // Refresh invoice list
            initializeInvoiceItems(); // Reset form
            setShowNewInvoiceForm(false); // Hide form after creating
        } catch (error) {
            console.error('Error creating invoice:', error);
            toast.error(error instanceof Error ? error.message : 'Gagal membuat invoice');
        } finally {
            setIsCreatingInvoice(false);
        }
    };

    const copyToClipboard = async (invoiceUrl: string, paymentId: string) => {
        try {
            await navigator.clipboard.writeText(invoiceUrl);
            setCopiedId(paymentId);
            toast.success('Link invoice berhasil disalin!');
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            toast.error('Gagal menyalin link');
        }
    };

    const formatDate = (dateString: string) => {
        return new Intl.DateTimeFormat('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(dateString));
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case 'paid': case 'completed':
                return <Badge className="bg-green-500 text-white text-[10px]">Lunas</Badge>;
            case 'pending':
                return <Badge className="bg-yellow-500 text-white text-[10px]">Pending</Badge>;
            case 'expired':
                return <Badge className="bg-gray-500 text-white text-[10px]">Expired</Badge>;
            default:
                return <Badge className="bg-gray-500 text-white text-[10px]">{status}</Badge>;
        }
    };

    // ==================== RENDER ====================
    return (
        <div className="flex flex-col h-full w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Floating Header - Sticky */}
            <div className="border-b border-gray-200 bg-white/95 backdrop-blur-md sticky top-0 z-20 shrink-0 shadow-sm px-6 py-4 flex flex-col gap-2.5">
                {/* Row 1: Breadcrumb */}
                <div className="flex items-center">
                    <button
                        onClick={onBack}
                        className="mr-3 p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900"
                        title="Kembali ke Submissions"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <nav className="flex items-center text-sm font-medium text-gray-500 overflow-hidden w-full">
                        <span className="hover:text-blue-600 cursor-pointer hover:underline" onClick={onBack}>Submissions</span>
                        <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                        <span
                            className={`${currentStep === 'schedule' ? 'text-gray-900 font-semibold' : 'hover:text-blue-600 cursor-pointer hover:underline'} shrink-0`}
                            onClick={() => currentStep === 'payment' && setCurrentStep('schedule')}
                        >
                            Schedule
                        </span>
                        {currentStep === 'payment' && (
                            <>
                                <ChevronRight className="w-4 h-4 mx-2 shrink-0 text-gray-400" />
                                <span className="text-gray-900 font-semibold shrink-0">Payment</span>
                            </>
                        )}
                    </nav>
                </div>

                {/* Row 2: Submission Info */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                    <h2 className="text-lg font-semibold text-gray-900">{submission.formTitle}</h2>
                    <span className="text-gray-300">|</span>
                    <span className="text-sm text-gray-600">{submission.researcherName}</span>
                    {submission.university && (
                        <>
                            <span className="text-gray-300">·</span>
                            <span className="text-sm text-gray-500">{submission.university}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                {currentStep === 'schedule' ? (
                    /* ==================== SCHEDULE STEP ==================== */
                    <div className="max-w-3xl mx-auto space-y-6">
                        {/* Ad Type Toggle */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ad Type</Label>
                            <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                                <button
                                    type="button"
                                    onClick={() => handleModeToggle(false)}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-all ${!isExtraMode
                                        ? 'bg-white shadow-sm text-blue-700 ring-1 ring-blue-200'
                                        : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Regular Ad
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${!isExtraMode ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                                        max {MAX_ADS_PER_DAY}/day
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleModeToggle(true)}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-all ${isExtraMode
                                        ? 'bg-white shadow-sm text-amber-700 ring-1 ring-amber-200'
                                        : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Extra Ad
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isExtraMode ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>
                                        max {MAX_EXTRA_ADS_PER_DAY}/day
                                    </span>
                                </button>
                            </div>
                            {isExtraMode && (
                                <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>Extra Ad akan ditampilkan di <strong>posisi paling bawah</strong> pada daftar survei publik.</span>
                                </div>
                            )}
                        </div>

                        {/* Date Picker */}
                        <div className="space-y-2">
                            <Label className="flex items-center justify-between">
                                <span>Select Date</span>
                                {isFetchingAds && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                            </Label>
                            <div ref={calendarRef} className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 py-1 px-1">
                                {availableDates.map((date, i) => {
                                    const dateStr = getDateString(date);
                                    const baseCount = activeCountsByDate[dateStr] || 0;
                                    const isFull = baseCount >= activeMaxPerDay;

                                    const selectedIndex = startDate ? availableDates.findIndex(d => getDateString(d) === getDateString(startDate)) : -1;
                                    const isSelectedInRange = selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + submissionDuration;

                                    const displayCount = isSelectedInRange ? baseCount + 1 : baseCount;

                                    let statusColors = 'bg-white border-slate-200 hover:border-blue-400 shadow-sm';
                                    let textColor = 'text-slate-800';

                                    if (isSelectedInRange) {
                                        if (displayCount > activeMaxPerDay) {
                                            statusColors = 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-md';
                                            textColor = 'text-red-900';
                                        } else {
                                            statusColors = isExtraMode
                                                ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600 shadow-md'
                                                : 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md';
                                            textColor = isExtraMode ? 'text-amber-900' : 'text-blue-900';
                                        }
                                    } else if (isFull) {
                                        statusColors = 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
                                    }

                                    const dotColor = displayCount > activeMaxPerDay ? 'bg-red-500' : isFull && !isSelectedInRange ? 'bg-red-500' : displayCount > 0 ? 'bg-amber-500' : 'bg-emerald-500';

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
                                            <span className={`font-extrabold text-[15px] leading-tight mb-1 ${textColor}`}>
                                                {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                            </span>
                                            <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                                                <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                                                <span className={`text-[9px] font-semibold ${displayCount > activeMaxPerDay ? 'text-red-700' : isFull && !isSelectedInRange ? 'text-red-700' : 'text-slate-600'}`}>
                                                    {displayCount}/{activeMaxPerDay}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Time Selector */}
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

                        {/* Schedule Summary */}
                        <div className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <Label className="text-xs text-gray-500 uppercase tracking-wider">Schedule Summary</Label>
                            <div className="flex flex-row overflow-x-auto gap-2 mt-1 text-sm pb-1">
                                <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                                    <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Start Date</span>
                                    <span className="font-bold text-gray-900">
                                        {startDate ? `${startDate.toLocaleDateString('id-ID')} ${startTime}` : '-'}
                                    </span>
                                </div>
                                <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                                    <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Duration</span>
                                    <span className="font-bold text-gray-900">{submissionDuration} Days</span>
                                </div>
                                <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                                    <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">End Date</span>
                                    <span className="font-bold text-gray-900">
                                        {startDate ? calculatedEndDateStr.replace(' WIB', '') : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div ref={navRef} className="flex items-center justify-between pt-2">
                            {existingAdId && (
                                <Button variant="destructive" onClick={handleCancelSchedule} disabled={isLoading}>
                                    Remove Schedule
                                </Button>
                            )}
                            <div className="flex items-center gap-3 ml-auto">
                                <Button variant="outline" onClick={onBack} disabled={isLoading}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleBookSchedule}
                                    disabled={isLoading || !startDate}
                                    className={isExtraMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Booking...
                                        </>
                                    ) : (
                                        <>
                                            <Calendar className="mr-2 h-4 w-4" />
                                            {existingAdId ? 'Update Schedule' : 'Book Schedule'}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ==================== PAYMENT STEP ==================== */
                    <div className="max-w-3xl mx-auto space-y-6">
                        {/* Schedule Preview & Edit Schedule */}
                        <div className="flex items-center justify-between bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                            <div className="flex items-center gap-4 text-left">
                                <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Reserved Slot</p>
                                    <p className="text-[14px] font-semibold text-gray-900">
                                        {startDate && endDateObj ? `${startDate.toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})} - ${endDateObj.toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}` : 'Belum ada jadwal'}
                                    </p>
                                </div>
                            </div>
                            <Button 
                                variant="outline"
                                onClick={() => setCurrentStep('schedule')}
                                className="bg-white hover:bg-gray-50 border-gray-200 shadow-sm shrink-0 h-9"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Schedule
                            </Button>
                        </div>

                        {/* Existing Invoices */}
                        {isLoadingInvoices ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Memuat invoice...
                            </div>
                        ) : existingInvoices.length > 0 && (
                            <div className="space-y-3">
                                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daftar Invoice</Label>
                                <div className="space-y-2">
                                    {existingInvoices.map((invoice, index) => (
                                        <div
                                            key={invoice.id || index}
                                            className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow transition-shadow"
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-gray-500">
                                                        {invoice.payment_id?.substring(0, 12)}...
                                                    </span>
                                                    {getStatusBadge(invoice.status)}
                                                </div>
                                                <span className="text-sm font-semibold text-gray-900">
                                                    Rp {new Intl.NumberFormat('id-ID').format(invoice.amount)}
                                                </span>
                                                {invoice.created_at && (
                                                    <span className="text-[11px] text-gray-400">{formatDate(invoice.created_at)}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {invoice.invoice_url && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-xs"
                                                        onClick={() => window.open(invoice.invoice_url, '_blank')}
                                                    >
                                                        <ExternalLink className="w-3 h-3 mr-1" />
                                                        Open
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 text-xs"
                                                    onClick={() => copyToClipboard(invoice.invoice_url, invoice.payment_id)}
                                                >
                                                    {copiedId === invoice.payment_id ? (
                                                        <Check className="w-3 h-3 mr-1 text-green-600" />
                                                    ) : (
                                                        <Copy className="w-3 h-3 mr-1" />
                                                    )}
                                                    {copiedId === invoice.payment_id ? 'Copied!' : 'Copy Link'}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Add New Invoice Toggle */}
                        {!isLoadingInvoices && existingInvoices.length > 0 && !showNewInvoiceForm && (
                            <div className="relative pt-2 pb-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200" />
                                </div>
                                <div className="relative flex justify-center">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-white text-xs font-medium text-gray-500 hover:text-blue-600 rounded-full h-8 shadow-sm"
                                        onClick={() => setShowNewInvoiceForm(true)}
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" />
                                        Buat Invoice Baru
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* New Invoice Form Box */}
                        {!isLoadingInvoices && (showNewInvoiceForm || existingInvoices.length === 0) && (
                            <div className="border border-blue-100 bg-blue-50/10 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 relative">
                                <div className="bg-blue-50/50 px-5 py-3 border-b border-blue-100 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-blue-900 tracking-wide">Buat Invoice Baru</h3>
                                    {showNewInvoiceForm && existingInvoices.length > 0 && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setShowNewInvoiceForm(false)}
                                            className="h-7 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-100/50 -mr-2"
                                        >
                                            Batal
                                        </Button>
                                    )}
                                </div>
                                
                                <div className="p-5 space-y-6 bg-white">
                                    {/* Customer Info Moved Here */}
                                    <div className="bg-gray-50/80 border border-gray-100 p-3.5 rounded-lg flex flex-col gap-0.5">
                                        <p className="text-sm text-gray-900 flex items-center gap-2">
                                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pelanggan:</span> 
                                            <span className="font-medium">{submission.researcherName}</span>
                                        </p>
                                        {submission.researcherEmail && (
                                            <p className="text-sm text-gray-600 pl-[84px]">{submission.researcherEmail}</p>
                                        )}
                                    </div>

                                    {/* Invoice Items */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-medium text-gray-900">Items*</Label>
                                        </div>
                                        <div className="space-y-3">
                                            {items.map((item) => (
                                                <div key={item.id} className="flex gap-3 items-start">
                                                    <div className="w-32 md:w-40">
                                                        <select
                                                            value={item.category || 'Lainnya'}
                                                            onChange={(e) => handleItemChange(item.id, 'category', e.target.value)}
                                                            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                        >
                                                            <option value="Jakpat for University (ads)">Jakpat for University (ads)</option>
                                                            <option value="Jakpat for University (Platform)">Jakpat for University (Platform)</option>
                                                            <option value="Respondent's Incentive">Respondent's Incentive</option>
                                                            <option value="Lainnya">Lainnya</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex-1">
                                                        <Input
                                                            placeholder="Nama Item"
                                                            value={item.name}
                                                            onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                                                            className="w-full"
                                                        />
                                                    </div>
                                                    <div className="w-20">
                                                        <Input
                                                            type="number"
                                                            placeholder="Qty"
                                                            min="1"
                                                            value={item.qty}
                                                            onChange={(e) => handleItemChange(item.id, 'qty', parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </div>
                                                    <div className="w-32">
                                                        <Input
                                                            type="number"
                                                            placeholder="Harga"
                                                            min="0"
                                                            value={item.price}
                                                            onChange={(e) => handleItemChange(item.id, 'price', parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => handleRemoveItem(item.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleAddItem}
                                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Tambah Item
                                        </Button>
                                    </div>

                                    {/* Total */}
                                    <div className="border-t pt-4">
                                        <div className="flex justify-between items-center text-lg font-semibold bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                                            <span className="text-gray-600 text-sm uppercase tracking-wider font-bold">Total Tagihan</span>
                                            <span className="text-blue-700">Rp {new Intl.NumberFormat('id-ID').format(totalAmount)}</span>
                                        </div>
                                    </div>

                                    {/* Memo */}
                                    <div className="grid gap-2">
                                        <Label htmlFor="note" className="text-sm font-medium text-gray-900">
                                            Memo (Opsional)
                                        </Label>
                                        <Input
                                            id="note"
                                            type="text"
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            placeholder="Catatan tambahan untuk invoice ini"
                                            maxLength={200}
                                        />
                                    </div>
                                    
                                    {/* Form Submit Box Action */}
                                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                                        <Button
                                            onClick={handleCreateInvoice}
                                            disabled={isCreatingInvoice}
                                            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                                        >
                                            {isCreatingInvoice ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Membuat...
                                                </>
                                            ) : (
                                                <>
                                                    <CreditCard className="mr-2 h-4 w-4" />
                                                    Create Payment Link
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* (Outer action buttons removed) */}
                    </div>
                )}
            </div>
        </div>
    );
}
