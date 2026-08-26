import type { OrderPriceResult } from './supabase';

const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

/**
 * Kalimat yang menjelaskan apa yang terjadi pada HARGA sesudah admin menyunting
 * masukan harga sebuah order.
 *
 * ⚠️ ADA SUPAYA PERUBAHAN HARGA TIDAK PERNAH DIAM. Menyunting jumlah
 * pertanyaan, durasi, atau hadiah mengubah tagihan — tapi layarnya cuma
 * berkata "berhasil disimpan", jadi admin tidak punya cara tahu bahwa angka
 * yang dikutipkan ke peneliti barusan berubah. Yang paling berbahaya justru
 * kasus `skipped`: pada order lunas harganya SENGAJA tidak ikut berubah, dan
 * diamnya terbaca sebagai "sudah beres" padahal di situlah selisih
 * tercatat-vs-ditagih lahir.
 *
 * `null` = tidak ada masukan harga yang tersentuh, jadi tidak ada yang perlu
 * dikatakan — aturan emas: jangan menjelaskan yang tidak terjadi.
 */
export function repriceMessage(pricing: OrderPriceResult | null): string | null {
  if (!pricing) return null;

  if (pricing.skipped === 'paid') {
    return 'Harga tidak diubah — order sudah lunas. Selisihnya perlu tagihan susulan.';
  }

  // Pada order berjadwal banyak `totalCost` hanya harga jadwal ke-1; menyebutnya
  // "total" adalah cara admin dan peneliti mulai memegang dua angka.
  // Lihat `orderTotalOf`.
  if (pricing.scheduleCount > 1) {
    return `Harga jadwal ke-1 kini ${rupiah(pricing.totalCost)}`
      + ` · total ${pricing.scheduleCount} jadwal ${rupiah(pricing.orderTotal)}`;
  }

  return `Harga kini ${rupiah(pricing.totalCost)}`;
}
