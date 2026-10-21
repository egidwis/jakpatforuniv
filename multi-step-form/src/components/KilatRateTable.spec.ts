import { describe, it, expect } from 'vitest';
import { kilatRateColumns, kilatRatePhase } from './KilatRateTable';
import { KILAT_RATE_SCHEDULE } from '../utils/constants';

/*
  Tabel tarif modal Kilat = padanan `rateTableColumns` milik Iklan: hanya entri
  yang berlaku SEKARANG dan sesudahnya, kolom pertama = kolom aktif. Yang dijaga:
  kolom yang sudah lewat tidak muncul lagi, dan fase kalimat pengumuman
  mengikuti entri yang berlaku (bukan tanggal yang ditulis tangan).
*/
const at = (iso: string) => Date.parse(iso);

describe('kilatRateColumns', () => {
  it('21 Okt: tiga kolom, perkenalan s/d 30 Nov aktif', () => {
    const cols = kilatRateColumns(at('2026-10-21T10:00:00+07:00'));
    expect(cols).toHaveLength(3);
    expect(cols[0]).toMatchObject({ active: true, entry: KILAT_RATE_SCHEDULE[0] });
    expect(cols.slice(1).every((c) => !c.active)).toBe(true);
  });

  it('Desember: kolom Oktober-November dibuang', () => {
    const cols = kilatRateColumns(at('2026-12-05T10:00:00+07:00'));
    expect(cols.map((c) => c.entry)).toEqual([KILAT_RATE_SCHEDULE[1], KILAT_RATE_SCHEDULE[2]]);
    expect(cols[0].active).toBe(true);
  });

  it('1 Jan 2027: tinggal tarif normal', () => {
    const cols = kilatRateColumns(at('2027-01-01T00:00:00+07:00'));
    expect(cols).toHaveLength(1);
    expect(cols[0].entry.introUntil).toBeNull();
  });

  it('sebelum entri pertama: kolom pertama tetap dianggap sekarang', () => {
    const cols = kilatRateColumns(at('2026-09-01T00:00:00+07:00'));
    expect(cols).toHaveLength(3);
    expect(cols[0].active).toBe(true);
  });
});

describe('kilatRatePhase', () => {
  it('mengikuti entri yang berlaku', () => {
    expect(kilatRatePhase(at('2026-10-21T10:00:00+07:00'))).toBe('intro');
    expect(kilatRatePhase(at('2026-12-05T10:00:00+07:00'))).toBe('intro2');
    expect(kilatRatePhase(at('2027-01-02T10:00:00+07:00'))).toBe('full');
  });
});
