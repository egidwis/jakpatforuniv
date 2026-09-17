import { describe, it, expect } from 'vitest';
import { lockRollbackDecision } from './lockRollback';

/*
  Yang dijaga di sini adalah satu cabang yang salahnya mahal ke DUA arah:

  - Tidak me-rollback saat seharusnya → jadwal yatim memakan kuota harian,
    dan peneliti diblokir oleh slot yang tidak pernah punya tagihan.
  - Me-rollback saat TIDAK seharusnya → `needs_admin_invoice` adalah SUKSES
    yang lewat blok `catch`; melepasnya membatalkan jadwal sah yang sedang
    menunggu tagihan manual admin.

  Keduanya sampai ke `catch` yang sama, jadi bentuk datanya nyaris identik.
  Itulah alasan keputusannya diangkat jadi fungsi murni.
*/

describe('lockRollbackDecision', () => {
  it('tidak melepas apa pun kalau jadwalnya tidak pernah lahir', () => {
    expect(lockRollbackDecision({ sourceId: null, needsAdminInvoice: false })).toEqual({
      action: 'nothing',
      reason: 'never_created',
    });
  });

  it('melepas jadwal yang lahir tapi tagihannya gagal', () => {
    expect(lockRollbackDecision({ sourceId: 'src-1', needsAdminInvoice: false })).toEqual({
      action: 'release',
      sourceId: 'src-1',
    });
  });

  it('TIDAK melepas saat tagihannya menyusul dari admin', () => {
    /*
      Regresi yang paling mungkin terjadi: seseorang menambahkan rollback di
      blok `catch` tanpa menyadari satu cabang di dalamnya adalah keberhasilan.
    */
    expect(lockRollbackDecision({ sourceId: 'src-1', needsAdminInvoice: true })).toEqual({
      action: 'nothing',
      reason: 'awaiting_admin_invoice',
    });
  });

  it('needs_admin_invoice menang atas sourceId yang ada — urutannya mengikat', () => {
    const d = lockRollbackDecision({ sourceId: 'src-2', needsAdminInvoice: true });
    expect(d.action).toBe('nothing');
  });
});
