import { describe, it, expect, vi } from 'vitest';
import {
  MAX_RECORDING_BYTES, PART_SIZE, WATERMARK_SPOTS, validateRecordingFile, planParts, uploadRecording,
  watermarkSpot, formatBytes, formatEta, validateMaterialFile, materialPath, materialFileLabel, MAX_MATERIAL_BYTES,
} from './webinarRecording';

const MiB = 1024 ** 2;

describe('validateRecordingFile', () => {
  it('hanya MP4 ≤ 4 GB, tidak kosong', () => {
    expect(validateRecordingFile({ name: 'Rekaman.MP4', size: 400 * MiB, type: 'video/mp4' })).toBeNull();
    expect(validateRecordingFile({ name: 'a.mp4', size: 10, type: '' })).toBeNull();
    expect(validateRecordingFile({ name: 'a.mov', size: 10, type: 'video/quicktime' })).toMatch(/MP4/);
    expect(validateRecordingFile({ name: 'a.mp4', size: MAX_RECORDING_BYTES + 1, type: 'video/mp4' })).toMatch(/4 GB/);
    expect(validateRecordingFile({ name: 'a.mp4', size: 0, type: 'video/mp4' })).toMatch(/kosong/);
  });
});

describe('planParts', () => {
  it('bagian 50 MiB sama besar kecuali terakhir', () => {
    const parts = planParts(120 * MiB);
    expect(parts).toEqual([
      { partNumber: 1, start: 0, end: 50 * MiB },
      { partNumber: 2, start: 50 * MiB, end: 100 * MiB },
      { partNumber: 3, start: 100 * MiB, end: 120 * MiB },
    ]);
  });

  it('berkas kecil = satu bagian; tepat kelipatan tanpa bagian kosong', () => {
    expect(planParts(3 * MiB)).toEqual([{ partNumber: 1, start: 0, end: 3 * MiB }]);
    expect(planParts(100 * MiB)).toHaveLength(2);
  });

  it('4 GB tetap di bawah 10.000 bagian, dan semua bagian kecuali terakhir ≥ 5 MiB', () => {
    const parts = planParts(MAX_RECORDING_BYTES);
    expect(parts.length).toBeLessThanOrEqual(10_000);
    expect(parts.slice(0, -1).every((p) => p.end - p.start === PART_SIZE)).toBe(true);
    expect(parts[parts.length - 1].end).toBe(MAX_RECORDING_BYTES);
  });
});

describe('watermarkSpot', () => {
  it('deterministik per seed & tick, selalu salah satu dari 6 titik', () => {
    for (let t = 0; t < 50; t++) {
      const a = watermarkSpot('7F3A', t);
      expect(watermarkSpot('7F3A', t)).toEqual(a);
      expect(WATERMARK_SPOTS).toContainEqual(a);
    }
  });

  it('titik selalu berganti antar-tick berurutan', () => {
    for (const seed of ['7F3A', 'tegar@jakpat.net · 91B2', '']) {
      for (let t = 0; t < 100; t++) expect(watermarkSpot(seed, t + 1)).not.toEqual(watermarkSpot(seed, t));
    }
  });

  it('seed berbeda → urutan berbeda', () => {
    const seq = (s: string) => Array.from({ length: 12 }, (_, t) => WATERMARK_SPOTS.indexOf(watermarkSpot(s, t))).join('');
    expect(seq('akun-a · 1111')).not.toBe(seq('akun-b · 2222'));
  });
});

describe('format', () => {
  it('ukuran & sisa waktu', () => {
    expect(formatBytes(412 * MiB)).toBe('412 MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1,5 GB');
    expect(formatEta(30)).toBe('< 1 mnt');
    expect(formatEta(185)).toBe('±3 mnt');
    expect(formatEta(Infinity)).toBe('');
  });
});

describe('uploadRecording', () => {
  const fakeFile = (size: number) => ({
    name: 'Rekaman SPSS.mp4',
    size,
    slice: (start: number, end: number) => new Blob([new Uint8Array(end - start)]),
  });

  function api(overrides: Record<string, unknown> = {}) {
    return Object.assign({
      start: vi.fn(async () => ({ key: 'rekaman/k.mp4', uploadId: 'UP', partSize: 50 * MiB })),
      partUrls: vi.fn(async ({ partNumbers }: { key: string; uploadId: string; partNumbers: number[] }) => partNumbers.map((n) => ({ partNumber: n, url: `https://r2.test/p${n}` }))),
      complete: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    }, overrides);
  }

  it('semua bagian terunggah, ETag dari header, complete dengan bagian urut', async () => {
    const put = vi.fn(async (url: string) => new Response(null, { status: 200, headers: { ETag: `"etag-${url.slice(-1)}"` } }));
    const a = api();
    const progress: number[] = [];
    await uploadRecording(fakeFile(120 * MiB), a, { minutes: 88, onProgress: (p) => progress.push(p.loaded), put });
    expect(put).toHaveBeenCalledTimes(3);
    expect(a.complete).toHaveBeenCalledWith({
      key: 'rekaman/k.mp4', uploadId: 'UP', minutes: 88,
      parts: [{ partNumber: 1, etag: '"etag-1"' }, { partNumber: 2, etag: '"etag-2"' }, { partNumber: 3, etag: '"etag-3"' }],
    });
    expect(progress[progress.length - 1]).toBe(120 * MiB);
  });

  it('bagian yang gagal dicoba ulang (maks. 3 kali), lalu berhasil', async () => {
    let n = 0;
    const put = vi.fn(async () => (++n < 3 ? new Response('x', { status: 500 }) : new Response(null, { headers: { ETag: '"ok"' } })));
    const a = api();
    await uploadRecording(fakeFile(3 * MiB), a, { minutes: 5, put, retryDelayMs: 0 });
    expect(put).toHaveBeenCalledTimes(3);
    expect(a.complete).toHaveBeenCalled();
  });

  it('gagal 3 kali → unggahan dibatalkan di R2 dan galat dilempar', async () => {
    const put = vi.fn(async () => new Response('x', { status: 500 }));
    const a = api();
    await expect(uploadRecording(fakeFile(3 * MiB), a, { minutes: 5, put, retryDelayMs: 0 })).rejects.toThrow(/bagian 1/);
    expect(put).toHaveBeenCalledTimes(3);
    expect(a.abort).toHaveBeenCalledWith({ key: 'rekaman/k.mp4', uploadId: 'UP' });
    expect(a.complete).not.toHaveBeenCalled();
  });

  it('ETag tidak terbaca (CORS ExposeHeaders lupa) → galat jelas, tanpa complete', async () => {
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    const a = api();
    await expect(uploadRecording(fakeFile(3 * MiB), a, { minutes: 5, put, retryDelayMs: 0 })).rejects.toThrow(/ETag/);
    expect(a.complete).not.toHaveBeenCalled();
  });

  it('dibatalkan lewat AbortSignal → abort di R2, tanpa complete', async () => {
    const ctrl = new AbortController();
    const put = vi.fn(async () => { ctrl.abort(); return new Response(null, { headers: { ETag: '"ok"' } }); });
    const a = api();
    await expect(uploadRecording(fakeFile(120 * MiB), a, { minutes: 5, put, signal: ctrl.signal })).rejects.toThrow(/dibatalkan/);
    expect(a.abort).toHaveBeenCalled();
    expect(a.complete).not.toHaveBeenCalled();
  });

  it('URL bagian diminta per paket ≤ 20', async () => {
    const put = vi.fn(async () => new Response(null, { headers: { ETag: '"ok"' } }));
    const a = api();
    await uploadRecording(fakeFile(45 * 50 * MiB), a, { minutes: 5, put });
    expect(a.partUrls.mock.calls.every(([r]: [{ uploadId: string; partNumbers: number[] }]) => r.partNumbers.length <= 20 && r.uploadId === 'UP')).toBe(true);
    expect(a.partUrls.mock.calls.flatMap(([r]: [{ partNumbers: number[] }]) => r.partNumbers).sort((x: number, y: number) => x - y)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });
});

describe('materi', () => {
  const ID = '8ea66d4e-429f-4e98-a716-4bbc92b6ee39';
  it('PDF/PPT/DOC/ZIP ≤ 50 MB', () => {
    expect(validateMaterialFile({ name: 'Slide.PPTX', size: 8 * MiB })).toBeNull();
    expect(validateMaterialFile({ name: 'a.exe', size: 1 })).toMatch(/PDF/);
    expect(validateMaterialFile({ name: 'a.pdf', size: MAX_MATERIAL_BYTES + 1 })).toMatch(/50 MB/);
  });
  it('path aman di folder acara, cocok dengan gerbang server', () => {
    const path = materialPath(ID, 'Materi SPSS — Final (v2).PDF', '1a2b');
    expect(path).toBe(`${ID}/materi-spss-final-v2-1a2b.pdf`);
    expect(path).toMatch(new RegExp(`^${ID}/[a-z0-9][a-z0-9._-]{0,150}\\.(pdf|ppt|pptx|doc|docx|zip)$`));
    expect(materialPath(ID, '((.pdf', 'ffff')).toBe(`${ID}/materi-ffff.pdf`);
    expect(materialFileLabel(path)).toBe('materi-spss-final-v2-1a2b.pdf');
  });
});
