import type { ChipVariant } from '../ui/chip';
import { formatPaymentChannel } from '../../utils/paymentChannel';
import { isPaidTx } from '@/utils/analytics/revenue';

export interface Transaction {
  id: string;
  payment_id: string;
  payment_method: string;
  payment_channel?: string | null;
  amount: number;
  /**
   * ⚠️ SENGAJA `string`, BUKAN UNION.
   *
   * Sampai 2026-09-02 tipenya berbunyi `'pending' | 'completed' | 'failed'` —
   * dan ketiganya bukan kosakata yang sebenarnya ditulis ke kolom ini. Terukur
   * di produksi: `completed` 427, `pending` 219, `cancelled` 10, `paid` 8,
   * `expired` 7, dan `failed` **nol baris, selamanya**. Jadi union itu salah di
   * kedua arah — memuat kata yang tak pernah ada, dan melewatkan tiga yang ada.
   *
   * Penulisnya banyak dan tidak semuanya di repo ini: webhook DOKU (`paid`),
   * `cancelInvoice()` (`cancelled`), sapuan kedaluwarsa (`expired`). Union
   * mengunci kosakata di satu sisi sementara sisi lain terus tumbuh, dan
   * akibatnya bukan error type — melainkan chip KOSONG di layar (lihat
   * `transactionStatusChip`). Biarkan longgar di tipe, tegakkan di fungsi.
   */
  status: string;
  payment_url: string;
  note?: string;
  created_at: string;
  updated_at: string;
  form_submission_id: string;
  form_submissions?: {
    id: string;
    title: string;
    full_name: string;
    email: string;
    start_date?: string | null;
    end_date?: string | null;
  };
}

export interface TransactionItem {
  name: string;
  category?: string;
  price?: number;
  qty?: number;
}

export interface ParsedNote {
  items: TransactionItem[];
  memo: string;
}

/** `note` is either plain text (memo) or JSON `{ items, memo }`. */
export function parseTransactionNote(note?: string): ParsedNote {
  if (note?.startsWith('{')) {
    try {
      const parsed = JSON.parse(note);
      return { items: parsed.items || [], memo: parsed.memo || '' };
    } catch {
      return { items: [], memo: note || '' };
    }
  }
  return { items: [], memo: note || '' };
}

// Rumahnya sekarang di @/utils/currency. Di-re-ekspor supaya pemakai lama
// di dalam modul transactions/ tidak perlu ikut disentuh.
export { formatIDR } from '@/utils/currency';

/** Ditulis gateway & migrasi, jadi selalu dinormalkan sebelum dicocokkan. */
const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();

/**
 * Label & warna untuk SATU status transaksi.
 *
 * ⚠️ MENGGANTIKAN `STATUS_LABELS` + `STATUS_CHIP_VARIANTS`, dan bukan demi
 * kerapian. Keduanya `Record<Transaction['status'], …>` di atas union tiga kata,
 * jadi tiga status produksi (`cancelled`, `paid`, `expired` — 25 baris senilai
 * Rp 12.031.460) menghasilkan `undefined` pada KEDUA peta. `undefined` sebagai
 * `variant` membuat `Chip` jatuh ke `defaultVariants: slate`, dan `undefined`
 * sebagai anak React tidak merender apa pun: hasilnya pil abu-abu KOSONG di
 * kolom Status, tanpa satu pun error.
 *
 * Karena itu FALLBACK-nya wajib dan itulah inti perbaikan ini: status yang tidak
 * dikenal **menampilkan dirinya sendiri**. Kata status berikutnya yang lahir
 * hanya di satu sisi (webhook, migrasi, gateway) akan terbaca di layar sebagai
 * teks mentah — jelek, tapi terlihat. Bisu adalah kegagalan; jelek bukan.
 *
 * Kosakata & warnanya meminjam `@/lib/status-tokens` — jangan mengarang yang
 * baru di sini. `cancelled` slate dan `expired` merah memang sengaja BERBEDA:
 * repo ini menjaga betul bedanya ("tidak ada yang kedaluwarsa, ada yang
 * memutuskan" — `status/deriveOrderUiState.ts`).
 */
const STATUS_CHIPS: Record<string, { label: string; variant: ChipVariant }> = {
  // Dua kata untuk satu arti. DOKU menulis `paid`, jalur lama menulis
  // `completed`; keduanya uang yang benar-benar masuk, dan `isPaidTx` sudah
  // menghitung keduanya ke "Pendapatan". Chip Metode yang menjelaskan CARANYA.
  completed: { label: 'Lunas', variant: 'green' },
  paid: { label: 'Lunas', variant: 'green' },
  pending: { label: 'Menunggu', variant: 'amber' },
  cancelled: { label: 'Dibatalkan', variant: 'slate' },
  expired: { label: 'Kedaluwarsa', variant: 'red' },
  // Nol baris di produksi, dan karena itu TIDAK ditawarkan di dropdown filter.
  // Tetap dipetakan: webhook masih boleh menulisnya kapan saja.
  failed: { label: 'Gagal', variant: 'red' },
};

export function transactionStatusChip(
  status: string | null | undefined
): { label: string; variant: ChipVariant } {
  const known = STATUS_CHIPS[norm(status)];
  if (known) return known;
  return { label: status?.trim() || '—', variant: 'slate' };
}

/**
 * Status yang ditawarkan di dropdown filter halaman Transaksi.
 *
 * ⚠️ `failed` SENGAJA TIDAK ADA — nol baris di produksi, selamanya, sementara
 * `cancelled`/`expired` (17 baris) tidak pernah punya entri. Daftar lamanya
 * mencerminkan union tipe yang salah, bukan data yang ada.
 */
export const STATUS_FILTER_IDS = ['pending', 'completed', 'cancelled', 'expired'] as const;

/** Label filter — diturunkan dari chip supaya keduanya tidak bisa menyimpang. */
export const statusFilterLabel = (id: string): string =>
  id === 'all' ? 'Semua' : transactionStatusChip(id).label;

/**
 * SATU definisi "baris ini cocok dengan filter", dipakai daftar tersaring DAN
 * angka di dropdown. Menggandakannya adalah cara hitungan di pil berhenti cocok
 * dengan jumlah baris yang benar-benar tampil.
 *
 * `completed` lewat `isPaidTx` — yang memuat `paid` juga — supaya jumlah barisnya
 * cocok dengan angka "Pendapatan" di atasnya. Sisanya kesetaraan biasa, dinormalkan
 * karena status ditulis gateway.
 */
export function matchesStatusFilter(
  t: Pick<Transaction, 'status'>,
  filter: string
): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return isPaidTx(t);
  return norm(t.status) === filter;
}

export function methodChipInfo(
  method: string,
  channel?: string | null,
  status?: string
): { label: string; variant: ChipVariant } {
  // Rows created by the old always-on simulation bug (see payment.ts history):
  // the data is fake, so say so — these need admin follow-up, not disguise.
  if (method === 'simulation') {
    return { label: 'Simulasi — bukan pembayaran nyata', variant: 'red' };
  }
  if (method === 'doku') {
    if (channel) {
      return { label: formatPaymentChannel(channel), variant: 'blue' };
    }
    // Channel is only known once the webhook's success notification arrives.
    // Unpaid → genuinely not chosen yet; paid without channel → legacy row
    // from before 23_add_payment_channel.sql (or a webhook shape we missed).
    //
    // ⚠️ `isPaidTx`, BUKAN `status === 'completed'`. Berkas ini baru saja
    // menyatakan `paid` dan `completed` sama-sama lunas di `STATUS_CHIPS`;
    // dua definisi "lunas" dalam satu berkas adalah persis cara angka mulai
    // menyimpang tanpa error.
    return isPaidTx({ status: status ?? '' })
      ? { label: 'DOKU · channel tidak tercatat', variant: 'slate' }
      : { label: 'Menunggu channel', variant: 'slate' };
  }
  // LEGACY: transaksi lama dibuat lewat Mayar (gateway lama, sudah diganti DOKU).
  // Dipertahankan agar data historis tetap tampil — tidak ada flow Mayar baru.
  if (method === 'mayar') {
    return { label: 'Mayar (legacy)', variant: 'amber' };
  }
  if (method === 'mayar_manual_invoice') {
    return { label: 'Invoice Manual', variant: 'purple' };
  }
  return { label: method, variant: 'slate' };
}

/**
 * Anggota tiap tagihan gabungan di dalam DAFTAR YANG SEDANG DIMUAT.
 *
 * ⚠️ DITURUNKAN DARI DAFTARNYA SENDIRI, BUKAN DARI QUERY BARU — dan itu
 * keputusan, bukan kemalasan. Halaman ini sengaja tidak pernah memakai
 * `.in('payment_id', [...])`: PostgREST menaruh filter di query string, dan 700
 * UUID sudah ditolak `400` tanpa menyebut panjangnya sama sekali (papan Schedule
 * gagal memuat sejak hari pertama karenanya). Setiap anggota tagihan gabungan
 * punya baris `transactions` sendiri yang lahir dalam detik yang sama, jadi
 * mereka selalu berdampingan di daftar yang sama.
 *
 * ⚠️ BATASNYA: kalau batas 1.000 baris PostgREST kebetulan memotong TEPAT di
 * tengah sebuah grup, `count` di sini mengecil. Akibatnya cuma badge yang
 * kurang lengkap — nol angka uang diturunkan dari sini.
 */
export interface TxGroupInfo {
  paymentId: string;
  count: number;
  /** Σ porsi seluruh anggota — nominal yang BENAR-BENAR ditagih link DOKU-nya. */
  total: number;
  /** Id transaksi anggota, urut lahir; dipakai untuk nomor "ke berapa dari N". */
  memberIds: string[];
}

export function buildTxGroupIndex(transactions: Transaction[]): Map<string, TxGroupInfo> {
  const byPayment = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!tx.payment_id) continue;
    const list = byPayment.get(tx.payment_id);
    if (list) list.push(tx);
    else byPayment.set(tx.payment_id, [tx]);
  }

  const out = new Map<string, TxGroupInfo>();
  for (const [paymentId, rows] of byPayment) {
    // Urutan lahir, lalu id — anggota grup lahir dalam detik yang sama, jadi
    // `created_at` saja tidak menjamin urutan yang stabil antar-render.
    const sorted = [...rows].sort((a, b) => {
      const at = new Date(a.created_at || '').getTime();
      const bt = new Date(b.created_at || '').getTime();
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return String(a.id).localeCompare(String(b.id));
    });
    out.set(paymentId, {
      paymentId,
      count: sorted.length,
      total: sorted.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
      memberIds: sorted.map((t) => String(t.id)),
    });
  }
  return out;
}
