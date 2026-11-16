import type { AdScheduleEntry } from '@/utils/supabase';
import { scheduleAgainBlock } from '@/utils/canScheduleAgain';
import { occupiesSlot } from '@/pages/dashboard/schedule/scheduleModel';
import { formatIDR } from '@/utils/currency';

/**
 * Pengaman ganda "Jadwal Iklan Baru" di drawer admin.
 *
 * ⚠️ PREDIKATNYA MILIK PENELITI, SENGAJA. Peneliti tidak bisa menambah jadwal
 * selama jadwal yang ada belum lunas atau ordernya `slot_cancelled`
 * (`scheduleAgainBlock`); admin tidak pernah dibatasi (gerbang tab hanya
 * memeriksa Kilat/spam/review). Itu benar — kadang sah — tapi jadwal baru
 * selalu lahir sebagai PERPANJANGAN: di periode yang sama reward-nya nol, dan
 * jadwal lamanya tidak ikut pindah. Insiden Mun#07–Mun12 (16 Nov 2026): admin
 * bermaksud memindah tanggal dan melahirkan enam jadwal Rp 0.
 *
 * Kilat dikecualikan (`kilatOpen: true`): gerbangnya sudah di `canAddSchedule`.
 */
export type NewScheduleGuardCause = 'parent_cancelled' | 'parent_on_credit' | 'parent_unpaid';

export interface NewScheduleGuard {
  cause: NewScheduleGuardCause;
  /** Jadwal yang menjadi sebab peringatan. */
  parent: AdScheduleEntry;
}

const isPaid = (e: AdScheduleEntry) => ['paid', 'completed'].includes((e.paymentStatus || '').toLowerCase());

export function newScheduleGuardOf(
  submission: { distribution_type?: string | null; submission_status?: string | null },
  entries: AdScheduleEntry[],
  now: number = Date.now(),
): NewScheduleGuard | null {
  const block = scheduleAgainBlock(submission as any, entries, now, { kilatOpen: true });
  const byOrdinal = [...entries].sort((a, b) => a.ordinal - b.ordinal);

  if (block === 'quota_held') {
    const parent = byOrdinal.find((e) => occupiesSlot(e, now) && !isPaid(e));
    if (!parent) return null;
    return { cause: parent.airOnCreditAt ? 'parent_on_credit' : 'parent_unpaid', parent };
  }
  if (block === 'order_inactive') {
    const parent = byOrdinal.find((e) => e.ordinal === 1) ?? byOrdinal[0];
    if (!parent) return null;
    return { cause: parent.status === 'cancelled' ? 'parent_cancelled' : 'parent_unpaid', parent };
  }
  return null;
}

export interface NewScheduleGuardCopy {
  title: string;
  lines: string[];
  confirmLabel: string;
  ackLabel: string;
}

export function newScheduleGuardCopy(g: NewScheduleGuard): NewScheduleGuardCopy {
  const { parent: p } = g;
  const head = `Jadwal #${p.ordinal} (#${p.bookingId})`;
  const title = g.cause === 'parent_cancelled' ? `${head} sudah dibatalkan`
    : g.cause === 'parent_on_credit' ? `${head} sedang tayang sebelum lunas`
      : `${head} belum lunas`;

  const hasReward = (p.winnerCount || 0) > 0 && (p.prizePerWinner || 0) > 0;
  const priceLine = hasReward
    ? `Jadwal baru dicatat sebagai PERPANJANGAN. Di periode yang sama, reward responden TIDAK ditagihkan lagi, jadi nominalnya berbeda dari jadwal #${p.ordinal} (Harga Tercatat ${formatIDR(p.totalCost)}, termasuk reward ${p.winnerCount} × ${formatIDR(p.prizePerWinner)}).`
    : `Jadwal baru dicatat sebagai PERPANJANGAN dengan harga dihitung ulang (jadwal #${p.ordinal}: Harga Tercatat ${formatIDR(p.totalCost)}).`;

  const hint = g.cause === 'parent_cancelled'
    ? 'Jadwal #1 TIDAK ikut pindah ke tanggal baru; ia tetap batal.'
    : g.cause === 'parent_on_credit'
      ? 'Kalau tujuanmu menagih ulang atau mengganti nominal, batalkan ini dan pakai "Terbitkan Ulang Tagihan Tempo" di kartu jadwalnya.'
      : 'Kalau tujuanmu memindah tanggal, batalkan ini dan pakai "Ganti Tanggal" di kartu jadwal itu.';

  return {
    title,
    lines: [
      'Peneliti tidak bisa membuat jadwal baru di keadaan ini. Pastikan ini memang yang dimaksud.',
      priceLine,
      hint,
    ],
    confirmLabel: 'Tetap buat jadwal baru',
    ackLabel: 'Saya paham: jadwal ini perpanjangan tanpa reward, dan jadwal sebelumnya tidak ikut pindah.',
  };
}
