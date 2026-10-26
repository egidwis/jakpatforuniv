import type { TranslationKey } from '../i18n/translations';
import type { LockGateReason } from './scheduleLockGate';
import { NEW_SCHEDULE_BLOCK_KEY } from './newSchedulePlan';
import type { NewScheduleBlock } from './newSchedulePlan';
import type { CreditPhase } from '../components/status/scheduleAxes';

/**
 * Keputusan tiket reservasi (badan = pilih & kunci, sobekan = bayar) yang bisa
 * salah tanpa terlihat. Murni: tidak merender, tidak memanggil `toast`.
 *
 * ⚠️ SATU KUNCI UNTUK TEGURAN INLINE DAN TOAST-NYA. `LockFeedback` membawa
 * kunci i18n, dan `useLockFeedback` merender keduanya dari kunci itu — jadi
 * kalimat di bawah tombol Kunci tidak bisa berbeda dari toast yang menyertainya.
 *
 * Nada: kelalaian pengguna (belum memilih, belum mengunci, hadiah kosong) =
 * `warning`; keadaan yang bukan salahnya (lewat cutoff, kuota, data belum
 * terbaca) = `error`.
 */

export type LockFeedbackTone = 'warning' | 'error';

export interface LockFeedback {
  key: TranslationKey;
  tone: LockFeedbackTone;
}

/** Verdict gagal `scheduleLockGate` → teguran. Kuncinya milik gerbang. */
export function lockGateFeedback(verdict: { reason: LockGateReason; messageKey: TranslationKey }): LockFeedback {
  return { key: verdict.messageKey, tone: verdict.reason === 'no_date' ? 'warning' : 'error' };
}

/** Blok `newSchedulePlan` (perpanjangan) → teguran. `saving` bukan teguran. */
export function newScheduleBlockFeedback(block: NewScheduleBlock | null): LockFeedback | null {
  if (!block || block === 'saving') return null;
  const tone: LockFeedbackTone = block === 'no_date' || block === 'reward_missing' ? 'warning' : 'error';
  return { key: NEW_SCHEDULE_BLOCK_KEY[block], tone };
}

/**
 * Petunjuk pasif zona kunci perpanjangan: SEBAB tombol belum bisa mengunci
 * (periode sedang dibaca, hadiah belum diisi, …), diucapkan sebelum diklik.
 *
 *   kunci     — sebab pasifnya.
 *   null      — teguran merah sudah mengucapkan kalimat yang SAMA; dulu
 *               keduanya tampil bertumpuk (abu-abu lalu merah, kata per kata).
 *   undefined — tanpa sebab pasif: rangka memakai catatan hold bawaan.
 *               Tanggal kosong bukan sebab pasif — ia baru ditegur saat diklik.
 */
export function newScheduleZoneHint(
  block: NewScheduleBlock | null,
  errorKey: TranslationKey | null,
): TranslationKey | null | undefined {
  if (!block || block === 'saving' || block === 'no_date') return undefined;
  const key = NEW_SCHEDULE_BLOCK_KEY[block];
  return errorKey === key ? null : key;
}

/**
 * Teguran yang lahir dari blok `newSchedulePlan` dan sebabnya sudah hilang
 * (hadiah kini terisi, periode selesai dibaca). Tanpa ini teguran merah
 * bertahan sampai tombol diklik lagi. Teguran yang bukan sebab blok (penuh,
 * lewat cutoff) hanya hilang lewat jalurnya sendiri: ganti tanggal atau kunci.
 */
export function isStaleBlockFeedback(
  errorKey: TranslationKey | null,
  block: NewScheduleBlock | null,
): boolean {
  if (!errorKey) return false;
  const blockKeys = Object.values(NEW_SCHEDULE_BLOCK_KEY) as TranslationKey[];
  if (!blockKeys.includes(errorKey)) return false;
  return errorKey !== (block ? NEW_SCHEDULE_BLOCK_KEY[block] : null);
}

/**
 * Baris "Batas bayar" di sobekan.
 *
 *   hold      — belum dikunci: "1 jam setelah dikunci" (`SLOT_HOLD_MS`).
 *               ⚠️ Bukan "14.00 di hari tayang": tagihannya boleh hidup sampai
 *               14.00, tapi slotnya sudah lepas sejam sesudah dikunci.
 *   countdown — dikunci & lepas sendiri. `seconds: null` = timer belum berdetak
 *               ("--:--"); dulu jeda itu sempat menampilkan catatan admin.
 *   admin     — dikunci & tidak pernah lepas sendiri (jadwal tim).
 *   credit    — tagihan tempo, tanpa tenggat (K3). Menang atas segalanya.
 */
export type DeadlineRow =
  | { kind: 'hold' }
  | { kind: 'countdown'; seconds: number | null }
  | { kind: 'admin' }
  | { kind: 'credit'; phase: CreditPhase };

export function deadlineRowOf(input: {
  locked: boolean;
  creditPhase: CreditPhase | null;
  showCountdown: boolean;
  timeLeft: number | null;
}): DeadlineRow {
  if (input.creditPhase) return { kind: 'credit', phase: input.creditPhase };
  if (!input.locked) return { kind: 'hold' };
  if (input.showCountdown) return { kind: 'countdown', seconds: input.timeLeft };
  return { kind: 'admin' };
}

export type LockZoneKind = 'lock' | 'held' | 'action' | 'info';
export type PaySlotKind = 'needs_lock' | 'ready' | 'note' | 'none';

/**
 * Siapa yang menghuni bar bawah ponsel.
 *
 * Zona kunci yang bisa ditekan (`lock`, `action`) selalu menang — sebelum
 * dikunci bar berisi Kunci, dan Bayar redup TIDAK pernah tampil di ponsel.
 * Sesudah dikunci, Bayar yang siap pindah ke tempat yang sama.
 */
export function barCtaSource(lockKind: LockZoneKind | null, payKind: PaySlotKind): 'lock' | 'pay' | null {
  if (lockKind === 'lock' || lockKind === 'action') return 'lock';
  if (payKind === 'ready') return 'pay';
  return null;
}
