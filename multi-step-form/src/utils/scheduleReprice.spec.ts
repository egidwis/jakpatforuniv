import { describe, it, expect } from 'vitest';
import { repriceOnMove } from './scheduleReprice';

// Tanggal tayang = 15.00 WIB = 08:00Z.
const OCT_10 = '2026-10-10T08:00:00.000Z';
const OCT_12 = '2026-10-12T08:00:00.000Z';
const LOCK_OCT_05 = '2026-10-05T03:00:00Z';
const NOW_OCT_15 = Date.parse('2026-10-15T10:00:00+07:00');
const NOW_NOV_30 = Date.parse('2026-11-30T23:00:00+07:00');
const NOW_DEC_02 = Date.parse('2026-12-02T10:00:00+07:00');

const base = {
  paymentStatus: 'pending',
  rateLockedAt: LOCK_OCT_05,
  fromStartIso: OCT_10,
  toStartIso: OCT_12,
  questionCount: 40,
};

describe('repriceOnMove — cermin trigger maintain_schedule_rate_lock (sql/103)', () => {
  it('kunci Okt, dipindah 2 Des → tarif per hari 300.000 → 400.000', () => {
    expect(repriceOnMove({ ...base, nowMs: NOW_DEC_02 })).toEqual({
      lockedAtMs: Date.parse(LOCK_OCT_05),
      perDay: { from: 300000, to: 400000 },
    });
  });

  it('selama Okt–Nov tidak ada perubahan tarif → null (dialog tidak muncul)', () => {
    expect(repriceOnMove({ ...base, nowMs: NOW_OCT_15 })).toBeNull();
  });

  it('dipindah 30 Nov ke tanggal Desember → null: kunci = hari PEMINDAHAN, bukan tanggal tayang', () => {
    expect(repriceOnMove({ ...base, toStartIso: '2026-12-02T08:00:00.000Z', nowMs: NOW_NOV_30 })).toBeNull();
  });

  it('sudah lunas → null', () => {
    expect(repriceOnMove({ ...base, paymentStatus: 'paid', nowMs: NOW_DEC_02 })).toBeNull();
    expect(repriceOnMove({ ...base, paymentStatus: 'completed', nowMs: NOW_DEC_02 })).toBeNull();
  });

  it('jadwal tempo (payment_status masih pending) TETAP dinilai ulang — bukan isSchedulePaid()', () => {
    expect(repriceOnMove({ ...base, paymentStatus: null, nowMs: NOW_DEC_02 })?.perDay)
      .toEqual({ from: 300000, to: 400000 });
  });

  it('geser jam di hari WIB yang sama → null', () => {
    expect(repriceOnMove({ ...base, toStartIso: '2026-10-10T01:00:00.000Z', nowMs: NOW_DEC_02 })).toBeNull();
  });

  it('batas hari dibaca WIB: 16:59Z dan 17:00Z = dua hari berbeda', () => {
    expect(repriceOnMove({
      ...base, fromStartIso: '2026-10-10T16:59:00.000Z', toStartIso: '2026-10-10T17:00:00.000Z', nowMs: NOW_DEC_02,
    })).not.toBeNull();
  });

  it('belum bertanggal → null (trigger tidak mengunci ulang)', () => {
    expect(repriceOnMove({ ...base, fromStartIso: null, nowMs: NOW_DEC_02 })).toBeNull();
  });

  it('kunci NULL → null (sudah dibaca "sekarang")', () => {
    expect(repriceOnMove({ ...base, rateLockedAt: null, nowMs: NOW_DEC_02 })).toBeNull();
  });

  it('tanpa jumlah soal → tetap diperingatkan, tanpa angka per hari', () => {
    expect(repriceOnMove({ ...base, questionCount: undefined, nowMs: NOW_DEC_02 }))
      .toEqual({ lockedAtMs: Date.parse(LOCK_OCT_05) });
  });
});
