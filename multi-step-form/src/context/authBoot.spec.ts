import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bootSession, AUTH_BOOT_TIMEOUT_MS } from './authBoot';

/*
 * supabase-js menunggu navigator.locks TANPA batas. Kunci yang dipegang dokumen
 * beku (bfcache / tab latar yang dibekukan) membuat getSession() tak pernah
 * selesai → loader selamanya. bootSession menjamin aplikasi tetap lanjut.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

describe('bootSession', () => {
    it('sesi tiba tepat waktu → apply(sesi, "ok") sekali, tanpa laporan', async () => {
        const d = deferred<string | null>();
        const apply = vi.fn();
        const report = vi.fn();
        bootSession(() => d.promise, apply, report);
        d.resolve('S');
        await vi.runAllTimersAsync();
        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply).toHaveBeenCalledWith('S', 'ok');
        expect(report).not.toHaveBeenCalled();
    });

    it('getSession menggantung → setelah batas waktu apply(null, "timeout") + laporan', async () => {
        const apply = vi.fn();
        const report = vi.fn();
        bootSession(() => new Promise(() => {}), apply, report);
        await vi.advanceTimersByTimeAsync(AUTH_BOOT_TIMEOUT_MS - 1);
        expect(apply).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(apply).toHaveBeenCalledWith(null, 'timeout');
        expect(report).toHaveBeenCalledWith('timeout', undefined);
    });

    it('sesi terlambat sesudah timeout tetap diterapkan ("late")', async () => {
        const d = deferred<string | null>();
        const apply = vi.fn();
        bootSession(() => d.promise, apply, vi.fn());
        await vi.advanceTimersByTimeAsync(AUTH_BOOT_TIMEOUT_MS);
        d.resolve('S');
        await vi.runAllTimersAsync();
        expect(apply.mock.calls).toEqual([[null, 'timeout'], ['S', 'late']]);
    });

    it('getSession menolak → apply(null, "error") + laporan galat, timer tak menembak lagi', async () => {
        const err = new Error('lock');
        const apply = vi.fn();
        const report = vi.fn();
        bootSession(() => Promise.reject(err), apply, report);
        await vi.runAllTimersAsync();
        expect(apply.mock.calls).toEqual([[null, 'error']]);
        expect(report).toHaveBeenCalledWith('error', err);
    });

    it('getSession melempar sinkron → tetap "error"', async () => {
        const apply = vi.fn();
        bootSession(() => { throw new Error('sync'); }, apply, vi.fn());
        await vi.runAllTimersAsync();
        expect(apply.mock.calls).toEqual([[null, 'error']]);
    });

    it('cancel() → tak ada apply sesudahnya', async () => {
        const d = deferred<string | null>();
        const apply = vi.fn();
        const cancel = bootSession(() => d.promise, apply, vi.fn());
        cancel();
        d.resolve('S');
        await vi.runAllTimersAsync();
        expect(apply).not.toHaveBeenCalled();
    });
});
