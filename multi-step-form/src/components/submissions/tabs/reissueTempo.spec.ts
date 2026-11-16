import { describe, it, expect } from 'vitest';
import { reissueTempoCopy } from './reissueTempo';

/*
  Dialog "Terbitkan Ulang Tagihan Tempo". Dua hal yang WAJIB terbaca sebelum
  admin menekan lanjut: iklannya tidak berhenti, dan untuk tagihan gabungan,
  pesanan lain TIDAK ikut tagihan baru ini (mereka diperbarui otomatis).
*/
describe('reissueTempoCopy', () => {
  it('tunggal', () => {
    const c = reissueTempoCopy({ bookingId: 'KH7QQM9T', paymentId: 'JFU-INV-x', memberCount: 1, otherTitles: [] });
    expect(c.title).toBe('Terbitkan ulang tagihan tempo #KH7QQM9T?');
    expect(c.lines[0]).toBe('Iklannya TETAP tayang. Yang diganti hanya tagihannya.');
    expect(c.lines.join(' ')).toContain('Link bayar lama JFU-INV-x dimatikan');
    expect(c.lines.join(' ')).not.toContain('gabungan');
    expect(c.confirmLabel).toBe('Lanjut ke formulir tagihan');
  });

  it('gabungan menyebut anggota lain dan jalan Tagihan Gabungan', () => {
    const c = reissueTempoCopy({ bookingId: 'KH7QQM9T', paymentId: 'JFU-INV-x', memberCount: 3, otherTitles: ['Mun11', 'Mun12'] });
    const text = c.lines.join(' ');
    expect(text).toContain('tagihan gabungan 3 pesanan');
    expect(text).toContain('Mun11, Mun12');
    expect(text).toContain('ditagih ulang otomatis dengan nominal sisanya');
    expect(text).toContain('pakai Tagihan Gabungan');
  });
});
