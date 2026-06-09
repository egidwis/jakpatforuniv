import { useState, useEffect, useCallback } from 'react';
import { supabase, fetchSlotAvailability, createInvoice, createTransaction } from '@/utils/supabase';
import type { FormSubmissionExtend, Transaction, Invoice } from '@/utils/supabase';
import { createManualInvoice } from '@/utils/payment';
import { MAX_REGULAR_ADS_PER_DAY } from '@/utils/constants';
import { calculateAdCostPerDay, calculateIncentiveCost } from '@/utils/cost-calculator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CalendarPlus,
  RefreshCw,
  Clock,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CreditCard,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExtendSectionProps {
  submissionId: string;
  submissionTitle: string;
  currentEndDate?: string | null;
  currentPrizePerWinner?: number;
  currentWinnerCount?: number;
  questionCount?: number;
  researcherName?: string;
  researcherEmail?: string;
  phoneNumber?: string;
  onExtendCreated?: () => void;
}

interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  price: number;
}

interface ExtendPaymentInfo {
  extendId: string;
  paymentUrl: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  amount: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  waiting_payment: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  paid: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  scheduled: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500 animate-pulse' },
  live: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', dot: 'bg-green-500 animate-pulse' },
  completed: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', dot: 'bg-gray-400' },
  cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', dot: 'bg-red-400' },
};

export function ExtendSection({
  submissionId,
  submissionTitle,
  currentEndDate,
  currentPrizePerWinner = 0,
  currentWinnerCount = 0,
  questionCount = 0,
  researcherName = '',
  researcherEmail = '',
  phoneNumber = '',
  onExtendCreated,
}: ExtendSectionProps) {
  const [extends_, setExtends] = useState<FormSubmissionExtend[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Create form state
  const [duration, setDuration] = useState(7);
  const [startDate, setStartDate] = useState('');
  const [prizePerWinner, setPrizePerWinner] = useState(0);
  const [winnerCount, setWinnerCount] = useState(0);
  const [additionalPrize, setAdditionalPrize] = useState(0);
  const [creating, setCreating] = useState(false);

  const [isFetchingAds, setIsFetchingAds] = useState(false);
  const [regularCountsByDate, setRegularCountsByDate] = useState<Record<string, number>>({});

  // Payment state
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentExtend, setPaymentExtend] = useState<FormSubmissionExtend | null>(null);
  const [paymentItems, setPaymentItems] = useState<InvoiceItem[]>([]);
  const [paymentNote, setPaymentNote] = useState('');
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [extendPayments, setExtendPayments] = useState<Record<string, ExtendPaymentInfo>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadAvailability = async () => {
    setIsFetchingAds(true);
    try {
      const { regularCounts } = await fetchSlotAvailability();
      setRegularCountsByDate(regularCounts);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setIsFetchingAds(false);
    }
  };

  useEffect(() => {
    if (isCreateDialogOpen) {
      loadAvailability();
    }
  }, [isCreateDialogOpen]);

  const availableDates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    availableDates.push(d);
  }

  const getDateString = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const fetchExtends = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('form_submissions_extend')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExtends(data || []);

      // Fetch payment info for all extends
      if (data && data.length > 0) {
        const extendIds = data.filter(e => e.id).map(e => e.id!);
        const { data: txData } = await supabase
          .from('transactions')
          .select('payment_id, status, payment_url, amount, extend_id')
          .eq('entity_type', 'extend')
          .in('extend_id', extendIds)
          .order('created_at', { ascending: false });

        const paymentMap: Record<string, ExtendPaymentInfo> = {};
        (txData || []).forEach(tx => {
          if (tx.extend_id && !paymentMap[tx.extend_id]) {
            paymentMap[tx.extend_id] = {
              extendId: tx.extend_id,
              paymentUrl: tx.payment_url || null,
              paymentId: tx.payment_id || null,
              paymentStatus: tx.status || null,
              amount: tx.amount || 0,
            };
          }
        });
        setExtendPayments(paymentMap);
      }
    } catch (err) {
      console.error('Error fetching extends:', err);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (isExpanded) {
      fetchExtends();
    }
  }, [isExpanded, fetchExtends]);

  // Determine if the new extend is in the same month as parent end_date
  const computeIsNewMonth = (extEndDate: string) => {
    if (!currentEndDate) return true;
    const parentMonth = new Date(currentEndDate).toISOString().substring(0, 7); // YYYY-MM
    const extMonth = new Date(extEndDate).toISOString().substring(0, 7);
    return parentMonth !== extMonth;
  };

  const handleOpenCreate = () => {
    // Reset form
    setDuration(7);
    setStartDate('');
    setPrizePerWinner(currentPrizePerWinner);
    setWinnerCount(currentWinnerCount);
    setAdditionalPrize(0);
    setIsCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!startDate) {
      toast.error('Tanggal mulai harus diisi');
      return;
    }
    if (duration < 1) {
      toast.error('Durasi minimal 1 hari');
      return;
    }

    setCreating(true);
    try {
      // Calculate end_date from start_date + duration
      const start = new Date(startDate);
      // Set to 15:00 WIB (08:00 UTC) — go-live convention
      start.setUTCHours(8, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + duration);

      const endDateStr = end.toISOString();
      const isNewMonth = computeIsNewMonth(endDateStr);

      // Validate: if new month, prize_per_winner and winner_count required
      if (isNewMonth && (prizePerWinner <= 0 || winnerCount <= 0)) {
        toast.error('Bulan baru: Prize per winner dan jumlah pemenang wajib diisi');
        setCreating(false);
        return;
      }

      const extendData: FormSubmissionExtend = {
        submission_id: submissionId,
        duration,
        start_date: start.toISOString(),
        end_date: endDateStr,
        submission_status: 'waiting_payment',
        payment_status: 'pending',
        prize_per_winner: isNewMonth ? prizePerWinner : 0,
        winner_count: isNewMonth ? winnerCount : 0,
        additional_prize_per_winner: !isNewMonth ? additionalPrize : 0,
        is_new_month: isNewMonth,
        total_cost: 0, // Will be set via payment flow
        slot_booked_by: 'admin',
      };

      const { error } = await supabase
        .from('form_submissions_extend')
        .insert([extendData]);

      if (error) throw error;

      toast.success('Extend berhasil dibuat');
      setIsCreateDialogOpen(false);
      fetchExtends();
      onExtendCreated?.();
    } catch (err: any) {
      console.error('Error creating extend:', err);
      toast.error(err.message || 'Gagal membuat extend');
    } finally {
      setCreating(false);
    }
  };

  // ==================== PAYMENT LOGIC ====================

  const initializePaymentItems = (ext: FormSubmissionExtend) => {
    const items: InvoiceItem[] = [];
    const costPerDay = calculateAdCostPerDay(questionCount);

    if (costPerDay > 0 && ext.duration > 0) {
      items.push({
        id: Date.now().toString() + '0',
        name: 'Extend Iklan (ads)',
        qty: ext.duration,
        price: costPerDay,
      });
    }

    // Incentive for new month
    if (ext.is_new_month && ext.prize_per_winner && ext.prize_per_winner > 0 && ext.winner_count && ext.winner_count > 0) {
      items.push({
        id: Date.now().toString() + '1',
        name: "Respondent's Incentive (New Batch)",
        qty: ext.winner_count,
        price: ext.prize_per_winner,
      });
    }

    // Additional prize for same month
    if (!ext.is_new_month && ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0) {
      items.push({
        id: Date.now().toString() + '2',
        name: 'Additional Prize per Winner',
        qty: currentWinnerCount || 1,
        price: ext.additional_prize_per_winner,
      });
    }

    // Fallback if no items
    if (items.length === 0) {
      items.push({
        id: Date.now().toString(),
        name: 'Extend Iklan',
        qty: 1,
        price: 0,
      });
    }

    return items;
  };

  const handleOpenPayment = (ext: FormSubmissionExtend) => {
    setPaymentExtend(ext);
    setPaymentItems(initializePaymentItems(ext));
    setPaymentNote('');
    setIsPaymentDialogOpen(true);
  };

  const handleAddPaymentItem = () => {
    setPaymentItems([...paymentItems, { id: Date.now().toString(), name: '', qty: 1, price: 0 }]);
  };

  const handleRemovePaymentItem = (id: string) => {
    if (paymentItems.length === 1) {
      toast.error('Minimal satu item diperlukan');
      return;
    }
    setPaymentItems(paymentItems.filter(item => item.id !== id));
  };

  const handlePaymentItemChange = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setPaymentItems(paymentItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const paymentTotal = paymentItems.reduce((sum, item) => sum + (item.qty * item.price), 0);

  const handleCreatePaymentLink = async () => {
    if (!paymentExtend?.id) return;

    const invalidItems = paymentItems.filter(item => !item.name.trim() || item.price < 0 || item.qty < 1);
    if (invalidItems.length > 0) {
      toast.error('Mohon lengkapi semua item dengan benar');
      return;
    }

    if (paymentTotal <= 0) {
      toast.error('Total invoice harus lebih dari 0');
      return;
    }

    setIsCreatingPayment(true);
    try {
      const itemSummary = paymentItems.map(item => `${item.name} (${item.qty}x)`).join(', ');
      const description = paymentNote.trim()
        ? `[EXTEND] ${itemSummary} - ${paymentNote.trim()}`
        : `[EXTEND] ${itemSummary}`;

      const noteData = {
        memo: paymentNote.trim(),
        extend_id: paymentExtend.id,
        items: paymentItems.map(({ name, qty, price }) => ({ name, qty, price })),
      };
      const noteJson = JSON.stringify(noteData);

      // Create DOKU invoice
      const paymentResponse = await createManualInvoice({
        formSubmissionId: submissionId,
        amount: paymentTotal,
        description,
        customerInfo: {
          fullName: researcherName || 'Client',
          email: researcherEmail || 'client@example.com',
          phoneNumber: phoneNumber || '',
        },
      });

      // Save invoice record with entity_type='extend'
      const invoiceData: Invoice = {
        form_submission_id: submissionId,
        payment_id: paymentResponse.payment_id,
        invoice_url: paymentResponse.invoice_url,
        amount: paymentTotal,
        status: 'pending',
        entity_type: 'extend',
        extend_id: paymentExtend.id,
      };
      await createInvoice(invoiceData);

      // Save transaction record with entity_type='extend'
      const transactionData: Transaction = {
        form_submission_id: submissionId,
        payment_id: paymentResponse.payment_id,
        payment_method: 'doku',
        amount: paymentTotal,
        status: 'pending',
        payment_url: paymentResponse.invoice_url,
        note: noteJson,
        entity_type: 'extend',
        extend_id: paymentExtend.id,
      };
      await createTransaction(transactionData);

      // Update extend total_cost and status
      await supabase
        .from('form_submissions_extend')
        .update({
          total_cost: paymentTotal,
          submission_status: 'waiting_payment',
          payment_status: 'pending',
        })
        .eq('id', paymentExtend.id);

      toast.success('Payment link berhasil dibuat!');
      setIsPaymentDialogOpen(false);
      fetchExtends(); // Refresh to show new payment info
    } catch (err: any) {
      console.error('Error creating payment link:', err);
      toast.error(err.message || 'Gagal membuat payment link');
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handleCopyPaymentLink = async (url: string, extId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(extId);
      toast.success('Payment link berhasil disalin!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Gagal menyalin link');
    }
  };

  const handleCancelExtend = async (extId: string) => {
    if (!confirm('Yakin ingin membatalkan extend ini?')) return;
    setCancellingId(extId);
    try {
      await supabase
        .from('form_submissions_extend')
        .update({ submission_status: 'cancelled', payment_status: 'failed' })
        .eq('id', extId);
      toast.success('Extend dibatalkan');
      fetchExtends();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membatalkan extend');
    } finally {
      setCancellingId(null);
    }
  };

  // ==================== COMPUTED ====================

  const extEndDate = (() => {
    if (!startDate || duration < 1) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + duration);
    return d;
  })();

  const isNewMonth = extEndDate ? computeIsNewMonth(extEndDate.toISOString()) : false;

  return (
    <div className="w-full">
      {/* Toggle Header */}
      <button
        className="w-full flex items-center justify-between gap-2 px-2.5 h-8 bg-violet-50/80 border border-violet-200/70 rounded-md cursor-pointer hover:bg-violet-100/80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <CalendarPlus className="w-3.5 h-3.5 text-violet-600 shrink-0" />
          <span className="text-xs font-medium text-violet-700 tracking-wide">
            Extend
          </span>
          {extends_.length > 0 && (
            <Badge variant="outline" className="px-1 py-0 h-4 text-[9px] bg-violet-100 text-violet-700 border-violet-300 rounded-full font-bold">
              {extends_.length}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-violet-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-violet-500" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {/* Create New Extend Button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center h-7 text-[11px] font-medium text-violet-600 hover:text-violet-700 border-violet-200 hover:border-violet-300 bg-white hover:bg-violet-50 transition-all"
            onClick={handleOpenCreate}
          >
            <CalendarPlus className="w-3 h-3 mr-1.5" />
            Buat Extend Baru
          </Button>

          {/* Extends List */}
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
            </div>
          ) : extends_.length === 0 ? (
            <div className="text-[10px] text-gray-400 italic text-center py-2">
              Belum ada extend
            </div>
          ) : (
            <div className="space-y-1.5">
              {extends_.map((ext) => {
                const style = STATUS_STYLES[ext.submission_status || 'waiting_payment'];
                const startD = ext.start_date ? new Date(ext.start_date) : null;
                const endD = ext.end_date ? new Date(ext.end_date) : null;
                const payment = ext.id ? extendPayments[ext.id] : null;
                const isWaitingPayment = ext.submission_status === 'waiting_payment';
                const isCancelled = ext.submission_status === 'cancelled';
                const hasPaymentLink = !!payment?.paymentUrl;
                const isPaymentPending = payment?.paymentStatus === 'pending';

                return (
                  <div
                    key={ext.id}
                    className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-md border text-[10px] ${style.bg}`}
                  >
                    {/* Row 1: Status + period badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className={`font-semibold uppercase tracking-wider ${style.text}`}>
                          {ext.submission_status?.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-gray-400 font-mono">{ext.period_batch}</span>
                    </div>

                    {/* Row 2: Date range + duration */}
                    <div className="flex items-center gap-3 text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>
                          {startD?.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          {' → '}
                          {endD?.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{ext.duration}d</span>
                      </div>
                    </div>

                    {/* Row 3: Reward info */}
                    {(ext.is_new_month && ext.prize_per_winner && ext.prize_per_winner > 0) ? (
                      <div className="flex items-center gap-1 text-emerald-600">
                        <DollarSign className="w-3 h-3" />
                        <span>Rp {ext.prize_per_winner.toLocaleString('id-ID')} × {ext.winner_count}</span>
                        <Badge variant="outline" className="ml-1 px-1 py-0 h-3.5 text-[8px] bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full">
                          NEW
                        </Badge>
                      </div>
                    ) : ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0 ? (
                      <div className="flex items-center gap-1 text-blue-600">
                        <DollarSign className="w-3 h-3" />
                        <span>+Rp {ext.additional_prize_per_winner.toLocaleString('id-ID')}/winner</span>
                      </div>
                    ) : null}

                    {/* Row 4: Payment info / actions */}
                    {!isCancelled && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {/* Case A: Has payment link */}
                        {hasPaymentLink ? (
                          <>
                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                              <CreditCard className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className={`text-[9px] font-medium truncate ${
                                payment?.paymentStatus === 'paid' ? 'text-green-600' :
                                payment?.paymentStatus === 'expired' ? 'text-red-500' :
                                'text-amber-600'
                              }`}>
                                {payment?.paymentStatus === 'paid' ? 'Lunas' :
                                 payment?.paymentStatus === 'expired' ? 'Expired' :
                                 `Rp ${payment?.amount?.toLocaleString('id-ID') || '0'}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <TooltipProvider>
                                <Tooltip delayDuration={100}>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 text-gray-400 hover:text-violet-600"
                                      onClick={() => handleCopyPaymentLink(payment!.paymentUrl!, ext.id!)}
                                    >
                                      {copiedId === ext.id ? (
                                        <Check className="w-3 h-3 text-green-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    {copiedId === ext.id ? 'Copied!' : 'Copy payment link'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip delayDuration={100}>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 text-gray-400 hover:text-blue-600"
                                      onClick={() => window.open(payment!.paymentUrl!, '_blank')}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Buka halaman pembayaran
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {/* Allow creating additional payment if current one expired */}
                              {payment?.paymentStatus === 'expired' && (
                                <TooltipProvider>
                                  <Tooltip delayDuration={100}>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0 text-gray-400 hover:text-emerald-600"
                                        onClick={() => handleOpenPayment(ext)}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Buat payment link baru
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </>
                        ) : isWaitingPayment ? (
                          /* Case B: No payment link yet — show create button */
                          <div className="flex items-center gap-1.5 w-full">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-6 text-[10px] font-medium text-emerald-600 hover:text-emerald-700 border-emerald-200 hover:border-emerald-300 bg-white hover:bg-emerald-50 transition-all"
                              onClick={() => handleOpenPayment(ext)}
                            >
                              <CreditCard className="w-3 h-3 mr-1" />
                              Buat Payment Link
                            </Button>
                            <TooltipProvider>
                              <Tooltip delayDuration={100}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-gray-300 hover:text-red-500"
                                    onClick={() => ext.id && handleCancelExtend(ext.id)}
                                    disabled={cancellingId === ext.id}
                                  >
                                    {cancellingId === ext.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Batalkan extend
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== Create Extend Dialog ==================== */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-lg">Buat Extend</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Extend iklan "<span className="font-medium text-gray-700">{submissionTitle}</span>"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Start Date + Duration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-700">Tanggal Mulai</label>
                  {isFetchingAds && <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-700">Durasi (hari)</label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="h-8 w-20 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {availableDates.map((date, i) => {
                  const dateStr = getDateString(date);
                  const baseCount = regularCountsByDate[dateStr] || 0;
                  const isFull = baseCount >= MAX_REGULAR_ADS_PER_DAY;
                  
                  const selectedIndex = startDate ? availableDates.findIndex(d => getDateString(d) === startDate) : -1;
                  const isSelectedInRange = selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + duration;
                  
                  const displayCount = isSelectedInRange ? baseCount + 1 : baseCount;

                  let statusColors = 'bg-white border-slate-200 hover:border-violet-400 shadow-sm';
                  let textColor = 'text-slate-800';
                  
                  if (isSelectedInRange) {
                    if (displayCount > MAX_REGULAR_ADS_PER_DAY) {
                      statusColors = 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-md';
                      textColor = 'text-red-900';
                    } else {
                      statusColors = 'bg-violet-50 border-violet-600 ring-1 ring-violet-600 shadow-md';
                      textColor = 'text-violet-900';
                    }
                  } else if (isFull) {
                    statusColors = 'bg-slate-50 border-slate-200 opacity-80';
                  }

                  const dotColor = displayCount > MAX_REGULAR_ADS_PER_DAY ? 'bg-red-500' : isFull && !isSelectedInRange ? 'bg-red-500' : displayCount > 0 ? 'bg-amber-500' : 'bg-emerald-500';

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setStartDate(dateStr)}
                      className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all text-center focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 ${statusColors}`}
                    >
                      <span className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">
                        {date.toLocaleDateString('id-ID', { weekday: 'short' })}
                      </span>
                      <span className={`font-extrabold text-[13px] leading-tight mb-1 ${textColor}`}>
                        {date.getDate()}
                      </span>
                      <div className="flex items-center gap-0.5 mt-auto bg-slate-100/50 px-1 py-0.5 rounded-full border border-slate-100">
                        <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                        <span className={`text-[8px] font-semibold ${displayCount > MAX_REGULAR_ADS_PER_DAY ? 'text-red-700' : isFull && !isSelectedInRange ? 'text-red-700' : 'text-slate-600'}`}>
                          {displayCount}/{MAX_REGULAR_ADS_PER_DAY}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Computed end date + period info */}
            {extEndDate && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border ${isNewMonth ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${isNewMonth ? 'text-amber-600' : 'text-blue-600'}`} />
                <div className="text-xs space-y-0.5">
                  <p className="font-medium text-gray-700">
                    End date: <span className="font-bold">{extEndDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </p>
                  <p className="font-medium text-gray-700">
                    Batch: <span className="font-mono font-bold">{extEndDate.toISOString().substring(0, 7)}</span>
                  </p>
                  <p className={`font-semibold ${isNewMonth ? 'text-amber-700' : 'text-blue-700'}`}>
                    {isNewMonth
                      ? '⚠️ Bulan baru — wajib set reward baru'
                      : '✓ Bulan sama — opsional tambah prize per winner'}
                  </p>
                </div>
              </div>
            )}

            {/* Reward Section */}
            {isNewMonth ? (
              <Card className="border-amber-200">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" />
                    Reward Baru (Wajib)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">Prize per Winner (Rp)</label>
                      <Input
                        type="number"
                        min={0}
                        value={prizePerWinner}
                        onChange={(e) => setPrizePerWinner(Number(e.target.value))}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">Jumlah Pemenang</label>
                      <Input
                        type="number"
                        min={0}
                        value={winnerCount}
                        onChange={(e) => setWinnerCount(Number(e.target.value))}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  {prizePerWinner > 0 && winnerCount > 0 && (
                    <p className="text-xs text-amber-700 font-medium mt-2">
                      Total hadiah: Rp {(prizePerWinner * winnerCount).toLocaleString('id-ID')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-blue-200">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" />
                    Tambah Prize (Opsional)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">Additional Prize per Winner (Rp)</label>
                    <Input
                      type="number"
                      min={0}
                      value={additionalPrize}
                      onChange={(e) => setAdditionalPrize(Number(e.target.value))}
                      className="h-9 text-sm"
                    />
                    <p className="text-[10px] text-gray-400">
                      Saat ini: Rp {currentPrizePerWinner.toLocaleString('id-ID')}/winner × {currentWinnerCount} winner
                      {additionalPrize > 0 && (
                        <span className="text-blue-600 font-medium">
                          {' → '}Rp {(currentPrizePerWinner + additionalPrize).toLocaleString('id-ID')}/winner
                        </span>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !startDate || duration < 1}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {creating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Buat Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Payment Dialog ==================== */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Buat Payment Link
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Extend "{submissionTitle}" •{' '}
              {paymentExtend?.start_date && new Date(paymentExtend.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              {' → '}
              {paymentExtend?.end_date && new Date(paymentExtend.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' '}({paymentExtend?.duration}d)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Invoice Items */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Item Invoice</label>
              {paymentItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Nama item"
                    value={item.name}
                    onChange={(e) => handlePaymentItemChange(item.id, 'name', e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => handlePaymentItemChange(item.id, 'qty', Number(e.target.value))}
                    className="w-16 h-9 text-sm text-center"
                    title="Qty"
                  />
                  <div className="relative flex-1 max-w-[140px]">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                    <Input
                      type="number"
                      min={0}
                      value={item.price}
                      onChange={(e) => handlePaymentItemChange(item.id, 'price', Number(e.target.value))}
                      className="h-9 text-sm pl-8"
                    />
                  </div>
                  {paymentItems.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-gray-400 hover:text-red-500"
                      onClick={() => handleRemovePaymentItem(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-gray-500 hover:text-gray-700"
                onClick={handleAddPaymentItem}
              >
                <Plus className="w-3 h-3 mr-1" />
                Tambah Item
              </Button>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Catatan (opsional)</label>
              <Input
                placeholder="Keterangan tambahan..."
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-semibold text-gray-700">Total Invoice</span>
              <span className="text-lg font-bold text-gray-900">
                Rp {paymentTotal.toLocaleString('id-ID')}
              </span>
            </div>

            {/* Customer info preview */}
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <p>Customer: {researcherName || 'N/A'} ({researcherEmail || 'N/A'})</p>
              <p>Payment Gateway: DOKU • Due: 7 hari</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleCreatePaymentLink}
              disabled={isCreatingPayment || paymentTotal <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isCreatingPayment ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Membuat...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Create Payment Link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
