import { describe, expect, it, vi, beforeEach } from 'vitest';

/*
  "Kirim Pesanan" saat reservasi mandiri ditutup (sql/125): order lahir
  `approved`, TANPA kolom jadwal dan tanpa cek ketersediaan — cap-nya ditulis
  trigger server, bukan klien.
*/
const saved: any[] = [];
const availability = vi.fn();
vi.mock('./supabase', () => ({
  saveFormSubmission: vi.fn(async (data: any) => { saved.push(data); return { ...data, id: 'new-id' }; }),
  updateFormSubmissionById: vi.fn(),
  getFormSubmissionById: vi.fn(),
  fetchSlotAvailability: (...a: unknown[]) => availability(...a),
}));
vi.mock('./auditService', () => ({ auditSubmissionForm: vi.fn(async () => {}) }));

const { submitOrder } = await import('./submitOrder');
const { checkoutPath } = await import('./review-path');

const formData = {
  termsAccepted: true,
  title: 'Survei', questionCount: 10, duration: 3,
  fullName: 'Peneliti', email: 'p@x.id', phoneNumber: '081234567890',
  surveyUrl: 'https://docs.google.com/forms/d/x', isManualEntry: false,
  // Draft lama membawa tanggal yang sudah lewat batas — tidak boleh menggagalkan kiriman.
  startDate: '2020-01-01', startTime: '15:00', voucherCode: '',
} as any;
const cost = { totalCost: 555_000, subtotal: 500_000, ppn: 55_000 } as any;

beforeEach(() => { saved.length = 0; availability.mockReset(); });

describe('submitOrder({ selfBookingClosed })', () => {
  it('approved, tanpa kolom jadwal & slot, tanpa cek ketersediaan, draft basi diabaikan', async () => {
    await submitOrder({ formData, cost, isAutoApproval: false, selfBookingClosed: true, ilkomunyBlocked: false, authUserId: 'u1' });
    expect(saved).toHaveLength(1);
    const row = saved[0];
    expect(row.submission_status).toBe('approved');
    expect(row.start_date).toBeNull();
    expect(row.end_date).toBeNull();
    expect('slot_booked_by' in row).toBe(false);
    expect('slot_reserved_at' in row).toBe(false);
    expect('self_booking_closed_at' in row).toBe(false);
    expect(row.total_cost).toBe(555_000);
    expect(availability).not.toHaveBeenCalled();
  });

  it('tanpa penanda: jalur manual tetap in_review (perilaku lama)', async () => {
    await submitOrder({ formData: { ...formData, startDate: '' }, cost, isAutoApproval: false, ilkomunyBlocked: false, authUserId: 'u1' });
    expect(saved[0].submission_status).toBe('in_review');
  });
});

describe('checkoutPath (Ringkasan)', () => {
  const base = { isAutoApproval: true, hasSchedule: false, selfBookingClosed: false };
  it('saklar buka: perilaku lama', () => {
    expect(checkoutPath(base)).toBe('schedule');
    expect(checkoutPath({ ...base, hasSchedule: true })).toBe('pay');
    expect(checkoutPath({ ...base, isAutoApproval: false })).toBe('review');
  });
  it('saklar tutup: jalur otomatis → admin_schedule, termasuk yang sudah bertanggal; jalur manual tetap review', () => {
    expect(checkoutPath({ ...base, selfBookingClosed: true })).toBe('admin_schedule');
    expect(checkoutPath({ ...base, selfBookingClosed: true, hasSchedule: true })).toBe('admin_schedule');
    expect(checkoutPath({ ...base, selfBookingClosed: true, isAutoApproval: false })).toBe('review');
  });
});
