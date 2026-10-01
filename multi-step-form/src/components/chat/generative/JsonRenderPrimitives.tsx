import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { openChatHref } from '@/utils/chatLinks';

const gapClass: Record<string, string> = {
  sm: 'gap-1.5',
  md: 'gap-2.5',
  lg: 'gap-4',
};

export function JrStack({
  direction = 'vertical',
  gap = 'md',
  align,
  justify,
  children,
}: {
  direction?: 'vertical' | 'horizontal';
  gap?: 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  children?: React.ReactNode;
}) {
  const alignClass =
    align === 'center' ? 'items-center' : align === 'end' ? 'items-end' : align === 'stretch' ? 'items-stretch' : 'items-start';
  const justifyClass =
    justify === 'center' ? 'justify-center' : justify === 'end' ? 'justify-end' : justify === 'between' ? 'justify-between' : 'justify-start';
  return (
    <div
      className={`flex w-full min-w-0 ${direction === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col'} ${gapClass[gap] || gapClass.md} ${alignClass} ${justifyClass}`}
    >
      {children}
    </div>
  );
}

export function JrGrid({
  columns = 2,
  gap = 'md',
  children,
}: {
  columns?: number;
  gap?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}) {
  const cols = Math.min(Math.max(columns || 2, 1), 4);
  const colClass = cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : cols === 4 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2';
  return <div className={`grid w-full min-w-0 ${colClass} ${gapClass[gap] || gapClass.md}`}>{children}</div>;
}

export function JrHeading({ text, level = 'h3' }: { text: string; level?: 'h1' | 'h2' | 'h3' | 'h4' }) {
  const cls =
    level === 'h1' ? 'text-base font-bold' : level === 'h2' ? 'text-sm font-bold' : 'text-xs font-bold';
  return <p className={`${cls} text-slate-800 leading-snug`}>{text}</p>;
}

export function JrText({ text, variant = 'body' }: { text: string; variant?: 'body' | 'muted' | 'small' }) {
  const cls = variant === 'muted' ? 'text-slate-500' : variant === 'small' ? 'text-[11px] text-slate-600' : 'text-xs text-slate-700';
  return <p className={`${cls} leading-relaxed`}>{text}</p>;
}

export function JrBadge({ text, variant = 'default' }: { text: string; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const cls =
    variant === 'success' ? 'bg-emerald-100 text-emerald-800' :
    variant === 'warning' ? 'bg-amber-100 text-amber-800' :
    variant === 'danger' ? 'bg-rose-100 text-rose-800' :
    variant === 'info' ? 'bg-sky-100 text-sky-800' :
    'bg-slate-100 text-slate-700';
  return <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{text}</span>;
}

export function JrAlert({
  title,
  message,
  type = 'info',
}: {
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}) {
  const cls =
    type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
    type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
    type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
    'bg-indigo-50 border-indigo-200 text-indigo-800';
  return (
    <div className={`p-3 rounded-xl border text-xs ${cls}`}>
      <p className="font-bold">{title}</p>
      {message && <p className="mt-0.5 leading-relaxed opacity-90">{message}</p>}
    </div>
  );
}

export function JrButton({
  label,
  variant = 'primary',
  href,
  url,
}: {
  label: string;
  variant?: 'primary' | 'outline' | 'secondary';
  href?: string;
  url?: string;
}) {
  const navigate = useNavigate();
  const target = href || url;
  const cls =
    variant === 'outline' ? 'border border-slate-200 text-slate-700 hover:bg-slate-50' :
    variant === 'secondary' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' :
    'bg-indigo-600 text-white hover:bg-indigo-700';
  return (
    <button
      type="button"
      onClick={() => target && openChatHref(target, navigate)}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${cls}`}
    >
      {label}
    </button>
  );
}

export function JrAccordion({
  items = [],
  type = 'single',
}: {
  items?: Array<{ title: string; content: string }>;
  type?: 'single' | 'multiple';
}) {
  if (!items.length) return null;
  if (type === 'multiple') {
    return (
      <Accordion type="multiple" className="w-full space-y-1.5">
        {items.map((item, i) => (
          <AccordionItem key={i} value={`jr-${i}`} className="border border-slate-200/80 rounded-xl px-3 bg-white">
            <AccordionTrigger className="text-left py-2.5 text-xs font-semibold hover:no-underline">
              {item.title}
            </AccordionTrigger>
            <AccordionContent className="text-xs text-slate-600 pb-3 leading-relaxed">{item.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  }
  return (
    <Accordion type="single" collapsible className="w-full space-y-1.5">
      {items.map((item, i) => (
        <AccordionItem key={i} value={`jr-${i}`} className="border border-slate-200/80 rounded-xl px-3 bg-white">
          <AccordionTrigger className="text-left py-2.5 text-xs font-semibold hover:no-underline">
            {item.title}
          </AccordionTrigger>
          <AccordionContent className="text-xs text-slate-600 pb-3 leading-relaxed">{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function JrTable({
  columns = [],
  rows = [],
  caption,
}: {
  columns?: string[];
  rows?: string[][];
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto w-full">
      {caption && <p className="text-[11px] font-semibold text-slate-600 mb-1">{caption}</p>}
      <table className="w-full text-[11px] min-w-[240px]">
        <thead>
          <tr className="text-left text-slate-500">
            {columns.map((col) => (
              <th key={col} className="py-1.5 pr-2 font-bold text-slate-700">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-2 text-slate-600">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JrTabs({
  tabs = [],
  defaultValue,
}: {
  tabs?: Array<{ label: string; content: string }>;
  defaultValue?: string;
}) {
  const [active, setActive] = React.useState(defaultValue || tabs[0]?.label || '');
  const current = tabs.find((t) => t.label === active) || tabs[0];
  if (!tabs.length) return null;
  return (
    <div className="w-full">
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(tab.label)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap cursor-pointer ${
              active === tab.label ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current && <p className="text-xs text-slate-700 leading-relaxed px-1">{current.content}</p>}
    </div>
  );
}

export function JrProgress({ value = 0, max = 100, label }: { value?: number; max?: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 100)) * 100));
  return (
    <div className="w-full">
      {label && <p className="text-[11px] font-semibold text-slate-600 mb-1">{label}</p>}
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function JrSeparator({ orientation = 'horizontal' }: { orientation?: 'horizontal' | 'vertical' }) {
  if (orientation === 'vertical') return <div className="w-px self-stretch bg-slate-200" />;
  return <div className="h-px w-full bg-slate-200 my-1" />;
}
