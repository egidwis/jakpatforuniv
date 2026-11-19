/**
 * Laporan galat SPA → POST /api/client-log (functions/api/client-log.js) →
 * log Cloudflare Functions. Dulu SPA nol log: layar putih di ponsel tak
 * meninggalkan jejak apa pun.
 *
 * Tanpa PII: hanya path (tanpa query/hash), pesan galat, UA, dan info jaringan.
 * ⚠️ Skrip watchdog inline di index.html mengirim bentuk yang sama tanpa modul ini.
 */

export interface ClientEvent {
    kind: string;
    error?: unknown;
    stage?: string;
    detail?: string;
    persisted?: boolean;
}

export interface ClientEnv {
    path: string;
    ua: string;
    sinceNavMs?: number;
    proto?: string;
    net?: string;
}

export interface ClientReport {
    kind: string;
    message?: string;
    stack?: string;
    stage?: string;
    detail?: string;
    persisted?: boolean;
    path: string;
    ua: string;
    sinceNavMs?: number;
    proto?: string;
    net?: string;
}

const cut = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);

export function buildClientReport(ev: ClientEvent, env: ClientEnv): ClientReport {
    let message: string | undefined;
    let stack: string | undefined;
    if (ev.error instanceof Error) {
        message = ev.error.message;
        stack = ev.error.stack;
    } else if (ev.error !== undefined && ev.error !== null) {
        message = String(ev.error);
    }
    return {
        kind: ev.kind,
        message: cut(message, 500),
        stack: cut(stack, 2000),
        stage: ev.stage,
        detail: cut(ev.detail, 1500),
        persisted: ev.persisted,
        path: env.path.split(/[?#]/)[0],
        ua: env.ua.slice(0, 300),
        sinceNavMs: env.sinceNavMs === undefined ? undefined : Math.round(env.sinceNavMs),
        proto: env.proto,
        net: env.net,
    };
}

interface Transport {
    sendBeacon?: (url: string, data: BodyInit) => boolean;
    fetch?: (url: string, init: RequestInit) => unknown;
}

const ENDPOINT = '/api/client-log';

export function sendClientReport(report: object, transport: Transport): void {
    try {
        const body = JSON.stringify(report);
        try {
            if (transport.sendBeacon && transport.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
        } catch {
            /* jatuh ke fetch */
        }
        const p = transport.fetch?.(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } });
        if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => {});
    } catch {
        /* pelaporan tidak boleh menjadi sumber galat baru */
    }
}

function currentEnv(): ClientEnv {
    const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    return {
        path: location.pathname,
        ua: navigator.userAgent,
        sinceNavMs: performance.now(),
        proto: nav?.nextHopProtocol || undefined,
        net: conn?.effectiveType,
    };
}

/** Kirim satu laporan. Aman dipanggil di mana pun; tidak pernah melempar. */
export function reportClientEvent(ev: ClientEvent): void {
    try {
        if (typeof window === 'undefined') return;
        sendClientReport(buildClientReport(ev, currentEnv()), {
            sendBeacon: navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : undefined,
            fetch: window.fetch ? window.fetch.bind(window) : undefined,
        });
    } catch {
        /* abaikan */
    }
}
