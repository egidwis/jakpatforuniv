import { describe, it, expect } from 'vitest';
import {
  transactionStatusChip,
  matchesStatusFilter,
  statusFilterLabel,
  STATUS_FILTER_IDS,
} from './types';

/**
 * Bug yang diuji di sini nyata dan diam: `STATUS_LABELS`/`STATUS_CHIP_VARIANTS`
 * dulu `Record<'pending'|'completed'|'failed', …>`, sementara produksi memuat
 * `cancelled` (10), `paid` (8), dan `expired` (7). Lookup-nya `undefined` di
 * KEDUA peta, dan `undefined` tidak melempar apa pun — ia merender pil abu-abu
 * kosong. Tidak ada type error, tidak ada runtime error, cuma 25 baris bisu
 * senilai Rp 12.031.460.
 */
describe('transactionStatusChip', () => {
  it('menamai kelima status yang benar-benar ada di produksi', () => {
    expect(transactionStatusChip('completed')).toEqual({ label: 'Lunas', variant: 'green' });
    expect(transactionStatusChip('pending')).toEqual({ label: 'Menunggu', variant: 'amber' });
    expect(transactionStatusChip('cancelled')).toEqual({ label: 'Dibatalkan', variant: 'slate' });
    expect(transactionStatusChip('expired')).toEqual({ label: 'Kedaluwarsa', variant: 'red' });
    expect(transactionStatusChip('paid')).toEqual({ label: 'Lunas', variant: 'green' });
  });

  it('menyamakan `paid` dengan `completed` — DOKU menulis lunas dengan dua kata', () => {
    expect(transactionStatusChip('paid')).toEqual(transactionStatusChip('completed'));
  });

  it('membedakan dibatalkan dari kedaluwarsa', () => {
    // "tidak ada yang kedaluwarsa, ada yang memutuskan" — bedanya dijaga
    // di seluruh repo, jadi chipnya tidak boleh menyamakannya.
    expect(transactionStatusChip('cancelled').label)
      .not.toBe(transactionStatusChip('expired').label);
    expect(transactionStatusChip('cancelled').variant)
      .not.toBe(transactionStatusChip('expired').variant);
  });

  it('menormalkan huruf besar & spasi — statusnya ditulis gateway', () => {
    expect(transactionStatusChip('  CANCELLED ')).toEqual({ label: 'Dibatalkan', variant: 'slate' });
    expect(transactionStatusChip('Paid')).toEqual({ label: 'Lunas', variant: 'green' });
  });

  it('MENAMPILKAN status tak dikenal apa adanya, tidak pernah kosong', () => {
    // Inti perbaikannya. Kata status berikutnya yang lahir hanya di satu sisi
    // harus terbaca di layar sebagai teks mentah — jelek, tapi terlihat.
    expect(transactionStatusChip('refunded')).toEqual({ label: 'refunded', variant: 'slate' });
    expect(transactionStatusChip('sesuatu_yang_baru').label).toBeTruthy();
  });

  it('tidak pernah mengembalikan label kosong, bahkan untuk nilai kosong', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(transactionStatusChip(v).label).toBe('—');
      expect(transactionStatusChip(v).variant).toBe('slate');
    }
  });
});

describe('matchesStatusFilter', () => {
  it('"all" meloloskan apa pun', () => {
    expect(matchesStatusFilter({ status: 'apa pun' }, 'all')).toBe(true);
  });

  it('"completed" ikut memuat `paid` — cocok dengan angka Pendapatan', () => {
    // Kalau ini berubah jadi kesetaraan biasa, 8 pembayaran nyata senilai
    // Rp 3.447.500 hilang dari daftar tersaring sementara totalnya tetap
    // menghitungnya, dan jumlah baris tak akan pernah cocok dengan totalnya.
    expect(matchesStatusFilter({ status: 'completed' }, 'completed')).toBe(true);
    expect(matchesStatusFilter({ status: 'paid' }, 'completed')).toBe(true);
    expect(matchesStatusFilter({ status: 'pending' }, 'completed')).toBe(false);
  });

  it('menyaring status mati secara terpisah', () => {
    expect(matchesStatusFilter({ status: 'cancelled' }, 'cancelled')).toBe(true);
    expect(matchesStatusFilter({ status: 'expired' }, 'cancelled')).toBe(false);
    expect(matchesStatusFilter({ status: 'expired' }, 'expired')).toBe(true);
  });

  it('menormalkan status baris sebelum mencocokkan', () => {
    expect(matchesStatusFilter({ status: ' Cancelled ' }, 'cancelled')).toBe(true);
  });
});

describe('daftar filter', () => {
  it('tidak menawarkan `failed` — nol baris di produksi, selamanya', () => {
    expect(STATUS_FILTER_IDS).not.toContain('failed');
  });

  it('menawarkan justru tiga status yang dulu bisu', () => {
    expect(STATUS_FILTER_IDS).toContain('cancelled');
    expect(STATUS_FILTER_IDS).toContain('expired');
  });

  it('setiap filter punya label yang bukan kosong', () => {
    expect(statusFilterLabel('all')).toBe('Semua');
    for (const id of STATUS_FILTER_IDS) {
      expect(statusFilterLabel(id)).toBeTruthy();
      expect(statusFilterLabel(id)).not.toBe('—');
    }
  });
});
