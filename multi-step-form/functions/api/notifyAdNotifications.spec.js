import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost as handleLive } from './notify-ad-live.js';
import { onRequestPost as handleCompleted } from './notify-ad-completed.js';

describe('notify-ad-live & notify-ad-completed', () => {
  let fetchMock;
  const env = {
    CRON_NOTIFY_SECRET: 'secret-123',
    MAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'test-key',
  };

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messageId: 'm-1' }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('menolak request jika ?k= secret tidak valid atau kosong', async () => {
    const req = new Request('https://submit.jakpatforuniv.com/api/notify-ad-live?k=wrong', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const res = await handleLive({ request: req, env });
    expect(res.status).toBe(401);
  });

  it('mengirim email iklan mulai tayang jadwal utama saat ordinal = 1', async () => {
    const req = new Request('https://submit.jakpatforuniv.com/api/notify-ad-live?k=secret-123', {
      method: 'POST',
      body: JSON.stringify({
        email: 'peneliti@ui.ac.id',
        full_name: 'Budi',
        title: 'Survei Transportasi',
        start_date: '2026-09-20T08:00:00.000Z',
        end_date: '2026-09-22T08:00:00.000Z',
        ordinal: 1,
        booking_id: 'DSTSA4E1',
      }),
    });

    const res = await handleLive({ request: req, env });
    expect(res.status).toBe(200);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.subject).toBe('[Jakpat for Univ] Iklan surveimu mulai tayang hari ini 🚀');
    expect(callBody.htmlContent).toContain('Iklan Survei Mulai Ditayangkan! 🚀');
    expect(callBody.htmlContent).toContain('Kuesioner survei <strong>Survei Transportasi</strong> sekarang sudah <strong>mulai aktif ditayangkan</strong>');
  });

  it('mengirim email iklan perpanjangan mulai tayang saat ordinal > 1', async () => {
    const req = new Request('https://submit.jakpatforuniv.com/api/notify-ad-live?k=secret-123', {
      method: 'POST',
      body: JSON.stringify({
        email: 'peneliti@ui.ac.id',
        full_name: 'Budi',
        title: 'Survei Transportasi',
        start_date: '2026-09-25T08:00:00.000Z',
        end_date: '2026-09-27T08:00:00.000Z',
        ordinal: 2,
        booking_id: 'DSTSA4E2',
      }),
    });

    const res = await handleLive({ request: req, env });
    expect(res.status).toBe(200);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.subject).toBe('[Jakpat for Univ] Iklan perpanjangan surveimu mulai tayang hari ini 🚀');
    expect(callBody.htmlContent).toContain('Iklan Perpanjangan Survei Mulai Ditayangkan! 🚀');
    expect(callBody.htmlContent).toContain('Jadwal perpanjangan survei <strong>Survei Transportasi</strong> (Kode: <code>DSTSA4E2</code>)');
  });

  it('mengirim email survei selesai untuk jadwal utama saat ordinal = 1', async () => {
    const req = new Request('https://submit.jakpatforuniv.com/api/notify-ad-completed?k=secret-123', {
      method: 'POST',
      body: JSON.stringify({
        email: 'peneliti@ui.ac.id',
        full_name: 'Budi',
        title: 'Survei Transportasi',
        ordinal: 1,
        booking_id: 'DSTSA4E1',
      }),
    });

    const res = await handleCompleted({ request: req, env });
    expect(res.status).toBe(200);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.subject).toBe('[Jakpat for Univ] Survei Selesai! Waktunya Olah Data di JFU AI Analyzer 📊');
    expect(callBody.htmlContent).toContain('Survei Anda Telah Selesai Ditayangkan! 🎉');
    expect(callBody.htmlContent).toContain('Periode penayangan iklan survei <strong>Survei Transportasi</strong> telah <strong>resmi selesai</strong>');
  });

  it('mengirim email periode perpanjangan selesai saat ordinal > 1', async () => {
    const req = new Request('https://submit.jakpatforuniv.com/api/notify-ad-completed?k=secret-123', {
      method: 'POST',
      body: JSON.stringify({
        email: 'peneliti@ui.ac.id',
        full_name: 'Budi',
        title: 'Survei Transportasi',
        ordinal: 2,
        booking_id: 'DSTSA4E2',
      }),
    });

    const res = await handleCompleted({ request: req, env });
    expect(res.status).toBe(200);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.subject).toBe('[Jakpat for Univ] Periode Perpanjangan Selesai! Waktunya Olah Data di JFU AI Analyzer 📊');
    expect(callBody.htmlContent).toContain('Periode Perpanjangan Selesai Ditayangkan! 🎉');
    expect(callBody.htmlContent).toContain('Periode penayangan iklan perpanjangan survei <strong>Survei Transportasi</strong> (Kode: <code>DSTSA4E2</code>)');
    expect(callBody.htmlContent).toContain('responden tambahan Jakpat telah terkumpul');
  });
});
