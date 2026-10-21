import { describe, expect, it } from 'vitest';
import { submissionDatePatch, validateScheduleWrite } from './scheduleGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateScheduleWrite', () => {
  it('meloloskan tanggal order dan jam tayang', () => {
    const body = {
      action: 'submission-dates',
      submissionId: id,
      startDate: '2026-10-20',
      endDate: '2026-10-27',
      hour: 15,
      minute: 0,
    };
    expect(validateScheduleWrite(body)).toBeNull();
    expect(submissionDatePatch(body).start_date).toBe('2026-10-20');
    expect(submissionDatePatch(body).airing_hour_wib).toBe(15);
  });

  it('menolak status lunas yang diselipkan sebagai tanggal', () => {
    expect(validateScheduleWrite({
      action: 'submission-dates',
      submissionId: id,
      startDate: 'paid',
    })).toMatch(/Tanggal/);
  });

  it('meloloskan buat jadwal dan menolak durasi nol', () => {
    expect(validateScheduleWrite({
      action: 'create-schedule',
      submissionId: id,
      startDate: '2026-10-20T08:00:00.000Z',
      endDate: '2026-10-27T08:00:00.000Z',
      duration: 7,
      prizePerWinner: 0,
      winnerCount: 0,
      additionalPrize: 0,
      isNewBatch: false,
      isExtra: false,
    })).toBeNull();
    expect(validateScheduleWrite({
      action: 'create-schedule',
      submissionId: id,
      startDate: '2026-10-20T08:00:00.000Z',
      endDate: '2026-10-27T08:00:00.000Z',
      duration: 0,
      prizePerWinner: 0,
      winnerCount: 0,
      additionalPrize: 0,
      isNewBatch: false,
      isExtra: true,
    })).toMatch(/Durasi/);
  });
});

describe('release-slot & cancel-schedule (pintu admin, sql/123)', () => {
  const src = 'c8fc72db-18ab-4898-8898-cf364c1b2222';

  it('bentuk body', async () => {
    expect(validateScheduleWrite({ action: 'release-slot', submissionId: id })).toBeNull();
    expect(validateScheduleWrite({ action: 'release-slot', submissionId: 'x' })).toMatch(/Order/);
    expect(validateScheduleWrite({ action: 'cancel-schedule', submissionId: id, sourceId: src, isExtension: true })).toBeNull();
    expect(validateScheduleWrite({ action: 'cancel-schedule', submissionId: id, sourceId: src })).toMatch(/Jadwal/);
  });

  it('lepas: slot & tanggal dikosongkan, filter belum-berkomitmen ikut', async () => {
    const { releaseSlotPatch, UNCOMMITTED_ORDER } = await import('./scheduleGate.js');
    expect(releaseSlotPatch()).toMatchObject({
      start_date: null, end_date: null, slot_booked_by: null, slot_reserved_at: null,
      submission_status: 'slot_reserved', payment_status: 'expired',
    });
    expect(UNCOMMITTED_ORDER).toContain('submission_status=not.in.(paid,scheduled,live,completed)');
  });

  it('batal: perpanjangan → ad_schedules terkunci ke order; ordinal 1 → slot_cancelled, tanggal TETAP', async () => {
    const { cancelScheduleWrite } = await import('./scheduleGate.js');
    const ext = cancelScheduleWrite({ submissionId: id, sourceId: src, isExtension: true });
    expect(ext.path).toContain(`source_id=eq.${src}`);
    expect(ext.path).toContain(`submission_id=eq.${id}`);
    expect(ext.path).toContain('payment_status=not.in.(paid,completed)');
    expect(ext.patch).toMatchObject({ status: 'cancelled', slot_booked_by: null });
    const first = cancelScheduleWrite({ submissionId: id, sourceId: id, isExtension: false });
    expect(first.path).toContain('submission_status=not.in.(paid,scheduled,live,completed)');
    expect(first.patch).toMatchObject({ submission_status: 'slot_cancelled', payment_status: 'expired' });
    expect(first.patch).not.toHaveProperty('start_date');
  });
});
