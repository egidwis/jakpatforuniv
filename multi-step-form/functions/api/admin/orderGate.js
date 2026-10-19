const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) return `${label} tidak diizinkan`;
  return null;
}

function whole(value, label, max) {
  if (!Number.isInteger(value) || value < 0 || value > max) return `${label} tidak diizinkan`;
  return null;
}

export function validateOrderWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  const id = uuid(body.submissionId, 'Order');
  if (id) return id;

  if (body.action === 'criteria') {
    if (typeof body.criteria !== 'string' || body.criteria.length > 8000) return 'Kriteria tidak diizinkan';
    return null;
  }

  if (body.action === 'reprice') {
    if ('totalCost' in body || 'subtotal' in body || 'ppnAmount' in body) return 'Nominal tidak boleh dikirim';
    if (body.questionCount !== undefined) {
      const bad = whole(body.questionCount, 'Jumlah soal', 500);
      if (bad) return bad;
    }
    if (body.duration !== undefined) {
      const bad = whole(body.duration, 'Durasi', 366);
      if (bad) return bad;
    }
    if (body.prizePerWinner !== undefined) {
      const bad = whole(body.prizePerWinner, 'Hadiah', 1_000_000_000);
      if (bad) return bad;
    }
    if (body.winnerCount !== undefined) {
      const bad = whole(body.winnerCount, 'Jumlah pemenang', 100_000);
      if (bad) return bad;
    }
    if (body.criteria !== undefined && (typeof body.criteria !== 'string' || body.criteria.length > 8000)) {
      return 'Kriteria tidak diizinkan';
    }
    return null;
  }

  if (body.action === 'convert') {
    if (body.target !== 'regular' && body.target !== 'kilat') return 'Jalur tidak diizinkan';
    return null;
  }

  return 'Tindakan tidak diizinkan';
}

export function repriceInputPatch(body) {
  const patch = {};
  if (body.questionCount !== undefined) patch.question_count = body.questionCount;
  if (body.duration !== undefined) patch.duration = body.duration;
  if (body.prizePerWinner !== undefined) patch.prize_per_winner = body.prizePerWinner;
  if (body.winnerCount !== undefined) patch.winner_count = body.winnerCount;
  if (body.criteria !== undefined) patch.criteria_responden = body.criteria;
  return patch;
}
