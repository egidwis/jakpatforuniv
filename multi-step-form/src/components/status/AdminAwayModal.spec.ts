import { beforeEach, describe, expect, test, vi } from 'vitest';

/*
  Pintu modal mode libur (sql/122). Store libur ditiru: yang diuji keputusan
  `awayGuard` / `awayBlocksKilatPick` — kapan aksi langsung jalan, kapan
  modal menahannya.
*/
let away: { since: string; message: string; messageEn: string } | null = null;
const acked = new Set<string>();

vi.mock('@/utils/operationalHolidays', () => ({
  getAdminAway: () => away,
  isAwayAcked: (since: string) => acked.has(since),
  ackAway: (since: string) => { acked.add(since); },
  awayMessageFor: (a: any) => a.message,
  useAdminAway: () => away,
}));

const { awayBlocksKilatPick, awayGuard, awayGuardWouldOpen, awayModalVariant, copyOf } = await import('./AdminAwayModal');
const { translations } = await import('@/i18n/translations');

beforeEach(() => {
  away = null;
  acked.clear();
});

describe('awayModalVariant — tabel §4/§6 rencana', () => {
  test.each([
    [{ kind: 'submit', product: 'ads', path: 'schedule' }, 'A'],
    [{ kind: 'submit', product: 'ads', path: 'pay' }, 'A'],
    [{ kind: 'submit', product: 'ads', path: 'review' }, 'B'],
    [{ kind: 'submit', product: 'kilat', path: 'review' }, 'B'],
    [{ kind: 'submit', product: 'kilat', path: 'kilat_away' }, 'C'],
    [{ kind: 'pay', product: 'ads' }, 'D'],
    [{ kind: 'pay', product: 'kilat', wave: 'Sen 28 Des · 11.00 WIB' }, 'E'],
    [{ kind: 'kilat_pick', leave: true }, 'F'],
  ] as const)('%o → %s', (ctx, variant) => {
    expect(awayModalVariant(ctx as any)).toBe(variant);
  });
});

describe('awayGuard', () => {
  const ctx = { kind: 'pay', product: 'ads' } as const;

  test('tidak libur → aksi langsung jalan, tanpa modal', () => {
    const action = vi.fn();
    awayGuard(ctx, action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(awayGuardWouldOpen()).toBe(false);
  });

  test('libur & belum di-ack → aksi DITAHAN (menunggu Lanjutkan)', () => {
    away = { since: '2026-12-24', message: '', messageEn: '' };
    const action = vi.fn();
    expect(awayGuardWouldOpen()).toBe(true);
    awayGuard(ctx, action);
    expect(action).not.toHaveBeenCalled();
  });

  test('libur & sudah di-ack masa libur ini → aksi langsung jalan', () => {
    away = { since: '2026-12-24', message: '', messageEn: '' };
    acked.add('2026-12-24');
    const action = vi.fn();
    awayGuard(ctx, action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('ack masa libur LAIN tidak berlaku', () => {
    away = { since: '2027-01-02', message: '', messageEn: '' };
    acked.add('2026-12-24');
    expect(awayGuardWouldOpen()).toBe(true);
  });
});

describe('awayBlocksKilatPick (modal F, pemblokir)', () => {
  test('tidak libur → false (pemanggil lanjut)', () => {
    expect(awayBlocksKilatPick({ leave: false })).toBe(false);
  });

  test('libur → true, walau sudah di-ack (F tidak pernah bisa dilewati)', () => {
    away = { since: '2026-12-24', message: '', messageEn: '' };
    acked.add('2026-12-24');
    expect(awayBlocksKilatPick({ leave: true })).toBe(true);
  });
});

/*
  26 Okt 2026 — tiap varian modal libur memuat SATU pesan utuh. Dulu pesannya
  dipecah (sorotan + catatan + "Ada kendala? Laporkan saja…") dan terbaca
  seperti tiga info terpisah. Yang dijaga: tidak ada lagi baris kontak/catatan,
  dan tiap pesan menjawab apa yang berjalan dan apa yang menunggu.
*/
describe('copyOf — satu pesan utuh per varian', () => {
  const tFor = (lang: 'id' | 'en') => (key: string, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce(
      (text, [k, v]) => text.split(`{${k}}`).join(v),
      (translations[lang] as Record<string, string>)[key],
    );
  const ctxs = [
    { kind: 'submit', product: 'ads', path: 'schedule' },
    { kind: 'submit', product: 'ads', path: 'review' },
    { kind: 'submit', product: 'kilat', path: 'review' },
    { kind: 'submit', product: 'kilat', path: 'kilat_away' },
    { kind: 'pay', product: 'ads', schedule: 'Sen 28 Des' },
    { kind: 'pay', product: 'kilat', wave: 'Sen 28 Des · 11.00 WIB' },
    { kind: 'kilat_pick', leave: false },
  ] as const;

  test.each(ctxs)('%o: pesan terisi penuh, tanpa baris kontak terpisah', (ctx) => {
    for (const lang of ['id', 'en'] as const) {
      const copy = copyOf(ctx as any, tFor(lang) as any);
      expect(copy.highlight, lang).toBeTruthy();
      expect(copy.highlight, lang).not.toMatch(/\{\w+\}/);        // tak ada variabel tersisa
      expect(copy, lang).not.toHaveProperty('contact');
      expect(copy, lang).not.toHaveProperty('notes');
    }
  });

  test('iklan tetap tayang: menenangkan & tanpa menunggu admin (A, D)', () => {
    const a = copyOf({ kind: 'submit', product: 'ads', path: 'schedule' }, tFor('id') as any);
    const d = copyOf({ kind: 'pay', product: 'ads', schedule: 'Sen 28 Des' }, tFor('id') as any);
    for (const copy of [a, d]) {
      expect(copy.tone).toBe('go');
      expect(copy.highlight).toMatch(/^Tenang/);
      expect(copy.highlight).toContain('tanpa menunggu admin masuk');
      expect(copy.highlight).not.toMatch(/kendala|laporkan/i);
    }
    expect(d.highlight).toContain('Sen 28 Des');
  });

  test('review manual: Iklan menyebut jadwal, Kilat menyebut gelombang', () => {
    const ads = copyOf({ kind: 'submit', product: 'ads', path: 'review' }, tFor('id') as any);
    const kilat = copyOf({ kind: 'submit', product: 'kilat', path: 'review' }, tFor('id') as any);
    expect(ads.highlight).toContain('menjadwalkan iklanmu');
    expect(kilat.highlight).toContain('gelombang push');
    expect(kilat.highlight).not.toMatch(/iklan/i);
  });

  test('Kilat dialihkan & pemilih diblokir: ordernya aman, belum ada pembayaran / tidak ada yang berubah', () => {
    const c = copyOf({ kind: 'submit', product: 'kilat', path: 'kilat_away' }, tFor('id') as any);
    const f = copyOf({ kind: 'kilat_pick', leave: false }, tFor('id') as any);
    expect(c.highlight).toContain('belum ada pembayaran');
    expect(f.highlight).toContain('ordermu aman');
  });
});
