import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  presign, presignGet, presignPart, recordingConfig, objectKey, keyBelongsTo, OBJECT_KEY_RE,
  createMultipart, completeMultipart, abortMultipart, headObject, deleteObject, StorageError,
} from './_recording.js';

const EVENT = '8ea66d4e-429f-4e98-a716-4bbc92b6ee39';
const ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'AKID',
  R2_SECRET_ACCESS_KEY: 'SECRET',
  R2_RECORDINGS_BUCKET: 'jfu-webinar-recordings',
};
const config = recordingConfig(ENV);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('SigV4 presign', () => {
  it('cocok dengan contoh resmi AWS (Authenticating Requests: Using Query Parameters)', async () => {
    const url = await presign({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      expiresIn: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request');
    expect(url).toMatch(/X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  });

  it('URL baca R2: host akun, bucket/kunci di path, region auto, kedaluwarsa sesuai', async () => {
    const url = new URL(await presignGet(config, `rekaman/${EVENT}/spss-a1b2c3d4.mp4`, 3 * 3600, new Date('2026-11-18T02:00:00Z')));
    expect(url.host).toBe('acct123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/jfu-webinar-recordings/rekaman/${EVENT}/spss-a1b2c3d4.mp4`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('10800');
    expect(url.searchParams.get('X-Amz-Credential')).toBe('AKID/20261118/auto/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('kedaluwarsa dipotong ke batas SigV4 7 hari', async () => {
    const url = new URL(await presignGet(config, `rekaman/${EVENT}/a-1.mp4`, 30 * 86400));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('604800');
  });

  it('URL bagian multipart memuat partNumber + uploadId (ter-encode)', async () => {
    const url = new URL(await presignPart(config, `rekaman/${EVENT}/a-1.mp4`, 'up+id/=', 7, 7200));
    expect(url.searchParams.get('partNumber')).toBe('7');
    expect(url.searchParams.get('uploadId')).toBe('up+id/=');
    expect(url.search).toContain('uploadId=up%2Bid%2F%3D');
  });
});

describe('konfigurasi & kunci objek', () => {
  it('secret kurang → null', () => {
    expect(recordingConfig({ ...ENV, R2_SECRET_ACCESS_KEY: '' })).toBeNull();
    expect(recordingConfig({})).toBeNull();
  });

  it('kunci aman, berakhiran acak, cocok dengan CHECK sql/136', () => {
    const key = objectKey(EVENT, 'Rekaman SPSS — Sesi 1 (Final).MP4', 'a1b2c3d4');
    expect(key).toBe(`rekaman/${EVENT}/rekaman-spss-sesi-1-final-a1b2c3d4.mp4`);
    expect(OBJECT_KEY_RE.test(key)).toBe(true);
    expect(OBJECT_KEY_RE.test(objectKey(EVENT, '((()))', 'ffffffff'))).toBe(true);
    expect(OBJECT_KEY_RE.test(objectKey(EVENT, 'x'.repeat(300), 'ffffffff'))).toBe(true);
    expect(objectKey(EVENT, 'a.mp4')).not.toBe(objectKey(EVENT, 'a.mp4'));
  });

  it('kunci milik acara lain atau berisi ../ ditolak', () => {
    expect(keyBelongsTo(`rekaman/${EVENT}/a-1.mp4`, EVENT)).toBe(true);
    expect(keyBelongsTo('rekaman/0d41c7ac-71e9-4e11-9a80-5fee6494f602/a-1.mp4', EVENT)).toBe(false);
    expect(keyBelongsTo(`rekaman/${EVENT}/../a.mp4`, EVENT)).toBe(false);
    expect(keyBelongsTo(null, EVENT)).toBe(false);
  });
});

describe('operasi server', () => {
  function stub(reply) {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return reply(String(url), init);
    }));
    return calls;
  }
  const KEY = `rekaman/${EVENT}/a-1.mp4`;

  it('CreateMultipartUpload: POST ?uploads, content-type ditandatangani, UploadId terurai', async () => {
    const calls = stub(() => new Response('<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>UP-123</UploadId></InitiateMultipartUploadResult>'));
    expect(await createMultipart(config, KEY)).toBe('UP-123');
    const u = new URL(calls[0].url);
    expect(calls[0].init.method).toBe('POST');
    expect(u.searchParams.has('uploads')).toBe(true);
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(calls[0].init.headers['content-type']).toBe('video/mp4');
  });

  it('CompleteMultipartUpload: XML bagian urut + ETag di-escape; <Error> di balasan 200 tetap galat', async () => {
    const calls = stub(() => new Response('<CompleteMultipartUploadResult/>'));
    await completeMultipart(config, KEY, 'UP-1', [{ partNumber: 1, etag: '"abc"' }, { partNumber: 2, etag: '"def"' }]);
    expect(calls[0].init.body).toBe('<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>&quot;abc&quot;</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;def&quot;</ETag></Part></CompleteMultipartUpload>');
    expect(new URL(calls[0].url).searchParams.get('uploadId')).toBe('UP-1');

    stub(() => new Response('<Error><Code>InvalidPart</Code></Error>'));
    await expect(completeMultipart(config, KEY, 'UP-1', [{ partNumber: 1, etag: 'x' }])).rejects.toThrow(/InvalidPart/);
  });

  it('galat berlabel: HTTP 403 dan jaringan putus', async () => {
    stub(() => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }));
    await expect(abortMultipart(config, KEY, 'UP')).rejects.toThrow(/R2 AbortMultipartUpload gagal — HTTP 403: AccessDenied/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(deleteObject(config, KEY)).rejects.toBeInstanceOf(StorageError);
  });

  it('HeadObject: ukuran dari content-length; 404 → null', async () => {
    stub(() => new Response(null, { status: 200, headers: { 'content-length': '432013312' } }));
    expect(await headObject(config, KEY)).toEqual({ size: 432013312 });
    stub(() => new Response(null, { status: 404 }));
    expect(await headObject(config, KEY)).toBeNull();
  });
});
