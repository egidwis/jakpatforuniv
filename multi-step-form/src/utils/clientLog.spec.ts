import { describe, it, expect, vi } from 'vitest';
import { buildClientReport, sendClientReport } from './clientLog';

const env = { path: '/login?x=1#t', ua: 'UA', sinceNavMs: 1234.6, proto: 'h3', net: '4g' };

describe('buildClientReport', () => {
    it('Error → message + stack, path tanpa query/hash', () => {
        const err = new Error('meledak');
        const r = buildClientReport({ kind: 'react-boundary', error: err, stage: 'auth' }, env);
        expect(r).toMatchObject({ kind: 'react-boundary', message: 'meledak', stage: 'auth', path: '/login', ua: 'UA', sinceNavMs: 1235, proto: 'h3', net: '4g' });
        expect(r.stack).toContain('meledak');
    });

    it('nilai non-Error tetap terbaca, string dipotong', () => {
        const r = buildClientReport({ kind: 'x', error: 'teks'.repeat(500) }, env);
        expect(r.message!.length).toBeLessThanOrEqual(500);
        expect(buildClientReport({ kind: 'x', error: { foo: 1 } }, env).message).toBe('[object Object]');
        expect(buildClientReport({ kind: 'x' }, env).message).toBeUndefined();
    });

    it('stack dipotong 2000', () => {
        const err = new Error('e');
        err.stack = 's'.repeat(5000);
        expect(buildClientReport({ kind: 'x', error: err }, env).stack!.length).toBe(2000);
    });
});

describe('sendClientReport', () => {
    it('memakai sendBeacon bila ada', () => {
        const beacon = vi.fn(() => true);
        const fetchFn = vi.fn();
        sendClientReport({ kind: 'k' }, { sendBeacon: beacon, fetch: fetchFn });
        expect(beacon).toHaveBeenCalledTimes(1);
        const [url] = beacon.mock.calls[0] as unknown as [string];
        expect(url).toBe('/api/client-log');
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('sendBeacon menolak/tidak ada → fetch keepalive', () => {
        const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
        sendClientReport({ kind: 'k' }, { sendBeacon: () => false, fetch: fetchFn });
        sendClientReport({ kind: 'k' }, { fetch: fetchFn });
        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ method: 'POST', keepalive: true });
    });

    it('tidak pernah melempar', () => {
        expect(() => sendClientReport({ kind: 'k' }, { sendBeacon: () => { throw new Error('x'); } })).not.toThrow();
        expect(() => sendClientReport({ kind: 'k' }, { fetch: () => { throw new Error('x'); } })).not.toThrow();
        expect(() => sendClientReport({ kind: 'k' }, {})).not.toThrow();
    });
});
