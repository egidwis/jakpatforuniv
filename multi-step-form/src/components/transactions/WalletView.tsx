import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import {
  Loader2,
  RefreshCw,
  Wallet,
  Send,
  Building2,
  User,
  FileText,
  CheckCircle2,
  History,
} from 'lucide-react';
import { useMediaQuery } from '@/lib/utils';
import { supabase } from '@/utils/supabase';

// /api/doku/sac/* is admin-gated by functions/api/doku/_middleware.js — every
// request must carry the Supabase access token. getSession() (instead of
// useAuth()) avoids a race where the first fetch fires before context loads.
const authHeaders = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
};

interface WalletViewProps {
  sacId?: string;
  productName?: string;
}

const COMMON_BANKS = [
  { code: 'CENAIDJA', name: 'Bank BCA' },
  { code: 'BNINIDJA', name: 'Bank BNI' },
  { code: 'BRINIDJA', name: 'Bank BRI' },
  { code: 'BMRIIDJA', name: 'Bank Mandiri' },
  { code: 'BNIAIDJA', name: 'Bank CIMB Niaga' },
  { code: 'BBBAIDJA', name: 'Bank Permata' },
  { code: 'BSMDIDJA', name: 'Bank Syariah Indonesia (BSI)' },
];

/**
 * Full-page DOKU Sub Account wallet (formerly DokuWalletModal): balance +
 * payout form on the left, withdrawal history on the right. Columns stack
 * on narrow screens via useMediaQuery (styles.css breaks lg:grid-cols-2).
 */
export function WalletView({
  sacId = 'SAC-7926-1778565828595', // Default JFU SAC ID
  productName = 'Jakpat for Universities',
}: WalletViewProps) {
  const isLg = useMediaQuery('(min-width: 1024px)');

  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balance, setBalance] = useState<{ available: string; pending: string } | null>(null);

  // Payout form state
  const [amount, setAmount] = useState('');
  const [bankCode, setBankCode] = useState(COMMON_BANKS[0].code);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // History state
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchBalance = async () => {
    if (!sacId) return;
    setLoadingBalance(true);
    try {
      const response = await fetch(`/api/doku/sac/balance?account_id=${sacId}`, {
        headers: await authHeaders(),
      });
      const data = await response.json();
      if (response.ok && data.balance) {
        setBalance(data.balance);
      } else {
        toast.error(data.error || 'Gagal memuat saldo DOKU');
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error('Terjadi kesalahan koneksi');
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchHistory = async () => {
    if (!sacId) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/doku/sac/history?account_id=${sacId}`, {
        headers: await authHeaders(),
      });
      const data = await response.json();
      if (response.ok && data.data) {
        setHistoryData(data.data);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchHistory();
    setInvoiceNumber(`WDR/JFU/${Date.now()}`);
  }, [sacId]);

  const handlePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Jumlah penarikan tidak valid');
      return;
    }

    if (!accountNumber || !accountName) {
      toast.error('Mohon lengkapi detail rekening tujuan');
      return;
    }

    setSubmittingPayout(true);
    try {
      const response = await fetch('/api/doku/sac/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          account_id: sacId,
          amount: numAmount,
          invoice_number: invoiceNumber || `WDR/JFU/${Date.now()}`,
          bank_code: bankCode,
          bank_account_number: accountNumber,
          bank_account_name: accountName,
          description: description,
        }),
      });

      const data = await response.json();

      if (response.ok && data.payout?.status === 'SUCCESS') {
        toast.success('Payout berhasil dikirim!');
        setAmount('');
        setAccountNumber('');
        setAccountName('');
        setDescription('');
        setInvoiceNumber(`WDR/JFU/${Date.now()}`);
        setTimeout(() => {
          fetchBalance();
          fetchHistory();
        }, 1500);
      } else {
        let errorMessage = 'Gagal mengirim payout';
        if (typeof data.error === 'string') {
          errorMessage = data.error;
        } else if (data.error?.message) {
          errorMessage = data.error.message;
        } else if (data.message) {
          errorMessage = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        } else if (data.payout?.status) {
          errorMessage = data.payout.status;
        } else if (data.error) {
          errorMessage = JSON.stringify(data.error);
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Payout error:', error);
      toast.error('Terjadi kesalahan saat memproses payout');
    } finally {
      setSubmittingPayout(false);
    }
  };

  const formatIDR = (val?: string) => {
    if (!val) return 'Rp 0';
    const num = parseInt(val, 10);
    return isNaN(num) ? 'Rp 0' : `Rp ${new Intl.NumberFormat('id-ID').format(num)}`;
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pb-4">
      {/* Page intro */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-slate-900 rounded-xl shrink-0">
          <Wallet className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">DOKU Sub Account Wallet</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {productName} ·{' '}
            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{sacId}</span>
          </p>
        </div>
      </div>

      <div className={isLg ? 'flex flex-row items-start gap-4' : 'flex flex-col gap-4'}>
        {/* Left column: balance + payout form */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Balance card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100/80 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600/80">
                Saldo Tersedia (Available)
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchBalance}
                disabled={loadingBalance}
                className="h-7 w-7 text-blue-600 hover:bg-blue-100/50 -mr-1"
                title="Refresh saldo"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBalance ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loadingBalance ? (
                <div className="h-9 w-40 bg-blue-200/50 animate-pulse rounded-lg my-0.5" />
              ) : (
                formatIDR(balance?.available)
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-blue-100/60 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Saldo Tertunda (Pending):</span>
              <span className="font-bold text-amber-600">
                {loadingBalance ? '...' : formatIDR(balance?.pending)}
              </span>
            </div>
          </div>

          {/* Info card */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs space-y-2 text-slate-600">
            <p className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              Informasi Rekening SAC
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500">
              <li>Setiap pembayaran terverifikasi akan otomatis masuk ke saldo Sub Account ini.</li>
              <li>Tarik dana dapat dilakukan kapan saja ke bank tujuan yang terdaftar.</li>
              <li>Pastikan nama pemilik rekening sesuai untuk menghindari kegagalan transfer bank.</li>
            </ul>
          </div>

          {/* Payout form card */}
          <form
            onSubmit={handlePayout}
            className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm"
          >
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" /> Kirim Payout
            </h3>
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
              <span className="bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded text-[9px] mt-0.5 shrink-0">
                INFO
              </span>
              <span>
                Dana akan ditarik langsung dari <strong>Saldo Tersedia</strong> Sub Account ke
                rekening bank tujuan secara real-time.
              </span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Jumlah Penarikan (Rp)*</Label>
              <Input
                type="text"
                placeholder="Contoh: 500000"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                required
                className="font-semibold text-sm"
              />
              {amount && (
                <span className="text-[10px] text-blue-600 font-medium pl-1">
                  Format: {formatIDR(amount)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Bank Tujuan*</Label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                  <select
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className="w-full h-9 pl-8 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {COMMON_BANKS.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Nomor Rekening*</Label>
                <Input
                  type="text"
                  placeholder="Contoh: 1234567890"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  required
                  className="h-9 text-xs font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Nama Pemilik Rekening*</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Sesuai buku tabungan"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                  className="h-9 pl-8 text-xs font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Nomor Invoice / Referensi</Label>
              <div className="relative">
                <FileText className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="WDR/JFU/..."
                  className="h-9 pl-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Deskripsi / Keterangan</Label>
              <div className="relative">
                <FileText className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Pencairan dana campaign BNI"
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submittingPayout || !amount || !accountNumber || !accountName}
              className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-10 font-semibold shadow-sm"
            >
              {submittingPayout ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Memproses...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Kirim Payout
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right column: withdrawal history */}
        <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" /> Riwayat Penarikan
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchHistory}
              disabled={loadingHistory}
              className="h-7 w-7 text-gray-500 hover:text-gray-900"
              title="Refresh riwayat"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="p-4 space-y-3">
            {loadingHistory ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Memuat riwayat...</span>
              </div>
            ) : historyData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <History className="w-10 h-10 text-slate-200" />
                <span className="text-sm font-medium text-slate-500">Belum ada riwayat penarikan</span>
              </div>
            ) : (
              historyData.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 bg-white border border-slate-100 shadow-sm rounded-xl hover:border-blue-100 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-slate-800">{formatIDR(item.amount)}</div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5">
                        {item.bank_code} • {item.bank_account_number}
                      </div>
                    </div>
                    <div
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === 'SUCCESS'
                          ? 'bg-emerald-50 text-emerald-600'
                          : item.status === 'FAILED'
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {item.status}
                    </div>
                  </div>
                  {item.description && (
                    <div className="text-xs text-slate-600 mb-2 bg-slate-50 p-2 rounded-lg italic">
                      "{item.description}"
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                    <span className="font-mono">{item.invoice_number}</span>
                    <span>{new Date(item.created_at).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
