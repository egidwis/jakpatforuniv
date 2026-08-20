import type { DatasetSummary, CanvasBlock, AnalyzerAiAction, AnalyzerChatMessage } from '../components/analyzer/types';

export interface AnalyzerAiResponse {
  message: string;
  actions: AnalyzerAiAction[];
}

const ANALYZER_SYSTEM_PROMPT = `
Anda adalah JFU Survey Data Analyst & Research Assistant (Ask JFU AI).
Tugas Anda adalah membantu mahasiswa, peneliti, dan akademisi menganalisis data kuesioner survei, membuat tabulasi silang (cross-tabulation), visualisasi data (grafik bar, pie/donut, stacked bar), dan menyusun narasi akademik standar skripsi/laporan penelitian (khususnya Bab 4 Hasil & Pembahasan dan Bab 5 Kesimpulan).

Format respon Anda HARUS berupa JSON valid dengan struktur:
{
  "message": "Penjelasan ramah, insightful, dan solutif dalam Bahasa Indonesia...",
  "actions": [
    {
      "action": "add_block" | "update_block" | "remove_block" | "replace_all_blocks",
      "block": {
        "type": "chart" | "narrative" | "crosstab" | "metric",
        "title": "Judul Widget/Blok",
        "narrative": "Teks penjelasan formal gaya akademik (markdown supported)...",
        "chartConfig": {
          "chartType": "bar" | "donut" | "pie" | "stacked_bar" | "horizontal_bar",
          "xAxisKey": "name",
          "dataKeys": ["value"] atau ["Laki-laki", "Perempuan"],
          "data": [
            { "name": "Kategori A", "value": 45 },
            { "name": "Kategori B", "value": 55 }
          ]
        },
        "crossTabConfig": {
          "rowVariable": "Jenis Kelamin",
          "colVariable": "Tingkat Kepuasan Layanan"
        },
        "metricConfig": [
          { "label": "Total Sampel", "value": "200", "subtext": "Responden Valid" },
          { "label": "Kepuasan Rata-rata", "value": "4.2 / 5", "badge": "Tinggi" }
        ]
      }
    }
  ]
}

Aturan Penulisan Narasi Akademik:
- Gunakan bahasa baku, lugas, dan terstruktur sesuai kaidah penulisan karya ilmiah/skripsi Indonesia.
- Selalu sertakan angka konkret (n=..., persentase %) saat mendeskripsikan temuan agar siap di-copy langsung ke Bab 4.
- Hindari opini subjektif tanpa dasar data; berikan interpretasi apa arti angka tersebut terhadap konteks penelitian.

Aturan Visualisasi Grafik & Tabulasi Silang:
- Untuk tabulasi silang (cross-tabulation): gunakan type: "crosstab", sertakan crossTabConfig: { "rowVariable": "Nama Kolom A", "colVariable": "Nama Kolom B" }, dan beri narasi temuan korelasi / perbandingannya.
- Untuk distribusi frekuensi 1 pertanyaan pilihan ganda: gunakan type: "chart", chartType "bar" atau "horizontal_bar".
- Untuk proporsi demografi (Gender, Fakultas, Status): gunakan type: "chart", chartType "donut" atau "pie".
- Pastikan nama variabel di rowVariable dan colVariable sesuai dengan daftar kolom pada dataset.
- Kembalikan HANYA format JSON valid tanpa tanda backtick markdown di luar objek JSON jika memungkinkan, atau JSON utuh.
`;

export async function sendAnalyzerAiPrompt(
  chatHistory: AnalyzerChatMessage[],
  datasetSummary: DatasetSummary,
  currentBlocks: CanvasBlock[]
): Promise<AnalyzerAiResponse> {
  const datasetContext = {
    fileName: datasetSummary.fileName,
    totalRespondents: datasetSummary.totalRows,
    totalColumns: datasetSummary.totalColumns,
    demographics: datasetSummary.detectedDemographics,
    likertColumns: datasetSummary.detectedLikertColumns,
    columnsSummary: datasetSummary.columns.map(c => ({
      key: c.key,
      label: c.label,
      type: c.type,
      distinctCount: c.distinctCount,
      missingCount: c.missingCount,
      mean: c.mean,
      percentages: c.percentages,
      counts: c.counts
    }))
  };

  const canvasContext = currentBlocks.map(b => ({
    id: b.id,
    type: b.type,
    title: b.title
  }));

  const messages = [
    { role: 'system', content: ANALYZER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `[DATASET CONTEXT]\n${JSON.stringify(datasetContext, null, 2)}\n\n[CANVAS BLOCKS SAAT INI (${canvasContext.length})]\n${JSON.stringify(canvasContext, null, 2)}`
    },
    ...chatHistory.map(m => ({
      role: m.role,
      content: m.content
    }))
  ];

  try {
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
      throw new Error(`Chat API error: ${response.statusText}`);
    }

    const resJson = await response.json();
    const rawContent: string = resJson.choices?.[0]?.message?.content || resJson.message || '';

    // Robust JSON extraction
    let jsonStr = rawContent.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      try {
        const parsed: AnalyzerAiResponse = JSON.parse(jsonStr);
        if (parsed.message) {
          return parsed;
        }
      } catch (err) {
        console.warn('JSON substring parse failed, falling back:', err);
      }
    }

    // Fallback: if model returned conversational markdown text instead of strict JSON,
    // gracefully convert it into a Narrative Block on the Canvas!
    return {
      message: rawContent,
      actions: [
        {
          action: 'add_block',
          block: {
            type: 'narrative',
            title: 'Hasil Analisis & Interpretasi',
            narrative: rawContent
          }
        }
      ]
    };
  } catch (error: any) {
    console.error('[Analyzer AI Error]:', error);
    return {
      message: 'Maaf, terjadi kendala saat memproses analisa dengan AI. Silakan coba ajukan pertanyaan lagi.',
      actions: []
    };
  }
}

/**
 * Generates an initial multi-block deep storytelling analysis immediately upon CSV upload.
 */
export async function generateDeepSurveyStory(
  summary: DatasetSummary,
  rawRows: Record<string, string>[]
): Promise<{ blocks: CanvasBlock[]; welcomeMessage: string }> {
  // Try generating via AI for deep insight
  try {
    const demoCol = summary.detectedDemographics[0] || summary.columns[0]?.label || 'Kategori';
    const mainCol = summary.columns.find(c => c.label !== demoCol && (c.type === 'likert' || c.type === 'categorical'))?.label || summary.columns[1]?.label || 'Variabel';

    const promptText = `Lakukan deep scanning terhadap seluruh dataset survei "${summary.fileName}" (${summary.totalRows} responden, ${summary.totalColumns} variabel).
Susun Executive Storytelling Report lengkap yang terdiri dari:
1. Block "narrative": "3 Temuan Utama & Pola Signifikan Riset" (sertakan angka konkret n=... dan persentase %).
2. Block "chart": "Distribusi Demografi: ${demoCol}" (pilih donut jika kategori <=4, bar jika >4).
3. Block "crosstab": "Tabulasi Silang: ${demoCol} vs ${mainCol}" (tentukan rowVariable: "${demoCol}", colVariable: "${mainCol}").
4. Block "chart": "Distribusi Indikator Utama: ${mainCol}".
5. Block "narrative": "Kesimpulan Sementara & Implikasi Penelitian".

Kembalikan respon JSON dengan actions "add_block" untuk setiap blok di atas secara berurutan.`;

    const initialHistory: AnalyzerChatMessage[] = [
      {
        id: `msg_system_init`,
        role: 'user',
        content: promptText,
        timestamp: new Date().toISOString()
      }
    ];

    const aiRes = await sendAnalyzerAiPrompt(initialHistory, summary, []);
    
    if (aiRes && aiRes.actions && aiRes.actions.length > 0) {
      const generatedBlocks: CanvasBlock[] = [];
      
      aiRes.actions.forEach((act, idx) => {
        if (act.block) {
          generatedBlocks.push({
            id: `block_deep_${Date.now()}_${idx}`,
            type: act.block.type || 'narrative',
            title: act.block.title || `Temuan Analisis ${idx + 1}`,
            narrative: act.block.narrative,
            chartConfig: act.block.chartConfig,
            crossTabConfig: act.block.crossTabConfig,
            metricConfig: act.block.metricConfig,
            createdAt: new Date().toISOString()
          });
        }
      });

      if (generatedBlocks.length >= 2) {
        return {
          blocks: generatedBlocks,
          welcomeMessage: aiRes.message || `Halo! Saya telah melakukan deep scanning terhadap ${summary.totalRows} responden dan menyusun canvas analisis lengkap di sebelah kiri. Silakan jelajahi temuan-temuan di atas atau ajukan pertanyaan spesifik!`
        };
      }
    }
  } catch (err) {
    console.warn('[Analyzer AI] Deep story generation falling back to local profiler:', err);
  }

  // Fallback to rich deterministic storytelling generated from dataset profiler
  return generateDeterministicStory(summary, rawRows);
}

/**
 * Deterministic rich storytelling fallback if AI prompt is offline/slow.
 */
function generateDeterministicStory(
  summary: DatasetSummary,
  rawRows: Record<string, string>[]
): { blocks: CanvasBlock[]; welcomeMessage: string } {
  const blocks: CanvasBlock[] = [];
  const demoCols = summary.detectedDemographics;
  const firstDemo = summary.columns.find(c => demoCols.includes(c.label)) || summary.columns[0];
  const secondCol = summary.columns.find(c => c.label !== firstDemo?.label && (c.type === 'categorical' || c.type === 'likert')) || summary.columns[1];

  // 1. Executive Metric & Key Highlights
  const topCategories = summary.columns.slice(0, 3).map(c => {
    const topEntry = Object.entries(c.counts).sort((a, b) => b[1] - a[1])[0];
    return topEntry ? `**${c.label}** mayoritas didominasi oleh **${topEntry[0]}** (${c.percentages[topEntry[0]] || 0}%, n=${topEntry[1]})` : '';
  }).filter(Boolean);

  blocks.push({
    id: `block_${Date.now()}_takeaways`,
    type: 'narrative',
    title: '🌟 3 Temuan Utama & Pola Signifikan Riset',
    narrative: `Berdasarkan pemindaian awal terhadap **${summary.totalRows} responden** dan **${summary.totalColumns} variabel kuesioner**, berikut adalah temuan utama yang teridentifikasi:\n\n` +
      topCategories.map((t, i) => `${i + 1}. ${t}.`).join('\n\n') +
      `\n\n*Temuan ini siap menjadi dasar pembahasan mendalam untuk Bab 4 maupun laporan eksekutif.*`,
    createdAt: new Date().toISOString()
  });

  // 2. Metric Overview
  blocks.push({
    id: `block_${Date.now()}_kpi`,
    type: 'metric',
    title: 'Ringkasan Sampel Penelitian',
    metricConfig: [
      { label: 'Total Responden', value: summary.totalRows.toLocaleString('id-ID'), subtext: 'Responden Valid' },
      { label: 'Variabel Kuesioner', value: summary.totalColumns, subtext: 'Kolom Terdata' },
      { label: 'Variabel Demografi', value: summary.detectedDemographics.length || 1, subtext: summary.detectedDemographics.slice(0, 2).join(', ') || 'Terpetakan' }
    ],
    createdAt: new Date().toISOString()
  });

  // 3. Demographic Distribution Chart
  if (firstDemo) {
    const chartData = Object.entries(firstDemo.counts).map(([name, value]) => ({ name, value }));
    blocks.push({
      id: `block_${Date.now()}_demo_chart`,
      type: 'chart',
      title: `Distribusi Demografi: ${firstDemo.label}`,
      narrative: `Dari total ${summary.totalRows} responden, profil demografi **${firstDemo.label}** menunjukkan bahwa kelompok terbesar adalah **${chartData[0]?.name}** dengan proporsi ${firstDemo.percentages[chartData[0]?.name] || 0}% (n=${chartData[0]?.value}), diikuti oleh kategori lainnya secara proporsional.`,
      chartConfig: {
        chartType: chartData.length <= 4 ? 'donut' : 'bar',
        xAxisKey: 'name',
        dataKeys: ['value'],
        data: chartData
      },
      createdAt: new Date().toISOString()
    });
  }

  // 4. CrossTab Matrix Block
  if (firstDemo && secondCol) {
    blocks.push({
      id: `block_${Date.now()}_crosstab`,
      type: 'crosstab',
      title: `Tabulasi Silang: ${firstDemo.label} vs ${secondCol.label}`,
      narrative: `Tabulasi silang antara **${firstDemo.label}** dan **${secondCol.label}** menunjukkan adanya variasi preferensi dan pola jawaban responden antar kelompok demografi.`,
      crossTabConfig: {
        rowVariable: firstDemo.label,
        colVariable: secondCol.label,
        colLabels: [],
        matrix: [],
        totalCount: summary.totalRows
      },
      createdAt: new Date().toISOString()
    });
  }

  // 5. Main Variable Distribution Chart
  if (secondCol) {
    const chartData = Object.entries(secondCol.counts).map(([name, value]) => ({ name, value }));
    blocks.push({
      id: `block_${Date.now()}_main_chart`,
      type: 'chart',
      title: `Distribusi Indikator: ${secondCol.label}`,
      narrative: `Sebaran jawaban pada variabel **${secondCol.label}** mengindikasikan bahwa responden paling banyak memilih **${chartData[0]?.name}** (${secondCol.percentages[chartData[0]?.name] || 0}%, n=${chartData[0]?.value}).`,
      chartConfig: {
        chartType: 'bar',
        xAxisKey: 'name',
        dataKeys: ['value'],
        data: chartData
      },
      createdAt: new Date().toISOString()
    });
  }

  return {
    blocks,
    welcomeMessage: `Halo! Saya telah membaca dataset **${summary.fileName}** (${summary.totalRows} responden) dan secara otomatis menyusun ringkasan temuan, tabulasi silang, serta visualisasi grafik di canvas sebelah kiri. Silakan eksplorasi atau tanyakan hal spesifik!`
  };
}

export function generateInitialCanvasBlocks(summary: DatasetSummary): CanvasBlock[] {
  return generateDeterministicStory(summary, []).blocks;
}

