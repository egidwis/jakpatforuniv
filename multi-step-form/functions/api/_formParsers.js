/**
 * functions/api/_formParsers.js
 *
 * Parser skema form untuk audit-submission.js — dipisah supaya bisa diuji
 * (awalan `_` = tidak dirutekan Pages Functions).
 *
 * ⚠️ JUMLAH PERTANYAAN MENGIKUTI SATU ATURAN: aturan API OAuth Google Forms
 * yang sudah dipakai jalur import (src/utils/google-forms-api-browser.ts):
 *
 *   questionItem ........... 1
 *   questionGroupItem ...... 1 PER BARIS (grid/Likert)
 *   pageBreak / sectionHeader / text / image / video ... 0
 *
 * Dulu parser Google di sini menghitung judul section, blok teks dan gambar
 * sebagai pertanyaan, dan grid sebagai 1 — lalu angkanya dibuang dan LLM
 * menebak ulang. MS Forms memakai aturan yang di-benchmark 38/38 (rencana
 * 27 Jul): `MatrixChoiceGroup` hanya kepala, sub-pertanyaannya item sendiri.
 */

// Kode tipe item di FB_PUBLIC_LOAD_DATA_ (form publik Google).
const GFORM_TYPE = {
  SHORT: 0,
  PARAGRAPH: 1,
  MULTIPLE_CHOICE: 2,
  DROPDOWN: 3,
  CHECKBOX: 4,
  SCALE: 5,
  TEXT: 6,        // judul + deskripsi, bukan pertanyaan
  GRID: 7,        // item[4] = satu entri per BARIS
  SECTION: 8,     // page break / section header
  DATE: 9,
  TIME: 10,
  IMAGE: 11,
  VIDEO: 12,
};

const NON_QUESTION_TYPES = new Set([GFORM_TYPE.TEXT, GFORM_TYPE.SECTION, GFORM_TYPE.IMAGE, GFORM_TYPE.VIDEO]);

/**
 * @returns {{ formTitle: string, questions: string[], totalQuestions: number, fullText: string } | null}
 *   `totalQuestions` = hitungan menurut aturan di kepala berkas; `questions`
 *   = baris teks untuk LLM (satu per pertanyaan TERHITUNG, jadi keduanya sama).
 */
export function parseGoogleFormsPublicData(html) {
  if (!html) return null;
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]+?\]);\s*<\/script>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const items = parsed?.[1]?.[1];
    if (!Array.isArray(items)) return null;

    const questions = [];
    for (const item of items) {
      if (!Array.isArray(item)) continue;
      const title = (item[1] || '').trim();
      const typeCode = item[3];
      const desc = (item[2] || '').trim();

      if (NON_QUESTION_TYPES.has(typeCode)) continue;

      if (typeCode === GFORM_TYPE.GRID) {
        // Satu pertanyaan per baris — persis questionGroupItem.questions.
        const rows = Array.isArray(item[4]) ? item[4] : [];
        const columns = Array.isArray(rows[0]?.[1]) ? rows[0][1].map((c) => c?.[0]).filter(Boolean) : [];
        rows.forEach((row, i) => {
          const rowLabel = (Array.isArray(row?.[3]) ? row[3][0] : '') || `Baris ${i + 1}`;
          let qText = `${title || 'Grid'} — ${rowLabel}`;
          if (columns.length > 0) qText += ` [Skala: ${columns.join(', ')}]`;
          questions.push(qText);
        });
        continue;
      }

      // Pertanyaan biasa: dihitung walau tanpa judul — questionItem tetap
      // questionItem di API OAuth.
      let options = [];
      if (item[4] && item[4][0] && Array.isArray(item[4][0][1])) {
        options = item[4][0][1].map((opt) => opt?.[0]).filter(Boolean);
      }
      let qText = title || '(pertanyaan tanpa judul)';
      if (desc) qText += ` (${desc})`;
      if (options.length > 0) qText += ` [Opsi: ${options.join(', ')}]`;
      questions.push(qText);
    }

    if (questions.length > 0) {
      return {
        formTitle: parsed?.[1]?.[8] || parsed?.[3] || '',
        questions,
        totalQuestions: questions.length,
        fullText: questions.map((q, idx) => `[Pertanyaan ${idx + 1}] ${q}`).join('\n\n'),
      };
    }
  } catch (err) {
    console.warn('[audit-submission] Error parsing FB_PUBLIC_LOAD_DATA_:', err);
  }
  return null;
}

/**
 * Bagian murni parser MS Forms: JSON `prefetchFormUrl` → pertanyaan.
 * `MatrixChoiceGroup` = kepala grup; sub-pertanyaannya item tersendiri.
 */
export function parseMicrosoftFormsQuestions(formData) {
  if (!formData || !Array.isArray(formData.questions)) return null;
  const questions = [];
  for (const q of formData.questions) {
    const type = q.type || '';
    if (type === 'Question.MatrixChoiceGroup') continue;
    const rawTitle = (q.title || '').replace(/<[^>]+>/g, '').trim();
    const rawSubtitle = (q.subtitle || '').replace(/<[^>]+>/g, '').trim();
    let choicesStr = '';
    if (Array.isArray(q.choices) && q.choices.length > 0) {
      choicesStr = ` [Opsi: ${q.choices.map((c) => (c.description || '').replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(', ')}]`;
    }
    if (rawTitle) {
      questions.push(`[${type}] ${rawTitle}${rawSubtitle ? ` (${rawSubtitle})` : ''}${choicesStr}`);
    }
  }
  if (questions.length === 0) return null;
  return {
    formTitle: formData.title || '',
    questions,
    totalQuestions: questions.length,
    fullText: questions.map((q, idx) => `[Pertanyaan ${idx + 1}] ${q}`).join('\n\n'),
  };
}

/** Batas teks yang dikirim ke LLM — lebih dari ini terpotong. */
export const AI_TEXT_LIMIT = 15000;

/**
 * Tempelkan BUKTI jumlah pertanyaan ke hasil audit — satu tempat untuk ketiga
 * jalur (LLM, cadangan tanpa LLM, tak terbaca).
 *
 * - Parser berhasil → angkanya MENANG atas tebakan LLM (`count_source:
 *   'parser'`). Terukur 23 Sep: LLM cocok 2/18 di MS Forms padahal parsernya
 *   38/38; parser Google (aturan OAuth) cocok 56/64 order google_import, dan
 *   8 sisanya konsisten dengan form yang diedit sesudah import.
 * - Tanpa parser → angka LLM, ditandai `'ai'`.
 * - `diff`/`status` dihitung ULANG di sini, tidak dipercaya dari LLM.
 * - `read_state: 'unreadable'` bila teks tak terbaca, atau tanpa parser dan
 *   LLM melapor 0 (10 dari 12 kartu "0 pertanyaan" produksi = halaman login).
 *   Tanpa LLM dan tanpa parser: terbaca, jumlahnya null ("tak terhitung").
 *
 * @param {object} report  hasil audit (boleh tanpa question_count)
 * @param {{ parsedCount: number|null, extractorUsed: string, textLength: number,
 *           reported: number, unreadable?: boolean }} evidence
 */
export function withCountEvidence(report, { parsedCount, extractorUsed, textLength, reported, unreadable = false }) {
  const llmCount = report?.question_count?.actual_detected;
  const actual = parsedCount != null
    ? parsedCount
    : (typeof llmCount === 'number' && Number.isFinite(llmCount) ? llmCount : null);
  const diff = actual == null ? null : actual - reported;
  const status = diff == null ? 'unknown' : diff === 0 ? 'match' : diff > 0 ? 'mismatch_over' : 'mismatch_under';
  // Hanya LLM yang MELAPOR 0 yang berarti "tak terbaca". Tanpa LLM (jalur
  // cadangan) angkanya null tapi teksnya terbaca — temuan regex PII-nya nyata
  // dan tidak boleh disembunyikan di balik "tak terbaca".
  const unreadableByLlm = parsedCount == null && llmCount === 0;
  const readState = unreadable || unreadableByLlm ? 'unreadable' : 'read';
  const isRead = readState === 'read';
  return {
    ...report,
    question_count: {
      reported,
      actual_detected: isRead ? actual : null,
      diff: isRead ? diff : null,
      status: isRead ? status : 'unknown',
    },
    count_source: parsedCount != null ? 'parser' : 'ai',
    extractor_used: extractorUsed,
    text_truncated: textLength > AI_TEXT_LIMIT,
    read_state: readState,
  };
}
