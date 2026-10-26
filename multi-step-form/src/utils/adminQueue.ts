import { supabase } from './supabase';
import { toWibYmd } from './airing-window';
import { isAutoReviewed } from '@/components/status/deriveOrderUiState';
import { awaitsBroadcast } from './kilatBroadcast';

/**
 * Antrean kerja admin — angka pada badge tab Iklan/Kilat di Submissions
 * (Phase 5 §5.4b, rilis R3).
 *
 * Tiga keadaan, cermin keadaan `deriveOrderUiState` yang bolanya di admin:
 *   review   ↔ `review_manual`            (step 0)
 *   schedule ↔ `awaiting_admin_schedule`  (disetujui manual, belum bertanggal)
 *   invoice  ↔ `awaiting_invoice`         (slot dipesan admin, belum ada tagihan hidup)
 *
 * ⚠️ Kenapa tidak memanggil `deriveOrderUiState` langsung: ia butuh baris
 * `ad_schedules` + peta pembayaran per order, sedangkan badge harus dihitung
 * dari SATU kueri ringan atas seluruh tabel (daftar Submissions dipaginasi
 * per bulan × 50 baris — angka dari halaman yang termuat mengukur hal lain).
 * Predikat di bawah membaca kolom `form_submissions` yang sama dengan yang
 * menggerakkan state itu.
 *
 * Tab Kilat juga menghitung gelombang lunas yang toggle siarannya sudah bisa
 * dinyalakan tapi belum (`awaitsBroadcast`, R4). "Sedang disiarkan" tidak
 * menambah angka.
 */
export type AdminAction = 'review' | 'schedule' | 'invoice';

export interface AdminQueueRow {
  id: string;
  distribution_type: string | null;
  submission_status: string | null;
  start_date: string | null;
  slot_booked_by: string | null;
  payment_status: string | null;
  dismissed_at: string | null;
  submission_method: string | null;
  survey_url: string | null;
  detected_keywords: string[] | null;
  voucher_code: string | null;
  forced_manual_reason: string | null;
}

const SETTLED = ['paid', 'completed'];
const DEAD = ['rejected', 'spam', 'cancelled', 'slot_cancelled'];

export function adminActionOf(
  row: AdminQueueRow,
  ctx: { hasOpenBill: boolean; todayYmd: string },
): AdminAction | null {
  // Pemiliknya sudah menyingkirkan order ini dari daftarnya — tidak ada yang menunggu.
  if (row.dismissed_at) return null;
  const status = row.submission_status || 'in_review';
  const pay = (row.payment_status || '').toLowerCase();
  if (DEAD.includes(status) || SETTLED.includes(pay)) return null;

  // ⚠️ "BELUM BERTANGGAL" BUKAN HIASAN. Diukur 15 Okt 2026: 398 baris
  // `in_review` bertanggal adalah artefak era sebelum review (Mei 2025–Jan
  // 2026; tanggal ditulis saat checkout, status tak pernah bergerak). Jalur
  // manual sekarang SELALU tanpa tanggal (Track B1, `submitOrder`).
  if ((status === 'in_review' || status === 'pending') && !row.start_date) return 'review';

  if (status === 'approved' && !row.start_date) {
    // Slot kedaluwarsa (`expired`) dan order auto-review menunggu PENELITI
    // memilih jadwal, bukan admin.
    if (pay === 'expired') return null;
    return isAutoReviewed(row as any) ? null : 'schedule';
  }

  // Slot milik admin: tagihannya diterbitkan admin. Jadwal yang sudah lewat
  // tidak bisa ditagih lagi — itu urusan "Slot kedaluwarsa" di daftar, bukan antrean.
  if (
    row.slot_booked_by === 'admin' &&
    row.start_date &&
    row.start_date.slice(0, 10) >= ctx.todayYmd &&
    !ctx.hasOpenBill
  ) return 'invoice';

  return null;
}

/** Alasan sebuah order ada di antrean — `broadcast` = gelombang Kilat menunggu toggle. */
export type QueueReason = AdminAction | 'broadcast';

export interface AdminQueueCounts {
  regular: string[];
  kilat: string[];
  /**
   * Alasan per order. SATU sumber untuk badge tab DAN titik merah di baris /
   * laci Submissions: order bertitik merah = order yang dihitung badge.
   */
  reasons: Record<string, QueueReason>;
}

const QUEUE_COLUMNS =
  'id, distribution_type, submission_status, start_date, slot_booked_by, payment_status, dismissed_at, submission_method, survey_url, detected_keywords, voucher_code, forced_manual_reason';

/** Id order yang menunggu admin, dipisah per jenis distribusi. */
export async function fetchAdminQueue(now: Date = new Date()): Promise<AdminQueueCounts> {
  const todayYmd = toWibYmd(now);
  const { data, error } = await supabase
    .from('form_submissions')
    .select(QUEUE_COLUMNS)
    .is('dismissed_at', null)
    .or(
      'and(submission_status.in.(in_review,pending),start_date.is.null),' +
      'and(submission_status.eq.approved,start_date.is.null),' +
      `and(slot_booked_by.eq.admin,start_date.gte.${todayYmd})`,
    );
  if (error) throw error;
  const rows = (data ?? []) as AdminQueueRow[];

  const invoiceCandidates = rows.filter((r) => r.slot_booked_by === 'admin' && r.start_date).map((r) => r.id);
  const openBill = new Set<string>();
  if (invoiceCandidates.length > 0) {
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('form_submission_id')
      .in('form_submission_id', invoiceCandidates)
      .eq('status', 'pending');
    if (txErr) throw txErr;
    for (const t of tx ?? []) openBill.add((t as any).form_submission_id);
  }

  const out: AdminQueueCounts = { regular: [], kilat: [], reasons: {} };
  for (const r of rows) {
    const action = adminActionOf(r, { hasOpenBill: openBill.has(r.id), todayYmd });
    if (!action) continue;
    (r.distribution_type === 'kilat' ? out.kilat : out.regular).push(r.id);
    out.reasons[r.id] = action;
  }

  // Gelombang Kilat (kedua kaki: ordinal 1 & perpanjangan) yang menunggu toggle.
  const startsBy = new Date(now.getTime() + 60 * 60_000).toISOString();
  const { data: waves, error: waveErr } = await supabase
    .from('ad_schedules')
    .select('submission_id, start_date, end_date, kilat_slot_hour, payment_status, air_on_credit_at, broadcast_at, broadcast_by, broadcast_ended_at')
    .eq('distribution_type', 'kilat')
    .is('broadcast_at', null)
    .not('kilat_slot_hour', 'is', null)
    .neq('status', 'cancelled')
    .lte('start_date', startsBy);
  if (waveErr) throw waveErr;
  for (const w of (waves ?? []) as any[]) {
    const ok = awaitsBroadcast({
      startDate: w.start_date, endDate: w.end_date, kilatSlotHour: w.kilat_slot_hour,
      paymentStatus: w.payment_status, airOnCreditAt: w.air_on_credit_at,
      broadcastAt: w.broadcast_at, broadcastBy: w.broadcast_by, broadcastEndedAt: w.broadcast_ended_at,
    }, now);
    if (ok && !out.kilat.includes(w.submission_id)) {
      out.kilat.push(w.submission_id);
      out.reasons[w.submission_id] = 'broadcast';
    }
  }
  return out;
}

/** Event yang memicu hitung ulang badge setelah admin bertindak. */
export const ADMIN_QUEUE_CHANGED = 'admin-queue-changed';

export function notifyAdminQueueChanged() {
  window.dispatchEvent(new Event(ADMIN_QUEUE_CHANGED));
}
