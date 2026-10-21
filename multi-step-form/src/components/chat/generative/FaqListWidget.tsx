import React from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export interface FaqListItem {
  q: string;
  a: string;
}

interface FaqListWidgetProps {
  title?: string;
  items: FaqListItem[];
  defaultOpenIndex?: number;
}

export const FaqListWidget: React.FC<FaqListWidgetProps> = ({
  title = 'Pertanyaan yang sering ditanyakan',
  items,
  defaultOpenIndex = 0,
}) => {
  if (!items.length) return null;

  const safeIndex = Math.min(Math.max(defaultOpenIndex, 0), items.length - 1);
  const defaultValue = `faq-${safeIndex}`;

  return (
    <div className="mt-3 p-3.5 sm:p-4 bg-gradient-to-br from-slate-50/95 to-blue-50/30 border border-blue-100 rounded-2xl shadow-xs w-full max-w-full overflow-hidden">
      <div className="flex items-center gap-2 border-b border-blue-100/60 pb-2.5 mb-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-jfu-primary text-white shrink-0">
          <HelpCircle className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">{title}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Ketuk pertanyaan untuk melihat jawaban resmi dari FAQ JFU.
          </p>
        </div>
        <span className="ml-auto text-[10px] font-semibold bg-blue-100/80 text-jfu-dark px-2.5 py-0.5 rounded-full shrink-0">
          {items.length} FAQ
        </span>
      </div>
      <Accordion type="single" collapsible defaultValue={defaultValue} className="w-full space-y-1.5">
        {items.map((item, i) => (
          <AccordionItem
            key={`${i}-${item.q}`}
            value={`faq-${i}`}
            className="border border-slate-200/80 rounded-xl px-3 py-0 bg-white data-[state=open]:border-blue-200 data-[state=open]:shadow-2xs"
          >
            <AccordionTrigger className="text-left py-2.5 text-xs font-semibold text-slate-800 hover:text-jfu-dark hover:no-underline leading-snug">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-slate-600 text-xs pb-3 leading-relaxed border-t border-slate-100 pt-2">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};
