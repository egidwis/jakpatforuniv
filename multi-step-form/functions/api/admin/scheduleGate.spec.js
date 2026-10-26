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

describe('kilatSchedulePatch — jadwal ulang Kilat oleh admin (#e0e7ae16)', () => {
  const body = { submissionId: id, ymd: '2026-11-02', endYmd: '2026-11-03', hour: 11 };
  const now = new Date('2026-10-26T04:34:52.602Z');

  it('jadwal batal (expired) dijadwalkan ulang → slot_reserved + payment_status pending', async () => {
    const { kilatSchedulePatch } = await import('./scheduleGate.js');
    expect(kilatSchedulePatch({ payment_status: 'expired', submission_status: 'slot_cancelled' }, body, now)).toEqual({
      start_date: '2026-11-02',
      end_date: '2026-11-03',
      kilat_slot_hour: 11,
      slot_booked_by: 'admin',
      slot_reserved_at: now.toISOString(),
      updated_at: now.toISOString(),
      submission_status: 'slot_reserved',
      payment_status: 'pending',
    });
  });

  it('pending tetap pending; failed tidak diputihkan', async () => {
    const { kilatSchedulePatch } = await import('./scheduleGate.js');
    const pending = kilatSchedulePatch({ payment_status: 'pending', submission_status: 'waiting_payment' }, body, now);
    expect(pending.submission_status).toBe('slot_reserved');
    expect(pending).not.toHaveProperty('payment_status');
    expect(kilatSchedulePatch({ payment_status: 'failed', submission_status: 'slot_reserved' }, body, now))
      .not.toHaveProperty('payment_status');
  });

  it('lunas atau sudah berjalan: hanya tanggal & jam yang pindah', async () => {
    const { kilatSchedulePatch } = await import('./scheduleGate.js');
    for (const row of [
      { payment_status: 'paid', submission_status: 'paid' },
      { payment_status: 'completed', submission_status: 'completed' },
      // Tempo: tayang sebelum lunas — `scheduled` dengan uang belum masuk.
      { payment_status: 'pending', submission_status: 'scheduled' },
      { payment_status: 'expired', submission_status: 'live' },
    ]) {
      const patch = kilatSchedulePatch(row, body, now);
      expect(patch).not.toHaveProperty('submission_status');
      expect(patch).not.toHaveProperty('payment_status');
      expect(patch).toMatchObject({ start_date: '2026-11-02', kilat_slot_hour: 11 });
    }
  });
});
