import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, RefreshCw, Download, Filter } from 'lucide-react';
import { formatPaymentChannel } from '../utils/paymentChannel';
import { cn, useMediaQuery } from '@/lib/utils';
import {
  type Transaction,
  parseTransactionNote,
  formatIDR,
} from './transactions/types';
import { TransactionListRow } from './transactions/TransactionListRow';
import { TransactionDetailSheet } from './transactions/TransactionDetailSheet';
import { WalletView } from './transactions/WalletView';

type FinanceTab = 'transaksi' | 'wallet';

export function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<FinanceTab>('transaksi');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(-1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [openTransactionId, setOpenTransactionId] = useState<string | null>(null);

  const isXl = useMediaQuery('(min-width: 1280px)');

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          form_submissions!inner(
            title,
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return transactions.filter((t) => {
      const date = new Date(t.created_at || '');
      const isSameMonth = selectedMonth === -1 || date.getMonth() === selectedMonth;
      const isSameYear = date.getFullYear() === selectedYear;

      const matchesSearch =
        t.form_submissions?.title.toLowerCase().includes(searchLower) ||
        t.form_submissions?.full_name.toLowerCase().includes(searchLower) ||
        t.payment_id?.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

      return matchesSearch && isSameMonth && isSameYear && matchesStatus;
    });
  }, [transactions, searchTerm, selectedMonth, selectedYear, statusFilter]);

  const totalRevenue = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0),
    [filteredTransactions]
  );

  // Revenue per category from transaction notes
  const categoryRevenue = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.status === 'completed')
        .reduce((acc, t) => {
          const { items } = parseTransactionNote(t.note);
          if (items.length > 0) {
            items.forEach((item) => {
              const cat = item.category || 'Lainnya';
              const total = (item.price || 0) * (item.qty || 1);
              acc[cat] = (acc[cat] || 0) + total;
            });
          } else {
            acc['Lainnya'] = (acc['Lainnya'] || 0) + t.amount;
          }
          return acc;
        }, {} as Record<string, number>),
    [filteredTransactions]
  );

  const statusCounts = {
    all: transactions.length,
    pending: transactions.filter((t) => t.status === 'pending').length,
    completed: transactions.filter((t) => t.status === 'completed').length,
    failed: transactions.filter((t) => t.status === 'failed').length,
  };

  const openTransaction = openTransactionId
    ? filteredTransactions.find((t) => t.id === openTransactionId) ??
      transactions.find((t) => t.id === openTransactionId) ??
      null
    : null;

  const handleExportCsv = () => {
    const headers = ['Transaction ID', 'Survey Title', 'Researcher', 'Payment Method', 'Payment Channel', 'Amount', 'Status', 'Created At', 'Payment ID'];
    const csvContent = [
      headers.join(','),
      ...filteredTransactions.map((t) =>
        [
          `"${t.id}"`,
          `"${(t.form_submissions?.title || '').replace(/"/g, '""')}"`,
          `"${(t.form_submissions?.full_name || '').replace(/"/g, '""')}"`,
          `"${t.payment_method}"`,
          `"${t.payment_channel ? formatPaymentChannel(t.payment_channel) : ''}"`,
          `"${t.amount}"`,
          `"${t.status}"`,
          `"${new Date(t.created_at).toLocaleString()}"`,
          `"${t.payment_id || ''}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">
      {/* Segmented tabs: Transaksi | Wallet */}
      <div className="shrink-0 flex items-center border-b border-gray-200 mb-4">
        {(
          [
            ['transaksi', 'Transaksi'],
            ['wallet', 'Wallet'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors',
              activeTab === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'wallet' ? (
        <WalletView
          sacId={import.meta.env.VITE_DOKU_SAC_JFU_ID || 'SAC-7926-1778565828595'}
          productName="Jakpat for Universities"
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]">
            {/* Row 1: periode + export/revenue/refresh */}
            <div className="flex flex-row flex-wrap items-center justify-between gap-3 w-full">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-gray-600">Periode</span>
                <div className="flex items-center gap-2 bg-gray-50/80 p-1.5 rounded-lg border border-gray-200/50">
                  <div className="relative">
                    <select
                      className="h-8 pl-3 pr-8 text-sm font-semibold bg-transparent border-0 rounded-md focus:outline-none focus:ring-0 appearance-none cursor-pointer hover:bg-white hover:shadow-sm transition-all w-36 text-gray-700"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    >
                      <option value={-1}>Semua Bulan</option>
                      {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((month, index) => (
                        <option key={index} value={index}>{month}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                  <div className="w-px h-4 bg-gray-200" />
                  <div className="relative">
                    <select
                      className="h-8 pl-3 pr-8 text-sm font-semibold bg-transparent border-0 rounded-md focus:outline-none focus:ring-0 appearance-none cursor-pointer hover:bg-white hover:shadow-sm transition-all w-24 text-gray-700"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    >
                      {[2024, 2025, 2026, 2027].map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleExportCsv}
                  variant="outline"
                  className="h-10 shrink-0 bg-white border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  <span className="font-medium">Export CSV</span>
                </Button>

                {/* Revenue display with breakdown dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div
                      className="flex items-center gap-4 bg-emerald-50 pl-4 pr-3 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100/50 hover:border-emerald-200 transition-all cursor-pointer group shadow-sm select-none"
                      role="button"
                    >
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wide leading-none mb-1">Total Pendapatan</span>
                        <span className="text-lg font-bold text-emerald-700 group-hover:text-emerald-800 transition-colors leading-none">{formatIDR(totalRevenue)}</span>
                      </div>
                      <div className="h-9 w-9 bg-emerald-100 rounded-full flex items-center justify-center group-hover:bg-emerald-200 group-hover:scale-105 transition-all shadow-inner shrink-0">
                        <span className="text-emerald-600 font-bold text-lg">$</span>
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[340px] p-0 shadow-2xl border-gray-100 rounded-xl mt-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-6 bg-white rounded-xl">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Breakdown Pendapatan</span>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Lunas</Badge>
                      </div>
                      <div className="text-3xl font-extrabold text-gray-900 mb-6 tracking-tight">{formatIDR(totalRevenue)}</div>
                      <div className="h-px bg-gray-100 w-full mb-5" />
                      <div className="space-y-4">
                        {Object.entries(categoryRevenue).map(([cat, amount]) => (
                          <div key={cat} className="flex justify-between items-center text-sm group">
                            <span className="text-gray-600 group-hover:text-gray-900 transition-colors">{cat}</span>
                            <span className="font-semibold text-gray-900 mono">{formatIDR(amount)}</span>
                          </div>
                        ))}
                        {Object.keys(categoryRevenue).length === 0 && (
                          <div className="text-center text-sm text-gray-400 italic py-4 bg-gray-50 rounded-lg">
                            Belum ada data detail pendapatan
                          </div>
                        )}
                      </div>
                      <div className="mt-6 pt-4 border-t border-gray-50">
                        <p className="text-[10px] text-gray-400 text-center">Data diperbarui secara real-time</p>
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  onClick={fetchTransactions}
                  variant="outline"
                  disabled={loading}
                  className="h-10 w-10 p-0 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shrink-0 shadow-sm transition-all"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            <div className="h-px bg-gray-100 w-full" />

            {/* Row 2: search + status filter chips */}
            <div className="flex flex-row flex-wrap items-center justify-start gap-4 w-full">
              <div className="relative w-full max-w-[400px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Cari ID transaksi, nama, atau email..."
                  className="pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm w-full shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'Semua', count: statusCounts.all },
                  { id: 'pending', label: 'Menunggu', count: statusCounts.pending },
                  { id: 'completed', label: 'Lunas', count: statusCounts.completed },
                  { id: 'failed', label: 'Gagal', count: statusCounts.failed },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                      statusFilter === tab.id
                        ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    {tab.label}
                    {tab.id !== 'all' && (
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-md text-[10px] font-bold',
                        statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                      )}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List surface + inline reading pane */}
          <div className="flex-1 min-h-0 flex bg-white border border-gray-200 rounded-xl overflow-hidden mt-4 mb-4">
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Sticky column header */}
              <div className="shrink-0 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <span className="hidden sm:block w-[76px] shrink-0">Tanggal</span>
                <span className="hidden md:block w-[110px] shrink-0">ID</span>
                <span className="flex-1">Survei</span>
                <span className="shrink-0 sm:w-[110px] text-right">Total</span>
                <span className="shrink-0 sm:w-[88px]">Status</span>
                <span className="hidden sm:block w-[110px] shrink-0">Metode</span>
                <span className="w-4 shrink-0" />
              </div>

              {/* Rows */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                  <div className="divide-y divide-gray-100">
                    {Array(8).fill(0).map((_, i) => (
                      <div key={`skeleton-${i}`} className="flex items-center gap-3 px-4 py-3">
                        <div className="hidden sm:block w-[76px] shrink-0">
                          <div className="h-3 w-14 bg-gray-200 animate-pulse rounded mb-1" />
                          <div className="h-2.5 w-10 bg-gray-100 animate-pulse rounded" />
                        </div>
                        <div className="hidden md:block w-[110px] shrink-0">
                          <div className="h-4 w-full bg-gray-100 animate-pulse rounded" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="h-4 w-3/5 bg-gray-200 animate-pulse rounded mb-1.5" />
                          <div className="h-2.5 w-2/5 bg-gray-100 animate-pulse rounded" />
                        </div>
                        <div className="h-4 w-20 bg-gray-200 animate-pulse rounded shrink-0" />
                        <div className="h-5 w-16 bg-gray-100 animate-pulse rounded-full shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-50 rounded-full mb-3">
                      <Filter className="w-7 h-7 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1 text-gray-900">Tidak ada transaksi ditemukan</h3>
                    <p className="text-sm text-gray-500">Coba ubah filter atau kata kunci pencarian Anda.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredTransactions.map((transaction) => (
                      <TransactionListRow
                        key={transaction.id}
                        transaction={transaction}
                        onOpen={setOpenTransactionId}
                        active={isXl && transaction.id === openTransactionId}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Footer count */}
              <div className="shrink-0 border-t border-gray-200 px-4 py-3 text-sm text-gray-500">
                Total: <span className="font-bold text-gray-900">{filteredTransactions.length}</span> transaksi
              </div>
            </div>

            {/* Inline reading pane (Outlook split view) */}
            {isXl && openTransaction && (
              <TransactionDetailSheet
                variant="pane"
                transaction={openTransaction}
                onOpenChange={(open) => !open && setOpenTransactionId(null)}
              />
            )}
          </div>
        </>
      )}

      {/* Detail drawer (narrow screens) — ≥1280px uses the inline pane instead */}
      {!isXl && (
        <TransactionDetailSheet
          transaction={activeTab === 'transaksi' ? openTransaction : null}
          onOpenChange={(open) => !open && setOpenTransactionId(null)}
        />
      )}
    </div>
  );
}
