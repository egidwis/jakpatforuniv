import { describe, it, expect } from 'vitest';
import { buildInvoiceRows, bundleTotals, groupTotals, type InvoiceBundle } from './invoiceWrite';
import type { AdScheduleEntry } from '@/utils/supabase';
import type { InvoiceItem } from './invoiceItems';

const entry = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'AAAA1111',
  sourceId: 'o1', startDate: '2026-09-10T08:00:00Z', endDate: '2026-09-11T08:00:00Z',
  duration: 1, status: 'waiting_payment', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null, totalCost: 0, subtotal: null,
  ppnAmount: null, voucherCode: null, prizePerWinner: 0, winnerCount: 0,
  additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: null, createdAt: null,
  slotBookedBy: 'admin', slotReservedAt: null, title: 'T', researcherName: 'R',
  ...o,
} as unknown as AdScheduleEntry);

const item = (name: string, price: number, qty = 1): InvoiceItem => ({
  id: `${name}-${price}`, name, qty, price, category: 'Jakpat for Universities (ads)',
});

const bundle = (o: Partial<InvoiceBundle> = {}): InvoiceBundle => ({
  entry: entry(),
  submissionId: 'o1',
  items: [item('Iklan', 200000)],
  memo: '',
  voucherCode: null,
  ...o,
});

const ctx = { paymentId: 'JFU-INV-abc-1', invoiceUrl: 'https://pay.example/x' };

describe('bundleTotals', () => {
  it('PPN 11% di atas subtotal, dibulatkan', () => {
    expect(bundleTotals([item('Iklan', 200000)])).toEqual({
      subtotal: 200000, ppn: 22000, amount: 222000,
    });
  });

  it('mengalikan qty', () => {
    expect(bundleTotals([item('Hadiah', 30000, 3)]).subtotal).toBe(90000);
  });
});

describe('groupTotals', () => {
  it('MENJUMLAHKAN PPN per bundel, bukan menghitung ulang dari subtotal grup', () => {
    // Justru kasus yang membuat webhook menolak pembayaran sah.
    // round(105.005 × 0,11) per bundel ≠ round(jumlahnya × 0,11).
    const bundles = [
      bundle({ items: [item('A', 105005)] }),
      bundle({ items: [item('B', 105005)] }),
    ];
    const perBundle = bundleTotals([item('A', 105005)]).ppn; // 11551 (dibulatkan naik)
    const total = groupTotals(bundles);

    expect(total.subtotal).toBe(210010);
    expect(total.ppn).toBe(perBundle * 2);
    // Yang SALAH: menghitung ulang dari subtotal grup.
    expect(total.ppn).not.toBe(Math.round(210010 * 0.11));
    expect(total.amount).toBe(total.subtotal + total.ppn);
  });

  it('total grup = jumlah amount tiap bundel', () => {
    const bundles = [
      bundle({ items: [item('A', 200000)] }),
      bundle({ items: [item('B', 350000)] }),
    ];
    expect(groupTotals(bundles).amount).toBe(222000 + 388500);
  });
});

describe('buildInvoiceRows', () => {
  it('satu bundel = satu pasang baris, dengan payment_id & url yang sama', () => {
    const { invoices, transactions } = buildInvoiceRows([bundle()], ctx);
    expect(invoices).toHaveLength(1);
    expect(transactions).toHaveLength(1);
    expect(invoices[0].payment_id).toBe(ctx.paymentId);
    expect(invoices[0].invoice_url).toBe(ctx.invoiceUrl);
    expect(transactions[0].payment_url).toBe(ctx.invoiceUrl);
    expect(invoices[0].amount).toBe(222000);
  });

  it('N bundel berbagi satu payment_id tapi membawa form_submission_id sendiri', () => {
    const rows = buildInvoiceRows([
      bundle({ submissionId: 'o1', entry: entry({ submissionId: 'o1' }) }),
      bundle({ submissionId: 'o2', entry: entry({ submissionId: 'o2' }) }),
    ], ctx);
    expect(rows.invoices.map((r) => r.payment_id)).toEqual([ctx.paymentId, ctx.paymentId]);
    expect(rows.invoices.map((r) => r.form_submission_id)).toEqual(['o1', 'o2']);
  });

  it('note tiap baris HANYA memuat item bundelnya sendiri', () => {
    // Kalau ini gagal, kuitansi grup mencetak setiap item N kali dan totalnya
    // N× lipat — sementara DOKU tetap menagih angka yang benar.
    const rows = buildInvoiceRows([
      bundle({ submissionId: 'o1', items: [item('Iklan A', 200000)] }),
      bundle({ submissionId: 'o2', items: [item('Iklan B', 350000)] }),
    ], ctx);

    const first = JSON.parse(rows.transactions[0].note as string);
    const second = JSON.parse(rows.transactions[1].note as string);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].name).toBe('Iklan A');
    expect(second.items).toHaveLength(1);
    expect(second.items[0].name).toBe('Iklan B');
  });

  it('jalur extend membawa entity_type + extend_id; ordinal 1 tidak', () => {
    const rows = buildInvoiceRows([
      bundle({ entry: entry({ isExtension: false, sourceId: 'o1' }) }),
      bundle({ entry: entry({ isExtension: true, sourceId: 'ext-9' }) }),
    ], ctx);

    expect(rows.invoices[0].entity_type).toBeUndefined();
    expect(rows.invoices[0].extend_id).toBeUndefined();
    expect(rows.invoices[1].entity_type).toBe('extend');
    expect(rows.invoices[1].extend_id).toBe('ext-9');
    expect(JSON.parse(rows.transactions[1].note as string).extend_id).toBe('ext-9');
  });

  it('membekukan billed_start_date dari jadwalnya masing-masing', () => {
    const rows = buildInvoiceRows([
      bundle({ entry: entry({ startDate: '2026-09-04T08:00:00Z' }) }),
      bundle({ entry: entry({ startDate: null }) }),
    ], ctx);
    expect(rows.invoices[0].billed_start_date).toBe('2026-09-04T08:00:00Z');
    expect(rows.invoices[1].billed_start_date).toBeNull();
  });

  it('voucher ditulis per baris, boleh berbeda antar bundel', () => {
    const rows = buildInvoiceRows([
      bundle({ voucherCode: 'JFUSUHUD' }),
      bundle({ voucherCode: null }),
    ], ctx);
    expect(rows.invoices[0].voucher_code).toBe('JFUSUHUD');
    expect(rows.invoices[1].voucher_code).toBeNull();
    expect(rows.transactions[0].voucher_code).toBe('JFUSUHUD');
  });

  it('baris invoice dan transaksi membawa nominal yang identik', () => {
    const rows = buildInvoiceRows([bundle(), bundle({ items: [item('B', 350000)] })], ctx);
    rows.invoices.forEach((inv, i) => {
      expect(rows.transactions[i].amount).toBe(inv.amount);
      expect(rows.transactions[i].subtotal).toBe(inv.subtotal);
      expect(rows.transactions[i].ppn_amount).toBe(inv.ppn_amount);
    });
  });
});
