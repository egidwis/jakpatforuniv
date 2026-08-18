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
- { "type": "ADD_BLOCK", "index": 6, "block": { "type": "short_text"|"long_text"|"multiple_choice"|"checkbox"|"rating"|"date"|"matrix"|"page_break", "label": "Judul Pertanyaan", "description": "Petunjuk", "required": true, "options": ["Opsi 1", "Opsi 2"], "rows": [{ "id": "row_1", "label": "Harga" }, { "id": "row_2", "label": "Rasa" }], "maxScale": 5, "carryForwardFromBlockId": "block_id_acuan", "logicMatchMode": "ALL"|"ANY", "logicRules": [{ "id": "rule_1", "sourceBlockId": "target_id", "operator": "equals"|"not_equals"|"contains"|"is_answered"|"is_empty", "value": "Nilai", "action": "show"|"hide"|"jump_to", "targetBlockId": "target_id" }] } }
- { "type": "UPDATE_BLOCK", "index": 0, "block": { "label": "Judul Baru", "options": ["Opsi A", "Opsi B", "Lainnya"] } }
- { "type": "REMOVE_BLOCK", "index": 0 }
- { "type": "REPLACE_ALL", "value": "Judul", "description": "Deskripsi", "blocks": [ ... list of question blocks ... ] }

Aturan Penting:
- Tipe pertanyaan yang tersedia HANYA: 'short_text', 'long_text', 'multiple_choice', 'checkbox', 'rating', 'date', 'matrix', 'page_break'. JANGAN membuat/menyebut tipe lain di luar daftar ini.
- Untuk 'multiple_choice' dan 'checkbox', selalu sertakan array 'options'. Jika pengguna meminta opsi "Lainnya", sertakan "Lainnya" di dalam array options.
- Untuk 'matrix' (tabel dengan satu skala jawaban yang dipakai bersama oleh beberapa sub-pernyataan, mis. "nilai Harga/Rasa/Kemasan pada skala Sangat Puas–Sangat Tidak Puas"): WAJIB isi DUA field —
  - "rows": array sub-pernyataan/baris, tiap item { "id": string unik, "label": teks baris }.
  - "options": array pilihan jawaban bersama (kolom), sama seperti multiple_choice.
  Jangan buat 'matrix' tanpa mengisi "rows".
- Jika pengguna meminta alur kuis/survei bersyarat (kondisional) berdasarkan jawaban pertanyaan lain, tambahkan array "logicRules" pada block yang bersangkutan. Field "action" pada tiap rule HANYA boleh 'show' (tampilkan), 'hide' (sembunyikan), atau 'jump_to' (lompat ke pertanyaan/"submit" lain). Jika ada lebih dari satu rule pada block yang sama, set "logicMatchMode": "ALL" (semua rule harus terpenuhi) atau "ANY" (salah satu cukup).
- "Carry forward" (membawa opsi yang dipilih responden dari pertanyaan checkbox/multiple_choice sebelumnya menjadi opsi pertanyaan ini) BUKAN logicRules — itu diatur lewat field "carryForwardFromBlockId" langsung pada block (isi dengan id block sumbernya). Jangan pernah menaruh "carry_forward" sebagai value di "action" logicRules, itu tidak valid.
- PENTING soal posisi (ADD_BLOCK): daftar pertanyaan pada [SYSTEM CONTEXT] berindeks mulai dari 0 (pertanyaan pertama = index 0). Field "index" pada ADD_BLOCK menentukan DI MANA block baru disisipkan dalam array (menggeser sisanya ke bawah) — jika tidak diisi, block akan ditambahkan di paling akhir. Jika pengguna minta menyisipkan sesuatu "di antara pertanyaan N dan N+1" atau "setelah pertanyaan ke-N", gunakan "index": N (karena pertanyaan ke-N ada di array index N-1, jadi block baru harus menempati posisi N agar berada tepat setelahnya).
- Saat pengguna minta menambahkan "page break"/"pemisah halaman" di antara dua pertanyaan tertentu, gunakan ADD_BLOCK dengan block type "page_break" dan index yang sesuai — JANGAN gunakan REPLACE_ALL hanya untuk menyisipkan satu pemisah halaman.
- Jika ada pesan bertanda [FILE CONTEXT: ...]: itu adalah isi mentah file CSV hasil export/copy-paste dari form lain (Google Form, dsb) yang dilampirkan pengguna. Baca barisnya, kenali tiap pertanyaan beserta jenis & opsinya (tebak jenis paling sesuai dari daftar tipe yang tersedia jika tidak eksplisit disebut), lalu ubah jadi block-block pertanyaan. Gunakan REPLACE_ALL jika formulir saat ini masih kosong, atau rangkaian ADD_BLOCK di akhir formulir jika formulir sudah berisi pertanyaan lain (kecuali pengguna minta sisipkan di posisi tertentu). Jangan salin baris yang bukan pertanyaan (mis. header kolom, metadata, jawaban responden).
- Jangan pernah membuat block bertipe 'image' — itu bukan tipe yang tersedia untuk Anda buat. Gambar/cover image harus di-upload manual oleh pengguna lewat tombol khusus di form builder, AI tidak bisa menyediakan file gambar. Jika pengguna minta "tambahkan gambar"/"kasih foto produk", jelaskan di "message" bahwa mereka perlu upload manual lewat toolbar "Image", dan JANGAN keluarkan action ADD_BLOCK/REPLACE_ALL dengan type 'image'.
- Kembalikan HANYA JSON valid tanpa teks di luar objek JSON.
`;

const MAX_FILE_CONTEXT_CHARS = 12000;

/**
 * Call the /api/chat proxy to generate or update form schema via AI
 */
export async function sendFormAiPrompt(
  promptHistory: { role: 'user' | 'assistant'; content: string }[],
  currentFormState: { title: string; description: string; blocks: QuestionBlock[] },
  fileContext?: { fileName: string; content: string }
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
    ...(fileContext ? [{
      role: 'user',
      content: `[FILE CONTEXT: ${fileContext.fileName}]\n${
        fileContext.content.length > MAX_FILE_CONTEXT_CHARS
          ? fileContext.content.slice(0, MAX_FILE_CONTEXT_CHARS) + '\n...(dipotong, file terlalu panjang)'
          : fileContext.content
      }`
    }] : []),
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
