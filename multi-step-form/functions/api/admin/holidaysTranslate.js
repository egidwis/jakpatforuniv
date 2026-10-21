import { HOLIDAY_LABEL_EN_MAX } from './holidaysGate.js';

// Terjemahan otomatis pesan mode libur ke bahasa Inggris (sql/122 `label_en`).
// Model & kunci yang sama dengan audit-submission.js. Gagal / lewat batas waktu
// = null: pemanggil menulis '' dan peneliti berbahasa Inggris melihat teks
// Indonesia — menyalakan libur TIDAK PERNAH gagal karena terjemahan.

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TRANSLATE_MODEL = 'google/gemini-2.5-flash-lite';

const SYSTEM_PROMPT =
  'You translate short Indonesian notices from a survey-advertising company admin team into natural English. ' +
  'Reply with the translation only: one line, no quotes, no explanation. Keep names, dates and numbers. ' +
  'Write dates in English (e.g. "Monday, Dec 29").';

/** Rapikan keluaran model: satu baris, tanpa kutip pembungkus, ≤160 karakter. */
export function tidyTranslation(raw) {
  let text = String(raw ?? '').replace(/\s*\n+\s*/g, ' ').trim();
  text = text.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
  if (!text) return null;
  if (text.length > HOLIDAY_LABEL_EN_MAX) text = `${text.slice(0, HOLIDAY_LABEL_EN_MAX - 1).trimEnd()}…`;
  return text;
}

export async function translateAwayLabel(env, text, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const source = String(text ?? '').trim();
  const key = env.OPENROUTER_API_KEY;
  if (!source || !key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(OPENROUTER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TRANSLATE_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: source },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[holidays] terjemahan gagal: HTTP', res.status);
      return null;
    }
    const data = await res.json();
    return tidyTranslation(data?.choices?.[0]?.message?.content);
  } catch (e) {
    console.warn('[holidays] terjemahan gagal:', e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
