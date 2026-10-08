import { describe, it, expect } from 'vitest';
import { paymentWriteQuery, validateManualPaymentWrite } from './manualPaymentGate.js';

const markInvoice = {
  table: 'invoices',
  payload: { status: 'paid', paid_at: '2026-10-07T08:00:00.000Z' },
  filters: [
    { op: 'eq', col: 'schedule_id', val: 'sch-1' },
    { op: 'eq', col: 'payment_id', val: 'JFU-INV-1' },
    { op: 'in', col: 'status', val: ['pending', 'expired'] },
  ],
  select: 'id, is_tempo',
};

describe('validateManualPaymentWrite', () => {
  it('meloloskan tandai lunas satu tagihan', () => {
    expect(validateManualPaymentWrite(markInvoice)).toBeNull();
  });

  it('menolak kolom nominal', () => {
    expect(validateManualPaymentWrite({
      ...markInvoice,
      payload: { status: 'paid', amount: 1 },
    })).toMatch(/amount/);
  });

  it('menolak status di luar lunas/belum', () => {
    expect(validateManualPaymentWrite({
      ...markInvoice,
      payload: { status: 'cancelled' },
    })).toMatch(/status/);
  });

  it('menolak update tanpa payment_id', () => {
    expect(validateManualPaymentWrite({
      ...markInvoice,
      filters: [{ op: 'eq', col: 'schedule_id', val: 'sch-1' }],
    })).toMatch(/payment_id/);
  });

  it('menolak tabel lain', () => {
    expect(validateManualPaymentWrite({ ...markInvoice, table: 'chat_messages' })).toMatch(/Tabel/);
  });
});

describe('paymentWriteQuery', () => {
  it('menyusun filter PostgREST', () => {
    expect(paymentWriteQuery(markInvoice.filters, markInvoice.select)).toBe(
      'schedule_id=eq.sch-1&payment_id=eq.JFU-INV-1&status=in.(pending,expired)&select=id%2C%20is_tempo',
    );
  });
});
