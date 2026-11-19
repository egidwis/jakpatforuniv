import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest, __resetClientLogLimiter } from './client-log.js';

/*
  /api/client-log — satu-satunya jejak galat SPA (sebelumnya nol log; layar
  putih di ponsel tak meninggalkan apa pun). Handler SUNGGUHAN dijalankan.
*/

const call = (init = {}, ip = '1.1.1.1') =>
  onRequest({
    request: new Request('https://jakpatforuniv.com/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'cf-connecting-ip': ip, origin: 'https://jakpatforuniv.com', ...(init.headers || {}) },
      ...init,
    }),
    env: {},
  });

const valid = { kind: 'boot-watchdog', message: 'React belum ter-mount 12 s', path: '/login', stage: 'html', proto: 'h3' };

let logged;
beforeEach(() => {
  __resetClientLogLimiter();
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => { logged.push(a.join(' ')); });
});
afterEach(() => vi.restoreAllMocks());

describe('/api/client-log', () => {
  it('POST valid → 204 dan satu baris JSON di console.error', async () => {
    const res = await call({ body: JSON.stringify(valid) });
    expect(res.status).toBe(204);
    expect(logged).toHaveLength(1);
    const line = JSON.parse(logged[0]);
    expect(line).toMatchObject({ tag: 'client-log', kind: 'boot-watchdog', path: '/login', stage: 'html', proto: 'h3' });
  });

  it('GET → 405', async () => {
    const res = await onRequest({ request: new Request('https://jakpatforuniv.com/api/client-log'), env: {} });
    expect(res.status).toBe(405);
  });

  it('body kosong / bukan JSON / tanpa kind → 400, tanpa log', async () => {
    for (const body of ['', '{rusak', JSON.stringify({ message: 'x' }), JSON.stringify([1])]) {
      expect((await call({ body })).status).toBe(400);
    }
    expect(logged).toHaveLength(0);
  });

  it('body > 8 KB → 413, tanpa log', async () => {
    const res = await call({ body: JSON.stringify({ ...valid, message: 'x'.repeat(9000) }) });
    expect(res.status).toBe(413);
    expect(logged).toHaveLength(0);
  });

  it('kolom dipotong & disaring: hanya kolom dikenal, string dipendekkan, query/hash path dibuang', async () => {
    await call({ body: JSON.stringify({ ...valid, stack: 's'.repeat(5000), path: '/x?token=rahasia#access_token=a', email: 'a@b.c', extra: 1 }) });
    const line = JSON.parse(logged[0]);
    expect(line.stack.length).toBeLessThanOrEqual(2000);
    expect(line.path).toBe('/x');
    expect(line).not.toHaveProperty('email');
    expect(line).not.toHaveProperty('extra');
  });

  it('origin asing → 403', async () => {
    const res = await call({ body: JSON.stringify(valid), headers: { origin: 'https://jahat.example' } });
    expect(res.status).toBe(403);
    expect(logged).toHaveLength(0);
  });

  it('batas per IP: maks 20 per menit, sisanya 429 tanpa log', async () => {
    for (let i = 0; i < 20; i++) expect((await call({ body: JSON.stringify(valid) })).status).toBe(204);
    expect((await call({ body: JSON.stringify(valid) })).status).toBe(429);
    expect(logged).toHaveLength(20);
    // IP lain tidak terpengaruh.
    expect((await call({ body: JSON.stringify(valid) }, '2.2.2.2')).status).toBe(204);
  });
});
