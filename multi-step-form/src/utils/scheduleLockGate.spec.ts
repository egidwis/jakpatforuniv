import { describe, it, expect } from 'vitest';
import { scheduleLockGate } from './scheduleLockGate';
import type { LockGateInput } from './scheduleLockGate';

/*
  SATU gerbang "boleh kunci tanggal ini?", bukan tiga salinan.

  ⚠️ KENAPA BERKAS INI ADA. Keempat pemeriksaan di bawah hidup di TIGA tempat
  yang harus sepakat: `StepSchedule.handleConfirm` (jadwal ke-1),
  `PaymentCheckoutPage.handleRebook` (pilih ulang sesudah kedaluwarsa), dan
  `ScheduleAgainDialog` (perpanjangan). Komentar di `handleRebook` mengakuinya
  sendiri — *"Sama seperti di StepSchedule"* — lalu mencatat sesuatu yang lebih
  penting: jalur itu **tidak punya pemeriksaan ulang di server**
  (`rebookSlotForSubmission` hanya menolak order yang sudah lunas), jadi gerbang
  klien ini satu-satunya yang berdiri.

  Tiga salinan dari satu-satunya penjaga adalah tiga kesempatan untuk berbeda.
*/

const READY: LockGateInput['availability'] = {
  isReady: true,
  isRangeAvailable: () => true,
};

const inputOf = (over: Partial<LockGateInput> = {}): LockGateInput => ({
  selected: '2026-12-20',
  duration: 7,
  availability: READY,
  // Gerbang cutoff disuntik supaya tes tidak bergantung pada jam dinding.
  isBookingClosed: () => false,
  ...over,
});

describe('scheduleLockGate — keempat cabang', () => {
  it('tanggal kosong ditolak', () => {
    const v = scheduleLockGate(inputOf({ selected: null }));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe('no_date');
    expect(v.ok === false && v.messageKey).toBe('slotErrorNoDate');
  });

  it('lewat cutoff ditolak — dan tanggalnya wajib DIBERSIHKAN', () => {
    // Kedua pemanggil lama memanggil `setSelected(null)` di cabang ini, dan
    // itu bukan detail tampilan: membiarkan tanggal mati tetap terpilih
    // membuat klik berikutnya menolak lagi tanpa peneliti tahu apa yang salah.
    const v = scheduleLockGate(inputOf({ isBookingClosed: () => true }));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe('past_cutoff');
    expect(v.ok === false && v.clearSelection).toBe(true);
  });

  it('ketersediaan BELUM terbaca ditolak — dan wajib minta muat ulang', () => {
    /*
      ⚠️ KOSONG BUKAN LOWONG. `isRangeAvailable` membaca `counts[ymd] || 0`,
      jadi selama ketersediaan belum terbaca ia menjawab TRUE untuk SETIAP
      tanggal — termasuk yang sudah penuh. Inilah sebabnya urutannya mengikat:
      `isReady` WAJIB diperiksa SEBELUM `isRangeAvailable`.
    */
    const v = scheduleLockGate(inputOf({
      availability: { isReady: false, isRangeAvailable: () => true },
    }));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe('availability_unknown');
    expect(v.ok === false && v.shouldReload).toBe(true);
  });

  it('rentang penuh ditolak', () => {
    const v = scheduleLockGate(inputOf({
      availability: { isReady: true, isRangeAvailable: () => false },
    }));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe('range_full');
  });

  it('keempatnya lolos → ok, membawa tanggal & durasi', () => {
    const v = scheduleLockGate(inputOf());
    expect(v.ok).toBe(true);
    expect(v.ok === true && v.ymd).toBe('2026-12-20');
    expect(v.ok === true && v.duration).toBe(7);
  });
});

describe('scheduleLockGate — urutan gerbang mengikat', () => {
  it('ketersediaan belum terbaca MENANG atas rentang penuh', () => {
    // Kalau urutannya terbalik, `isRangeAvailable` yang fail-open akan
    // meloloskan tanggal penuh setiap kali pengambilan datanya menggantung.
    const v = scheduleLockGate(inputOf({
      availability: { isReady: false, isRangeAvailable: () => false },
    }));
    expect(v.ok === false && v.reason).toBe('availability_unknown');
  });

  it('cutoff MENANG atas ketersediaan belum terbaca', () => {
    // Tanggal yang sudah lewat batas pesan tidak pernah jadi sah, seberapa pun
    // lowongnya — jadi menyuruh peneliti menunggu kalender termuat itu bohong.
    const v = scheduleLockGate(inputOf({
      isBookingClosed: () => true,
      availability: { isReady: false, isRangeAvailable: () => true },
    }));
    expect(v.ok === false && v.reason).toBe('past_cutoff');
  });

  it('tanggal kosong MENANG atas segalanya', () => {
    const v = scheduleLockGate(inputOf({
      selected: null,
      isBookingClosed: () => true,
      availability: { isReady: false, isRangeAvailable: () => false },
    }));
    expect(v.ok === false && v.reason).toBe('no_date');
  });
});

describe('scheduleLockGate — durasi', () => {
  it('durasi diteruskan APA ADANYA ke isRangeAvailable', () => {
    // Perpanjangan memakai durasi jadwal sebelumnya, bukan 2 yang di-hardcode
    // `ScheduleAgainDialog`. Gerbang tidak boleh diam-diam menormalkannya.
    let dilihat: number | null = null;
    scheduleLockGate(inputOf({
      duration: 14,
      availability: {
        isReady: true,
        isRangeAvailable: (_ymd, days) => { dilihat = days; return true; },
      },
    }));
    expect(dilihat).toBe(14);
  });

  it('durasi < 1 dinaikkan ke 1 — nol hari bukan reservasi', () => {
    let dilihat: number | null = null;
    scheduleLockGate(inputOf({
      duration: 0,
      availability: {
        isReady: true,
        isRangeAvailable: (_ymd, days) => { dilihat = days; return true; },
      },
    }));
    expect(dilihat).toBe(1);
  });
});
