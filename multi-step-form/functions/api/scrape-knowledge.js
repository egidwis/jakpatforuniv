// functions/api/scrape-knowledge.js
// Server-side Web Scraper & AI Knowledge Extractor untuk Mimin AI Skill Setup

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function cleanHtmlToText(html) {
  if (!html) return '';
  
  // 1. Remove script, style, noscript, svg, nav, footer, header
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ');

  // 2. Convert common block tags to newlines
  text = text
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n');

  // 3. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 4. Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  // 5. Clean up multiple newlines and spaces
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');

  // Truncate to reasonable context window (~15,000 characters)
  if (text.length > 15000) {
    text = text.slice(0, 15000) + '\n...[konten dipotong]';
  }

  return text;
}

export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json().catch(() => ({}));
    const targetUrl = (body.url || '').trim();

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      return new Response(JSON.stringify({ error: "URL tidak valid. Harap masukkan URL lengkap diawali http:// atau https://" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Fetch webpage content with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let rawHtml = '';
    try {
      const pageRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        redirect: 'follow'
      });

      clearTimeout(timeoutId);

      if (!pageRes.ok) {
        return new Response(JSON.stringify({ 
          error: `Gagal mengakses website (${pageRes.status} ${pageRes.statusText}). Pastikan URL dapat dibuka untuk umum.` 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      rawHtml = await pageRes.text();
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      return new Response(JSON.stringify({ 
        error: `Gagal memuat link: ${fetchErr.message || 'Koneksi timeout atau web tidak merespons.'}` 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Clean HTML to readable text
    const cleanText = cleanHtmlToText(rawHtml);

    if (!cleanText || cleanText.length < 50) {
      return new Response(JSON.stringify({ 
        error: "Konten halaman web terlalu sedikit atau dilindungi oleh render JavaScript (SPA). Silakan salin teks penting secara manual." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Extract knowledge with AI
    const systemPrompt = `Kamu adalah Asisten Kurator Knowledge & SOP untuk Mimin AI (Customer Service & Admin Cerdas Jakpat for Universities).
Tugasmu adalah menganalisis teks dari halaman web yang diberikan dan mengekstrak informasi penting menjadi instruksi SOP yang terstruktur dan siap digunakan oleh Mimin AI saat menjawab pengguna.

Aturan Ekstraksi:
- Fokus pada: harga/biaya, batas waktu/durasi, tahapan proses, syarat & ketentuan, FAQ, dan kebijakan utama.
- Hilangkan teks yang tidak relevan (seperti menu navigasi, copyright, disclaimer generik).
- Buatkan langkah SOP bernomor/berpoin yang tegas dan solutif.

Struktur Output WAJIB JSON:
{
  "title": "Nama ringkas topik atau nama skill (maks 5 kata)",
  "description": "Deskripsi singkat 1 kalimat tentang apa yang dijelaskan materi ini",
  "trigger_context": "Kumpulan situasi atau kata kunci pertanyaan user yang relevan (cth: Ketika user menanyakan harga paket kilat, cara pesan kilat, dsb)",
  "sop_instructions": "Langkah SOP terstruktur bernomor (1, 2, 3...) berisi fakta, rincian biaya, panduan jawaban untuk AI",
  "suggested_actions": [
    {
      "label": "Teks tombol aksi (opsional)",
      "action": "navigate",
      "target": "/dashboard"
    }
  ]
}`;

    const aiRes = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `URL Sumber: ${targetUrl}\n\nIsi Teks Web:\n${cleanText}` }
        ],
        temperature: 0.2
      })
    });

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI output
    let parsedKnowledge = null;
    try {
      const match = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || rawContent.match(/(\{[\s\S]*\})/);
      if (match) {
        parsedKnowledge = JSON.parse(match[1]);
      }
    } catch (parseErr) {
      console.warn("Failed to parse JSON from AI, falling back to raw text:", parseErr);
    }

    if (!parsedKnowledge) {
      parsedKnowledge = {
        title: "Knowledge dari " + new URL(targetUrl).hostname,
        description: "Informasi yang diekstrak dari " + targetUrl,
        trigger_context: "Pertanyaan seputar materi dari halaman " + targetUrl,
        sop_instructions: rawContent || cleanText.slice(0, 1000)
      };
    }

    return new Response(JSON.stringify({
      success: true,
      url: targetUrl,
      knowledge: parsedKnowledge
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[scrape-knowledge] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Terjadi kesalahan internal" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
