import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Search, RefreshCw, Download, Filter } from 'lucide-react';


interface Transaction {
  id: string;
  payment_id: string;
  payment_method: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  payment_url: string;
  note?: string;
  created_at: string;
  updated_at: string;
  form_submission_id: string;
  form_submissions?: {
    title: string;
    full_name: string;
    email: string;
  };
}

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');

  // Date Filters
  const [selectedMonth, setSelectedMonth] = useState<number>(-1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-50 text-green-700 border-green-200',
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      failed: 'bg-red-50 text-red-700 border-red-200',
    };

    const labels: Record<string, string> = {
      completed: 'Lunas',
      pending: 'Menunggu',
      failed: 'Gagal',
    };

    return (
      <Badge variant="outline" className={`${styles[status] || 'bg-gray-50 text-gray-700 border-gray-200'} font-medium rounded-md px-2.5 py-0.5`}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getMethodBadge = (method: string) => {
    if (method === 'mayar_manual_invoice') {
      return <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100 border rounded-md font-normal">Invoice Manual</Badge>;
    }
    if (method === 'mayar') {
      return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 border rounded-md font-normal">Mayar</Badge>;
    }
    return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 rounded-md font-normal">{method}</Badge>;
  };



  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return (
      <div className="flex flex-col">
        <span className="font-medium text-gray-900">
          {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <span className="text-[11px] text-gray-400">
          {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
        </span>
      </div>
    );
  };

  const filteredTransactions = transactions.filter(t => {
    const searchLower = searchTerm.toLowerCase();
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

  const totalRevenue = filteredTransactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate Revenue per Category from Transaction Notes
  const categoryRevenue = filteredTransactions
    .filter(t => t.status === 'completed')
    .reduce((acc, t) => {
      try {
        if (t.note?.startsWith('{')) {
          const parsed = JSON.parse(t.note);
          const items = parsed.items || [];
          if (items.length > 0) {
            items.forEach((item: any) => {
              const cat = item.category || 'Lainnya';
              const total = (item.price || 0) * (item.qty || 1);
              acc[cat] = (acc[cat] || 0) + total;
            });
          } else {
            const cat = 'Lainnya';
            acc[cat] = (acc[cat] || 0) + t.amount;
          }
        } else {
          // Fallback for non-JSON notes
          const cat = 'Lainnya';
          acc[cat] = (acc[cat] || 0) + t.amount;
        }
      } catch (e) {
        // Fallback for malformed JSON or plain text notes
        const cat = 'Lainnya';
        acc[cat] = (acc[cat] || 0) + t.amount;
      }
      return acc;
    }, {} as Record<string, number>);

  const statusCounts = {
    all: transactions.length,
    pending: transactions.filter(t => t.status === 'pending').length,
    completed: transactions.filter(t => t.status === 'completed').length,
    failed: transactions.filter(t => t.status === 'failed').length,
  };

  return (
    <div className="space-y-6">
      {/* Unified Toolbar */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">

        {/* Top Row: Date | Export & Revenue */}
        <div className="flex flex-row items-center justify-between gap-4 w-full">
          {/* Left: Date Selectors */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Periode</span>

            {/* Month Dropdown */}
            <div className="relative">
              <select
                className="h-10 pl-3 pr-8 text-sm font-medium bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer hover:bg-gray-100 transition-colors shadow-sm w-36"
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

            {/* Year Dropdown */}
            <div className="relative">
              <select
                className="h-10 pl-3 pr-8 text-sm font-medium bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer hover:bg-gray-100 transition-colors shadow-sm w-24"
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

          {/* Right: Export & Prominent Revenue */}
          <div className="flex items-center gap-3">
            {/* Bulk Actions */}


            {/* Export CSV */}
            <Button
              onClick={() => {
                const headers = ['Transaction ID', 'Survey Title', 'Researcher', 'Payment Method', 'Amount', 'Status', 'Created At', 'Payment ID'];
                const csvContent = [
                  headers.join(','),
                  ...filteredTransactions.map(t => [
                    `"${t.id}"`,
                    `"${(t.form_submissions?.title || '').replace(/"/g, '""')}"`,
                    `"${(t.form_submissions?.full_name || '').replace(/"/g, '""')}"`,
                    `"${t.payment_method}"`,
                    `"${t.amount}"`,
                    `"${t.status}"`,
                    `"${new Date(t.created_at).toLocaleString()}"`,
                    `"${t.payment_id || ''}"`
                  ].join(','))
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
              }}
              variant="outline"
              className="h-10 shrink-0 bg-white border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="font-medium">Export CSV</span>
            </Button>

            {/* Prominent Revenue Display with Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className="flex items-center gap-4 bg-emerald-50 pl-4 pr-3 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100/50 hover:border-emerald-200 transition-all cursor-pointer group shadow-sm select-none"
                  role="button"
                >
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wide leading-none mb-1">Total Pendapatan</span>
                    <span className="text-lg font-bold text-emerald-700 group-hover:text-emerald-800 transition-colors leading-none">{formatCurrency(totalRevenue)}</span>
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
                  <div className="text-3xl font-extrabold text-gray-900 mb-6 tracking-tight">{formatCurrency(totalRevenue)}</div>

                  <div className="h-px bg-gray-100 w-full mb-5" />

                  <div className="space-y-4">
                    {Object.entries(categoryRevenue).map(([cat, amount]) => (
                      <div key={cat} className="flex justify-between items-center text-sm group">
                        <span className="text-gray-600 group-hover:text-gray-900 transition-colors">{cat}</span>
                        <span className="font-semibold text-gray-900 mono">{formatCurrency(amount)}</span>
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
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Bottom Row: Filters | Search & Refresh */}
        <div className="flex flex-row items-center justify-between gap-4 w-full">

          {/* Left: Status Filters */}
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { id: 'all', label: 'Semua', count: statusCounts.all },
              { id: 'pending', label: 'Menunggu', count: statusCounts.pending, color: 'bg-yellow-50 text-yellow-700' },
              { id: 'completed', label: 'Lunas', count: statusCounts.completed, color: 'bg-green-50 text-green-700' },
              { id: 'failed', label: 'Gagal', count: statusCounts.failed, color: 'bg-red-50 text-red-700' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                  ${statusFilter === tab.id
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}
                `}
              >
                {tab.label}
                {tab.id !== 'all' && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {transactions.filter(t => t.status === tab.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: Search & Refresh */}
          <div className="flex items-center gap-3">
            <div className="relative w-[400px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Cari ID transaksi, nama, atau email..."
                className="pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm w-full shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Button
              onClick={fetchTransactions}
              variant="outline"
              size="sm"
              disabled={loading}
              className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shrink-0"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-sm border-gray-200 bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-b border-gray-100">
                <TableHead className="w-[250px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Survei & Peneliti</TableHead>
                <TableHead className="w-[450px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Item & Detail</TableHead>
                <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Metode</TableHead>
                <TableHead className="text-right text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Total</TableHead>
                <TableHead className="text-center text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Status</TableHead>
                <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Tanggal</TableHead>
                <TableHead className="w-[50px] h-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                      <span className="text-muted-foreground text-sm">Memuat data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-12 w-12 bg-gray-50 rounded-full flex items-center justify-center">
                        <Filter className="h-6 w-6 text-gray-300" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">Tidak ada transaksi ditemukan</p>
                        <p className="text-sm text-gray-500">Coba ubah filter atau kata kunci pencarian Anda.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((transaction) => {
                  // Parse items logic
                  let items: any[] = [];
                  let memo = '';
                  try {
                    if (transaction.note?.startsWith('{')) {
                      const parsed = JSON.parse(transaction.note);
                      items = parsed.items || [];
                      memo = parsed.memo || '';
                    } else {
                      memo = transaction.note || '';
                    }
                  } catch (e) {
                    memo = transaction.note || '';
                  }

                  return (
                    <TableRow key={transaction.id} className="hover:bg-gray-50/50 transition-colors group">

                      <TableCell className="align-top py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-gray-900 line-clamp-2 text-sm" title={transaction.form_submissions?.title}>
                            {transaction.form_submissions?.title || 'Judul tidak tersedia'}
                          </span>
                          <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                            <div className="font-medium text-gray-700">{transaction.form_submissions?.full_name}</div>
                            <div className="text-gray-400">{transaction.form_submissions?.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <div className="space-y-3">
                          {items.length > 0 ? (
                            <div className="space-y-3">
                              {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex flex-col border-b border-gray-100 last:border-0 pb-2 last:pb-0 mb-2 last:mb-0">
                                  <div className="flex justify-between items-start text-sm">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-gray-900 font-medium text-sm">{item.name}</span>
                                      {item.category && (
                                        <span className="text-[10px] text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full w-fit">
                                          {item.category}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-end pl-4 shrink-0">
                                      <span className="text-gray-900 font-semibold text-sm">
                                        Rp {new Intl.NumberFormat('id-ID').format(item.price || 0)}
                                      </span>
                                      <span className="text-gray-400 text-[10px] whitespace-nowrap mt-0.5">x{item.qty}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 italic">Tidak ada rincian item</span>
                          )}
                          {memo && (
                            <div className="flex items-start gap-2 text-xs text-blue-600 bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100/50">
                              <span className="font-semibold shrink-0">Catatan:</span>
                              <span className="italic break-words text-blue-700">{memo}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        {getMethodBadge(transaction.payment_method)}
                      </TableCell>
                      <TableCell className="text-right align-top py-4 font-mono font-bold text-gray-900 text-sm tracking-tight">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                      <TableCell className="text-center align-top py-4">
                        {getStatusBadge(transaction.status)}
                      </TableCell>
                      <TableCell className="align-top py-4 text-xs text-gray-500">
                        {formatDate(transaction.created_at)}
                      </TableCell>
                      <TableCell className="text-right align-top py-4 pr-4">
                        {transaction.payment_url && (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                            title="Download Invoice"
                            asChild
                          >
                            <a
                              href={`/invoices/${transaction.payment_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div >
  );
}
