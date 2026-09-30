import { describe, expect, it } from 'vitest';
import { rateNoticePhase, rateTableColumns } from './RateNotice';

const T = (iso: string) => Date.parse(iso);

describe('fase pengumuman tarif (tepi WIB)', () => {
  it('30 Sep malam (deploy) s/d 30 Nov → "harga masih sama"', () => {
    expect(rateNoticePhase(T('2026-09-30T21:00:00+07:00'))).toBe('intro');
    expect(rateNoticePhase(T('2026-11-30T23:59:59+07:00'))).toBe('intro');
  });
  it('Desember → tahap 2', () => {
    expect(rateNoticePhase(T('2026-12-01T00:00:00+07:00'))).toBe('intro2');
  });
  it('Januari → tarif penuh; mulai 1 Feb 2027 hilang', () => {
    expect(rateNoticePhase(T('2027-01-01T00:00:00+07:00'))).toBe('full');
    expect(rateNoticePhase(T('2027-02-01T00:00:00+07:00'))).toBeNull();
  });
});

describe('kolom tabel tarif = sekarang dan sesudahnya', () => {
  it('Oktober: tiga kolom, yang pertama aktif', () => {
    const cols = rateTableColumns(T('2026-10-05T00:00:00+07:00'));
    expect(cols.map((c) => c.entry.effective[2])).toEqual([300000, 400000, 500000]);
    expect(cols.map((c) => c.active)).toEqual([true, false, false]);
  });
  it('sebelum 1 Okt: sama dengan Oktober (angkanya harga lama)', () => {
    expect(rateTableColumns(T('2026-09-30T21:00:00+07:00')).length).toBe(3);
  });
  it('Desember: kolom Oktober dibuang', () => {
    expect(rateTableColumns(T('2026-12-05T00:00:00+07:00')).map((c) => c.entry.effective[2])).toEqual([400000, 500000]);
  });
});
