import { supabase, type AdScheduleEntry } from './supabase';

/**
 * Toggle siaran JFU Kilat (Phase 5 §5.4b, rilis R4).
 *
 * Tiga keadaan, satu arah — cermin `airing_window_end` sql/118:
 *   pending  belum disiarkan   → jendela sementara [gelombang, +24 jam)
 *   live     sedang disiarkan  → [nyala, nyala + panjang jendela)
 *   finished selesai           → dimatikan admin, ATAU jendela nyala habis
 *
 * Server (RPC `kilat_broadcast_*`) yang menegakkan aturannya; fungsi ini hanya
 * membaca waktu supaya UI tidak menawarkan aksi yang pasti ditolak.
 */
export type BroadcastPhase = 'pending' | 'live' | 'finished';

export interface BroadcastState {
  phase: BroadcastPhase;
  /** Kapan jendela halaman & undian tutup (live) / tertutup (finished). */
  closesAt: Date | null;
  /** Toggle nyala sudah boleh: gelombang − 60 menit (sql/118). */
  canStart: boolean;
  /** Jendela sementara gelombang sudah habis tanpa pernah disiarkan. */
  isLate: boolean;
  /** Pernah nyala karena migrasi (17 gelombang lama), bukan oleh admin. */
  isBackfill: boolean;
}

const START_LEAD_MS = 60 * 60_000;

type BroadcastFields = Pick<AdScheduleEntry, 'startDate' | 'endDate' | 'broadcastAt' | 'broadcastBy' | 'broadcastEndedAt'>;

export function broadcastStateOf(s: BroadcastFields, now: Date = new Date()): BroadcastState {
  const start = s.startDate ? new Date(s.startDate).getTime() : NaN;
  const end = s.endDate ? new Date(s.endDate).getTime() : NaN;
  const lengthMs = Number.isFinite(start) && Number.isFinite(end) ? end - start : 24 * 3600_000;
  const t = now.getTime();
  const isBackfill = s.broadcastBy === 'backfill';

  if (s.broadcastAt) {
    const naturalEnd = new Date(s.broadcastAt).getTime() + lengthMs;
    const ended = s.broadcastEndedAt ? Math.min(new Date(s.broadcastEndedAt).getTime(), naturalEnd) : naturalEnd;
    const finished = !!s.broadcastEndedAt || t >= naturalEnd;
    return { phase: finished ? 'finished' : 'live', closesAt: new Date(ended), canStart: false, isLate: false, isBackfill };
  }

  return {
    phase: 'pending',
    closesAt: Number.isFinite(end) ? new Date(end) : null,
    canStart: Number.isFinite(start) && t >= start - START_LEAD_MS,
    isLate: Number.isFinite(end) && t >= end,
    isBackfill,
  };
}

/**
 * Gelombang Kilat lunas/tempo yang menunggu admin menyalakan siaran — angka
 * tambahan di badge tab Kilat. Hanya yang toggle-nya SUDAH bisa dinyalakan
 * (gelombang − 60 menit): gelombang minggu depan bukan pekerjaan hari ini.
 */
export function awaitsBroadcast(s: BroadcastFields & Pick<AdScheduleEntry, 'paymentStatus' | 'airOnCreditAt' | 'kilatSlotHour'>, now: Date = new Date()): boolean {
  if (s.kilatSlotHour == null || !s.startDate) return false;
  const paid = ['paid', 'completed'].includes((s.paymentStatus || '').toLowerCase()) || !!s.airOnCreditAt;
  if (!paid) return false;
  const st = broadcastStateOf(s, now);
  return st.phase === 'pending' && st.canStart;
}

export type BroadcastAction = 'broadcast-start' | 'broadcast-end' | 'broadcast-undo';

const HINT_MESSAGE: Record<string, string> = {
  broadcast_too_early: 'Toggle siaran baru aktif 60 menit sebelum gelombang.',
  broadcast_finished: 'Siaran gelombang ini sudah selesai dan terkunci.',
  broadcast_not_started: 'Siaran gelombang ini belum dinyalakan.',
  broadcast_has_respondents: 'Sudah ada responden sejak siaran dinyalakan — nyala tidak bisa dibatalkan.',
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
