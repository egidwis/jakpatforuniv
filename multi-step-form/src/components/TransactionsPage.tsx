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
  CardHeader,
} from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, RefreshCw, Trash2, Download } from 'lucide-react';

// Assuming deleteTransaction is a named export from supabase utility
// If supabase itself is still needed, it would be:
// import { supabase, deleteTransaction } from '../utils/supabase';
// For this change, we'll assume deleteTransaction is a named export.
// If `getTransactions` is also needed, it should be added here.
import { deleteTransactions } from '../utils/supabase';


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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState(-1); // Default: Semua Bulan
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
      completed: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200',
      pending: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200',
      failed: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200',
    };

    const labels: Record<string, string> = {
      completed: 'Lunas',
      pending: 'Menunggu',
      failed: 'Gagal',
    };

    return (
      <Badge variant="outline" className={`${styles[status] || 'bg-gray-100 text-gray-700'} font-medium`}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getMethodBadge = (method: string) => {
    if (method === 'mayar_manual_invoice') {
      return <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100">Invoice Manual</Badge>;
    }
    if (method === 'mayar') {
      return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100">Mayar</Badge>;
    }
    return <Badge variant="outline">{method}</Badge>;
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredTransactions.map(t => t.id).filter(id => id !== undefined) as string[]);
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (window.confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.size} transaksi yang dipilih?`)) {
      try {
        setLoading(true);
        await deleteTransactions(Array.from(selectedIds));
        toast.success(`${selectedIds.size} transaksi berhasil dihapus`);
        setSelectedIds(new Set());
        fetchTransactions();
      } catch (error) {
        toast.error('Gagal menghapus transaksi');
        console.error(error);
        setLoading(false);
      }
    }
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
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

    return matchesSearch && isSameMonth && isSameYear;
  });

  const totalRevenue = filteredTransactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  const categoryRevenue = filteredTransactions
    .filter(t => t.status === 'completed')
    .reduce((acc, t) => {
      try {
        if (t.note?.startsWith('{')) {
          const parsed = JSON.parse(t.note);
          const items = parsed.items || [];
          items.forEach((item: any) => {
            const cat = item.category || 'Lainnya';
            const total = (item.price || 0) * (item.qty || 1);
            acc[cat] = (acc[cat] || 0) + total;
          });
        } else {
          // Fallback for non-JSON notes if needed, or ignore
          const cat = 'Lainnya';
          acc[cat] = (acc[cat] || 0) + t.amount;
        }
      } catch (e) {
        console.error('Error parsing note for category revenue:', e);
      }
      return acc;
    }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="text-left w-full sm:w-auto">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Transaksi</h1>
          <p className="text-muted-foreground mt-1 text-left">
            Pantau semua pembayaran dan status transaksi.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            onClick={fetchTransactions}
            variant="outline"
            disabled={loading}
            className="h-10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

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
            className="h-10"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm border-gray-200 bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-500">Total Pendapatan (Lunas)</p>
              <h2 className="text-2xl font-bold text-gray-900 mt-1 mb-3">
                {formatCurrency(totalRevenue)}
              </h2>
              <div className="space-y-1.5 border-t pt-3">
                {Object.entries(categoryRevenue).length > 0 ? (
                  Object.entries(categoryRevenue).map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 truncate mr-2" title={cat}>{cat}</span>
                      <span className="font-medium text-gray-900 whitespace-nowrap">{formatCurrency(amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 italic">Tidak ada detail kategori</p>
                )}
              </div>
            </div>
            <div className="h-10 w-10 bg-green-50 rounded-full flex items-center justify-center self-start">
              <span className="text-green-600 font-bold">$</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200 bg-white">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Bulan</label>
              <select
                className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              >
                <option value={-1}>Semua Bulan</option>
                {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tahun</label>
              <select
                className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {[2024, 2025, 2026, 2027].map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Cari transaksi..."
                className="pl-9 bg-white w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {selectedIds.size > 0 && (
              <Button
                onClick={handleBulkDelete}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Hapus ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-[50px]">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    checked={filteredTransactions.length > 0 && selectedIds.size === filteredTransactions.length}
                    onChange={(e) => handleToggleSelectAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="w-[250px] font-semibold">Survei & Peneliti</TableHead>
                <TableHead className="w-[250px] font-semibold">Item & Detail</TableHead>
                <TableHead className="font-semibold">Metode</TableHead>
                <TableHead className="text-right font-semibold">Total</TableHead>
                <TableHead className="font-semibold text-center">Status</TableHead>
                <TableHead className="font-semibold">Tanggal</TableHead>
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
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                    Belum ada transaksi yang ditemukan.
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
                    <TableRow key={transaction.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="align-top py-4">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                          checked={selectedIds.has(transaction.id!)}
                          onChange={(e) => handleToggleSelect(transaction.id!, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-gray-900 line-clamp-2" title={transaction.form_submissions?.title}>
                            {transaction.form_submissions?.title || 'Judul tidak tersedia'}
                          </span>
                          <div className="text-sm text-muted-foreground mt-1">
                            <div className="font-medium">{transaction.form_submissions?.full_name}</div>
                            <div className="text-xs">{transaction.form_submissions?.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <div className="space-y-2">
                          {items.length > 0 ? (
                            <div className="bg-gray-50 rounded-md p-2 border border-gray-100 space-y-1">
                              {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex flex-col border-b border-gray-100 last:border-0 pb-1 last:pb-0 mb-1 last:mb-0">
                                  <div className="flex justify-between items-start text-sm">
                                    <div className="flex flex-col">
                                      <span className="text-gray-700 font-medium">{item.name}</span>
                                      {item.category && (
                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded w-fit mt-0.5">
                                          {item.category}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-gray-900 font-medium text-xs">
                                        Rp {new Intl.NumberFormat('id-ID').format(item.price || 0)}
                                      </span>
                                      <span className="text-gray-500 text-xs whitespace-nowrap">x{item.qty}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 italic">Tidak ada rincian item</span>
                          )}
                          {memo && (
                            <div className="flex items-start gap-1.5 text-xs text-blue-600 bg-blue-50 p-1.5 rounded w-fit max-w-full">
                              <span className="font-medium shrink-0">Catatan:</span>
                              <span className="italic break-words">{memo}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        {getMethodBadge(transaction.payment_method)}
                      </TableCell>
                      <TableCell className="text-right align-top py-4 font-mono font-medium text-gray-900">
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                      <TableCell className="text-center align-top py-4">
                        {getStatusBadge(transaction.status)}
                      </TableCell>
                      <TableCell className="align-top py-4 text-sm text-gray-500">
                        {formatDate(transaction.created_at)}
                      </TableCell>
                      <TableCell className="text-right align-top py-4">
                        {transaction.payment_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
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
