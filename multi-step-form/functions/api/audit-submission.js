/**
 * functions/api/audit-submission.js
 *
 * Automated AI Pre-Screening for manual survey submission links.
 * Uses:
 * 1. Cloudflare Browser Rendering (env.MYBROWSER via @cloudflare/puppeteer) if available,
 *    with a graceful fetch/DOM fallback for local dev or offline bindings.
 * 2. Regex scanning for PII patterns (NIK, Phone, Email, NIM, E-wallet).
 * 3. Semantic AI evaluation via OpenRouter using google/gemini-2.5-flash-lite.
 * 4. Persists the structured result to Supabase `form_submissions.ai_prescreening`.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AUDIT_MODEL = 'google/gemini-2.5-flash-lite';

function identifyPlatform(url) {
  if (!url) return 'other';
  const lower = url.toLowerCase();
  if (lower.includes('docs.google.com/forms')) return 'google_forms';
  if (lower.includes('forms.office.com') || lower.includes('forms.microsoft.com') || lower.includes('forms.cloud.microsoft')) {
    return 'microsoft_forms';
  }
  if (lower.includes('typeform.com')) return 'typeform';
  if (lower.includes('qualtrics.com')) return 'qualtrics';
  return 'other';
}

function cleanHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const REGEX_PATTERNS = {
  phone: /(?:(?:\+62|62|08)[0-9]{8,12}|nomor\s*(?:wa|whatsapp|hp|telepon|ponsel|kontak)|kontak\s*aktif)/i,
  nik: /(?:\b[1-9][0-9]{15}\b|nomor\s*induk\s*kependudukan|\bktp\b|\bnik\b)/i,
  email: /(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|alamat\s*email|\be-mail\b)/i,
  nim: /(?:nomor\s*induk\s*mahasiswa|\bnim\b|\bnpm\b)/i,
  address: /(?:alamat\s*(?:lengkap|rumah|domisili)|tempat\s*tinggal\s*lengkap|kode\s*pos)/i,
  ewallet: /(?:gopay|ovo|dana|shopeepay|linkaja|nomor\s*e-wallet|rekening\s*bank)/i,
  randomizer: /(?:acak|random|diacak|rotasi|urutan\s*pertanyaan\s*diacak|urutan\s*opsi\s*diacak)/i
};

function performFastRegexScan(text) {
  const preliminaryFindings = [];
  for (const [key, regex] of Object.entries(REGEX_PATTERNS)) {
    if (key === 'randomizer') continue;
    const match = text.match(regex);
    if (match) {
      preliminaryFindings.push({
        type: key,
        snippet: match[0],
        context: text.substring(Math.max(0, match.index - 40), Math.min(text.length, match.index + match[0].length + 40)).trim()
      });
    }
  }
  const randomizerMatch = text.match(REGEX_PATTERNS.randomizer);
  return {
    preliminaryFindings,
    preliminaryRandomizer: !!randomizerMatch
  };
}

async function extractContentFromUrl(url, env) {
  let extractedText = '';
  let extractorUsed = 'fetch_fallback';

  // 1. Try Cloudflare Browser Rendering if env.MYBROWSER is present
  if (env && env.MYBROWSER) {
    let browser;
    try {
      console.log('[audit-submission] Launching Cloudflare Browser Rendering for:', url);
      const puppeteer = await import('@cloudflare/puppeteer');
      browser = await puppeteer.default.launch(env.MYBROWSER);
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

      extractedText = await page.evaluate(() => {
        return document.body ? document.body.innerText : '';
      });
      extractorUsed = 'cloudflare_puppeteer';
    } catch (browserError) {
      console.warn('[audit-submission] Cloudflare Browser Rendering failed, falling back to direct fetch:', browserError.message);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (_) {}
      }
    }
  }

  // 2. Fallback: Direct Fetch (CORS bypassed on server-side)
  if (!extractedText) {
    try {
      console.log('[audit-submission] Direct fetch fallback for:', url);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow'
      });
      if (res.ok) {
        const rawHtml = await res.text();
        extractedText = cleanHtmlToText(rawHtml);
      } else {
        console.warn(`[audit-submission] Fetch failed with status: ${res.status}`);
      }
    } catch (fetchError) {
      console.error('[audit-submission] Direct fetch error:', fetchError.message);
    }
  }

  return { extractedText, extractorUsed };
}

async function runSemanticAuditWithAI(params) {
  const { openrouterKey, text, reportedQuestionCount, platform, preliminaryFindings } = params;

  if (!openrouterKey) {
    throw new Error('OPENROUTER_API_KEY tidak terkonfigurasi di server');
  }

  const snippetForAi = text.slice(0, 15000); // Guard token limits

  const systemPrompt = `Anda adalah Jakpat AI Compliance & Survey Quality Inspector.
Tugas Anda adalah memeriksa teks formulir kuesioner survei hasil scraping dan menghasilkan audit terstruktur.

Kategori yang harus dievaluasi:
1. "question_count":
   - Hitung estimasi jumlah pertanyaan aktual yang ada di kuesioner.
   - Bandingkan dengan jumlah pertanyaan yang dilaporkan peneliti (reported: ${reportedQuestionCount || 0}).
   - Tentukan status: "match" (jika sama atau selisih 0), "mismatch_over" (pertanyaan aktual lebih banyak dari yang dilaporkan), atau "mismatch_under" (pertanyaan aktual lebih sedikit).

2. "pii" (Personal Identifiable Information / Data Pribadi):
   - Kategori yang dilarang/diaudit: "phone", "email", "nik", "name", "address", "nim", "ewallet", "other".
   - Perhatikan konteks:
     * Jika pertanyaan meminta nomor HP / Nama Lengkap / Email responden di awal/inti survei -> ini PELANGGARAN ("violation").
     * Jika pertanyaan hanya meminta nomor e-wallet / kontak di bagian akhir KHUSUS untuk pengiriman hadiah/reward undian -> ini "warning" (perlu review manual, bukan langsung reject).
     * Pertanyaan demografi umum (usia, gender, kota tanpa alamat jalan lengkap) -> AMAN ("clean").

3. "randomizer":
   - Cek apakah kuesioner menyebutkan pengacakan urutan soal atau opsi jawaban (misal "urutan diacak", "acak stimulus").

4. "recommendation":
   - "ready_to_approve": Tidak ada PII, jumlah pertanyaan cocok, tidak ada isu randomizer.
   - "needs_manual_review": Ada selisih kecil pertanyaan atau kontak e-wallet hadiah undian opsional.
   - "reject_or_revise": Ada data pribadi sensitif terlarang (NIK, No HP wajib responden) atau jumlah pertanyaan melebihi kuota secara signifikan.

Format balasan HARUS HANYA JSON murni tanpa markdown/backticks, dengan struktur:
{
  "status": "clean" | "warning" | "flagged",
  "question_count": {
    "reported": number,
    "actual_detected": number,
    "diff": number,
    "status": "match" | "mismatch_over" | "mismatch_under"
  },
  "pii": {
    "has_pii": boolean,
    "status": "clean" | "warning" | "violation",
    "findings": [
      {
        "type": "phone" | "email" | "nik" | "name" | "address" | "nim" | "ewallet" | "other",
        "snippet": "teks potongan",
        "context": "konteks pertanyaan",
        "confidence": "high" | "medium" | "low"
      }
    ]
  },
  "randomizer": {
    "detected": boolean,
    "signals": ["sinyal 1"]
  },
  "recommendation": "ready_to_approve" | "needs_manual_review" | "reject_or_revise",
  "summary": "Ringkasan kesimpulan dalam 1-2 kalimat Bahasa Indonesia yang jelas untuk admin.",
  "detected_questions_sample": ["Contoh pertanyaan 1", "Contoh pertanyaan 2"]
}`;

  const userPrompt = `Data Kuesioner:
Platform: ${platform}
Reported Questions: ${reportedQuestionCount || 0}
Preliminary Regex Scan: ${JSON.stringify(preliminaryFindings)}

Konten Teks Kuesioner:
${snippetForAi}
`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: AUDIT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error (${response.status}): ${errText}`);
  }

  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || '';

  let jsonStr = rawContent.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  return JSON.parse(jsonStr);
}

async function saveAuditToSupabase(env, submissionId, auditResult) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.warn('[audit-submission] Supabase credentials missing in env, skipping DB persistence');
    return;
  }

  try {
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/form_submissions?id=eq.${encodeURIComponent(submissionId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        ai_prescreening: auditResult,
        updated_at: new Date().toISOString()
      })
    });

    if (!patchRes.ok) {
      console.error(`[audit-submission] Failed to persist audit to Supabase (${patchRes.status}):`, await patchRes.text());
    } else {
      console.log(`[audit-submission] Successfully persisted audit to submission #${submissionId}`);
    }
  } catch (err) {
    console.error('[audit-submission] Error persisting to Supabase:', err.message);
  }
}

export async function onRequestPost({ request, env }) {
  const auditedAt = new Date().toISOString();

  try {
    const body = await request.json().catch(() => ({}));
    const { submissionId, formUrl, reportedQuestionCount = 0 } = body;

    if (!formUrl) {
      return new Response(JSON.stringify({ error: 'Missing formUrl parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const platform = identifyPlatform(formUrl);
    console.log(`[audit-submission] Starting pre-screening for URL: ${formUrl} (Platform: ${platform})`);

    // 1. Extract content
    const { extractedText, extractorUsed } = await extractContentFromUrl(formUrl, env);

    if (!extractedText || extractedText.length < 30) {
      // Content extraction yielded little or nothing (e.g. strict login/firewall)
      const fallbackResult = {
        status: 'warning',
        audited_at: auditedAt,
        source_platform: platform,
        url: formUrl,
        question_count: {
          reported: reportedQuestionCount,
          actual_detected: 0,
          diff: -reportedQuestionCount,
          status: 'mismatch_under'
        },
        pii: {
          has_pii: false,
          findings: [],
          status: 'clean'
        },
        randomizer: {
          detected: false,
          signals: []
        },
        recommendation: 'needs_manual_review',
        summary: 'Form terkunci login atau konten SPA tidak dapat dirender secara otomatis. Silakan verifikasi manual via tombol Buka Link.',
        error_message: 'Halaman form memerlukan otentikasi login atau tidak mengembalikan konten publik.'
      };

      if (submissionId) {
        await saveAuditToSupabase(env, submissionId, fallbackResult);
      }

      return new Response(JSON.stringify(fallbackResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Fast regex pre-scan
    const { preliminaryFindings } = performFastRegexScan(extractedText);

    // 3. AI Semantic Evaluation
    const openrouterKey = env.OPENROUTER_API_KEY;
    let auditReport;

    if (openrouterKey) {
      try {
        const aiOutput = await runSemanticAuditWithAI({
          openrouterKey,
          text: extractedText,
          reportedQuestionCount,
          platform,
          preliminaryFindings
        });

        auditReport = {
          ...aiOutput,
          audited_at: auditedAt,
          source_platform: platform,
          url: formUrl
        };
      } catch (aiErr) {
        console.error('[audit-submission] Semantic AI audit error, falling back to rule-based:', aiErr.message);
      }
    }

    // Fallback if AI call was skipped or failed
    if (!auditReport) {
      const hasPii = preliminaryFindings.length > 0;
      auditReport = {
        status: hasPii ? 'warning' : 'clean',
        audited_at: auditedAt,
        source_platform: platform,
        url: formUrl,
        question_count: {
          reported: reportedQuestionCount,
          actual_detected: reportedQuestionCount,
          diff: 0,
          status: 'match'
        },
        pii: {
          has_pii: hasPii,
          findings: preliminaryFindings.map(f => ({
            type: f.type,
            snippet: f.snippet,
            context: f.context,
            confidence: 'medium'
          })),
          status: hasPii ? 'warning' : 'clean'
        },
        randomizer: {
          detected: false,
          signals: []
        },
        recommendation: hasPii ? 'needs_manual_review' : 'ready_to_approve',
        summary: hasPii
          ? `Terdeteksi indikasi data pribadi (${preliminaryFindings.map(f => f.type).join(', ')}) via rule scanner.`
          : 'Kuesioner berhasil dipindai dan tidak ditemukan indikasi data pribadi sensitif.',
        error_message: !openrouterKey ? 'OPENROUTER_API_KEY tidak terpasang di environment' : undefined
      };
    }

    // 4. Persist to DB if submissionId given
    if (submissionId) {
      await saveAuditToSupabase(env, submissionId, auditReport);
    }

    return new Response(JSON.stringify(auditReport), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Extractor-Used': extractorUsed
      }
    });
  } catch (error) {
    console.error('[audit-submission] Fatal execution error:', error);
    return new Response(
      JSON.stringify({
        status: 'failed',
        audited_at: auditedAt,
        error: error.message,
        recommendation: 'needs_manual_review',
        summary: `Gagal memproses audit: ${error.message}. Silakan periksa manual.`
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
