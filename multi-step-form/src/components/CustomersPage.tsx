import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, RefreshCw, Users, Repeat, DollarSign, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

// --- Types ---
interface RawSubmission {
  id: string;
  auth_user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  university: string | null;
  department: string | null;
  total_cost: number;
  payment_status: string | null;
  submission_status: string | null;
  title: string | null;
  created_at: string;
  actual_paid: number; // from transactions table
}

interface Customer {
  key: string;
  authUserId: string | null;
  name: string;
  email: string;
  phone: string;
  university: string;
  department: string;
  totalOrders: number;
  totalSpent: number;
  firstOrder: string;
  lastOrder: string;
  submissions: RawSubmission[];
  isLinked: boolean;
}

// --- Helpers ---
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  return digits;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Aggregation ---
function aggregateCustomers(submissions: RawSubmission[]): Customer[] {
  const customerMap = new Map<string, Customer>();
  // Phone → key lookup for merging orphans
  const phoneToKey = new Map<string, string>();
  const emailToKey = new Map<string, string>();

  // Pass 1: Group by auth_user_id (linked submissions)
  submissions.forEach(sub => {
    if (!sub.auth_user_id) return;
    const key = `auth:${sub.auth_user_id}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        key, authUserId: sub.auth_user_id, name: '', email: '', phone: '', university: '', department: '',
        totalOrders: 0, totalSpent: 0, firstOrder: sub.created_at, lastOrder: sub.created_at, submissions: [], isLinked: true,
      });
    }
    const c = customerMap.get(key)!;
    c.submissions.push(sub);
    // Track phone & email for orphan merging
    if (sub.phone_number) {
      const np = normalizePhone(sub.phone_number);
      if (np.length >= 10) phoneToKey.set(np, key);
    }
    if (sub.email) emailToKey.set(sub.email.toLowerCase(), key);
  });

  // Pass 2: Orphaned submissions (no auth_user_id)
  submissions.forEach(sub => {
    if (sub.auth_user_id) return;
    let targetKey: string | undefined;
    // Try phone match
    if (sub.phone_number) {
      const np = normalizePhone(sub.phone_number);
      if (np.length >= 10) targetKey = phoneToKey.get(np);
    }
    // Try email match
    if (!targetKey && sub.email) {
      targetKey = emailToKey.get(sub.email.toLowerCase());
    }
    if (targetKey) {
      customerMap.get(targetKey)!.submissions.push(sub);
    } else {
      // Create new unlinked customer (group by phone then email)
      let orphanKey: string | undefined;
      if (sub.phone_number) {
        const np = normalizePhone(sub.phone_number);
        if (np.length >= 10) {
          orphanKey = `phone:${np}`;
          phoneToKey.set(np, orphanKey);
        }
      }
      if (!orphanKey && sub.email) {
        orphanKey = `email:${sub.email.toLowerCase()}`;
        emailToKey.set(sub.email.toLowerCase(), orphanKey);
      }
      if (!orphanKey) orphanKey = `unknown:${sub.id}`;

      if (!customerMap.has(orphanKey)) {
        customerMap.set(orphanKey, {
          key: orphanKey, authUserId: null, name: '', email: '', phone: '', university: '', department: '',
          totalOrders: 0, totalSpent: 0, firstOrder: sub.created_at, lastOrder: sub.created_at, submissions: [], isLinked: false,
        });
      }
      customerMap.get(orphanKey)!.submissions.push(sub);
    }
  });

  // Pass 3: Compute aggregates from latest submission
  customerMap.forEach(c => {
    c.submissions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = c.submissions[0];
    c.name = latest.full_name || 'Unknown';
    c.email = latest.email || '-';
    c.phone = latest.phone_number || '-';
    c.university = latest.university || '-';
    c.department = latest.department || '-';
    c.totalOrders = c.submissions.length;
    c.totalSpent = c.submissions
      .filter(s => (s.payment_status || '').toLowerCase() === 'paid')
      .reduce((sum, s) => sum + (s.actual_paid || 0), 0);
    c.firstOrder = c.submissions[c.submissions.length - 1].created_at;
    c.lastOrder = c.submissions[0].created_at;
  });

  return Array.from(customerMap.values()).sort((a, b) => new Date(b.lastOrder).getTime() - new Date(a.lastOrder).getTime());
}

// --- Status Badge ---
function CustomerBadge({ customer }: { customer: Customer }) {
  const paidCount = customer.submissions.filter(s => (s.payment_status || '').toLowerCase() === 'paid').length;
  if (paidCount >= 5 && customer.totalSpent >= 5_000_000) return <Badge className="bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white border-none font-extrabold rounded-md px-2.5 py-0.5 shadow-lg shadow-fuchsia-500/30 tracking-wide" variant="default">✦ VVIP</Badge>;
  if (paidCount >= 3 && customer.totalSpent >= 1_000_000) return <Badge className="bg-gradient-to-r from-amber-200 to-yellow-100 text-amber-900 border border-amber-300 font-bold rounded-md px-2 py-0.5 shadow-sm" variant="outline">VIP</Badge>;
  if (customer.totalOrders >= 2) return <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-medium rounded-md px-2 py-0.5" variant="outline">Returning</Badge>;
  return <Badge className="bg-gray-50 text-gray-600 border-gray-200 font-medium rounded-md px-2 py-0.5" variant="outline">New</Badge>;
}

function SubmissionStatusBadge({ status, paymentStatus }: { status: string | null; paymentStatus: string | null }) {
  const s = status || 'in_review';
  const p = (paymentStatus || '').toLowerCase();
  if (p === 'paid') return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 rounded-md px-2 py-0.5" variant="outline">Paid</Badge>;
  const map: Record<string, string> = {
    in_review: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    spam: 'bg-orange-50 text-orange-700 border-orange-200',
    slot_reserved: 'bg-violet-50 text-violet-700 border-violet-200',
    waiting_payment: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    live: 'bg-teal-50 text-teal-700 border-teal-200',
    completed: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return <Badge className={`${map[s] || 'bg-gray-50 text-gray-600 border-gray-200'} rounded-md px-2 py-0.5`} variant="outline">{s.replace(/_/g, ' ')}</Badge>;
}

// --- Expanded Row ---
function CustomerDetail({ customer }: { customer: Customer }) {
  return (
    <div className="px-6 py-4 bg-slate-50/80 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Order History</span>
        <span className="text-[10px] text-gray-400">({customer.submissions.length} submissions)</span>
        {!customer.isLinked && (
          <Badge className="bg-orange-50 text-orange-600 border-orange-200 text-[10px] rounded-md px-1.5 py-0" variant="outline">Unlinked Account</Badge>
        )}
      </div>
      <div className="space-y-2">
        {customer.submissions.map(sub => (
          <div key={sub.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-4 py-3 hover:shadow-sm transition-shadow">
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-sm font-medium text-gray-900 truncate">{sub.title || 'Untitled Survey'}</span>
              <span className="text-[11px] text-gray-400">{formatDate(sub.created_at)}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <SubmissionStatusBadge status={sub.submission_status} paymentStatus={sub.payment_status} />
              <span className="text-sm font-semibold text-gray-700 min-w-[100px] text-right">{formatCurrency(sub.total_cost || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main Component ---
export function CustomersPage() {
  const [submissions, setSubmissions] = useState<RawSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'totalOrders' | 'totalSpent' | 'lastOrder'>('lastOrder');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      // 1. Fetch form submissions
      const { data: formData, error: formError } = await supabase
        .from('form_submissions')
        .select('id, auth_user_id, full_name, email, phone_number, university, department, total_cost, payment_status, submission_status, title, created_at')
        .order('created_at', { ascending: false });
      if (formError) throw formError;

      // 2. Fetch actual paid amounts from transactions (source of truth for revenue)
      const { data: txData } = await supabase
        .from('transactions')
        .select('form_submission_id, amount, status');

      // Build map: submission_id → total paid amount
      const paidMap = new Map<string, number>();
      (txData || []).forEach((tx: any) => {
        if (['paid', 'completed'].includes(tx.status)) {
          paidMap.set(tx.form_submission_id, (paidMap.get(tx.form_submission_id) || 0) + tx.amount);
        }
      });

      // 3. Merge actual_paid into submissions
      const merged: RawSubmission[] = (formData || []).map((sub: any) => ({
        ...sub,
        actual_paid: paidMap.get(sub.id) || 0,
      }));

      setSubmissions(merged);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast.error('Gagal memuat data customer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(); }, []);

  const customers = useMemo(() => aggregateCustomers(submissions), [submissions]);

  const filtered = useMemo(() => {
    let result = customers;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.university.toLowerCase().includes(q) ||
        c.phone.includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'totalOrders') cmp = a.totalOrders - b.totalOrders;
      else if (sortField === 'totalSpent') cmp = a.totalSpent - b.totalSpent;
      else cmp = new Date(a.lastOrder).getTime() - new Date(b.lastOrder).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [customers, searchTerm, sortField, sortAsc]);

  const stats = useMemo(() => ({
    total: customers.length,
    repeat: customers.filter(c => c.totalOrders >= 2).length,
    revenue: customers.reduce((s, c) => s + c.totalSpent, 0),
  }), [customers]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  return (
    <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]">
        {/* Top Row: Summary Cards & Refresh */}
        <div className="flex flex-row items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3">
            {[
              { label: 'Total Customers', value: stats.total, icon: Users, color: 'blue' },
              { label: 'Repeat Customers', value: stats.repeat, icon: Repeat, color: 'violet' },
              { label: 'Total Revenue', value: formatCurrency(stats.revenue), icon: DollarSign, color: 'emerald' },
            ].map(card => (
              <div key={card.label} className={`flex items-center gap-3 bg-${card.color}-50 pl-4 pr-5 py-2.5 rounded-xl border border-${card.color}-100`}>
                <div className={`h-9 w-9 bg-${card.color}-100 rounded-full flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-4 h-4 text-${card.color}-600`} />
                </div>
                <div className="flex flex-col">
                  <span className={`text-[10px] uppercase font-bold text-${card.color}-600 tracking-wide leading-none mb-1`}>{card.label}</span>
                  <span className={`text-lg font-bold text-${card.color}-700 leading-none`}>{card.value}</span>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={fetchSubmissions} variant="outline" disabled={loading}
            className="h-10 w-10 p-0 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shrink-0 shadow-sm">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Bottom Row: Search */}
        <div className="flex flex-row items-center gap-4 w-full">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Cari nama, email, universitas, atau telepon..." className="pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm w-full shadow-sm"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <span className="text-sm text-gray-400">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block flex-1 min-h-0 overflow-auto pb-4 pr-2">
        <Table className="min-w-[1000px] border-separate border-spacing-y-3">
          <TableHeader className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur shadow-sm rounded-xl">
            <TableRow className="border-none hover:bg-transparent">
              <TableHead className="w-[250px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 rounded-l-xl pl-4 cursor-pointer select-none" onClick={() => handleSort('name')}>
                Customer <SortIcon field="name" />
              </TableHead>
              <TableHead className="w-[180px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12">University</TableHead>
              <TableHead className="w-[100px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 text-center cursor-pointer select-none" onClick={() => handleSort('totalOrders')}>
                Orders <SortIcon field="totalOrders" />
              </TableHead>
              <TableHead className="w-[140px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 text-right cursor-pointer select-none" onClick={() => handleSort('totalSpent')}>
                Total Spent <SortIcon field="totalSpent" />
              </TableHead>
              <TableHead className="w-[120px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 text-center">Status</TableHead>
              <TableHead className="w-[140px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 cursor-pointer select-none rounded-r-xl pr-4" onClick={() => handleSort('lastOrder')}>
                Last Order <SortIcon field="lastOrder" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={`sk-${i}`} className="bg-white border-none shadow-sm rounded-xl">
                  <TableCell className="py-4 border-y border-l border-gray-200 rounded-l-xl pl-4">
                    <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded mb-2" /><div className="h-3 w-1/2 bg-gray-100 animate-pulse rounded" />
                  </TableCell>
                  <TableCell className="py-4 border-y border-gray-200"><div className="h-4 w-full bg-gray-200 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4 border-y border-gray-200 text-center"><div className="h-4 w-8 bg-gray-200 animate-pulse rounded mx-auto" /></TableCell>
                  <TableCell className="py-4 border-y border-gray-200 text-right"><div className="h-4 w-24 bg-gray-200 animate-pulse rounded ml-auto" /></TableCell>
                  <TableCell className="py-4 border-y border-gray-200 text-center"><div className="h-6 w-16 bg-gray-200 animate-pulse rounded-md mx-auto" /></TableCell>
                  <TableCell className="py-4 border-y border-r border-gray-200 rounded-r-xl pr-4"><div className="h-4 w-20 bg-gray-200 animate-pulse rounded" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="bg-white border-none shadow-sm rounded-xl">
                <TableCell colSpan={6} className="h-48 text-center border border-gray-200 rounded-xl">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="h-12 w-12 bg-gray-50 rounded-full flex items-center justify-center"><Users className="h-6 w-6 text-gray-300" /></div>
                    <div><p className="font-medium text-gray-900">Tidak ada customer ditemukan</p><p className="text-sm text-gray-500">Coba ubah kata kunci pencarian Anda.</p></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(customer => (
                <>
                  <TableRow key={customer.key} onClick={() => setExpandedKey(expandedKey === customer.key ? null : customer.key)}
                    className={`bg-white hover:bg-gray-50/80 transition-shadow shadow-sm hover:shadow border-none rounded-xl cursor-pointer group ${expandedKey === customer.key ? 'ring-2 ring-blue-200' : ''}`}>
                    <TableCell className="py-4 border-y border-l border-gray-200 rounded-l-xl pl-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-gray-900 text-sm">{customer.name}</span>
                        <span className="text-xs text-gray-400">{customer.email}</span>
                        {customer.phone !== '-' && <span className="text-[11px] text-gray-400">{customer.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-4 border-y border-gray-200">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm text-gray-700">{customer.university}</span>
                        <span className="text-xs text-gray-400">{customer.department}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 border-y border-gray-200 text-center">
                      <span className="text-sm font-semibold text-gray-900">{customer.totalOrders}</span>
                    </TableCell>
                    <TableCell className="py-4 border-y border-gray-200 text-right">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(customer.totalSpent)}</span>
                    </TableCell>
                    <TableCell className="py-4 border-y border-gray-200 text-center">
                      <CustomerBadge customer={customer} />
                    </TableCell>
                    <TableCell className="py-4 border-y border-r border-gray-200 rounded-r-xl pr-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{formatDate(customer.lastOrder)}</span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedKey === customer.key ? 'rotate-180' : ''}`} />
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedKey === customer.key && (
                    <tr key={`${customer.key}-detail`}>
                      <td colSpan={6} className="p-0">
                        <div className="mx-1 mb-3 rounded-b-xl border border-t-0 border-gray-200 overflow-hidden">
                          <CustomerDetail customer={customer} />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden flex-1 overflow-auto pb-4 space-y-3 mt-3">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={`msk-${i}`} className="border-gray-100 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="h-5 w-40 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
                <div className="flex gap-4"><div className="h-4 w-20 bg-gray-100 animate-pulse rounded" /><div className="h-4 w-24 bg-gray-100 animate-pulse rounded" /></div>
              </CardContent>
            </Card>
          ))
        ) : filtered.map(customer => (
          <Card key={customer.key} className={`border-gray-100 shadow-sm cursor-pointer hover:shadow transition-shadow ${expandedKey === customer.key ? 'ring-2 ring-blue-200' : ''}`}
            onClick={() => setExpandedKey(expandedKey === customer.key ? null : customer.key)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{customer.name}</p>
                  <p className="text-xs text-gray-400">{customer.email}</p>
                </div>
                <CustomerBadge customer={customer} />
              </div>
              <p className="text-xs text-gray-500 mb-3">{customer.university} · {customer.department}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{customer.totalOrders} order{customer.totalOrders > 1 ? 's' : ''}</span>
                <span className="font-semibold text-gray-900">{formatCurrency(customer.totalSpent)}</span>
                <span className="text-gray-400">{formatDate(customer.lastOrder)}</span>
              </div>
            </CardContent>
            {expandedKey === customer.key && <CustomerDetail customer={customer} />}
          </Card>
        ))}
      </div>
    </div>
  );
}
