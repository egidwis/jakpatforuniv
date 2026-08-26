import { toast } from 'sonner';

/**
 * Mengabari peneliti bahwa jadwal tayangnya dibatalkan atau digeser.
 *
 * ⚠️ KEGAGALAN EMAIL TIDAK BOLEH MEMBATALKAN AKSINYA. Jadwalnya sudah berubah
 * di server; memutar balik keputusan admin gara-gara SMTP jauh lebih buruk
 * daripada satu email yang tidak sampai. Jadi fungsi ini TIDAK PERNAH melempar
 * — ia menelan errornya dan memberi tahu admin lewat toast terpisah supaya bisa
 * menyusul lewat WA. Kontrak yang sama dipakai `notifyReviewResult` di
 * `InternalDashboard`, dan `_mail.js` di sisi server ("satu pintu keluar,
 * tidak pernah melempar, kembalikan { ok }").
 *
 * Yang dikirim cuma `scheduleId` + `event`: endpointnya membaca ulang tanggal,
 * status, dan alamat emailnya sendiri dari DB, dan menolak mengirim kalau
 * keadaan di sana tidak cocok. `previousStart` satu-satunya nilai yang
 * dititipkan — DB tidak menyimpan riwayat tanggal, jadi tidak ada tempat lain
 * untuk membacanya — dan endpointnya membatasi perannya sesempit mungkin.
 */
export async function notifyScheduleChange(input: {
  scheduleId: string;
  event: 'cancelled' | 'moved';
  /** ISO tanggal mulai SEBELUM perubahan. Hanya untuk `moved`. */
  previousStart?: string | null;
}): Promise<void> {
  try {
    const res = await fetch('/api/notify-schedule-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error('Gagal mengirim email perubahan jadwal:', err);
    toast.warning(
      input.event === 'cancelled'
        ? 'Jadwal dibatalkan, tapi email ke peneliti gagal terkirim. Susulkan lewat WA.'
        : 'Jadwal tersimpan, tapi email ke peneliti gagal terkirim. Susulkan lewat WA.'
    );
  }
}
