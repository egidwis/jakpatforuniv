import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditSubmissionForm } from './auditService';
import type { FormAuditResult } from '../components/submissions/types';

describe('auditSubmissionForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if formUrl is empty', async () => {
    await expect(auditSubmissionForm('sub-1', '', 10)).rejects.toThrow('Form URL is required');
  });

  it('posts payload to /api/audit-submission and returns parsed result', async () => {
    const mockResult: FormAuditResult = {
      status: 'clean',
      audited_at: '2026-09-10T12:00:00Z',
      source_platform: 'microsoft_forms',
      url: 'https://forms.cloud.microsoft/r/abc123',
      question_count: {
        reported: 10,
        actual_detected: 10,
        diff: 0,
        status: 'match'
      },
      pii: {
        has_pii: false,
        findings: [],
        status: 'clean'
      },
      randomizer: {
        detected: false,
        signals: []
      },
      recommendation: 'ready_to_approve',
      summary: 'Kuesioner memenuhi standar dan tidak ditemukan data sensitif.'
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult
    } as Response);

    const result = await auditSubmissionForm(
      'sub-123',
      'https://forms.cloud.microsoft/r/abc123',
      10
    );

    expect(fetchSpy).toHaveBeenCalledWith('/api/audit-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionId: 'sub-123',
        formUrl: 'https://forms.cloud.microsoft/r/abc123',
        reportedQuestionCount: 10
      })
    });

    expect(result).toEqual(mockResult);
    expect(result.question_count.status).toBe('match');
    expect(result.recommendation).toBe('ready_to_approve');
  });

  it('handles API error responses gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    } as Response);

    await expect(
      auditSubmissionForm('sub-123', 'https://forms.cloud.microsoft/r/abc123', 5)
    ).rejects.toThrow('Audit request failed (500): Internal Server Error');
  });
});
