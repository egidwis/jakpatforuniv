/**
 * Haruskah jadwal yang terlanjur lahir dilepas kembali?
 *
 * ⚠️ KENAPA INI ADA. Mengunci jadwal baru adalah DUA tulisan tanpa transaksi:
 * `create_ad_schedule()` melahirkan barisnya, lalu `createPayment()` melahirkan
 * tagihannya. Kegagalan di antara keduanya meninggalkan jadwal tanpa tagihan —
 * dan baris itu MEMAKAN KUOTA HARIAN, karena `assert_daily_ad_quota_free`
 * menghitung menurut STATUS, bukan menurut ada-tidaknya tagihan.
 *
 * Terukur di produksi 17 Sep 2026: 3 baris yatim, yang tertua sejak 24 Juli.
 * Kebocorannya lama; yang baru adalah jalur swalayan membuatnya bisa DIULANG
 * oleh peneliti sendiri, berkali-kali, tanpa satu pun tagihan terbit.
 *
 * Keputusannya dipisah dari komponen karena proyek ini menguji logika murni
 * (nol `@testing-library`), dan cabang yang paling mudah salah di sini justru
 * yang paling mahal kalau salah — lihat `needs_admin_invoice` di bawah.
 */

export interface LockRollbackInput {
  /** Sudah lahir? `null` = `create_ad_schedule` belum pernah berhasil. */
  sourceId: string | null;
  /** Server menjawab "tagihannya menyusul manual dari admin". */
  needsAdminInvoice: boolean;
}

export type LockRollbackDecision =
  /** Tidak ada yang perlu dilepas — jadwalnya tidak pernah lahir. */
  | { action: 'nothing'; reason: 'never_created' }
  /** Jadwalnya SENGAJA hidup: admin akan menerbitkan tagihannya. */
  | { action: 'nothing'; reason: 'awaiting_admin_invoice' }
  /** Jadwal lahir, tagihan tidak. Lepaskan. */
  | { action: 'release'; sourceId: string };

export function lockRollbackDecision(input: LockRollbackInput): LockRollbackDecision {
  if (!input.sourceId) {
    return { action: 'nothing', reason: 'never_created' };
  }
  /*
    ⚠️ CABANG YANG TIDAK BOLEH DI-ROLLBACK, dan urutannya mengikat.
    `needs_admin_invoice` sampai di sini lewat blok `catch` yang sama dengan
    kegagalan sungguhan — tapi ia BUKAN kegagalan. Jadwalnya memang dibiarkan
    hidup menunggu tagihan manual admin. Melepasnya akan menghapus pekerjaan
    yang justru baru saja berhasil, dan peneliti kehilangan slot yang sudah
    sah dia pegang.
  */
  if (input.needsAdminInvoice) {
    return { action: 'nothing', reason: 'awaiting_admin_invoice' };
  }
  return { action: 'release', sourceId: input.sourceId };
}
