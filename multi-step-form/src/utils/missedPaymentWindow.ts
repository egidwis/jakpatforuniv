import { isPaymentTooLateForDate, toWibYmd } from './airing-window';

/**
 * Order yang MELEWATKAN jendela bayarnya — tanggal tayangnya sudah tidak bisa
 * dikejar, tapi ordernya masih duduk menunggu pembayaran.
 *
 * ⚠️ ADA KARENA SEBUAH JANJI. Sejak Track B3, peneliti jalur manual tidak lagi
 * diberi tombol "Jadwalkan Ulang" — kartunya berbunyi *"tim kami yang akan
 * menjadwalkan ulang"*. Sebelum ini tidak ada apa pun yang memberi tahu tim:
 * order semacam itu tenggelam di daftar `waiting_payment`, tak terbedakan dari
 * order sehat yang tenggatnya masih jauh, dan hanya ditemukan dengan menyisir
 * tanggal satu per satu. Menjanjikan aksi tim tanpa ada yang memicunya adalah
 * bentuk lain dari "jangan tampilkan data yang belum ada".
 *
 * ⚠️ PREDIKATNYA `isPaymentTooLateForDate`, BUKAN DEFINISI BARU. Itu fungsi yang
 * sama yang dipakai sisi peneliti untuk state `too_late_today` dan yang jadi
 * pemenang tie-break `isLate` di kartu admin. Tiga permukaan, satu sumber —
 * kalau batas 14.00 WIB bergeser, ia bergeser sekali.
 */
export function missedPaymentWindow(
  input: {
    startDate?: string | Date | null;
    submissionStatus?: string | null;
    paymentStatus?: string | null;
  },
  now: Date = new Date()
): boolean {
  const ymd = wibYmdOf(input.startDate);
  if (!ymd) return false;

  // Sudah lunas / batal / mati → bukan urusan antrean ini. Disaring lebih dulu
  // supaya order lunas yang tanggalnya lampau (mayoritas arsip) tidak ikut
  // tertandai — penanda yang menyala untuk ratusan baris sehat sama tak
  // bergunanya dengan tidak ada penanda sama sekali.
  const pay = (input.paymentStatus || '').toLowerCase();
  if (['paid', 'completed'].includes(pay)) return false;

  const sub = (input.submissionStatus || '').toLowerCase();
  if (['paid', 'scheduled', 'live', 'completed', 'cancelled', 'rejected', 'spam', 'slot_cancelled'].includes(sub)) {
    return false;
  }
  // Hanya order yang benar-benar menunggu uang. `approved`/`in_review` belum
  // punya tanggal yang mengikat, jadi "terlambat" tidak berlaku untuk mereka.
  if (!['waiting_payment', 'slot_reserved'].includes(sub)) return false;

  return isPaymentTooLateForDate(ymd, now);
}

/**
 * Tanggal tayang → YYYY-MM-DD menurut kalender WIB.
 *
 * ⚠️ DUA BENTUK MASUK KE SINI DAN KEDUANYA HARUS BENAR.
 * `form_submissions.start_date` bertipe DATE ('2026-09-03'), sementara
 * `ad_schedules`/`form_submissions_extend` bertipe TIMESTAMPTZ. Untuk yang
 * pertama, memotong 10 karakter pertama sudah tepat DAN aman: tidak ada jam
 * untuk digeser. Untuk yang kedua, potongan itu berbahaya — jadwal Kilat yang
 * jamnya belum ditetapkan tersimpan 00.00 WIB = 17.00Z HARI SEBELUMNYA, jadi
 * memotongnya akan memundurkan tanggalnya sehari dan menandai order yang
 * sebenarnya masih punya waktu.
 */
function wibYmdOf(value?: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : toWibYmd(value);
  if (!value.includes('T')) return value.slice(0, 10) || null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : toWibYmd(d);
}
