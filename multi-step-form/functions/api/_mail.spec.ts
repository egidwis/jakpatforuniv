import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// @ts-expect-error — adapter ditulis JS polos (Pages Functions), sengaja tanpa tipe.
import { sendMail } from './_mail.js';

const MSG = { to: 'peneliti@example.com', subject: 'Halo', html: '<p>Hai</p>' };
const okJson = (body: unknown = {}) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => '' });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okJson({ messageId: 'm-1', id: 'r-1' }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const urlOf = (call: number) => String(fetchMock.mock.calls[call][0]);
const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1].body));

describe('pemilihan provider', () => {
  it('memakai MAIL_PROVIDER kalau diisi', async () => {
    const r = await sendMail({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k' }, MSG);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('brevo');
    expect(urlOf(0)).toContain('api.brevo.com');
  });

  // Ini kegagalan nyata 2026-08-18: kunci Brevo terpasang, sakelarnya lupa,
  // dan default lama ('resend') membuat semua email gagal sambil menuduh
  // kunci yang memang sudah sengaja dicabut.
  it('menebak provider kalau MAIL_PROVIDER kosong dan hanya SATU yang berkredensial', async () => {
    const r = await sendMail({ BREVO_API_KEY: 'k' }, MSG);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('brevo');
  });

  it('TIDAK menebak kalau lebih dari satu provider berkredensial', async () => {
    const r = await sendMail({ BREVO_API_KEY: 'k', RESEND_API_KEY: 'r' }, MSG);
    expect(r.provider).toBe('resend');
    expect(console.error).toHaveBeenCalled();
  });

  it('gagal bersih — bukan melempar — kalau kredensialnya tidak ada sama sekali', async () => {
    const r = await sendMail({ MAIL_PROVIDER: 'brevo' }, MSG);
    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain('BREVO_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('bentuk payload per provider', () => {
  it('Brevo memakai sender/htmlContent dan header api-key', async () => {
    await sendMail({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'kunci' }, MSG);
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['api-key']).toBe('kunci');
    const body = bodyOf(0);
    expect(body.sender.address).toBeUndefined();
    expect(body.sender.email).toBe('noreply@jakpatforuniv.com');
    expect(body.to).toEqual([{ email: 'peneliti@example.com' }]);
    expect(body.htmlContent).toBe('<p>Hai</p>');
  });

  // Cloudflare memakai `address`, BUKAN `email` — tertukar menghasilkan 400
  // yang pesannya tidak menyebut penyebabnya.
  it('Cloudflare memakai from.address dan Bearer token', async () => {
    await sendMail(
      { MAIL_PROVIDER: 'cloudflare', CF_EMAIL_API_TOKEN: 't', CF_ACCOUNT_ID: 'acc' },
      MSG
    );
    expect(urlOf(0)).toContain('/accounts/acc/email/sending/send');
    const body = bodyOf(0);
    expect(body.from.address).toBe('noreply@jakpatforuniv.com');
    expect(body.to).toEqual([{ address: 'peneliti@example.com' }]);
  });

  it('MAIL_FROM memindahkan alamat pengirim tanpa menyentuh kode', async () => {
    await sendMail(
      { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', MAIL_FROM: 'JFU <noreply@mail.jakpatforuniv.com>' },
      MSG
    );
    expect(bodyOf(0).sender).toEqual({ email: 'noreply@mail.jakpatforuniv.com', name: 'JFU' });
  });
});

describe('kegagalan', () => {
  it('provider menolak -> ok:false, tanpa melempar', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'nope' }), text: async () => '' });
    const r = await sendMail({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k' }, MSG);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('jaringan putus tetap dikembalikan sebagai hasil, bukan exception', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const r = await sendMail({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k' }, MSG);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ECONNRESET');
  });

  it('cadangan dipakai saat yang utama gagal', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}), text: async () => '' })
      .mockResolvedValueOnce(okJson({ id: 'r-2' }));
    const r = await sendMail(
      { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', MAIL_PROVIDER_FALLBACK: 'resend', RESEND_API_KEY: 'r' },
      MSG
    );
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('resend');
    expect(r.recoveredFrom).toBe('brevo');
  });

  it('dua-duanya gagal -> yang dilaporkan yang UTAMA', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}), text: async () => '' });
    const r = await sendMail(
      { MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', MAIL_PROVIDER_FALLBACK: 'resend', RESEND_API_KEY: 'r' },
      MSG
    );
    expect(r.ok).toBe(false);
    expect(r.provider).toBe('brevo');
  });
});
