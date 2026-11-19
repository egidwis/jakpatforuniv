import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { observeNear, NEAR_VIEWPORT_MARGIN } from './nearViewport';
import { NearViewportImg } from '../components/NearViewportImg';

/*
 * /pages: dulu 5 banner (605 KB) terunduh saat dibuka — loading="lazy" bawaan
 * memuat sampai ±1.250–2.500 px di bawah layar, berebut bandwidth dengan banner
 * pertama (4G lambat: banner pertama 6,1 s; hanya yang terlihat: 4,5 s).
 */
class FakeIO {
    static last: FakeIO | null = null;
    cb: (entries: Array<{ isIntersecting: boolean }>) => void;
    options: { rootMargin?: string };
    observed: unknown[] = [];
    disconnected = false;
    constructor(cb: FakeIO['cb'], options: FakeIO['options']) {
        this.cb = cb;
        this.options = options;
        FakeIO.last = this;
    }
    observe(el: unknown) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
}

afterEach(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    FakeIO.last = null;
});

describe('observeNear', () => {
    it('memanggil onNear SEKALI saat berpotongan (rootMargin ±300 px), lalu berhenti mengamati', () => {
        const onNear = vi.fn();
        const el = {};
        observeNear(el as Element, onNear, FakeIO as unknown as typeof IntersectionObserver);
        const io = FakeIO.last!;
        expect(io.options.rootMargin).toBe(NEAR_VIEWPORT_MARGIN);
        expect(NEAR_VIEWPORT_MARGIN).toBe('300px 0px');
        expect(io.observed).toEqual([el]);
        io.cb([{ isIntersecting: false }]);
        expect(onNear).not.toHaveBeenCalled();
        io.cb([{ isIntersecting: true }]);
        io.cb([{ isIntersecting: true }]);
        expect(onNear).toHaveBeenCalledTimes(1);
        expect(io.disconnected).toBe(true);
    });

    it('tanpa IntersectionObserver (browser lama) → langsung onNear', () => {
        const onNear = vi.fn();
        observeNear({} as Element, onNear, undefined);
        expect(onNear).toHaveBeenCalledTimes(1);
    });

    it('cleanup memutus observer', () => {
        const cleanup = observeNear({} as Element, vi.fn(), FakeIO as unknown as typeof IntersectionObserver);
        cleanup();
        expect(FakeIO.last!.disconnected).toBe(true);
    });
});

describe('NearViewportImg (render awal)', () => {
    const props = { src: '/b.jpg', alt: '', width: 1000, height: 400, className: 'w-full h-full' };

    it('eager → <img src> langsung (kartu pertama = LCP)', () => {
        (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
        const html = renderToStaticMarkup(createElement(NearViewportImg, { ...props, eager: true }));
        expect(html).toContain('src="/b.jpg"');
    });

    it('bukan eager, IO ada → belum ada <img> (placeholder latar kartu yang tampil)', () => {
        (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
        const html = renderToStaticMarkup(createElement(NearViewportImg, { ...props, eager: false }));
        expect(html).not.toContain('<img');
        expect(html).toContain('data-near-viewport');
    });

    it('bukan eager, IO tidak ada → <img> langsung (perilaku lama)', () => {
        const html = renderToStaticMarkup(createElement(NearViewportImg, { ...props, eager: false }));
        expect(html).toContain('src="/b.jpg"');
    });
});
