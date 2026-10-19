const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEW = new Set(['approved', 'rejected', 'cancelled', 'in_review', 'spam']);

function historyEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'Riwayat review tidak diizinkan';
  if (entry.action !== undefined && (typeof entry.action !== 'string' || entry.action.length > 40)) {
    return 'Riwayat review tidak diizinkan';
  }
  if (entry.actor !== undefined && (typeof entry.actor !== 'string' || entry.actor.length > 40)) {
    return 'Riwayat review tidak diizinkan';
  }
  if (entry.notes !== undefined && (typeof entry.notes !== 'string' || entry.notes.length > 4000)) {
    return 'Riwayat review tidak diizinkan';
  }
  if (entry.timestamp !== undefined && (typeof entry.timestamp !== 'string' || entry.timestamp.length > 40)) {
    return 'Riwayat review tidak diizinkan';
  }
  return null;
}

export function validateReviewWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (body.action !== 'decision') return 'Tindakan tidak diizinkan';
  if (typeof body.submissionId !== 'string' || !UUID.test(body.submissionId)) return 'Order tidak diizinkan';
  if (!REVIEW.has(body.status)) return 'Status review tidak diizinkan';
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 4000)) {
    return 'Catatan tidak diizinkan';
  }
  if (body.reviewHistory !== undefined) {
    if (!Array.isArray(body.reviewHistory) || body.reviewHistory.length > 200) return 'Riwayat review tidak diizinkan';
    for (const entry of body.reviewHistory) {
      const invalid = historyEntry(entry);
      if (invalid) return invalid;
    }
  }
  return null;
}

export function reviewPatch(body) {
  const patch = { submission_status: body.status };
  if (body.notes !== undefined) patch.admin_notes = body.notes;
  if (body.reviewHistory !== undefined) {
    patch.review_history = body.reviewHistory.map((entry) => {
      const copy = {};
      if (entry.action !== undefined) copy.action = entry.action;
      if (entry.actor !== undefined) copy.actor = entry.actor;
      if (entry.notes !== undefined) copy.notes = entry.notes;
      if (entry.timestamp !== undefined) copy.timestamp = entry.timestamp;
      return copy;
    });
  }
  return patch;
}
