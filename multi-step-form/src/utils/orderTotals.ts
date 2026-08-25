import type { AdScheduleEntry } from './supabase';

/**
 * Total uang SATU ORDER — jumlah seluruh jadwalnya.
 *
 * ⚠️ ADA UNTUK MENGGANTI PEMBACAAN `form_submissions.total_cost` SEBAGAI TOTAL
 * ORDER, dan itu bukan pilihan gaya. Kolom itu menyimpan harga JADWAL PERTAMA,
 * bukan harga order:
 *
 *   * `sync_ad_schedule_from_submission()` (sql/49) menyalinnya ke baris
 *     ordinal 1 saja — jadwal ke-2 dst. punya `total_cost` sendiri di
 *     `ad_schedules` dan tidak pernah dijumlahkan balik ke induknya;
 *   * jalur perpanjangan (`InvoiceForm`, ordinal ≥2) memang SENGAJA tidak
 *     menulis `form_submissions.total_cost` — lihat catatan di kepala
 *     `InvoiceForm.tsx`.
 *
 * Akibatnya terukur di produksi (2026-08-25): pada 10 order berjadwal banyak,
 * `SUM(ad_schedules.total_cost)` ≠ `form_submissions.total_cost`. Contoh
 * terburuknya order `5e62e2eb` — tercatat Rp 2.640.000, ordernya Rp 5.830.000.
 *
 * ⚠️ INI MEMBACA, BUKAN MEMPERBAIKI. Nilai `form_submissions.total_cost` tidak
 * diubah di mana pun; yang berubah cuma berhenti membacanya sebagai total order.
 * Menaikkannya jadi total order sungguhan berarti menyentuh trigger cermin,
 * `create-payment.js`, dan pemeriksaan mismatch-nya sekaligus — pekerjaan
 * terpisah, bukan efek samping.
 *
 * Jadwal yang DIBATALKAN tetap dijumlahkan bila `total_cost`-nya masih berdiri:
 * angka ini menjawab "berapa yang pernah ditagih atas order ini", dan itu
 * pertanyaan pembukuan. Untuk "berapa yang masih harus dibayar", pakai
 * `fetchScheduleBilling()` — ia menyaring lewat `payment_status_rank` (sql/53).
 */
export function orderTotalOf(entries: readonly AdScheduleEntry[]): number {
  return entries.reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0);
}
