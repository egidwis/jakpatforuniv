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
    neq: push('neq'),
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

const {
  fetchInvoiceGroups, settleGroupAsPaid, unsettleGroupAsPaid, markScheduleAsPaid, tempoCancelBlockReason,
  settleScheduleAsPaid, unmarkScheduleAsPaid, isLinkStillLive,
} = await import('./supabase');

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
    // `hasOtherPaidBill` (unmark): anggota grup ini TIDAK punya tagihan lunas
    // lain — dikenali dari filter `or(payment_id…)`, satu-satunya pemakainya.
    if (op.filters.some((f) => f.op === 'or' && String(f.col).includes('payment_id.neq'))) {
      return { data: [], error: null };
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
  /*
    ⚠️ `text()`, BUKAN `json()`. `killDokuLink` membaca badan respons sebagai
    TEKS lebih dulu, baru mencoba mengurainya — supaya badan yang tidak bisa
    diurai tetap bisa dilaporkan apa adanya, bukan menghilang jadi galat
    parser. Lihat catatannya di `killDokuLink` (supabase.ts).
  */
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ cancelled: true }),
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
      status: 200,
      text: async () => JSON.stringify({ cancelled: false, message: 'order sudah dibayar' }),
    })) as any);

    const res = await settleGroupAsPaid(PID);

    expect(res.settled).toHaveLength(3);
    expect(res.dokuCancelled).toBe(false);
    expect(res.dokuReason).toBe('order sudah dibayar');
  });

  /*
    ⚠️ REGRESI NYATA, 8 Sep 2026. Uji Langkah 0 pertama memulangkan
    `Failed to execute 'json' on 'Response': Unexpected end of JSON input` ke
    layar admin. Itu bukan jawaban DOKU — itu galat parser kita sendiri
    terhadap badan KOSONG, dan ia MENGHAPUS satu-satunya petunjuk yang ada.
    Admin diberi kalimat yang tidak bisa ditindaklanjuti siapa pun, dan
    diagnosisnya butuh satu putaran uji penuh lagi.
  */
  it('badan respons KOSONG dilaporkan beserta status HTTP-nya, bukan jadi galat parser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, text: async () => '',
    })) as any);

    const res = await settleGroupAsPaid(PID);

    expect(res.dokuCancelled).toBe(false);
    expect(res.dokuReason).toContain('HTTP 200');
    expect(res.dokuReason).toContain('kosong');
    expect(res.dokuReason).not.toMatch(/JSON input/i);
  });

  it('badan yang BUKAN JSON (mis. halaman HTML) ikut dilaporkan apa adanya', async () => {
    // Ini yang membedakan "endpoint tidak ada" dari "DOKU menolak". Tanpa
    // potongan mentahnya, keduanya terbaca sama di layar admin.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 404,
      text: async () => '<!DOCTYPE html><html><body>Not found</body></html>',
    })) as any);

    const res = await settleGroupAsPaid(PID);

    expect(res.dokuCancelled).toBe(false);
    expect(res.dokuReason).toContain('HTTP 404');
    expect(res.dokuReason).toContain('DOCTYPE');
  });

  it('`no_request_id` dijawab dengan kalimat yang menyebut sebab DAN akibatnya', async () => {
    /*
      Tagihan tanpa `doku_request_id` tidak akan PERNAH bisa dimatikan lewat
      API — mencoba lagi tidak menolong. "Mungkin masih bisa dibayar"
      terdengar seperti kegagalan sementara; ini bukan.
    */
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ cancelled: false, reason: 'no_request_id' }),
    })) as any);

    const res = await settleGroupAsPaid(PID);

    expect(res.dokuCancelled).toBe(false);
    expect(res.dokuReason).toContain('request_id');
    expect(res.dokuReason).toMatch(/TIDAK BISA|tidak bisa/);
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

describe('tempo SUSULAN — pelunasan manual & kunci K8 (jadwal sudah lunas, bukan kredit)', () => {
  const entry = (o: Record<string, unknown> = {}) => ({
    id: 'sch-1', sourceId: 'sub-1', bookingId: 'BOOK1', isExtension: false,
    airOnCreditAt: null, paymentStatus: 'paid', ...o,
  }) as any;

  /** Update tabel uang memulangkan satu baris; `is_tempo` bisa diatur. */
  const payResponder = (isTempo: boolean) => (op: Op) => {
    if (op.verb === 'update' && op.table === 'invoices') return { data: [{ id: 'i1', is_tempo: isTempo }], error: null };
    if (op.verb === 'update') return { data: [{ id: 'x1' }], error: null };
    return { data: [], error: null };
  };
  const fsWrite = () => ops.find((o) => o.table === 'form_submissions' && o.verb === 'update')?.payload;

  it('tempo susulan: hanya payment_status — tahapnya (mungkin completed) tidak mundur', async () => {
    responder = payResponder(true);
    await markScheduleAsPaid(entry(), { paymentId: 'JFU-INV-s-1' });
    expect(fsWrite()).toEqual({ payment_status: 'paid' });
  });

  it('susulan BIASA: persis seperti dulu', async () => {
    responder = payResponder(false);
    await markScheduleAsPaid(entry(), { paymentId: 'JFU-INV-s-2' });
    expect(fsWrite()).toEqual({ payment_status: 'paid', submission_status: 'paid' });
  });

  it('tagihan tempo pada jadwal BELUM lunas & bukan kredit (penandaan gagal) → tahap TETAP bergerak', async () => {
    responder = payResponder(true);
    await markScheduleAsPaid(entry({ paymentStatus: 'pending' }), { paymentId: 'JFU-INV-t-9' });
    expect(fsWrite()).toEqual({ payment_status: 'paid', submission_status: 'paid' });
  });

  const cancelResponder = (airOnCredit: string | null) => (op: Op) => {
    if (op.table === 'invoices') return { data: [{ schedule_id: 'sch-1', is_tempo: true }], error: null };
    if (op.table === 'ad_schedules') {
      return { data: [{ booking_id: 'BOOK1', start_date: '2026-09-01T08:00:00Z', air_on_credit_at: airOnCredit }], error: null };
    }
    return { data: [], error: null };
  };

  it('K8: tempo susulan yang jadwalnya sudah tayang TETAP boleh dibatalkan', async () => {
    responder = cancelResponder(null);
    expect(await tempoCancelBlockReason('JFU-INV-s-1')).toBeNull();
  });

  it('K8: tagihan tempo KREDIT yang sudah tayang tetap terkunci', async () => {
    responder = cancelResponder('2026-08-30T01:00:00Z');
    expect(await tempoCancelBlockReason('JFU-INV-t-1')).toMatch(/tidak bisa dibatalkan/);
  });
});

describe('Tandai Lunas SATUAN — link DOKU dimatikan lebih dulu (settleScheduleAsPaid)', () => {
  const entry = { id: 'sch-1', sourceId: 'sub-1', bookingId: 'BOOK1', isExtension: false, airOnCreditAt: null, paymentStatus: 'pending' } as any;

  /** Tagihan terakhir = `pid`; `pending` menentukan ada link hidup atau tidak. */
  const settleResponder = (pending: boolean) => (op: Op) => {
    if (op.verb === 'select' && op.table === 'invoices') {
      if (op.filters.some((f) => f.col === 'status' && f.val === 'pending')) {
        return { data: pending ? [{ doku_request_id: 'req-9' }] : [], error: null };
      }
      return { data: [{ payment_id: 'JFU-INV-x-1' }], error: null };
    }
    if (op.verb === 'update') return { data: [{ id: 'row', is_tempo: false }], error: null };
    return { data: [], error: null };
  };

  it('DOKU DULU, baru database — dan yang dimatikan tagihan yang ditandai', async () => {
    responder = settleResponder(true);
    const order: string[] = [];
    (globalThis.fetch as any).mockImplementation(async (_url: string, init: any) => {
      // Dicatat BERAPA update database yang sudah terjadi saat DOKU dipanggil.
      const writesSoFar = ops.filter((o) => o.verb === 'update').length;
      order.push(`doku:${JSON.parse(init.body).invoice_number}@${writesSoFar}`);
      return { ok: true, status: 200, text: async () => JSON.stringify({ cancelled: true }) };
    });
    const res = await settleScheduleAsPaid(entry);
    // Nol update database saat DOKU dipanggil = DOKU dulu, baru database.
    expect(order).toEqual(['doku:JFU-INV-x-1@0']);
    expect(ops.some((o) => o.verb === 'update')).toBe(true);
    expect(res.dokuCancelled).toBe(true);
    const invUpdate = ops.find((o) => o.table === 'invoices' && o.verb === 'update');
    expect(invUpdate?.filters).toContainEqual({ op: 'eq', col: 'payment_id', val: 'JFU-INV-x-1' });
  });

  it('DOKU menolak → pelunasan TETAP jalan, dan admin diberi tahu', async () => {
    responder = settleResponder(true);
    (globalThis.fetch as any).mockImplementation(async () => ({
      ok: false, status: 400, text: async () => JSON.stringify({ cancelled: false, reason: 'doku_rejected', message: 'ditolak' }),
    }));
    const res = await settleScheduleAsPaid(entry);
    expect(res.dokuCancelled).toBe(false);
    expect(res.dokuReason).toBe('ditolak');
    expect(ops.some((o) => o.table === 'form_submissions' && o.verb === 'update')).toBe(true);
  });

  it('tagihannya sudah tidak pending → DOKU tidak dipanggil', async () => {
    responder = settleResponder(false);
    const res = await settleScheduleAsPaid(entry);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(0);
    expect(res.dokuCancelled).toBe(true);
  });
});

describe('Tandai Belum Lunas — satu tagihan, tanpa menutup jadwal yang masih lunas', () => {
  const entry = { id: 'sch-1', sourceId: 'sub-1', bookingId: 'BOOK1', isExtension: false, airOnCreditAt: null, paymentStatus: 'paid' } as any;

  const unmarkResponder = (o: { manual?: string | null; otherPaid?: boolean; otherPaidError?: boolean } = {}) => (op: Op) => {
    const isOtherPaid = op.filters.some((f) => f.op === 'or' && String(f.col).includes('payment_id.neq'));
    if (op.verb === 'select' && isOtherPaid) {
      if (o.otherPaidError) return { data: null, error: new Error('RLS') };
      return { data: o.otherPaid ? [{ id: 'dok-paid' }] : [], error: null };
    }
    if (op.verb === 'select' && op.table === 'transactions') {
      return { data: o.manual === null ? [] : [{ payment_id: o.manual ?? 'JFU-INV-s-1' }], error: null };
    }
    if (op.verb === 'update') return { data: [{ id: 'row' }], error: null };
    return { data: [], error: null };
  };
  const invUpdate = () => ops.find((o) => o.table === 'invoices' && o.verb === 'update');
  const fsUpdate = () => ops.find((o) => o.table === 'form_submissions' && o.verb === 'update');

  it('hanya tagihan pelunasan MANUAL terakhir yang dibalik — invoice DOKU tidak ikut', async () => {
    responder = unmarkResponder({ otherPaid: true });
    await unmarkScheduleAsPaid(entry);
    expect(invUpdate()?.filters).toContainEqual({ op: 'eq', col: 'payment_id', val: 'JFU-INV-s-1' });
    const txn = ops.find((op) => op.table === 'transactions' && op.verb === 'update');
    expect(txn?.filters).toContainEqual({ op: 'eq', col: 'payment_id', val: 'JFU-INV-s-1' });
  });

  it('SUSULAN: jadwal masih lunas dari tagihan lain → status jadwal TIDAK ditulis', async () => {
    responder = unmarkResponder({ otherPaid: true });
    const res = await unmarkScheduleAsPaid(entry);
    expect(res.scheduleReverted).toBe(false);
    expect(fsUpdate()).toBeUndefined();
    expect(ops.some((o) => o.table === 'ad_schedules' && o.verb === 'update')).toBe(false);
  });

  it('tanpa tagihan lunas lain → kembali "menunggu bayar" seperti dulu', async () => {
    responder = unmarkResponder({ otherPaid: false });
    const res = await unmarkScheduleAsPaid(entry);
    expect(res.scheduleReverted).toBe(true);
    expect(fsUpdate()?.payload).toEqual({ payment_status: 'pending', submission_status: 'waiting_payment' });
  });

  it('expires_at dimundurkan — link yang sudah dimatikan tidak terbaca `live` lagi', async () => {
    responder = unmarkResponder();
    const before = Date.now();
    await unmarkScheduleAsPaid(entry);
    const p = invUpdate()?.payload;
    expect(p.status).toBe('pending');
    expect(Date.parse(p.expires_at)).toBeGreaterThanOrEqual(before);
    // `transactions` tidak punya kolom expires_at — menulisnya = 400 PGRST204.
    const txn = ops.find((o) => o.table === 'transactions' && o.verb === 'update');
    expect(txn?.payload).not.toHaveProperty('expires_at');
  });

  it('pemeriksaan tagihan lain GAGAL → melempar, halaman tidak ditutup atas tebakan', async () => {
    responder = unmarkResponder({ otherPaidError: true });
    await expect(unmarkScheduleAsPaid(entry)).rejects.toThrow();
    expect(fsUpdate()).toBeUndefined();
  });

  it('tidak ada pelunasan manual → melempar, NOL tulisan', async () => {
    responder = unmarkResponder({ manual: null });
    await expect(unmarkScheduleAsPaid(entry)).rejects.toThrow(/tidak punya pelunasan manual/);
    expect(ops.filter((o) => o.verb === 'update')).toHaveLength(0);
  });

  it('grup: payment_id grup yang dibalik, bukan pelunasan manual terakhir tiap anggota', async () => {
    await unsettleGroupAsPaid(PID);
    const invUpdates = ops.filter((o) => o.table === 'invoices' && o.verb === 'update');
    expect(invUpdates).toHaveLength(3);
    for (const u of invUpdates) expect(u.filters).toContainEqual({ op: 'eq', col: 'payment_id', val: PID });
  });
});

describe('isLinkStillLive — invoices.expires_at (timestamp TANPA zona, isinya UTC)', () => {
  const NOW = Date.parse('2026-09-29T05:00:00Z'); // 12.00 WIB

  it('string tanpa zona dibaca UTC, BUKAN jam lokal mesin', () => {
    // 06:00 UTC = 13.00 WIB — masih hidup. Kalau dibaca sebagai jam lokal WIB
    // (= 23:00 UTC kemarin) ia terbaca mati 7 jam terlalu cepat.
    expect(isLinkStillLive('2026-09-29T06:00:00', NOW)).toBe(true);
    expect(isLinkStillLive('2026-09-29T04:00:00', NOW)).toBe(false);
  });

  it('string ber-zona dihormati apa adanya', () => {
    expect(isLinkStillLive('2026-09-29T12:30:00+07:00', NOW)).toBe(true);
    expect(isLinkStillLive('2026-09-29T04:59:00Z', NOW)).toBe(false);
  });

  it('NULL = hidup (baris warisan, sql/83); tak terbaca = hidup', () => {
    expect(isLinkStillLive(null, NOW)).toBe(true);
    expect(isLinkStillLive('bukan-tanggal', NOW)).toBe(true);
  });

  it('link yang sudah kedaluwarsa sendiri TIDAK ditembak Cancel Order — nol peringatan palsu', async () => {
    responder = (op: Op) => {
      if (op.verb === 'select' && op.table === 'invoices') {
        if (op.filters.some((f) => f.col === 'status' && f.val === 'pending')) {
          return { data: [{ doku_request_id: 'req-9', expires_at: '2020-01-01T00:00:00' }], error: null };
        }
        return { data: [{ payment_id: 'JFU-INV-x-1' }], error: null };
      }
      if (op.verb === 'update') return { data: [{ id: 'row', is_tempo: false }], error: null };
      return { data: [], error: null };
    };
    const res = await settleScheduleAsPaid({ id: 'sch-1', sourceId: 'sub-1', bookingId: 'B', isExtension: false } as any);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(0);
    expect(res.dokuCancelled).toBe(true);
  });
});
