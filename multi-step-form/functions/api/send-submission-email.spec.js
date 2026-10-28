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

describe('/api/send-submission-email — mode libur (sql/122)', () => {
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

  it('HTTP galat dari PostgREST (mis. sebelum sql/122): email biasa', async () => {
    network(() => new Response('{"message":"relation does not exist"}', { status: 404 }));
    const res = await call({ name: 'Sintya', email: 'p@x.id' });
    expect(res.status).toBe(200);
    expect(sent[0].html).not.toContain('tim admin sedang libur');
  });
});

describe('/api/send-submission-email — varian tutup reservasi mandiri (sql/125)', () => {
  it('kind admin_schedule: lolos review otomatis, tim menjadwalkan maks 1 hari kerja', async () => {
    network(() => new Response('[]', { status: 200 }));
    const res = await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule' });
    expect(res.status).toBe(200);
    expect(sent[0].subject).toContain('tim kami menjadwalkan');
    const html = sent[0].html;
    expect(html).toContain('lolos review otomatis');
    expect(html).toContain('menetapkan tanggal tayang');
    expect(html).toContain('maksimal 1 hari kerja');
    expect(html).not.toContain('akan kami review');
  });

  it('kind admin_schedule saat libur: janji bergeser ke "setelah tim kembali", pesan admin di-escape', async () => {
    network(() => new Response(JSON.stringify([{ holiday_date: '2026-12-24', label: 'Libur <b>Natal</b>' }]), { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule' });
    const html = sent[0].html;
    expect(html).toContain('setelah tim kembali');
    expect(html).toContain('Libur &lt;b&gt;Natal&lt;/b&gt;');
    expect(html).not.toContain('maksimal 1 hari kerja');
    expect(html).not.toContain('Review akan kami kerjakan');
  });

  it('kind tak dikenal: email review biasa', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'apa-saja' });
    expect(sent[0].html).toContain('akan kami review');
  });
});

describe('/api/send-submission-email — kuota penuh, tim yang menjadwalkan (27 Okt 2026)', () => {
  it('reason full (Iklan): sebab = penuh, bukan reservasi ditutup', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule', reason: 'full' });
    const html = sent[0].html;
    expect(html).toContain('sudah penuh');
    expect(html).toContain('menetapkan tanggal tayang terdekat');
    expect(html).toContain('maksimal 1 hari kerja');
    expect(html).not.toContain('reservasi mandiri sedang ditutup');
    expect(html).not.toContain('akan kami review');
  });

  it('reason full (Kilat): gelombang terdekat, tanpa kosakata iklan', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule', reason: 'full', product: 'kilat' });
    const html = sent[0].html;
    expect(html).toContain('menugaskan gelombang push terdekat');
    expect(html.toLowerCase()).not.toContain('iklan');
    expect(html).not.toContain('ditutup');
  });

  it('reason full saat libur: janji bergeser ke "setelah tim kembali"', async () => {
    network(() => new Response(JSON.stringify([{ holiday_date: '2026-12-24', label: 'Libur' }]), { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule', reason: 'full' });
    expect(sent[0].html).toContain('sudah penuh');
    expect(sent[0].html).toContain('setelah tim kembali');
  });

  it('reason tak dikenal: teks reservasi ditutup seperti dulu', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule', reason: '<script>' });
    expect(sent[0].html).toContain('reservasi mandiri sedang ditutup');
  });
});

describe('/api/send-submission-email — produk Kilat Survei', () => {
  it('review manual: nama produk Kilat Survei, tanpa kosakata iklan', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', product: 'kilat' });
    expect(sent[0].subject).toContain('Form Order Kilat Survei');
    expect(sent[0].html).toContain('push Kilat Survei');
    expect(sent[0].html.toLowerCase()).not.toContain('iklan');
  });

  it('admin_schedule: tim menugaskan gelombang, bukan tanggal tayang', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', kind: 'admin_schedule', product: 'kilat' });
    expect(sent[0].subject).toBe('Pesanan Kilat Survei diterima — tim kami menugaskan gelombang 🗓️');
    expect(sent[0].html).toContain('menugaskan gelombang push');
    expect(sent[0].html.toLowerCase()).not.toContain('iklan');
  });

  it('libur: kotak libur menyebut gelombang Kilat, bukan iklan terjadwal', async () => {
    network(() => new Response(JSON.stringify([{ holiday_date: '2026-12-24', label: 'Libur' }]), { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id', product: 'kilat' });
    expect(sent[0].html).toContain('Gelombang Kilat Survei kami tugaskan setelah tim kembali');
    expect(sent[0].html.toLowerCase()).not.toContain('iklan');
  });

  it('tanpa product: email Iklan seperti dulu', async () => {
    network(() => new Response('[]', { status: 200 }));
    await call({ name: 'Sintya', email: 'p@x.id' });
    expect(sent[0].subject).toContain('Form Order Iklan');
  });
});
