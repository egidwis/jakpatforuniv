import { describe, it, expect } from 'vitest';
import { rescheduleResetPatch } from './rescheduleReset';

/*
  Cacat aslinya (10 Sep 2026, booking #MM36J2EW): jadwal dipindah ke 22 Sep —
  tanggal yang masih jauh di depan — dan kartunya tetap berbunyi "Slot
  kedaluwarsa. Silakan atur tanggal tayang baru." Penelitinya melihat "Batas
  bayar terlewat".

  Sebabnya `payment_status = 'expired'` yang bertahan melewati pemindahan
  tanggal: `handleSaveEdit` menyetel ulang submission_status, slot_booked_by,
  dan slot_reserved_at, tapi melewatkan yang satu ini.
*/

describe('rescheduleResetPatch — cacat #MM36J2EW', () => {
  it('slot gugur yang dipindah ke tanggal baru: vonis kedaluwarsanya DIBERSIHKAN', () => {
    expect(rescheduleResetPatch({
      paymentStatus: 'expired',
      lifecycleStatus: 'slot_reserved',
    })).toEqual({ payment_status: 'pending' });
  });

  it('jadwal yang DIBATALKAN admin lalu dijadwalkan ulang juga dibersihkan', () => {
    // `cancelSchedule()` menulis slot_cancelled + expired. Memberinya tanggal
    // baru adalah cara admin menghidupkannya kembali — dan itu memang sah.
    expect(rescheduleResetPatch({
      paymentStatus: 'expired',
      lifecycleStatus: 'slot_cancelled',
    })).toEqual({ payment_status: 'pending' });
  });
});

describe('rescheduleResetPatch — yang TIDAK boleh disentuh', () => {
  it('uang yang sudah masuk tidak pernah dibalik jadi pending', () => {
    for (const s of ['paid', 'completed', 'PAID']) {
      expect(rescheduleResetPatch({ paymentStatus: s, lifecycleStatus: 'slot_reserved' }))
        .toEqual({});
    }
  });

  it('order yang SUDAH BERJALAN tidak disentuh — pemindahannya koreksi, bukan rebooking', () => {
    for (const s of ['scheduled', 'live', 'completed', 'paid']) {
      expect(rescheduleResetPatch({ paymentStatus: 'expired', lifecycleStatus: s }))
        .toEqual({});
    }
  });

  it('`failed` DIPERTAHANKAN — ia riwayat percobaan bayar, bukan vonis jendela', () => {
    expect(rescheduleResetPatch({ paymentStatus: 'failed', lifecycleStatus: 'slot_reserved' }))
      .toEqual({});
  });

  it('`pending` tidak menghasilkan tulisan sia-sia', () => {
    expect(rescheduleResetPatch({ paymentStatus: 'pending', lifecycleStatus: 'slot_reserved' }))
      .toEqual({});
  });

  it('status yang tidak diketahui / kosong tidak memicu apa pun', () => {
    expect(rescheduleResetPatch({ paymentStatus: null })).toEqual({});
    expect(rescheduleResetPatch({ paymentStatus: undefined })).toEqual({});
    expect(rescheduleResetPatch({ paymentStatus: '' })).toEqual({});
  });

  it('lunas MENANG atas lifecycle yang belum berjalan', () => {
    // Urutan penjaganya penting: uang lebih dulu diperiksa daripada lifecycle.
    expect(rescheduleResetPatch({ paymentStatus: 'paid', lifecycleStatus: 'slot_cancelled' }))
      .toEqual({});
  });
});
