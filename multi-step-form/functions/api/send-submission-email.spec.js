import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Handler SUNGGUHAN; pengirim email dan jaringan dipalsukan.
const sent = [];
vi.mock('./_mail.js', () => ({
  sendMail: vi.fn(async (_env, mail) => { sent.push(mail); return { ok: true, id: 'm1', provider: 'test' }; }),
}));

const { onRequestPost } = await import('./send-submission-email.js');

const ENV = { VITE_SUPABASE_URL: 'https://db.example.test', VITE_SUPABASE_ANON_KEY: 'anon' };

const call = (body) => onRequestPost({
  request: new Request('https://x.test/api/send-submission-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

function network(handler) {
  global.fetch = vi.fn(async (url, init) => handler(String(url), init));
}

beforeEach(() => { sent.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('/api/send-submission-email — mode libur (sql/120)', () => {
  it('libur: kotak libur ada, pesan admin & nama di-escape, tabel baru dibaca dengan anon key', async () => {
    let seen;
    network((url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify([{ holiday_date: '2026-12-24', label: 'Libur <b>Natal</b> & "Tahun Baru"' }]), { status: 200 });
    });
    const res = await call({ name: 'Sintya <script>x</script>', email: 'p@x.id' });
    expect(res.status).toBe(200);
    expect(seen.url).toContain('/rest/v1/JFU_operational_holidays?');
    expect(seen.url).toContain('is_active=eq.true');
    expect(seen.init.headers.apikey).toBe('anon');
    const html = sent[0].html;
    expect(html).toContain('tim admin sedang libur');
    expect(html).toContain('Libur &lt;b&gt;Natal&lt;/b&gt; &amp; &quot;Tahun Baru&quot;');
    expect(html).not.toContain('<b>Natal</b>');
    expect(html).toContain('Sintya &lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('segera menghubungi');
  });

  it('tidak libur: email lama apa adanya', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id' });
    expect(sent[0].html).not.toContain('tim admin sedang libur');
    expect(sent[0].html).toContain('Kami akan segera menghubungi Kakak kembali');
  });

  it('status libur gagal dibaca: email TETAP terkirim, versi biasa', async () => {
    network(() => { throw new Error('network down'); });
    const res = await call({ name: 'Sintya', email: 'p@x.id' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).not.toContain('tim admin sedang libur');
  });

  it('HTTP galat dari PostgREST (mis. sebelum sql/120): email biasa', async () => {
    network(() => new Response('{"message":"relation does not exist"}', { status: 404 }));
    const res = await call({ name: 'Sintya', email: 'p@x.id' });
    expect(res.status).toBe(200);
    expect(sent[0].html).not.toContain('tim admin sedang libur');
  });
});
