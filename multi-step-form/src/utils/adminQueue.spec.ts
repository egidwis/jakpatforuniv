import { describe, expect, test, vi, beforeEach } from 'vitest';

/*
  Antrean admin (badge tab Iklan/Kilat, Phase 5 §5.4b R3). Predikat murni +
  perakitnya dipanggil sungguhan dengan klien supabase tiruan yang mencatat
  filter yang dikirim.
*/

const calls: { table: string; filters: any[] }[] = [];
let tables: Record<string, any[]> = {};

vi.mock('./supabase', () => {
  const builder = (table: string) => {
    const entry = { table, filters: [] as any[] };
    calls.push(entry);
    const b: any = {
      select: (...a: any[]) => { entry.filters.push(['select', ...a]); return b; },
      is: (...a: any[]) => { entry.filters.push(['is', ...a]); return b; },
      or: (...a: any[]) => { entry.filters.push(['or', ...a]); return b; },
      in: (...a: any[]) => { entry.filters.push(['in', ...a]); return b; },
      not: (...a: any[]) => { entry.filters.push(['not', ...a]); return b; },
      neq: (...a: any[]) => { entry.filters.push(['neq', ...a]); return b; },
      lte: (...a: any[]) => { entry.filters.push(['lte', ...a]); return b; },
      eq: (...a: any[]) => { entry.filters.push(['eq', ...a]); return b; },
      then: (res: any) => res({ data: tables[table] ?? [], error: null }),
    };
    return b;
  };
  return { supabase: { from: builder } };
});

import { adminActionOf, fetchAdminQueue, type AdminQueueRow } from './adminQueue';

const TODAY = '2026-10-15';
const row = (o: Partial<AdminQueueRow>): AdminQueueRow => ({
  id: 'x', distribution_type: 'regular', submission_status: 'in_review', start_date: null,
  slot_booked_by: null, payment_status: 'pending', dismissed_at: null, submission_method: 'manual',
  survey_url: 'https://example.com', detected_keywords: null, voucher_code: null, forced_manual_reason: null, ...o,
});
const ctx = (hasOpenBill = false) => ({ hasOpenBill, todayYmd: TODAY });

describe('adminActionOf', () => {
  test('review manual tanpa tanggal → review', () => {
    expect(adminActionOf(row({}), ctx())).toBe('review');
    expect(adminActionOf(row({ submission_status: 'pending' }), ctx())).toBe('review');
  });

  test('in_review BERTANGGAL = artefak pra-review, bukan antrean', () => {
    expect(adminActionOf(row({ start_date: '2025-12-20' }), ctx())).toBeNull();
  });

  test('disetujui manual tanpa tanggal → schedule; auto-review → peneliti yang memilih', () => {
    expect(adminActionOf(row({ submission_status: 'approved' }), ctx())).toBe('schedule');
    const auto = row({ submission_status: 'approved', submission_method: 'google_drive', survey_url: 'https://docs.google.com/forms/d/x' });
    expect(adminActionOf(auto, ctx())).toBeNull();
    // voucher verifikasi manual membuat order Google Form tetap direview admin
    expect(adminActionOf({ ...auto, voucher_code: 'JFUFEB' }, ctx())).toBe('schedule');
  });

  test('Kilat dialihkan saat mode libur (sql/122) → admin menugaskan gelombang, bukan peneliti', () => {
    const diverted = row({
      distribution_type: 'kilat', submission_method: 'google_import',
      survey_url: 'https://docs.google.com/forms/d/x', forced_manual_reason: 'admin_away',
    });
    expect(adminActionOf(diverted, ctx())).toBe('review');
    expect(adminActionOf({ ...diverted, submission_status: 'approved' }, ctx())).toBe('schedule');
    // Tanpa penanda, order yang sama milik peneliti.
    expect(adminActionOf({ ...diverted, forced_manual_reason: null, submission_status: 'approved' }, ctx())).toBeNull();
  });

  test('disetujui tapi slotnya kedaluwarsa → bola di peneliti', () => {
    expect(adminActionOf(row({ submission_status: 'approved', payment_status: 'expired' }), ctx())).toBeNull();
  });

  test('slot admin bertanggal depan tanpa tagihan hidup → invoice', () => {
    const r = row({ submission_status: 'slot_reserved', slot_booked_by: 'admin', start_date: TODAY });
    expect(adminActionOf(r, ctx(false))).toBe('invoice');
    expect(adminActionOf(r, ctx(true))).toBeNull();
    expect(adminActionOf({ ...r, start_date: '2026-10-14' }, ctx(false))).toBeNull();
    expect(adminActionOf({ ...r, slot_booked_by: 'user' }, ctx(false))).toBeNull();
  });

  test('lunas, batal, spam, atau disingkirkan pemiliknya → bukan antrean', () => {
    expect(adminActionOf(row({ payment_status: 'paid' }), ctx())).toBeNull();
    expect(adminActionOf(row({ submission_status: 'slot_cancelled' }), ctx())).toBeNull();
    expect(adminActionOf(row({ submission_status: 'spam' }), ctx())).toBeNull();
    expect(adminActionOf(row({ dismissed_at: '2026-10-01T00:00:00Z' }), ctx())).toBeNull();
  });
});

describe('fetchAdminQueue', () => {
  beforeEach(() => { calls.length = 0; tables = {}; });

  test('memisah Iklan/Kilat dan membaca tagihan hidup hanya untuk kandidat invoice', async () => {
    tables.form_submissions = [
      row({ id: 'r1' }),
      row({ id: 'r2', submission_status: 'approved' }),
      row({ id: 'k1', distribution_type: 'kilat', submission_status: 'slot_reserved', slot_booked_by: 'admin', start_date: '2026-10-16' }),
      row({ id: 'k2', distribution_type: 'kilat', submission_status: 'slot_reserved', slot_booked_by: 'admin', start_date: '2026-10-16' }),
    ];
    tables.transactions = [{ form_submission_id: 'k2' }];
    const q = await fetchAdminQueue(new Date('2026-10-15T06:00:00Z'));
    expect(q).toEqual({
      regular: ['r1', 'r2'], kilat: ['k1'],
      // Alasan per order = sumber titik merah di daftar (sama dengan badge).
      reasons: { r1: 'review', r2: 'schedule', k1: 'invoice' },
    });

    const tx = calls.find((c) => c.table === 'transactions')!;
    expect(tx.filters).toContainEqual(['in', 'form_submission_id', ['k1', 'k2']]);
    expect(tx.filters).toContainEqual(['eq', 'status', 'pending']);

    const fs = calls.find((c) => c.table === 'form_submissions')!;
    const or = fs.filters.find((f) => f[0] === 'or')[1] as string;
    expect(or).toContain('start_date.gte.2026-10-15');
    expect(or).toContain('and(submission_status.in.(in_review,pending),start_date.is.null)');
    expect(fs.filters).toContainEqual(['is', 'dismissed_at', null]);
  });

  test('hari WIB, bukan UTC: 15 Okt 23.30 UTC = 16 Okt WIB', async () => {
    tables.form_submissions = [];
    await fetchAdminQueue(new Date('2026-10-15T23:30:00Z'));
    const or = calls[0].filters.find((f) => f[0] === 'or')[1] as string;
    expect(or).toContain('start_date.gte.2026-10-16');
    expect(calls.some((c) => c.table === 'transactions')).toBe(false);
  });

  test('tab Kilat + gelombang lunas yang toggle-nya sudah bisa dinyalakan (R4)', async () => {
    tables.form_submissions = [];
    tables.ad_schedules = [
      // 14.00 WIB hari ini, lunas, belum nyala, sekarang 13.30 → dihitung
      { submission_id: 'w1', start_date: '2026-10-15T07:00:00Z', end_date: '2026-10-16T07:00:00Z', kilat_slot_hour: 14, payment_status: 'paid', air_on_credit_at: null, broadcast_at: null },
      // belum lunas → tidak
      { submission_id: 'w2', start_date: '2026-10-15T07:00:00Z', end_date: '2026-10-16T07:00:00Z', kilat_slot_hour: 14, payment_status: 'pending', air_on_credit_at: null, broadcast_at: null },
      // lunas, tak pernah ditandai, jendelanya SUDAH HABIS → tidak (kasus #a4582981)
      { submission_id: 'w3', start_date: '2026-10-13T07:00:00Z', end_date: '2026-10-14T07:00:00Z', kilat_slot_hour: 14, payment_status: 'paid', air_on_credit_at: null, broadcast_at: null },
    ];
    const q = await fetchAdminQueue(new Date('2026-10-15T06:30:00Z'));
    expect(q.kilat).toEqual(['w1']);
    expect(q.reasons).toEqual({ w1: 'broadcast' });
    const ad = calls.find((c) => c.table === 'ad_schedules')!;
    expect(ad.filters).toContainEqual(['is', 'broadcast_at', null]);
    expect(ad.filters).toContainEqual(['lte', 'start_date', '2026-10-15T07:30:00.000Z']);
    expect(ad.filters).toContainEqual(['eq', 'distribution_type', 'kilat']);
  });
});
