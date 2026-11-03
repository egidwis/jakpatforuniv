import { describe, it, expect } from 'vitest';
import * as server from './_access.js';
import * as client from '../../../src/utils/webinarAccess.ts';

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
