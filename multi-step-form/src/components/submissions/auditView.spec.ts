import { describe, expect, it } from 'vitest';
import {
  auditViewOf, headerOf, shouldAutoAudit, reviewNotesOf, autoAuditKey, type AuditHeader,
} from './auditView';
import type { FormAuditResult } from './types';

const URL_NOW = 'https://docs.google.com/forms/d/abc/viewform';

const audit = (o: Partial<FormAuditResult> = {}): FormAuditResult => ({
  status: 'clean',
  audited_at: '2026-09-20T03:00:00Z',
  source_platform: 'google_forms',
  url: URL_NOW,
  question_count: { reported: 36, actual_detected: 36, diff: 0, status: 'match' },
  pii: { has_pii: false, findings: [], status: 'clean' },
  randomizer: { detected: false, signals: [] },
  recommendation: 'ready_to_approve',
  summary: 'Ringkasan AI',
  ...o,
});
const sub = (o: { formUrl?: string; questionCount?: number } = {}) => ({ formUrl: URL_NOW, questionCount: 36, ...o });

describe('auditViewOf — bentuk dari 59 audit produksi', () => {
  it('status:clean + reject_or_revise + 0 pertanyaan (halaman login) → tak terbaca, nol baris PII, tanpa kata "Lolos"', () => {
    const a = audit({
      status: 'clean',
      recommendation: 'reject_or_revise',
      question_count: { reported: 36, actual_detected: 0, diff: -36, status: 'mismatch_under' },
      pii: { has_pii: true, findings: [{ type: 'email', snippet: 'x', context: '', confidence: 'high' }], status: 'violation' },
    });
    const v = auditViewOf(a, sub());
    expect(v.readState).toBe('unreadable');
    expect(v.pii.total).toBe(0);
    expect(v.isClean).toBe(false);
    const h = headerOf(v, { isAuditing: false, failed: false });
    expect(h.kind).toBe('unreadable');
    expect(JSON.stringify(v) + JSON.stringify(h)).not.toMatch(/lolos/i);
  });

  it('link audit ≠ link order sekarang → isStale', () => {
    expect(auditViewOf(audit({ url: 'https://forms.office.com/DesignPageV2?subpage=design' }), sub()).isStale).toBe(true);
  });

  it('audit reported 36 / detected 48, order SEKARANG 48 (diadopsi admin) → delta 0, tidak merah lagi', () => {
    const a = audit({ question_count: { reported: 36, actual_detected: 48, diff: 12, status: 'mismatch_over' } });
    const v = auditViewOf(a, sub({ questionCount: 48 }));
    expect(v.count.delta).toBe(0);
    expect(v.hasEvidence).toBe(false);
    expect(v.isClean).toBe(true);
  });

  it('baris lama tanpa count_source → sumber ai', () => {
    expect(auditViewOf(audit(), sub()).count.source).toBe('ai');
  });

  it('PII diurutkan per confidence, 3 teratas + sisa', () => {
    const f = (confidence: 'high' | 'medium' | 'low', snippet: string) => ({ type: 'phone' as const, snippet, context: '', confidence });
    const v = auditViewOf(audit({
      pii: { has_pii: true, status: 'warning', findings: [f('low', 'a'), f('high', 'b'), f('medium', 'c'), f('high', 'd')] },
    }), sub());
    expect(v.pii.top.map((x) => x.snippet)).toEqual(['b', 'd', 'c']);
    expect(v.pii.rest).toBe(1);
    expect(v.hasEvidence).toBe(true);
  });

  it('kurang dari order + tebakan AI + teks terpotong → "mungkin terbaca sebagian", bukan alarm', () => {
    const v = auditViewOf(audit({
      text_truncated: true,
      question_count: { reported: 36, actual_detected: 30, diff: -6, status: 'mismatch_under' },
    }), sub());
    expect(v.count.maybePartial).toBe(true);
    expect(v.hasEvidence).toBe(false);
  });

  it('cadangan tanpa LLM: terbaca, jumlah null — bukan cocok, bukan tak terbaca', () => {
    const v = auditViewOf(audit({
      read_state: 'read',
      question_count: { reported: 36, actual_detected: null, diff: null, status: 'unknown' },
    }), sub());
    expect(v.readState).toBe('read');
    expect(v.count.detected).toBeNull();
    expect(v.isClean).toBe(false);
  });
});

describe('shouldAutoAudit — hanya selama menunggu keputusan review', () => {
  const base = { formUrl: URL_NOW, isAuditing: false, alreadyTriggered: false };

  it('autoRun=false, tanpa audit → tidak jalan; tombol "Cek"', () => {
    expect(shouldAutoAudit({ ...base, autoRun: false, audit: null })).toBe(false);
    expect(headerOf(null, { isAuditing: false, failed: false }).buttonLabel).toBe('Cek');
  });

  it('autoRun=true, tanpa audit → jalan; sudah dipicu → tidak lagi', () => {
    expect(shouldAutoAudit({ ...base, autoRun: true, audit: null })).toBe(true);
    expect(shouldAutoAudit({ ...base, autoRun: true, audit: null, alreadyTriggered: true })).toBe(false);
  });

  it('autoRun=false + link berubah → tidak jalan, teks "hasil untuk link lama"', () => {
    const stale = audit({ url: 'https://old' });
    expect(shouldAutoAudit({ ...base, autoRun: false, audit: stale })).toBe(false);
    expect(headerOf(auditViewOf(stale, sub()), { isAuditing: false, failed: false }).status).toBe('hasil untuk link lama');
  });

  it('autoRun=true + link berubah → jalan', () => {
    expect(shouldAutoAudit({ ...base, autoRun: true, audit: audit({ url: 'https://old' }) })).toBe(true);
  });

  it('autoRun=true + audit segar → tidak jalan', () => {
    expect(shouldAutoAudit({ ...base, autoRun: true, audit: audit() })).toBe(false);
  });

  it('kunci pemicu berubah bila link berubah', () => {
    expect(autoAuditKey('s1', 'https://a')).not.toBe(autoAuditKey('s1', 'https://b'));
  });
});

describe('headerOf — label tombol terdefinisi di SETIAP keadaan', () => {
  const clean = auditViewOf(audit({ count_source: 'parser' }), sub());
  const findings = auditViewOf(audit({ question_count: { reported: 36, actual_detected: 48, diff: 12, status: 'mismatch_over' } }), sub());
  const unreadable = auditViewOf(audit({ read_state: 'unreadable' }), sub());
  const cases: Array<[string, AuditHeader]> = [
    ['bersih', headerOf(clean, { isAuditing: false, failed: false })],
    ['temuan', headerOf(findings, { isAuditing: false, failed: false })],
    ['tak terbaca', headerOf(unreadable, { isAuditing: false, failed: false })],
    ['belum dicek', headerOf(null, { isAuditing: false, failed: false })],
    ['gagal', headerOf(null, { isAuditing: false, failed: true })],
    ['memindai', headerOf(clean, { isAuditing: true, failed: false })],
  ];
  for (const [name, h] of cases) {
    it(name, () => {
      expect(['Cek', 'Cek Ulang', 'Memindai…']).toContain(h.buttonLabel);
      expect(h.status.length).toBeGreaterThan(0);
    });
  }

  it('bersih diringkas satu baris dengan label sumber', () => {
    expect(cases[0][1].status).toBe('36 terhitung = order 36 · tanpa data pribadi');
  });

  it('memindai menonaktifkan tombol', () => {
    expect(cases[5][1].buttonDisabled).toBe(true);
  });
});

describe('reviewNotesOf', () => {
  it('memakai delta hitung ulang, tanpa ringkasan & randomizer LLM', () => {
    const v = auditViewOf(audit({
      question_count: { reported: 30, actual_detected: 48, diff: 18, status: 'mismatch_over' },
      randomizer: { detected: true, signals: ['acak'] },
    }), sub({ questionCount: 36 }));
    const t = reviewNotesOf(v, { researcherName: 'Budi', formTitle: 'Survei' });
    expect(t).toContain('selisih +12');
    expect(t).not.toContain('Ringkasan AI');
    expect(t).not.toMatch(/randomizer/i);
  });
});
