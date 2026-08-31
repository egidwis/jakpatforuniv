import type { ReviewHistoryEntry, SurveySubmission } from './types';

/**
 * Menyalin baris `form_submissions` yang BARU SAJA dikembalikan PostgREST ke
 * atas baris yang sedang tampil.
 *
 * ⚠️ JANGAN PERNAH MENAMBAL BARIS DARI INGATAN LAYAR.
 *
 * Setiap penulis di dashboard ini sudah memakai `.select()`, jadi PostgREST
 * selalu memulangkan baris hasilnya — lengkap, sesudah trigger, sesudah
 * penghitungan ulang harga. Menyusun ulang barisnya sendiri (`{ ...s, status }`)
 * berarti mempertahankan SEMUA kolom lain dari snapshot sebelum aksi, dan
 * snapshot itu sudah basi persis pada aksi yang mengubah lebih dari satu kolom.
 *
 * Kejadian nyatanya: Approve di tab Review menulis `question_count`, lalu harga
 * yang dihitung ulang dari angka itu, baru statusnya. Tambalan lama membawa
 * `questionCount` dan `total_cost` LAMA ikut terbang, jadi koreksi 38 → 36 Q
 * langsung tampak batal di layar sementara DB-nya benar. Admin membacanya
 * sebagai "koreksiku hilang" dan mengulanginya.
 *
 * Kolom hasil join / turunan (nama peneliti dari `profiles`, `formId`,
 * `responseCount`, `has_transactions`) TIDAK ada di baris ini dan karena itu
 * tidak disentuh — bukan ditimpa `undefined`.
 */
export function mergeServerRow(
  prev: SurveySubmission,
  row: Record<string, unknown> | null | undefined,
): SurveySubmission {
  // Nol baris kembali (mis. RLS memblokir update): tidak ada kabar baru, jadi
  // tidak ada yang boleh berubah. Menulis undefined ke seluruh kolom jauh
  // lebih buruk daripada menahan tampilan sampai refresh berikutnya.
  if (!row) return prev;

  const next: SurveySubmission = { ...prev };

  /** Terapkan hanya kalau kolomnya benar-benar ada di baris yang kembali. */
  const take = <K extends keyof SurveySubmission>(
    key: K,
    column: string,
    map: (v: unknown) => SurveySubmission[K] = (v) => v as SurveySubmission[K],
  ) => {
    if (column in row) next[key] = map(row[column]);
  };

  take('formTitle', 'title', (v) => (v as string) || 'Untitled Survey');
  take('formUrl', 'survey_url');
  take('questionCount', 'question_count', (v) => (v as number) || 0);
  take('total_cost', 'total_cost', (v) => (v as number) || 0);
  take('duration', 'duration');
  take('submission_status', 'submission_status');
  take('payment_status', 'payment_status');
  take('admin_notes', 'admin_notes');
  take('review_history', 'review_history', (v) => (v as ReviewHistoryEntry[]) || []);
  take('criteria', 'criteria_responden');
  take('prize_per_winner', 'prize_per_winner');
  take('winnerCount', 'winner_count');
  take('voucher_code', 'voucher_code');
  take('start_date', 'start_date');
  take('end_date', 'end_date');
  take('slot_booked_by', 'slot_booked_by');
  take('slot_reserved_at', 'slot_reserved_at');
  take('dismissed_at', 'dismissed_at');
  take('distribution_type', 'distribution_type');
  take('kilat_slot_hour', 'kilat_slot_hour');
  take('detected_keywords', 'detected_keywords');
  take('phone_number', 'phone_number');
  take('university', 'university');
  take('department', 'department');
  take('submission_method', 'submission_method');
  take('leads', 'referral_source');
  take('invoiceName', 'full_name');
  take('invoiceEmail', 'email');
  take('invoicePhone', 'phone_number');

  // ⚠️ `status` di UI BUKAN kolom `status` di DB — kolom itu menyimpan jenjang
  // pendidikan (lihat `education` di loadSubmissions). Turunannya harus sama
  // persis dengan pemuat daftarnya, termasuk `pending` yang dibaca sebagai
  // "Need Review", supaya baris hasil approve tidak tampil beda dari tetangganya.
  if ('submission_status' in row) {
    const raw = (row.submission_status as string) || 'in_review';
    next.status = raw === 'pending' ? 'in_review' : raw;
  }
  take('education', 'status');

  return next;
}
