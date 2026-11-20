import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '@/i18n/LanguageContext';
import type { WebinarEventView } from '@/utils/webinarApi';
import { WebinarFloatCardView } from './WebinarHomeEntries';

const SAMPLE_EVENT: WebinarEventView = {
    id: 'evt-1',
    slug: 'mau-skripsi-apa',
    title: 'Mau Skripsi Apa?',
    summary: 'Tips menentukan topik riset',
    poster_url: 'https://jakpatforuniv.com/cdn/webinar-public/poster.png',
    speakers: [],
    kind: 'live',
    state: 'on_sale',
    badge: 'Dijual',
    tone: 'on_sale',
    note: null,
    can_buy: true,
    buy_label: 'Beli tiket',
    buy_url: 'https://jakpatforuniv.com/dashboard/webinar/beli/mau-skripsi-apa',
    detail_url: '/webinar/mau-skripsi-apa',
    price_label: 'Rp 49.000',
    schedule_label: 'Kam, 26 Nov 2026 · 10.00–11.30 WIB',
    kind_label: null,
    source_event_id: null,
    short_date: '26 Nov',
    starts_at: '2026-11-26T03:00:00Z',
    duration_minutes: 90,
    recording_minutes: null,
    recording_published_at: null,
    seconds_until_open: null,
    seats_label: 'Sisa 8 kursi',
    benefits: [],
};

function renderCard(props: { event?: WebinarEventView; variant?: 'sidebar' | 'floating'; hasMobileFab?: boolean } = {}, lang: 'id' | 'en' = 'id') {
    vi.stubGlobal('localStorage', {
        getItem: () => lang,
        setItem: () => {},
        removeItem: () => {},
    });
    return renderToStaticMarkup(
        createElement(
            LanguageProvider,
            null,
            createElement(WebinarFloatCardView, {
                event: props.event ?? SAMPLE_EVENT,
                onClose: () => {},
                variant: props.variant,
                hasMobileFab: props.hasMobileFab,
            }),
        ),
    );
}

describe('WebinarFloatCardView', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: () => 'id',
            setItem: () => {},
            removeItem: () => {},
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('mode sidebar tampil in-flow di bawah Buat Order Baru dengan tombol tutup dan isi webinar', () => {
        const html = renderCard({ variant: 'sidebar' });
        expect(html).not.toContain('fixed left-3');
        expect(html).toContain('Tutup pengumuman webinar');
        expect(html).toContain('Dijual');
        expect(html).toContain('Sisa 8 kursi');
        expect(html).toContain('Mau Skripsi Apa?');
        expect(html).toContain('href="/webinar/mau-skripsi-apa"');
        expect(html).toContain('Rp 49.000');
        expect(html).toContain('Lihat →');
    });

    it('mode floating menaikkan posisi bawah di ponsel saat FAB Order baru tampil agar tidak bertumpuk', () => {
        const html = renderCard({ variant: 'floating', hasMobileFab: true });
        expect(html).toContain('fixed left-3');
        expect(html).toContain('+4rem)]');
    });

    it('mendukung bahasa Inggris', () => {
        const html = renderCard({}, 'en');
        expect(html).toContain('Dismiss webinar announcement');
        expect(html).toContain('View →');
    });
});
