import { describe, it, expect } from 'vitest';
import { claimRow, claimToken } from './_claim.js';
import { postgrestTable } from '../_fixtures/postgrestTable.js';

const BASE = 'https://db.example.test';
const T = Date.parse('2026-11-05T05:47:04.630Z');
const iso = (ms) => new Date(ms).toISOString();

function harness(seed) {
  const table = postgrestTable(seed);
  const calls = [];
  const sb = { url: BASE, headers: { apikey: 'k' } };
  const sbFetch = async (url, init = {}, label) => {
    calls.push({ url, method: (init.method || 'GET').toUpperCase(), prefer: new Headers(init.headers || {}).get('Prefer') });
    const res = table.respond(url, init);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    return res;
  };
  const claim = (over = {}) => claimRow({
    sb,
    sbFetch,
    table: 'webinar_orders',
    match: 'id=eq.o1',
    where: 'status=eq.paid',
    column: 'claimed_at',
    staleBefore: iso(T - 10 * 60_000),
    select: 'id,status',
    now: new Date(T),
    label: 'webinar_orders (uji)',
    ...over,
  });
  return { table, calls, sb, sbFetch, claim };
}

describe('emulator PostgREST meniru perilaku produksi 5 Nov', () => {
  it('PATCH ber-or= dengan representasi: baris berubah, balasan kosong', async () => {
    const table = postgrestTable([{ id: 'o1', claimed_at: null }]);
    const res = table.respond(
      `${BASE}/rest/v1/webinar_orders?id=eq.o1&or=(claimed_at.is.null,claimed_at.lt.${encodeURIComponent(iso(T - 600_000))})`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ claimed_at: iso(T) }) },
    );
    expect(await res.json()).toEqual([]);
    expect(res.headers.get('Content-Range')).toBe('*/*');
    expect(table.rows[0].claimed_at).toBe(iso(T));
  });

  it('PATCH dengan filter biasa: baris dikembalikan', async () => {
    const table = postgrestTable([{ id: 'o1', payment_url: null }]);
    const res = table.respond(`${BASE}/rest/v1/webinar_orders?id=eq.o1`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ payment_url: 'https://pay' }),
    });
    expect(await res.json()).toHaveLength(1);
    expect(res.headers.get('Content-Range')).toBe('0-0/*');
  });
});

describe('claimToken', () => {
  it('enam digit pecahan detik; tiga pertama = milidetik', () => {
    const token = claimToken(new Date(T), () => '123');
    expect(token).toBe('2026-11-05T05:47:04.630123Z');
    expect(claimToken(new Date(T))).toMatch(/^2026-11-05T05:47:04\.630\d{3}Z$/);
  });
});

describe('claimRow', () => {
  it('baris bebas: menang, mendapat kolom yang diminta saja, dan token tersimpan', async () => {
    const { table, calls, claim } = harness([{ id: 'o1', status: 'paid', claimed_at: null, secret: 'x' }]);
    const won = await claim();
    expect(won.row).toEqual({ id: 'o1', status: 'paid' });
    expect(table.rows[0].claimed_at).toBe(won.token);

    const [patch, readBack] = calls;
    expect(patch.method).toBe('PATCH');
    expect(patch.prefer).toBe('return=minimal');
    expect(patch.url).toContain('id=eq.o1&status=eq.paid&or=(claimed_at.is.null,claimed_at.lt.');
    expect(readBack.method).toBe('GET');
    expect(readBack.url).toContain(`claimed_at=eq.${encodeURIComponent(won.token)}`);
  });

  it('klaim yang baru dipegang pihak lain: kalah, baris tidak berubah', async () => {
    const held = iso(T - 5 * 60_000);
    const { table, claim } = harness([{ id: 'o1', status: 'paid', claimed_at: held }]);
    expect(await claim()).toBeNull();
    expect(table.rows[0].claimed_at).toBe(held);
  });

  it('klaim basi (lebih dari 10 menit): diambil alih', async () => {
    const { table, claim } = harness([{ id: 'o1', status: 'paid', claimed_at: iso(T - 11 * 60_000) }]);
    const won = await claim();
    expect(won).not.toBeNull();
    expect(table.rows[0].claimed_at).toBe(won.token);
  });

  it('baris tidak memenuhi syarat: null', async () => {
    const { table, claim } = harness([{ id: 'o1', status: 'pending', claimed_at: null }]);
    expect(await claim()).toBeNull();
    expect(table.rows[0].claimed_at).toBeNull();
  });

  it('dua klaim bersamaan: tepat satu menang', async () => {
    const { claim } = harness([{ id: 'o1', status: 'paid', claimed_at: null }]);
    const results = await Promise.all([claim({ now: new Date(T) }), claim({ now: new Date(T + 1) })]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('database gagal: melempar dengan label', async () => {
    const sbFetch = async (url, init, label) => { throw new Error(`${label} HTTP 500`); };
    await expect(claimRow({
      sb: { url: BASE, headers: {} }, sbFetch, table: 't', match: 'id=eq.1', column: 'c',
      staleBefore: iso(T), select: 'id', label: 't (uji)',
    })).rejects.toThrow('PATCH t (uji) HTTP 500');
  });
});
