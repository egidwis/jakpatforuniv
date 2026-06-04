import { useState, useEffect, useCallback } from 'react';
import { supabase, fetchSlotAvailability } from '@/utils/supabase';
import type { FormSubmissionExtend } from '@/utils/supabase';
import { MAX_REGULAR_ADS_PER_DAY } from '@/utils/constants';
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
  CalendarPlus,
  RefreshCw,
  Clock,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExtendSectionProps {
  submissionId: string;
  submissionTitle: string;
  currentEndDate?: string | null;
  currentPrizePerWinner?: number;
  currentWinnerCount?: number;
  onExtendCreated?: () => void;
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
        total_cost: 0, // Admin can set via payment flow
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
                return (
                  <div
                    key={ext.id}
                    className={`flex flex-col gap-1 px-2.5 py-2 rounded-md border text-[10px] ${style.bg}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className={`font-semibold uppercase tracking-wider ${style.text}`}>
                          {ext.submission_status}
                        </span>
                      </div>
                      <span className="text-gray-400 font-mono">{ext.period_batch}</span>
                    </div>

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

                    {/* Reward info */}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Extend Dialog */}
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
    </div>
  );
}
