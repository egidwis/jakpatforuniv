import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Check, Copy, CreditCard, ExternalLink, Loader2, Plus, Tag, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PPN_RATE } from '@/utils/constants';
import { calculateAdCostPerDay, calculateIncentiveCost, calculatePpn } from '@/utils/cost-calculator';
import { createManualInvoice } from '@/utils/payment';
import {
  createInvoice, createTransaction, getInvoicesByFormSubmissionId,
  getTransactionsByFormSubmissionId, supabase,
  type AdScheduleEntry, type Invoice, type Transaction,
} from '@/utils/supabase';
import { formatWibShort } from '@/pages/dashboard/schedule/scheduleModel';
import {
  ITEM_CATEGORIES, buildExtensionInvoiceItems, buildOrderInvoiceItems, describeVoucher,
  newBlankItem, type InvoiceItem,
} from './invoiceItems';

// ─────────────────────────────────────────────────────────────
// Menyusun tagihan untuk SATU jadwal.
//
// Satu formulir, DUA JALUR TULIS yang dipilih dari `entry.isExtension`:
//
//   ordinal 1   → invoices/transactions TANPA entity_type. Jadwal pertama
//                 memang order-nya sendiri, dan `fetchSchedulePayments`
//                 membaca baris tanpa entity_type sebagai miliknya.
//   ordinal 2+  → entity_type 'extend' + extend_id = entry.sourceId, plus
//                 memperbarui total_cost/subtotal/ppn_amount di
//                 form_submissions_extend.
//
// Keduanya sudah benar sebelum berkas ini ada — yang baru cuma tampilannya jadi
// satu. Task 11 yang nanti melipat dua jalur ini jadi satu `schedule_id`.
//
// ⚠️ JALUR ORDINAL 1 TIDAK MENULIS `total_cost`, dan jangan ditambahkan.
// `create-payment.js` menghitung ulang harga dari input pricing dan menimpa
// kolom itu; menulisnya di sini hanya melahirkan dua sumber kebenaran yang
// saling menimpa diam-diam.
// ─────────────────────────────────────────────────────────────

/** Baris invoice yang sudah ada untuk jadwal ini. */
interface ExistingInvoice {
  id?: string;
  payment_id: string;
  status: string;
  amount: number;
  invoice_url: string | null;
  created_at: string | null;
}

/**
 * Sebuah pembayaran self-service punya baris `invoices` DAN `transactions`
 * dengan `payment_id` yang sama. Saat kedaluwarsa, `releaseExpiredSlot()` hanya
 * menandai baris transaksi 'expired' — klien tidak boleh menulis `invoices`
 * (RLS admin-only, sql/24) — jadi invoice-nya bisa tertinggal 'pending'.
 * Ambil status yang paling terminal supaya lencananya jujur.
 */
const statusRank = (s: string): number => {
  switch ((s || '').toLowerCase()) {
    case 'paid':
    case 'completed': return 3;
    case 'expired':
    case 'failed':
    case 'cancelled': return 2;
    case 'pending': return 1;
    default: return 0;
  }
};

/** Apakah baris invoice/transaksi ini milik jadwal `entry`? */
function belongsToSchedule(row: any, entry: AdScheduleEntry): boolean {
  const isExtendRow = row.entity_type === 'extend' && !!row.extend_id;
  return entry.isExtension
    ? isExtendRow && row.extend_id === entry.sourceId
    : !isExtendRow;
}

export interface InvoiceFormProps {
  entry: AdScheduleEntry;
  submission: {
    id: string;
    researcherName?: string | null;
    researcherEmail?: string | null;
    title?: string | null;
    phone_number?: string | null;
    questionCount?: number | null;
    duration?: number | null;
    winnerCount?: number | null;
    prize_per_winner?: number | null;
    voucher_code?: string | null;
    distribution_type?: string | null;
  };
  onCancel: () => void;
  onDone: () => void;
  /** Elemen tempat aksi di-portal — footer drawer yang dipaku. */
  actionsSlot?: HTMLElement | null;
  renderActions?: (state: {
    canSave: boolean;
    isSaving: boolean;
    save: () => void;
    cancel: () => void;
  }) => React.ReactNode;
}

export function InvoiceForm({
  entry, submission, onCancel, onDone, actionsSlot, renderActions,
}: InvoiceFormProps) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [note, setNote] = useState('');
  const [existing, setExisting] = useState<ExistingInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Voucher milik TAGIHAN, bukan order — jadi ia state form, dan tidak pernah
  // ditulis balik ke `form_submissions.voucher_code`. Order hanya jadi nilai
  // awalnya. Menaikkannya jadi kolom `invoices.voucher_code` (dan mengajari
  // `create-payment.js` membacanya) adalah Task 13.
  const [voucher, setVoucher] = useState(submission.voucher_code || '');
  const [appliedVoucher, setAppliedVoucher] = useState(submission.voucher_code || '');

  const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const ppn = calculatePpn(subtotal);
  const grandTotal = subtotal + ppn;

  /** Prefill item sesuai jalur jadwalnya. */
  const prefill = useCallback(async () => {
    if (entry.isExtension) {
      // Jumlah pemenang pool yang ditumpangi tagihan tambahan ini di-resolve di
      // server untuk batch JADWAL INI. Hanya perlu kalau ia memang menambah pool
      // berjalan; batch baru mendanai poolnya sendiri di barisnya sendiri.
      let poolWinnerCount: number | undefined;
      if (!entry.isNewPeriod && entry.additionalPrizePerWinner > 0 && entry.endDate) {
        const { data, error } = await supabase.rpc('get_schedule_batch_context', {
          p_submission_id: entry.submissionId,
          p_end_date: entry.endDate,
        });
        if (error) {
          console.error('Error resolving batch context:', error);
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          poolWinnerCount = row?.pool_winner_count || undefined;
        }
        if (!poolWinnerCount) {
          toast.warning('Gagal memastikan jumlah pemenang batch — invoice memakai angka order induk. Periksa sebelum dikirim.');
        }
      }
      setItems(buildExtensionInvoiceItems(entry, {
        questionCount: submission.questionCount,
        poolWinnerCount,
        fallbackWinnerCount: submission.winnerCount || undefined,
        voucherCode: appliedVoucher,
      }));
      setNote('');
      return;
    }

    const built = buildOrderInvoiceItems({
      duration: submission.duration,
      questionCount: submission.questionCount,
      winnerCount: submission.winnerCount,
      prizePerWinner: submission.prize_per_winner,
      voucherCode: appliedVoucher,
      isKilat: submission.distribution_type === 'kilat',
    });
    setItems(built.items);
    setNote(built.note);
  }, [entry, submission, appliedVoucher]);

  /** Tagihan yang sudah ada — DISARING PER JADWAL, bukan per order. */
  const loadExisting = useCallback(async () => {
    const [invoiceRows, txRows] = await Promise.all([
      getInvoicesByFormSubmissionId(submission.id),
      getTransactionsByFormSubmissionId(submission.id),
    ]);

    const byPaymentId = new Map<string, ExistingInvoice>();
    (invoiceRows || [])
      .filter((row: any) => belongsToSchedule(row, entry))
      .forEach((row: any) => byPaymentId.set(row.payment_id, {
        id: row.id,
        payment_id: row.payment_id,
        status: row.status,
        amount: Number(row.amount || 0),
        invoice_url: row.invoice_url || null,
        created_at: row.created_at || null,
      }));

    (txRows || [])
      .filter((row: any) => belongsToSchedule(row, entry))
      .forEach((row: any) => {
        const found = byPaymentId.get(row.payment_id);
        if (!found) {
          byPaymentId.set(row.payment_id, {
            id: row.id,
            payment_id: row.payment_id,
            status: row.status,
            amount: Number(row.amount || 0),
            invoice_url: row.payment_url || null,
            created_at: row.created_at || null,
          });
        } else if (statusRank(row.status) > statusRank(found.status)) {
          found.status = row.status;
        }
      });

    const merged = Array.from(byPaymentId.values());
    merged.sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    setExisting(merged);
  }, [submission.id, entry]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        await Promise.all([prefill(), loadExisting()]);
      } catch (e) {
        console.error('Gagal memuat tagihan jadwal:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [prefill, loadExisting]);

  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const next: InvoiceItem = { ...it, [field]: value } as InvoiceItem;
      // Memilih kategori ikut mengisi nama, kecuali "Lainnya" yang memang bebas.
      if (field === 'category') {
        next.name = value === 'Lainnya' ? '' : String(value);
      }
      return next;
    }));
  };

  /**
   * Menerapkan voucher MENYUSUN ULANG item dari harga dasar — jadi ia membuang
   * harga yang sudah disunting tangan. Karena itu ia butuh klik, bukan reaksi
   * atas setiap ketikan.
   */
  const applyVoucher = () => setAppliedVoucher(voucher.trim());

  // Dihitung dari harga DASAR, bukan dari item yang sudah didiskon — kalau tidak,
  // labelnya menyusut setiap kali voucher diterapkan ulang.
  const voucherEffect = (() => {
    const duration = entry.isExtension ? (entry.duration || 0) : (submission.duration || 0);
    const adCost = calculateAdCostPerDay(submission.questionCount || 0) * duration;
    const incentiveCost = entry.isExtension
      ? (entry.isNewPeriod ? calculateIncentiveCost(entry.winnerCount, entry.prizePerWinner) : 0)
      : calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0);
    return describeVoucher(appliedVoucher, { adCost, incentiveCost, duration });
  })();

  const removeItem = (id: string) => {
    if (items.length === 1) {
      toast.error('Minimal satu item diperlukan');
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleCreate = async () => {
    const invalid = items.filter((it) => !it.name.trim() || it.price < 0 || it.qty < 1);
    if (invalid.length > 0) {
      toast.error('Mohon lengkapi semua item dengan benar');
      return;
    }
    if (subtotal <= 0) {
      toast.error('Total tagihan harus lebih dari 0');
      return;
    }

    setIsSaving(true);
    try {
      const itemSummary = items.map((it) => `${it.name} (${it.qty}x)`).join(', ');
      const baseDescription = note.trim() ? `${itemSummary} - ${note.trim()}` : itemSummary;
      const description = entry.isExtension ? `[EXTEND] ${baseDescription}` : baseDescription;

      const noteData: Record<string, unknown> = {
        memo: note.trim(),
        items: items.map(({ name, qty, price, category }) => ({ name, qty, price, category })),
      };
      // ⚠️ Voucher TIDAK lagi dititipkan di `note`. Sejak sql/53 ia punya kolom
      // sendiri di `invoices` dan `transactions` — voucher milik TAGIHAN, bukan
      // order, jadi dua jadwal di order yang sama boleh berbeda. Menulis ke dua
      // tempat sekaligus berarti dua sumber kebenaran; titipan lama di `note`
      // sudah di-backfill ke kolomnya oleh migrasi itu.
      if (entry.isExtension) noteData.extend_id = entry.sourceId;

      const voucherCode = appliedVoucher.trim() ? appliedVoucher.trim().toUpperCase() : null;

      const paymentResponse = await createManualInvoice({
        formSubmissionId: submission.id,
        amount: grandTotal,
        description,
        customerInfo: {
          fullName: submission.researcherName || 'Client',
          email: submission.researcherEmail || 'client@example.com',
          phoneNumber: submission.phone_number || '',
        },
      });

      const attribution = entry.isExtension
        ? { entity_type: 'extend' as const, extend_id: entry.sourceId }
        : {};

      const invoiceData: Invoice = {
        form_submission_id: submission.id,
        payment_id: paymentResponse.payment_id,
        invoice_url: paymentResponse.invoice_url,
        amount: grandTotal,
        subtotal,
        ppn_rate: PPN_RATE,
        ppn_amount: ppn,
        status: 'pending',
        voucher_code: voucherCode,
        ...attribution,
      };
      await createInvoice(invoiceData);

      const transactionData: Transaction = {
        form_submission_id: submission.id,
        payment_id: paymentResponse.payment_id,
        payment_method: 'doku',
        amount: grandTotal,
        subtotal,
        ppn_rate: PPN_RATE,
        ppn_amount: ppn,
        status: 'pending',
        payment_url: paymentResponse.invoice_url,
        note: JSON.stringify(noteData),
        voucher_code: voucherCode,
        ...attribution,
      };
      await createTransaction(transactionData);

      // Hanya jadwal pertama (bukan perpanjangan) yang berarti "pesanan disetujui,
      // tagihan siap" — perpanjangan tidak pernah melalui review manual.
      if (!entry.isExtension && submission.researcherEmail) {
        fetch('/api/send-invoice-ready-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: submission.researcherName || 'Kak',
            email: submission.researcherEmail,
            title: submission.title || undefined,
            invoiceUrl: paymentResponse.invoice_url,
            amount: grandTotal,
          }),
        }).catch((err) => console.error('Failed to send invoice-ready email:', err));
      }

      // Hanya jalur perpanjangan yang menyimpan totalnya sendiri. Jadwal pertama
      // sengaja tidak — lihat catatan `total_cost` di kepala berkas.
      if (entry.isExtension) {
        await supabase
          .from('form_submissions_extend')
          .update({
            total_cost: grandTotal,
            subtotal,
            ppn_amount: ppn,
            submission_status: 'waiting_payment',
            payment_status: 'pending',
          })
          .eq('id', entry.sourceId);
      }

      toast.success('Link pembayaran berhasil dibuat!');
      onDone();
    } catch (e: any) {
      console.error('Gagal membuat tagihan:', e);
      toast.error(e?.message || 'Gagal membuat tagihan');
    } finally {
      setIsSaving(false);
    }
  };

  const copyLink = async (url: string, paymentId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(paymentId);
      toast.success('Link pembayaran disalin!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Gagal menyalin link');
    }
  };

  const canSave = !isLoading && subtotal > 0;

  const actionNode = renderActions
    ? renderActions({ canSave, isSaving, save: handleCreate, cancel: onCancel })
    : (
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>Batal</Button>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleCreate}
          disabled={isSaving || !canSave}
        >
          {isSaving
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Membuat…</>
            : <><CreditCard className="w-3.5 h-3.5 mr-1.5" />Buat link pembayaran</>}
        </Button>
      </div>
    );

  // `undefined` = pemanggil merender inline (dialog). `null` = wadah portal-nya
  // ada tapi belum ter-mount; menahan render sesaat mencegah tombolnya berkedip
  // di dalam badan sebelum melompat ke footer.
  const actions = actionsSlot === undefined
    ? actionNode
    : actionsSlot ? createPortal(actionNode, actionsSlot) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Semua isian tagihan hidup dalam SATU kartu, sejajar dengan kartu
          "Tagihan jadwal ini" di bawahnya — supaya jelas mana yang sedang
          disusun dan mana yang sudah terbit. */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-4">
        {/* Untuk siapa & jadwal mana */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5 text-[11px] space-y-0.5">
          <p className="font-semibold text-gray-900">
            {entry.startDate
              ? <>
                  {formatWibShort(entry.startDate)}
                  {entry.endDate ? ` – ${formatWibShort(entry.endDate)}` : ''}
                  {entry.duration ? ` · ${entry.duration} hari` : ''}
                </>
              : 'Jadwal belum punya tanggal'}
          </p>
          <p className="text-gray-500">
            {submission.researcherName}
            {submission.researcherEmail ? ` · ${submission.researcherEmail}` : ''}
          </p>
        </div>

        {/* Item — bertumpuk, bukan sebaris. Baris horizontal tidak muat di 480px. */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Item</p>
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2">
              <select
                value={item.category}
                onChange={(e) => updateItem(item.id, 'category', e.target.value)}
                className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input
                placeholder="Nama item"
                value={item.name}
                onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
                  Qty
                  <Input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    className="h-8 text-xs"
                  />
                </label>
                <label className="flex-[2] flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
                  Harga
                  <Input
                    type="number"
                    min={0}
                    value={item.price}
                    onChange={(e) => updateItem(item.id, 'price', parseInt(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    className="h-8 text-xs"
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, newBlankItem()])}
            className="w-full h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Tambah item
          </Button>
        </div>

        {/* Kode voucher — milik TAGIHAN ini, bukan order.
            Menerapkannya MENYUSUN ULANG item, jadi ia sengaja butuh klik
            eksplisit: menghitung ulang di tiap ketikan akan membuang harga yang
            sudah disunting tangan tanpa peringatan. */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Kode voucher
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyVoucher(); } }}
              placeholder="Tanpa voucher"
              className="h-8 text-xs font-mono uppercase"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={applyVoucher}
              disabled={voucher.trim().toUpperCase() === appliedVoucher.trim().toUpperCase()}
            >
              Terapkan
            </Button>
          </div>
          {voucherEffect ? (
            <p className="flex items-start gap-1.5 text-[11px] text-emerald-700">
              <Tag className="w-3 h-3 mt-0.5 shrink-0" /> {voucherEffect.label}
            </p>
          ) : appliedVoucher.trim() ? (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <Tag className="w-3 h-3 mt-0.5 shrink-0" />
              Kode tidak mengubah harga — periksa ejaannya atau masa berlakunya.
            </p>
          ) : null}
          <p className="text-[10px] text-gray-400">
            Berlaku untuk tagihan ini saja; harga order tidak ikut berubah.
          </p>
        </div>

        {/* Total */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span className="tabular-nums">Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>PPN 11%</span>
            <span className="tabular-nums">Rp {ppn.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-gray-200">
            <span className="font-bold uppercase tracking-wider text-gray-600 text-[11px]">Total tagihan</span>
            <span className="font-bold text-blue-700 tabular-nums">Rp {grandTotal.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* Memo */}
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Memo (opsional)
          </span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan untuk tagihan ini"
            maxLength={200}
            className="h-8 text-xs"
          />
        </label>
      </div>

      {/* Tagihan yang sudah ada untuk JADWAL INI */}
      {existing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Tagihan jadwal ini
          </p>
          {existing.map((inv) => (
            <div key={inv.payment_id} className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-gray-500 truncate">
                  {inv.payment_id}
                </span>
                <span className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                  statusRank(inv.status) === 3 ? 'bg-emerald-50 text-emerald-700'
                    : statusRank(inv.status) === 2 ? 'bg-red-50 text-red-600'
                      : 'bg-amber-50 text-amber-700'
                )}>
                  {inv.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-900 tabular-nums">
                  Rp {inv.amount.toLocaleString('id-ID')}
                  {inv.created_at && (
                    <span className="ml-1.5 font-normal text-[10px] text-gray-400">
                      {formatWibShort(inv.created_at)}
                    </span>
                  )}
                </span>
                {inv.invoice_url && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline" size="sm" className="h-7 px-2 text-[10px]"
                      onClick={() => window.open(inv.invoice_url!, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" /> Buka
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 px-2 text-[10px]"
                      onClick={() => copyLink(inv.invoice_url!, inv.payment_id)}
                    >
                      {copiedId === inv.payment_id
                        ? <><Check className="w-3 h-3 mr-1 text-green-600" /> Tersalin</>
                        : <><Copy className="w-3 h-3 mr-1" /> Salin</>}
                    </Button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {actions}
    </div>
  );
}
