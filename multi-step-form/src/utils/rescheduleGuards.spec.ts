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
