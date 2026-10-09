import { describe, expect, it } from 'vitest';
import { validateAdminChat } from './chatGate.js';

const sessionId = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateAdminChat', () => {
  it('meloloskan balasan admin', () => {
    expect(validateAdminChat({ action: 'reply', sessionId, content: 'Halo' })).toBeNull();
  });

  it('menolak pesan kosong', () => {
    expect(validateAdminChat({ action: 'reply', sessionId, content: '   ' })).toMatch(/Pesan/);
  });

  it('meloloskan ambil alih dan kembalikan ke Mimin', () => {
    expect(validateAdminChat({ action: 'mode', sessionId, mode: 'human' })).toBeNull();
    expect(validateAdminChat({ action: 'mode', sessionId, mode: 'ai' })).toBeNull();
  });

  it('menolak mode lain', () => {
    expect(validateAdminChat({ action: 'mode', sessionId, mode: 'staff' })).toMatch(/Mode/);
  });

  it('menolak sesi yang bukan uuid', () => {
    expect(validateAdminChat({ action: 'resolve', sessionId: 'semua', isResolved: true })).toMatch(/Sesi/);
  });
});
