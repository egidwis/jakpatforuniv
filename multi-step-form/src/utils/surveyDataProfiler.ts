import type { ColumnDataType, ColumnSummary, DatasetSummary } from '../components/analyzer/types';

/**
 * Fast & robust CSV parser that handles quotes, escaped characters, and newlines.
 */
export function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleanText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleanText) return { headers: [], rows: [] };

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c !== '')) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Push last cell/row
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c !== '')) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = lines[0].map((h, idx) => (h ? h.trim() : `Kolom ${idx + 1}`));
  // Ensure unique headers
  const headerMap = new Map<string, number>();
  const headers = rawHeaders.map(h => {
    const count = headerMap.get(h) || 0;
    headerMap.set(h, count + 1);
    return count > 0 ? `${h} (${count + 1})` : h;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowValues = lines[i];
    const rowObj: Record<string, string> = {};
    headers.forEach((h, hIdx) => {
      rowObj[h] = rowValues[hIdx] !== undefined ? rowValues[hIdx].trim() : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

const LIKERT_KEYWORDS = [
  'sangat setuju', 'setuju', 'netral', 'ragu-ragu', 'tidak setuju', 'sangat tidak setuju',
  'sangat puas', 'puas', 'cukup puas', 'tidak puas', 'sangat tidak puas',
  'sangat sering', 'sering', 'kadang-kadang', 'jarang', 'tidak pernah',
  'sangat penting', 'penting', 'cukup penting', 'tidak penting',
  'strongly agree', 'agree', 'neutral', 'disagree', 'strongly disagree'
];

const DEMOGRAPHIC_KEYWORDS = [
  'jenis kelamin', 'gender', 'usia', 'umur', 'age', 'fakultas', 'jurusan',
  'universitas', 'kampus', 'pendidikan', 'pekerjaan', 'domisili', 'kota',
  'provinsi', 'pengeluaran', 'pendapatan', 'uang saku', 'semester', 'angkatan'
];

export function detectColumnType(columnName: string, values: string[]): ColumnDataType {
  const colLower = columnName.toLowerCase();
  const validValues = values.filter(v => v !== '');

  if (validValues.length === 0) return 'text';

  // 1. Check if demographic keyword in header
  if (DEMOGRAPHIC_KEYWORDS.some(kw => colLower.includes(kw))) {
    return 'demographic';
  }

  // 2. Check if numeric or Likert scale (1-5, 1-7)
  let numericCount = 0;
  let likertKeywordCount = 0;
  const uniqueVals = new Set<string>();

  validValues.forEach(v => {
    uniqueVals.add(v);
    const vLower = v.toLowerCase();
    if (!isNaN(Number(v)) && Number(v) >= 1 && Number(v) <= 10) {
      numericCount++;
    } else if (LIKERT_KEYWORDS.some(kw => vLower === kw || vLower.includes(kw))) {
      likertKeywordCount++;
    }
  });

  const numericRatio = numericCount / validValues.length;
  const likertRatio = likertKeywordCount / validValues.length;

  if (likertRatio > 0.4 || (numericRatio > 0.8 && uniqueVals.size <= 7 && uniqueVals.size >= 2)) {
    return 'likert';
  }

  // Pure numeric (continuous)
  const isAllNumber = validValues.every(v => !isNaN(Number(v)));
  if (isAllNumber && uniqueVals.size > 7) {
    return 'numeric';
  }

  // Long text / open-ended
  const avgLength = validValues.reduce((acc, v) => acc + v.length, 0) / validValues.length;
  if (avgLength > 40 || uniqueVals.size > validValues.length * 0.8) {
    return 'text';
  }

  return 'categorical';
}

export function profileSurveyDataset(
  fileName: string,
  headers: string[],
  rows: Record<string, string>[]
): DatasetSummary {
  const totalRows = rows.length;
  const totalColumns = headers.length;
  const columns: ColumnSummary[] = [];
  const detectedDemographics: string[] = [];
  const detectedLikertColumns: string[] = [];

  headers.forEach((header, idx) => {
    const rawValues = rows.map(r => r[header] || '');
    const validValues = rawValues.filter(v => v !== '');
    const colType = detectColumnType(header, rawValues);

    const counts: Record<string, number> = {};
    validValues.forEach(v => {
      counts[v] = (counts[v] || 0) + 1;
    });

    const percentages: Record<string, number> = {};
    const totalValid = validValues.length || 1;
    Object.entries(counts).forEach(([val, count]) => {
      percentages[val] = Number(((count / totalValid) * 100).toFixed(1));
    });

    const distinctCount = Object.keys(counts).length;
    const missingCount = totalRows - validValues.length;

    let mean: number | undefined;
    let min: number | undefined;
    let max: number | undefined;

    if (colType === 'numeric' || colType === 'likert') {
      const numList = validValues.map(Number).filter(n => !isNaN(n));
      if (numList.length > 0) {
        const sum = numList.reduce((a, b) => a + b, 0);
        mean = Number((sum / numList.length).toFixed(2));
        min = Math.min(...numList);
        max = Math.max(...numList);
      }
    }

    if (colType === 'demographic') {
      detectedDemographics.push(header);
    } else if (colType === 'likert') {
      detectedLikertColumns.push(header);
    }

    const sampleValues = Array.from(new Set(validValues)).slice(0, 5);

    columns.push({
      key: `col_${idx + 1}`,
      label: header,
      type: colType,
      distinctCount,
      missingCount,
      counts,
      percentages,
      mean,
      min,
      max,
      sampleValues
    });
  });

  return {
    fileName,
    totalRows,
    totalColumns,
    columns,
    detectedDemographics,
    detectedLikertColumns
  };
}
