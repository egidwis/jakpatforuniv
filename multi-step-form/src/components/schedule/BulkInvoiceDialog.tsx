import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, CreditCard, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatIDR } from '@/utils/currency';
import { voucherInstantOf } from '@/utils/cost-calculator';
import { createManualInvoice } from '@/utils/payment';
import {
  fetchAdSchedules, fetchScheduleBilling, supabase,
  type AdScheduleEntry, type ScheduleBilling,
} from '@/utils/supabase';
import { formatWibShort } from '@/utils/airing-window';
import {
  closeTab, invoiceReadyMessage, openBlankTab, sendToTab,
} from '@/utils/waMessage';
import type { SurveySubmission } from '@/components/submissions/types';
import { buildExtensionInvoiceItems, buildOrderInvoiceItems, type InvoiceItem } from './invoiceItems';
import { bundleTotals, groupTotals, writeInvoiceRows, type InvoiceBundle } from './invoiceWrite';
import {
  distinctAccounts, planBulkInvoice, type BulkCandidate, type BulkRejection,
} from './bulkInvoiceCandidates';

// ─────────────────────────────────────────────────────────────
// SATU link pembayaran untuk N pesanan.
//
// Berdiri sendiri, BUKAN mode kedua di `InvoiceForm`: formulir itu sudah
// bercabang dua di `entry.isExtension` dan dipakai setiap hari. Menambahkan
// dimensi N di atasnya membuat jalur tagihan tunggal memikul risiko fitur yang
// dipakai sekali seminggu. Yang dipakai bersama justru bagian yang berbahaya
// kalau menyimpang: penyusun item (`invoiceItems`) dan penulis baris
// (`invoiceWrite`).
//
// Bentuk datanya: N pasang baris `invoices`/`transactions` berbagi satu
// `payment_id`. `derive_schedule_id()` menempelkan tiap baris ke jadwalnya
// sendiri, jadi pembukuan per jadwal tetap benar tanpa migrasi.
// ─────────────────────────────────────────────────────────────

interface BundleDraft extends BulkCandidate {
  items: InvoiceItem[];
}

export function BulkInvoiceDialog({
  submissions, open, onClose, onDone, onFixSchedule,
}: {
  /** Order yang dicentang admin di daftar Submissions. */
  submissions: SurveySubmission[];
  open: boolean;
  onClose: () => void;
  /** Tagihan berhasil terbit — pemanggil menyegarkan daftar & mengosongkan seleksi. */
  onDone: () => void;
  /** Buka order ini di tab Reservasi Jadwal supaya tanggalnya bisa diisi. */
  onFixSchedule?: (submissionId: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bundles, setBundles] = useState<BundleDraft[]>([]);
  const [rejected, setRejected] = useState<BulkRejection[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [voucher, setVoucher] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState('');

  const accounts = distinctAccounts(submissions);
  const buyer = submissions[0];
  const targetKey = submissions.map((s) => s.id).sort().join(',');

  /**
   * Kelayakan diselesaikan SAAT DIALOG DIBUKA, bukan saat baris digambar.
   *
   * Daftar Submissions hanya tahu keadaan order; yang menentukan boleh-tidaknya
   * ditagih adalah keadaan JADWAL. Karena itu jadwal + billing-nya diambil di
   * sini, lalu `planBulkInvoice` memutuskan dengan `cardStateOf` — sumber yang
   * sama dengan kartu Reservasi Jadwal.
   */
  const resolve = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const ids = submissions.map((s) => s.id);
      const entries: AdScheduleEntry[] = await fetchAdSchedules(ids);

      const billings = new Map<string, ScheduleBilling>();
      const perOrder = await Promise.all(ids.map((id) => fetchScheduleBilling(id)));
      for (const map of perOrder) {
        for (const [scheduleId, billing] of map) billings.set(scheduleId, billing);
      }

      const plan = planBulkInvoice({ submissions, entries, billings });
      setRejected(plan.rejected);
      setBundles(plan.candidates.map((c) => ({ ...c, items: buildItems(c, appliedVoucher) })));
    } catch (e: any) {
      console.error('Gagal menyiapkan tagihan gabungan:', e);
      // ⚠️ TIDAK menampilkan daftar sebagian. Daftar sebagian tidak bisa
      // dibedakan dari "sisanya tidak layak", dan itu menghilangkan pesanan
      // tanpa jejak.
      setBundles([]);
      setRejected([]);
      setLoadError(e?.message || 'Gagal memuat jadwal & tagihan pesanan yang dipilih.');
    } finally {
      setIsLoading(false);
    }
    // ⚠️ Bergantung pada KUNCI ID, bukan pada array `submissions`.
    // Pemanggil menyusun array itu baru setiap render (`[...dipilih, ...tarikan]`),
    // jadi memakainya sebagai dependensi membuat setiap render induk — termasuk
    // detak 60 detik yang menyegarkan chip waktu — menembak ulang seluruh query
    // dan MENGHAPUS voucher serta suntingan admin di tengah jalan.
    //
    // `appliedVoucher` juga sengaja bukan dependensi: mengubah voucher menyusun
    // ulang item lewat `applyVoucher`, tanpa menyentuh jaringan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  useEffect(() => {
    if (open) void resolve();
  }, [open, resolve]);

  /**
   * Voucher berlaku PER BUNDEL, dinilai dengan tanggal lahir pesanan
   * masing-masing (`voucherInstantOf`). Satu grup boleh memuat pesanan yang
   * lahir sebelum tenggat voucher (didiskon) dan sesudahnya (harga penuh) —
   * aturan tiap voucher memang didefinisikan per pesanan, dan
   * `invoices.voucher_code` memang kolom per baris.
   */
  const applyVoucher = () => {
    const code = voucher.trim().toUpperCase();
    setAppliedVoucher(code);
    setBundles((prev) => prev.map((b) => ({ ...b, items: buildItems(b, code) })));
    toast.success(code ? `Voucher ${code} diterapkan ke semua pesanan` : 'Voucher dilepas');
  };

  const totals = groupTotals(bundles.map(toInvoiceBundle(appliedVoucher)));
  const canSave = !isLoading && !loadError && bundles.length > 0 && accounts === 1 && totals.subtotal > 0;

  const handleCreate = async (notify = false) => {
    if (!canSave || !buyer) return;

    // ⚠️ Dibuka SINKRON sebelum `await` pertama — lihat catatan yang sama di
    // `InvoiceForm.handleCreate`.
    const waTab = notify ? openBlankTab() : null;

    setIsSaving(true);
    try {
      const payload = bundles.map(toInvoiceBundle(appliedVoucher));
      const amount = groupTotals(payload).amount;

      /**
       * ⚠️ Diringkas saat N > 1. Bentuk lamanya
       * `items.map(nama (qty×)).join(', ')` melewati batas panjang field DOKU
       * untuk 4 pesanan. Rinciannya tetap hidup di `note` tiap baris, yang
       * tidak punya batas itu.
       */
      const description = payload.length > 1
        ? `Iklan JFU — ${payload.length} survei (${bundles[0].title}${payload.length > 1 ? ` +${payload.length - 1} lainnya` : ''})`
        : bundles[0].items.map((it) => `${it.name} (${it.qty}x)`).join(', ');

      const paymentResponse = await createManualInvoice({
        formSubmissionId: bundles[0].submissionId,
        amount,
        description,
        customerInfo: {
          fullName: buyer.researcherName || 'Client',
          email: buyer.researcherEmail || 'client@example.com',
          phoneNumber: buyer.phone_number || '',
        },
        bundleCount: payload.length,
      });

      // Menulis DAN membuktikan jumlahnya. Kalau melempar, seluruh barisnya
      // sudah dibatalkan dan link-nya TIDAK boleh keluar.
      await writeInvoiceRows(payload, {
        paymentId: paymentResponse.payment_id,
        invoiceUrl: paymentResponse.invoice_url,
      }, amount);

      if (buyer.researcherEmail) {
        fetch('/api/send-invoice-ready-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: buyer.researcherName || 'Kak',
            email: buyer.researcherEmail,
            title: bundles.map((b) => b.title).join(', '),
            invoiceUrl: paymentResponse.invoice_url,
            amount,
          }),
        }).catch((err) => console.error('Failed to send invoice-ready email:', err));
      }

      // Baru DI SINI link-nya boleh keluar.
      if (notify) {
        sendToTab(waTab, buyer.phone_number, invoiceReadyMessage({
          researcherName: buyer.researcherName,
          bundles: bundles.map((b) => ({ title: b.title, startDate: b.entry.startDate })),
          amount,
          invoiceUrl: paymentResponse.invoice_url,
        }));
      }

      toast.success(
        payload.length > 1
          ? `Satu link pembayaran untuk ${payload.length} pesanan berhasil dibuat`
          : 'Link pembayaran berhasil dibuat!',
      );
      onDone();
    } catch (e: any) {
      closeTab(waTab);
      console.error('Gagal membuat tagihan gabungan:', e);
      toast.error(e?.message || 'Gagal membuat tagihan gabungan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isSaving) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-gray-900">
            Tagihan gabungan untuk {submissions.length} pesanan
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Satu link pembayaran, dibayar sekaligus. Tiap pesanan tetap punya jadwal
            dan pembukuannya sendiri.
          </DialogDescription>
        </DialogHeader>

        {accounts > 1 && (
          <Callout tone="danger" icon={<AlertTriangle className="w-4 h-4 shrink-0" />}>
            Pesanan yang dipilih berasal dari <strong>{accounts} peneliti berbeda</strong>.
            Satu pembayaran hanya boleh punya satu pembeli — kalau tidak, kuitansinya
            berbohong soal siapa yang membayar.
          </Callout>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        )}

        {!isLoading && loadError && (
          <Callout tone="danger" icon={<AlertTriangle className="w-4 h-4 shrink-0" />}>
            <div className="space-y-2">
              <p>{loadError}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void resolve()}>
                Coba lagi
              </Button>
            </div>
          </Callout>
        )}

        {!isLoading && !loadError && (
          <div className="space-y-4">
            {rejected.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  {rejected.length} pesanan tidak ikut ditagih
                </p>
                {rejected.map((r) => (
                  <div key={r.submissionId} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{r.title}</p>
                      <p className="text-amber-700">{r.reason}</p>
                    </div>
                    {r.fixable && onFixSchedule && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100"
                        onClick={() => onFixSchedule(r.submissionId)}
                      >
                        <CalendarClock className="w-3 h-3 mr-1" />Tentukan Jadwal
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {bundles.length === 0 ? (
              <p className="text-xs text-gray-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                Tidak ada pesanan yang bisa ditagih dari pilihan ini.
              </p>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">
                      Voucher (berlaku untuk semua pesanan)
                    </label>
                    <Input
                      value={voucher}
                      onChange={(e) => setVoucher(e.target.value.toUpperCase())}
                      placeholder="Kosongkan bila tidak ada"
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyVoucher}>
                    Terapkan
                  </Button>
                </div>
                {/* Masa berlaku dinilai per pesanan, jadi satu tagihan bisa memuat
                    bundel berdiskon dan bundel harga penuh sekaligus. */}
                {appliedVoucher && (
                  <p className="text-[11px] text-gray-500 -mt-2">
                    Masa berlaku voucher dinilai dari tanggal tiap pesanan dibuat — bundel
                    yang lahir sesudah tenggatnya tetap harga penuh.
                  </p>
                )}

                <div className="space-y-2">
                  {bundles.map((bundle, i) => {
                    const t = bundleTotals(bundle.items);
                    return (
                      <div key={bundle.entry.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Pesanan {i + 1} · #{bundle.entry.bookingId}
                            </p>
                            <p className="font-semibold text-sm text-gray-900 truncate">{bundle.title}</p>
                            <p className="text-[11px] text-gray-500">
                              {bundle.entry.startDate
                                ? `Tayang ${formatWibShort(bundle.entry.startDate)}`
                                : 'Belum bertanggal'}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">
                            {formatIDR(t.amount)}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                          {bundle.items.map((it) => (
                            <li key={it.id} className="flex justify-between gap-3">
                              <span className="truncate">{it.name} × {it.qty}</span>
                              <span className="tabular-nums shrink-0">{formatIDR(it.price * it.qty)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
                  <Row label="Subtotal" value={formatIDR(totals.subtotal)} />
                  <Row label="PPN 11%" value={formatIDR(totals.ppn)} />
                  <div className="border-t border-slate-200 pt-1.5">
                    <Row label="Total ditagih" value={formatIDR(totals.amount)} strong />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>Batal</Button>
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={() => void handleCreate(true)}
            disabled={isSaving || !canSave}
            title="Buat tagihan lalu kirim link-nya via WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" />Buat &amp; Kirim WA
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => void handleCreate(false)}
            disabled={isSaving || !canSave}
          >
            {isSaving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Membuat…</>
              : <><CreditCard className="w-3.5 h-3.5 mr-1.5" />Buat link pembayaran</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────

function buildItems(candidate: BulkCandidate, voucherCode: string): InvoiceItem[] {
  const { entry, orderCreatedAt } = candidate;
  const voucherInstantMs = voucherInstantOf(orderCreatedAt);

  if (entry.isExtension) {
    return buildExtensionInvoiceItems(entry, {
      questionCount: candidate.questionCount,
      fallbackWinnerCount: entry.winnerCount || undefined,
      voucherCode,
      voucherInstantMs,
    });
  }

  return buildOrderInvoiceItems({
    duration: entry.duration,
    questionCount: candidate.questionCount,
    winnerCount: entry.winnerCount,
    prizePerWinner: entry.prizePerWinner,
    voucherCode,
    isKilat: entry.distributionType === 'kilat',
    voucherInstantMs,
  }).items;
}

const toInvoiceBundle = (voucherCode: string) => (b: BundleDraft): InvoiceBundle => ({
  entry: b.entry,
  submissionId: b.submissionId,
  items: b.items,
  memo: '',
  voucherCode: voucherCode.trim() ? voucherCode.trim().toUpperCase() : null,
});

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={strong ? 'font-semibold text-gray-900' : 'text-gray-500 text-xs'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-gray-900' : 'text-gray-700 text-xs'}`}>{value}</span>
    </div>
  );
}

function Callout({ tone, icon, children }: { tone: 'danger'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed ${
      tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-800' : ''
    }`}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Pesanan LAIN milik akun yang sama yang siap ditagih.
 *
 * ⚠️ ADA KARENA SELEKSI DI DAFTAR TIDAK BISA MENYEBERANGI HALAMAN. Efek
 * pembersih di InternalDashboard mengosongkan centang setiap kali halaman,
 * bulan, tab, atau filter berubah — dan itu sengaja: seleksi tak terlihat yang
 * menagih uang adalah kesalahan yang mahal. Tapi batch nyata bisa terbelah
 * halaman (terukur: satu batch di peringkat 50–52 dengan pageSize 50), dan
 * pencarian server tidak mencakup email peneliti. Jalur inilah gantinya:
 * dijangkar `auth_user_id`, lepas dari halaman, bulan, dan tab.
 */
export async function findBillableOrdersForAccount(
  authUserId: string,
  excludeIds: string[],
): Promise<SurveySubmission[]> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, title, created_at, auth_user_id, full_name, email, phone_number, question_count')
    .eq('auth_user_id', authUserId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  const rows = (data || []).filter((r: any) => !excludeIds.includes(r.id));
  if (rows.length === 0) return [];

  const ids = rows.map((r: any) => r.id);
  const entries = await fetchAdSchedules(ids);
  const billings = new Map<string, ScheduleBilling>();
  const perOrder = await Promise.all(ids.map((id: string) => fetchScheduleBilling(id)));
  for (const map of perOrder) {
    for (const [scheduleId, billing] of map) billings.set(scheduleId, billing);
  }

  const candidateSubmissions = rows.map((r: any) => ({
    id: r.id,
    formTitle: r.title || 'Untitled Survey',
    submittedAt: r.created_at,
    questionCount: r.question_count ?? null,
  }));
  const plan = planBulkInvoice({ submissions: candidateSubmissions, entries, billings });
  const billableIds = new Set(plan.candidates.map((c) => c.submissionId));

  return rows
    .filter((r: any) => billableIds.has(r.id))
    .map((r: any) => ({
      id: r.id,
      auth_user_id: r.auth_user_id,
      formId: String(r.id).substring(0, 8),
      formTitle: r.title || 'Untitled Survey',
      formUrl: '',
      researcherName: r.full_name || '',
      researcherEmail: r.email || '',
      submittedAt: r.created_at,
      questionCount: r.question_count || 0,
      phone_number: r.phone_number || undefined,
    })) as SurveySubmission[];
}
