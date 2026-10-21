import { beforeEach, describe, expect, test, vi } from 'vitest';

/*
  Pintu modal mode libur (sql/120). Store libur ditiru: yang diuji keputusan
  `awayGuard` / `awayBlocksKilatPick` — kapan aksi langsung jalan, kapan
  modal menahannya.
*/
let away: { since: string; message: string; messageEn: string } | null = null;
const acked = new Set<string>();

vi.mock('@/utils/operationalHolidays', () => ({
  getAdminAway: () => away,
  isAwayAcked: (since: string) => acked.has(since),
  ackAway: (since: string) => { acked.add(since); },
  awayMessageFor: (a: any) => a.message,
  useAdminAway: () => away,
}));

const { awayBlocksKilatPick, awayGuard, awayGuardWouldOpen, awayModalVariant } = await import('./AdminAwayModal');

beforeEach(() => {
  away = null;
  acked.clear();
});

describe('awayModalVariant — tabel §4/§6 rencana', () => {
  test.each([
    [{ kind: 'submit', product: 'ads', path: 'schedule' }, 'A'],
    [{ kind: 'submit', product: 'ads', path: 'pay' }, 'A'],
    [{ kind: 'submit', product: 'ads', path: 'review' }, 'B'],
    [{ kind: 'submit', product: 'kilat', path: 'review' }, 'B'],
    [{ kind: 'submit', product: 'kilat', path: 'kilat_away' }, 'C'],
    [{ kind: 'pay', product: 'ads' }, 'D'],
    [{ kind: 'pay', product: 'kilat', wave: 'Sen 28 Des · 11.00 WIB' }, 'E'],
    [{ kind: 'kilat_pick', leave: true }, 'F'],
  ] as const)('%o → %s', (ctx, variant) => {
    expect(awayModalVariant(ctx as any)).toBe(variant);
  });
});

describe('awayGuard', () => {
  const ctx = { kind: 'pay', product: 'ads' } as const;

  test('tidak libur → aksi langsung jalan, tanpa modal', () => {
    const action = vi.fn();
    awayGuard(ctx, action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(awayGuardWouldOpen()).toBe(false);
  });

  test('libur & belum di-ack → aksi DITAHAN (menunggu Lanjutkan)', () => {
    away = { since: '2026-12-24', message: '', messageEn: '' };
    const action = vi.fn();
    expect(awayGuardWouldOpen()).toBe(true);
    awayGuard(ctx, action);
    expect(action).not.toHaveBeenCalled();
  });

  test('libur & sudah di-ack masa libur ini → aksi langsung jalan', () => {
    away = { since: '2026-12-24', message: '', messageEn: '' };
    acked.add('2026-12-24');
    const action = vi.fn();
    awayGuard(ctx, action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('ack masa libur LAIN tidak berlaku', () => {
    away = { since: '2027-01-02', message: '', messageEn: '' };
    acked.add('2026-12-24');
    expect(awayGuardWouldOpen()).toBe(true);
  });
});

describe('awayBlocksKilatPick (modal F, pemblokir)', () => {
  test('tidak libur → false (pemanggil lanjut)', () => {
    expect(awayBlocksKilatPick({ leave: false })).toBe(false);
  });

  test('libur → true, walau sudah di-ack (F tidak pernah bisa dilewati)', () => {
    away = { since: '2026-12-24', message: '', messageEn: '' };
    acked.add('2026-12-24');
    expect(awayBlocksKilatPick({ leave: true })).toBe(true);
  });
});
