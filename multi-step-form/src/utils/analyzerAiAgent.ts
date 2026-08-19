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
 * Generates initial starter blocks immediately upon CSV upload without waiting for first prompt.
 */
export function generateInitialCanvasBlocks(summary: DatasetSummary): CanvasBlock[] {
  const blocks: CanvasBlock[] = [];

  // 1. Metric Overview Block
  const metricItems = [
    { label: 'Total Responden', value: summary.totalRows.toLocaleString('id-ID'), subtext: 'Sampel terdata' },
    { label: 'Total Variabel/Pertanyaan', value: summary.totalColumns, subtext: 'Kolom kuesioner' }
  ];

  if (summary.detectedDemographics.length > 0) {
    metricItems.push({
      label: 'Variabel Demografi',
      value: summary.detectedDemographics.length,
      subtext: summary.detectedDemographics.slice(0, 2).join(', ')
    });
  }

  blocks.push({
    id: `block_${Date.now()}_1`,
    type: 'metric',
    title: 'Ringkasan Sampel Penelitian',
    metricConfig: metricItems,
    createdAt: new Date().toISOString()
  });

  // 2. First demographic or categorical chart
  const firstChartCol = summary.columns.find(c => c.type === 'demographic' || c.type === 'categorical');
  if (firstChartCol && Object.keys(firstChartCol.counts).length <= 8) {
    const chartData = Object.entries(firstChartCol.counts).map(([name, value]) => ({
      name,
      value
    }));

    blocks.push({
      id: `block_${Date.now()}_2`,
      type: 'chart',
      title: `Distribusi ${firstChartCol.label}`,
      narrative: `Berdasarkan data yang dihimpun dari ${summary.totalRows} responden, mayoritas responden pada kategori **${firstChartCol.label}** didominasi oleh **${chartData[0]?.name}** sebesar ${firstChartCol.percentages[chartData[0]?.name] || 0}% (n=${chartData[0]?.value}).`,
      chartConfig: {
        chartType: chartData.length <= 4 ? 'donut' : 'bar',
        xAxisKey: 'name',
        dataKeys: ['value'],
        data: chartData
      },
      createdAt: new Date().toISOString()
    });
  }

  return blocks;
}
