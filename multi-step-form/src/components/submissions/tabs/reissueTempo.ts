/**
 * Kalimat dialog "Terbitkan Ulang Tagihan Tempo".
 *
 * Aksinya sendiri tidak baru: formulir tagihan tempo yang sama, dan
 * `writeInvoiceRows` mencabut tagihan lama jadwal ini sebelum menulis yang baru
 * (link DOKU-nya dimatikan, saudara segrup dimundurkan `expires_at`-nya →
 * `/bayar/` memperbarui mereka dengan nominal sisa). Yang baru adalah PINTUNYA
 * untuk jadwal yang sudah tayang kredit — sebelumnya admin hanya melihat
 * "Hentikan Tayang", lalu memesan ulang, dan iklannya berhenti (insiden Mun#07,
 * 16 Nov 2026).
 */
export interface ReissueTempoCopy {
  title: string;
  lines: string[];
  confirmLabel: string;
}

export function reissueTempoCopy(input: {
  bookingId: string;
  paymentId: string;
  /** Anggota HIDUP tagihan lamanya (`InvoiceGroup.memberCount`); 1 = tunggal. */
  memberCount: number;
  /** Judul anggota hidup SELAIN jadwal ini. */
  otherTitles: string[];
}): ReissueTempoCopy {
  const { bookingId, paymentId, memberCount, otherTitles } = input;
  const lines = [
    'Iklannya TETAP tayang. Yang diganti hanya tagihannya.',
    `Link bayar lama ${paymentId} dimatikan, lalu tagihan tempo baru terbit dengan link baru.`,
  ];
  if (memberCount > 1) {
    lines.push(
      `${paymentId} adalah tagihan gabungan ${memberCount} pesanan. Pesanan lain (${otherTitles.join(', ')}) `
      + 'TIDAK ikut tagihan baru ini; mereka ditagih ulang otomatis dengan nominal sisanya saat link /bayar/-nya dibuka. '
      + 'Untuk menagih ulang seluruh grup sekaligus, pakai Tagihan Gabungan.',
    );
  }
  return {
    title: `Terbitkan ulang tagihan tempo #${bookingId}?`,
    lines,
    confirmLabel: 'Lanjut ke formulir tagihan',
  };
}
