/**
 * Kalimat peringatan "link DOKU-nya mungkin masih hidup" — satu bentuk, satu tempat.
 *
 * ⚠️ ADA KARENA PESANNYA DULU SATU PARAGRAF PADAT, dan sebagiannya mengulang
 * dirinya sendiri:
 *
 *   "Tagihan JFU-INV-… dibatalkan, tapi link DOKU-nya MUNGKIN MASIH BISA
 *    DIBAYAR (DOKU tidak bisa menonaktifkan link ini. Link lamanya mungkin
 *    masih bisa dibayar.). Beri tahu penelitinya jangan membayar link yang
 *    lama."
 *
 * Dua kalimat di dalam kurung itu `dokuReason`, dan keduanya mengatakan persis
 * apa yang sudah dikatakan kalimat pembungkusnya. Jadi admin membaca AKIBAT dua
 * kali dan tidak pernah membaca SEBAB sekali pun. Akarnya sudah diperbaiki di
 * `explainDokuRejection()` (cancel-order.js); berkas ini yang membenahi
 * susunannya.
 *
 * ⚠️ TIGA LAPIS, DAN URUTANNYA MENGIKUTI APA YANG ADMIN BUTUHKAN LEBIH DULU:
 *   judul     — apa yang perlu dia sadari (link-nya masih hidup)
 *   tindakan  — apa yang harus dia lakukan (beri tahu penelitinya)
 *   sebab     — kenapa, untuk ditindaklanjuti nanti
 *
 * Nadanya sengaja tidak menenangkan: pembatalan di database KITA memang
 * berhasil, tapi menenangkan tanpa dasar persis yang membuat insiden af004b84
 * terjadi.
 */

export interface DokuLinkWarning {
  title: string;
  description: string;
}

/** Apa yang barusan berhasil di sisi kita — yang gagal selalu hal yang sama. */
export type DokuLinkAction = 'cancelled' | 'settled';

const HEADLINE: Record<DokuLinkAction, string> = {
  cancelled: 'Dibatalkan di sistem, tapi link DOKU-nya masih aktif',
  settled: 'Ditandai lunas, tapi link DOKU-nya masih aktif',
};

/**
 * @param action  yang berhasil di sisi kita
 * @param subject yang dikenali admin — nomor tagihan, atau "3 pesanan"
 * @param reason  SEBAB dari DOKU (`dokuReason`); `null` kalau tidak terbaca
 */
export const dokuLinkWarning = (
  action: DokuLinkAction,
  subject: string,
  reason: string | null,
): DokuLinkWarning => {
  const parts = [
    subject.trim(),
    'Beri tahu penelitinya jangan membayar link lama.',
  ];
  // Sebab hanya ditulis kalau ia benar-benar menambah sesuatu. Kalimat
  // "tidak diketahui" memakan satu baris untuk mengatakan nol.
  if (reason && reason.trim()) parts.push(`Sebab: ${reason.trim()}`);

  return { title: HEADLINE[action], description: parts.join(' · ') };
};
