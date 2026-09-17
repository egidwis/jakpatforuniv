import { describe, it, expect } from 'vitest';
import { rebookPlanFor } from './rebookPlan';
import { expiryPlanFor } from './scheduleExpiry';

/*
  Tes jalur UANG & jalur DATA sekaligus. Memilih primitif yang salah tidak
  melempar galat apa pun — ia menulis ke baris yang salah, "berhasil", dan
  menggeser jadwal yang tidak sedang dilihat peneliti.
*/

describe('rebookPlanFor', () => {
  it('ordinal 1 tanpa saudara → lingkup ORDER', () => {
    expect(rebookPlanFor({ ordinal: 1, siblingCount: 1, paymentStatus: 'pending' })).toEqual({
      primitive: 'rebookSlotForSubmission',
      scope: 'order',
    });
  });

  it('perpanjangan → lingkup JADWAL', () => {
    expect(rebookPlanFor({ ordinal: 4, siblingCount: 4, paymentStatus: 'pending' })).toEqual({
      primitive: 'rebookSchedule',
      scope: 'schedule',
    });
  });

  it('⚠️ ordinal 1 yang PUNYA saudara tetap lingkup JADWAL', () => {
    /*
      Cabang yang paling mudah ditulis salah, dan yang paling mahal kalau salah.
      Menulis `form_submissions` di sini menyalakan trigger sinkron, yang lalu
      MENIMPA cermin `ad_schedules` jadwal ini. Bercabang pada `ordinal >= 2`
      saja akan melewatkannya — dan itu bentuk pertama yang kutulis.
    */
    expect(rebookPlanFor({ ordinal: 1, siblingCount: 3, paymentStatus: 'pending' })).toEqual({
      primitive: 'rebookSchedule',
      scope: 'schedule',
    });
  });

  it('yang sudah lunas tidak dipesan ulang, apa pun ordinalnya', () => {
    for (const s of ['paid', 'completed']) {
      expect(rebookPlanFor({ ordinal: 1, siblingCount: 1, paymentStatus: s }).primitive).toBe('none');
      expect(rebookPlanFor({ ordinal: 5, siblingCount: 5, paymentStatus: s })).toEqual({
        primitive: 'none', scope: 'none', reason: 'already_paid',
      });
    }
  });

  it('status kosong/null bukan alasan menolak', () => {
    expect(rebookPlanFor({ ordinal: 1, siblingCount: 1, paymentStatus: null }).primitive)
      .toBe('rebookSlotForSubmission');
    expect(rebookPlanFor({ ordinal: 2, siblingCount: 2, paymentStatus: undefined }).primitive)
      .toBe('rebookSchedule');
  });
});

describe('sejalan dengan expiryPlanFor — satu aturan lingkup, bukan dua', () => {
  /*
    Kalau kedua fungsi ini pernah berbeda pendapat soal LINGKUP, salah satunya
    salah. Melepas jadwal dan memesannya ulang harus menyentuh baris yang sama;
    kalau tidak, pelepasan menulis `ad_schedules` sementara pemesanan ulang
    menulis `form_submissions`, dan keduanya "berhasil".
  */
  const kasus = [
    { ordinal: 1, siblingCount: 1 },
    { ordinal: 1, siblingCount: 2 },
    { ordinal: 2, siblingCount: 2 },
    { ordinal: 4, siblingCount: 4 },
  ];

  it.each(kasus)('ordinal $ordinal, saudara $siblingCount → lingkup sama', (k) => {
    const rebook = rebookPlanFor({ ...k, paymentStatus: 'pending' });
    const expiry = expiryPlanFor({ ...k, slotBookedBy: 'user', paymentStatus: 'pending' });
    expect(rebook.scope).toBe(expiry.scope);
  });
});
