import { describe, it, expect, vi } from 'vitest';
import { fetchAdSchedules } from './supabase';

/**
 * `ordinal = 1` sendirian sudah 1.009 baris di produksi (2026-08-20) — lebih
 * dari batas baris bawaan PostgREST (1.000). Karena query lama mengurutkan
 * `ordinal ASC` tanpa `.range()`, batas itu terisi penuh oleh `ordinal = 1`
 * sebelum sempat menyentuh satu pun baris `ordinal > 1`: jadwal ke-2/3+ dari
 * SETIAP order lenyap dari papan Schedule, bukan cuma yang barunya.
 *
 * Fixture ini meniru batas server itu: tanpa `.range()` eksplisit, hanya 1.000
 * baris pertama yang pernah dikembalikan.
 */
let fixtureRows: any[] = [];

function makeQueryBuilder() {
  let rangeFrom: number | undefined;
  let rangeTo: number | undefined;
  const builder: any = {
    select: () => builder,
    in: () => builder,
    eq: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      rangeFrom = from;
      rangeTo = to;
      return builder;
    },
    then: (resolve: any, reject: any) => {
      try {
        const from = rangeFrom ?? 0;
        const to = rangeTo ?? 999; // batas server default kalau tak ada .range()
        resolve({ data: fixtureRows.slice(from, to + 1), error: null, count: fixtureRows.length });
      } catch (e) {
        reject(e);
      }
    },
  };
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'ad_schedules') throw new Error(`unexpected table in test: ${table}`);
      return makeQueryBuilder();
    },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

/** `distribution_type: 'kilat'` membuat fixture berdiri sendiri — jalur itu
 *  tidak pernah menanyakan `survey_pages`. */
function makeRow(overrides: { id: string; submission_id: string; ordinal: number }) {
  return {
    source_table: 'form_submissions',
    source_id: overrides.id,
    booking_id: overrides.id.slice(0, 8).toUpperCase(),
    start_date: null,
    end_date: null,
    duration: 1,
    status: 'approved',
    review_status: 'approved',
    payment_status: 'pending',
    distribution_type: 'kilat',
    kilat_slot_hour: 8,
    is_extra_ad: false,
    total_cost: 0,
    subtotal: null,
    ppn_amount: null,
    voucher_code: null,
    prize_per_winner: 0,
    winner_count: 0,
    additional_prize_per_winner: 0,
    is_new_period: false,
    period_batch: null,
    slot_booked_by: 'user',
    slot_reserved_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    form_submissions: { title: 'T', full_name: 'F', university: null, created_at: '2026-08-01T00:00:00.000Z' },
    ...overrides,
  };
}

describe('fetchAdSchedules', () => {
  it('does not drop ordinal>1 rows when ordinal=1 rows alone exceed the server row cap', async () => {
    const ordinal1 = Array.from({ length: 1000 }, (_, i) =>
      makeRow({ id: `s1-${i}`, submission_id: `sub1-${i}`, ordinal: 1 })
    );
    const ordinal2 = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `s2-${i}`, submission_id: `sub2-${i}`, ordinal: 2 })
    );
    fixtureRows = [...ordinal1, ...ordinal2];

    const result = await fetchAdSchedules();

    expect(result).toHaveLength(1005);
    expect(result.filter((r) => r.ordinal === 2)).toHaveLength(5);
  });
});
