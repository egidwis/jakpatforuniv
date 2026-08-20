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

/**
 * Transforms 100% AI Comprehension results into executable rules and goals.
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

  // 1. Process AI Screening Rules
  (aiResult.screeningRules || []).forEach((sr, idx) => {
    // Find matching column
    const col = summary.columns.find(
      c => c.label.toLowerCase().includes(sr.columnLabel.toLowerCase()) || sr.columnLabel.toLowerCase().includes(c.label.toLowerCase())
    );
    const colLabel = col ? col.label : sr.columnLabel;

    // Calculate actual affected count in data
    let count = 0;
    if (sr.disqualifyValue) {
      const dqLower = sr.disqualifyValue.toLowerCase().trim();
      rows.forEach(r => {
        const val = (r[colLabel] || '').toLowerCase().trim();
        if (val === dqLower || val.startsWith(dqLower)) {
          count++;
        }
      });
    }

    rules.push({
      id: `ai_rule_scr_${idx}`,
      title: sr.title || `Filter: ${sr.disqualifyValue}`,
      description: `Ditemukan ${count} baris (${((count / (rows.length || 1)) * 100).toFixed(1)}%) yang menjawab "${sr.disqualifyValue}".`,
      columnLabel: colLabel,
      type: 'screening',
      affectedCount: count,
      recommended: true,
      enabled: true,
      filterValue: sr.disqualifyValue,
      reason: sr.reason || 'Sesuai analisis AI terhadap kriteria kuesioner.'
    });
  });

  // 2. Process AI Missing Value Rules
  (aiResult.missingRules || []).forEach((mr, idx) => {
    const col = summary.columns.find(
      c => c.label.toLowerCase().includes(mr.columnLabel.toLowerCase()) || mr.columnLabel.toLowerCase().includes(c.label.toLowerCase())
    );
    const colLabel = col ? col.label : mr.columnLabel;
    const missingCount = col ? col.missingCount : 0;

    if (missingCount > 0) {
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

  // 3. Fallback heuristic screening if AI did not return any screening rules
  if (rules.length === 0) {
    const heuristicRules = detectSmartCleaningRules(summary, rows);
    rules.push(...heuristicRules);
  }

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
    summaryText: aiResult.studySummary || `Analisis terhadap ${rows.length} responden survei.`
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
