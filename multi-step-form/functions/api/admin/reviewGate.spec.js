import { describe, expect, it } from 'vitest';
import { reviewPatch, validateReviewWrite } from './reviewGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateReviewWrite', () => {
  it('meloloskan keputusan review beserta catatan dan riwayat', () => {
    const body = {
      action: 'decision',
      submissionId: id,
      status: 'approved',
      notes: 'kuesioner layak',
      reviewHistory: [{ action: 'approved', actor: 'admin', notes: 'kuesioner layak', timestamp: '2026-10-19T04:00:00.000Z' }],
    };
    expect(validateReviewWrite(body)).toBeNull();
    expect(reviewPatch(body)).toEqual({
      submission_status: 'approved',
      admin_notes: 'kuesioner layak',
      review_history: body.reviewHistory,
    });
  });

  it('menolak status tayang dan status lunas', () => {
    expect(validateReviewWrite({ action: 'decision', submissionId: id, status: 'live' })).toMatch(/Status/);
    expect(validateReviewWrite({ action: 'decision', submissionId: id, status: 'paid' })).toMatch(/Status/);
    expect(validateReviewWrite({ action: 'decision', submissionId: id, status: 'slot_reserved' })).toMatch(/Status/);
  });

  it('menolak aksi skill di dalam riwayat', () => {
    expect(validateReviewWrite({
      action: 'decision',
      submissionId: id,
      status: 'spam',
      reviewHistory: [{ action: 'eval', actor: 'admin', timestamp: '2026-10-19T04:00:00.000Z' }],
    })).toBeNull();
    expect(validateReviewWrite({
      action: 'decision',
      submissionId: id,
      status: 'rejected',
      reviewHistory: [{ notes: 'x'.repeat(4001) }],
    })).toMatch(/Riwayat/);
  });
});
