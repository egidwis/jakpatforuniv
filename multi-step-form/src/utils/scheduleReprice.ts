import { adRateAt, adRateEntryAt } from '@/utils/cost-calculator';
import { toWibYmd } from '@/utils/airing-window';

// ─────────────────────────────────────────────────────────────
// "Memindahkan jadwal ini mengubah tarifnya?" — untuk dialog konfirmasi admin.
//
// CERMIN trigger `maintain_schedule_rate_lock()` (sql/103), cabang UPDATE:
// jadwal yang BELUM lunas dan dipindah ke hari WIB lain dikunci ulang ke
// `now()` — tarif hari pemindahan, bukan tarif saat order dibuat. Berkas ini
// tidak menulis apa pun; ia hanya meramalkan apa yang trigger akan lakukan,
// supaya admin tidak memindahkan jadwal lalu kaget harganya naik.
//
// ⚠️ "Lunas" di sini = `payment_status` ∈ paid/completed, PERSIS seperti
// trigger — BUKAN `isSchedulePaid()`. Yang terakhir membaca jadwal tempo
// (`scheduled`/`live`, payment_status masih pending) sebagai lunas, padahal
// trigger tetap menilai ulang baris itu.
//
// Hanya berbeda nyata bila periode tarif kuncinya ≠ periode hari ini; selama
// Okt–Nov 2026 (harga efektif = harga lama) hasilnya selalu null.
// ─────────────────────────────────────────────────────────────

export interface RepriceOnMove {
  /** Instan kunci tarif saat ini (yang akan ditimpa). */
  lockedAtMs: number;
  /** Tarif per hari sebelum → sesudah; hanya ada bila jumlah soal diketahui. */
  perDay?: { from: number; to: number };
}

export function repriceOnMove(input: {
  paymentStatus: string | null | undefined;
  rateLockedAt: string | null | undefined;
  fromStartIso: string | null | undefined;
  toStartIso: string;
  questionCount?: number | null;
  nowMs?: number;
}): RepriceOnMove | null {
  if (['paid', 'completed'].includes((input.paymentStatus || '').toLowerCase())) return null;
  if (!input.fromStartIso) return null;
  if (toWibYmd(new Date(input.fromStartIso)) === toWibYmd(new Date(input.toStartIso))) return null;

  // NULL = sudah dibaca "sekarang" di mana pun; menguncinya ke sekarang tidak
  // mengubah angka apa pun.
  const lockedAtMs = Date.parse(input.rateLockedAt ?? '');
  if (Number.isNaN(lockedAtMs)) return null;

  const nowMs = input.nowMs ?? Date.now();
  const before = adRateEntryAt(lockedAtMs);
  const after = adRateEntryAt(nowMs);
  if (before.effective.every((v, i) => v === after.effective[i])) return null;

  const questionCount = input.questionCount || 0;
  if (!questionCount) return { lockedAtMs };
  const from = adRateAt(questionCount, lockedAtMs).effective;
  const to = adRateAt(questionCount, nowMs).effective;
  // Tier ini kebetulan tidak berubah walau tier lain berubah — tak perlu dialog.
  if (from === to) return null;
  return { lockedAtMs, perDay: { from, to } };
}
