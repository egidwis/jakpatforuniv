import { deriveScheduleMoney, type ScheduleMoney } from './scheduleMoney';
import type { AdScheduleEntry } from './supabase';

/**
 * Harga yang AKAN ditagih bila peneliti mengunci tanggal baru sekarang.
 *
 * ⚠️ TARIF HARI INI, BUKAN TARIF LAMA (keputusan 10 Okt 2026, aturan sql/103).
 * Memindahkan tanggal ke hari WIB lain sebelum lunas mengunci ulang
 * `rate_locked_at = now()`, dan `create-payment.js` menagih dengan instan itu.
 * `total_cost` tersimpan masih harga lama — memajangnya di layar pilih ulang
 * menjanjikan angka yang tidak akan ditagih. Jadi: estimasi di "sekarang"
 * (`rateLockedAt: null` → `rateInstantOf` jatuh ke `Date.now()`), dengan
 * `totalCost: 0` supaya `deriveScheduleMoney` masuk cabang penawaran.
 *
 * ⚠️ KECUALI order yang BELUM PERNAH bertanggal. Trigger sql/103 hanya
 * mengunci ulang saat tanggal PINDAH hari (OLD.start_date terisi) atau sesudah
 * dilepas (instan dikosongkan). Tanggal pertama untuk order tanpa tanggal tidak
 * menyentuh `rate_locked_at` — ia tetap instan order lahir, dan itulah yang
 * ditagih. Jadi: tanpa tanggal + instan terisi → instan itu; selain itu → kini.
 *
 * Status dipaksa `waiting_payment`: jadwal yang dilepas/dibatalkan bernilai 0
 * di `deriveScheduleMoney` ("tidak sedang ditawarkan"), padahal yang dihitung
 * di sini memang penawaran baru.
 */
export function repickEstimate(
  entry: AdScheduleEntry,
  submission: { question_count?: number | null; distribution_type?: string | null; voucher_code?: string | null },
  overrides: { duration?: number; voucherCode?: string | null } = {},
): ScheduleMoney {
  return deriveScheduleMoney(
    {
      ...entry,
      status: 'waiting_payment',
      totalCost: 0,
      subtotal: null,
      ppnAmount: null,
      rateLockedAt: entry.startDate == null ? (entry.rateLockedAt ?? null) : null,
      duration: overrides.duration ?? entry.duration,
      voucherCode: overrides.voucherCode ?? entry.voucherCode ?? submission.voucher_code ?? null,
    } as AdScheduleEntry,
    submission,
  );
}
