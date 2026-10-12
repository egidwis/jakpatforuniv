import { describe, it, expect, vi } from 'vitest';
import { createInFlightGate } from './inFlightGate';

/*
  Penerbitan tagihan otomatis sesudah kunci dan klik "Bayar Sekarang" selama
  tagihan itu disiapkan harus menunggu permintaan YANG SAMA — klik kedua yang
  menerbitkan tagihan sendiri = dua link DOKU untuk satu jadwal.
*/

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createInFlightGate — satu permintaan berjalan, semua menunggu', () => {
  it('panggilan selama permintaan berjalan TIDAK memanggil fn lagi', async () => {
    const gate = createInFlightGate<string>();
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);

    const auto = gate.run(fn);   // pemicu otomatis sesudah kunci
    const click = gate.run(fn);  // peneliti menekan Bayar selagi menunggu
    expect(gate.busy).toBe(true);

    d.resolve('ok');
    await expect(auto).resolves.toBe('ok');
    await expect(click).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sesudah selesai, panggilan berikutnya memulai permintaan baru', async () => {
    const gate = createInFlightGate<number>();
    let n = 0;
    const fn = vi.fn(async () => ++n);

    await gate.run(fn);
    expect(gate.busy).toBe(false);
    await expect(gate.run(fn)).resolves.toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('kegagalan sampai ke SEMUA penunggu, lalu gerbang terbuka lagi', async () => {
    const gate = createInFlightGate<string>();
    const d = deferred<string>();
    const a = gate.run(() => d.promise);
    const b = gate.run(() => Promise.resolve('tidak dipanggil'));

    d.reject(new Error('DOKU 500'));
    await expect(a).rejects.toThrow('DOKU 500');
    await expect(b).rejects.toThrow('DOKU 500');
    expect(gate.busy).toBe(false);
    await expect(gate.run(async () => 'coba lagi')).resolves.toBe('coba lagi');
  });

  it('fn yang melempar sinkron tetap jadi penolakan, bukan exception lepas', async () => {
    const gate = createInFlightGate<string>();
    await expect(gate.run(() => { throw new Error('belum termuat'); })).rejects.toThrow('belum termuat');
    expect(gate.busy).toBe(false);
  });
});
