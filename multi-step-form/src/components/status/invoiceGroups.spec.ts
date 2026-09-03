import { describe, it, expect } from 'vitest';
import { groupInfoFor } from './invoiceGroups';
import type { InvoiceGroup, InvoiceGroupMember } from '@/utils/supabase';

/*
  Modul ini menjawab satu pertanyaan yang salah jawabnya berarti uang: kartu
  mana yang memegang tombol bayar, dan nominal apa yang tertulis di sana.
*/

const member = (over: Partial<InvoiceGroupMember>): InvoiceGroupMember => ({
  paymentId: 'JFU-INV-abc-1',
  scheduleId: 'sch-1',
  sourceId: 'src-1',
  submissionId: 'sub-1',
  bookingId: 'BOOK1',
  title: 'Survei Satu',
  amount: 1_110_000,
  status: 'pending',
  isPaid: false,
  ordinal: 1,
  startDate: '2026-09-12T08:00:00Z',
  ...over,
});

const groupOf = (members: InvoiceGroupMember[]): Map<string, InvoiceGroup> =>
  new Map([['JFU-INV-abc-1', {
    paymentId: 'JFU-INV-abc-1',
    members,
    memberCount: members.length,
    total: members.reduce((s, m) => s + m.amount, 0),
    allPaid: members.length > 0 && members.every((m) => m.isPaid),
  }]]);

const TIGA = [
  member({ sourceId: 'src-1', title: 'Survei Satu', startDate: '2026-09-12T08:00:00Z' }),
  member({ sourceId: 'src-2', scheduleId: 'sch-2', title: 'Riset UMKM', startDate: '2026-09-15T08:00:00Z' }),
  member({ sourceId: 'src-3', scheduleId: 'sch-3', title: 'Tracer Study', startDate: '2026-09-18T08:00:00Z' }),
];

describe('groupInfoFor', () => {
  it('mengembalikan null untuk tagihan beranggota satu — N=1 tidak boleh berubah sedikit pun', () => {
    expect(groupInfoFor(groupOf([member({})]), 'JFU-INV-abc-1', 'src-1')).toBeNull();
  });

  it('mengembalikan null kalau tagihannya tidak dikenal', () => {
    expect(groupInfoFor(groupOf(TIGA), 'entah-apa', 'src-1')).toBeNull();
    expect(groupInfoFor(groupOf(TIGA), null, 'src-1')).toBeNull();
    expect(groupInfoFor(undefined, 'JFU-INV-abc-1', 'src-1')).toBeNull();
  });

  it('menjadikan anggota PALING AWAL sebagai lead, dan totalnya total grup', () => {
    const info = groupInfoFor(groupOf(TIGA), 'JFU-INV-abc-1', 'src-1')!;

    expect(info.isLead).toBe(true);
    expect(info.memberCount).toBe(3);
    // ⚠️ 3 × 1.110.000, bukan porsi satu jadwal — inilah angka yang ditagih DOKU.
    expect(info.total).toBe(3_330_000);
    expect(info.others.map((o) => o.title)).toEqual(['Riset UMKM', 'Tracer Study']);
  });

  it('anggota selain yang pertama BUKAN lead, dan diarahkan ke judul lead', () => {
    const info = groupInfoFor(groupOf(TIGA), 'JFU-INV-abc-1', 'src-3')!;

    expect(info.isLead).toBe(false);
    expect(info.leadTitle).toBe('Survei Satu');
    expect(info.others.map((o) => o.title)).toEqual(['Survei Satu', 'Riset UMKM']);
  });

  it('kartu yang tidak ada di daftar anggota dianggap PENGIKUT, bukan lead', () => {
    // Kesalahan yang lebih murah: kehilangan tombol, bukan memberi tombol
    // bernominal total grup kepada kartu yang tidak jelas asalnya.
    const info = groupInfoFor(groupOf(TIGA), 'JFU-INV-abc-1', 'src-entah')!;
    expect(info.isLead).toBe(false);
  });

  it('meneruskan allPaid apa adanya — kuitansi hanya kalau SEMUA lunas', () => {
    const sebagian = TIGA.map((m, i) => ({ ...m, isPaid: i === 0 }));
    expect(groupInfoFor(groupOf(sebagian), 'JFU-INV-abc-1', 'src-1')!.allPaid).toBe(false);

    const semua = TIGA.map((m) => ({ ...m, isPaid: true }));
    expect(groupInfoFor(groupOf(semua), 'JFU-INV-abc-1', 'src-1')!.allPaid).toBe(true);
  });
});
