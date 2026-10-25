import { describe, it, expect } from 'vitest';
import { KILAT_PAY_LEAD_MIN } from './constants';
import { isPayDeadlinePassed, kilatPayDeadline, kilatWaveInstant, payDeadlineFor, paymentCutoffInstant } from './airing-window';
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import * as server from '../../functions/api/doku/create-payment.js';

/*
  Batas bayar gelombang Kilat: klien (`airing-window.ts`) = server
  (`create-payment.js`, salinan karena Pages Function tak bisa mengimpor src/).
  Phase 5 §5.7, R6 — spec paritas yang ditunda dari R2.
*/

const YMDS = ['2026-10-19', '2026-10-23', '2026-12-31', '2027-01-01'];
const HOURS = [11, 15];

describe('paritas klien ⇄ server', () => {
  it('KILAT_PAY_LEAD_MIN sama: 60', () => {
    expect(server.KILAT_PAY_LEAD_MIN).toBe(KILAT_PAY_LEAD_MIN);
    expect(KILAT_PAY_LEAD_MIN).toBe(60);
  });

  it.each(YMDS.flatMap((y) => HOURS.map((h) => [y, h] as const)))('%s %i.00: instan & batas identik', (ymd, hour) => {
    expect(server.kilatWaveInstantMs(ymd, hour)).toBe(kilatWaveInstant(ymd, hour).getTime());
    const wave = kilatWaveInstant(ymd, hour).toISOString();
    const verdict = server.kilatPaymentGate({ startDate: wave, kilatHour: hour }, 0);
    expect(verdict).toEqual({ ok: true, deadlineMs: kilatPayDeadline(ymd, hour).getTime() });
  });

  it.each(HOURS)('batas detik %i.00: klien dan server sepakat di -1 ms, 0, +1 ms', (hour) => {
    const ymd = '2026-10-19';
    const deadline = kilatPayDeadline(ymd, hour).getTime();
    const wave = kilatWaveInstant(ymd, hour).toISOString();
    for (const delta of [-1, 0, 1]) {
      const now = deadline + delta;
      const serverClosed = !server.kilatPaymentGate({ startDate: wave, kilatHour: hour }, now).ok;
      expect(isPayDeadlinePassed(ymd, hour, new Date(now))).toBe(serverClosed);
      expect(serverClosed).toBe(delta > 0);
    }
  });
});

describe('server: tanggal WIB dari instan cermin', () => {
  it('00.00 WIB = 17.00Z hari sebelumnya → tetap tanggal WIB-nya', () => {
    expect(server.wibYmdOf('2026-10-18T17:00:00+00:00')).toBe('2026-10-19');
    expect(server.wibYmdOf('2026-10-19T16:59:59Z')).toBe('2026-10-19');
    expect(server.wibYmdOf('bukan tanggal')).toBeNull();
  });

  it('cermin 15.00 untuk gelombang 11.00 (e56f4853): batas dari jam gelombang', () => {
    const v = server.kilatPaymentGate({ startDate: '2026-09-14T08:00:00+00:00', kilatHour: 11 }, 0);
    expect(v).toEqual({ ok: true, deadlineMs: Date.parse('2026-09-14T03:00:00Z') });
  });

  it('tanpa jam atau tanpa tanggal → kilat_wave_missing', () => {
    expect(server.kilatPaymentGate({ startDate: '2026-10-19T04:00:00Z', kilatHour: null }, 0)).toMatchObject({ ok: false, code: 'kilat_wave_missing' });
    expect(server.kilatPaymentGate({ startDate: null, kilatHour: 11 }, 0)).toMatchObject({ ok: false, code: 'kilat_wave_missing' });
  });
});

describe('server: umur link Kilat', () => {
  const deadline = Date.parse('2026-10-19T03:00:00Z');
  it('dipangkas ke sisa menit sampai batas; tidak memanjangkan permintaan yang lebih pendek', () => {
    expect(server.kilatDueMinutes(60 * 24 * 7, deadline, Date.parse('2026-10-19T01:30:00Z'))).toBe(90);
    expect(server.kilatDueMinutes(30, deadline, Date.parse('2026-10-19T01:30:00Z'))).toBe(30);
  });
  it('lantai 1 menit — 0 di DOKU berarti "setelan dashboard", bukan mati', () => {
    expect(server.kilatDueMinutes(60, deadline, deadline - 30_000)).toBe(1);
  });
});

describe('klien: payDeadlineFor', () => {
  it('Iklan (tanpa jam) = 14.00 WIB; Kilat = gelombang − 60 menit', () => {
    expect(payDeadlineFor('2026-10-19', null).getTime()).toBe(paymentCutoffInstant('2026-10-19').getTime());
    expect(payDeadlineFor('2026-10-19', 11).toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(payDeadlineFor('2026-10-19', 15).toISOString()).toBe('2026-10-19T07:00:00.000Z');
  });
  it('Iklan: 14.00 tepat sudah terlambat (perilaku lama tak berubah)', () => {
    expect(isPayDeadlinePassed('2026-10-19', null, new Date('2026-10-19T07:00:00Z'))).toBe(true);
    expect(isPayDeadlinePassed('2026-10-19', null, new Date('2026-10-19T06:59:59Z'))).toBe(false);
  });
});
