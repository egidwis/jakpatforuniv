/**
 * Pengambilan data untuk tab Responden — dan HANYA tab Responden.
 *
 * ## Kenapa RPC, bukan paginasi seperti tab Revenue
 *
 * `page_respondents` berisi 122.929 baris di produksi. PostgREST memotong satu
 * respons di 1000 baris, jadi menariknya mentah berarti **26 round-trip** untuk
 * rentang 30 hari dan **123 round-trip** (±22 MB JSON) untuk "Semua waktu" —
 * itulah teks loading "beberapa detik" yang dulu menempel di tab ini.
 *
 * Diukur dengan `EXPLAIN (ANALYZE, BUFFERS)`: seq scan penuh tabel itu cuma
 * 45–85 ms dan seluruhnya cache hit. Databasenya bukan hambatan; MEMINDAHKAN
 * barisnya yang mahal. `sql/67_respondent_analytics.sql` memampatkannya jadi satu
 * POST dan ±1 KB payload.
 *
 * ⚠️ Jangan menambahkan query mentah ke `page_respondents` di sini. Kalau ada
 * angka baru yang dibutuhkan, tambahkan agregatnya di RPC — begitu satu query
 * mentah masuk, seluruh keuntungan di atas hilang dalam satu langkah.
 *
 * ## Satu query kedua, dan kenapa ia sah
 *
 * Kartu "Permintaan Customer" membaca `form_submissions` (teks bebas
 * `criteria_responden` dan `status`), bukan `page_respondents`. Tabel itu kecil —
 * di bawah seribu baris seumur hidup, jadi satu round-trip — dan menormalkan teks
 * bebasnya memang pekerjaan klien, bukan SQL.
 */

import { supabase } from '../supabase';
import { previousRange } from './fetchRevenueData';
import { RESPONDENT_RPC, toAiringCycleRange, type RespondentRpcPayload } from './respondent';
import type { DateRange } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

/** Hanya kolom yang BENAR-BENAR dibaca `criteriaRows`/`studentStatusRows`. */
const SUB_COLUMNS = 'id, status, criteria_responden, created_at';

export interface RespondentDataset {
    payload: RespondentRpcPayload;
    submissions: AnyRow[];
}

export async function fetchRespondentData(range: DateRange): Promise<RespondentDataset> {
    /*
     * Rentang DIGESER ke batas siklus tayang sebelum dikirim ke RPC.
     *
     * Iklan tayang 15:00 → 15:00 WIB, jadi satu tanggal kalender memuat dua
     * gelombang. RPC mengelompokkan dengan `wib - 15 jam`; mengirim batas tengah
     * malam ke sana menghasilkan ember pertama & terakhir yang separuh terisi, dan
     * laju "respons per survei" di kedua ujungnya jadi terlalu rendah.
     *
     * ⚠️ Kartu "Permintaan Customer" di bawahnya SENGAJA tetap memakai rentang
     * kalender: ia membaca `form_submissions.created_at` — kapan customer MEMESAN,
     * bukan kapan iklannya tayang. Memaksanya ikut bergeser 15 jam berarti
     * memindahkan order yang dipesan pukul 08:00 ke hari sebelumnya tanpa alasan.
     */
    const cycle = toAiringCycleRange(range);

    // Definisi "periode sebelumnya" DIPAKAI BERSAMA dengan tab Revenue dan dikirim
    // ke SQL sebagai parameter. Menyalinnya ke dalam fungsi Postgres berarti dua
    // definisi yang bisa menyimpang diam-diam tanpa ada yang gagal.
    const prev = previousRange(cycle);

    const [rpc, subs] = await Promise.all([
        supabase.rpc(RESPONDENT_RPC, {
            p_from: cycle.from.toISOString(),
            p_to: cycle.to.toISOString(),
            p_prev_from: prev.from.toISOString(),
            p_prev_to: prev.to.toISOString(),
        }),
        supabase
            .from('form_submissions')
            .select(SUB_COLUMNS)
            .gte('created_at', range.from.toISOString())
            .lt('created_at', range.to.toISOString()),
    ]);

    if (rpc.error) throw rpc.error;
    if (subs.error) throw subs.error;

    return {
        // RPC mengembalikan satu nilai `jsonb`; `data` sudah objeknya, bukan array baris.
        payload: (rpc.data ?? {}) as RespondentRpcPayload,
        submissions: subs.data ?? [],
    };
}
