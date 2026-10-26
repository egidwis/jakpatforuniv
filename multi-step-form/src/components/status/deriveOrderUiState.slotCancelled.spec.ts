import { describe, expect, it } from 'vitest';
import { deriveOrderUiState, describeOrderForChat } from './deriveOrderUiState';
import type { FormSubmission } from '@/utils/supabase';

/*
  Jadwal PERTAMA batal (`slot_cancelled`) = pesanannya berakhir bagi peneliti:
  server menolak setiap penjadwalan ulang (sql/88, door_lock_* sql/123), jadi
  jalannya order baru — yang direview ULANG. Kartunya tidak boleh duduk di
  "Berjalan" dan tidak boleh berjanji "kuesionermu tetap lolos review".
*/
const slotCancelled = {
  id: 'e0e7ae16-0000-4000-8000-000000000000',
  title: 'Untitled form',
  submission_method: 'google_import',
  survey_url: 'https://docs.google.com/forms/d/x',
  detected_keywords: [],
  voucher_code: '',
  submission_status: 'slot_cancelled',
  payment_status: 'expired',
  distribution_type: 'kilat',
  start_date: '2026-11-02',
  end_date: '2026-11-03',
  created_at: '2026-10-26T02:00:00Z',
} as unknown as FormSubmission;

describe('deriveOrderUiState — jadwal pertama batal = pesanan berakhir', () => {
  it('callout slot_cancelled, grup "Selesai", tanpa aksi', () => {
    const ui = deriveOrderUiState(slotCancelled, []);
    expect(ui.callout).toBe('slot_cancelled');
    expect(ui.needsAction).toBe(false);
    expect(ui.group).toBe('selesai');
  });

  it('konteks Mimin: order baru direview ulang, bukan "tetap lolos review"', () => {
    const text = describeOrderForChat(slotCancelled, deriveOrderUiState(slotCancelled, []));
    expect(text).not.toMatch(/tetap lolos review/i);
    expect(text).toMatch(/direview ulang/);
  });
});
