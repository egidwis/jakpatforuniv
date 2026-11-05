import { describe, it, expect } from 'vitest';
import {
  WEBINAR_ADMIN_ACTIONS, EDITABLE_COLUMNS, FIELD_ORDER, adminEmails, validateWebinarRequest,
  isEmptyDoc, hasDataImage, normalizeDoc, normalizeSpeakers, normalizePatch, applySalesInvariant,
  slugifyTitle, pickFreeSlug, isSlugLocked, missingForPublish, crossFieldError, quotaError,
  clearedScheduleError, scheduleChanged,
} from './webinarGate.js';

const ID = '33333333-3333-4333-8333-333333333333';
const doc = (...content) => ({ type: 'doc', content });
const para = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });

describe('validateWebinarRequest', () => {
  it('menerima setiap aksi yang terdaftar dengan bentuk benar', () => {
    for (const action of WEBINAR_ADMIN_ACTIONS) {
      expect(validateWebinarRequest({ action, id: ID, patch: {} })).toBeNull();
    }
  });

  it('menolak aksi tak dikenal, id bukan uuid, dan patch bukan objek', () => {
    expect(validateWebinarRequest(null)).toMatch(/tidak dikenali/);
    expect(validateWebinarRequest({ action: 'drop' })).toMatch(/tidak diizinkan/);
    expect(validateWebinarRequest({ action: 'save', id: 'abc' })).toMatch(/Acara tidak dikenali/);
    expect(validateWebinarRequest({ action: 'save', id: ID, patch: [] })).toMatch(/Isian tidak dikenali/);
    expect(validateWebinarRequest({ action: 'list', expectedUpdatedAt: 5 })).toMatch(/Versi/);
  });

  it.each(['status', 'slug', 'published_at', 'preview_token', 'is_test', 'offer_kind', 'id'])(
    'kolom %s tidak bisa ditulis lewat patch',
    (column) => {
      expect(validateWebinarRequest({ action: 'save', id: ID, patch: { [column]: 'x' } })).toBe(`Kolom tidak diizinkan: ${column}`);
    }
  );

  it('FIELD_ORDER hanya berisi kolom yang bisa diedit', () => {
    expect(FIELD_ORDER.every((f) => EDITABLE_COLUMNS.includes(f))).toBe(true);
  });
});

describe('adminEmails', () => {
  it('bawaan product@jakpat.net, dirapikan dan huruf kecil', () => {
    expect(adminEmails({})).toEqual(['product@jakpat.net']);
    expect(adminEmails({ ADMIN_EMAILS: ' A@x.test, ,b@x.test ' })).toEqual(['a@x.test', 'b@x.test']);
  });
});

describe('deskripsi', () => {
  it('paragraf kosong bawaan editor dianggap kosong dan disimpan null', () => {
    expect(isEmptyDoc(doc(para(''), para('   ')))).toBe(true);
    expect(normalizeDoc(doc(para(''))).value).toBeNull();
  });

  it('teks atau gambar membuatnya berisi', () => {
    expect(isEmptyDoc(doc(para('Halo')))).toBe(false);
    expect(isEmptyDoc(doc({ type: 'image', attrs: { src: 'https://cdn.test/a.webp' } }))).toBe(false);
  });

  it('menolak gambar data:, format asing, dan ukuran > 500 KB', () => {
    const pasted = doc({ type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } });
    expect(hasDataImage(pasted)).toBe(true);
    expect(normalizeDoc(pasted).error).toMatch(/diunggah/);
    expect(normalizeDoc({ type: 'paragraph' }).error).toMatch(/Format/);
    expect(normalizeDoc(doc(para('x'.repeat(500_001)))).error).toMatch(/500 KB/);
  });
});

describe('pembicara', () => {
  it('membuang baris kosong dan merapikan spasi', () => {
    expect(normalizeSpeakers([{ name: ' Sari ', title: ' Dosen ' }, { name: '', title: '' }]).value)
      .toEqual([{ name: 'Sari', title: 'Dosen' }]);
  });

  it('foto harus https, maksimal 10 pembicara', () => {
    expect(normalizeSpeakers([{ name: 'A', photo_url: 'http://x.test/a.png' }]).error).toMatch(/https/);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `P${i}` }));
    expect(normalizeSpeakers(eleven).error).toMatch(/10/);
  });
});

describe('normalizePatch', () => {
  it('isian kosong menjadi null dan teks dirapikan', () => {
    const r = normalizePatch({ summary: '  ', poster_url: '', price: '', starts_at: '' });
    expect(r.patch).toEqual({ summary: null, poster_url: null, price: null, starts_at: null });
  });

  it('judul wajib, ringkasan maks. 160 code point (emoji dihitung satu)', () => {
    expect(normalizePatch({ title: '  ' })).toEqual({ error: 'Judul wajib diisi', field: 'title' });
    expect(normalizePatch({ summary: '😀'.repeat(160) }).patch.summary).toHaveLength(320);
    expect(normalizePatch({ summary: 'a'.repeat(161) }).field).toBe('summary');
  });

  it('link wajib https', () => {
    expect(normalizePatch({ meeting_url: 'http://zoom.us/j/1' }).field).toBe('meeting_url');
    expect(normalizePatch({ meeting_url: 'https://zoom.us/j/1' }).patch.meeting_url).toBe('https://zoom.us/j/1');
  });

  it('batas angka mengikuti rencana', () => {
    expect(normalizePatch({ price: 999 }).field).toBe('price');
    expect(normalizePatch({ price: 1000 }).patch.price).toBe(1000);
    expect(normalizePatch({ price: 100_000_001 }).field).toBe('price');
    expect(normalizePatch({ quota: 0 }).field).toBe('quota');
    expect(normalizePatch({ duration_minutes: 1441 }).field).toBe('duration_minutes');
    expect(normalizePatch({ price: 1500.5 }).field).toBe('price');
  });

  it('tanggal ISO dinormalisasi ke UTC; teks asal ditolak', () => {
    expect(normalizePatch({ starts_at: '2026-11-20T19:00:00+07:00' }).patch.starts_at).toBe('2026-11-20T12:00:00.000Z');
    expect(normalizePatch({ starts_at: 'besok' }).field).toBe('starts_at');
    expect(normalizePatch({ starts_at: '2099-01-01T00:00:00Z' }).field).toBe('starts_at');
  });

  it('pilihan penjualan tak dikenal ditandai di isian tanggal buka', () => {
    expect(normalizePatch({ sales_mode: 'soon' }).field).toBe('sales_open_at');
    expect(normalizePatch({ is_listed: 'ya' }).field).toBe('is_listed');
  });
});

describe('applySalesInvariant', () => {
  it('tanggal buka dikosongkan kecuali sales_mode open', () => {
    expect(applySalesInvariant({ sales_mode: 'coming_soon', sales_open_at: 'x' }).sales_open_at).toBeNull();
    expect(applySalesInvariant({ sales_mode: 'closed', sales_open_at: 'x' }).sales_open_at).toBeNull();
    expect(applySalesInvariant({ sales_mode: 'open', sales_open_at: 'x' }).sales_open_at).toBe('x');
  });
});

describe('slug', () => {
  it('dari judul: aksen dibuang, huruf kecil, tanda hubung tunggal', () => {
    expect(slugifyTitle('Olah Data   SPSS: Café & Riset!')).toBe('olah-data-spss-cafe-riset');
    expect(slugifyTitle('!!!')).toBe('acara');
    expect(slugifyTitle('a'.repeat(100))).toHaveLength(76);
  });

  it('memilih slug bebas dan menganggap gabung terpakai', () => {
    expect(pickFreeSlug('olah-data', [])).toBe('olah-data');
    expect(pickFreeSlug('olah-data', ['olah-data', 'olah-data-2'])).toBe('olah-data-3');
    expect(pickFreeSlug('gabung', [])).toBe('gabung-2');
  });

  it('hasil selalu lolos CHECK format dan panjang sql/131', () => {
    const slug = pickFreeSlug(slugifyTitle('x'.repeat(200)), [slugifyTitle('x'.repeat(200))]);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it('terkunci sejak pertama terbit', () => {
    expect(isSlugLocked({ status: 'draft', published_at: null })).toBe(false);
    expect(isSlugLocked({ status: 'published', published_at: '2026-11-05T00:00:00Z' })).toBe(true);
    expect(isSlugLocked({ status: 'cancelled', published_at: null })).toBe(true);
  });
});

describe('missingForPublish', () => {
  const base = { title: 'A', summary: 'B', poster_url: 'https://x.test/p.webp', offer_kind: 'live' };

  it('Belum ditentukan cukup judul, ringkasan, poster', () => {
    expect(missingForPublish({ ...base, sales_mode: 'coming_soon' })).toEqual([]);
    expect(missingForPublish({ sales_mode: 'coming_soon' })).toEqual(['title', 'summary', 'poster_url']);
  });

  it('dijual: semua isian tiket wajib, berurutan menurut form', () => {
    expect(missingForPublish({ sales_mode: 'open' })).toEqual([
      'title', 'summary', 'poster_url', 'description_blocks', 'speakers', 'starts_at', 'duration_minutes', 'price', 'quota',
    ]);
  });

  it('pembicara tanpa nama dianggap kurang; deskripsi kosong dianggap kurang', () => {
    const row = {
      ...base, sales_mode: 'open', description_blocks: doc(para('')), speakers: [{ name: '', title: 'Dosen' }],
      starts_at: '2026-12-01T03:00:00Z', duration_minutes: 90, price: 50000, quota: 100,
    };
    expect(missingForPublish(row)).toEqual(['description_blocks', 'speakers']);
  });
});

describe('crossFieldError', () => {
  const start = '2026-12-01T03:00:00.000Z';

  it('buka harus sebelum tutup', () => {
    expect(crossFieldError({ sales_open_at: '2026-11-20T00:00:00Z', sales_close_at: '2026-11-20T00:00:00Z' }).field)
      .toBe('sales_close_at');
  });

  it('tiket: buka sebelum acara mulai, tutup paling lambat saat mulai', () => {
    expect(crossFieldError({ starts_at: start, sales_open_at: start }).field).toBe('sales_open_at');
    expect(crossFieldError({ starts_at: start, sales_close_at: '2026-12-01T03:00:01Z' }).field).toBe('sales_close_at');
    expect(crossFieldError({ starts_at: start, sales_close_at: start })).toBeNull();
  });

  it('video kelas tidak terikat jam acara', () => {
    expect(crossFieldError({ offer_kind: 'replay', starts_at: start, sales_open_at: '2026-12-02T00:00:00Z' })).toBeNull();
  });
});

describe('kuota dan jadwal yang sudah bertiket', () => {
  const offer = { sold: 3, held: 2 };

  it('kuota yang diubah tidak boleh di bawah terjual + ditahan', () => {
    expect(quotaError({ quota: 100 }, { quota: 4 }, offer).error).toMatch(/minimal 5/);
    expect(quotaError({ quota: 100 }, { quota: 5 }, offer)).toBeNull();
    expect(quotaError({ quota: 100 }, { quota: null }, offer).error).toMatch(/dikosongkan/);
  });

  it('kuota yang tidak diubah tidak diperiksa (acara telanjur lewat kuota tetap bisa dikoreksi)', () => {
    expect(quotaError({ quota: 2 }, { quota: 2 }, offer)).toBeNull();
  });

  it('tanpa tiket, kuota bebas diubah', () => {
    expect(quotaError({ quota: 100 }, { quota: 1 }, { sold: 0, held: 0 })).toBeNull();
  });

  it('jadwal tak boleh dikosongkan bila sudah ada tiket', () => {
    expect(clearedScheduleError({ starts_at: 'x', duration_minutes: 60 }, { starts_at: null, duration_minutes: 60 }, offer).field)
      .toBe('starts_at');
    expect(clearedScheduleError({ starts_at: 'x', duration_minutes: 60 }, { starts_at: 'x', duration_minutes: null }, offer).field)
      .toBe('duration_minutes');
    expect(clearedScheduleError({ starts_at: 'x' }, { starts_at: null }, { sold: 0, held: 0 })).toBeNull();
  });

  it('perubahan jadwal dibandingkan sebagai waktu, bukan teks', () => {
    const a = { starts_at: '2026-12-01T03:00:00+00:00', duration_minutes: 90 };
    expect(scheduleChanged(a, { starts_at: '2026-12-01T03:00:00.000Z', duration_minutes: 90 })).toBe(false);
    expect(scheduleChanged(a, { starts_at: '2026-12-01T04:00:00.000Z', duration_minutes: 90 })).toBe(true);
    expect(scheduleChanged(a, { ...a, duration_minutes: 120 })).toBe(true);
  });
});
