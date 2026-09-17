import { describe, it, expect } from 'vitest';
import { dokuLifetimeMinutes } from './payment';
import { SLOT_HOLD_MS, slotReleaseDeadline } from './slotHold';

/*
  ═══════════════════════════════════════════════════════════════════════════
  UMUR LINK DOKU TIDAK BOLEH MELEWATI TAHANAN SLOTNYA
  ═══════════════════════════════════════════════════════════════════════════

  Ini tes jalur UANG. `payment_due_date` DOKU adalah DURASI MENIT SEJAK LINK
  DIBUAT, bukan sebuah instant — jadi link yang lahir di menit ke-59 sebuah
  hold 1 jam akan hidup 59 menit MELEWATI tenggat slotnya kalau umurnya dipatok
  60.

  Yang terjadi di celah itu bukan sekadar angka yang tidak cocok: peneliti
  membayar, uangnya mendarat di DOKU, dan slotnya sudah dilepas. Webhook
  menolaknya sebagai `paid_on_dead_bill` — nol tulisan, 200 ke DOKU, email
  alert — jadi uangnya tidak hilang, tapi hasilnya tiket manual dan peneliti
  melihat "pembayaran berhasil" untuk jadwal yang tidak menyala.
*/

const ISO = (ms: number) => new Date(ms).toISOString();

describe('dokuLifetimeMinutes', () => {
  it('tanpa tenggat memakai 60 menit — perilaku lama, dipertahankan', () => {
    expect(dokuLifetimeMinutes(undefined)).toBe(60);
  });

  it('hold yang baru lahir memang menghasilkan 60 menit penuh', () => {
    const now = Date.now();
    expect(dokuLifetimeMinutes(ISO(now + SLOT_HOLD_MS), now)).toBe(60);
  });

  it('REGRESI YANG DITUTUP: link di detik terakhir hold tidak hidup 60 menit lagi', () => {
    /*
      Inilah pertanyaan aslinya — "kalau peneliti menekan Bayar tepat 1 detik
      sebelum countdown habis, apakah countdown DOKU tetap 1 jam?"
      Jawabannya sekarang: tidak, 1 menit.
    */
    const now = Date.now();
    const deadline = now + 1000; // 1 detik lagi
    expect(dokuLifetimeMinutes(ISO(deadline), now)).toBe(1);
  });

  it('sisa 90 detik dibulatkan ke 2 menit', () => {
    const now = Date.now();
    expect(dokuLifetimeMinutes(ISO(now + 90_000), now)).toBe(2);
  });

  it('LANTAINYA 1, TIDAK PERNAH 0 — nol berarti "tak pernah mati" di DOKU', () => {
    /*
      ⚠️ Kalau lantai ini hilang, `payment_due_date: 0` terkirim, dan DOKU
      membacanya sebagai "pakai setelan dashboard" — yang sengaja dikosongkan
      selamanya. Link jadi abadi: kebalikan persis dari maksud kodenya.
    */
    const now = Date.now();
    expect(dokuLifetimeMinutes(ISO(now + 5_000), now)).toBe(1);
    expect(dokuLifetimeMinutes(ISO(now), now)).toBe(1);
  });

  it('tenggat yang SUDAH lewat tetap 1, bukan angka negatif', () => {
    // Angka negatif yang lolos ke DOKU adalah galat API, bukan link mati.
    const now = Date.now();
    expect(dokuLifetimeMinutes(ISO(now - 10 * 60_000), now)).toBe(1);
  });

  it('tanggal yang tidak terbaca jatuh ke 60, bukan NaN', () => {
    expect(dokuLifetimeMinutes('bukan-tanggal')).toBe(60);
  });
});

describe('rantai utuh: slotReleaseDeadline → dokuLifetimeMinutes', () => {
  /*
    Yang dijaga di sini adalah SAMBUNGANNYA, bukan dua fungsinya sendiri-sendiri.
    Kedua pemanggil yang diperbaiki 2026-09-17 menyusun persis rantai ini.
  */

  it('reservasi peneliti: umur link = sisa hold, bukan 60 tetap', () => {
    const reservedAt = Date.now() - 45 * 60_000; // hold sudah jalan 45 menit
    const deadline = slotReleaseDeadline({
      slotBookedBy: 'user',
      slotReservedAt: ISO(reservedAt),
    });
    expect(deadline).not.toBeNull();
    expect(dokuLifetimeMinutes(ISO(deadline as number))).toBe(15);
  });

  it('jadwal ADMIN tidak punya tenggat — dan karena itu tidak dikirimi expiredAt', () => {
    /*
      ⚠️ `null` berarti "tidak pernah lepas sendiri", BUKAN "sudah lewat".
      Dua arti itu mudah tertukar, dan tertukarnya akan memberi jadwal admin
      tenggat mendadak yang mematikan link yang memang tidak punya tenggat.
      Pemanggil menerjemahkan `null` jadi "jangan kirim `expiredAt`", yang
      memulangkan perilaku 60 menit.
    */
    const deadline = slotReleaseDeadline({
      slotBookedBy: 'admin',
      slotReservedAt: ISO(Date.now()),
    });
    expect(deadline).toBeNull();
    expect(dokuLifetimeMinutes(undefined)).toBe(60);
  });
});
