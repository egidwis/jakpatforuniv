/**
 * src/utils/auditService.ts
 *
 * Client-side service to trigger and retrieve automated AI Pre-Screening
 * audits for survey submission links.
 */

import type { FormAuditResult } from '../components/submissions/types';

export async function auditSubmissionForm(
  submissionId: string,
  formUrl: string,
  reportedQuestionCount: number = 0
): Promise<FormAuditResult> {
  if (!formUrl) {
    throw new Error('Form URL is required');
  }

  const response = await fetch('/api/audit-submission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      submissionId,
      formUrl,
      reportedQuestionCount
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Audit request failed (${response.status}): ${errorText}`);
  }

  const result: FormAuditResult = await response.json();
  return result;
}
