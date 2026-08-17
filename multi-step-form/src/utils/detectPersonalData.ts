import type { QuestionBlock } from './customForms';

export interface PersonalDataDetectionResult {
  hasPersonalDataQuestions: boolean;
  detectedKeywords: string[];
  flaggedQuestions: string[];
}

const SYSTEM_PROMPT = `
Anda adalah AI reviewer kepatuhan (compliance) untuk platform survei Jakpat. Tugas Anda adalah memeriksa daftar pertanyaan sebuah survei dan mendeteksi apakah ADA pertanyaan yang meminta responden mengungkapkan data pribadi yang bisa mengidentifikasi mereka.

Kategori data pribadi yang harus dideteksi (termasuk frasa IMPLISIT, bukan hanya kata kunci eksplisit):
- "email": alamat email, e-mail.
- "phone": nomor HP/WhatsApp/telepon, termasuk frasa implisit seperti "nomor yang bisa dihubungi", "kontak aktif", "nomor kontak".
- "name": nama lengkap, nama responden, termasuk frasa implisit seperti "identitas Anda", "atas nama siapa".
- "address": alamat rumah/domisili lengkap yang bisa dipakai mengirim barang fisik ke rumah seseorang.
- "nik/id": NIK, KTP, nomor identitas kependudukan.
- "e-wallet/hadiah": permintaan nomor/akun e-wallet (DANA, OVO, GoPay, ShopeePay, LinkAja) untuk pengiriman hadiah/insentif.

Yang TIDAK termasuk data pribadi (jangan tandai): pertanyaan demografis umum tanpa identitas (usia, jenis kelamin, kota domisili saja tanpa alamat lengkap, pekerjaan, pendapatan, pendidikan), atau pertanyaan tentang preferensi/opini produk.

Balas HANYA dengan JSON valid, tanpa teks lain, dengan format persis:
{"hasPersonalDataQuestions": boolean, "detectedKeywords": string[], "flaggedQuestions": string[]}

"detectedKeywords" hanya boleh berisi nilai dari daftar berikut (tanpa duplikat, urutan bebas): "email", "phone", "name", "address", "nik/id", "e-wallet/hadiah".
"flaggedQuestions" berisi teks label PERSIS (copy-paste apa adanya, jangan diringkas/diparafrase) dari setiap pertanyaan yang terdeteksi meminta data pribadi — satu entri per pertanyaan yang bermasalah.
Jika tidak ada yang terdeteksi, kembalikan array kosong untuk keduanya dan hasPersonalDataQuestions: false.
`;

const FALLBACK_RESULT: PersonalDataDetectionResult = {
  hasPersonalDataQuestions: true,
  detectedKeywords: ['auto-review'],
  flaggedQuestions: []
};

/**
 * Uses the JFU AI assistant's OpenRouter pattern (via /api/chat) to scan a
 * custom form's question schema for requests for personal respondent data.
 * Fails closed: any error or unparseable response is treated as a positive
 * detection so a submission is never silently auto-approved past this check.
 */
export async function detectPersonalDataInSchema(
  blocks: QuestionBlock[]
): Promise<PersonalDataDetectionResult> {
  if (!blocks || blocks.length === 0) {
    return { hasPersonalDataQuestions: false, detectedKeywords: [], flaggedQuestions: [] };
  }

  const questionsContext = blocks
    .filter(b => b.type !== 'page_break')
    .map(b => ({ label: b.label, description: b.description, options: b.options }));

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Daftar pertanyaan survei:\n${JSON.stringify(questionsContext, null, 2)}` }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${await response.text()}`);
    }

    const data = await response.json();
    const rawOutput = (data.choices?.[0]?.message?.content || '').trim();

    let jsonString = rawOutput;
    const match = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonString = match[1].trim();
    }

    const parsed = JSON.parse(jsonString);
    if (typeof parsed.hasPersonalDataQuestions !== 'boolean' || !Array.isArray(parsed.detectedKeywords)) {
      throw new Error('Unexpected AI response shape');
    }

    return {
      hasPersonalDataQuestions: parsed.hasPersonalDataQuestions,
      detectedKeywords: parsed.detectedKeywords,
      flaggedQuestions: Array.isArray(parsed.flaggedQuestions) ? parsed.flaggedQuestions : []
    };
  } catch (error) {
    console.error('detectPersonalDataInSchema failed, defaulting to manual review:', error);
    return FALLBACK_RESULT;
  }
}
