/**
 * Fase 5A: rekaman webinar di Cloudflare R2.
 *
 * - Pengunggah multipart dari browser langsung ke R2 (Function hanya menandatangani URL):
 *   bagian 50 MiB, 3 bagian sekaligus, tiap bagian dicoba 3 kali. Tab tertutup = mulai ulang
 *   (melanjutkan antar-sesi di luar 5A).
 * - Watermark pemutar: posisi berpindah tiap ±45 detik ke salah satu dari 6 titik, ditentukan
 *   fungsi murni `watermarkSpot` supaya bisa diuji.
 *
 * Batas di sini mencerminkan functions/api/admin/webinarGate.js (MAX_RECORDING_BYTES,
 * RECORDING_PART_SIZE). R2/S3: bagian ≥ 5 MiB kecuali terakhir, sama besar, ≤ 10.000 bagian.
 */

export const MAX_RECORDING_BYTES = 4 * 1024 ** 3;
export const PART_SIZE = 50 * 1024 ** 2;
const PARALLEL = 3;
const ATTEMPTS = 3;
const URL_BATCH = 20;

export interface FileLike {
  name: string;
  size: number;
  type?: string;
}

export function validateRecordingFile(file: FileLike): string | null {
  if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) return 'Hanya berkas MP4 yang bisa diunggah.';
  if (file.size <= 0) return 'Berkas ini kosong.';
  if (file.size > MAX_RECORDING_BYTES) return 'Ukuran video maks. 4 GB.';
  return null;
}

export interface PartPlan {
  partNumber: number;
  start: number;
  end: number;
}

export function planParts(size: number, partSize: number = PART_SIZE): PartPlan[] {
  const parts: PartPlan[] = [];
  for (let start = 0, n = 1; start < size; start += partSize, n++) {
    parts.push({ partNumber: n, start, end: Math.min(size, start + partSize) });
  }
  return parts;
}

/** Durasi dari metadata video di browser; ditolak bila browser tidak bisa membacanya. */
export function readDurationMinutes(file: Blob, timeoutMs = 20_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (fn: () => void) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('Durasi video tidak terbaca.'))), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      done(() => (Number.isFinite(seconds) && seconds > 0
        ? resolve(Math.max(1, Math.round(seconds / 60)))
        : reject(new Error('Durasi video tidak terbaca.'))));
    };
    video.onerror = () => done(() => reject(new Error('Browser tidak bisa membaca video ini. Pastikan formatnya MP4 (H.264).')));
    video.src = url;
  });
}

// ── Materi (Supabase Storage, bucket webinar-materials, sql/131) ───────────

export const MAX_MATERIAL_BYTES = 50 * 1024 ** 2;
const MATERIAL_EXT = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'zip'];
export const MATERIAL_ACCEPT = MATERIAL_EXT.map((e) => `.${e}`).join(',');

export function validateMaterialFile(file: FileLike): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MATERIAL_EXT.includes(ext)) return 'Materi harus PDF, PPT/PPTX, DOC/DOCX, atau ZIP.';
    if (file.size <= 0) return 'Berkas ini kosong.';
    if (file.size > MAX_MATERIAL_BYTES) return 'Ukuran materi maks. 50 MB.';
    return null;
}

/** `<eventId>/<nama-aman>-<acak>.<ext>`; sama dengan materialPathOk di webinarGate.js. */
export function materialPath(eventId: string, fileName: string, random = Math.random().toString(16).slice(2, 6)): string {
    const ext = fileName.split('.').pop()!.toLowerCase();
    const base = fileName.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'materi';
    return `${eventId.toLowerCase()}/${base}-${random}.${ext}`;
}

export const materialFileLabel = (path: string | null | undefined): string => (path ? path.split('/').pop() ?? '' : '');

// ── Pengunggah ──────────────────────────────────────────────────────────────

export interface RecordingUploadApi {
  start(): Promise<{ key: string; uploadId: string; partSize: number }>;
  partUrls(req: { key: string; uploadId: string; partNumbers: number[] }): Promise<{ partNumber: number; url: string }[]>;
  complete(req: { key: string; uploadId: string; parts: { partNumber: number; etag: string }[]; minutes: number }): Promise<unknown>;
  abort(req: { key: string; uploadId: string }): Promise<unknown>;
}

export interface PutResult {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
}
type PutFn = (url: string, body: Blob, opts: { signal?: AbortSignal; onProgress?: (loaded: number) => void }) => Promise<PutResult>;

export interface UploadOptions {
  minutes: number;
  onProgress?: (p: { loaded: number; total: number }) => void;
  signal?: AbortSignal;
  /** Disuntik di tes; bawaan memakai XMLHttpRequest supaya progres per bagian terbaca. */
  put?: PutFn;
  retryDelayMs?: number;
}

interface SliceableFile {
  name: string;
  size: number;
  slice(start: number, end: number): Blob;
}

const xhrPut: PutFn = (url, body, { signal, onProgress }) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', url);
  xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
  xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, headers: { get: (n) => xhr.getResponseHeader(n) } });
  xhr.onerror = () => reject(new Error('Jaringan terputus'));
  xhr.onabort = () => reject(new Error('Unggahan dibatalkan'));
  signal?.addEventListener('abort', () => xhr.abort(), { once: true });
  xhr.send(body);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {
  constructor() { super('Unggahan dibatalkan'); }
}

/**
 * Unggah satu berkas ke R2 lewat multipart. Melempar bila gagal atau dibatalkan;
 * dalam kedua kasus unggahan setengah jadi dibatalkan di R2.
 */
export async function uploadRecording(file: SliceableFile, api: RecordingUploadApi, opts: UploadOptions): Promise<void> {
  const put = opts.put ?? xhrPut;
  const retryDelay = opts.retryDelayMs ?? 2000;
  const { key, uploadId, partSize } = await api.start();
  const plan = planParts(file.size, partSize);
  const loaded = new Map<number, number>();
  const etags = new Map<number, string>();
  const report = () => opts.onProgress?.({ loaded: [...loaded.values()].reduce((a, b) => a + b, 0), total: file.size });
  const checkAbort = () => { if (opts.signal?.aborted) throw new Cancelled(); };

  async function sendPart(part: PartPlan, url: string) {
    let lastError = '';
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      checkAbort();
      loaded.set(part.partNumber, 0);
      try {
        const res = await put(url, file.slice(part.start, part.end), {
          signal: opts.signal,
          onProgress: (n) => { loaded.set(part.partNumber, n); report(); },
        });
        if (res.ok) {
          const etag = res.headers.get('ETag');
          // ETag kosong = CORS bucket tanpa ExposeHeaders ETag: mengulang tidak menolong.
          if (!etag) throw Object.assign(new Error('ETag tidak terbaca dari R2 (cek CORS ExposeHeaders: ETag).'), { fatal: true });
          etags.set(part.partNumber, etag);
          loaded.set(part.partNumber, part.end - part.start);
          report();
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        if ((err as { fatal?: boolean }).fatal || opts.signal?.aborted) throw opts.signal?.aborted ? new Cancelled() : err;
        lastError = (err as Error).message;
      }
      if (attempt < ATTEMPTS) await sleep(retryDelay * attempt);
    }
    throw new Error(`Unggahan bagian ${part.partNumber} gagal (${lastError}).`);
  }

  try {
    for (let i = 0; i < plan.length; i += URL_BATCH) {
      checkAbort();
      const batch = plan.slice(i, i + URL_BATCH);
      const urls = new Map((await api.partUrls({ key, uploadId, partNumbers: batch.map((p) => p.partNumber) }))
        .map((u) => [u.partNumber, u.url]));
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(PARALLEL, batch.length) }, async () => {
        while (next < batch.length) {
          const part = batch[next++];
          const url = urls.get(part.partNumber);
          if (!url) throw new Error(`URL bagian ${part.partNumber} tidak ada.`);
          await sendPart(part, url);
        }
      }));
    }
    checkAbort();
    await api.complete({
      key,
      uploadId,
      minutes: opts.minutes,
      parts: plan.map((p) => ({ partNumber: p.partNumber, etag: etags.get(p.partNumber)! })),
    });
  } catch (err) {
    await api.abort({ key, uploadId }).catch(() => undefined);
    throw err;
  }
}

// ── Tampilan ────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return '< 1 mnt';
  return `±${Math.round(seconds / 60)} mnt`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} jam${m ? ` ${m} mnt` : ''}` : `${m} mnt`;
}

// ── Watermark ───────────────────────────────────────────────────────────────

export interface WatermarkSpot {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

/** Bawah 16% supaya tidak tertutup kontrol pemutar. */
export const WATERMARK_SPOTS: readonly WatermarkSpot[] = [
  { top: '8%', left: '5%' },
  { top: '8%', right: '5%' },
  { top: '44%', left: '5%' },
  { top: '44%', right: '5%' },
  { bottom: '16%', left: '5%' },
  { bottom: '16%', right: '5%' },
];

export const WATERMARK_TICK_MS = 45_000;

/** FNV-1a 32-bit. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Titik watermark untuk tick ke-`tick` (tick = floor(waktu / 45 detik)). Deterministik
 * per (seed, tick) dan selalu berbeda dari tick sebelumnya, jadi watermark tidak pernah
 * "diam" di satu tempat yang bisa ditutup/dipotong.
 */
export function watermarkSpot(seed: string, tick: number): WatermarkSpot {
  const n = WATERMARK_SPOTS.length;
  let idx = hash(`${seed}|0`) % n;
  const t = Math.max(0, Math.floor(tick)) % 100_000;
  for (let i = 1; i <= t; i++) idx = (idx + 1 + (hash(`${seed}|${i}`) % (n - 1))) % n;
  return WATERMARK_SPOTS[idx];
}
