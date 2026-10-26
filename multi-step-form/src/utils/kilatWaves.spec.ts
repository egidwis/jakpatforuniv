import { describe, it, expect } from 'vitest';
import {
  KILAT_WAVE_WINDOW_DAYS,
  KILAT_WAVE_WORKDAYS,
  kilatLockGate,
  kilatPickStatus,
  kilatPreviewDayYmd,
  kilatWaveDays,
  kilatWaveStatus,
  kilatWaveWindow,
  parseKilatOccupancy,
  type KilatWaveRow,
} from './kilatWaves';
import { addDaysToYmd, isWeekdayYmd, kilatBookingClosesAt } from './airing-window';

/*
  Pemilih gelombang peneliti (Phase 5 §5.5). Baris di sini berbentuk keluaran
  `get_kilat_wave_occupancy` (sql/117) — urutan status = urutan trigger
  `validate_kilat_wave_claim`: hari tertutup → batas pesan → kuota.
*/

const row = (date: string, hour: number, over: Partial<KilatWaveRow> = {}): KilatWaveRow => ({
  date,
  hour,
  used: 0,
  capacity: 2,
  bookingClosesAt: kilatBookingClosesAt(date, hour).toISOString(),
  isClosed: false,
  closedReason: null,
  ...over,
});

// Senin 19 Okt 2026, 08.00 WIB.
const NOW = new Date('2026-10-19T01:00:00Z');

describe('parseKilatOccupancy', () => {
  it('memetakan kolom RPC apa adanya', () => {
    const [r] = parseKilatOccupancy([{
      wave_date: '2026-10-19', wave_hour: 11, used: 1, capacity: 2,
      booking_closes_at: '2026-10-19T02:00:00+00:00', is_closed: false, closed_reason: null,
    }]);
    expect(r).toEqual({
      date: '2026-10-19', hour: 11, used: 1, capacity: 2,
      bookingClosesAt: '2026-10-19T02:00:00+00:00', isClosed: false, closedReason: null,
    });
  });

  it('bukan larik → kosong (tidak pernah melempar)', () => {
    expect(parseKilatOccupancy(null)).toEqual([]);
  });
});

describe('kilatWaveStatus', () => {
  it('gelombang 11.00 masih terbuka pukul 08.00, tutup lewat 09.00', () => {
    expect(kilatWaveStatus(row('2026-10-19', 11), NOW)).toBe('open');
    expect(kilatWaveStatus(row('2026-10-19', 11), new Date('2026-10-19T02:00:01Z'))).toBe('cutoff');
  });

  it('tepat di detik batas masih boleh — `now() >` di trigger', () => {
    expect(kilatWaveStatus(row('2026-10-19', 11), new Date('2026-10-19T02:00:00Z'))).toBe('open');
  });

  it('kuota 2 terisi → penuh', () => {
    expect(kilatWaveStatus(row('2026-10-19', 15, { used: 2 }), NOW)).toBe('full');
  });

  it('libur menang atas penuh dan batas pesan', () => {
    const r = row('2026-10-19', 15, { used: 2, isClosed: true, closedReason: 'holiday' });
    expect(kilatWaveStatus(r, NOW)).toBe('holiday');
  });
});

describe('kilatWaveDays', () => {
  it('akhir pekan dibuang, libur tetap dirender tertutup', () => {
    const rows = [
      row('2026-10-23', 11), row('2026-10-23', 15),
      row('2026-10-24', 11, { isClosed: true, closedReason: 'weekend' }),
      row('2026-10-26', 11, { isClosed: true, closedReason: 'holiday' }),
      row('2026-10-26', 15, { isClosed: true, closedReason: 'holiday' }),
    ];
    // Kamis 22 Okt → jendela 3 hari kerja s/d Senin 26 Okt (sql/122 K3).
    const days = kilatWaveDays(rows, new Date('2026-10-22T01:00:00Z'));
    expect(days.map((d) => d.ymd)).toEqual(['2026-10-23', '2026-10-26']);
    expect(days[1]).toMatchObject({ isHoliday: true, hasOpenWave: false });
  });

  it('jendela peneliti = 3 hari kerja mulai hari ini; hari ke-4 tidak dirender', () => {
    const rows = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].map((d) => row(d, 15));
    expect(kilatWaveDays(rows, NOW).map((d) => d.ymd)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });

  it('jam diurutkan dan sisa kursi dihitung', () => {
    const [day] = kilatWaveDays([row('2026-10-20', 15, { used: 1 }), row('2026-10-20', 11)], NOW);
    expect(day.waves.map((w) => [w.hour, w.remaining])).toEqual([[11, 2], [15, 1]]);
  });

  it('hari dengan semua gelombang lewat batas tidak terbuka', () => {
    const later = new Date('2026-10-19T06:30:00Z'); // 13.30 WIB
    const [day] = kilatWaveDays([row('2026-10-19', 11), row('2026-10-19', 15)], later);
    expect(day.hasOpenWave).toBe(false);
  });

  it('dipotong ke 10 hari kerja', () => {
    const rows: KilatWaveRow[] = [];
    for (let i = 0; i < 20; i++) rows.push(row(addDaysToYmd('2026-10-19', i), 11));
    expect(kilatWaveDays(rows, NOW)).toHaveLength(KILAT_WAVE_WORKDAYS);
  });
});

describe('kilatPreviewDayYmd', () => {
  it('hari kerja ke-4 = pratinjau "belum tersedia"', () => {
    // Senin 26 Okt → jendela Sen–Rab, pratinjau Kamis 29 Okt.
    expect(kilatPreviewDayYmd(new Date('2026-10-26T02:00:00Z'))).toBe('2026-10-29');
  });

  it('melompati akhir pekan', () => {
    // Jumat 23 Okt → jendela Jum, Sen, Sel; pratinjau Rabu 28 Okt.
    expect(kilatPreviewDayYmd(new Date('2026-10-23T02:00:00Z'))).toBe('2026-10-28');
  });

  it('akhir pekan: dihitung dari Senin', () => {
    // Sabtu 24 Okt → jendela Sen–Rab, pratinjau Kamis 29 Okt.
    expect(kilatPreviewDayYmd(new Date('2026-10-24T02:00:00Z'))).toBe('2026-10-29');
  });
});

describe('kilatWaveWindow', () => {
  it('mulai hari ini WIB — 23.30 WIB Minggu masih Minggu', () => {
    expect(kilatWaveWindow(new Date('2026-10-18T16:30:00Z')).from).toBe('2026-10-18');
  });

  it('muat batas RPC (≤ 31 hari) dan selalu memuat jendela hari kerja peneliti', () => {
    expect(KILAT_WAVE_WINDOW_DAYS).toBeLessThanOrEqual(31);
    for (let i = 0; i < 7; i++) {
      const from = addDaysToYmd('2026-10-19', i);
      let workdays = 0;
      for (let d = 0; d <= KILAT_WAVE_WINDOW_DAYS; d++) if (isWeekdayYmd(addDaysToYmd(from, d))) workdays++;
      expect(workdays).toBeGreaterThanOrEqual(KILAT_WAVE_WORKDAYS);
    }
  });
});

describe('kilatPickStatus', () => {
  it('pilihan yang tak ada di okupansi → null (belum terbaca, jangan dikunci)', () => {
    expect(kilatPickStatus([row('2026-10-20', 11)], { ymd: '2026-10-20', hour: 15 }, NOW)).toBeNull();
    expect(kilatPickStatus([row('2026-10-20', 11)], { ymd: '2026-10-20', hour: 11 }, NOW)).toBe('open');
  });
});

describe('kilatLockGate', () => {
  const ready = { isReady: true, rows: [row('2026-10-19', 11), row('2026-10-19', 15, { used: 2 })] };

  it('urutan: tanpa tanggal → tanpa gelombang', () => {
    expect(kilatLockGate(null, ready, NOW)).toMatchObject({ ok: false, reason: 'no_date' });
    expect(kilatLockGate({ ymd: '2026-10-19', hour: null }, ready, NOW)).toMatchObject({ ok: false, reason: 'no_wave' });
  });

  it('lewat batas dinilai SEBELUM data terbaca — tak perlu menunggu untuk gelombang mati', () => {
    const late = new Date('2026-10-19T02:30:00Z');
    const v = kilatLockGate({ ymd: '2026-10-19', hour: 11 }, { isReady: false, rows: [] }, late);
    expect(v).toMatchObject({ ok: false, reason: 'past_cutoff', clearSelection: true });
  });

  it('KOSONG BUKAN LOWONG: belum terbaca / baris tak ada → muat ulang', () => {
    expect(kilatLockGate({ ymd: '2026-10-19', hour: 11 }, { isReady: false, rows: [] }, NOW))
      .toMatchObject({ ok: false, reason: 'availability_unknown', shouldReload: true });
    expect(kilatLockGate({ ymd: '2026-10-20', hour: 11 }, ready, NOW))
      .toMatchObject({ ok: false, reason: 'availability_unknown', shouldReload: true });
  });

  it('penuh → teguran + muat ulang; terbuka → lolos', () => {
    expect(kilatLockGate({ ymd: '2026-10-19', hour: 15 }, ready, NOW)).toMatchObject({ ok: false, reason: 'wave_full' });
    expect(kilatLockGate({ ymd: '2026-10-19', hour: 11 }, ready, NOW)).toEqual({ ok: true, ymd: '2026-10-19', hour: 11 });
  });

  it('di luar 3 hari kerja (draf / halaman lama) → too_far, pilihan dibersihkan', () => {
    const far = { isReady: true, rows: [row('2026-10-22', 11)] };
    expect(kilatLockGate({ ymd: '2026-10-22', hour: 11 }, far, NOW))
      .toMatchObject({ ok: false, reason: 'too_far', messageKey: 'kilatErrorWaveTooFar', clearSelection: true });
  });

  it('mode libur (sql/122) → ditolak dengan teguran libur, pilihan dibersihkan', () => {
    const hol = { isReady: true, rows: [row('2026-10-19', 11, { isClosed: true, closedReason: 'holiday' })] };
    expect(kilatLockGate({ ymd: '2026-10-19', hour: 11 }, hol, NOW))
      .toMatchObject({ ok: false, reason: 'holiday', messageKey: 'kilatErrorWaveHoliday', clearSelection: true });
  });
});
