import { supabase, type AdScheduleEntry } from './supabase';

/**
 * Siaran JFU Kilat v2 (sql/130) — cermin `kilat_window_start/_close`.
 *
 *   scheduled  sebelum gelombang − 60 menit: halaman "belum dibuka"
 *   live       sejak gelombang − 60 menit, TANPA batas, sampai admin mematikan
 *   grace      sudah dimatikan, < 60 menit: halaman tutup untuk pengunjung baru,
 *              isian sesi terbuka masih diterima, admin bisa "Nyalakan lagi"
 *   finished   tenggang habis: terkunci, pemenang bisa dipilih
 *
 * Server (RPC `kilat_broadcast_*`) yang menegakkan aturannya; fungsi ini hanya
 * membaca waktu supaya UI tidak menawarkan aksi yang pasti ditolak.
 */
export type BroadcastPhase = 'scheduled' | 'live' | 'grace' | 'finished';

export interface BroadcastState {
  phase: BroadcastPhase;
  /** Mulai live (gelombang − 60 menit, atau nyala manual lama). */
  opensAt: Date | null;
  /** Dimatikan (admin / gelombang berikutnya). NULL = belum. */
  endedAt: Date | null;
  /** Tenggang habis: isian ditolak, pemenang bisa dipilih. */
  closesAt: Date | null;
  /** Sudah live selama ini (0 bila belum live). */
  liveForMs: number;
  /** Pernah nyala karena migrasi (gelombang lama), bukan oleh admin. */
  isBackfill: boolean;
  /** Diakhiri sistem karena gelombang berikutnya mulai. */
  isSuperseded: boolean;
}

/** ⚠️ DUPLIKAT `kilat_lead()` sql/130 — dijaga tes paritas. */
export const KILAT_LEAD_MS = 60 * 60_000;
/** ⚠️ DUPLIKAT `submit_grace()` sql/130 — dijaga tes paritas. */
export const SUBMIT_GRACE_MS = 60 * 60_000;
/** Live selama ini masuk antrean "Matikan siaran?". */
export const LONG_LIVE_MS = 24 * 3600_000;

type BroadcastFields = Pick<AdScheduleEntry, 'startDate' | 'broadcastAt' | 'broadcastBy' | 'broadcastEndedAt' | 'broadcastEndedBy'>;

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export function broadcastStateOf(s: BroadcastFields, now: Date = new Date()): BroadcastState {
  const t = now.getTime();
  const start = ms(s.startDate);
  const opens = Number.isFinite(ms(s.broadcastAt)) ? ms(s.broadcastAt) : start - KILAT_LEAD_MS;
  const ended = ms(s.broadcastEndedAt);
  const closes = ended + SUBMIT_GRACE_MS;
  const base = {
    opensAt: Number.isFinite(opens) ? new Date(opens) : null,
    endedAt: Number.isFinite(ended) ? new Date(ended) : null,
    closesAt: Number.isFinite(ended) ? new Date(closes) : null,
    isBackfill: s.broadcastBy === 'backfill' || /^sistem: sql\/130/.test(s.broadcastEndedBy || ''),
    isSuperseded: s.broadcastEndedBy === 'sistem: gelombang berikutnya',
  };
  if (Number.isFinite(ended)) {
    return { ...base, phase: t < closes ? 'grace' : 'finished', liveForMs: 0 };
  }
  if (!Number.isFinite(opens) || t < opens) return { ...base, phase: 'scheduled', liveForMs: 0 };
  return { ...base, phase: 'live', liveForMs: t - opens };
}

const isPaidWave = (s: Pick<AdScheduleEntry, 'paymentStatus' | 'airOnCreditAt'>) =>
  ['paid', 'completed'].includes((s.paymentStatus || '').toLowerCase()) || !!s.airOnCreditAt;

/**
 * Gelombang Kilat lunas/tempo yang sudah live ≥ 24 jam tanpa dimatikan —
 * antrean merah "Matikan siaran?" (titik di tab Page). Live tanpa batas itu
 * keputusan 27 Okt; antrean ini yang menjaga supaya tidak terlupa.
 */
export function needsBroadcastEnd(
  s: BroadcastFields & Pick<AdScheduleEntry, 'paymentStatus' | 'airOnCreditAt' | 'kilatSlotHour'>,
  now: Date = new Date(),
): boolean {
  if (s.kilatSlotHour == null || !s.startDate || !isPaidWave(s)) return false;
  const st = broadcastStateOf(s, now);
  return st.phase === 'live' && st.liveForMs >= LONG_LIVE_MS;
}

export type BroadcastAction = 'broadcast-end' | 'broadcast-reopen';

const HINT_MESSAGE: Record<string, string> = {
  broadcast_auto: 'Siaran Kilat sekarang live otomatis 60 menit sebelum gelombang.',
  broadcast_finished: 'Siaran gelombang ini sudah selesai dan terkunci.',
  broadcast_not_started: 'Siaran gelombang ini belum mulai (live otomatis 60 menit sebelum gelombang).',
  broadcast_not_ended: 'Siaran gelombang ini masih live.',
  broadcast_superseded: 'Gelombang berikutnya order ini sudah live — gelombang ini tidak bisa dinyalakan lagi.',
  broadcast_unpaid: 'Gelombang ini belum lunas.',
  broadcast_no_wave: 'Jadwal ini belum punya gelombang.',
  broadcast_not_kilat: 'Toggle siaran hanya untuk JFU Kilat.',
  broadcast_not_found: 'Jadwal tidak ditemukan.',
};

export class BroadcastError extends Error {
  readonly hint: string | null;
  constructor(message: string, hint: string | null) {
    super(message);
    this.hint = hint;
  }
}

export async function kilatBroadcast(action: BroadcastAction, scheduleId: string): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new BroadcastError('Sesi admin tidak ada. Masuk lagi lalu ulangi.', null);
  const res = await fetch('/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, scheduleId }),
  });
  const raw = await res.text();
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* badan bukan JSON */ }
  if (!res.ok) {
    const hint = body?.hint ?? null;
    throw new BroadcastError(HINT_MESSAGE[hint] || body?.error || `Gagal (HTTP ${res.status})`, hint);
  }
  return body?.data ?? {};
}
