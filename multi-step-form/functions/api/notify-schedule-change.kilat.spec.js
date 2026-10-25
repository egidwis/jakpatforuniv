import { describe, it, expect, vi, beforeEach } from 'vitest';

// Handler SUNGGUHAN; Supabase dan pengirim email dipalsukan. Yang dijaga:
// order Kilat Survei dikabari dengan kosakata gelombang push, bukan "jadwal
// tayang iklan", dan jam gelombangnya ikut disebut.
const sent = [];
vi.mock('./_mail.js', () => ({
  sendMail: vi.fn(async (_env, mail) => { sent.push(mail); return { ok: true, id: 'm1', provider: 'test' }; }),
}));

let schedRow;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => (table === 'ad_schedules'
            ? { data: schedRow, error: null }
            : { data: { email: 'p@x.id', full_name: 'Sintya', title: 'Survei Kopi' }, error: null }),
        }),
      }),
    }),
  }),
}));

const { onRequestPost } = await import('./notify-schedule-change.js');

const ENV = { VITE_SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const call = (body) => onRequestPost({
  request: new Request('https://x.test/api/notify-schedule-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

const row = (over = {}) => ({
  id: 'sch-1', submission_id: 'sub-1', ordinal: 1, booking_id: 'AB12CD34',
  start_date: '2026-10-27T04:00:00.000Z', end_date: '2026-10-28T04:00:00.000Z',
  status: 'waiting_payment', review_status: 'approved', payment_status: 'pending',
  slot_booked_by: 'admin', distribution_type: 'kilat', kilat_slot_hour: 11,
  ...over,
});

beforeEach(() => { sent.length = 0; });

describe('/api/notify-schedule-change — Kilat Survei', () => {
  it('dipindah: subjek & isi menyebut gelombang Kilat Survei + jamnya', async () => {
    schedRow = row();
    expect((await call({ scheduleId: 'sch-1', event: 'moved' })).status).toBe(200);
    expect(sent[0].subject).toBe('Gelombang Kilat Survei-mu dipindah — Jakpat for Universities');
    expect(sent[0].html).toContain('Gelombang push Kilat Survei');
    expect(sent[0].html).toContain('Gelombang 11.00 WIB');
    expect(sent[0].html.toLowerCase()).not.toContain('iklan');
  });

  it('dibatalkan: kursi gelombang dibebaskan, tanpa kosakata iklan', async () => {
    schedRow = row({ status: 'cancelled', payment_status: 'expired', kilat_slot_hour: 15 });
    expect((await call({ scheduleId: 'sch-1', event: 'cancelled' })).status).toBe(200);
    expect(sent[0].subject).toBe('Gelombang Kilat Survei-mu dibatalkan — Jakpat for Universities');
    expect(sent[0].html).toContain('Kursi gelombang itu');
    expect(sent[0].html).toContain('Gelombang 15.00 WIB');
    expect(sent[0].html.toLowerCase()).not.toContain('iklan');
  });

  it('Iklan: kosakata jadwal tayang, tanpa label gelombang', async () => {
    schedRow = row({ distribution_type: 'regular', kilat_slot_hour: null });
    await call({ scheduleId: 'sch-1', event: 'moved' });
    expect(sent[0].subject).toBe('Jadwal tayang surveimu berubah — Jakpat for Universities');
    expect(sent[0].html).not.toContain('Gelombang');
  });
});
