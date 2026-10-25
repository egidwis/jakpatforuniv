import { describe, expect, test } from 'vitest';
import { awaitsBroadcast, broadcastStateOf } from './kilatBroadcast';

/*
  Keadaan toggle siaran Kilat (R4) — cermin `airing_window_end` sql/118.
  Perilaku RPC-nya sendiri diuji dengan dijalankan di Langkah 4 berkas itu.
*/

const WAVE = { startDate: '2026-10-16T04:00:00Z', endDate: '2026-10-17T04:00:00Z' }; // 11.00 WIB
const T = (iso: string) => new Date(iso);

describe('broadcastStateOf', () => {
  test('belum disiarkan: toggle aktif mulai gelombang − 60 menit', () => {
    expect(broadcastStateOf(WAVE, T('2026-10-16T02:59:59Z'))).toMatchObject({ phase: 'pending', canStart: false, isLate: false });
    expect(broadcastStateOf(WAVE, T('2026-10-16T03:00:00Z'))).toMatchObject({ phase: 'pending', canStart: true });
  });

  test('jendela sementara habis tanpa nyala: masih bisa dinyalakan, ditandai terlambat', () => {
    expect(broadcastStateOf(WAVE, T('2026-10-17T10:00:00Z'))).toMatchObject({ phase: 'pending', canStart: true, isLate: true });
  });

  test('nyala 11.07: tutup otomatis +24 jam dari nyala', () => {
    const s = { ...WAVE, broadcastAt: '2026-10-16T04:07:00Z' };
    const st = broadcastStateOf(s, T('2026-10-16T08:00:00Z'));
    expect(st.phase).toBe('live');
    expect(st.closesAt?.toISOString()).toBe('2026-10-17T04:07:00.000Z');
    expect(broadcastStateOf(s, T('2026-10-17T04:07:00Z')).phase).toBe('finished');
  });

  test('dimatikan 15.30: selesai dan terkunci di detik itu', () => {
    const s = { ...WAVE, broadcastAt: '2026-10-16T04:07:00Z', broadcastEndedAt: '2026-10-16T08:30:00Z' };
    const st = broadcastStateOf(s, T('2026-10-16T08:31:00Z'));
    expect(st).toMatchObject({ phase: 'finished', canStart: false });
    expect(st.closesAt?.toISOString()).toBe('2026-10-16T08:30:00.000Z');
  });

  test('backfill dikenali', () => {
    expect(broadcastStateOf({ ...WAVE, broadcastAt: WAVE.startDate, broadcastEndedAt: WAVE.endDate, broadcastBy: 'backfill' }).isBackfill).toBe(true);
  });
});

describe('awaitsBroadcast (badge Kilat)', () => {
  const paid = { ...WAVE, kilatSlotHour: 11, paymentStatus: 'paid', airOnCreditAt: null };
  test('lunas + toggle sudah boleh + belum nyala → menunggu admin', () => {
    expect(awaitsBroadcast(paid, T('2026-10-16T03:30:00Z'))).toBe(true);
  });
  test('gelombang yang belum masuk −60 menit belum dihitung', () => {
    expect(awaitsBroadcast(paid, T('2026-10-15T03:30:00Z'))).toBe(false);
  });
  test('belum lunas tidak dihitung; tempo dihitung', () => {
    expect(awaitsBroadcast({ ...paid, paymentStatus: 'pending' }, T('2026-10-16T03:30:00Z'))).toBe(false);
    expect(awaitsBroadcast({ ...paid, paymentStatus: 'pending', airOnCreditAt: '2026-10-15T00:00:00Z' }, T('2026-10-16T03:30:00Z'))).toBe(true);
  });
  test('sudah nyala atau selesai tidak dihitung', () => {
    expect(awaitsBroadcast({ ...paid, broadcastAt: '2026-10-16T04:00:00Z' }, T('2026-10-16T05:00:00Z'))).toBe(false);
  });
});
