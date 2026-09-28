import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, CheckCircle2, ArrowUpRight } from 'lucide-react';
import type { FormSubmission, AdScheduleEntry } from '@/utils/supabase';

interface SurveyPickerWidgetProps {
  orders: Array<{ submission: FormSubmission; schedules: AdScheduleEntry[] }>;
  actionLabel?: string;
  defaultAction?: 'extend_schedule' | 'view_order';
}

export const SurveyPickerWidget: React.FC<SurveyPickerWidgetProps> = ({
  orders = [],
  actionLabel = '➕ Tambah Jadwal untuk Survei Terpilih',
  defaultAction = 'extend_schedule',
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // Default pilih survei pertama yang aktif atau pertama di list
  const [selectedId, setSelectedId] = useState<string>(() => {
    return orders[0]?.submission?.id || '';
  });

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(o => 
      (o.submission.title || '').toLowerCase().includes(term) ||
      (o.submission.id || '').toLowerCase().includes(term)
    );
  }, [orders, searchTerm]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.submission.id === selectedId) || orders[0];
  }, [orders, selectedId]);

  if (orders.length === 0) {
    return (
      <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-600">
        <p className="font-semibold text-slate-800 mb-1">Belum ada survei aktif di akunmu.</p>
        <p className="text-slate-500 mb-2">Kamu bisa membuat pesanan survei baru terlebih dahulu di dashboard.</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
        >
          <span>Buka Dashboard</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const handleAction = () => {
    if (!selectedOrder?.submission?.id) return;
    if (defaultAction === 'extend_schedule') {
      navigate(`/dashboard/jadwal/baru/${selectedOrder.submission.id}`);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="mt-3 p-3 sm:p-4 bg-gradient-to-br from-slate-50/90 to-indigo-50/30 border border-indigo-100/80 rounded-2xl shadow-xs space-y-3 w-full max-w-full overflow-hidden box-border">
      {/* Header Widget */}
      <div className="flex items-center justify-between border-b border-indigo-100/60 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-[11px] font-bold shrink-0">
            🎯
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-800 leading-tight truncate">Pilih Survei Milikmu</h4>
            <p className="text-[10px] text-slate-500 truncate">
              Total {orders.length} survei terdaftar di akunmu
            </p>
          </div>
        </div>
        <span className="text-[10px] font-semibold bg-indigo-100/80 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
          Generative UI
        </span>
      </div>

      {/* Search Bar jika order lebih dari 2 */}
      {orders.length > 2 && (
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari judul survei..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
          />
        </div>
      )}

      {/* List / Selection Carousel */}
      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar w-full">
        {filteredOrders.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-3">Tidak ditemukan survei dengan kata kunci tersebut.</p>
        ) : (
          filteredOrders.map(({ submission }) => {
            const isSelected = submission.id === selectedId;
            return (
              <button
                key={submission.id}
                type="button"
                onClick={() => setSelectedId(submission.id || '')}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer min-w-0 ${
                  isSelected
                    ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white/80 hover:bg-white border-slate-200/70 text-slate-700'
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                  isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {isSelected && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate leading-snug">
                    {submission.title || 'Survei Tanpa Judul'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                    <span className="capitalize font-medium shrink-0">
                      {submission.distribution_type === 'kilat' ? '⚡ Kilat' : 'Regular'}
                    </span>
                    <span>•</span>
                    <span className="truncate font-mono">
                      ID: {submission.id?.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Active Selection Details & CTA Action */}
      {selectedOrder && (
        <div className="pt-2.5 border-t border-indigo-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Survei Terpilih:</span>
            <p className="text-xs font-bold text-indigo-900 truncate">
              {selectedOrder.submission.title || 'Survei'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAction}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95 shrink-0 text-center"
          >
            <span className="truncate">{actionLabel}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
};
