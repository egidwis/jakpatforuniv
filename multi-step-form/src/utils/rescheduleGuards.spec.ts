import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Penjaga Track B2: jadwal yang DIBATALKAN ADMIN tidak boleh dihidupkan kembali
 * oleh peneliti.
 *
 * `cancelSchedule()` menulis `submission_status = 'slot_cancelled'` DAN
 * `payment_status = 'expired'`. Satu-satunya penjaga sebelum ini adalah
 * `payment_status NOT IN ('paid','completed')` — dan 'expired' lolos dari situ.
 * Jadi tombol "Jadwalkan Ulang" di dashboard peneliti membatalkan keputusan
 * admin tanpa peringatan ke siapa pun.
 *
 * Yang diuji di sini FILTERNYA, bukan hasilnya: kalau penjaga itu hilang dari
 * rantai query, uji ini gagal meski fungsinya "berhasil". Menguji lewat baris
 * hasil saja tidak cukup — fixture bisa mengembalikan nol baris karena alasan
 * lain dan menyembunyikan hilangnya penjaga.
 */

type Call = { table: string; filters: [string, ...unknown[]][] };
let calls: Call[] = [];
let rowsToReturn: any[] = [];

function builderFor(table: string) {
  const call: Call = { table, filters: [] };
  calls.push(call);
  const b: any = {
    update: (...a: unknown[]) => { call.filters.push(['update', ...a]); return b; },
    eq:     (...a: unknown[]) => { call.filters.push(['eq', ...a]);     return b; },
    neq:    (...a: unknown[]) => { call.filters.push(['neq', ...a]);    return b; },
    not:    (...a: unknown[]) => { call.filters.push(['not', ...a]);    return b; },
    or:     (...a: unknown[]) => { call.filters.push(['or', ...a]);     return b; },
    in:     (...a: unknown[]) => { call.filters.push(['in', ...a]);     return b; },
    order:  () => b,
    limit:  () => b,
    select: (...a: unknown[]) => {
      call.filters.push(['select', ...a]);
      return Promise.resolve({ data: rowsToReturn, error: null });
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res: any) => res({ data: rowsToReturn, error: null }),
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => builderFor(table),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  }),
}));

const { rebookSlotForSubmission } = await import('./supabase');

const submissionCall = () => calls.find((c) => c.table === 'form_submissions')!;
const hasFilter = (c: Call, kind: string, ...args: unknown[]) =>
  c.filters.some((f) => f[0] === kind && args.every((a, i) => f[i + 1] === a));

describe('rebookSlotForSubmission — penjaga slot_cancelled', () => {
  beforeEach(() => { calls = []; rowsToReturn = [{ id: 'sub-1' }]; });

  it('menolak order slot_cancelled lewat filter, bukan cuma lewat hasil', async () => {
    await rebookSlotForSubmission('sub-1', '2026-09-03', 1);
    expect(hasFilter(submissionCall(), 'neq', 'submission_status', 'slot_cancelled')).toBe(true);
  });

  it('penjaga pembayaran yang lama TETAP ada — B2 menambah, tidak menggantikan', async () => {
    // 'expired' lolos dari filter ini; itu sebabnya B2 perlu. Tapi order yang
    // benar-benar LUNAS tetap harus ditolak, jadi keduanya wajib berdiri.
    await rebookSlotForSubmission('sub-1', '2026-09-03', 1);
    expect(hasFilter(submissionCall(), 'not', 'payment_status', 'in')).toBe(true);
  });

  it('nol baris tersentuh dilempar, bukan dilaporkan sebagai sukses', async () => {
    rowsToReturn = [];
    await expect(rebookSlotForSubmission('sub-1', '2026-09-03', 1)).rejects.toThrow();
  });

  it('pesan gagalnya menyebut pembatalan admin sebagai kemungkinan', async () => {
    // Kalau pesannya cuma bicara "sudah lunas atau ditolak RLS", peneliti yang
    // jadwalnya dibatalkan admin akan membaca penyebab yang salah.
    rowsToReturn = [];
    await expect(rebookSlotForSubmission('sub-1', '2026-09-03', 1)).rejects.toThrow(/tim Jakpat/);
  });
});

/*
  Phase 5 §5.7 (R6): primitif yang SAMA memilih ulang gelombang Kilat. Bentuk
  tulisnya = INSERT Kilat `submitOrder` ([tanggal, +1) DATE + jam gelombang +
  durasi 1), dan produknya dijaga di KUERI: bentuk yang salah untuk jenis
  order = nol baris = galat, bukan jadwal salah bentuk.
*/
describe('rebookSlotForSubmission — gelombang Kilat', () => {
  beforeEach(() => { calls = []; rowsToReturn = [{ id: 'sub-1' }]; });
  const patchOf = (c: Call) => c.filters.find((f) => f[0] === 'update')![1] as Record<string, unknown>;

  it('Kilat: [tanggal, +1) sebagai DATE + kilat_slot_hour + durasi 1, hold peneliti', async () => {
    await rebookSlotForSubmission('sub-1', '2026-10-23', 1, { kilatHour: 15 });
    expect(patchOf(submissionCall())).toMatchObject({
      start_date: '2026-10-23',
      end_date: '2026-10-24',
      kilat_slot_hour: 15,
      duration: 1,
      slot_booked_by: 'user',
      submission_status: 'waiting_payment',
      payment_status: 'pending',
    });
  });

  it('Kilat hanya menyentuh baris Kilat', async () => {
    await rebookSlotForSubmission('sub-1', '2026-10-23', 1, { kilatHour: 11 });
    expect(hasFilter(submissionCall(), 'eq', 'distribution_type', 'kilat')).toBe(true);
    expect(hasFilter(submissionCall(), 'neq', 'submission_status', 'slot_cancelled')).toBe(true);
  });

  it('bentuk Iklan tidak pernah menyentuh baris Kilat (NULL tetap dihitung Iklan)', async () => {
    await rebookSlotForSubmission('sub-1', '2026-10-23', 2);
    const c = submissionCall();
    expect(hasFilter(c, 'or', 'distribution_type.is.null,distribution_type.neq.kilat')).toBe(true);
    expect(patchOf(c)).not.toHaveProperty('kilat_slot_hour');
    expect(patchOf(c).start_date).toBe('2026-10-23T08:00:00.000Z');
  });

  it('salah pasang (nol baris) dilempar', async () => {
    rowsToReturn = [];
    await expect(rebookSlotForSubmission('sub-1', '2026-10-23', 1, { kilatHour: 11 })).rejects.toThrow(/jenis ordernya/);
  });
});
