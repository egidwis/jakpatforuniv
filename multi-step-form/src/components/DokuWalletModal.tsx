import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Wallet, Send, Building2, User, FileText, CheckCircle2 } from 'lucide-react';

interface DokuWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  sacId?: string;
  productName?: string;
}

const COMMON_BANKS = [
  { code: '014', name: 'Bank BCA' },
  { code: '009', name: 'Bank BNI' },
  { code: '002', name: 'Bank BRI' },
  { code: '008', name: 'Bank Mandiri' },
  { code: '022', name: 'Bank CIMB Niaga' },
  { code: '013', name: 'Bank Permata' },
  { code: '451', name: 'Bank Syariah Indonesia (BSI)' },
];

export function DokuWalletModal({ 
  isOpen, 
  onClose, 
  sacId = 'SAC-7926-1778565828595', // Default JFU SAC ID
  productName = 'Jakpat for Universities'
}: DokuWalletModalProps) {
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balance, setBalance] = useState<{ available: string; pending: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'payout'>('overview');

  // Payout Form State
  const [amount, setAmount] = useState('');
  const [bankCode, setBankCode] = useState(COMMON_BANKS[0].code);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const fetchBalance = async () => {
    if (!sacId) return;
    setLoadingBalance(true);
    try {
      const response = await fetch(`/api/doku/sac/balance?account_id=${sacId}`);
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

  useEffect(() => {
    if (isOpen) {
      fetchBalance();
      // Auto-generate invoice number prefix
      setInvoiceNumber(`WDR/JFU/${Date.now()}`);
    }
  }, [isOpen, sacId]);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: sacId,
          amount: numAmount,
          invoice_number: invoiceNumber || `WDR/JFU/${Date.now()}`,
          bank_code: bankCode,
          bank_account_number: accountNumber,
          bank_account_name: accountName
        })
      });

      const data = await response.json();

      if (response.ok && data.payout?.status === 'SUCCESS') {
        toast.success('Payout berhasil dikirim!');
        // Reset form
        setAmount('');
        setAccountNumber('');
        setAccountName('');
        setInvoiceNumber(`WDR/JFU/${Date.now()}`);
        setActiveTab('overview');
        // Refresh balance after a short delay
        setTimeout(fetchBalance, 1500);
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Premium Gradient Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-6 pt-6 pb-5 text-white relative">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 shrink-0">
              <Wallet className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white leading-tight">
                DOKU Sub Account Wallet
              </DialogTitle>
              <DialogDescription className="text-xs text-blue-200/80 mt-0.5">
                {productName} • <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[11px]">{sacId?.substring(0, 13)}...</span>
              </DialogDescription>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 mt-6 bg-white/10 p-1 rounded-xl backdrop-blur-sm border border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'overview' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Saldo & Info
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payout')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'payout' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Kirim Payout / Tarik Dana
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === 'overview' ? (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Balance Card */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100/80 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600/80">Saldo Tersedia (Available)</span>
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

              {/* Quick Actions / Instructions */}
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

              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm h-10 font-semibold"
                onClick={() => setActiveTab('payout')}
              >
                <Send className="w-4 h-4 mr-2" />
                Buat Payout Baru
              </Button>
            </div>
          ) : (
            /* Payout Form Tab */
            <form onSubmit={handlePayout} className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
                <span className="bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded text-[9px] mt-0.5 shrink-0">INFO</span>
                <span>Dana akan ditarik langsung dari <strong>Saldo Tersedia</strong> Sub Account ke rekening bank tujuan secara real-time.</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Jumlah Penarikan (Rp)*</Label>
                <Input
                  type="text"
                  placeholder="Contoh: 500000"
                  value={amount}
                  onChange={(e) => {
                    const numeric = e.target.value.replace(/[^0-9]/g, '');
                    setAmount(numeric);
                  }}
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

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 text-xs h-9"
                  onClick={() => setActiveTab('overview')}
                  disabled={submittingPayout}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={submittingPayout || !amount || !accountNumber || !accountName}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs h-9 font-semibold shadow-sm"
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
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
