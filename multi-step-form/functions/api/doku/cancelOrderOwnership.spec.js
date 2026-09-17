import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertCallerMayCancel } from './cancel-order.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  SIAPA YANG BOLEH MEMATIKAN LINK BAYAR
  ═══════════════════════════════════════════════════════════════════════════

  Sejak 2026-09-17 `cancel-order` tidak lagi admin-only — pembatalan jadwal oleh
  peneliti (Phase 4) memanggilnya. `invoice_number` datang dari BROWSER, jadi
  fungsi inilah satu-satunya yang berdiri antara "peneliti membatalkan
  tagihannya" dan "peneliti mematikan link bayar milik orang lain".

  Tes ini menjaga DUA arah yang sama mahalnya:
    - meloloskan yang tidak berhak → link orang lain mati, uangnya tertahan
    - menolak yang berhak          → pembatalan peneliti diam-diam tak berguna
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

const responseOf = (body, { ok = true, status = 200 } = {}) => ({
  ok, status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('assertCallerMayCancel', () => {
  it('admin lolos TANPA menyentuh jaringan sama sekali', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const denial = await assertCallerMayCancel(ENV, { isAdmin: true }, 'JFU-1');
    expect(denial).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('pemilik lewat auth_user_id diizinkan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([
      { form_submission_id: 's1', form_submissions: { auth_user_id: 'u1', email: 'a@b.c' } },
    ])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-1');
    expect(denial).toBeNull();
  });

  it('order lama tanpa auth_user_id dicocokkan lewat email, tidak peka huruf besar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([
      { form_submission_id: 's1', form_submissions: { auth_user_id: null, email: 'Peneliti@Kampus.AC.ID' } },
    ])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: null, authEmail: 'peneliti@kampus.ac.id', isAdmin: false }, 'JFU-1');
    expect(denial).toBeNull();
  });

  it('MENOLAK tagihan milik orang lain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([
      { form_submission_id: 's1', form_submissions: { auth_user_id: 'ORANG-LAIN', email: 'x@y.z' } },
    ])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-1');
    expect(denial).toMatch(/tidak ditemukan atau bukan milikmu/i);
  });

  it('⚠️ TAGIHAN GABUNGAN: memiliki SEBAGIAN tidak cukup', async () => {
    /*
      Cabang yang paling mudah ditulis salah. Satu `payment_id` bisa menaungi
      beberapa order (terukur 3 di produksi, terbesar 7 order). Mematikan
      link-nya mematikannya untuk SELURUH bundel, jadi `some()` akan membiarkan
      satu anggota mematikan tagihan yang juga menagih survei orang lain.
    */
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([
      { form_submission_id: 's1', form_submissions: { auth_user_id: 'u1', email: 'a@b.c' } },
      { form_submission_id: 's2', form_submissions: { auth_user_id: 'ORANG-LAIN', email: 'x@y.z' } },
    ])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-BUNDEL');
    expect(denial).toMatch(/tidak ditemukan atau bukan milikmu/i);
  });

  it('bundel yang SELURUHNYA miliknya tetap boleh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([
      { form_submission_id: 's1', form_submissions: { auth_user_id: 'u1', email: 'a@b.c' } },
      { form_submission_id: 's2', form_submissions: { auth_user_id: 'u1', email: 'a@b.c' } },
    ])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-BUNDEL');
    expect(denial).toBeNull();
  });

  it('nol baris ditolak, dan pesannya TIDAK membedakan "tidak ada" dari "bukan milikmu"', async () => {
    // Membedakannya mengubah endpoint ini jadi alat menebak nomor tagihan sah.
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-TEBAKAN');
    expect(denial).toMatch(/tidak ditemukan atau bukan milikmu/i);
  });

  it('GAGAL-TERTUTUP: tanpa service key, menolak dan TIDAK memanggil jaringan', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const denial = await assertCallerMayCancel(
      { VITE_SUPABASE_URL: 'https://db.example' },
      { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-1');
    expect(denial).toMatch(/tidak dapat memverifikasi/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('galat baca Supabase menolak, bukan meloloskan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOf({ message: 'boom' }, { ok: false, status: 500 })));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-1');
    expect(denial).toMatch(/tidak dapat memverifikasi/i);
  });

  it('sesi tanpa identitas ditolak', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const denial = await assertCallerMayCancel(ENV, { isAdmin: false }, 'JFU-1');
    expect(denial).toMatch(/sesi tidak dikenali/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('baris tanpa induk (form_submissions null) ditolak, bukan dianggap milik siapa pun', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseOf([
      { form_submission_id: null, form_submissions: null },
    ])));
    const denial = await assertCallerMayCancel(
      ENV, { authUserId: 'u1', authEmail: 'a@b.c', isAdmin: false }, 'JFU-1');
    expect(denial).toMatch(/tidak ditemukan atau bukan milikmu/i);
  });
});
