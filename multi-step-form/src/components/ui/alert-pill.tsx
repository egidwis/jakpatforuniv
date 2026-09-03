import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pil pekerjaan-menunggu. Yang punya `onClick` juga jadi sakelar filter — angka
 * yang tidak bisa diklik hanya membuat admin bertanya "yang mana?" tanpa jawaban.
 *
 * Diangkat apa adanya dari ScheduleBoardPage saat halaman Pages memerlukan bentuk
 * yang sama untuk "banner default" dan "disembunyikan". Nol perubahan perilaku;
 * kalau bentuknya berubah, ia harus berubah di kedua papan sekaligus.
 */
export function AlertPill({
  icon: Icon, count, label, tone, active, onClick, title,
}: {
  icon: LucideIcon;
  count: number;
  label: string;
  tone: 'red' | 'amber' | 'slate';
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const toneClass = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];

  const content = (
    <>
      <Icon className="w-3.5 h-3.5" /> <strong>{count}</strong> {label}
    </>
  );

  if (!onClick) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5', toneClass)}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors',
        active ? 'border-slate-800 bg-slate-800 text-white' : cn(toneClass, 'hover:border-gray-400')
      )}
    >
      {content}
    </button>
  );
}
