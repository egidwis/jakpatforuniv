import { describe, it, expect, vi, afterAll } from 'vitest';
import { fetchSlotAvailability } from './supabase';

/**
 * Insiden 6 Okt 2026: hari itu jadi 5/4 reguler walau cek browser BERJALAN
 * (log edge: kedua RPC okupansi 200, lalu INSERT 201). Loop hari di
 * `fetchSlotAvailability` dulu memakai `new Date('YYYY-MM-DD')` (UTC) lalu
 * `setHours(0)` LOKAL. Di perangkat berzona barat UTC setiap kolom DATE
 * mundur sehari, dan 6 Okt terbaca kurang dari 4.
 *
 * Kunci hari harus kalender WIB, apa pun zona perangkatnya. Node membaca
 * ulang `process.env.TZ` saat diubah, jadi satu berkas bisa menguji beberapa
 * zona.
 */

const submissionRows = [
  // Kaki 1 — kolom DATE apa adanya.
  { id: 'a', title: 'A', start_date: '2026-10-04', end_date: '2026-10-07', submission_status: 'paid', payment_status: 'paid', slot_booked_by: 'admin', slot_reserved_at: null, is_extra_ad: false },
  { id: 'b', title: 'B', start_date: '2026-10-06', end_date: '2026-10-08', submission_status: 'paid', payment_status: 'paid', slot_booked_by: 'admin', slot_reserved_at: null, is_extra_ad: false },
  { id: 'd', title: 'D', start_date: '2026-10-06', end_date: '2026-10-07', submission_status: 'paid', payment_status: 'paid', slot_booked_by: 'user', slot_reserved_at: null, is_extra_ad: false },
];

const extendRows = [
  // Kaki 2 — TIMESTAMPTZ: tayang sejak 5 Okt 15.00 WIB (= 08:00 UTC).
  { id: 'c', submission_id: 'c-parent', title: 'C', start_date: '2026-10-05T08:00:00+00:00', end_date: '2026-10-08T08:00:00+00:00', submission_status: 'paid', payment_status: 'paid', slot_booked_by: 'admin', slot_reserved_at: null, is_extra_ad: false },
];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (name: string) => {
      if (name === 'get_submission_slot_occupancy') return Promise.resolve({ data: submissionRows, error: null });
      if (name === 'get_extend_slot_occupancy') return Promise.resolve({ data: extendRows, error: null });
      throw new Error(`unexpected rpc in test: ${name}`);
    },
    from: (table: string) => {
      throw new Error(`unexpected table in test: ${table}`);
    },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe.each(['America/Los_Angeles', 'Asia/Jakarta', 'UTC', 'Pacific/Auckland'])(
  'fetchSlotAvailability di zona perangkat %s',
  (tz) => {
    it('menghitung 6 Okt sebagai 4/4 — kunci hari = kalender WIB', async () => {
      process.env.TZ = tz;
      const { regularCounts } = await fetchSlotAvailability();
      expect(regularCounts['2026-10-06']).toBe(4);
    });

    it('akhir-eksklusif: hari serah-terima tidak dihitung', async () => {
      process.env.TZ = tz;
      const { regularCounts } = await fetchSlotAvailability();
      expect(regularCounts).toEqual({
        '2026-10-04': 1,
        '2026-10-05': 2,
        '2026-10-06': 4,
        '2026-10-07': 2,
      });
    });
  }
);
