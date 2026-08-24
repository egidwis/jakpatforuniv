/**
 * Pengambilan data untuk tab Revenue — dan HANYA tab Revenue.
 *
 * ## Kenapa berkas ini ada
 *
 * `AnalyticsDashboard` dulu punya satu `fetchAllData()` yang menarik keempat tabel
 * setiap kali periode berubah, termasuk `page_respondents`. Tabel itu berisi
 * **120.546 baris** di produksi; memilih "Semua waktu" berarti 121 round-trip
 * paginasi untuk data yang tab Revenue tidak pernah sentuh. Itulah sebab teks
 * loading "mungkin memakan waktu beberapa detik". Di sini pengambilannya dipisah
 * per tab: Revenue cuma butuh `transactions` + `form_submissions`.
 *
 * Query `pendingTransactions` dulu ada di sini sebagai round-trip keempat, semata-mata
 * untuk memberi makan kartu "Belum Tertagih". Kartunya dihapus, jadi query-nya ikut:
 * membiarkannya berarti membayar satu perjalanan jaringan tiap ganti periode untuk
 * angka yang tidak pernah tampil di mana pun.
 *
 * ## Jebakan yang ditutup berkas ini
 *
 * Transaksi difilter menurut `created_at`-nya, submission menurut `created_at`
 * submission. Keduanya tidak bergerak bersama: sebuah order yang DIBUAT bulan lalu
 * bisa DIBAYAR hari ini. Kode lama memakai `submissions.find(...)` di atas daftar
 * submission yang sudah terpotong window, jadi transaksi semacam itu tidak menemukan
 * induknya — uangnya tetap masuk Total Revenue tapi lenyap dari setiap breakdown
 * (per universitas, per jurusan, per kanal). Terukur di produksi: Rp 444.000 pada
 * window 7 hari, Rp 1.221.000 pada 30 hari.
 *
 * Solusinya bukan memperlebar window submission — itu akan mengubah angka lain —
 * melainkan **menyusul mengambil submission yang kurang berdasarkan id**, supaya peta
 * yang diterima lapisan hitung dijamin menutupi seluruh transaksi.
 */

import { supabase } from '../supabase';
import type { DateRange } from './types';

/** Baris mentah dari PostgREST. Bentuk kolomnya divalidasi di lapisan hitung, bukan di sini. */
type AnyRow = Record<string, any>;

/**
 * PostgREST membatasi satu respons di 1000 baris. Tanpa paginasi, batas itu tidak
 * memunculkan error — ia hanya diam-diam memotong hasil. Kolom yang dipilih sengaja
 * eksplisit: `select('*')` pada `transactions` ikut menarik `note` yang berisi payload
 * invoice panjang untuk tiap baris.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAllRows(buildQuery: () => any, batchSize = 1000): Promise<AnyRow[]> {
    const all: AnyRow[] = [];
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

/*
 * Hanya kolom yang BENAR-BENAR dibaca lapisan hitung.
 *
 * `payment_method` sengaja tidak diambil: di produksi nilainya 'doku' untuk semua
 * transaksi kecuali dua yang 'manual', jadi ia tidak pernah bisa memisahkan apa pun.
 * Yang memisahkan adalah `payment_channel`.
 */
const TX_COLUMNS =
    'id, form_submission_id, entity_type, amount, subtotal, status, payment_channel, created_at';

const SUB_COLUMNS =
    'id, auth_user_id, university, department, status, submission_status, payment_status, referral_source, email, criteria_responden, created_at, voucher_code';

/**
 * `.in('id', [...])` ikut masuk ke query string, dan URL punya batas panjang. Seribu
 * UUID kira-kira 37 KB — jauh melewati batas aman proxy mana pun. Jadi dipotong.
 */
const ID_CHUNK = 200;

export interface RevenueDataset {
    /** Transaksi di dalam rentang terpilih. */
    transactions: AnyRow[];
    /** Transaksi di rentang sebelumnya yang berdurasi sama — untuk delta. */
    previousTransactions: AnyRow[];
    /** Submission yang dibuat di dalam rentang — dipakai untuk "order masuk" & konversi. */
    submissionsInRange: AnyRow[];
    /**
     * Peta submission yang DIJAMIN menutupi setiap `form_submission_id` yang muncul di
     * `transactions`. Inilah yang menutup kebocoran breakdown.
     */
    submissionsById: Map<string, AnyRow>;
    /**
     * Epoch ms pembayaran lunas PERTAMA tiap pelanggan, dari seluruh riwayat.
     *
     * Harus lintas-waktu, bukan sebatas rentang: pelanggan yang pertama membayar
     * bulan Mei dan membayar lagi hari ini adalah *repeat*, dan itu hanya terlihat
     * kalau riwayat penuhnya ikut dibaca. Ongkosnya kecil — 990 baris submission
     * (id + auth_user_id saja) dan ~410 transaksi lunas.
     */
    firstPaidAtByCustomer: Map<string, number>;
}

/**
 * Rentang sepanjang durasi yang sama, tepat sebelum `range`. Dipakai untuk semua
 * pembanding "vs periode sebelumnya".
 */
export function previousRange(range: DateRange): DateRange {
    const span = range.to.getTime() - range.from.getTime();
    return { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime()) };
}

export async function fetchRevenueData(range: DateRange): Promise<RevenueDataset> {
    const prev = previousRange(range);
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    const [transactions, previousTransactions, submissionsInRange] =
        await Promise.all([
            fetchAllRows(() =>
                supabase
                    .from('transactions')
                    .select(TX_COLUMNS)
                    .gte('created_at', fromIso)
                    .lt('created_at', toIso),
            ),
            fetchAllRows(() =>
                supabase
                    .from('transactions')
                    .select(TX_COLUMNS)
                    .gte('created_at', prev.from.toISOString())
                    .lt('created_at', prev.to.toISOString()),
            ),
            fetchAllRows(() =>
                supabase
                    .from('form_submissions')
                    .select(SUB_COLUMNS)
                    .gte('created_at', fromIso)
                    .lt('created_at', toIso),
            ),
        ]);

    // Riwayat penuh untuk segmentasi baru vs repeat. Dua query ringan, bukan join
    // yang ditanam — bentuk embed PostgREST diam-diam berubah kalau nama FK-nya
    // berubah, sementara dua SELECT kolom-sempit ini tidak bisa gagal separuh.
    const [allPaidTx, allSubOwners] = await Promise.all([
        fetchAllRows(() =>
            supabase
                .from('transactions')
                .select('form_submission_id, created_at')
                .in('status', ['paid', 'completed']),
        ),
        fetchAllRows(() => supabase.from('form_submissions').select('id, auth_user_id')),
    ]);

    const ownerBySubmission = new Map<string, string>();
    for (const row of allSubOwners) {
        if (row.id && row.auth_user_id) ownerBySubmission.set(String(row.id), String(row.auth_user_id));
    }

    const firstPaidAtByCustomer = new Map<string, number>();
    for (const tx of allPaidTx) {
        const owner = tx.form_submission_id
            ? ownerBySubmission.get(String(tx.form_submission_id))
            : undefined;
        if (!owner || !tx.created_at) continue;
        const ms = new Date(tx.created_at).getTime();
        if (Number.isNaN(ms)) continue;
        const seen = firstPaidAtByCustomer.get(owner);
        if (seen === undefined || ms < seen) firstPaidAtByCustomer.set(owner, ms);
    }

    const submissionsById = new Map<string, AnyRow>();
    for (const sub of submissionsInRange) {
        submissionsById.set(String(sub.id), sub);
    }

    // Susulan: submission induk yang jatuh di luar rentang. Tanpa langkah ini,
    // revenue-nya masuk total tapi hilang dari setiap breakdown.
    const missing = new Set<string>();
    for (const tx of [...transactions, ...previousTransactions]) {
        const id = tx.form_submission_id;
        if (typeof id === 'string' && id && !submissionsById.has(id)) missing.add(id);
    }

    const missingIds = [...missing];
    for (let i = 0; i < missingIds.length; i += ID_CHUNK) {
        const chunk = missingIds.slice(i, i + ID_CHUNK);
        const { data, error } = await supabase
            .from('form_submissions')
            .select(SUB_COLUMNS)
            .in('id', chunk);
        if (error) throw error;
        for (const sub of data || []) submissionsById.set(String(sub.id), sub);
    }

    return {
        transactions,
        previousTransactions,
        submissionsInRange,
        submissionsById,
        firstPaidAtByCustomer,
    };
}
