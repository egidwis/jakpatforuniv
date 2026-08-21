import type { DatasetSummary } from '../components/analyzer/types';
import type { AiComprehensionResult } from './analyzerAiAgent';

export interface CleaningRule {
  id: string;
  title: string;
  description: string;
  columnLabel: string;
  type: 'screening' | 'missing' | 'custom_filter';
  affectedCount: number;
  recommended: boolean;
  enabled: boolean;
  filterValue?: string;
  reason: string;
}

export interface AnalysisGoalOption {
  id: string;
  title: string;
  description: string;
  recommended: boolean;
  enabled: boolean;
  blockType: 'narrative' | 'chart' | 'crosstab' | 'metric';
  rowVariable?: string;
  colVariable?: string;
  targetVariable?: string;
  detail?: string;
}

function findBestMatchingColumn(query: string, summary: DatasetSummary): any {
  if (!query) return undefined;
  const qLower = query.toLowerCase().trim();
  // 1. Exact match
  const exact = summary.columns.find(c => c.label.toLowerCase().trim() === qLower);
  if (exact) return exact;
  // 2. Substring match
  const sub = summary.columns.find(c => c.label.toLowerCase().includes(qLower) || qLower.includes(c.label.toLowerCase()));
  if (sub) return sub;
  // 3. Token overlap
  const qTokens = qLower.split(/\s+/).filter(t => t.length >= 3);
  let bestCol: any = undefined;
  let maxOverlap = 0;
  summary.columns.forEach(c => {
    const cTokens = c.label.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
    const overlap = qTokens.filter(t => cTokens.some(ct => ct.includes(t) || t.includes(ct))).length;
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestCol = c;
    }
  });
  return maxOverlap > 0 ? bestCol : undefined;
}

/**
 * Transforms 100% AI Comprehension results into executable rules and goals with accurate dataset counts.
 */
export function buildRulesFromAiComprehension(
  aiResult: AiComprehensionResult,
  summary: DatasetSummary,
  rows: Record<string, string>[]
): {
  rules: CleaningRule[];
  goals: AnalysisGoalOption[];
  topic: string;
  summaryText: string;
} {
  const rules: CleaningRule[] = [];

  // 1. First run heuristic baseline to get exact data-grounded counts
  const heuristicRules = detectSmartCleaningRules(summary, rows);

  // 2. If AI returned specific screening rules, match and enrich them
  if (aiResult.screeningRules && aiResult.screeningRules.length > 0) {
    aiResult.screeningRules.forEach((sr, idx) => {
      const col = findBestMatchingColumn(sr.columnLabel, summary) || summary.columns.find(c =>
        c.label.toLowerCase().includes('bersedia') || c.label.toLowerCase().includes('persetujuan')
      );
      const colLabel = col ? col.label : sr.columnLabel;

      // Find matching value from column's actual counts
      let matchedVal = sr.disqualifyValue;
      let count = 0;

      if (col) {
        const dqLower = (sr.disqualifyValue || '').toLowerCase().trim();
        const foundEntry = Object.entries(col.counts).find(([val]) => {
          const valLower = val.toLowerCase().trim();
          return valLower.includes(dqLower) || dqLower.includes(valLower) ||
            valLower.startsWith('tidak') || valLower.includes('tidak bersedia');
        });

        if (foundEntry) {
          matchedVal = foundEntry[0];
          count = foundEntry[1];
        }
      }

      if (count === 0 && col) {
        // Fallback: check rows directly
        rows.forEach(r => {
          const v = (r[colLabel] || '').toLowerCase().trim();
          if (v.startsWith('tidak') || v.includes('tidak bersedia') || v.includes('bukan')) {
            count++;
          }
        });
      }

      // If heuristic already found a rule for this column, reuse its exact count
      const existingHeuristic = heuristicRules.find(hr => hr.columnLabel === colLabel);
      if (existingHeuristic && count === 0) {
        count = existingHeuristic.affectedCount;
        matchedVal = existingHeuristic.filterValue || matchedVal;
      }

      rules.push({
        id: `ai_rule_scr_${idx}`,
        title: sr.title || `Filter: ${matchedVal}`,
        description: `Ditemukan ${count} baris (${((count / (rows.length || 1)) * 100).toFixed(1)}%) yang menjawab "${matchedVal}".`,
        columnLabel: colLabel,
        type: 'screening',
        affectedCount: count,
        recommended: count > 0,
        enabled: count > 0,
        filterValue: matchedVal,
        reason: sr.reason || 'Sesuai analisis AI terhadap kriteria kuesioner.'
      });
    });
  }

  // If no AI screening rules matched or affectedCount was 0, fallback to heuristic rules
  if (rules.length === 0 || rules.every(r => r.affectedCount === 0)) {
    rules.length = 0;
    rules.push(...heuristicRules);
  }

  // 3. Process AI Missing Value Rules
  (aiResult.missingRules || []).forEach((mr, idx) => {
    const col = findBestMatchingColumn(mr.columnLabel, summary);
    const colLabel = col ? col.label : mr.columnLabel;
    const missingCount = col ? col.missingCount : 0;

    if (missingCount > 0 && !rules.some(r => r.columnLabel === colLabel && r.type === 'missing')) {
      rules.push({
        id: `ai_rule_mis_${idx}`,
        title: mr.title || `Hapus baris kosong pada "${colLabel}"`,
        description: `Ditemukan ${missingCount} baris dengan nilai kosong (blank).`,
        columnLabel: colLabel,
        type: 'missing',
        affectedCount: missingCount,
        recommended: missingCount < rows.length * 0.3,
        enabled: missingCount < rows.length * 0.3,
        reason: mr.reason || 'Mencegah bias data.'
      });
    }
  });

  // 4. Process AI Goals
  const goals: AnalysisGoalOption[] = (aiResult.recommendedAnalysisGoals || []).map(g => ({
    id: g.id,
    title: g.title,
    description: g.description,
    recommended: true,
    enabled: true,
    blockType: g.blockType,
    rowVariable: g.rowVariable,
    colVariable: g.colVariable,
    targetVariable: g.targetVariable
  }));

  if (goals.length === 0) {
    goals.push(...getRecommendedAnalysisGoals(summary));
  }

  return {
    rules,
    goals,
    topic: aiResult.studyTopic || `Analisis Data Survei ${summary.fileName.replace(/\.csv$/i, '')}`,
    summaryText: aiResult.studySummary || `Analisis terhadap ${rows.length} responden survei.`,
    defaultObjective: aiResult.defaultObjective || aiResult.studySummary || `Menganalisis sebaran jawaban, korelasi variabel utama, dan menyusun pembahasan laporan penelitian.`
  };
}


const SCREENING_KEYWORDS = [
  'bersedia', 'persetujuan', 'screening', 'kriteria', 'kesediaan', 'pernah',
  'apakah anda', 'setuju berpartisipasi', 'informed consent'
];

const DISQUALIFY_VALUES = [
  'tidak bersedia', 'tidak setuju', 'tidak pernah', 'bukan', 'tidak', 'no', 'disagree'
];

/**
 * Scans columns and detects data cleaning recommendations (screening, missing values, etc.)
 */
export function detectSmartCleaningRules(
  summary: DatasetSummary,
  rows: Record<string, string>[]
): CleaningRule[] {
  const rules: CleaningRule[] = [];

  // 1. Detect Screening & Consent Questions
  summary.columns.forEach(col => {
    const colLower = col.label.toLowerCase();
    const isScreeningQuestion = SCREENING_KEYWORDS.some(kw => colLower.includes(kw));

    if (isScreeningQuestion) {
      // Check if there are disqualifying answers
      Object.entries(col.counts).forEach(([val, count]) => {
        const valLower = val.toLowerCase().trim();
        const isDisqualified = DISQUALIFY_VALUES.some(dq => valLower === dq || valLower.startsWith(dq));

        if (isDisqualified && count > 0) {
          rules.push({
            id: `rule_screening_${col.key}_${val}`,
            title: `Filter Responden Tidak Memenuhi Kriteria (${val})`,
            description: `Ditemukan ${count} responden (${col.percentages[val] || 0}%) yang menjawab "${val}" pada pertanyaan screening.`,
            columnLabel: col.label,
            type: 'screening',
            affectedCount: count,
            recommended: true,
            enabled: true,
            filterValue: val,
            reason: `Responden yang menjawab "${val}" umumnya perlu dieleminasi agar data analisis hanya memuat sampel yang valid sesuai kriteria inklusi.`
          });
        }
      });
    }
  });

  // 2. Detect Columns with Missing Values on Key Demographics
  const demoCols = summary.detectedDemographics;
  summary.columns.forEach(col => {
    if (demoCols.includes(col.label) && col.missingCount > 0) {
      rules.push({
        id: `rule_missing_${col.key}`,
        title: `Hapus Baris Kosong pada "${col.label}"`,
        description: `Ditemukan ${col.missingCount} baris dengan nilai kosong (blank) pada variabel demografi utama.`,
        columnLabel: col.label,
        type: 'missing',
        affectedCount: col.missingCount,
        recommended: col.missingCount < rows.length * 0.3,
        enabled: col.missingCount < rows.length * 0.3,
        reason: 'Mengeliminasi baris kosong mencegah bias perhitungan dan memastikan setiap grafik memiliki basis responden yang konsisten.'
      });
    }
  });

  return rules;
}

/**
 * Provides goal options based on the dataset structure
 */
export function getRecommendedAnalysisGoals(summary: DatasetSummary): AnalysisGoalOption[] {
  const goals: AnalysisGoalOption[] = [];
  const demoCols = summary.detectedDemographics;
  const firstDemo = summary.columns.find(c => demoCols.includes(c.label)) || summary.columns[0];
  const secondCol = summary.columns.find(c => c.label !== firstDemo?.label && (c.type === 'categorical' || c.type === 'likert')) || summary.columns[1];

  goals.push({
    id: 'goal_executive_takeaways',
    title: '🌟 3-4 Temuan Utama Riset (Executive Highlights)',
    description: 'Poin-poin temuan paling menarik, anomali data, dan proporsi mayoritas secara otomatis.',
    recommended: true,
    enabled: true,
    blockType: 'narrative'
  });

  goals.push({
    id: 'goal_kpi_metrics',
    title: '📊 Ringkasan Sampel & Responden Valid (KPI Cards)',
    description: 'Statistik total sampel kuesioner, jumlah respon valid setelah screening, dan total variabel.',
    recommended: true,
    enabled: true,
    blockType: 'metric'
  });

  if (firstDemo) {
    goals.push({
      id: 'goal_demographic_chart',
      title: `👥 Distribusi Profil Demografi: ${firstDemo.label}`,
      description: `Visualisasi grafik Donut / Bar untuk variabel ${firstDemo.label} beserta narasi karakteristik sampel.`,
      recommended: true,
      enabled: true,
      blockType: 'chart',
      detail: firstDemo.label
    });
  }

  if (firstDemo && secondCol) {
    goals.push({
      id: 'goal_crosstab_ai',
      title: `🔀 Tabulasi Silang AI: ${firstDemo.label} vs ${secondCol.label}`,
      description: `Matriks korelasi 2 variabel silang untuk melihat pola preferensi kelompok demografi.`,
      recommended: true,
      enabled: true,
      blockType: 'crosstab',
      detail: `${firstDemo.label} vs ${secondCol.label}`
    });
  }

  if (secondCol) {
    goals.push({
      id: 'goal_main_variable',
      title: `📈 Sebaran Indikator Utama: ${secondCol.label}`,
      description: `Grafik batang horizontal/vertikal untuk pertanyaan inti kuesioner beserta narasi analisis.`,
      recommended: true,
      enabled: true,
      blockType: 'chart',
      detail: secondCol.label
    });
  }

  goals.push({
    id: 'goal_bab4_draft',
    title: '📝 Draf Narasi Akademis Lengkap (Bab 4 Skripsi / Laporan)',
    description: 'Narasi komprehensif berstandar ilmiah yang mengintegrasikan seluruh temuan di atas.',
    recommended: true,
    enabled: true,
    blockType: 'narrative'
  });

  return goals;
}

/**
 * Filters the raw dataset rows using active cleaning rules and optional custom text filters.
 */
export function applyDataCleaning(
  rows: Record<string, string>[],
  activeRules: CleaningRule[],
  customFilters: string[] = []
): {
  cleanedRows: Record<string, string>[];
  excludedCount: number;
  cleaningSummaryNotes: string[];
} {
  if (activeRules.length === 0 && customFilters.length === 0) {
    return {
      cleanedRows: rows,
      excludedCount: 0,
      cleaningSummaryNotes: ['Seluruh data mentah digunakan tanpa proses filter eliminasi.']
    };
  }

  const notes: string[] = [];

  const cleanedRows = rows.filter(row => {
    // 1. Check against active rules
    for (const rule of activeRules) {
      if (!rule.enabled) continue;

      const cellVal = (row[rule.columnLabel] || '').trim();

      if (rule.type === 'screening' && rule.filterValue) {
        if (cellVal.toLowerCase() === rule.filterValue.toLowerCase()) {
          return false; // Eliminate disqualified row
        }
      }

      if (rule.type === 'missing') {
        if (!cellVal) {
          return false; // Eliminate blank row
        }
      }
    }

    // 2. Check custom keyword filters (case-insensitive)
    for (const filterText of customFilters) {
      if (!filterText.trim()) continue;
      const lowerQuery = filterText.toLowerCase().trim();
      const hasMatch = Object.values(row).some(v => v.toLowerCase().includes(lowerQuery));
      if (!hasMatch) return false;
    }

    return true;
  });

  const excludedCount = rows.length - cleanedRows.length;

  activeRules.filter(r => r.enabled).forEach(r => {
    notes.push(`${r.title}: ${r.affectedCount} baris dieleminasi.`);
  });

  return {
    cleanedRows,
    excludedCount,
    cleaningSummaryNotes: notes
  };
}
