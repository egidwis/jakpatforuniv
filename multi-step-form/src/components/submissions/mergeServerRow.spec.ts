import { describe, it, expect } from 'vitest';
import { mergeServerRow } from './mergeServerRow';
import type { SurveySubmission } from './types';

/**
 * Penjaga untuk cacat yang membuat admin tidak percaya pada layarnya sendiri.
 *
 * Approve di tab Review melakukan TIGA tulisan berurutan: `question_count`
 * baru, lalu harga yang dihitung ulang dari angka itu, lalu statusnya. Sesudah
 * itu daftarnya di-refresh — tapi refresh-nya lambat (satu GET 50 baris),
 * sementara respons PATCH status kembali lebih dulu. Di sela itulah dulu
 * dashboard menambal barisnya sendiri dari SALINAN LAMA:
 *
 *     prev.map(s => s.id === id ? { ...s, status, admin_notes, review_history } : s)
 *
 * `...s` itu snapshot SEBELUM koreksi. Jadi tepat sesudah admin mengoreksi
 * 38 → 36 Q, baris yang tampil kembali berbunyi 38 Q dengan harga lama — dan
 * karena perubahan status memicu drawer pindah tab, angka basi itulah yang
 * dibaca admin sebagai "koreksiku hilang".
 *
 * Kalau urutannya kebalik pun tetap salah: tambalan yang mendarat BELAKANGAN
 * menimpa data segar dengan snapshot basi. Tidak ada urutan yang benar —
 * yang salah adalah menyusun ulang baris dari ingatan, padahal PostgREST
 * sudah mengembalikan baris aslinya lewat `.select()`.
 */

const prev: SurveySubmission = {
  id: 'sub-1',
  formId: 'sub-1abc',
  formTitle: 'Survei Konsumen Minimarket',
  formUrl: 'https://docs.google.com/forms/d/e/xyz/viewform',
  researcherName: 'Rina Kusuma',
  researcherEmail: 'rina@kampus.ac.id',
  submittedAt: '2026-08-30T10:00:00.000Z',
  questionCount: 38,
  responseCount: 0,
  status: 'in_review',
  submission_status: 'in_review',
  total_cost: 526_500,
  duration: 1,
  admin_notes: 'Tolong perbaiki bagian A.',
  review_history: [],
  has_transactions: false,
};

/** Bentuk baris apa adanya dari PostgREST (`.select()` sesudah update). */
const serverRow = {
  id: 'sub-1',
  title: 'Survei Konsumen Minimarket',
  survey_url: 'https://docs.google.com/forms/d/e/xyz/viewform',
  question_count: 36,
  duration: 1,
  submission_status: 'approved',
  payment_status: 'pending',
  total_cost: 493_950,
  admin_notes: null,
  review_history: [
    { action: 'approved', actor: 'admin', timestamp: '2026-08-31T09:24:29.363Z' },
  ],
  created_at: '2026-08-30T10:00:00.000Z',
};

describe('mergeServerRow', () => {
  it('mengambil kolom yang baru saja ditulis, bukan salinan lama di layar', () => {
    const merged = mergeServerRow(prev, serverRow);

    // Inti cacatnya: koreksi jumlah pertanyaan DAN harga yang menyertainya.
    expect(merged.questionCount).toBe(36);
    expect(merged.total_cost).toBe(493_950);
  });

  it('memindahkan status dan riwayat review dari baris server', () => {
    const merged = mergeServerRow(prev, serverRow);

    expect(merged.submission_status).toBe('approved');
    expect(merged.status).toBe('approved');
    expect(merged.review_history).toHaveLength(1);
    expect(merged.review_history?.[0].action).toBe('approved');
  });

  it('menghormati penghapusan catatan — null bukan "tidak diubah"', () => {
    // `updateFormStatus` menulis admin_notes hanya kalau nilainya bukan
    // undefined, jadi null yang kembali dari server memang berarti DIHAPUS.
    expect(mergeServerRow(prev, serverRow).admin_notes).toBeNull();
  });

  it('menyamakan `pending` dengan `in_review`, persis seperti pemuat daftarnya', () => {
    // Baris lama ber-`pending` dibaca di SELURUH UI sebagai "Need Review".
    // Kalau merge ini menyimpannya apa adanya, satu baris hasil approve bisa
    // tampil beda dari 49 baris tetangganya yang lewat loadSubmissions().
    const merged = mergeServerRow(prev, { ...serverRow, submission_status: 'pending' });
    expect(merged.status).toBe('in_review');
    expect(merged.submission_status).toBe('pending');
  });

  it('TIDAK menyentuh kolom hasil join / turunan yang tidak dimiliki baris itu', () => {
    // Nama & email peneliti datang dari `profiles` lewat fetchProfileNames(),
    // bukan dari form_submissions. Menimpanya dengan undefined akan membuat
    // baris yang baru di-approve tiba-tiba kehilangan identitas penelitinya.
    const merged = mergeServerRow(prev, serverRow);

    expect(merged.researcherName).toBe('Rina Kusuma');
    expect(merged.researcherEmail).toBe('rina@kampus.ac.id');
    expect(merged.formId).toBe('sub-1abc');
    expect(merged.has_transactions).toBe(false);
  });

  it('membiarkan baris apa adanya kalau servernya tidak mengembalikan apa-apa', () => {
    // PostgREST bisa memulangkan nol baris (mis. RLS memblokir). Yang benar
    // adalah tidak mengubah apa pun, bukan menulis undefined ke seluruh kolom.
    expect(mergeServerRow(prev, null)).toBe(prev);
    expect(mergeServerRow(prev, undefined)).toBe(prev);
  });
});
