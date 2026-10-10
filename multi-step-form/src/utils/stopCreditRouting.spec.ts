import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * "Hentikan Tayang"/"Batalkan" jadwal kredit lewat service_role (sql/116).
 *
 * 9 Okt 2026 (FJJZ5DK5): sql/113 menolak UPDATE `scheduled -> slot_cancelled`
 * dari JWT browser. Di jalur pra-tayang link DOKU-nya sudah lebih dulu mati,
 * jadi iklannya tetap tayang TANPA tagihan. Yang diuji di sini RUTENYA: jadwal
 * kredit ordinal 1 tidak boleh lagi menulis `form_submissions` dari browser,
 * dan jadwal biasa tidak boleh ikut berpindah jalur.
 */

type Call = { table: string; ops: [string, ...unknown[]][] };
let calls: Call[] = [];
let rpcCalls: { fn: string; args: any }[] = [];
let rpcResult: { data: any; error: any } = { data: 'ok', error: null };

function builderFor(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const rows = table === 'form_submissions' ? [{ id: 'sub-1' }] : [];
  const b: any = {};
  for (const op of ['select', 'update', 'eq', 'neq', 'not', 'in', 'order', 'limit', 'gt', 'or', 'is']) {
    b[op] = (...a: unknown[]) => { call.ops.push([op, ...a]); return b; };
  }
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  b.single = () => Promise.resolve({ data: null, error: null });
  b.then = (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => builderFor(table),
    rpc: (fn: string, args: any) => { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); },
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  }),
}));

const { cancelSchedule } = await import('./supabase');

const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const base = {
  id: 'sched-1', submissionId: 'sub-1', sourceId: 'sub-1', isExtension: false,
  paymentStatus: 'pending', airOnCreditAt: past,
};
const submissionWrites = () =>
  calls.filter((c) => c.table === 'form_submissions' && c.ops.some((o) => o[0] === 'update'));

describe('cancelSchedule — jadwal kredit lewat stop_credit_schedule', () => {
  beforeEach(() => { calls = []; rpcCalls = []; rpcResult = { data: 'ok', error: null }; });

  it('sudah tayang → stop_aired, tanpa UPDATE form_submissions dari browser', async () => {
    await cancelSchedule({ ...base, startDate: past });
    expect(rpcCalls).toEqual([
      { fn: 'stop_credit_schedule', args: { p_schedule_id: 'sched-1', p_mode: 'stop_aired' } },
    ]);
    expect(submissionWrites()).toHaveLength(0);
  });

  it('belum tayang → cancel_before_air, tanpa UPDATE form_submissions dari browser', async () => {
    await cancelSchedule({ ...base, startDate: future });
    expect(rpcCalls).toEqual([
      { fn: 'stop_credit_schedule', args: { p_schedule_id: 'sched-1', p_mode: 'cancel_before_air' } },
    ]);
    expect(submissionWrites()).toHaveLength(0);
  });

  it('belum tayang: link DOKU diperiksa SEBELUM status ditulis', async () => {
    let invoicesSeenBeforeRpc = false;
    rpcResult = { data: 'ok', error: null };
    const origPush = rpcCalls.push.bind(rpcCalls);
    rpcCalls.push = (...items) => {
      invoicesSeenBeforeRpc = calls.some((c) => c.table === 'invoices');
      return origPush(...items);
    };
    await cancelSchedule({ ...base, startDate: future });
    expect(invoicesSeenBeforeRpc).toBe(true);
  });

  it('hasil selain ok dilempar dengan kalimat admin', async () => {
    rpcResult = { data: 'mode_mismatch', error: null };
    await expect(cancelSchedule({ ...base, startDate: past })).rejects.toThrow(/baru saja lewat/);
    rpcResult = { data: 'already_paid', error: null };
    await expect(cancelSchedule({ ...base, startDate: future })).rejects.toThrow(/lunas/);
  });

  it('jadwal kredit tanpa id jadwal ditolak, bukan menulis ke order yang salah', async () => {
    await expect(cancelSchedule({ ...base, id: undefined, startDate: past })).rejects.toThrow(/id jadwal/);
    expect(rpcCalls).toHaveLength(0);
  });

  it('jadwal BUKAN kredit tetap menulis form_submissions seperti dulu, tanpa RPC', async () => {
    await cancelSchedule({ ...base, airOnCreditAt: null, startDate: future });
    expect(rpcCalls).toHaveLength(0);
    expect(submissionWrites()).toHaveLength(1);
  });

  it('perpanjangan kredit tetap lewat ad_schedules, tanpa RPC', async () => {
    calls = [];
    await cancelSchedule({ ...base, isExtension: true, startDate: future }).catch(() => {});
    expect(rpcCalls).toHaveLength(0);
    expect(calls.some((c) => c.table === 'ad_schedules' && c.ops.some((o) => o[0] === 'update'))).toBe(true);
  });
});
