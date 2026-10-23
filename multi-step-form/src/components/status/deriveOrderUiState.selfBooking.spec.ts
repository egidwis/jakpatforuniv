import { describe, expect, it } from 'vitest';
import { deriveOrderUiState, describeOrderForChat } from './deriveOrderUiState';
import type { FormSubmission } from '@/utils/supabase';

/*
  Tutup reservasi mandiri (sql/125): order jalur otomatis yang lahir saat
  saklar ditutup dicap `self_booking_closed_at`. Ia mendarat di state yang
  SUDAH ADA untuk order yang dijadwalkan tim — bukan state baru.
*/
const approvedAuto = {
  id: 'o-cap',
  title: 'Survei',
  submission_method: 'google_import',
  survey_url: 'https://docs.google.com/forms/d/x',
  detected_keywords: [],
  voucher_code: '',
  submission_status: 'approved',
  payment_status: 'pending',
  distribution_type: 'regular',
  start_date: null,
  end_date: null,
  created_at: new Date().toISOString(),
} as unknown as FormSubmission;

describe('deriveOrderUiState — cap "jadwal oleh tim" (sql/125)', () => {
  it('review otomatis tanpa cap: peneliti memilih sendiri (perilaku lama)', () => {
    const ui = deriveOrderUiState(approvedAuto, []);
    expect(ui.callout).toBe('choose_schedule');
    expect(ui.group).toBe('butuh-aksi');
  });

  it('bercap: tim yang menjadwalkan — "Berjalan", tanpa CTA pilih tanggal', () => {
    const capped = { ...approvedAuto, self_booking_closed_at: '2026-10-22T03:00:00Z' } as FormSubmission;
    const ui = deriveOrderUiState(capped, []);
    expect(ui.callout).toBe('awaiting_admin_schedule');
    expect(ui.needsAction).toBe(false);
    expect(ui.group).toBe('berjalan');
    expect(describeOrderForChat(capped, ui)).toMatch(/TIDAK perlu memilih jadwal sendiri/);
  });
});
