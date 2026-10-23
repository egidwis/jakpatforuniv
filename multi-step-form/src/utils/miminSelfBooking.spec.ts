import { describe, expect, test } from 'vitest';
import { buildMiminSelfBookingSection, MIMIN_SELF_BOOKING_HEADING } from './miminSelfBooking';

describe('buildMiminSelfBookingSection (sql/125)', () => {
  test('saklar buka → string kosong (prompt tidak berubah sama sekali)', () => {
    expect(buildMiminSelfBookingSection(null)).toBe('');
  });

  test('ditutup: judul tetap, tanggal nyala, pesan admin dikutip, larangan mengarahkan ke kalender', () => {
    const out = buildMiminSelfBookingSection({ since: '2026-10-22', message: 'Ada penyesuaian "jadwal".', messageEn: '' });
    expect(out.startsWith(MIMIN_SELF_BOOKING_HEADING)).toBe(true);
    expect(out).toContain('Kamis, 22 Oktober 2026');
    expect(out).toContain('"Ada penyesuaian \'jadwal\'."');
    expect(out).toContain('JANGAN mengarahkan');
    expect(out).toMatch(/tetap boleh dibayar/);
  });

  test('tanpa pesan: tidak mengarang alasan', () => {
    const out = buildMiminSelfBookingSection({ since: '2026-10-22', message: ' ', messageEn: '' });
    expect(out).toContain('tidak menulis alasan');
    expect(out).not.toContain('Pesan admin untuk peneliti');
  });
});
