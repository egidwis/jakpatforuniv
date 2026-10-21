const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateFormSubmit(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body kosong';
  if (typeof body.formId !== 'string' || !UUID.test(body.formId)) return 'Form tidak diizinkan';
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return 'Jawaban tidak diizinkan';
  }
  let size = 0;
  try { size = JSON.stringify(body.answers).length; } catch { return 'Jawaban tidak diizinkan'; }
  if (size > 100_000) return 'Jawaban tidak diizinkan';
  return null;
}
