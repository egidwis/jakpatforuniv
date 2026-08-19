import React, { useState } from 'react';
import type { CanvasBlock, ChartConfig, CrossTabConfig } from './types';
import { toBlob } from 'html-to-image';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import {
  Copy,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  BarChart2,
  FileText,
  Table as TableIcon,
  Sparkles,
  Layers,
  Camera,
  Loader2,
  Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';

interface AnalyzerCanvasProps {
  blocks: CanvasBlock[];
  onRemoveBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onUpdateBlockNarrative: (id: string, newNarrative: string) => void;
}

const PALETTE = [
  '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#3b82f6', '#14b8a6', '#f97316', '#6366f1'
];

export const AnalyzerCanvas: React.FC<AnalyzerCanvasProps> = ({
  blocks,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlockNarrative
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedImageId, setCopiedImageId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedId(id);
        toast.success('Narasi teks disalin ke clipboard');
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => toast.error('Gagal menyalin teks'));
  };

  const handleCopyImage = async (blockId: string) => {
    const el = document.getElementById(`block-card-${blockId}`);
    if (!el) {
      toast.error('Elemen grafik tidak ditemukan');
      return;
    }

    setCopyingImageId(blockId);
    try {
      // Render clean white-background high-res blob
      const blob = await toBlob(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        filter: (domNode: HTMLElement) => {
          // Exclude action buttons from snapshot
          if (domNode.classList && domNode.classList.contains('no-export-snapshot')) {
            return false;
          }
          return true;
        }
      });

      if (!blob) throw new Error('Gagal menghasilkan gambar');

      // Copy PNG blob to system clipboard
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopiedImageId(blockId);
        toast.success('Gambar grafik berhasil disalin! Silakan paste (Ctrl+V / Cmd+V) di Word atau Docs.', {
          duration: 3500
        });
        setTimeout(() => setCopiedImageId(null), 2500);
      } else {
        // Fallback: download as PNG if clipboard image write not supported
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grafik-${blockId}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Gambar berhasil didownload sebagai PNG.');
      }
    } catch (err: any) {
      console.error('Error copying image:', err);
      toast.error('Gagal menyalin gambar ke clipboard.');
    } finally {
      setCopyingImageId(null);
    }
  };

  const renderChart = (config: ChartConfig) => {
    const { chartType, data, xAxisKey, dataKeys } = config;

    if (!data || data.length === 0) {
      return <p className="text-xs text-gray-400 py-4 text-center">Data grafik tidak tersedia.</p>;
    }

    if (chartType === 'donut' || chartType === 'pie') {
      return (
        <div className="w-full min-w-0 h-[280px]">
          <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <PieChart>
              <Tooltip
                formatter={(val: any, name: any) => [`${val} responden`, name]}
                contentStyle={{ borderRadius: '0.75rem', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={chartType === 'donut' ? 60 : 0}
                outerRadius={85}
                paddingAngle={chartType === 'donut' ? 4 : 0}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chartType === 'horizontal_bar') {
      return (
        <div className="w-full min-w-0 h-[280px]">
          <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" fontSize={11} stroke="#94a3b8" />
              <YAxis dataKey={xAxisKey} type="category" width={100} fontSize={11} stroke="#64748b" />
              <Tooltip
                contentStyle={{ borderRadius: '0.75rem', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey={dataKeys[0] || 'value'} fill="#4f46e5" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Default Vertical Bar / Stacked Bar
    return (
      <div className="w-full min-w-0 h-[280px]">
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <BarChart data={data} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey={xAxisKey} fontSize={11} stroke="#64748b" tickLine={false} />
            <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: '0.75rem', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            />
            {dataKeys.length > 1 && (
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
            )}
            {dataKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                stackId={chartType === 'stacked_bar' ? 'a' : undefined}
                fill={PALETTE[idx % PALETTE.length]}
                radius={chartType === 'stacked_bar' ? [0, 0, 0, 0] : [6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderCrossTab = (config: CrossTabConfig) => {
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-700">
            <tr>
              <th className="px-3.5 py-2.5 font-semibold">{config.rowVariable} \ {config.colVariable}</th>
              {config.colLabels.map(col => (
                <th key={col} className="px-3 py-2.5 font-semibold text-center">{col}</th>
              ))}
              <th className="px-3 py-2.5 font-bold text-center bg-gray-100/70">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {config.matrix.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50">
                <td className="px-3.5 py-2.5 font-medium text-gray-900">{row.rowLabel}</td>
                {config.colLabels.map(col => (
                  <td key={col} className="px-3 py-2.5 text-center text-gray-700">
                    <span className="font-semibold">{row.counts[col] || 0}</span>
                    <span className="text-[10px] text-gray-400 block">({row.rowPercentages[col] || 0}%)</span>
                  </td>
                ))}
                <td className="px-3 py-2.5 font-bold text-center bg-gray-50/80 text-gray-900">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (blocks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200 min-h-[400px]">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3 shadow-sm">
          <Sparkles className="w-6 h-6" />
        </div>
        <h4 className="text-base font-bold text-gray-800 mb-1">Canvas Analisis Masih Kosong</h4>
        <p className="text-xs text-gray-500 max-w-sm">
          Pilih salah satu saran prompt di sidebar kanan atau ketik pertanyaanmu ke AI untuk mulai memunculkan grafik dan narasi di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          id={`block-card-${block.id}`}
          className="group relative bg-white rounded-2xl border border-gray-200/90 p-5 md:p-6 shadow-xs hover:shadow-md transition-all"
        >
          {/* Header Block Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                {block.type === 'chart' && <BarChart2 className="w-4 h-4" />}
                {block.type === 'crosstab' && <TableIcon className="w-4 h-4" />}
                {block.type === 'narrative' && <FileText className="w-4 h-4" />}
                {block.type === 'metric' && <Layers className="w-4 h-4" />}
              </div>
              <h3 className="font-bold text-sm text-gray-900 truncate">{block.title}</h3>
            </div>

            {/* Block action buttons */}
            <div className="no-export-snapshot flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
              {/* Copy Image Button */}
              <button
                type="button"
                onClick={() => handleCopyImage(block.id)}
                disabled={copyingImageId === block.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 transition-all shadow-2xs active:scale-95"
                title="Copy Tabel/Grafik ini sebagai Gambar (PNG) ke Clipboard"
              >
                {copyingImageId === block.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : copiedImageId === block.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>{copiedImageId === block.id ? 'Gambar Tersalin!' : 'Copy Gambar'}</span>
              </button>

              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveBlock(block.id, 'up')}
                title="Pindah ke Atas"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={index === blocks.length - 1}
                onClick={() => onMoveBlock(block.id, 'down')}
                title="Pindah ke Bawah"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onRemoveBlock(block.id)}
                title="Hapus Widget Ini"
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Metric Block */}
          {block.type === 'metric' && block.metricConfig && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {block.metricConfig.map((m, mIdx) => (
                <div key={mIdx} className="p-3.5 rounded-xl bg-gray-50 border border-gray-100/80">
                  <p className="text-[11px] font-medium text-gray-500">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 font-mono">{m.value}</p>
                  {m.subtext && <p className="text-[10px] text-gray-400 mt-0.5">{m.subtext}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Chart Block */}
          {block.type === 'chart' && block.chartConfig && (
            <div className="my-2">
              {renderChart(block.chartConfig)}
            </div>
          )}

          {/* Cross Tabulation Block */}
          {block.type === 'crosstab' && block.crossTabConfig && (
            <div className="my-2">
              {renderCrossTab(block.crossTabConfig)}
            </div>
          )}

          {/* Narrative / Bab 4 Description */}
          {block.narrative && (
            <div className="mt-3.5 pt-3.5 border-t border-gray-100 bg-indigo-50/30 -mx-5 -mb-5 md:-mx-6 md:-mb-6 p-4 rounded-b-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Narasi Hasil Analisis (Siap Copy)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText(block.id, block.narrative || '')}
                  className="no-export-snapshot text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded border border-indigo-200/60 shadow-2xs"
                >
                  {copiedId === block.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedId === block.id ? 'Tersalin' : 'Copy Teks Narasi'}
                </button>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed prose prose-xs max-w-none">
                <ReactMarkdown>{block.narrative}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
