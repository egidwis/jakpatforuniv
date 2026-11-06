// Satu-satunya modul penyimpanan rekaman webinar (Fase 5A, sql/136): Cloudflare R2
// lewat API S3-nya. Pindah ke Stream atau vendor DRM nanti cukup mengganti modul ini
// dan pemutarnya; layar admin, aturan akses, dan data tetap.
//
// Kenapa tanpa pustaka (aws4fetch): repo ini punya dua lockfile (npm + pnpm), jadi
// dependensi baru berisiko membuat build Pages tidak sinkron. Yang dibutuhkan hanya
// presigned URL SigV4 (query string), ±60 baris WebCrypto. Kebenarannya dikunci
// recording.spec.js dengan contoh resmi dokumentasi AWS.
//
// Semua permintaan ke R2 memakai presigned URL, termasuk dari server: satu jalur
// tanda tangan, satu set tes. Bucket privat; URL baca hanya diterbitkan ke admin
// (pratinjau) dan ke pemilik tiket lewat /api/webinar/watch.

const ALGORITHM = 'AWS4-HMAC-SHA256';
const MAX_EXPIRES = 604_800; // batas SigV4: 7 hari

/** Konfigurasi R2 dari secret Pages; null bila ada yang kurang (aksi rekaman → 503). */
export function recordingConfig(env) {
  const accountId = env?.R2_ACCOUNT_ID;
  const accessKeyId = env?.R2_ACCESS_KEY_ID;
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY;
  const bucket = env?.R2_RECORDINGS_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    region: 'auto',
    host: `${accountId}.r2.cloudflarestorage.com`,
  };
}

export class StorageError extends Error {
  constructor(label, status, detail) {
    super(`${label} gagal — HTTP ${status}: ${String(detail ?? '').slice(0, 300)}`);
    this.status = status;
  }
}

// ── Kunci objek ─────────────────────────────────────────────────────────────

/** Sama dengan CHECK webinar_events_recording_key_format (sql/136). */
export const OBJECT_KEY_RE = /^rekaman\/[0-9a-f-]{36}\/[a-z0-9-]{1,80}\.mp4$/;

/**
 * rekaman/<eventId>/<nama-aman>-<8 hex acak>.mp4. Akhiran acak membuat unggah ulang
 * berkas bernama sama TIDAK menimpa objek lama, jadi menghapus objek lama sesudah
 * ganti video tidak pernah mengenai video baru.
 */
export function objectKey(eventId, fileName, random = randomHex(4)) {
  const base = String(fileName ?? '')
    .replace(/\.mp4$/i, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'rekaman';
  return `rekaman/${String(eventId).toLowerCase()}/${base}-${random}.mp4`;
}

export const keyBelongsTo = (key, eventId) =>
  typeof key === 'string' && OBJECT_KEY_RE.test(key) && key.startsWith(`rekaman/${String(eventId).toLowerCase()}/`);

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── SigV4 (query string) ────────────────────────────────────────────────────

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(text));
}

/** RFC 3986, seperti yang diminta SigV4 (encodeURIComponent membiarkan !'()*). */
const uriEncode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (path) => path.split('/').map(uriEncode).join('/');

const amzDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Presigned URL SigV4. `headers` (selain host) ikut ditandatangani dan WAJIB dikirim
 * sama persis oleh pemanggil.
 * @returns {Promise<string>}
 */
export async function presign({
  method, host, path, query = {}, headers = {}, accessKeyId, secretAccessKey, region,
  service = 's3', expiresIn, now = new Date(),
}) {
  const seconds = Math.max(1, Math.min(MAX_EXPIRES, Math.floor(expiresIn)));
  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;

  const signedHeaders = { host, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])) };
  const headerNames = Object.keys(signedHeaders).sort();

  const params = {
    ...query,
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(seconds),
    'X-Amz-SignedHeaders': headerNames.join(';'),
  };
  const canonicalQuery = Object.keys(params)
    .map((k) => [uriEncode(k), uriEncode(String(params[k]))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    method.toUpperCase(),
    encodePath(path),
    canonicalQuery,
    headerNames.map((h) => `${h}:${signedHeaders[h]}\n`).join(''),
    headerNames.join(';'),
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [ALGORITHM, stamp, scope, await sha256Hex(canonicalRequest)].join('\n');
  let key = await hmac(`AWS4${secretAccessKey}`, day);
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, 'aws4_request');
  const signature = hex(await hmac(key, stringToSign));

  return `https://${host}${encodePath(path)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const sign = (config, { method, key, query, headers, expiresIn, now }) => presign({
  method,
  host: config.host,
  path: `/${config.bucket}/${key}`,
  query,
  headers,
  accessKeyId: config.accessKeyId,
  secretAccessKey: config.secretAccessKey,
  region: config.region,
  expiresIn,
  now,
});

const SERVER_EXPIRY = 300; // URL yang dipakai server sendiri, langsung dipakai

// ── URL untuk browser ───────────────────────────────────────────────────────

/** URL baca: pratinjau admin (1 jam) dan halaman tonton (3 jam). */
export const presignGet = (config, key, expiresIn, now) => sign(config, { method: 'GET', key, expiresIn, now });

/** URL unggah satu bagian multipart (PUT dari browser). */
export const presignPart = (config, key, uploadId, partNumber, expiresIn, now) =>
  sign(config, { method: 'PUT', key, query: { partNumber: String(partNumber), uploadId }, expiresIn, now });

// ── Operasi server ──────────────────────────────────────────────────────────

const tag = (xml, name) => {
  const m = String(xml).match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1] : null;
};
const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function call(label, url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new StorageError(label, 0, err?.message || err);
  }
  const body = init?.method === 'HEAD' ? '' : await res.text().catch(() => '');
  if (!res.ok) throw new StorageError(label, res.status, tag(body, 'Code') || body);
  return { res, body };
}

export async function createMultipart(config, key) {
  const headers = { 'content-type': 'video/mp4' };
  const url = await sign(config, { method: 'POST', key, query: { uploads: '' }, headers, expiresIn: SERVER_EXPIRY });
  const { body } = await call('R2 CreateMultipartUpload', url, { method: 'POST', headers });
  const uploadId = tag(body, 'UploadId');
  if (!uploadId) throw new StorageError('R2 CreateMultipartUpload', 200, 'UploadId tidak ada di balasan');
  return uploadId;
}

/** @param {{partNumber: number, etag: string}[]} parts urut naik */
export async function completeMultipart(config, key, uploadId, parts) {
  const xml = `<CompleteMultipartUpload>${parts
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`;
  const headers = { 'content-type': 'application/xml' };
  const url = await sign(config, { method: 'POST', key, query: { uploadId }, headers, expiresIn: SERVER_EXPIRY });
  const { body } = await call('R2 CompleteMultipartUpload', url, { method: 'POST', headers, body: xml });
  // S3 bisa membalas 200 dengan <Error> di badan untuk CompleteMultipartUpload.
  if (/<Error>/.test(body)) throw new StorageError('R2 CompleteMultipartUpload', 200, tag(body, 'Code') || body);
}

export async function abortMultipart(config, key, uploadId) {
  const url = await sign(config, { method: 'DELETE', key, query: { uploadId }, expiresIn: SERVER_EXPIRY });
  await call('R2 AbortMultipartUpload', url, { method: 'DELETE' });
}

/** @returns {Promise<{size: number}|null>} null bila objek tidak ada */
export async function headObject(config, key) {
  const url = await sign(config, { method: 'HEAD', key, expiresIn: SERVER_EXPIRY });
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch (err) {
    throw new StorageError('R2 HeadObject', 0, err?.message || err);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new StorageError('R2 HeadObject', res.status, '');
  return { size: Number(res.headers.get('content-length')) || 0 };
}

export async function deleteObject(config, key) {
  const url = await sign(config, { method: 'DELETE', key, expiresIn: SERVER_EXPIRY });
  await call('R2 DeleteObject', url, { method: 'DELETE' });
}
