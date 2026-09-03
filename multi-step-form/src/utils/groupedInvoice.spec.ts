import { describe, it, expect } from 'vitest';
import {
  MATERAI_THRESHOLD, buildInvoiceDocument, groupMeta, sourceIdOf, type DocRow,
} from './groupedInvoice';

const row = (o: Partial<DocRow> = {}): DocRow => ({
  payment_id: 'JFU-INV-abc-1',
  form_submission_id: 'o1',
  amount: 222000,
  subtotal: 200000,
  ppn_amount: 22000,
  status: 'pending',
  note: JSON.stringify({ memo: '', items: [{ name: 'Iklan', qty: 1, price: 200000, category: 'ads' }] }),
  form_submissions: { id: 'o1', title: 'Survei A', start_date: '2026-09-04T08:00:00Z', duration: 7 },
  ...o,
});

describe('sourceIdOf', () => {
  it('ordinal 1 memakai form_submission_id', () => {
    expect(sourceIdOf(row())).toBe('o1');
  });

  it('jadwal ke-2 dst. memakai extend_id', () => {
    expect(sourceIdOf(row({ entity_type: 'extend', extend_id: 'ext-9' }))).toBe('ext-9');
  });
});

describe('buildInvoiceDocument — N=1 harus identik dengan perilaku lama', () => {
  it('satu baris menghasilkan satu bundel dengan angka barisnya sendiri', () => {
    const doc = buildInvoiceDocument([row()]);
    expect(doc.bundles).toHaveLength(1);
    expect(doc.subtotal).toBe(200000);
    expect(doc.ppn).toBe(22000);
    expect(doc.total).toBe(222000);
    expect(doc.isPaid).toBe(false);
    expect(doc.showMaterai).toBe(false);
  });

  it('baris lunas tunggal = RECEIPT', () => {
    expect(buildInvoiceDocument([row({ status: 'paid' })]).isPaid).toBe(true);
    expect(buildInvoiceDocument([row({ status: 'completed' })]).isPaid).toBe(true);
  });

  it('note kosong jatuh ke satu item "Pembayaran"', () => {
    const doc = buildInvoiceDocument([row({ note: null })]);
    expect(doc.bundles[0].items).toHaveLength(1);
    expect(doc.bundles[0].items[0].category).toBe('Pembayaran');
  });

  it('note yang rusak tidak melempar', () => {
    const doc = buildInvoiceDocument([row({ note: '{bukan json' })]);
    expect(doc.bundles[0].items).toHaveLength(1);
  });
});

describe('buildInvoiceDocument — grup', () => {
  const groupRows = [
    row({ form_submission_id: 'o1', form_submissions: { id: 'o1', title: 'Survei A' } }),
    row({
      form_submission_id: 'o2',
      amount: 388500, subtotal: 350000, ppn_amount: 38500,
      note: JSON.stringify({ items: [{ name: 'Iklan B', qty: 1, price: 350000 }] }),
      form_submissions: { id: 'o2', title: 'Survei B' },
    }),
  ];

  it('tiap pesanan jadi bundel sendiri dengan judulnya sendiri', () => {
    const doc = buildInvoiceDocument(groupRows);
    expect(doc.bundles.map((b) => b.title)).toEqual(['Survei A', 'Survei B']);
  });

  it('tidak ada item yang tercetak dua kali', () => {
    const doc = buildInvoiceDocument(groupRows);
    expect(doc.bundles[0].items).toHaveLength(1);
    expect(doc.bundles[1].items).toHaveLength(1);
    expect(doc.bundles[0].items[0].name).toBe('Iklan');
    expect(doc.bundles[1].items[0].name).toBe('Iklan B');
  });

  it('total = Σ baris, dan PPN dijumlahkan per baris', () => {
    const doc = buildInvoiceDocument(groupRows);
    expect(doc.subtotal).toBe(550000);
    expect(doc.ppn).toBe(22000 + 38500);
    expect(doc.total).toBe(222000 + 388500);
  });

  it('PPN grup TIDAK dihitung ulang dari subtotal grup', () => {
    // Pembulatan per baris ≠ pembulatan grup; kalau di sini meleset, total
    // kuitansi tidak sama dengan yang benar-benar ditagih DOKU.
    const odd = [
      row({ subtotal: 105005, ppn_amount: 11551, amount: 116556 }),
      row({ form_submission_id: 'o2', subtotal: 105005, ppn_amount: 11551, amount: 116556 }),
    ];
    const doc = buildInvoiceDocument(odd);
    expect(doc.ppn).toBe(23102);
    expect(doc.ppn).not.toBe(Math.round(210010 * 0.11));
  });

  it('RECEIPT hanya kalau SEMUA baris lunas', () => {
    // "Setengah lunas" bukan hipotetis: markScheduleAsPaid berlingkup schedule_id,
    // jadi admin bisa melunasi satu anggota grup sendirian.
    const half = [
      row({ status: 'paid' }),
      row({ form_submission_id: 'o2', status: 'pending' }),
    ];
    expect(buildInvoiceDocument(half).isPaid).toBe(false);
    expect(buildInvoiceDocument(half.map((r) => ({ ...r, status: 'paid' }))).isPaid).toBe(true);
  });

  it('meterai memakai TOTAL GRUP, bukan porsi satu pesanan', () => {
    // 4 × Rp 1,5jt: tak satu pun melewati ambang sendirian, grupnya melewati.
    const four = Array.from({ length: 4 }, (_, i) => row({
      form_submission_id: `o${i}`,
      subtotal: 1_500_000, ppn_amount: 165_000, amount: 1_665_000,
    }));
    const doc = buildInvoiceDocument(four);
    expect(doc.total).toBeGreaterThan(MATERAI_THRESHOLD);
    expect(doc.showMaterai).toBe(true);
    expect(buildInvoiceDocument([four[0]]).showMaterai).toBe(false);
  });

  it('memakai jadwal per bundel dari peta, bukan satu jadwal untuk semua', () => {
    const schedules = new Map([
      ['o1', { startDate: '2026-09-04T08:00:00Z', duration: 7 }],
      ['o2', { startDate: '2026-09-11T08:00:00Z', duration: 3 }],
    ]);
    const doc = buildInvoiceDocument(groupRows, schedules);
    expect(doc.bundles[0].schedule.startDate).toBe('2026-09-04T08:00:00Z');
    expect(doc.bundles[1].schedule.startDate).toBe('2026-09-11T08:00:00Z');
    expect(doc.bundles[1].schedule.duration).toBe(3);
  });

  it('bundel tanpa entri jadwal jatuh ke billed_start_date-nya sendiri', () => {
    const doc = buildInvoiceDocument([row({ billed_start_date: '2026-10-01T08:00:00Z', form_submissions: null })]);
    expect(doc.bundles[0].schedule.startDate).toBe('2026-10-01T08:00:00Z');
  });
});

describe('koreksi item Kilat 250rb → 200rb', () => {
  const kilatRow = (o: Partial<DocRow> = {}) => row({
    subtotal: 999, ppn_amount: 1, amount: 1000, // sengaja salah — harus diabaikan
    note: JSON.stringify({ items: [{ name: 'Add-on JFU Kilat', qty: 1, price: 250000 }] }),
    ...o,
  });

  it('menghitung ulang dari item dan mengabaikan angka tersimpan', () => {
    const doc = buildInvoiceDocument([kilatRow()]);
    expect(doc.subtotal).toBe(200000);
    expect(doc.ppn).toBe(22000);
    expect(doc.total).toBe(222000);
    expect(doc.itemsWereCorrected).toBe(true);
  });

  it('di grup, koreksi satu baris tidak menyusutkan total jadi porsi satu pesanan', () => {
    // Inilah kegagalan yang paling mahal: kuitansi yang totalnya tinggal
    // sepotong, pada dokumen yang dipakai pertanggungjawaban dana kampus.
    const doc = buildInvoiceDocument([kilatRow(), row({ form_submission_id: 'o2' })]);
    expect(doc.total).toBe(222000 + 222000);
    expect(doc.bundles).toHaveLength(2);
  });

  it('mengganti kata "Incentive" jadi "Reward"', () => {
    const doc = buildInvoiceDocument([row({
      note: JSON.stringify({ items: [{ name: "Respondent's Incentive", qty: 1, price: 100000 }] }),
    })]);
    expect(doc.bundles[0].items[0].name).toBe("Respondent's Reward");
  });
});

describe('groupMeta', () => {
  it('paid_at PALING AKHIR — grup baru lunas saat baris terakhirnya lunas', () => {
    const m = groupMeta([
      { paid_at: '2026-09-01T00:00:00.000Z' },
      { paid_at: '2026-09-03T00:00:00.000Z' },
    ]);
    expect(m.paid_at).toBe('2026-09-03T00:00:00.000Z');
  });

  it('expires_at PALING AWAL — grup mati saat baris pertamanya kedaluwarsa', () => {
    const m = groupMeta([
      { expires_at: '2026-09-08T00:00:00.000Z' },
      { expires_at: '2026-09-04T00:00:00.000Z' },
    ]);
    expect(m.expires_at).toBe('2026-09-04T00:00:00.000Z');
  });

  it('null saat tidak ada satu pun nilainya', () => {
    expect(groupMeta([{ paid_at: null, expires_at: null }])).toEqual({ paid_at: null, expires_at: null });
    expect(groupMeta([])).toEqual({ paid_at: null, expires_at: null });
  });
});

describe('buildInvoiceDocument — grup SEPARUH lunas (keadaan ketiga)', () => {
  /*
    `isPaid` menjawab "semua lunas?", dan jawabannya `false` sama untuk grup yang
    nol rupiah masuk DAN grup yang 2 dari 3 pesanannya sudah dibayar. Sebelum
    ini keduanya dirender identik: INVOICE bernominal PENUH lengkap dengan
    tombol bayar — mengundang pembayaran kedua atas uang yang sudah diterima.

    Bisa terjadi lewat dua jalan: `unmarkScheduleAsPaid` membalik satu anggota,
    atau `settleGroupAsPaid` gagal di anggota terakhir (loopnya tidak
    transaksional).
  */
  const tiga = (statuses: string[]) =>
    statuses.map((status, i) =>
      row({ status, form_submission_id: `o${i + 1}`, form_submissions: { id: `o${i + 1}`, title: `Survei ${i + 1}` } }),
    );

  it('menghitung yang sudah masuk dan SISANYA, bukan cuma total', () => {
    const doc = buildInvoiceDocument(tiga(['paid', 'pending', 'paid']));

    expect(doc.total).toBe(666000);
    expect(doc.paidTotal).toBe(444000);
    expect(doc.outstanding).toBe(222000);
    expect(doc.isPartiallyPaid).toBe(true);
    // Tetap BUKAN kuitansi — satu baris belum lunas.
    expect(doc.isPaid).toBe(false);
  });

  it('nol rupiah masuk BUKAN "sebagian lunas"', () => {
    const doc = buildInvoiceDocument(tiga(['pending', 'pending', 'pending']));
    expect(doc.paidTotal).toBe(0);
    expect(doc.outstanding).toBe(666000);
    expect(doc.isPartiallyPaid).toBe(false);
  });

  it('semua lunas BUKAN "sebagian lunas" — itu kuitansi', () => {
    const doc = buildInvoiceDocument(tiga(['paid', 'completed', 'paid']));
    expect(doc.isPaid).toBe(true);
    expect(doc.isPartiallyPaid).toBe(false);
    expect(doc.outstanding).toBe(0);
  });

  it('N=1 tidak pernah "sebagian lunas"', () => {
    expect(buildInvoiceDocument([row({ status: 'pending' })]).isPartiallyPaid).toBe(false);
    expect(buildInvoiceDocument([row({ status: 'paid' })]).isPartiallyPaid).toBe(false);
  });
});
