// Decides whether a survey submission should UPDATE an existing row
// (a genuine reschedule) or INSERT a new row.
//
// Context: the reschedule flow stores `submissionIdToReplace`/`isReschedule`
// in the persisted form draft. If a reschedule is abandoned, that intent can
// leak into a later, unrelated new submission and overwrite a *different*
// survey in place (data loss). This guard ensures we only reschedule when the
// survey being submitted actually matches the target submission.

export interface RescheduleIntent {
  isReschedule?: boolean;
  submissionIdToReplace?: string | null;
}

export type SubmissionMode =
  | { mode: 'reschedule'; submissionId: string }
  | { mode: 'create' };

const normalizeUrl = (url: string | null | undefined): string =>
  (url ?? '').trim().toLowerCase();

export function resolveSubmissionMode(
  intent: RescheduleIntent,
  submittedSurveyUrl: string,
  existingSurveyUrl: string | null | undefined,
): SubmissionMode {
  // Require an explicit reschedule flag AND a target id — never infer a
  // reschedule from a dangling id alone.
  if (intent.isReschedule !== true || !intent.submissionIdToReplace) {
    return { mode: 'create' };
  }
  // Target row missing → nothing to reschedule.
  if (existingSurveyUrl === null || existingSurveyUrl === undefined) {
    return { mode: 'create' };
  }
  // Safety guard: a genuine reschedule re-submits the *same* survey. If the
  // survey being submitted differs from the target's, the intent is stale —
  // create a new row instead of overwriting a different survey.
  if (normalizeUrl(submittedSurveyUrl) !== normalizeUrl(existingSurveyUrl)) {
    return { mode: 'create' };
  }
  return { mode: 'reschedule', submissionId: intent.submissionIdToReplace };
}
