import { describe, it, expect, vi } from 'vitest';
import { tidyTranslation, translateAwayLabel } from './holidaysTranslate.js';

const ENV = { OPENROUTER_API_KEY: 'or-key' };
const reply = (content, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));

describe('translateAwayLabel', () => {
  it('sukses: model & kunci yang sama dengan audit-submission, hasil dirapikan', async () => {
    const fetchImpl = reply('"Christmas holiday. We\'ll be back Monday, Dec 29."\n');
    expect(await translateAwayLabel(ENV, 'Libur Natal. Kami kembali Senin, 29 Des.', { fetchImpl }))
      .toBe("Christmas holiday. We'll be back Monday, Dec 29.");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer or-key');
    expect(JSON.parse(init.body).model).toBe('google/gemini-2.5-flash-lite');
  });

  it('HTTP galat → null', async () => {
    expect(await translateAwayLabel(ENV, 'Libur', { fetchImpl: reply('x', 500) })).toBeNull();
  });

  it('lewat batas waktu → null (permintaan dibatalkan)', async () => {
    const fetchImpl = vi.fn((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    expect(await translateAwayLabel(ENV, 'Libur', { fetchImpl, timeoutMs: 10 })).toBeNull();
  });

  it('teks kosong atau kunci tidak ada → null tanpa memanggil jaringan', async () => {
    const fetchImpl = reply('x');
    expect(await translateAwayLabel(ENV, '   ', { fetchImpl })).toBeNull();
    expect(await translateAwayLabel({}, 'Libur', { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('tidyTranslation', () => {
  it('kutip pembungkus & baris baru dibuang', () => {
    expect(tidyTranslation('“Back on Monday.”')).toBe('Back on Monday.');
    expect(tidyTranslation('Line one\n\nline two')).toBe('Line one line two');
  });

  it('dipotong ≤160 (cermin CHECK label_en sql/120)', () => {
    const out = tidyTranslation('a'.repeat(400));
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it('kosong → null', () => {
    expect(tidyTranslation('  "" ')).toBeNull();
    expect(tidyTranslation(undefined)).toBeNull();
  });
});
