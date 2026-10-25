import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SurveyFormData } from '../types';

/*
  submitOrder() SUNGGUHAN untuk order Kilat (Phase 5 §5.6). Modul supabase
  ditiru supaya yang diuji isi baris yang di-INSERT, bukan teks kodenya:
    - jalur otomatis = INSERT TANPA kolom jadwal, lalu kunci lewat pintu jadwal
      (sql/123/124: browser tak boleh lagi INSERT bertanggal);
    - jalur manual   = tanpa tanggal & tanpa gelombang (Track B1), tanpa kunci;
    - voucher yang tidak berlaku untuk Kilat tidak tersimpan;
    - galat trigger sql/117 dari pintu dipetakan ke pesan gelombang, bukan kuota
      harian — dan membawa id order yang sudah tersimpan.
*/

const inserted: any[] = [];
let occupancy: any[] = [];
let insertError: any = null;
const rpcCalls: unknown[][] = [];
const locks: unknown[][] = [];
let lockError: any = null;

vi.mock('./supabase', () => ({
  saveFormSubmission: vi.fn(async (row: any) => {
    if (insertError) throw insertError;
    inserted.push(row);
    return { ...row, id: 'new-id' };
  }),
  updateFormSubmissionById: vi.fn(),
  getFormSubmissionById: vi.fn(),
  fetchSlotAvailability: vi.fn(async () => ({ regularCounts: {} })),
  fetchKilatWaveOccupancy: vi.fn(async (...args: unknown[]) => {
    rpcCalls.push(args);
    return occupancy;
  }),
  rebookSlotForSubmission: vi.fn(async (...args: unknown[]) => {
    locks.push(args);
    if (lockError) throw lockError;
    return true;
  }),
}));

const SCHEDULE_COLUMNS = ['start_date', 'end_date', 'kilat_slot_hour', 'slot_booked_by', 'slot_reserved_at'];
const expectUndated = (row: any) => {
  for (const col of SCHEDULE_COLUMNS) expect(row).not.toHaveProperty(col);
};
vi.mock('./auditService', () => ({ auditSubmissionForm: vi.fn(async () => undefined) }));

const { submitOrder, OrderSubmitError, storedVoucherCode } = await import('./submitOrder');
const { KILAT_VOUCHER_CODES, calculateTotalCost } = await import('./cost-calculator');

const AMBASSADOR = KILAT_VOUCHER_CODES.find((c) => c !== 'JFUTGRX')!;

// Senin 19 Okt 2026, 07.00 WIB.
const NOW = new Date('2026-10-19T00:00:00Z');

const kilatForm = (over: Partial<SurveyFormData> = {}): SurveyFormData => ({
  surveyUrl: 'https://docs.google.com/forms/d/abc/viewform',
  title: 'Survei Kilat Uji',
  description: '',
  questionCount: 20,
  criteriaResponden: 'Mahasiswa',
  duration: 1,
  startDate: '2026-10-19',
  endDate: '',
  startTime: '11:00',
  fullName: 'Peneliti Uji',
  email: 'uji@kampus.ac.id',
  phoneNumber: '081234567890',
  university: '',
  department: '',
  status: '',
  referralSource: '',
  referralSourceOther: '',
  winnerCount: 2,
  prizePerWinner: 25000,
  voucherCode: '',
  termsAccepted: true,
  isKilatUpgrade: true,
  kilatSlotHour: 11,
  ...over,
} as SurveyFormData);

const occ = (date: string, hour: number, used: number, closes: string) => ({
  wave_date: date, wave_hour: hour, used, capacity: 2,
  booking_closes_at: closes, is_closed: false, closed_reason: null,
});

const run = (form: SurveyFormData, isAutoApproval = true) =>
  submitOrder({ formData: form, cost: calculateTotalCost(form, NOW.getTime()), isAutoApproval, ilkomunyBlocked: false });

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e) { return e instanceof OrderSubmitError ? e.code : 'other'; }
};
const errorOf = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e) { return e as InstanceType<typeof OrderSubmitError>; }
};

describe('submitOrder — Kilat jalur otomatis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    inserted.length = 0;
    rpcCalls.length = 0;
    locks.length = 0;
    insertError = null;
    lockError = null;
    occupancy = [occ('2026-10-19', 11, 0, '2026-10-19T02:00:00Z'), occ('2026-10-19', 15, 0, '2026-10-19T06:00:00Z')];
  });
  afterEach(() => vi.useRealTimers());

  it('INSERT tanpa kolom jadwal, lalu SATU kunci gelombang lewat pintu', async () => {
    const saved = await run(kilatForm());
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      duration: 1,
      distribution_type: 'kilat',
      submission_status: 'waiting_payment',
    });
    expectUndated(inserted[0]);
    expect(locks).toEqual([['new-id', '2026-10-19', 1, { kilatHour: 11 }]]);
    expect(saved.id).toBe('new-id');
    expect(rpcCalls).toEqual([['2026-10-19', '2026-10-19']]);
  });

  it('gelombang penuh menurut okupansi → slot_full_kilat, tanpa INSERT', async () => {
    occupancy = [occ('2026-10-19', 11, 2, '2026-10-19T02:00:00Z')];
    expect(await codeOf(run(kilatForm()))).toBe('slot_full_kilat');
    expect(inserted).toHaveLength(0);
  });

  it('lewat batas pesan H-2 jam (09.30 untuk gelombang 11.00) → kilat_wave_closed, tanpa RPC', async () => {
    vi.setSystemTime(new Date('2026-10-19T02:30:00Z'));
    expect(await codeOf(run(kilatForm()))).toBe('kilat_wave_closed');
    expect(rpcCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it('gelombang 15.00 di hari yang sama masih boleh pukul 09.30', async () => {
    vi.setSystemTime(new Date('2026-10-19T02:30:00Z'));
    await run(kilatForm({ kilatSlotHour: 15, startTime: '15:00' }));
    expect(locks).toEqual([['new-id', '2026-10-19', 1, { kilatHour: 15 }]]);
  });

  it('tanpa gelombang → no_schedule', async () => {
    expect(await codeOf(run(kilatForm({ kilatSlotHour: null })))).toBe('no_schedule');
    expect(await codeOf(run(kilatForm({ kilatSlotHour: 14 })))).toBe('no_schedule');
  });

  it('galat trigger kilat_wave_full dari pintu → slot_full_kilat (BUKAN kuota harian), order tersimpan', async () => {
    lockError = Object.assign(new Error('Gelombang JFU Kilat 19 Okt 2026 pukul 11.00 WIB sudah penuh (2 dari 2).'), { hint: 'kilat_wave_full' });
    const err = await errorOf(run(kilatForm()));
    expect(err?.code).toBe('slot_full_kilat');
    expect(err?.savedSubmissionId).toBe('new-id');
    expect(inserted).toHaveLength(1);
  });

  it('galat trigger kilat_wave_closed dari pintu → kilat_wave_closed', async () => {
    lockError = Object.assign(new Error('Pemesanan gelombang pukul 11.00 WIB tanggal 19-10-2026 sudah tutup.'), { hint: 'kilat_wave_closed' });
    expect(await codeOf(run(kilatForm()))).toBe('kilat_wave_closed');
  });

  it('pintu gagal tanpa HINT → lock_failed + id order (diantar ke layar pilih tanggal)', async () => {
    lockError = new Error('Gelombang tidak bisa dikunci');
    const err = await errorOf(run(kilatForm()));
    expect(err?.code).toBe('lock_failed');
    expect(err?.savedSubmissionId).toBe('new-id');
  });

  it('INSERT gagal → save_failed TANPA id (tidak ada order yang perlu dibuka)', async () => {
    insertError = new Error('boom');
    const err = await errorOf(run(kilatForm()));
    expect(err?.code).toBe('save_failed');
    expect(err?.savedSubmissionId).toBeUndefined();
    expect(locks).toHaveLength(0);
  });

  it('di luar 3 hari kerja (Senin → Kamis) → kilat_wave_too_far, tanpa RPC & tanpa INSERT', async () => {
    expect(await codeOf(run(kilatForm({ startDate: '2026-10-22', kilatSlotHour: 15, startTime: '15:00' })))).toBe('kilat_wave_too_far');
    expect(rpcCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it('galat trigger kilat_wave_too_far (sql/122 K3) → kilat_wave_too_far', async () => {
    lockError = { message: 'Gelombang JFU Kilat hanya bisa dipesan untuk 3 hari kerja ke depan.', hint: 'kilat_wave_too_far' };
    expect(await codeOf(run(kilatForm()))).toBe('kilat_wave_too_far');
  });

  it('galat trigger kilat_admin_away (mode libur, sql/122) → kilat_admin_away', async () => {
    lockError = { message: 'JFU Kilat tutup sementara selama tim admin libur.', hint: 'kilat_admin_away' };
    expect(await codeOf(run(kilatForm()))).toBe('kilat_admin_away');
  });
});

describe('submitOrder — voucher Kilat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    inserted.length = 0;
    locks.length = 0;
    insertError = null;
    lockError = null;
    occupancy = [occ('2026-10-19', 11, 0, '2026-10-19T02:00:00Z')];
  });
  afterEach(() => vi.useRealTimers());

  it.each(['JFUFEB', 'ILKOMUNY', 'TEGARGANTENG'])('%s tidak tersimpan di order Kilat', async (code) => {
    await run(kilatForm({ voucherCode: code }));
    expect(inserted[0].voucher_code).toBe('');
  });

  it('kode ambassador & JFUTGRX tersimpan', async () => {
    await run(kilatForm({ voucherCode: AMBASSADOR }));
    await run(kilatForm({ voucherCode: 'jfutgrx', title: 'Survei Kilat Uji 2' }));
    expect(inserted.map((r) => r.voucher_code)).toEqual([AMBASSADOR, 'jfutgrx']);
  });

  it('Iklan tetap menyimpan kode apa adanya', () => {
    expect(storedVoucherCode({ voucherCode: 'JFUFEB', isKilatUpgrade: false })).toBe('JFUFEB');
  });
});

describe('submitOrder — Kilat jalur manual & Iklan', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    inserted.length = 0;
    rpcCalls.length = 0;
    locks.length = 0;
    insertError = null;
    lockError = null;
  });
  afterEach(() => vi.useRealTimers());

  it('manual: tanpa tanggal, tanpa gelombang, tanpa hold — admin yang menugaskan', async () => {
    await run(kilatForm({ startDate: '', startTime: '', kilatSlotHour: null, isManualEntry: true }), false);
    expect(inserted[0]).toMatchObject({ submission_status: 'in_review', distribution_type: 'kilat' });
    expectUndated(inserted[0]);
    expect(rpcCalls).toHaveLength(0);
    expect(locks).toHaveLength(0);
  });

  it('dialihkan karena mode libur: jalur manual + forced_manual_reason, tanpa gelombang dari draft', async () => {
    const form = kilatForm({ startDate: '', startTime: '', kilatSlotHour: null });
    await submitOrder({
      formData: form, cost: calculateTotalCost(form, NOW.getTime()),
      isAutoApproval: false, ilkomunyBlocked: false, forcedManualReason: 'admin_away',
    });
    expect(inserted[0]).toMatchObject({
      submission_status: 'in_review',
      distribution_type: 'kilat', forced_manual_reason: 'admin_away',
      // jenis formulir TIDAK diubah — penandanya yang membuat order manual
      submission_method: 'google_import',
    });
    expectUndated(inserted[0]);
    expect(rpcCalls).toHaveLength(0);
    expect(locks).toHaveLength(0);
  });

  it('order biasa TIDAK mengirim forced_manual_reason (tak bergantung kolom sql/122)', async () => {
    await run(kilatForm({ startDate: '', startTime: '', kilatSlotHour: null, isManualEntry: true }), false);
    expect(inserted[0]).not.toHaveProperty('forced_manual_reason');
  });

  it('Iklan: INSERT tanpa tanggal, lalu kunci tanggal × durasi tanpa gelombang', async () => {
    await run(kilatForm({ isKilatUpgrade: false, kilatSlotHour: null, duration: 2, startDate: '2026-10-20', startTime: '15:00' }));
    expect(inserted[0]).toMatchObject({ duration: 2, distribution_type: 'regular' });
    expectUndated(inserted[0]);
    expect(locks).toEqual([['new-id', '2026-10-20', 2, {}]]);
  });

  it('Iklan: cutoff 13.00 dari lockGate → past_cutoff + id order', async () => {
    lockError = new Error('Pemesanan untuk tanggal itu sudah ditutup (batas 13.00 WIB)');
    const err = await errorOf(run(kilatForm({ isKilatUpgrade: false, kilatSlotHour: null, duration: 2, startDate: '2026-10-20', startTime: '15:00' })));
    expect(err?.code).toBe('past_cutoff');
    expect(err?.savedSubmissionId).toBe('new-id');
  });

  it('Iklan: kuota harian penuh dari pintu → slot_full', async () => {
    lockError = Object.assign(new Error('Tanggal 20 Okt sudah penuh'), { hint: 'daily_quota_full' });
    expect(await codeOf(run(kilatForm({ isKilatUpgrade: false, kilatSlotHour: null, duration: 2, startDate: '2026-10-20', startTime: '15:00' })))).toBe('slot_full');
  });
});
