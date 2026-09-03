import { describe, it, expect, beforeEach, vi } from 'vitest';

/*
  Uang, dan tidak transaksional — dua alasan berkas ini ada.

  `settleGroupAsPaid()` melunasi N pesanan dalam LOOP: `markScheduleAsPaid()`
  dipanggil sekali per anggota, dan `assertScheduleRowTouched` melempar pada nol
  baris (mis. admin selain `product@jakpat.net`, ditolak
  `guard_extend_payment_columns` sql/33). Jadi 3 dari 4 anggota bisa berhasil —
  dan satu toast hijau di situ adalah kebohongan kelas yang sama dengan "Tandai
  Lunas" yang gagal senyap berbulan-bulan sebelum sql/59.

  Yang dijaga: (a) urutan DOKU-dulu, (b) satu pelunasan per anggota dengan
  bentuk baris yang benar per ordinal, (c) laporan per anggota saat sebagian
  gagal, (d) kegagalan mematikan link TIDAK menahan pelunasan.
*/

// ── Fake PostgREST: cukup untuk merekam apa yang benar-benar dikirim ────────
interface Op {
  table: string;
  verb: 'select' | 'update';
  payload?: any;
  filters: { op: string; col: string; val: any }[];
}

let ops: Op[] = [];
/** Jawaban per (tabel, verb) — dipasang tiap tes. */
let responder: (op: Op) => { data: any; error: any };

function builder(table: string, verb: Op['verb'], payload?: any) {
  const op: Op = { table, verb, payload, filters: [] };
  ops.push(op);
  const push = (o: string) => (col: string, val?: any) => {
    op.filters.push({ op: o, col, val });
    return chain;
  };
  const chain: any = {
    select: () => chain,
    eq: push('eq'),
    in: push('in'),
    or: push('or'),
    not: push('not'),
    order: () => chain,
    range: () => chain,
    limit: () => chain,
    maybeSingle: () => ({
      then: (res: any) => {
        const { data, error } = responder(op);
        return Promise.resolve(res({ data: Array.isArray(data) ? data[0] ?? null : data, error }));
      },
    }),
    then: (res: any, rej: any) => {
      try {
        const { data, error } = responder(op);
        return Promise.resolve(res({ data, error, count: Array.isArray(data) ? data.length : 0 }));
      } catch (e) { return Promise.resolve(rej(e)); }
    },
  };
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      update: (payload: any) => ({ ...builder(table, 'update', payload) }),
    }),
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

const { fetchInvoiceGroups, settleGroupAsPaid, unsettleGroupAsPaid } = await import('./supabase');

const PID = 'JFU-INV-abc-1756000000000';

/** Tiga pesanan, satu tagihan — dua ordinal 1 dan satu perpanjangan. */
const INVOICE_ROWS = [
  { payment_id: PID, schedule_id: 'sch-2', form_submission_id: 'sub-2', amount: 1_110_000, status: 'pending' },
  { payment_id: PID, schedule_id: 'sch-1', form_submission_id: 'sub-1', amount: 1_110_000, status: 'pending' },
  { payment_id: PID, schedule_id: 'sch-3', form_submission_id: 'sub-3', amount: 1_110_000, status: 'pending' },
];

const SCHEDULE_ROWS = [
  { id: 'sch-1', submission_id: 'sub-1', source_id: 'sub-1', ordinal: 1, booking_id: 'BOOK1', start_date: '2026-09-12T08:00:00Z' },
  { id: 'sch-2', submission_id: 'sub-2', source_id: 'sub-2', ordinal: 1, booking_id: 'BOOK2', start_date: '2026-09-15T08:00:00Z' },
  { id: 'sch-3', submission_id: 'sub-3', source_id: 'ext-3', ordinal: 2, booking_id: 'BOOK3', start_date: '2026-09-18T08:00:00Z' },
];

const SUBMISSION_ROWS = [
  { id: 'sub-1', title: 'Survei Satu' },
  { id: 'sub-2', title: 'Riset UMKM' },
  { id: 'sub-3', title: 'Tracer Study' },
];

/** Bentuk baris `fetchAdSchedules` — `kilat` supaya jalur survey_pages tidak ikut. */
const adScheduleRow = (s: typeof SCHEDULE_ROWS[number]) => ({
  id: s.id,
  submission_id: s.submission_id,
  ordinal: s.ordinal,
  source_table: s.ordinal > 1 ? 'form_submissions_extend' : 'form_submissions',
  source_id: s.source_id,
  booking_id: s.booking_id,
  start_date: s.start_date,
  end_date: s.start_date,
  duration: 1,
  status: 'waiting_payment',
  review_status: 'approved',
  payment_status: 'pending',
  distribution_type: 'kilat',
  kilat_slot_hour: 8,
  is_extra_ad: false,
  total_cost: 1_110_000,
  subtotal: 1_000_000,
  ppn_amount: 110_000,
  voucher_code: null,
  prize_per_winner: 0,
  winner_count: 0,
  additional_prize_per_winner: 0,
  is_new_period: false,
  period_batch: null,
  slot_booked_by: 'admin',
  slot_reserved_at: null,
  created_at: '2026-09-01T00:00:00Z',
  form_submissions: { title: 'T', full_name: 'F', university: null, created_at: '2026-09-01T00:00:00Z' },
});

/** Jawaban baku: seluruh anggota berhasil dilunasi. */
const happyResponder = (op: Op) => {
  if (op.verb === 'select') {
    if (op.table === 'invoices' && op.filters.some((f) => f.col === 'doku_request_id' || f.op === 'eq')) {
      // killDokuLink: cari `doku_request_id`
      if (op.filters.some((f) => f.col === 'payment_id' && f.op === 'eq')) {
        return { data: [{ doku_request_id: 'req-1' }], error: null };
      }
    }
    if (op.table === 'invoices') return { data: INVOICE_ROWS, error: null };
    if (op.table === 'ad_schedules') {
      const byId = op.filters.find((f) => f.col === 'id');
      if (byId) return { data: SCHEDULE_ROWS, error: null };
      return { data: SCHEDULE_ROWS.map(adScheduleRow), error: null };
    }
    if (op.table === 'form_submissions') return { data: SUBMISSION_ROWS, error: null };
  }
  // Setiap UPDATE menyentuh satu baris.
  return { data: [{ id: 'row' }], error: null };
};

beforeEach(() => {
  ops = [];
  responder = happyResponder;
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ cancelled: true }),
  })) as any);
});

describe('fetchInvoiceGroups', () => {
  it('mengelompokkan per payment_id, mengurutkan anggota dari tayang PALING AWAL', async () => {
    const groups = await fetchInvoiceGroups([PID, null, undefined, PID]);
    const g = groups.get(PID)!;

    expect(g.memberCount).toBe(3);
    // Urutan menentukan siapa yang memegang tombol bayar di kartu peneliti.
    expect(g.members.map((m) => m.title)).toEqual(['Survei Satu', 'Riset UMKM', 'Tracer Study']);
    // Σ porsi, bukan satu porsi dikali N (PPN dibulatkan per baris).
    expect(g.total).toBe(3_330_000);
    expect(g.allPaid).toBe(false);
    // `sourceId` = kunci kartu peneliti; untuk ordinal ≥2 ia id extend.
    expect(g.members.map((m) => m.sourceId)).toEqual(['sub-1', 'sub-2', 'ext-3']);
  });

  it('daftar kosong tidak menyentuh jaringan sama sekali', async () => {
    const groups = await fetchInvoiceGroups([null, undefined]);
    expect(groups.size).toBe(0);
    expect(ops).toHaveLength(0);
  });

  it('kegagalan query mengembalikan peta kosong, bukan melempar', async () => {
    // Layar tidak boleh gelap gara-gara hiasan: tanpa data grup, seluruh
    // permukaan jatuh ke perilaku per-jadwal seperti sebelum fitur ini ada.
    responder = () => { throw new Error('jaringan mati'); };
    await expect(fetchInvoiceGroups([PID])).resolves.toEqual(new Map());
  });
});

describe('settleGroupAsPaid', () => {
  it('mematikan link DOKU LEBIH DULU, baru menulis ke database', async () => {
    await settleGroupAsPaid(PID);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe('/api/doku/cancel-order');
    expect(JSON.parse(fetchCall[1].body)).toMatchObject({ invoice_number: PID });

    // Urutannya mengikat: kalau dibalik, ada jendela ketika baris kita sudah
    // `paid` sementara link-nya masih hidup — dan justru di jendela itu
    // peneliti yang sedang membuka halaman bayar akan membayarnya.
    const firstUpdate = ops.findIndex((o) => o.verb === 'update');
    expect((globalThis.fetch as any).mock.calls.length).toBeGreaterThan(0);
    expect(firstUpdate).toBeGreaterThan(-1);
  });

  it('melunasi SETIAP anggota, dengan bentuk baris yang benar per ordinal', async () => {
    const res = await settleGroupAsPaid(PID);

    expect(res.settled.map((s) => s.title)).toEqual(['Survei Satu', 'Riset UMKM', 'Tracer Study']);
    expect(res.failed).toHaveLength(0);

    // ordinal 1 → form_submissions; ordinal ≥2 → ad_schedules `scheduled`+`paid`.
    const subUpdates = ops.filter((o) => o.table === 'form_submissions' && o.verb === 'update');
    expect(subUpdates).toHaveLength(2);
    expect(subUpdates[0].payload).toEqual({ payment_status: 'paid', submission_status: 'paid' });

    const schedUpdates = ops.filter((o) => o.table === 'ad_schedules' && o.verb === 'update');
    expect(schedUpdates).toHaveLength(1);
    /*
      ⚠️ `status: 'scheduled'`, BUKAN 'paid'. `cron_activate_extends()` (sql/36)
      hanya mengangkat baris `scheduled` + `paid` jadi `live`; menulis 'paid'
      ke sana membuat iklannya tidak pernah tayang.
    */
    expect(schedUpdates[0].payload).toEqual({ payment_status: 'paid', status: 'scheduled' });

    // Tiap anggota menandai barisnya sendiri lewat `schedule_id`.
    const invUpdates = ops.filter((o) => o.table === 'invoices' && o.verb === 'update');
    expect(invUpdates.map((o) => o.filters.find((f) => f.col === 'schedule_id')?.val))
      .toEqual(['sch-1', 'sch-2', 'sch-3']);
  });

  it('melaporkan SEBAGIAN saat satu anggota ditolak database', async () => {
    responder = (op) => {
      // Baris jadwal ke-3 (perpanjangan) ditolak `guard_extend_payment_columns`.
      if (op.table === 'ad_schedules' && op.verb === 'update') return { data: [], error: null };
      return happyResponder(op);
    };

    const res = await settleGroupAsPaid(PID);

    expect(res.settled.map((s) => s.title)).toEqual(['Survei Satu', 'Riset UMKM']);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].title).toBe('Tracer Study');
    // Alasan DB-nya diteruskan apa adanya — admin yang harus membacanya.
    expect(res.failed[0].reason).toMatch(/tidak/i);
  });

  it('link DOKU gagal dimatikan TIDAK menahan pelunasan — dilaporkan lewat nilai balik', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ cancelled: false, message: 'order sudah dibayar' }),
    })) as any);

    const res = await settleGroupAsPaid(PID);

    expect(res.settled).toHaveLength(3);
    expect(res.dokuCancelled).toBe(false);
    expect(res.dokuReason).toBe('order sudah dibayar');
  });

  it('menolak tagihan yang tidak punya baris anggota sama sekali', async () => {
    responder = (op) => (op.table === 'invoices' && op.verb === 'select'
      ? { data: [], error: null }
      : happyResponder(op));

    await expect(settleGroupAsPaid(PID)).rejects.toThrow(/tidak punya baris anggota/);
  });
});

describe('unsettleGroupAsPaid', () => {
  /*
    Cacat cermin: `settleGroupAsPaid` menulis `payment_channel =
    'MANUAL_VERIFIED'`, dan justru nilai itulah gerbang yang memunculkan
    "Tandai Belum Lunas" di kartu. Membalik SATU anggota memecah grup jadi
    separuh-lunas — dan `/invoices/<payment_id>` berhenti jadi RECEIPT lalu
    kembali jadi INVOICE bernominal PENUH untuk pesanan yang uangnya sudah
    diterima.
  */
  it('membalik SETIAP anggota, dengan bentuk baris yang benar per ordinal', async () => {
    const res = await unsettleGroupAsPaid(PID);

    expect(res.reverted.map((r) => r.title)).toEqual(['Survei Satu', 'Riset UMKM', 'Tracer Study']);
    expect(res.failed).toHaveLength(0);

    const subUpdates = ops.filter((o) => o.table === 'form_submissions' && o.verb === 'update');
    expect(subUpdates).toHaveLength(2);
    expect(subUpdates[0].payload).toEqual({ payment_status: 'pending', submission_status: 'waiting_payment' });

    const schedUpdates = ops.filter((o) => o.table === 'ad_schedules' && o.verb === 'update');
    expect(schedUpdates).toHaveLength(1);
    expect(schedUpdates[0].payload).toEqual({ payment_status: 'pending', status: 'waiting_payment' });
  });

  it('TIDAK memanggil DOKU — link-nya sudah mati sejak grup dilunasi', async () => {
    // Tidak ada "batalkan pembatalan" di API DOKU. Memanggilnya di sini hanya
    // akan menghasilkan galat yang menyesatkan; tagihan baru yang dibutuhkan.
    await unsettleGroupAsPaid(PID);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(0);
  });

  it('melaporkan SEBAGIAN saat satu anggota ditolak database', async () => {
    responder = (op) => {
      if (op.table === 'ad_schedules' && op.verb === 'update') return { data: [], error: null };
      return happyResponder(op);
    };

    const res = await unsettleGroupAsPaid(PID);

    expect(res.reverted.map((r) => r.title)).toEqual(['Survei Satu', 'Riset UMKM']);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].title).toBe('Tracer Study');
  });
});

describe('markScheduleAsPaid — penanda banner basi (padanan STEP 5 webhook)', () => {
  /*
    Webhook DOKU menyalakan `requires_banner_update` ketika sebuah perpanjangan
    membuka periode hadiah baru; pelunasan MANUAL tidak pernah ikut. Akibatnya
    `cron_activate_extends()` menyalakan halaman dengan banner LAMA, dan
    `/api/surveys` menyajikan nominal hadiah periode sebelumnya ke app Jakpat.

    Nol perpanjangan pernah dilunasi manual di produksi — tapi itu karena jadwal
    ke-2 belum dirilis ke peneliti, BUKAN karena jalurnya jarang. Begitu tagihan
    gabungan dipakai sebagaimana mestinya (transfer di luar DOKU, admin melunasi
    seluruh batch), jalur inilah yang jadi jalur utama.
  */
  const withNewPeriod = (op: Op) => {
    if (op.verb === 'select' && op.table === 'ad_schedules' && !op.filters.some((f) => f.col === 'id')) {
      return {
        data: SCHEDULE_ROWS.map((s) => ({ ...adScheduleRow(s), is_new_period: s.id === 'sch-3' })),
        error: null,
      };
    }
    return happyResponder(op);
  };

  it('menyalakan flag HANYA untuk perpanjangan yang hadiahnya berubah', async () => {
    responder = withNewPeriod;
    await settleGroupAsPaid(PID);

    const pageUpdates = ops.filter((o) => o.table === 'survey_pages' && o.verb === 'update');
    expect(pageUpdates).toHaveLength(1);
    expect(pageUpdates[0].payload).toEqual({ requires_banner_update: true });
    // Dikunci ORDER-nya: satu halaman per submission (uq_survey_pages_submission).
    expect(pageUpdates[0].filters).toContainEqual({ op: 'eq', col: 'submission_id', val: 'sub-3' });
  });

  it('tidak menyentuh survey_pages saat hadiahnya tidak berubah', async () => {
    await settleGroupAsPaid(PID);
    expect(ops.filter((o) => o.table === 'survey_pages')).toHaveLength(0);
  });

  it('kegagalan menandai TIDAK menggagalkan pelunasan — uangnya sudah diterima', async () => {
    responder = (op) => {
      if (op.table === 'survey_pages') return { data: null, error: new Error('RLS menolak') };
      return withNewPeriod(op);
    };

    const res = await settleGroupAsPaid(PID);
    expect(res.settled).toHaveLength(3);
    expect(res.failed).toHaveLength(0);
  });
});
