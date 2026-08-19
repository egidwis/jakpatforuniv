import { describe, it, expect } from 'vitest';
import { parseCSV, detectColumnType, profileSurveyDataset } from './surveyDataProfiler';
import { calculateCrossTab, crossTabToRecharts } from './surveyCrossTab';

describe('surveyDataProfiler & CSV Parsing', () => {
  it('should correctly parse standard and quoted CSV text', () => {
    const csv = `Nama,Usia,"Komentar, Catatan"\nBudi,20,"Bagus, sangat puas"\nAni,22,"Cepat, ramah"`;
    const { headers, rows } = parseCSV(csv);

    expect(headers).toEqual(['Nama', 'Usia', 'Komentar, Catatan']);
    expect(rows.length).toBe(2);
    expect(rows[0]['Komentar, Catatan']).toBe('Bagus, sangat puas');
    expect(rows[1]['Usia']).toBe('22');
  });

  it('should accurately detect demographic, likert, and numeric column types', () => {
    expect(detectColumnType('Jenis Kelamin', ['Laki-laki', 'Perempuan'])).toBe('demographic');
    expect(detectColumnType('Fakultas / Jurusan', ['Teknik', 'Kedokteran'])).toBe('demographic');
    expect(detectColumnType('Kepuasan Layanan', ['Sangat Puas', 'Puas', 'Puas', 'Cukup Puas'])).toBe('likert');
    expect(detectColumnType('Skala 1-5', ['5', '4', '5', '3', '4'])).toBe('likert');
  });

  it('should compute descriptive frequencies and percentages accurately', () => {
    const headers = ['Gender', 'Skor'];
    const rows = [
      { Gender: 'Laki-laki', Skor: '4' },
      { Gender: 'Laki-laki', Skor: '5' },
      { Gender: 'Perempuan', Skor: '5' },
      { Gender: 'Perempuan', Skor: '5' }
    ];

    const summary = profileSurveyDataset('test.csv', headers, rows);
    expect(summary.totalRows).toBe(4);
    expect(summary.totalColumns).toBe(2);

    const genderCol = summary.columns.find(c => c.label === 'Gender')!;
    expect(genderCol.counts['Laki-laki']).toBe(2);
    expect(genderCol.counts['Perempuan']).toBe(2);
    expect(genderCol.percentages['Laki-laki']).toBe(50);
    expect(genderCol.percentages['Perempuan']).toBe(50);

    const skorCol = summary.columns.find(c => c.label === 'Skor')!;
    expect(skorCol.mean).toBe(4.75);
  });
});

describe('surveyCrossTab calculation', () => {
  it('should generate accurate 2-variable cross tabulation matrix', () => {
    const rows = [
      { Gender: 'Laki-laki', Puas: 'Ya' },
      { Gender: 'Laki-laki', Puas: 'Tidak' },
      { Gender: 'Perempuan', Puas: 'Ya' },
      { Gender: 'Perempuan', Puas: 'Ya' }
    ];

    const crossTab = calculateCrossTab(rows, 'Gender', 'Puas');
    expect(crossTab.rowVariable).toBe('Gender');
    expect(crossTab.colVariable).toBe('Puas');
    expect(crossTab.totalCount).toBe(4);

    const lRow = crossTab.matrix.find(r => r.rowLabel === 'Laki-laki')!;
    expect(lRow.counts['Ya']).toBe(1);
    expect(lRow.counts['Tidak']).toBe(1);
    expect(lRow.rowPercentages['Ya']).toBe(50);

    const pRow = crossTab.matrix.find(r => r.rowLabel === 'Perempuan')!;
    expect(pRow.counts['Ya']).toBe(2);
    expect(pRow.counts['Tidak']).toBe(0);
    expect(pRow.rowPercentages['Ya']).toBe(100);

    // Convert to recharts config
    const rechartsConfig = crossTabToRecharts(crossTab);
    expect(rechartsConfig.chartType).toBe('stacked_bar');
    expect(rechartsConfig.data.length).toBe(2);
  });
});
