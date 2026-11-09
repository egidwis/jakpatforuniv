import { describe, expect, it } from 'vitest';
import { buildAuditSystemPrompt, buildAuditUserPrompt } from './_auditPrompt.js';

// Prompt adalah kode yang tak bisa diuji dengan menjalankannya (butuh LLM),
// jadi yang dikunci di sini adalah ATURAN yang harus tetap tertulis di sana.
// Kasus pemicu: 9 Nov 2026 — LLM mencatat "Apa nama perusahaan…" dan "Kota atau
// kabupaten tempat tinggal" sebagai temuan `low` yang catatannya sendiri bilang
// "bukan data pribadi", lalu kartu menulis "2 data pribadi".

describe('buildAuditSystemPrompt — aturan temuan PII', () => {
  const prompt = buildAuditSystemPrompt(7);

  it('findings hanya untuk data pribadi yang BENAR-BENAR diminta; aman → array kosong', () => {
    expect(prompt).toMatch(/findings.{0,200}hanya/is);
    expect(prompt).toMatch(/findings.{0,120}(kosong|\[\])/is);
  });

  it('melarang mencatat item aman beserta alasan "ini aman"', () => {
    expect(prompt).toMatch(/jangan\s+(mencatat|memasukkan|menulis)/i);
  });

  it('menyebut contoh aman dari kasus nyata: nama perusahaan & kota/kabupaten', () => {
    expect(prompt).toMatch(/nama\s+(perusahaan|organisasi|institusi)/i);
    expect(prompt).toMatch(/kota\s*(\/|atau)?\s*kabupaten/i);
  });

  it('menuntut konsistensi: has_pii / status mengikuti isi findings', () => {
    expect(prompt).toMatch(/has_pii.{0,160}findings/is);
  });

  it('jumlah pertanyaan yang dilaporkan tetap masuk prompt', () => {
    expect(buildAuditSystemPrompt(7)).toContain('reported: 7');
    expect(buildAuditSystemPrompt(undefined)).toContain('reported: 0');
  });

  it('format JSON balasan tetap utuh (kontrak dengan withCountEvidence & UI)', () => {
    for (const key of ['question_count', 'actual_detected', 'pii', 'findings', 'confidence', 'randomizer', 'recommendation', 'summary', 'detected_questions_sample']) {
      expect(prompt).toContain(`"${key}"`);
    }
  });
});

describe('buildAuditUserPrompt', () => {
  it('hasil regex dilabeli petunjuk yang bisa salah, bukan temuan final', () => {
    const p = buildAuditUserPrompt({
      platform: 'google_forms',
      reportedQuestionCount: 7,
      preliminaryFindings: [{ type: 'ewallet', snippet: 'dana', context: 'pendanaan' }],
      snippetForAi: 'isi form',
    });
    expect(p).toMatch(/petunjuk/i);
    expect(p).toContain('isi form');
    expect(p).toContain('google_forms');
    expect(p).toContain('"snippet":"dana"');
  });
});
