import { describe, it, expect } from 'vitest';
import { repriceMessage } from './repriceMessage';

const base = { totalCost: 0, subtotal: 0, ppn: 0, orderTotal: 0, scheduleCount: 1 };

describe('repriceMessage', () => {
  it('diam kalau tidak ada masukan harga yang tersentuh', () => {
    expect(repriceMessage(null)).toBeNull();
  });

  it('menyebut harga barunya untuk order berjadwal tunggal', () => {
    expect(repriceMessage({ ...base, totalCost: 399600, orderTotal: 399600 }))
      .toBe('Harga kini Rp 399.600');
  });

  it('memisahkan harga jadwal ke-1 dari total order pada order berjadwal banyak', () => {
    const msg = repriceMessage({
      ...base, totalCost: 288600, orderTotal: 700000, scheduleCount: 2,
    });
    expect(msg).toContain('jadwal ke-1 kini Rp 288.600');
    expect(msg).toContain('total 2 jadwal Rp 700.000');
    // Angka jadwal ke-1 TIDAK boleh dipakai sebagai total order.
    expect(msg).not.toMatch(/^Harga kini/);
  });

  it('order lunas: mengatakan harganya TIDAK berubah, dan menyebut tagihan susulan', () => {
    // Justru kasus yang dulu diam. Kalau baris ini gagar, admin kembali
    // menyimpulkan harga ikut terkoreksi padahal tidak.
    const msg = repriceMessage({ ...base, totalCost: 288600, skipped: 'paid' });
    expect(msg).toBe('Harga tidak diubah — order sudah lunas. Selisihnya perlu tagihan susulan.');
    expect(msg).not.toContain('288.600');
  });
});
