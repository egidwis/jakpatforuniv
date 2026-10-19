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
