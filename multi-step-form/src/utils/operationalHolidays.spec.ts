import { describe, expect, test, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const {
  ackAway,
  adminAwayOf,
  adminAwayWrites,
  awayMessageFor,
  createAdminAwayStore,
  isAwayAcked,
} = await import('./operationalHolidays');
const { checkoutPath } = await import('./review-path');
const { kilatWaveErrorKind } = await import('./dailyQuotaError');
const { kilatWaveErrorMessageKey } = await import('./kilatWaves');
const { isAutoReviewed } = await import('../components/status/deriveOrderUiState');
const { awayDayCount } = await import('../components/submissions/AdminAwayToggle');

/*
  Mode libur (sql/120, keputusan 21 Okt 2026). Penutupan Kilat di server
  dibuktikan dengan DIJALANKAN di harness PGlite berkas sql/120; di sini aturan
  klien: tulisan toggle, store bersama, ack modal, dan percabangan Ringkasan.
*/

const row = (date: string, isActive = true, label = '', labelEn = '') => ({ date, label, labelEn, isActive });

describe('adminAwayWrites', () => {
  test('nyalakan = tanggal WIB hari ini, bukan tanggal device (24 Des 17.30 UTC = 25 Des WIB)', () => {
    expect(adminAwayWrites({ kind: 'on', message: '  Libur Natal ' }, [], new Date('2026-12-24T17:30:00Z')))
      .toEqual([{ date: '2026-12-25', isActive: true, label: 'Libur Natal' }]);
  });

  test('ubah pesan = tanggal baris aktif, tidak melahirkan masa libur kedua', () => {
    expect(adminAwayWrites({ kind: 'edit', message: 'Kembali Senin' }, [row('2026-12-24')], new Date('2026-12-26T03:00:00Z')))
      .toEqual([{ date: '2026-12-24', isActive: true, label: 'Kembali Senin' }]);
  });

  test('matikan = SETIAP baris aktif, tanpa label (pesan tidak dikosongkan)', () => {
    expect(adminAwayWrites({ kind: 'off' }, [row('2026-12-24'), row('2026-12-20'), row('2026-11-01', false)]))
      .toEqual([{ date: '2026-12-24', isActive: false }, { date: '2026-12-20', isActive: false }]);
  });
});

describe('adminAwayOf & awayMessageFor', () => {
  test('baris aktif terbaru = masa libur berjalan; tidak ada yang aktif = null', () => {
    expect(adminAwayOf([row('2026-12-20', true, 'lama'), row('2026-12-24', true, 'baru', 'new')]))
      .toEqual({ since: '2026-12-24', message: 'baru', messageEn: 'new' });
    expect(adminAwayOf([row('2026-12-24', false)])).toBeNull();
  });

  test('EN memakai terjemahan; terjemahan kosong jatuh ke teks Indonesia', () => {
    const away = { since: '2026-12-24', message: 'Libur Natal', messageEn: 'Christmas holiday' };
    expect(awayMessageFor(away, 'en')).toBe('Christmas holiday');
    expect(awayMessageFor(away, 'id')).toBe('Libur Natal');
    expect(awayMessageFor({ ...away, messageEn: '' }, 'en')).toBe('Libur Natal');
  });
});

describe('ack modal per masa libur', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  };

  test('Lanjutkan dicatat; masa libur lain (since lain) tidak ikut ter-ack', () => {
    const s = mem();
    expect(isAwayAcked('2026-12-24', s)).toBe(false);
    ackAway('2026-12-24', s);
    expect(isAwayAcked('2026-12-24', s)).toBe(true);
    expect(isAwayAcked('2027-01-02', s)).toBe(false);
  });

  test('storage yang melempar = belum di-ack, tidak memecahkan halaman', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => ackAway('2026-12-24', broken)).not.toThrow();
    expect(isAwayAcked('2026-12-24', broken)).toBe(false);
  });
});

describe('store bersama', () => {
  test('banyak pemakai = SATU permintaan; gagal baca mempertahankan keadaan terakhir', async () => {
    const away = { since: '2026-12-24', message: 'x', messageEn: '' };
    const fetcher = vi.fn<() => Promise<typeof away | null>>().mockResolvedValue(away);
    const store = createAdminAwayStore(fetcher);
    const offs = [store.subscribe(() => {}), store.subscribe(() => {}), store.subscribe(() => {})];
    await store.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual(away);

    fetcher.mockRejectedValueOnce(new Error('offline'));
    await store.refresh();
    expect(store.get()).toEqual(away);
    offs.forEach((off) => off());
  });

  test('pemberitahuan hanya saat keadaan berubah', async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    const store = createAdminAwayStore(fetcher);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await store.refresh();
    await store.refresh();
    expect(listener).not.toHaveBeenCalled();
    fetcher.mockResolvedValue({ since: '2026-12-24', message: '', messageEn: '' });
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('checkoutPath (Ringkasan)', () => {
  const base = { isAutoApproval: true, isKilat: false, hasSchedule: false, away: false };

  test('tanpa libur: perilaku lama', () => {
    expect(checkoutPath(base)).toBe('schedule');
    expect(checkoutPath({ ...base, hasSchedule: true })).toBe('pay');
    expect(checkoutPath({ ...base, isAutoApproval: false })).toBe('review');
    expect(checkoutPath({ ...base, isKilat: true })).toBe('schedule');
  });

  test('libur: HANYA Kilat jalur otomatis yang dialihkan — termasuk yang sudah membawa gelombang', () => {
    expect(checkoutPath({ ...base, isKilat: true, away: true })).toBe('kilat_away');
    expect(checkoutPath({ ...base, isKilat: true, away: true, hasSchedule: true })).toBe('kilat_away');
    expect(checkoutPath({ ...base, away: true })).toBe('schedule');
    expect(checkoutPath({ ...base, away: true, isAutoApproval: false, isKilat: true })).toBe('review');
  });
});

describe('penanda jalur manual karena libur', () => {
  const auto = {
    submission_method: 'google_import',
    survey_url: 'https://docs.google.com/forms/d/x',
    detected_keywords: [],
    voucher_code: '',
  } as any;

  test('isAutoReviewed: forced_manual_reason membuat order Google Form tetap manual', () => {
    expect(isAutoReviewed(auto)).toBe(true);
    expect(isAutoReviewed({ ...auto, forced_manual_reason: 'admin_away' })).toBe(false);
  });

  test('HINT kilat_admin_away → teguran libur', () => {
    expect(kilatWaveErrorKind({ hint: 'kilat_admin_away' })).toBe('away');
    expect(kilatWaveErrorMessageKey('away')).toBe('kilatErrorWaveHoliday');
    expect(kilatWaveErrorMessageKey('full')).toBe('errorSlotFullKilat');
    expect(kilatWaveErrorMessageKey('closed')).toBe('kilatErrorWaveClosed');
  });
});

describe('awayDayCount (strip admin)', () => {
  test('hari nyala = 1, dihitung menurut kalender WIB', () => {
    expect(awayDayCount('2026-12-24', new Date('2026-12-24T03:00:00Z'))).toBe(1);
    expect(awayDayCount('2026-12-24', new Date('2026-12-26T03:00:00Z'))).toBe(3);
    // 26 Des 17.30 UTC = 27 Des WIB
    expect(awayDayCount('2026-12-24', new Date('2026-12-26T17:30:00Z'))).toBe(4);
  });
});
