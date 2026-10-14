/**
 * PostgREST membatasi satu respons di 1000 baris. Tanpa paginasi, batas itu tidak
 * memunculkan error — ia hanya diam-diam memotong hasil.
 *
 * `buildQuery` dipanggil ulang tiap halaman karena builder supabase-js tidak bisa
 * dipakai dua kali. Urutannya WAJIB stabil (sertakan kolom unik seperti `id` di
 * `order`), kalau tidak `.range()` bisa melewatkan atau mengulang baris.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchAllRows<T = Record<string, any>>(
    buildQuery: () => any,
    batchSize = 1000,
): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    for (;;) {
        const { data, error } = await buildQuery().range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
    }
    return all;
}
