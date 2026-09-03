import { PPN_RATE } from '@/utils/constants';
import { calculatePpn } from '@/utils/cost-calculator';
import {
  cancelInvoice, createInvoice, createTransaction, supabase,
  type AdScheduleEntry, type Invoice, type Transaction,
} from '@/utils/supabase';
import type { InvoiceItem } from './invoiceItems';

// ─────────────────────────────────────────────────────────────
// Menulis baris tagihan — SATU jadwal atau N jadwal sekaligus.
//
// Satu pembayaran DOKU boleh menaungi N jadwal: `payment_id` tidak punya unique
// index di kedua tabel, dan `derive_schedule_id()` (trigger BEFORE INSERT)
// menempelkan tiap baris ke jadwalnya sendiri lewat
// `form_submission_id`/`extend_id`. Jadi pembukuan per jadwal tetap benar tanpa
// satu pun migrasi.
//
// ⚠️ SATU-SATUNYA TEMPAT BARIS TAGIHAN DITULIS. Jalur tunggal memakainya juga,
// bukan demi keseragaman melainkan supaya verifikasi jumlah di bawah melindungi
// keduanya.
// ─────────────────────────────────────────────────────────────

export interface InvoiceBundle {
  /** Jadwal yang ditagih. Menentukan jalur tulis (ordinal 1 vs extend). */
  entry: AdScheduleEntry;
  /** Order pemilik jadwal ini — selalu `form_submissions.id`, juga untuk extend. */
  submissionId: string;
  items: InvoiceItem[];
  memo: string;
  voucherCode: string | null;
}

export interface BundleTotals {
  subtotal: number;
  ppn: number;
  amount: number;
}

/** Total satu bundel. PPN dibulatkan di sini, per bundel — lihat `groupTotals`. */
export function bundleTotals(items: InvoiceItem[]): BundleTotals {
  const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const ppn = calculatePpn(subtotal);
  return { subtotal, ppn, amount: subtotal + ppn };
}

/**
 * Total yang ditagihkan ke DOKU.
 *
 * ⚠️ MENJUMLAHKAN BARIS, BUKAN MENGHITUNG ULANG DARI SUBTOTAL GRUP.
 * `calculatePpn` membulatkan, dan Σ round(sᵢ × 0,11) ≠ round(Σsᵢ × 0,11).
 * Selisih beberapa rupiah itu membuat verifikasi nominal di webhook (STEP 0)
 * menolak pembayaran yang sah — kegagalan yang baru terlihat sesudah uang
 * sungguhan masuk.
 */
export function groupTotals(bundles: InvoiceBundle[]): BundleTotals {
  return bundles.reduce<BundleTotals>((acc, b) => {
    const t = bundleTotals(b.items);
    return {
      subtotal: acc.subtotal + t.subtotal,
      ppn: acc.ppn + t.ppn,
      amount: acc.amount + t.amount,
    };
  }, { subtotal: 0, ppn: 0, amount: 0 });
}

export interface RowContext {
  paymentId: string;
  invoiceUrl: string;
  /**
   * Kapan link DOKU ini berhenti berlaku (ISO). Diturunkan dari menit yang
   * benar-benar dikirim ke DOKU — lihat `invoiceLifetimeMinutes`.
   *
   * Sebelum ini hanya `create-payment.js` (jalur swalayan) yang mengisinya:
   * 182 dari 183 invoice `pending` di produksi NULL, jadi tidak ada satu pun
   * lapisan yang punya bukti umur untuk tagihan yang diterbitkan admin.
   */
  expiresAt?: string | null;
  /**
   * `Request-Id` yang dikirim ke DOKU saat link ini dibuat — kunci Cancel Order
   * API (`original_request_id`, sql/84).
   *
   * ⚠️ HARUS DATANG DARI KONTEKS, BUKAN DARI QUERY. `cleanUp()` di bawah juga
   * memanggil `cancelInvoice()`, dan di titik itu barisnya justru mungkin
   * BELUM/TIDAK terbaca dari DB — padahal itu tempat terbaik memanggil Cancel
   * Order, karena link-nya seharusnya tidak pernah ada.
   */
  dokuRequestId?: string | null;
}

export interface BuiltRows {
  invoices: Invoice[];
  transactions: Transaction[];
}

/**
 * Baris-baris yang akan ditulis. Murni, supaya bentuknya bisa diuji tanpa
 * menyentuh jaringan.
 */
export function buildInvoiceRows(bundles: InvoiceBundle[], ctx: RowContext): BuiltRows {
  const invoices: Invoice[] = [];
  const transactions: Transaction[] = [];

  for (const bundle of bundles) {
    const { entry, submissionId, items, memo, voucherCode } = bundle;
    const { subtotal, ppn, amount } = bundleTotals(items);

    const attribution = entry.isExtension
      ? { entity_type: 'extend' as const, extend_id: entry.sourceId }
      : {};

    /**
     * ⚠️ HANYA ITEM MILIK BUNDEL INI.
     *
     * Godaannya menyalin seluruh item formulir ke tiap baris — itu yang
     * dilakukan jalur tunggal sebelum berkas ini ada, dan untuk N=1 memang
     * identik. Untuk grup, tiap baris jadi membawa daftar lengkap, dan halaman
     * kuitansi yang menggabungkan N baris mencetak setiap item N kali dengan
     * total N× lipat. Jebakannya di penulis, bukan di pembaca, dan diamnya
     * sempurna: DOKU tetap menagih angka yang benar — hanya dokumennya yang
     * berbohong.
     */
    const noteData: Record<string, unknown> = {
      memo,
      items: items.map(({ name, qty, price, category }) => ({ name, qty, price, category })),
    };
    if (entry.isExtension) noteData.extend_id = entry.sourceId;

    const shared = {
      form_submission_id: submissionId,
      payment_id: ctx.paymentId,
      amount,
      subtotal,
      ppn_rate: PPN_RATE,
      ppn_amount: ppn,
      status: 'pending',
      voucher_code: voucherCode,
      // Jendela yang DITAGIHKAN, dibekukan saat tagihan terbit. Kalau jadwalnya
      // kemudian pindah, `schedule_billing` menandai tagihan ini basi saat
      // dibaca — itu yang menutup balapan admin-vs-peneliti (sql/60).
      billed_start_date: entry.startDate ?? null,
      doku_request_id: ctx.dokuRequestId ?? null,
      ...attribution,
    };

    /**
     * ⚠️ `expires_at` HANYA DI BARIS INVOICE, JANGAN DI `shared`.
     *
     * `transactions` tidak punya kolom itu (diverifikasi produksi 2026-09-03).
     * Menaruhnya di `shared` membuat INSERT transaksi ditolak PostgREST 400 →
     * `writeInvoiceRows` membatalkan SELURUH baris dan melempar → tagihan gagal
     * terbit padahal link DOKU-nya sudah hidup menagih. Godaannya besar karena
     * setiap kolom lain di sini memang milik berdua.
     */
    invoices.push({ ...shared, invoice_url: ctx.invoiceUrl, expires_at: ctx.expiresAt ?? null });
    transactions.push({
      ...shared,
      payment_method: 'doku',
      payment_url: ctx.invoiceUrl,
      note: JSON.stringify(noteData),
    });
  }

  return { invoices, transactions };
}

export class InvoiceWriteError extends Error {
  /** Barisnya sudah dibatalkan? `false` = ada baris yatim yang perlu dilihat manusia. */
  cleanedUp: boolean;

  constructor(message: string, cleanedUp: boolean) {
    super(message);
    this.name = 'InvoiceWriteError';
    this.cleanedUp = cleanedUp;
  }
}

/**
 * Tulis N pasang baris, lalu BUKTIKAN jumlahnya sebelum link-nya dianggap sah.
 *
 * ⚠️ URUTANNYA MENGIKAT. `createManualInvoice` memanggil DOKU LEBIH DULU, jadi
 * begitu fungsi ini dipanggil link-nya sudah hidup menagih `dokuAmount`. Kalau
 * baris ke-3 dari 4 gagal ditulis, Σ `amount` lebih kecil daripada yang ditagih
 * — dan webhook STEP 0 akan menjawab `amount_mismatch` lalu TIDAK menulis apa
 * pun, padahal peneliti sudah membayar. Untuk N=1 risikonya tipis; untuk N=4
 * empat kali lipat.
 *
 * Karena itu: tulis semua → baca ulang dari server → bandingkan. Meleset →
 * batalkan seluruh baris ber-`payment_id` itu dan lempar. Link DOKU-nya memang
 * tidak bisa ditarik kembali, tapi itu tidak merugikan siapa pun SELAMA
 * link-nya belum pernah keluar — jadi pemanggil WAJIB menampilkan/menyalin/
 * mengirim link hanya sesudah fungsi ini kembali dengan selamat.
 */
export async function writeInvoiceRows(
  bundles: InvoiceBundle[],
  ctx: RowContext,
  dokuAmount: number,
): Promise<void> {
  if (bundles.length === 0) {
    throw new InvoiceWriteError('Tidak ada pesanan yang ditagihkan', false);
  }

  const { invoices, transactions } = buildInvoiceRows(bundles, ctx);

  try {
    for (let i = 0; i < invoices.length; i += 1) {
      await createInvoice(invoices[i]);
      await createTransaction(transactions[i]);
    }
  } catch (e: any) {
    const cleaned = await cleanUp(ctx.paymentId, ctx.dokuRequestId);
    throw new InvoiceWriteError(
      `Gagal menulis tagihan: ${e?.message || e}. Tagihan dibatalkan — jangan bagikan link pembayarannya.`,
      cleaned,
    );
  }

  const verified = await verifyWrittenAmount(ctx.paymentId, bundles.length, dokuAmount);
  if (!verified.ok) {
    const cleaned = await cleanUp(ctx.paymentId, ctx.dokuRequestId);
    throw new InvoiceWriteError(
      `${verified.reason} Tagihan dibatalkan — jangan bagikan link pembayarannya.`,
      cleaned,
    );
  }
}

interface VerifyResult { ok: boolean; reason: string }

async function verifyWrittenAmount(
  paymentId: string,
  expectedRows: number,
  dokuAmount: number,
): Promise<VerifyResult> {
  const [inv, txn] = await Promise.all([
    supabase.from('invoices').select('amount').eq('payment_id', paymentId),
    supabase.from('transactions').select('amount').eq('payment_id', paymentId),
  ]);

  // Gagal MEMBACA bukan bukti tulisannya salah — tapi juga bukan bukti benar,
  // dan yang dipertaruhkan uang. Perlakukan sebagai gagal.
  if (inv.error || txn.error) {
    return { ok: false, reason: 'Tidak bisa memverifikasi tagihan yang baru ditulis.' };
  }

  const sum = (rows: { amount: number }[] | null) =>
    (rows || []).reduce((s, r) => s + (r.amount || 0), 0);

  if ((inv.data?.length || 0) !== expectedRows || (txn.data?.length || 0) !== expectedRows) {
    return {
      ok: false,
      reason: `Jumlah baris tagihan tidak cocok (${inv.data?.length || 0} invoice / ${txn.data?.length || 0} transaksi, seharusnya ${expectedRows}).`,
    };
  }

  if (sum(inv.data) !== dokuAmount || sum(txn.data) !== dokuAmount) {
    return {
      ok: false,
      reason: `Total baris tagihan (${sum(inv.data)}) tidak sama dengan nominal yang ditagih DOKU (${dokuAmount}).`,
    };
  }

  return { ok: true, reason: '' };
}

/**
 * Bersih-bersih lewat `cancelInvoice`, BUKAN DELETE.
 *
 * ⚠️ `transactions` tidak punya policy DELETE sama sekali (hanya
 * INSERT/SELECT/UPDATE), jadi penghapusan dari klien pulang "berhasil" dengan
 * nol baris tersentuh dan meninggalkan baris transaksi yatim — yang justru
 * baris yang dibaca webhook dan papan jadwal. `cancelInvoice` memakai UPDATE,
 * yang policy-nya ada di kedua tabel.
 */
async function cleanUp(paymentId: string, dokuRequestId?: string | null): Promise<boolean> {
  try {
    // `dokuRequestId` DARI KONTEKS, bukan dari DB: di sini barisnya justru
    // mungkin tidak pernah mendarat, sementara link DOKU-nya sudah hidup.
    await cancelInvoice(paymentId, dokuRequestId);
    return true;
  } catch (e) {
    console.error('Gagal membersihkan tagihan yang gagal ditulis:', e);
    return false;
  }
}
