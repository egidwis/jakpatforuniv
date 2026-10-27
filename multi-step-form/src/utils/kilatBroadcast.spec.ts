import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { KILAT_LEAD_MS, SUBMIT_GRACE_MS, broadcastStateOf, needsBroadcastEnd } from './kilatBroadcast';

/*
  Fase siaran Kilat v2 — cermin `kilat_window_start/_close` sql/130.
  Perilaku RPC-nya sendiri diuji dengan dijalankan di PGlite (lihat commit sql/130).
*/

const WAVE = { startDate: '2026-10-16T04:00:00Z' }; // gelombang 11.00 WIB
const T = (iso: string) => new Date(iso);

describe('paritas konstanta dengan sql/130', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../sql/130_siaran_kilat_v2.sql'), 'utf8');
  const minutesOf = (fn: string) => {
    const m = sql.match(new RegExp(`FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?interval '(\\d+) minutes'`));
    return m ? Number(m[1]) : NaN;
  };
  test('kilat_lead() = KILAT_LEAD_MS', () => expect(minutesOf('kilat_lead') * 60_000).toBe(KILAT_LEAD_MS));
  test('submit_grace() = SUBMIT_GRACE_MS', () => expect(minutesOf('submit_grace') * 60_000).toBe(SUBMIT_GRACE_MS));
});

describe('broadcastStateOf', () => {
  test('terjadwal sampai gelombang − 60 menit, lalu live otomatis', () => {
    expect(broadcastStateOf(WAVE, T('2026-10-16T02:59:59Z')).phase).toBe('scheduled');
    const st = broadcastStateOf(WAVE, T('2026-10-16T03:00:00Z'));
    expect(st.phase).toBe('live');
    expect(st.opensAt?.toISOString()).toBe('2026-10-16T03:00:00.000Z');
  });

  test('live tanpa batas: 72 jam kemudian masih live', () => {
    const st = broadcastStateOf(WAVE, T('2026-10-19T03:00:00Z'));
    expect(st).toMatchObject({ phase: 'live', liveForMs: 72 * 3600_000, closesAt: null });
  });

  test('dimatikan → tenggang 60 menit → selesai', () => {
    const s = { ...WAVE, broadcastEndedAt: '2026-10-16T08:30:00Z' };
    expect(broadcastStateOf(s, T('2026-10-16T09:29:59Z')).phase).toBe('grace');
    const st = broadcastStateOf(s, T('2026-10-16T09:30:00Z'));
    expect(st.phase).toBe('finished');
    expect(st.closesAt?.toISOString()).toBe('2026-10-16T09:30:00.000Z');
  });

  test('nyala manual lama (sebelum sql/130) tetap jangkar mulai', () => {
    const st = broadcastStateOf({ ...WAVE, broadcastAt: '2026-10-16T04:07:00Z' }, T('2026-10-16T05:07:00Z'));
    expect(st).toMatchObject({ phase: 'live', liveForMs: 3600_000 });
  });

  test('backfill & pembekuan sql/130 & gelombang berikutnya dikenali', () => {
    expect(broadcastStateOf({ ...WAVE, broadcastAt: WAVE.startDate, broadcastEndedAt: '2026-10-17T04:00:00Z', broadcastBy: 'backfill' }).isBackfill).toBe(true);
    expect(broadcastStateOf({ ...WAVE, broadcastEndedAt: '2026-10-17T04:00:00Z', broadcastEndedBy: 'sistem: sql/130 jendela lama' }).isBackfill).toBe(true);
    expect(broadcastStateOf({ ...WAVE, broadcastEndedAt: '2026-10-17T04:00:00Z', broadcastEndedBy: 'sistem: gelombang berikutnya' }).isSuperseded).toBe(true);
  });
});

describe('needsBroadcastEnd (antrean "Matikan siaran?")', () => {
  const paid = { ...WAVE, kilatSlotHour: 11, paymentStatus: 'paid', airOnCreditAt: null };
  test('live < 24 jam belum masuk antrean; ≥ 24 jam masuk', () => {
    expect(needsBroadcastEnd(paid, T('2026-10-17T02:59:59Z'))).toBe(false);
    expect(needsBroadcastEnd(paid, T('2026-10-17T03:00:00Z'))).toBe(true);
    expect(needsBroadcastEnd(paid, T('2026-10-27T03:00:00Z'))).toBe(true);
  });
  test('belum lunas tidak dihitung; tempo dihitung', () => {
    expect(needsBroadcastEnd({ ...paid, paymentStatus: 'pending' }, T('2026-10-18T00:00:00Z'))).toBe(false);
    expect(needsBroadcastEnd({ ...paid, paymentStatus: 'pending', airOnCreditAt: '2026-10-15T00:00:00Z' }, T('2026-10-18T00:00:00Z'))).toBe(true);
  });
  test('sudah dimatikan (tenggang/selesai) tidak dihitung', () => {
    expect(needsBroadcastEnd({ ...paid, broadcastEndedAt: '2026-10-17T05:00:00Z' }, T('2026-10-17T05:30:00Z'))).toBe(false);
    expect(needsBroadcastEnd({ ...paid, broadcastEndedAt: '2026-10-17T05:00:00Z' }, T('2026-10-18T05:30:00Z'))).toBe(false);
  });
});
