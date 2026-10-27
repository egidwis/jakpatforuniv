/**
 * Konstanta jendela siaran Kilat (sql/130). Modul tanpa dependensi supaya
 * `supabase.ts` dan `kilatBroadcast.ts` sama-sama bisa memakainya tanpa
 * impor melingkar.
 */

/** ⚠️ DUPLIKAT `kilat_lead()` sql/130 — dijaga tes paritas kilatBroadcast.spec.ts. */
export const KILAT_LEAD_MS = 60 * 60_000;
/** ⚠️ DUPLIKAT `submit_grace()` sql/130 — dijaga tes paritas kilatBroadcast.spec.ts. */
export const SUBMIT_GRACE_MS = 60 * 60_000;
