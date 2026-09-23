import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGoogleFormsPublicData, parseMicrosoftFormsQuestions, withCountEvidence } from './_formParsers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (id) => JSON.parse(fs.readFileSync(path.join(here, '_fixtures/gforms', `${id}.json`), 'utf8'));
// Bungkus seperti halaman viewform: FB_PUBLIC_LOAD_DATA_ = [null, [desc, items, ...]]
const pageOf = (items) => `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, [null, items]])};</script>`;

describe('parseGoogleFormsPublicData — aturan OAuth (google-forms-api-browser.ts)', () => {
  // Struktur dari order google_import produksi (benchmark 23 Sep 2026), teks
  // disamarkan. oauthCount = question_count hasil import OAuth.
  for (const id of ['2d8bf418', '3442a3a2', '30b44e11']) {
    it(`fixture ${id}: sama dengan hitungan OAuth`, () => {
      const f = fixture(id);
      expect(parseGoogleFormsPublicData(pageOf(f.items))?.totalQuestions).toBe(f.oauthCount);
    });
  }

  it('grid dihitung PER BARIS, bukan 1', () => {
    const items = [[1, 'Skala', null, 7, [[0, [], 0, ['A']], [1, [], 0, ['B']], [2, [], 0, ['C']]]]];
    expect(parseGoogleFormsPublicData(pageOf(items))?.totalQuestions).toBe(3);
  });

  it('section, teks, gambar, video = 0 — walau berjudul', () => {
    const items = [
      [1, 'Bagian 2', null, 8, null],
      [2, 'Petunjuk', null, 6, null],
      [3, 'Gambar', null, 11, null],
      [4, 'Video', null, 12, null],
      [5, 'Usia?', null, 0, [[0, null]]],
    ];
    expect(parseGoogleFormsPublicData(pageOf(items))?.totalQuestions).toBe(1);
  });

  it('pertanyaan tanpa judul tetap dihitung (questionItem tetap questionItem)', () => {
    const items = [[1, null, null, 2, [[0, [['Ya'], ['Tidak']]]]]];
    expect(parseGoogleFormsPublicData(pageOf(items))?.totalQuestions).toBe(1);
  });

  it('halaman tanpa FB_PUBLIC_LOAD_DATA_ (login) → null, bukan 0', () => {
    expect(parseGoogleFormsPublicData('<html>Sign in</html>')).toBeNull();
  });
});

describe('parseMicrosoftFormsQuestions', () => {
  it('MatrixChoiceGroup hanya kepala; sub-pertanyaannya dihitung', () => {
    const r = parseMicrosoftFormsQuestions({
      questions: [
        { type: 'Question.MatrixChoiceGroup', title: 'Seberapa setuju' },
        { type: 'Question.MatrixChoice', title: 'Pernyataan 1' },
        { type: 'Question.MatrixChoice', title: 'Pernyataan 2' },
        { type: 'Question.Choice', title: 'Gender' },
      ],
    });
    expect(r?.totalQuestions).toBe(3);
  });
});

describe('withCountEvidence', () => {
  const ev = { extractorUsed: 'x', textLength: 500, reported: 36 };

  it('parser menang atas tebakan LLM; diff dihitung ulang', () => {
    const r = withCountEvidence({ question_count: { actual_detected: 48, status: 'match' } }, { ...ev, parsedCount: 40 });
    expect(r.question_count).toEqual({ reported: 36, actual_detected: 40, diff: 4, status: 'mismatch_over' });
    expect(r.count_source).toBe('parser');
    expect(r.read_state).toBe('read');
  });

  it('tanpa parser: angka LLM, sumber ai', () => {
    const r = withCountEvidence({ question_count: { actual_detected: 36 } }, { ...ev, parsedCount: null });
    expect(r.count_source).toBe('ai');
    expect(r.question_count.status).toBe('match');
  });

  it('LLM melapor 0 tanpa parser → tak terbaca, angka null', () => {
    const r = withCountEvidence({ status: 'clean', question_count: { actual_detected: 0 } }, { ...ev, parsedCount: null });
    expect(r.read_state).toBe('unreadable');
    expect(r.question_count.actual_detected).toBeNull();
  });

  it('cadangan tanpa LLM & tanpa parser: TERBACA, jumlah null (bukan cocok palsu)', () => {
    const r = withCountEvidence({ pii: { findings: [{ type: 'phone' }] } }, { ...ev, parsedCount: null });
    expect(r.read_state).toBe('read');
    expect(r.question_count).toEqual({ reported: 36, actual_detected: null, diff: null, status: 'unknown' });
  });

  it('teks > 15.000 karakter ditandai terpotong', () => {
    expect(withCountEvidence({}, { ...ev, parsedCount: 1, textLength: 15001 }).text_truncated).toBe(true);
  });

  it('jalur tak terbaca eksplisit', () => {
    const r = withCountEvidence({}, { ...ev, parsedCount: null, unreadable: true });
    expect(r.read_state).toBe('unreadable');
  });
});
