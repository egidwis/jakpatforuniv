export type ColumnDataType = 'categorical' | 'likert' | 'numeric' | 'text' | 'demographic';

export interface ColumnSummary {
  key: string;
  label: string;
  type: ColumnDataType;
  distinctCount: number;
  missingCount: number;
  counts: Record<string, number>;
  percentages: Record<string, number>;
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  sampleValues: string[];
}

export interface DatasetSummary {
  fileName: string;
  totalRows: number;
  totalColumns: number;
  columns: ColumnSummary[];
  detectedDemographics: string[];
  detectedLikertColumns: string[];
}

export type BlockType = 'narrative' | 'chart' | 'crosstab' | 'metric';

export type ChartType = 'bar' | 'horizontal_bar' | 'donut' | 'pie' | 'stacked_bar' | 'line';

export interface ChartConfig {
  chartType: ChartType;
  xAxisKey: string;
  dataKeys: string[];
  data: Record<string, any>[];
  colors?: string[];
}

export interface CrossTabMatrixRow {
  rowLabel: string;
  counts: Record<string, number>;
  rowPercentages: Record<string, number>;
  total: number;
}

export interface CrossTabConfig {
  rowVariable: string;
  colVariable: string;
  colLabels: string[];
  matrix: CrossTabMatrixRow[];
  totalCount: number;
}

export interface MetricItem {
  label: string;
  value: string | number;
  subtext?: string;
  badge?: string;
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  title: string;
  narrative?: string;
  chartConfig?: ChartConfig;
  crossTabConfig?: CrossTabConfig;
  metricConfig?: MetricItem[];
  createdAt: string;
}

export interface AnalyzerChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  appliedActions?: string[];
}

export interface AnalysisProject {
  id: string;
  user_id: string;
  title: string;
  description: string;
  source_type: 'csv_upload' | 'custom_form' | 'google_form';
  source_id?: string | null;
  dataset_summary: DatasetSummary;
  raw_data_sample?: Record<string, any>[];
  canvas_blocks: CanvasBlock[];
  chat_history: AnalyzerChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface AnalyzerAiAction {
  action: 'add_block' | 'update_block' | 'remove_block' | 'replace_all_blocks';
  blockId?: string;
  block?: Omit<CanvasBlock, 'id' | 'createdAt'> & { id?: string };
  reasoning?: string;
}
