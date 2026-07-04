# Keuangan Page Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin Transactions page as "Keuangan" with two tabs — a submissions-style compact transaction list (detail in drawer/reading-pane) and a full-page DOKU Wallet view extracted from the current modal.

**Architecture:** Mirror the submissions visual refresh exactly: compact clickable rows + a `TransactionDetailSheet` with `variant: 'sheet' | 'pane'` reusing `data-list/DetailSheet` and `data-list/DetailPane` (inline pane at ≥1280px via `useMediaQuery`, right drawer below). Wallet logic moves verbatim from `DokuWalletModal` into a two-column `WalletView`. No data-layer changes.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind, shadcn-style components in `src/components/ui`, Supabase JS client, sonner toasts, lucide icons.

**Spec:** `docs/superpowers/specs/2026-07-04-finance-page-revamp-design.md`

## Global Constraints

- All paths below are relative to `multi-step-form/` unless prefixed otherwise. Run all npm commands from `multi-step-form/`.
- Work on a new branch `feat/finance-page-revamp` created from `feat/submissions-visual-refresh` (dependencies `src/components/data-list/*` and `src/components/ui/chip.tsx` only exist there).
- **No test runner exists in this repo** (scripts are only dev/build/typecheck/lint/preview/deploy). Verification per task = `npm run typecheck` passes; final task adds `npm run build` + manual dev-server QA. Do not add a test framework.
- **CSS cascade trap:** `src/styles.css` loads AFTER Tailwind and defines unconditional `.flex`, `.flex-col`, `.flex-1`, `.grid`, `.grid-cols-1`, `.items-center`. Therefore NEVER rely on responsive variants of those properties (`hidden md:flex`, `lg:flex-row`, `lg:grid-cols-2` are silently broken). For responsive layout switches use `useMediaQuery` conditional rendering; for responsive hiding use plain wrappers with `hidden sm:block` / `md:hidden` on elements that carry NO `flex`/`grid` class (`.hidden` and `.block` are NOT in styles.css — safe).
- Copy/labels are Indonesian: Lunas / Menunggu / Gagal, tab labels `Transaksi` and `Wallet`, sidebar label `Keuangan`.
- Mayar handling is display-only legacy (badge "Mayar (legacy)"); never add new Mayar flows.
- `DokuWalletModal.tsx` stays on disk (deleted only after user QA); this plan just removes all imports/usages of it.
- Keep Supabase query, filter logic, CSV export, and revenue computation semantics identical to the current `TransactionsPage.tsx`.
- Commit after every task with the exact messages given; end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Branch + shared transaction types/helpers

**Files:**
- Create: `src/components/transactions/types.ts`

**Interfaces:**
- Consumes: `ChipVariant` from `src/components/ui/chip.tsx`, `formatPaymentChannel(channel: string): string` from `src/utils/paymentChannel.ts`.
- Produces (used by Tasks 2, 3, 5):
  - `interface Transaction` (exact shape below)
  - `parseTransactionNote(note?: string): { items: TransactionItem[]; memo: string }`
  - `formatIDR(amount: number): string`
  - `STATUS_LABELS: Record<Transaction['status'], string>`
  - `STATUS_CHIP_VARIANTS: Record<Transaction['status'], ChipVariant>`
  - `methodChipInfo(method: string, channel?: string | null): { label: string; variant: ChipVariant }`

- [ ] **Step 1: Create the branch**

```bash
cd /Users/jakpat/GarCode/jakpatforuniv
git checkout feat/submissions-visual-refresh
git checkout -b feat/finance-page-revamp
```

- [ ] **Step 2: Write `src/components/transactions/types.ts`**

```ts
import type { ChipVariant } from '../ui/chip';
import { formatPaymentChannel } from '../../utils/paymentChannel';

export interface Transaction {
  id: string;
  payment_id: string;
  payment_method: string;
  payment_channel?: string | null;
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

export interface TransactionItem {
  name: string;
  category?: string;
  price?: number;
  qty?: number;
}

export interface ParsedNote {
  items: TransactionItem[];
  memo: string;
}

/** `note` is either plain text (memo) or JSON `{ items, memo }`. */
export function parseTransactionNote(note?: string): ParsedNote {
  if (note?.startsWith('{')) {
    try {
      const parsed = JSON.parse(note);
      return { items: parsed.items || [], memo: parsed.memo || '' };
    } catch {
      return { items: [], memo: note || '' };
    }
  }
  return { items: [], memo: note || '' };
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const STATUS_LABELS: Record<Transaction['status'], string> = {
  completed: 'Lunas',
  pending: 'Menunggu',
  failed: 'Gagal',
};

export const STATUS_CHIP_VARIANTS: Record<Transaction['status'], ChipVariant> = {
  completed: 'green',
  pending: 'amber',
  failed: 'red',
};

export function methodChipInfo(
  method: string,
  channel?: string | null
): { label: string; variant: ChipVariant } {
  if (method === 'doku') {
    return { label: channel ? formatPaymentChannel(channel) : 'DOKU', variant: 'blue' };
  }
  // LEGACY: transaksi lama dibuat lewat Mayar (gateway lama, sudah diganti DOKU).
  // Dipertahankan agar data historis tetap tampil — tidak ada flow Mayar baru.
  if (method === 'mayar') {
    return { label: 'Mayar (legacy)', variant: 'amber' };
  }
  if (method === 'mayar_manual_invoice') {
    return { label: 'Invoice Manual', variant: 'purple' };
  }
  return { label: method, variant: 'slate' };
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd multi-step-form && npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add multi-step-form/src/components/transactions/types.ts
git commit -m "feat(admin): shared transaction types and chip helpers for Keuangan revamp"
```

---

### Task 2: TransactionListRow

**Files:**
- Create: `src/components/transactions/TransactionListRow.tsx`

**Interfaces:**
- Consumes from Task 1: `Transaction`, `formatIDR`, `STATUS_LABELS`, `STATUS_CHIP_VARIANTS`, `methodChipInfo`.
- Produces (used by Task 5): `TransactionListRow({ transaction, onOpen, active }: { transaction: Transaction; onOpen: (id: string) => void; active?: boolean })`.

Row anatomy per spec: `tanggal+jam · #payment_id · judul (subtitle peneliti) · total · chip status · chip metode · ›`. Date and ID columns hide on mobile (date folds into the subtitle); the method chip hides on mobile.

- [ ] **Step 1: Write `src/components/transactions/TransactionListRow.tsx`**

```tsx
import { ChevronRight } from 'lucide-react';
import { Chip } from '../ui/chip';
import { cn } from '@/lib/utils';
import {
  type Transaction,
  formatIDR,
  STATUS_LABELS,
  STATUS_CHIP_VARIANTS,
  methodChipInfo,
} from './types';

interface TransactionListRowProps {
  transaction: Transaction;
  onOpen: (id: string) => void;
  /** Row currently open in the detail pane */
  active?: boolean;
}

/**
 * Compact list row: date · payment id · title with researcher subtitle ·
 * total · status chip · method chip · chevron. All item detail & actions
 * live in the drawer. Responsive hiding uses plain `hidden sm:block`
 * wrappers (never `hidden md:flex` — styles.css overrides `.flex`).
 */
export function TransactionListRow({ transaction, onOpen, active }: TransactionListRowProps) {
  const date = new Date(transaction.created_at);
  const method = methodChipInfo(transaction.payment_method, transaction.payment_channel);
  const title = transaction.form_submissions?.title || 'Judul tidak tersedia';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(transaction.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(transaction.id);
        }
      }}
      className={cn(
        'group relative flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'hover:bg-gray-50',
        active && 'bg-blue-50'
      )}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-0.5 bg-blue-600" />}

      {/* Tanggal pembayaran — hidden on mobile (folds into subtitle) */}
      <div className="hidden sm:block w-[76px] shrink-0">
        <div className="flex flex-col text-[11px] text-gray-500 leading-tight">
          <span className="font-medium text-gray-900">
            {date.toLocaleDateString('id-ID')}
          </span>
          <span>
            {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* ID transaksi — hidden below md */}
      <span className="hidden md:block w-[110px] shrink-0 font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 truncate">
        #{transaction.payment_id}
      </span>

      {/* Judul survei, peneliti subtitle below (no leading chip) */}
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="text-sm font-semibold text-gray-900 truncate" title={title}>
          {title}
        </span>
        <span className="text-[11px] text-gray-500 truncate mt-0.5">
          {transaction.form_submissions?.full_name}
          <span className="sm:hidden"> · {date.toLocaleDateString('id-ID')}</span>
        </span>
      </div>

      {/* Total */}
      <span className="shrink-0 sm:w-[110px] text-right font-mono text-sm font-semibold text-gray-900">
        {formatIDR(transaction.amount)}
      </span>

      {/* Status chip */}
      <div className="shrink-0 sm:w-[88px]">
        <Chip variant={STATUS_CHIP_VARIANTS[transaction.status]} size="sm">
          {STATUS_LABELS[transaction.status]}
        </Chip>
      </div>

      {/* Metode chip — hidden on mobile */}
      <div className="hidden sm:block w-[110px] shrink-0">
        <Chip variant={method.variant} size="sm">
          {method.label}
        </Chip>
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd multi-step-form && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add multi-step-form/src/components/transactions/TransactionListRow.tsx
git commit -m "feat(admin): compact transaction list row"
```

---

### Task 3: TransactionDetailSheet (drawer + reading pane)

**Files:**
- Create: `src/components/transactions/TransactionDetailSheet.tsx`

**Interfaces:**
- Consumes: `DetailSheet`, `DetailSheetSection` from `src/components/data-list/DetailSheet.tsx`; `DetailPane` from `src/components/data-list/DetailPane.tsx`; Task 1 helpers.
- Produces (used by Task 5): `TransactionDetailSheet({ transaction, onOpenChange, variant }: { transaction: Transaction | null; onOpenChange: (open: boolean) => void; variant?: 'sheet' | 'pane' })`.

- [ ] **Step 1: Write `src/components/transactions/TransactionDetailSheet.tsx`**

```tsx
import { Copy, Download, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { DetailSheet, DetailSheetSection } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import {
  type Transaction,
  parseTransactionNote,
  formatIDR,
  STATUS_LABELS,
  STATUS_CHIP_VARIANTS,
  methodChipInfo,
} from './types';

interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  onOpenChange: (open: boolean) => void;
  /** 'sheet' renders a right drawer (default); 'pane' renders the inline reading pane */
  variant?: 'sheet' | 'pane';
}

function copyToClipboard(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} disalin`))
    .catch(() => toast.error('Gagal menyalin'));
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
}

/**
 * Transaction detail: item breakdown + memo, payment info, and actions.
 * Same variant contract as SubmissionDetailSheet — pane at ≥1280px,
 * drawer below.
 */
export function TransactionDetailSheet({
  transaction,
  onOpenChange,
  variant = 'sheet',
}: TransactionDetailSheetProps) {
  if (!transaction) return null;

  const { items, memo } = parseTransactionNote(transaction.note);
  const method = methodChipInfo(transaction.payment_method, transaction.payment_channel);
  const title = transaction.form_submissions?.title || 'Judul tidak tersedia';

  const subtitle = (
    <>
      {transaction.form_submissions?.full_name}
      {transaction.form_submissions?.email ? ` · ${transaction.form_submissions.email}` : ''}
    </>
  );

  const chips = (
    <>
      <Chip variant={STATUS_CHIP_VARIANTS[transaction.status]} size="sm">
        {STATUS_LABELS[transaction.status]}
      </Chip>
      <Chip variant={method.variant} size="sm">
        {method.label}
      </Chip>
    </>
  );

  const body = (
    <>
      <DetailSheetSection title="Rincian Item">
        {items.length > 0 ? (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  {item.category && (
                    <span className="mt-1 inline-block text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {item.category}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-900 font-mono">
                    {formatIDR(item.price || 0)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">x{item.qty || 1}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Tidak ada rincian item</p>
        )}
        {memo && (
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100/50">
            <span className="font-semibold shrink-0">Catatan:</span>
            <span className="italic break-words">{memo}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-gray-200 pt-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total</span>
          <span className="text-base font-bold text-gray-900 font-mono">
            {formatIDR(transaction.amount)}
          </span>
        </div>
      </DetailSheetSection>

      <DetailSheetSection title="Pembayaran">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Payment ID</dt>
            <dd className="flex items-center gap-1 min-w-0">
              <span className="font-mono text-xs text-gray-900 truncate">
                {transaction.payment_id || '—'}
              </span>
              {transaction.payment_id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-gray-400 hover:text-gray-700"
                  title="Salin Payment ID"
                  onClick={() => copyToClipboard(transaction.payment_id, 'Payment ID')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Metode</dt>
            <dd className="text-gray-900">{method.label}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Dibuat</dt>
            <dd className="text-gray-900">{formatDateTime(transaction.created_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Diperbarui</dt>
            <dd className="text-gray-900">{formatDateTime(transaction.updated_at)}</dd>
          </div>
        </dl>
      </DetailSheetSection>
    </>
  );

  const footer = transaction.payment_url ? (
    <div className="flex gap-2">
      {transaction.status === 'pending' && (
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-9"
          onClick={() => copyToClipboard(transaction.payment_url, 'Link pembayaran')}
        >
          <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
          Salin Link Bayar
        </Button>
      )}
      <Button asChild size="sm" className="flex-1 h-9 bg-blue-600 hover:bg-blue-700">
        <a
          href={`/invoices/${transaction.payment_id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {transaction.status === 'completed' ? 'Download Receipt' : 'Download Invoice'}
        </a>
      </Button>
    </div>
  ) : undefined;

  if (variant === 'pane') {
    return (
      <DetailPane
        title={title}
        subtitle={subtitle}
        chips={chips}
        footer={footer}
        onClose={() => onOpenChange(false)}
      >
        {body}
      </DetailPane>
    );
  }

  return (
    <DetailSheet
      open={!!transaction}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      chips={chips}
      footer={footer}
    >
      {body}
    </DetailSheet>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd multi-step-form && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add multi-step-form/src/components/transactions/TransactionDetailSheet.tsx
git commit -m "feat(admin): transaction detail sheet with drawer and reading-pane variants"
```

---

### Task 4: WalletView (extract DokuWalletModal to full page)

**Files:**
- Create: `src/components/transactions/WalletView.tsx`
- Reference (do NOT delete yet): `src/components/DokuWalletModal.tsx`

**Interfaces:**
- Consumes: `/api/doku/sac/balance|history|payout` endpoints (unchanged), `ui/button`, `ui/input`, `ui/label`, sonner, lucide.
- Produces (used by Task 5): `WalletView({ sacId, productName }: { sacId?: string; productName?: string })`.

Port the state and handlers (`fetchBalance`, `fetchHistory`, `handlePayout`, `formatIDR` local helper, `COMMON_BANKS`) **verbatim** from `DokuWalletModal.tsx` (src lines 16–165). Only the shell changes: no Dialog, no tabs — two columns side by side on ≥1024px via `useMediaQuery` conditional class (NOT `lg:grid-cols-2`, see Global Constraints).

- [ ] **Step 1: Write `src/components/transactions/WalletView.tsx`**

```tsx
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

  const fetchHistory = async () => {
    if (!sacId) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/doku/sac/history?account_id=${sacId}`);
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
        headers: { 'Content-Type': 'application/json' },
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd multi-step-form && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add multi-step-form/src/components/transactions/WalletView.tsx
git commit -m "feat(admin): full-page DOKU wallet view extracted from modal"
```

---

### Task 5: Rewrite TransactionsPage as Keuangan host (tabs + revamped list)

**Files:**
- Modify: `src/components/TransactionsPage.tsx` (full rewrite, content below)

**Interfaces:**
- Consumes: everything produced by Tasks 1–4; `useMediaQuery`, `cn` from `@/lib/utils`; existing `supabase`, `formatPaymentChannel`, ui components.
- Produces: `TransactionsPage()` — same export name/signature, so `InternalDashboardWithLayout.tsx` needs no import change.

Key behaviors preserved from the old file: Supabase query with `form_submissions!inner`, search on title/full_name/payment_id, month/year + status filters, CSV export, revenue + category breakdown dropdown. Removed: `DokuWalletModal` usage, wallet toolbar button, the heavy `Table`. Added: `Transaksi | Wallet` tabs, compact rows, split view (`isXl`), drawer for narrow screens, list visible on mobile.

- [ ] **Step 1: Replace the entire content of `src/components/TransactionsPage.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd multi-step-form && npm run typecheck`
Expected: exit 0. If it errors on unused imports in this file, remove exactly the flagged imports and re-run.

- [ ] **Step 3: Smoke-check in dev server**

Run: `cd multi-step-form && npm run dev`
Open the internal dashboard route in the browser, log in, go to the Transactions page. Expected: tab bar `Transaksi | Wallet` renders; list shows compact rows; clicking a row at ≥1280px opens the inline pane, below 1280px opens the right drawer; Wallet tab shows balance/payout/history. Stop the server after checking.

- [ ] **Step 4: Commit**

```bash
git add multi-step-form/src/components/TransactionsPage.tsx
git commit -m "feat(admin): Keuangan page — tabbed transactions list with detail pane and wallet tab"
```

---

### Task 6: Sidebar label, build verification, and QA checklist

**Files:**
- Modify: `src/components/InternalDashboardWithLayout.tsx` (one label string, around line 182)

**Interfaces:**
- Consumes: nothing new. The page id stays `'transactions'`; only the visible label changes.

- [ ] **Step 1: Rename the sidebar label**

In `src/components/InternalDashboardWithLayout.tsx`, find:

```ts
      id: 'transactions' as Page,
      label: 'Transactions',
```

Change to:

```ts
      id: 'transactions' as Page,
      label: 'Keuangan',
```

- [ ] **Step 2: Confirm no remaining DokuWalletModal usage**

Run: `grep -rn "DokuWalletModal" multi-step-form/src --include="*.tsx" | grep -v "DokuWalletModal.tsx"`
Expected: no output. (The file itself stays until post-QA cleanup.)

- [ ] **Step 3: Typecheck + production build**

Run: `cd multi-step-form && npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Manual QA pass (dev server)**

Run: `cd multi-step-form && npm run dev` and verify each item:

- Sidebar shows `Keuangan`; page opens on tab Transaksi.
- Filters work together: periode (bulan+tahun), search (judul/nama/payment_id), status chips with counts.
- Row: date+time, `#payment_id`, title with researcher subtitle, total, status chip, method chip (QRIS/DOKU blue, Mayar amber "Mayar (legacy)", Invoice Manual purple).
- Detail at ≥1280px: inline pane, active row highlighted with blue left bar; Esc closes; at <1280px: right drawer; mobile viewport: drawer full-width, list rows show title/total/status with date in subtitle.
- Detail content: item breakdown with categories and qty, memo box, total; Payment ID copy button shows toast; Download Invoice/Receipt link points to `/invoices/{payment_id}`; "Salin Link Bayar" appears only on Menunggu rows with `payment_url`.
- Export CSV downloads with the same columns as before.
- Wallet tab: balance loads (or shows error toast if API unreachable), payout form validates empty/invalid amounts, history list renders; two columns at ≥1024px, stacked below.
- Mobile viewport regression: no element "leaks" between breakpoints (the styles.css cascade trap) — check date/ID/method columns are hidden on small widths.

- [ ] **Step 5: Commit**

```bash
git add multi-step-form/src/components/InternalDashboardWithLayout.tsx
git commit -m "feat(admin): rename Transactions sidebar item to Keuangan"
```

---

## Post-QA cleanup (separate, after user approves visuals)

Not part of this plan's execution: delete `src/components/DokuWalletModal.tsx` once the user finishes manual QA, per spec.
