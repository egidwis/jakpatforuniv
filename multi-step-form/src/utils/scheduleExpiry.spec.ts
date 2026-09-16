import { describe, it, expect } from 'vitest';
import { expiryPlanFor } from './scheduleExpiry';
import type { ExpirySubject } from './scheduleExpiry';

/*
  Primitif mana yang MELEPAS jadwal ini — dan kenapa salah memilihnya merusak
  jadwal ORANG LAIN di order yang sama.

  ⚠️ INI INTI KESELAMATAN RENCANA HALAMAN TERPUSAT.

  `releaseExpiredSlot(submissionId)` menulis ke `form_submissions`, dan doc-nya
  memperingatkan sendiri: *"untuk order berjadwal banyak, `releaseExpiredSlot`
  akan ikut mematikan tagihan jadwal lain."* Ia aman HANYA untuk ordinal 1 di
  order berjadwal tunggal.

  Padanan berlingkup-satu-baris sudah ada — `cancelSchedule()` — tapi sampai
  sekarang hanya dipakai admin. Halaman per-jadwal wajib memilih dengan benar,
  dan pilihannya tidak boleh diserahkan ke pembaca kode di masa depan.

  ⚠️ Terukur 2026-09-17: 0 dari 25 jadwal ordinal >=2 pernah punya
  `slot_booked_by='user'`. Seluruh perpanjangan dibuat admin, jadi jalur yang
  diuji di sini BELUM PERNAH hidup di produksi. Tes ini satu-satunya bukti
  sebelum baris pertamanya lahir.
*/

const subjectOf = (over: Partial<ExpirySubject> = {}): ExpirySubject => ({
  ordinal: 1,
  siblingCount: 1,
  slotBookedBy: 'user',
  paymentStatus: 'pending',
  ...over,
});

describe('expiryPlanFor — pemilihan primitif', () => {
  it('ordinal 1, jadwal TUNGGAL → releaseExpiredSlot', () => {
    const p = expiryPlanFor(subjectOf({ ordinal: 1, siblingCount: 1 }));
    expect(p.primitive).toBe('releaseExpiredSlot');
  });

  it('ordinal >=2 → cancelSchedule, SELALU', () => {
    // Perpanjangan hidup di `ad_schedules`/`form_submissions_extend`;
    // menulis ke `form_submissions` tidak akan menyentuh barisnya sama sekali
    // DAN merusak jadwal pertama yang mungkin sudah lunas.
    for (const ordinal of [2, 3, 7]) {
      expect(expiryPlanFor(subjectOf({ ordinal })).primitive).toBe('cancelSchedule');
    }
  });

  it('⚠️ ordinal 1 tapi order BERJADWAL BANYAK → cancelSchedule', () => {
    /*
      Jebakan yang paling mudah terlewat. Ordinal-nya 1, jadi naluri pertama
      memilih `releaseExpiredSlot` — tapi order ini punya saudara, dan
      primitif itu menulis ke baris ORDER sehingga tagihan saudaranya ikut
      mati. Yang menentukan BUKAN ordinal semata, melainkan apakah ada
      saudara yang bisa ikut terseret.
    */
    const p = expiryPlanFor(subjectOf({ ordinal: 1, siblingCount: 3 }));
    expect(p.primitive).toBe('cancelSchedule');
  });
});

describe('expiryPlanFor — kapan TIDAK melepas sama sekali', () => {
  it('jadwal ADMIN tidak pernah lepas karena waktu', () => {
    /*
      Aturan `slotHold.ts`: hanya `slot_booked_by === 'user'` yang lepas karena
      waktu. 31 order produksi menunggu di jalur admin — melepasnya otomatis
      akan membatalkan jadwal yang ditetapkan tim tanpa ada yang memintanya.
    */
    for (const by of ['admin', null, undefined]) {
      const p = expiryPlanFor(subjectOf({ slotBookedBy: by }));
      expect(p.primitive).toBe('none');
      expect(p.reason).toBe('admin_hold');
    }
  });

  it('jadwal LUNAS tidak pernah dilepas', () => {
    // Penjaga yang sama berdiri di `cancelSchedule` dan `releaseExpiredSlot`;
    // diulang di sini supaya layar tidak pernah sampai memanggilnya.
    for (const st of ['paid', 'completed']) {
      const p = expiryPlanFor(subjectOf({ paymentStatus: st }));
      expect(p.primitive).toBe('none');
      expect(p.reason).toBe('already_paid');
    }
  });

  it('LUNAS menang atas segalanya, termasuk ordinal >=2', () => {
    const p = expiryPlanFor(subjectOf({ ordinal: 3, paymentStatus: 'paid' }));
    expect(p.primitive).toBe('none');
  });
});

describe('expiryPlanFor — lingkup yang dilaporkan', () => {
  it('cancelSchedule berlingkup SATU baris', () => {
    expect(expiryPlanFor(subjectOf({ ordinal: 2 })).scope).toBe('schedule');
  });

  it('releaseExpiredSlot berlingkup ORDER — dan itu sebabnya ia dibatasi', () => {
    expect(expiryPlanFor(subjectOf({ ordinal: 1, siblingCount: 1 })).scope).toBe('order');
  });

  it('tidak melepas → lingkupnya none', () => {
    expect(expiryPlanFor(subjectOf({ slotBookedBy: 'admin' })).scope).toBe('none');
  });
});
