import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RefreshCw, Users, ChevronDown, ChevronUp, ArrowDownWideNarrow, ListFilter, X } from 'lucide-react';
import { cn, useMediaQuery } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  type RawSubmission,
  type CustomerProfileRow,
  aggregateCustomers,
  mergeProfileOnlyCustomers,
  customerTier,
  orderTime,
} from './customers/types';
import { CustomerListRow } from './customers/CustomerListRow';
import { CustomerDetailSheet } from './customers/CustomerDetailSheet';
import { fetchProfileNames } from '../utils/profileNames';

type TierTab = 'all' | 'vip' | 'returning' | 'new';

export function CustomersPage() {
  const [submissions, setSubmissions] = useState<RawSubmission[]>([]);
  const [profileRows, setProfileRows] = useState<CustomerProfileRow[]>([]);
  const [authNames, setAuthNames] = useState<Map<string, { name: string; email: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierTab, setTierTab] = useState<TierTab>('all');
  const [openCustomerKey, setOpenCustomerKey] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recency' | 'name_asc' | 'name_desc' | 'orders_desc' | 'spent_desc'>('recency');

  const isXl = useMediaQuery('(min-width: 1280px)');

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      // 1. Fetch form submissions
      const { data: formData, error: formError } = await supabase
        .from('form_submissions')
        .select('id, auth_user_id, full_name, email, phone_number, university, department, status, total_cost, payment_status, submission_status, title, created_at')
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

      // 4. Semua profil customer (akun terdaftar) — termasuk yang belum pernah
      // submit, agar customer pra-submission ikut tampil (sql/32).
      const { data: profileData, error: profileError } = await supabase.rpc('get_customer_profiles');
      if (profileError) console.error('Error fetching customer profiles:', profileError);

      setSubmissions(merged);
      setProfileRows((profileData as CustomerProfileRow[]) || []);
      setAuthNames(await fetchProfileNames(merged.map((s) => s.auth_user_id)));
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast.error('Gagal memuat data customer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubmissions(); }, []);

  const customers = useMemo(
    () => mergeProfileOnlyCustomers(aggregateCustomers(submissions, authNames), profileRows),
    [submissions, authNames, profileRows]
  );

  // Tab counts come from the full list — search must not change them
  const tierCounts = useMemo(() => {
    const counts = { vip: 0, returning: 0, new: 0 };
    customers.forEach((c) => {
      const tier = customerTier(c);
      if (tier === 'vvip' || tier === 'vip') counts.vip += 1;
      else counts[tier] += 1;
    });
    return counts;
  }, [customers]);

  const filtered = useMemo(() => {
    let result = customers;
    if (tierTab !== 'all') {
      result = result.filter((c) => {
        const tier = customerTier(c);
        return tierTab === 'vip' ? tier === 'vvip' || tier === 'vip' : tier === tierTab;
      });
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.university.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.invoiceNames.some((n) => n.name.toLowerCase().includes(q))
      );
    }
    // Sort logic
    if (sortBy === 'name_asc') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name_desc') {
      result = [...result].sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === 'orders_desc') {
      result = [...result].sort((a, b) => b.totalOrders - a.totalOrders);
    } else if (sortBy === 'spent_desc') {
      result = [...result].sort((a, b) => b.totalSpent - a.totalSpent);
    } else {
      // Default: lastOrder desc (customer pra-submission tanpa order di bawah)
      result = [...result].sort((a, b) => orderTime(b.lastOrder) - orderTime(a.lastOrder));
    }
    return result;
  }, [customers, tierTab, searchTerm, sortBy]);

  const openCustomer = openCustomerKey
    ? filtered.find((c) => c.key === openCustomerKey) ??
      customers.find((c) => c.key === openCustomerKey) ??
      null
    : null;

  const cycleNameSort = () => {
    setSortBy((s) => {
      if (s === 'recency') return 'name_asc';
      if (s === 'name_asc') return 'name_desc';
      return 'recency';
    });
  };

  return (
    <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">
      {/* Unified list surface — toolbar, tabs, column header, rows, footer in one card
         (mirrors the Keuangan/submissions desktop pattern) */}
      <div className="flex-1 min-h-0 flex bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Toolbar row 1: search · counter · active filter · refresh */}
          <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-[200px] max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Cari nama, email, universitas, telepon, atau nama invoice..."
                className="w-full pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {filtered.length} customer{filtered.length !== 1 ? 's' : ''}
            </span>
            {tierTab !== 'all' && (
              <button
                onClick={() => setTierTab('all')}
                className="flex items-center gap-1 rounded-full bg-slate-800 text-white text-[11px] font-semibold pl-2.5 pr-1.5 py-1 transition-colors hover:bg-slate-700"
                title="Hapus filter tier"
              >
                Tier: {tierTab === 'vip' ? 'VIP/VVIP' : tierTab === 'returning' ? 'Returning' : 'New'}
                <X className="w-3 h-3 ml-0.5" />
              </button>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                    title="Filter Tier Customer"
                  >
                    <ListFilter className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white p-1 border shadow-md rounded-md z-50">
                  <DropdownMenuItem
                    onClick={() => setTierTab('all')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none flex justify-between items-center',
                      tierTab === 'all' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    <span>Semua</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTierTab('vip')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none flex justify-between items-center',
                      tierTab === 'vip' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    <span>VIP/VVIP</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md font-bold">
                      {tierCounts.vip}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTierTab('returning')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none flex justify-between items-center',
                      tierTab === 'returning' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    <span>Returning</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md font-bold">
                      {tierCounts.returning}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTierTab('new')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none flex justify-between items-center',
                      tierTab === 'new' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    <span>New</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md font-bold">
                      {tierCounts.new}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                    title="Urutkan customer"
                  >
                    <ArrowDownWideNarrow className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white p-1 border shadow-md rounded-md z-50">
                  <DropdownMenuItem
                    onClick={() => setSortBy('recency')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none',
                      sortBy === 'recency' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    Order Terakhir (Default)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy('name_asc')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none',
                      sortBy === 'name_asc' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    Nama (A - Z)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy('name_desc')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none',
                      sortBy === 'name_desc' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    Nama (Z - A)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy('orders_desc')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none',
                      sortBy === 'orders_desc' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    Total Order Terbanyak
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy('spent_desc')}
                    className={cn(
                      'px-2.5 py-2 text-xs rounded cursor-pointer transition-colors hover:bg-slate-100/80 outline-none',
                      sortBy === 'spent_desc' ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                    )}
                  >
                    Total Spent Terbanyak
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={fetchSubmissions}
                variant="ghost"
                size="icon"
                disabled={loading}
                className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Rows & Header scrollable region */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Sticky column header — widths mirror CustomerListRow */}
            <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              <span className="hidden md:block w-[110px] shrink-0">ID</span>
              <button
                type="button"
                onClick={cycleNameSort}
                // styles.css resets text-transform on buttons — re-apply uppercase here
                className="flex-[1.5] min-w-0 text-left cursor-pointer select-none uppercase hover:text-gray-700 transition-colors"
              >
                Customer
                {sortBy === 'name_asc' && <ChevronUp className="w-3 h-3 inline ml-0.5" />}
                {sortBy === 'name_desc' && <ChevronDown className="w-3 h-3 inline ml-0.5" />}
              </button>
              <span className="hidden lg:block flex-1 min-w-[220px] shrink-0">University</span>
              <span className="hidden sm:block w-[70px] shrink-0 text-center">Orders</span>
              <span className="hidden sm:block w-[110px] shrink-0 text-right">Spent</span>
              <span className="w-[92px] shrink-0">Status</span>
              <span className="w-4 shrink-0" />
            </div>
            {loading ? (
              <div className="divide-y divide-gray-100">
                {Array(8).fill(0).map((_, i) => (
                  <div key={`skeleton-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="hidden md:block w-[110px] shrink-0">
                      <div className="h-4 w-full bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="h-4 w-3/5 bg-gray-200 animate-pulse rounded mb-1.5" />
                      <div className="h-2.5 w-2/5 bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="hidden lg:block w-[220px] shrink-0">
                      <div className="h-4 w-4/5 bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="h-5 w-[92px] bg-gray-100 animate-pulse rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-50 rounded-full mb-3">
                  <Users className="w-7 h-7 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold mb-1 text-gray-900">Tidak ada customer ditemukan</h3>
                <p className="text-sm text-gray-500">Coba ubah filter atau kata kunci pencarian Anda.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map((customer) => (
                  <CustomerListRow
                    key={customer.key}
                    customer={customer}
                    onOpen={setOpenCustomerKey}
                    active={isXl && customer.key === openCustomerKey}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer count */}
          <div className="shrink-0 border-t border-gray-200 px-4 py-3 text-sm text-gray-500">
            Total: <span className="font-bold text-gray-900">{filtered.length}</span> customer
          </div>
        </div>

        {/* Inline reading pane (Outlook split view) */}
        {isXl && openCustomer && (
          <CustomerDetailSheet
            variant="pane"
            customer={openCustomer}
            onOpenChange={(open) => !open && setOpenCustomerKey(null)}
          />
        )}
      </div>

      {/* Detail drawer (narrow screens) — ≥1280px uses the inline pane instead */}
      {!isXl && (
        <CustomerDetailSheet
          customer={openCustomer}
          onOpenChange={(open) => !open && setOpenCustomerKey(null)}
        />
      )}
    </div>
  );
}
