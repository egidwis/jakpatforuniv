import { describe, it, expect } from 'vitest';
import {
  normalizeTicketEmail, normalizeRefundNote,
  WEBINAR_ADMIN_ACTIONS, EDITABLE_COLUMNS, FIELD_ORDER, adminEmails, validateWebinarRequest,
  isEmptyDoc, hasDataImage, normalizeDoc, normalizeSpeakers, normalizePatch, applySalesInvariant,
  slugifyTitle, pickFreeSlug, isSlugLocked, missingForPublish, crossFieldError, quotaError,
  clearedScheduleError, scheduleChanged, RECORDING_ACTIONS, MAX_RECORDING_BYTES,
  PUBLISH_FIELD_ORDER, offerSwitchError, eventEndsAt,
} from './webinarGate.js';

const ID = '33333333-3333-4333-8333-333333333333';
const doc = (...content) => ({ type: 'doc', content });
const para = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });

describe('validateWebinarRequest', () => {
  it('menerima setiap aksi yang terdaftar dengan bentuk benar', () => {
    // Aksi rekaman punya isian sendiri; bentuk sahnya diuji di "aksi rekaman (Fase 5A)".
    for (const action of WEBINAR_ADMIN_ACTIONS.filter((a) => !RECORDING_ACTIONS.includes(a))) {
      expect(validateWebinarRequest({ action, id: ID, patch: {}, orderId: ID, note: 'Bentrok jadwal' })).toBeNull();
    }
  });

  it('Fase 3: order, email, dan catatan refund divalidasi sebelum menyentuh database', () => {
    expect(validateWebinarRequest({ action: 'refund', orderId: 'abc', note: 'catatan' })).toMatch(/Order tidak dikenali/);
    expect(validateWebinarRequest({ action: 'refund', orderId: ID, note: ' a ' })).toMatch(/Catatan refund/);
    expect(validateWebinarRequest({ action: 'refund', orderId: ID, note: 'x'.repeat(501) })).toMatch(/Catatan refund/);
    expect(validateWebinarRequest({ action: 'resend-ticket', orderId: ID, email: 'bukan email' })).toMatch(/email tidak valid/);
    expect(validateWebinarRequest({ action: 'resend-ticket', orderId: ID, email: '' })).toBeNull();
    expect(validateWebinarRequest({ action: 'email-retry', broadcastId: ID })).toMatch(/Tindakan tidak diizinkan/);
    expect(validateWebinarRequest({ action: 'participants', id: 'x' })).toMatch(/Acara tidak dikenali/);
  });

  it('normalizeTicketEmail & normalizeRefundNote', () => {
    expect(normalizeTicketEmail('  Budi@Mail.COM ')).toBe('budi@mail.com');
    expect(normalizeTicketEmail('budi@mail')).toBeNull();
    expect(normalizeTicketEmail('a b@mail.com')).toBeNull();
    expect(normalizeTicketEmail(`${'a'.repeat(250)}@x.co`)).toBeNull();
    expect(normalizeRefundNote('  Bentrok jadwal ')).toBe('Bentrok jadwal');
    expect(normalizeRefundNote('ab')).toBeNull();
    expect(normalizeRefundNote(5)).toBeNull();
  });

  it('menolak aksi tak dikenal, id bukan uuid, dan patch bukan objek', () => {
    expect(validateWebinarRequest(null)).toMatch(/tidak dikenali/);
    expect(validateWebinarRequest({ action: 'drop' })).toMatch(/tidak diizinkan/);
    expect(validateWebinarRequest({ action: 'save', id: 'abc' })).toMatch(/Acara tidak dikenali/);
    expect(validateWebinarRequest({ action: 'save', id: ID, patch: [] })).toMatch(/Isian tidak dikenali/);
    expect(validateWebinarRequest({ action: 'list', expectedUpdatedAt: 5 })).toMatch(/Versi/);
  });

  it.each(['status', 'slug', 'published_at', 'preview_token', 'is_test', 'id'])(
    'kolom %s tidak bisa ditulis lewat patch',
    (column) => {
      expect(validateWebinarRequest({ action: 'save', id: ID, patch: { [column]: 'x' } })).toBe(`Kolom tidak diizinkan: ${column}`);
    }
  );

  it('FIELD_ORDER hanya berisi kolom yang bisa diedit', () => {
    expect(FIELD_ORDER.every((f) => EDITABLE_COLUMNS.includes(f))).toBe(true);
  });

  it('Fase 5B: jenis halaman (offer_kind) bisa ditulis, hanya live/replay', () => {
    expect(validateWebinarRequest({ action: 'save', id: ID, patch: { offer_kind: 'replay' } })).toBeNull();
    expect(normalizePatch({ offer_kind: 'replay' })).toEqual({ patch: { offer_kind: 'replay' } });
    expect(normalizePatch({ offer_kind: 'live' })).toEqual({ patch: { offer_kind: 'live' } });
    expect(normalizePatch({ offer_kind: 'kelas' })).toEqual({ error: 'Jenis halaman tidak dikenali', field: 'offer_kind' });
    expect(FIELD_ORDER[0]).toBe('offer_kind');
  });

  it('Fase 5B: urutan isian kurang diakhiri panel Rekaman (bukan kolom patch)', () => {
    expect(PUBLISH_FIELD_ORDER).toEqual([...FIELD_ORDER, 'recording', 'materials_path']);
    expect(EDITABLE_COLUMNS).not.toContain('recording');
    expect(EDITABLE_COLUMNS).not.toContain('materials_path');
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

  it('Video kelas dijual: tanpa jadwal/kuota, tetapi wajib rekaman terbit + materi (Fase 5B)', () => {
    const replay = {
      ...base, offer_kind: 'replay', sales_mode: 'open', description_blocks: doc(para('Isi')),
      speakers: [{ name: 'Dr. Sari', title: 'Dosen' }], price: 49000,
    };
    expect(missingForPublish(replay)).toEqual(['recording', 'materials_path']);
    // Kunci ada tetapi belum terbit: tetap kurang (CHECK ready_to_sell sql/136 juga menolak).
    expect(missingForPublish({ ...replay, recording_object_key: 'rekaman/x.mp4', materials_path: 'a/b.pdf' }))
      .toEqual(['recording']);
    expect(missingForPublish({
      ...replay, recording_object_key: 'rekaman/x.mp4', recording_published_at: '2026-11-18T02:30:00Z', materials_path: 'a/b.pdf',
    })).toEqual([]);
  });

  it('Video kelas Segera hadir/ditutup tidak menunggu rekaman', () => {
    expect(missingForPublish({ ...base, offer_kind: 'replay', sales_mode: 'coming_soon' })).toEqual([]);
    expect(missingForPublish({ ...base, offer_kind: 'replay', sales_mode: 'closed' })).toEqual([]);
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

describe('ubah jenis halaman (Fase 5B)', () => {
  const NOW = Date.parse('2026-11-17T02:00:00Z'); // 09.00 WIB
  const live = {
    status: 'published', offer_kind: 'live', starts_at: '2026-11-17T01:36:50Z', duration_minutes: 90,
    webinar_offer_state: { sold: 12, held: 0 },
  };
  const toReplay = (row) => ({ ...row, offer_kind: 'replay' });

  it('acara selesai = mulai + durasi', () => {
    expect(eventEndsAt(live)).toBe(Date.parse('2026-11-17T03:06:50Z'));
    expect(eventEndsAt({ starts_at: null })).toBeNull();
  });

  it('jenis sama atau draft: bebas', () => {
    expect(offerSwitchError(live, live, NOW)).toBeNull();
    const draft = { ...live, status: 'draft', webinar_offer_state: { sold: 0, held: 0 } };
    expect(offerSwitchError(draft, toReplay(draft), NOW)).toBeNull();
    expect(offerSwitchError(toReplay(draft), draft, NOW)).toBeNull();
  });

  it('acara terbit bertiket belum selesai: ditolak, dengan jam selesainya', () => {
    expect(offerSwitchError(live, toReplay(live), NOW)).toEqual({
      code: 'event_not_over', error: 'Video kelas bisa dipilih sesudah acara selesai', ends_at: '2026-11-17T03:06:50.000Z',
    });
  });

  it('kursi yang sedang ditahan juga menahan ubah jenis', () => {
    const held = { ...live, webinar_offer_state: { sold: 0, held: 1 } };
    expect(offerSwitchError(held, toReplay(held), NOW)?.code).toBe('event_not_over');
  });

  it('sesudah acara selesai, atau tanpa tiket sama sekali: boleh', () => {
    expect(offerSwitchError(live, toReplay(live), Date.parse('2026-11-17T03:06:51Z'))).toBeNull();
    const empty = { ...live, webinar_offer_state: { sold: 0, held: 0 } };
    expect(offerSwitchError(empty, toReplay(empty), NOW)).toBeNull();
  });

  it('Video kelas yang sudah terbit tidak bisa kembali menjadi tiket', () => {
    const replay = { ...live, offer_kind: 'replay', webinar_offer_state: { sold: 0, held: 0 } };
    expect(offerSwitchError(replay, { ...replay, offer_kind: 'live' }, NOW)).toEqual({
      code: 'offer_locked', error: 'Video kelas yang sudah terbit tidak bisa kembali menjadi tiket',
    });
  });
});

describe('aksi rekaman (Fase 5A)', () => {
  const ID = '8ea66d4e-429f-4e98-a716-4bbc92b6ee39';
  const KEY = `rekaman/${ID}/spss-a1b2c3d4.mp4`;
  const ok = (body) => expect(validateWebinarRequest({ id: ID, ...body })).toBeNull();
  const bad = (body, re) => expect(validateWebinarRequest({ id: ID, ...body })).toMatch(re);

  it('unggah mulai: hanya .mp4, 1 B–4 GB', () => {
    ok({ action: 'recording-upload-start', fileName: 'Rekaman.MP4', size: 432_013_312 });
    ok({ action: 'recording-upload-start', fileName: 'a.mp4', size: MAX_RECORDING_BYTES });
    bad({ action: 'recording-upload-start', fileName: 'a.mov', size: 10 }, /MP4/);
    bad({ action: 'recording-upload-start', fileName: 'a.mp4', size: MAX_RECORDING_BYTES + 1 }, /4 GB/);
    bad({ action: 'recording-upload-start', fileName: 'a.mp4', size: 0 }, /4 GB/);
    bad({ action: 'recording-upload-start', fileName: 'a.mp4', size: '10' }, /4 GB/);
  });

  it('acara wajib UUID untuk semua aksi rekaman', () => {
    for (const action of RECORDING_ACTIONS) {
      expect(validateWebinarRequest({ action, id: 'x' })).toBe('Acara tidak dikenali');
    }
  });

  it('URL bagian: kunci milik acara ini, 1–20 nomor bagian unik 1..10000', () => {
    ok({ action: 'recording-part-urls', key: KEY, uploadId: 'UP-1', partNumbers: [1, 2, 3] });
    bad({ action: 'recording-part-urls', key: 'rekaman/0d41c7ac-71e9-4e11-9a80-5fee6494f602/a-1.mp4', uploadId: 'UP', partNumbers: [1] }, /Rekaman tidak dikenali/);
    bad({ action: 'recording-part-urls', key: KEY, uploadId: '', partNumbers: [1] }, /Unggahan tidak dikenali/);
    bad({ action: 'recording-part-urls', key: KEY, uploadId: 'UP', partNumbers: [] }, /Bagian/);
    bad({ action: 'recording-part-urls', key: KEY, uploadId: 'UP', partNumbers: Array.from({ length: 21 }, (_, i) => i + 1) }, /Bagian/);
    bad({ action: 'recording-part-urls', key: KEY, uploadId: 'UP', partNumbers: [0] }, /Bagian/);
    bad({ action: 'recording-part-urls', key: KEY, uploadId: 'UP', partNumbers: [10001] }, /Bagian/);
    bad({ action: 'recording-part-urls', key: KEY, uploadId: 'UP', partNumbers: [2, 2] }, /Bagian/);
  });

  it('selesai unggah: bagian urut tanpa celah, ETag wajar, durasi 1–1440 menit', () => {
    const parts = [{ partNumber: 1, etag: '"a1"' }, { partNumber: 2, etag: '"b2"' }];
    ok({ action: 'recording-upload-complete', key: KEY, uploadId: 'UP', parts, minutes: 88 });
    bad({ action: 'recording-upload-complete', key: KEY, uploadId: 'UP', parts: [parts[1], parts[0]], minutes: 88 }, /Bagian/);
    bad({ action: 'recording-upload-complete', key: KEY, uploadId: 'UP', parts: [parts[0], { partNumber: 3, etag: '"c"' }], minutes: 88 }, /Bagian/);
    bad({ action: 'recording-upload-complete', key: KEY, uploadId: 'UP', parts: [{ partNumber: 1, etag: '<x>' }], minutes: 88 }, /Bagian/);
    bad({ action: 'recording-upload-complete', key: KEY, uploadId: 'UP', parts, minutes: 0 }, /Durasi/);
    bad({ action: 'recording-upload-complete', key: KEY, uploadId: 'UP', parts, minutes: 1441 }, /Durasi/);
  });

  it('materi: path di folder acara, ekstensi dokumen', () => {
    ok({ action: 'materials-save', path: `${ID}/materi-spss-1a2b.pdf` });
    ok({ action: 'materials-save', path: `${ID}/slide.pptx` });
    bad({ action: 'materials-save', path: 'lain/materi.pdf' }, /Materi/);
    bad({ action: 'materials-save', path: `${ID}/../x.pdf` }, /Materi/);
    bad({ action: 'materials-save', path: `${ID}/x.exe` }, /Materi/);
  });

  it('terbitkan rekaman: dua centang wajib true', () => {
    ok({ action: 'recording-publish', confirmations: { speakerPermission: true, facesTrimmed: true } });
    bad({ action: 'recording-publish', confirmations: { speakerPermission: true } }, /centang/);
    bad({ action: 'recording-publish' }, /centang/);
  });
});
