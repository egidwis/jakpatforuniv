import { describe, it, expect, vi } from 'vitest';
import { importWithReload, RELOAD_MARKER_KEY } from './lazyRoute';

/**
 * Setelah deploy, nama chunk lama (hash) hilang dari server. Tab yang dibuka
 * sebelum deploy lalu menavigasi ke rute lazy akan gagal `import()`. Penanganan:
 * muat ulang SEKALI (mengambil index.html baru); bila masih gagal dalam 10 detik,
 * lempar ke RouteErrorBoundary — jangan berputar reload tanpa henti.
 */
function memoryStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
        getItem: (k: string) => (k in data ? data[k] : null),
        setItem: (k: string, v: string) => { data[k] = v; },
        removeItem: (k: string) => { delete data[k]; },
        data,
    };
}

describe('importWithReload', () => {
    it('sukses: modul diteruskan, tanpa reload', async () => {
        const reload = vi.fn();
        const mod = { X: 1 };
        await expect(importWithReload(() => Promise.resolve(mod), { storage: memoryStorage(), reload, now: () => 0 })).resolves.toBe(mod);
        expect(reload).not.toHaveBeenCalled();
    });

    it('gagal pertama: tandai lalu reload sekali (promise tak pernah selesai)', async () => {
        const storage = memoryStorage();
        const reload = vi.fn();
        const p = importWithReload(() => Promise.reject(new Error('chunk')), { storage, reload, now: () => 50_000 });
        let settled = false;
        p.then(() => { settled = true; }, () => { settled = true; });
        await new Promise((r) => setTimeout(r, 0));
        expect(reload).toHaveBeenCalledTimes(1);
        expect(storage.data[RELOAD_MARKER_KEY]).toBe('50000');
        expect(settled).toBe(false);
    });

    it('gagal lagi < 10 s setelah reload: lempar, tanpa reload kedua', async () => {
        const storage = memoryStorage({ [RELOAD_MARKER_KEY]: '50000' });
        const reload = vi.fn();
        await expect(importWithReload(() => Promise.reject(new Error('chunk')), { storage, reload, now: () => 55_000 })).rejects.toThrow('chunk');
        expect(reload).not.toHaveBeenCalled();
    });

    it('penanda lama (> 10 s): boleh reload lagi', async () => {
        const storage = memoryStorage({ [RELOAD_MARKER_KEY]: '1000' });
        const reload = vi.fn();
        importWithReload(() => Promise.reject(new Error('chunk')), { storage, reload, now: () => 60_000 });
        await new Promise((r) => setTimeout(r, 0));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('storage melempar (mode privat): lempar galat aslinya, jangan reload membabi buta', async () => {
        const storage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
        const reload = vi.fn();
        await expect(importWithReload(() => Promise.reject(new Error('chunk')), { storage, reload, now: () => 0 })).rejects.toThrow('chunk');
        expect(reload).not.toHaveBeenCalled();
    });
});
