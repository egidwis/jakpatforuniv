import { describe, it, expect } from 'vitest';
import * as server from './_access.js';
import * as client from '../../../src/utils/webinarAccess.ts';

const req = (url) => new Request(url);
const LOCAL_ENV = { WEBINAR_LOCAL_OPEN: 'true' };

describe('_access', () => {
  it('server dan tampilan memakai saklar dan daftar yang sama', () => {
    expect(client.WEBINAR_PREVIEW_ONLY).toBe(server.WEBINAR_PREVIEW_ONLY);
    expect(client.WEBINAR_PREVIEW_EMAILS).toEqual(server.WEBINAR_PREVIEW_EMAILS);
  });

  it('masa uji: hanya tegar@jakpat.net, tanpa peka huruf besar/spasi', () => {
    if (!server.WEBINAR_PREVIEW_ONLY) return;
    for (const fn of [server.webinarOpenFor, client.webinarOpenFor]) {
      expect(fn('tegar@jakpat.net')).toBe(true);
      expect(fn(' Tegar@Jakpat.NET ')).toBe(true);
      expect(fn('product@jakpat.net')).toBe(false);
      expect(fn('tegar@jakpat.net.evil.test')).toBe(false);
      expect(fn('')).toBe(false);
      expect(fn(null)).toBe(false);
      expect(fn(undefined)).toBe(false);
    }
  });
});

describe('uji lokal membuka masa uji (server)', () => {
  it('terbuka hanya bila variabel lokal DAN host localhost', () => {
    expect(server.webinarLocalOpen(LOCAL_ENV, req('http://localhost:8788/webinar'))).toBe(true);
    expect(server.webinarLocalOpen(LOCAL_ENV, req('http://127.0.0.1:8788/api/webinar/my'))).toBe(true);
  });

  it('produksi tidak pernah terbuka, walau variabelnya telanjur diisi', () => {
    for (const url of [
      'https://submit.jakpatforuniv.com/webinar',
      'https://jakpatforuniv.com/webinar',
      'https://abc123.jakpatforuniv-submit.pages.dev/webinar',
      'https://localhost.evil.test/webinar',
    ]) {
      expect(server.webinarLocalOpen(LOCAL_ENV, req(url))).toBe(false);
      if (server.WEBINAR_PREVIEW_ONLY) {
        expect(server.webinarPreviewOnly(LOCAL_ENV, req(url))).toBe(true);
        expect(server.webinarOpenFor('product@jakpat.net', LOCAL_ENV, req(url))).toBe(false);
      }
    }
  });

  it('localhost tanpa variabel tetap mengikuti masa uji', () => {
    for (const env of [undefined, {}, { WEBINAR_LOCAL_OPEN: 'false' }, { WEBINAR_LOCAL_OPEN: true }]) {
      expect(server.webinarLocalOpen(env, req('http://localhost:8788/webinar'))).toBe(false);
    }
    expect(server.webinarLocalOpen(LOCAL_ENV, undefined)).toBe(false);
  });

  it('di lokal semua akun boleh masuk', () => {
    const local = req('http://localhost:8788/api/webinar/my');
    expect(server.webinarPreviewOnly(LOCAL_ENV, local)).toBe(false);
    expect(server.webinarOpenFor('product@jakpat.net', LOCAL_ENV, local)).toBe(true);
  });
});

describe('uji lokal membuka masa uji (tampilan)', () => {
  it('hanya build mode localtest yang dibuka di localhost', () => {
    expect(client.webinarLocalOpen('localtest', 'localhost')).toBe(true);
    expect(client.webinarLocalOpen('localtest', '127.0.0.1')).toBe(true);
    expect(client.webinarLocalOpen('production', 'localhost')).toBe(false);
    expect(client.webinarLocalOpen('development', 'localhost')).toBe(false);
    expect(client.webinarLocalOpen('localtest', 'submit.jakpatforuniv.com')).toBe(false);
    expect(client.webinarLocalOpen('localtest', undefined)).toBe(false);
  });

  it('tes ini sendiri berjalan tanpa pembukaan lokal', () => {
    expect(client.webinarLocalOpen()).toBe(false);
  });
});
