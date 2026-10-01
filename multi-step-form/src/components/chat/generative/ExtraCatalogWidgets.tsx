import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  X,
  Mail,
  ListOrdered,
  Columns3,
  CircleDot,
  Wallet,
  Link2,
} from 'lucide-react';
import { openChatHref } from '@/utils/chatLinks';
import { calculateAdCostPerDay } from '@/utils/cost-calculator';

export function WidgetShell({
  title,
  description,
  badge,
  icon,
  children,
}: {
  title?: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 p-3.5 sm:p-4 bg-gradient-to-br from-slate-50/95 to-indigo-50/30 border border-indigo-100 rounded-2xl shadow-xs space-y-3 w-full max-w-full overflow-hidden box-border">
      {(title || badge) && (
        <div className="flex items-center justify-between gap-2 border-b border-indigo-100/60 pb-2.5">
          <div className="min-w-0 flex items-start gap-2">
            {icon}
            <div className="min-w-0">
              {title && <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">{title}</h4>}
              {description && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{description}</p>}
            </div>
          </div>
          {badge && (
            <span className="text-[10px] font-semibold bg-indigo-100/80 text-indigo-700 px-2.5 py-0.5 rounded-full shrink-0">
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function StepListWidget({
  title,
  description,
  steps = [],
}: {
  title?: string;
  description?: string;
  steps?: Array<{ title: string; body?: string }>;
}) {
  return (
    <WidgetShell title={title || 'Langkahnya'} description={description} icon={<ListOrdered className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}>
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white mt-0.5">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 leading-snug">{step.title}</p>
              {step.body && <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{step.body}</p>}
            </div>
          </li>
        ))}
      </ol>
    </WidgetShell>
  );
}

export function OptionCardsWidget({
  title,
  description,
  options = [],
}: {
  title?: string;
  description?: string;
  options?: Array<{ title: string; description?: string; badge?: string; actionLabel?: string; url?: string }>;
}) {
  const navigate = useNavigate();
  return (
    <WidgetShell title={title || 'Pilihan'} description={description}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt, i) => (
          <div key={i} className="p-3 bg-white border border-slate-200/80 rounded-xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-slate-800 leading-snug">{opt.title}</p>
              {opt.badge && (
                <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
                  {opt.badge}
                </span>
              )}
            </div>
            {opt.description && <p className="text-[11px] text-slate-600 leading-relaxed">{opt.description}</p>}
            {opt.actionLabel && opt.url && (
              <button
                type="button"
                onClick={() => openChatHref(opt.url!, navigate)}
                className="w-full py-1.5 px-2 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
              >
                {opt.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}

export function ComparisonTableWidget({
  title,
  description,
  columns = [],
  rows = [],
}: {
  title?: string;
  description?: string;
  columns?: string[];
  rows?: Array<{ label: string; values: string[] }>;
}) {
  return (
    <WidgetShell title={title || 'Perbandingan'} description={description} icon={<Columns3 className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] min-w-[280px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1.5 pr-2 font-semibold"> </th>
              {columns.map((col) => (
                <th key={col} className="py-1.5 px-1.5 font-bold text-slate-700">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-semibold text-slate-700 whitespace-nowrap">{row.label}</td>
                {(row.values || []).map((val, i) => (
                  <td key={i} className="py-1.5 px-1.5 text-slate-600">{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetShell>
  );
}

export function ChecklistWidget({
  title,
  description,
  items = [],
}: {
  title?: string;
  description?: string;
  items?: Array<{ text: string; ok?: boolean }>;
}) {
  return (
    <WidgetShell title={title || 'Checklist'} description={description}>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const ok = item.ok !== false;
          return (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              </span>
              <span className="leading-snug">{item.text}</span>
            </li>
          );
        })}
      </ul>
    </WidgetShell>
  );
}

export function ContactCardWidget({
  title,
  description,
  email,
  subject,
  body,
  actionLabel,
}: {
  title?: string;
  description?: string;
  email?: string;
  subject?: string;
  body?: string;
  actionLabel?: string;
}) {
  const navigate = useNavigate();
  const address = (email || 'product@jakpat.net').trim();
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString();
  const href = `mailto:${address}${qs ? `?${qs}` : ''}`;

  return (
    <WidgetShell title={title || 'Hubungi tim'} description={description} icon={<Mail className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}>
      <p className="text-xs text-slate-600">{address}</p>
      <button
        type="button"
        onClick={() => openChatHref(href, navigate)}
        className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
      >
        {actionLabel || `Email ${address}`}
      </button>
    </WidgetShell>
  );
}

export function KeyValueListWidget({
  title,
  description,
  items = [],
}: {
  title?: string;
  description?: string;
  items?: Array<{ label: string; value: string }>;
}) {
  return (
    <WidgetShell title={title} description={description}>
      <dl className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-3 text-xs">
            <dt className="text-slate-500 shrink-0">{item.label}</dt>
            <dd className="text-slate-800 font-semibold text-right">{item.value}</dd>
          </div>
        ))}
      </dl>
    </WidgetShell>
  );
}

export function TimelineWidget({
  title,
  description,
  items = [],
}: {
  title?: string;
  description?: string;
  items?: Array<{ title: string; description?: string; state?: 'done' | 'current' | 'upcoming' }>;
}) {
  return (
    <WidgetShell title={title || 'Alur'} description={description} icon={<CircleDot className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}>
      <ol className="space-y-3 relative">
        {items.map((item, i) => {
          const state = item.state || (i === 0 ? 'current' : 'upcoming');
          const dot =
            state === 'done' ? 'bg-emerald-500' : state === 'current' ? 'bg-indigo-600' : 'bg-slate-300';
          return (
            <li key={i} className="flex gap-2.5">
              <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
              <div>
                <p className="text-xs font-bold text-slate-800">{item.title}</p>
                {item.description && <p className="text-[11px] text-slate-600 leading-relaxed">{item.description}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </WidgetShell>
  );
}

const DEFAULT_PRICE_TIERS = [
  { range: '1–15 pertanyaan', questions: 15 },
  { range: '16–30 pertanyaan', questions: 30 },
  { range: '31–50 pertanyaan', questions: 50 },
  { range: '51–70 pertanyaan', questions: 70 },
  { range: '>70 pertanyaan', questions: 71 },
];

export function PricingTiersWidget({
  title,
  description,
  tiers,
}: {
  title?: string;
  description?: string;
  tiers?: Array<{ range: string; price: string }>;
}) {
  const rows = tiers?.length
    ? tiers
    : DEFAULT_PRICE_TIERS.map((t) => ({
        range: t.range,
        price: `Rp ${calculateAdCostPerDay(t.questions).toLocaleString('id-ID')} / hari`,
      }));

  return (
    <WidgetShell
      title={title || 'Tarif iklan harian'}
      description={description || 'Sebelum PPN 11%. Setiap baris Likert dihitung 1 pertanyaan.'}
      badge="Reguler"
      icon={<Wallet className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}
    >
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.range} className="flex justify-between gap-3 text-xs bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-600">{row.range}</span>
            <span className="font-bold text-slate-800">{row.price}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function LinkListWidget({
  title,
  description,
  links = [],
}: {
  title?: string;
  description?: string;
  links?: Array<{ label: string; url: string }>;
}) {
  const navigate = useNavigate();
  return (
    <WidgetShell title={title || 'Tautan'} description={description} icon={<Link2 className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}>
      <div className="flex flex-col gap-1.5">
        {links.map((link) => (
          <button
            key={link.url + link.label}
            type="button"
            onClick={() => openChatHref(link.url, navigate)}
            className="text-left text-xs font-semibold text-indigo-700 hover:text-indigo-900 px-2.5 py-2 rounded-lg bg-white border border-slate-100 cursor-pointer"
          >
            {link.label}
          </button>
        ))}
      </div>
    </WidgetShell>
  );
}

export function ListItemWidget({
  title,
  label,
  text,
  description,
  body,
  content,
  badge,
  children,
}: {
  title?: string;
  label?: string;
  text?: string;
  description?: string;
  body?: string;
  content?: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  const heading = title || label || text;
  const detail = description || body || content;
  return (
    <div className="flex items-start gap-2 p-2.5 bg-white border border-slate-200/80 rounded-xl">
      <div className="min-w-0 flex-1">
        {heading && (
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-800 leading-snug">{heading}</p>
            {badge && (
              <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
                {badge}
              </span>
            )}
          </div>
        )}
        {detail && <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{detail}</p>}
        {children}
      </div>
    </div>
  );
}

export function ComparisonCardWidget({
  title,
  description,
  badge,
  features,
  children,
}: {
  title?: string;
  description?: string;
  badge?: string;
  features?: string[];
  children?: React.ReactNode;
}) {
  return (
    <WidgetShell title={title} description={description} badge={badge}>
      {features && features.length > 0 && (
        <ul className="space-y-1 text-[11px] text-slate-600">
          {features.map((f) => (
            <li key={f} className="flex gap-1.5">
              <Check className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}
      {children}
    </WidgetShell>
  );
}

export function StepperWidget({
  title,
  description,
  steps,
  children,
}: {
  title?: string;
  description?: string;
  steps?: Array<{ title?: string; body?: string; label?: string; description?: string }>;
  children?: React.ReactNode;
}) {
  const normalized = (steps || [])
    .map((s) => ({ title: s.title || s.label || '', body: s.body || s.description }))
    .filter((s) => s.title);

  if (normalized.length > 0 && !children) {
    return <StepListWidget title={title} description={description} steps={normalized} />;
  }

  const childArray = React.Children.toArray(children);
  return (
    <WidgetShell title={title || 'Langkah'} description={description} icon={<ListOrdered className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />}>
      <ol className="space-y-2">
        {childArray.map((child, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white mt-0.5">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">{child}</div>
          </li>
        ))}
      </ol>
    </WidgetShell>
  );
}

export function BoxWidget({
  title,
  text,
  description,
  label,
  children,
}: {
  title?: string;
  text?: string;
  description?: string;
  label?: string;
  children?: React.ReactNode;
}) {
  const heading = title || label;
  const body = description || text;
  return (
    <div className="w-full min-w-0 space-y-1.5">
      {heading && <p className="text-xs font-bold text-slate-800">{heading}</p>}
      {body && <p className="text-[11px] text-slate-600 leading-relaxed">{body}</p>}
      {children}
    </div>
  );
}
