/**
 * Pembaruan otomatis link DOKU tagihan tempo (sql/102).
 *
 * ── Kenapa ada ──────────────────────────────────────────────────────────────
 * Tagihan tempo tidak punya tanggal jatuh tempo (K3), tapi DOKU tidak mengenal
 * link tanpa umur: `payment_due_date` maksimal kita 7 hari. Jadi ketika link-nya
 * habis, utangnya tetap ada (`schedule_billing` tidak pernah menandai baris
 * tempo kedaluwarsa) dan yang diganti hanya link-nya — saat peneliti membuka
 * `/bayar/<jadwal>`, bukan lewat cron: link yang tak pernah dibuka tidak perlu
 * diperbarui.
 *
 * ── Kenapa tanpa login ──────────────────────────────────────────────────────
 * `/bayar/` memang dirancang tanpa login (lihat kepala `functions/bayar/[id].js`),
 * dan pembayar pelanggan tepercaya sering bagian keuangan kampus yang tidak punya
 * akun. Risikonya setara dengan hari ini: UUID jadwal tetap kapabilitas pembawa,
 * dan yang bisa ia lakukan hanyalah mencetak link untuk MEMBAYAR nominal yang
 * sudah dibekukan (K10). Idempotensinya membatasi satu link per umur link.
 *
 * ── Urutan ──────────────────────────────────────────────────────────────────
 *   1. `tempo_renewal_candidate` — sudah ada link hidup? pakai itu.
 *   2. Cetak link DOKU senilai Σ porsi lama.
 *   3. `renew_tempo_bill` — tutup yang lama & tulis yang baru dalam SATU
 *      transaksi. Kalah balapan → link pemenang dipakai, link kita dibatalkan.
 *   4. Gagal di mana pun sesudah langkah 2 → link yatim kita dibatalkan lewat
 *      Cancel Order; baris lama TIDAK tersentuh (RPC-nya atomik).
 *
 * TIDAK PERNAH MELEMPAR ke pemanggil — resolver butuh jawaban, bukan crash.
 */

import { dokuRequest } from './_helpers.js';
import { cancelDokuOrder } from './_doku-cancel.js';

/** Sama dengan `MAX_INVOICE_MINUTES` di src/utils/payment.ts — umur maksimal link. */
export const TEMPO_LINK_MINUTES = 60 * 24 * 7;

/** SAC tujuan dana — sama dengan default `createManualInvoice` (src/utils/payment.ts). */
const DEFAULT_SAC_ID = 'SAC-7926-1778565828595';

async function rpc(env, fn, args) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service env tidak lengkap');
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`RPC ${fn} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Payload checkout DOKU — cermin `functions/api/doku/checkout.js`, yang dipakai
 * `createManualInvoice` untuk tagihan admin. Murni, supaya bentuknya bisa diuji.
 */
export function buildTempoCheckoutPayload({ amount, invoiceNumber, callbackUrl, customer, sacId }) {
  const email = String(customer?.email || 'client@example.com');
  const payload = {
    order: {
      amount,
      invoice_number: invoiceNumber,
      currency: 'IDR',
      callback_url: callbackUrl,
      auto_redirect: true,
    },
    payment: { payment_due_date: TEMPO_LINK_MINUTES },
    customer: {
      id: email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50),
      name: String(customer?.name || 'Client').substring(0, 255),
      email: email.substring(0, 128),
    },
    additional_info: { account: { id: sacId || DEFAULT_SAC_ID } },
  };
  const phone = String(customer?.phone || '').replace(/[^0-9]/g, '').substring(0, 16);
  if (phone) payload.customer.phone = phone;
  return payload;
}

/**
 * Nomor invoice baru — BENTUK YANG SAMA dengan `createManualInvoice`, supaya
 * webhook, halaman `/invoices/`, dan laporan tidak perlu mengenal format kedua.
 */
export function tempoInvoiceNumber(leadSubmissionId, nowMs = Date.now()) {
  return `JFU-INV-${String(leadSubmissionId || 'tempo').substring(0, 6)}-${nowMs}`;
}

/**
 * Perbarui link tagihan tempo jadwal ini.
 *
 * @returns {Promise<{ok: true, outcome: 'live'|'renewed'|'already_renewed'} | {ok: false, reason: string}>}
 *   `ok` = sekarang ADA link hidup; pemanggil cukup menanyai resolver lagi.
 */
export async function renewTempoBill(env, scheduleId, { origin } = {}) {
  let cand;
  try {
    cand = await rpc(env, 'tempo_renewal_candidate', { p_schedule_id: scheduleId });
  } catch (e) {
    console.error(`[tempo] kandidat pembaruan ${scheduleId} gagal dibaca:`, e);
    return { ok: false, reason: 'error' };
  }

  // Idempoten: link tempo yang masih hidup dipakai, tidak dicetak yang kedua.
  if (cand?.live_payment_id) return { ok: true, outcome: 'live' };
  if (!cand?.old_payment_id || !(Number(cand.amount) > 0)) {
    return { ok: false, reason: 'nothing_to_renew' };
  }

  const amount = Number(cand.amount);
  const invoiceNumber = tempoInvoiceNumber(cand.lead_submission_id);
  const base = origin || 'https://submit.jakpatforuniv.com';
  // Pola `createManualInvoice`: grup → kuitansi gabungan; tunggal → halaman sukses.
  const callbackUrl = Number(cand.member_count) > 1
    ? `${base}/invoices/${invoiceNumber}`
    : `${base}/payment-success?id=${encodeURIComponent(cand.lead_submission_id)}`
      + (cand.lead_schedule_id ? `&schedule=${encodeURIComponent(cand.lead_schedule_id)}` : '')
      + '&source=gateway';

  let doku;
  try {
    doku = await dokuRequest(env, 'POST', '/checkout/v1/payment', buildTempoCheckoutPayload({
      amount,
      invoiceNumber,
      callbackUrl,
      customer: { name: cand.customer_name, email: cand.customer_email, phone: cand.customer_phone },
      sacId: env.VITE_DOKU_SAC_JFU_ID || env.DOKU_SAC_JFU_ID,
    }));
  } catch (e) {
    console.error(`[tempo] DOKU gagal dipanggil untuk ${scheduleId}:`, e);
    return { ok: false, reason: 'error' };
  }

  const paymentUrl = doku?.data?.response?.payment?.url;
  const mintedNumber = doku?.data?.response?.order?.invoice_number || invoiceNumber;
  if (!doku?.ok || !paymentUrl) {
    console.error(`[tempo] DOKU menolak pembaruan ${scheduleId} (HTTP ${doku?.status}):`, JSON.stringify(doku?.data).slice(0, 400));
    return { ok: false, reason: 'error' };
  }

  const expiresAt = new Date(Date.now() + TEMPO_LINK_MINUTES * 60_000).toISOString();

  let renewed;
  try {
    renewed = await rpc(env, 'renew_tempo_bill', {
      p_old_payment_id: cand.old_payment_id,
      p_new_payment_id: mintedNumber,
      p_invoice_url: paymentUrl,
      p_expires_at: expiresAt,
      p_doku_request_id: doku.requestId || null,
      p_amount: amount,
    });
  } catch (e) {
    // Baris lama utuh (RPC atomik) — yang harus dibereskan cuma link yatim kita.
    console.error(`[tempo] renew_tempo_bill gagal untuk ${scheduleId}; membatalkan link ${mintedNumber}:`, e);
    await cancelDokuOrder(env, mintedNumber, doku.requestId, 'Pembaruan tagihan tempo gagal dicatat');
    return { ok: false, reason: 'error' };
  }

  if (renewed?.outcome === 'renewed') return { ok: true, outcome: 'renewed' };

  // Kalah balapan atau tidak ada lagi yang ditagih: link kita tidak dipakai siapa pun.
  const cancel = await cancelDokuOrder(env, mintedNumber, doku.requestId, 'Duplikat pembaruan tagihan tempo');
  if (!cancel.cancelled) {
    console.error(`[tempo] link yatim ${mintedNumber} gagal dibatalkan: ${cancel.reason}`);
  }
  if (renewed?.outcome === 'already_renewed') return { ok: true, outcome: 'already_renewed' };
  return { ok: false, reason: 'nothing_to_renew' };
}
