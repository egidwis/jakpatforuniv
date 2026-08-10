import type { QuestionBlock } from './customForms';

export interface AiAction {
  type: 'SET_TITLE' | 'SET_DESCRIPTION' | 'ADD_BLOCK' | 'REMOVE_BLOCK' | 'UPDATE_BLOCK' | 'REPLACE_ALL';
  label?: string;
  value?: string;
  description?: string;
  block?: Partial<QuestionBlock>;
  blocks?: Partial<QuestionBlock>[];
  index?: number;
}

export interface AiAgentResponse {
  message: string;
  actions: AiAction[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  actions?: AiAction[];
  timestamp: string;
}

const SYSTEM_PROMPT = `
Anda adalah JFU Form AI Assistant (Ask AI Beta). Tugas Anda adalah membantu pengguna membuat, mengedit, dan menyempurnakan formulir survei secara interaktif dan otomatis.

Format respon Anda HARUS berupa objek JSON valid dengan dua kunci utama:
1. "message": Penjelasan balasan santai, ramah, dan profesional dalam Bahasa Indonesia.
2. "actions": Array perintah aksi yang akan diterapkan langsung ke editor formulir.

Jenis perintah aksi ("actions") yang didukung:
- { "type": "SET_TITLE", "value": "Judul Baru" }
- { "type": "SET_DESCRIPTION", "value": "Deskripsi baru..." }
- { "type": "ADD_BLOCK", "block": { "type": "short_text"|"long_text"|"multiple_choice"|"checkbox"|"rating"|"date", "label": "Judul Pertanyaan", "description": "Petunjuk", "required": true, "options": ["Opsi 1", "Opsi 2"], "maxScale": 5, "logicRules": [{ "id": "rule_1", "sourceBlockId": "target_id", "operator": "equals"|"not_equals"|"contains"|"is_answered"|"is_empty", "value": "Nilai", "action": "show"|"hide"|"jump_to"|"carry_forward", "targetBlockId": "target_id" }] } }
- { "type": "UPDATE_BLOCK", "index": 0, "block": { "label": "Judul Baru", "options": ["Opsi A", "Opsi B", "Lainnya"] } }
- { "type": "REMOVE_BLOCK", "index": 0 }
- { "type": "REPLACE_ALL", "value": "Judul", "description": "Deskripsi", "blocks": [ ... list of question blocks ... ] }

Aturan Penting:
- Tipe pertanyaan yang tersedia HANYA: 'short_text', 'long_text', 'multiple_choice', 'checkbox', 'rating', 'date'.
- Untuk 'multiple_choice' dan 'checkbox', selalu sertakan array 'options'. Jika pengguna meminta opsi "Lainnya", sertakan "Lainnya" di dalam array options.
- Jika pengguna meminta alur kuis/survei bersyarat (kondisional), tambahkan array "logicRules" pada block pertanyaan yang bersangkutan.
- Kembalikan HANYA JSON valid tanpa teks di luar objek JSON.
`;

/**
 * Call the /api/chat proxy to generate or update form schema via AI
 */
export async function sendFormAiPrompt(
  promptHistory: { role: 'user' | 'assistant'; content: string }[],
  currentFormState: { title: string; description: string; blocks: QuestionBlock[] }
): Promise<AiAgentResponse> {

  const contextMessage = `
Formulir saat ini:
- Judul: "${currentFormState.title}"
- Deskripsi: "${currentFormState.description}"
- Pertanyaan (${currentFormState.blocks.length}):
${JSON.stringify(currentFormState.blocks, null, 2)}
`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `[SYSTEM CONTEXT]\n${contextMessage}` },
    ...promptHistory.map(m => ({
      role: m.role,
      content: m.content
    }))
  ];

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI Request failed: ${errText}`);
  }

  const data = await response.json();
  const rawOutput = data.choices?.[0]?.message?.content || '';

  // Extract JSON from markdown response if present
  let jsonString = rawOutput.trim();
  const match = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    jsonString = match[1].trim();
  }

  try {
    const parsed: AiAgentResponse = JSON.parse(jsonString);
    return {
      message: parsed.message || 'Formulir berhasil diperbarui!',
      actions: Array.isArray(parsed.actions) ? parsed.actions : []
    };
  } catch (e) {
    // Fallback if AI outputted plain text
    return {
      message: rawOutput,
      actions: []
    };
  }
}
