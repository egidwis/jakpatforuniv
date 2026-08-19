import type { CrossTabConfig, CrossTabMatrixRow, ChartConfig } from '../components/analyzer/types';

function findColumnKey(rows: Record<string, string>[], target: string): string {
  if (rows.length === 0 || !target) return target;
  const keys = Object.keys(rows[0]);
  // 1. Exact match
  if (keys.includes(target)) return target;

  const targetLower = target.trim().toLowerCase();
  // 2. Case insensitive match
  const ciMatch = keys.find(k => k.toLowerCase() === targetLower);
  if (ciMatch) return ciMatch;

  // 3. Substring match
  const subMatch = keys.find(k => k.toLowerCase().includes(targetLower) || targetLower.includes(k.toLowerCase()));
  if (subMatch) return subMatch;

  return target;
}

/**
 * Calculates a 2-variable Cross Tabulation matrix from row data.
 */
export function calculateCrossTab(
  rows: Record<string, string>[],
  rawRowVar: string,
  rawColVar: string
): CrossTabConfig {
  const rowVariable = findColumnKey(rows, rawRowVar);
  const colVariable = findColumnKey(rows, rawColVar);

  const rowLabelsSet = new Set<string>();
  const colLabelsSet = new Set<string>();

  // Filter out rows missing either variable
  const validRows = rows.filter(r => {
    const rVal = (r[rowVariable] || '').trim();
    const cVal = (r[colVariable] || '').trim();
    if (rVal && cVal) {
      rowLabelsSet.add(rVal);
      colLabelsSet.add(cVal);
      return true;
    }
    return false;
  });

  const rowLabels = Array.from(rowLabelsSet).sort();
  const colLabels = Array.from(colLabelsSet).sort();

  const matrix: CrossTabMatrixRow[] = [];

  rowLabels.forEach(rowLabel => {
    const counts: Record<string, number> = {};
    colLabels.forEach(c => (counts[c] = 0));

    // Count instances for this row
    validRows.forEach(r => {
      if (r[rowVariable] === rowLabel) {
        const colVal = r[colVariable];
        if (colVal) {
          counts[colVal] = (counts[colVal] || 0) + 1;
        }
      }
    });

    const rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    const rowPercentages: Record<string, number> = {};
    colLabels.forEach(c => {
      rowPercentages[c] = rowTotal > 0 ? Number(((counts[c] / rowTotal) * 100).toFixed(1)) : 0;
    });

    matrix.push({
      rowLabel,
      counts,
      rowPercentages,
      total: rowTotal
    });
  });

  return {
    rowVariable,
    colVariable,
    colLabels,
    matrix,
    totalCount: validRows.length
  };
}

/**
 * Converts a CrossTabConfig into a Recharts stacked/grouped bar chart format.
 */
export function crossTabToRecharts(crossTab: CrossTabConfig, usePercentage = true): ChartConfig {
  const data = crossTab.matrix.map(row => {
    const item: Record<string, any> = {
      name: row.rowLabel
    };
    crossTab.colLabels.forEach(cLabel => {
      item[cLabel] = usePercentage ? row.rowPercentages[cLabel] : row.counts[cLabel];
    });
    return item;
  });

  return {
    chartType: 'stacked_bar',
    xAxisKey: 'name',
    dataKeys: crossTab.colLabels,
    data
  };
}
