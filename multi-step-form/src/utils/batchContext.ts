import { supabase } from './supabase';

/**
 * Konteks batch hadiah untuk sebuah jendela tayang.
 *
 * ⚠️ DIANGKAT DARI `ScheduleForm.tsx` (Phase 4). Sampai 2026-09-11 ini helper
 * LOKAL di komponen admin, jadi dialog peneliti tidak bisa memakainya tanpa
 * menyalinnya — dan salinan kedua dari pertanyaan "apakah batch ini baru"
 * adalah persis cara jadwal #3 dulu ditagih untuk pool yang sudah didanai
 * jadwal #2. Satu deklarasi, dua pemanggil.
 */
export interface BatchContext {
  periodBatch: string;
  isNewBatch: boolean;
  poolPrizePerWinner: number;
  poolWinnerCount: number;
}

/**
 * Batch mana yang akan ditempati jadwal baru — dan karenanya, apakah pool hadiah
 * baru wajib didanai.
 *
 * Dijawab di server supaya string batch-nya diturunkan ekspresi yang sama dengan
 * yang menghitung `period_batch` tersimpan (sql/37). Menanyakannya di browser
 * adalah yang dulu membuat jadwal #3 ditagih untuk pool yang sudah didanai
 * jadwal #2.
 *
 * ⚠️ `null` berarti TIDAK BISA DIPASTIKAN — bukan "batch lama". Pemanggil yang
 * memperlakukannya sebagai batch lama akan melewatkan panel hadiah untuk batch
 * yang sebenarnya baru, dan `create_ad_schedule` (sql/86) akan menolaknya di
 * server. Tampilkan kegagalannya, jangan tebak.
 */
export async function fetchBatchContext(
  submissionId: string,
  endDateIso: string,
): Promise<BatchContext | null> {
  const { data, error } = await supabase.rpc('get_schedule_batch_context', {
    p_submission_id: submissionId,
    p_end_date: endDateIso,
  });
  if (error) {
    console.error('Error resolving batch context:', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    periodBatch: row.period_batch,
    isNewBatch: row.is_new_batch,
    poolPrizePerWinner: row.pool_prize_per_winner || 0,
    poolWinnerCount: row.pool_winner_count || 0,
  };
}

/**
 * `ad_schedules.id` dari `source_id` yang dipulangkan `create_ad_schedule()`.
 *
 * ⚠️ INI BUKAN KENYAMANAN — ia menutup jebakan yang tidak pernah error.
 * `create_ad_schedule()` mengembalikan **`source_id`** (nilai yang dipakai
 * `invoices.extend_id`), sementara resolver `/bayar/<id>` dan
 * `schedule_billing()` dikunci ke **`ad_schedules.id`**. Memakai yang salah
 * tidak melempar apa pun; ia cuma tidak menemukan tagihan, dan peneliti
 * mendarat di halaman kosong.
 */
export async function scheduleIdFromSourceId(sourceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ad_schedules')
    .select('id')
    .eq('source_table', 'form_submissions_extend')
    .eq('source_id', sourceId)
    .limit(1);
  if (error) {
    console.error('Gagal menurunkan ad_schedules.id dari source_id:', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row?.id ?? null;
}
