import { describe, it, expect } from 'vitest';
import {
  PAY_NEEDS_LOCK,
  lockGateFeedback,
  newScheduleBlockFeedback,
  deadlineRowOf,
  barCtaSource,
  newScheduleZoneHint,
  isStaleBlockFeedback,
} from './reservationTicket';
import { scheduleLockGate } from './scheduleLockGate';
import { NEW_SCHEDULE_BLOCK_KEY } from './newSchedulePlan';
import type { NewScheduleBlock } from './newSchedulePlan';
import { translations } from '../i18n/translations';

/*
  Keputusan tiket reservasi yang bisa salah tanpa terlihat di layar: nada
  teguran (kelalaian = warning, kegagalan = error), baris batas bayar, dan
  siapa yang menghuni bar ponsel. Rangka tiketnya cuma merender jawaban ini.
*/

describe('PAY_NEEDS_LOCK — Bayar ditekan sebelum tanggal dikunci', () => {
  it('kelalaian pengguna, jadi warning', () => {
    expect(PAY_NEEDS_LOCK).toEqual({ key: 'payNeedsLockError', tone: 'warning' });
  });

  it('kalimatnya ada di kedua bahasa dan bukan kalimat "belum pilih tanggal"', () => {
    for (const lang of ['en', 'id'] as const) {
      const teks = translations[lang][PAY_NEEDS_LOCK.key];
      expect(teks, lang).toBeTruthy();
      // Peneliti yang SUDAH memilih tanggal tapi belum mengunci tidak boleh
      // dibilangi "pilih tanggal dulu".
      expect(teks).not.toBe(translations[lang].slotErrorNoDate);
    }
  });
});

describe('lockGateFeedback — verdict gerbang kunci → teguran', () => {
  const tolakDengan = (over: Parameters<typeof scheduleLockGate>[0]) => {
    const v = scheduleLockGate(over);
    if (v.ok) throw new Error('gerbang seharusnya menolak');
    return v;
  };
  const READY = { isReady: true, isRangeAvailable: () => true };

  it('tanpa tanggal = warning, kuncinya milik gerbang', () => {
    const v = tolakDengan({ selected: null, duration: 1, availability: READY });
    expect(lockGateFeedback(v)).toEqual({ key: 'slotErrorNoDate', tone: 'warning' });
  });

  it('lewat cutoff, ketersediaan belum terbaca, dan penuh = error', () => {
    const lewat = tolakDengan({ selected: '2026-12-20', duration: 1, availability: READY, isBookingClosed: () => true });
    const belumTerbaca = tolakDengan({
      selected: '2026-12-20', duration: 1, isBookingClosed: () => false,
      availability: { isReady: false, isRangeAvailable: () => true },
    });
    const penuh = tolakDengan({
      selected: '2026-12-20', duration: 1, isBookingClosed: () => false,
      availability: { isReady: true, isRangeAvailable: () => false },
    });
    expect(lockGateFeedback(lewat)).toEqual({ key: 'slotErrorPastCutoff', tone: 'error' });
    expect(lockGateFeedback(belumTerbaca)).toEqual({ key: 'slotErrorAvailabilityUnknown', tone: 'error' });
    expect(lockGateFeedback(penuh)).toEqual({ key: 'slotErrorFull', tone: 'error' });
  });
});

describe('newScheduleBlockFeedback — blok perpanjangan → teguran', () => {
  it('menyimpan bukan teguran', () => {
    expect(newScheduleBlockFeedback('saving')).toBeNull();
    expect(newScheduleBlockFeedback(null)).toBeNull();
  });

  it('kelalaian (tanggal, hadiah) = warning; sisanya = error', () => {
    const tone: Record<Exclude<NewScheduleBlock, 'saving'>, 'warning' | 'error'> = {
      no_date: 'warning',
      reward_missing: 'warning',
      availability_unknown: 'error',
      batch_resolving: 'error',
      batch_unknown: 'error',
    };
    for (const [block, expected] of Object.entries(tone) as Array<[Exclude<NewScheduleBlock, 'saving'>, 'warning' | 'error']>) {
      expect(newScheduleBlockFeedback(block), block).toEqual({
        // Kuncinya milik `newSchedulePlan` — tidak ada salinan kedua.
        key: NEW_SCHEDULE_BLOCK_KEY[block],
        tone: expected,
      });
    }
  });
});

describe('deadlineRowOf — baris "Batas bayar" di sobekan', () => {
  const base = { locked: true, creditPhase: null, showCountdown: true, timeLeft: 1200 };

  it('kredit menang atas segalanya: tagihan tempo tanpa tenggat', () => {
    expect(deadlineRowOf({ ...base, creditPhase: 'live' })).toEqual({ kind: 'credit', phase: 'live' });
    expect(deadlineRowOf({ ...base, locked: false, creditPhase: 'stopped' })).toEqual({ kind: 'credit', phase: 'stopped' });
  });

  it('belum dikunci = "1 jam setelah dikunci", walau timer masih menyimpan sisa', () => {
    expect(deadlineRowOf({ ...base, locked: false })).toEqual({ kind: 'hold' });
  });

  it('dikunci & bisa lepas sendiri = countdown', () => {
    expect(deadlineRowOf(base)).toEqual({ kind: 'countdown', seconds: 1200 });
  });

  it('timer belum berdetak = countdown(null), BUKAN catatan admin yang berkedip', () => {
    expect(deadlineRowOf({ ...base, timeLeft: null })).toEqual({ kind: 'countdown', seconds: null });
  });

  it('dikunci & tidak pernah lepas sendiri = ditahan tim', () => {
    expect(deadlineRowOf({ ...base, showCountdown: false, timeLeft: null })).toEqual({ kind: 'admin' });
  });
});

describe('barCtaSource — siapa yang menghuni bar ponsel', () => {
  it('zona kunci yang bisa ditekan selalu menang: sebelum kunci, bar = Kunci', () => {
    expect(barCtaSource('lock', 'needs_lock')).toBe('lock');
    expect(barCtaSource('lock', 'note')).toBe('lock');
    // Lewat 14.00: "Pilih Tanggal Lain" utama, "Tetap bayar" tinggal di kartu.
    expect(barCtaSource('action', 'ready')).toBe('lock');
  });

  it('sesudah kunci, bar = Bayar bila Bayar siap', () => {
    expect(barCtaSource('held', 'ready')).toBe('pay');
    expect(barCtaSource(null, 'ready')).toBe('pay');
  });

  it('tanpa aksi utama, bar tanpa tombol', () => {
    expect(barCtaSource('held', 'note')).toBeNull();
    expect(barCtaSource('info', 'none')).toBeNull();
    expect(barCtaSource(null, 'needs_lock')).toBeNull();
  });
});

describe('newScheduleZoneHint — sebab blok perpanjangan di zona kunci', () => {
  it('sebab pasif diucapkan sebelum tombol diklik', () => {
    expect(newScheduleZoneHint('reward_missing', null)).toBe('scheduleAgainRewardRequired');
    expect(newScheduleZoneHint('batch_resolving', null)).toBe('scheduleAgainBatchResolving');
  });

  it('teguran merah dengan kalimat yang SAMA menggantikannya — tidak tampil dua kali', () => {
    expect(newScheduleZoneHint('reward_missing', 'scheduleAgainRewardRequired')).toBeNull();
  });

  it('teguran lain tidak menyembunyikan sebab pasifnya', () => {
    expect(newScheduleZoneHint('reward_missing', 'slotErrorFull')).toBe('scheduleAgainRewardRequired');
  });

  it('tanpa sebab pasif (kosong, tanggal belum dipilih, menyimpan) = catatan hold bawaan', () => {
    expect(newScheduleZoneHint(null, null)).toBeUndefined();
    expect(newScheduleZoneHint('no_date', null)).toBeUndefined();
    expect(newScheduleZoneHint('saving', null)).toBeUndefined();
  });
});

describe('isStaleBlockFeedback — teguran blok yang sebabnya sudah hilang', () => {
  it('hadiah kini terisi: teguran "hadiah belum diisi" basi', () => {
    expect(isStaleBlockFeedback('scheduleAgainRewardRequired', null)).toBe(true);
  });

  it('periode selesai dibaca dan ternyata pool baru: teguran "sedang dibaca" basi', () => {
    expect(isStaleBlockFeedback('scheduleAgainBatchResolving', 'reward_missing')).toBe(true);
  });

  it('sebabnya masih ada: teguran tetap', () => {
    expect(isStaleBlockFeedback('scheduleAgainRewardRequired', 'reward_missing')).toBe(false);
  });

  it('teguran yang bukan sebab blok (penuh, lewat cutoff) tidak pernah dianggap basi', () => {
    expect(isStaleBlockFeedback('slotErrorFull', null)).toBe(false);
    expect(isStaleBlockFeedback('slotErrorPastCutoff', null)).toBe(false);
  });

  it('tanpa teguran = tidak ada yang basi', () => {
    expect(isStaleBlockFeedback(null, null)).toBe(false);
  });
});
