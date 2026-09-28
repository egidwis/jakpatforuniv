import React from 'react';
import { useNavigate } from 'react-router-dom';
import { defineCatalog } from '@json-render/core';
import { schema, defineRegistry, Renderer, JSONUIProvider } from '@json-render/react';
import { z } from 'zod';
import { ChevronRight, ArrowUpRight, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { SurveyPickerWidget } from './SurveyPickerWidget';
import { PriceCalculatorWidget } from './PriceCalculatorWidget';
import type { FormSubmission, AdScheduleEntry } from '@/utils/supabase';

// 1. Define Catalog with Zod schema (json-render standard)
export const miminCatalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z.string(),
        description: z.string().optional(),
        badge: z.string().optional(),
      }),
    },
    SurveyItem: {
      props: z.object({
        title: z.string(),
        badge: z.string().optional(),
        badgeVariant: z.enum(['default', 'warning', 'success', 'danger', 'info']).optional(),
        description: z.string().optional(),
        schedule: z.string().optional(),
        actionLabel: z.string().optional(),
        actionUrl: z.string().optional(),
      }),
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        subtext: z.string().optional(),
      }),
    },
    AlertCallout: {
      props: z.object({
        message: z.string(),
        variant: z.enum(['info', 'warning', 'success']).optional(),
      }),
    },
    ActionButton: {
      props: z.object({
        label: z.string(),
        url: z.string(),
        variant: z.enum(['primary', 'secondary', 'outline']).optional(),
      }),
    },
    SurveyPicker: {
      props: z.object({
        actionLabel: z.string().optional(),
        defaultAction: z.enum(['extend_schedule', 'view_order']).optional(),
      }),
    },
    PriceCalculator: {
      props: z.object({
        defaultRespondents: z.number().optional(),
        defaultDurationDays: z.number().optional(),
      }),
    },
    QuickInfoCard: {
      props: z.object({
        title: z.string(),
        description: z.string(),
        badge: z.string().optional(),
      }),
    },
  },
  actions: {},
});

export type MiminCatalog = typeof miminCatalog;

/**
 * Normalizes any JSON input (flat or nested tree) into @json-render's Spec format
 */
export function normalizeToSpec(input: any): any {
  if (!input || typeof input !== 'object') return null;

  // Already flat Spec format { root: string, elements: Record<string, UIElement> }
  if (input.root && input.elements && typeof input.elements === 'object') {
    return input;
  }

  // Nested tree format { type/component, props, children: [...] }
  const elements: Record<string, any> = {};
  let counter = 0;

  function walk(node: any): string {
    const key = node.key || `el_${++counter}`;
    const type = node.type || node.component || 'Card';
    const props = node.props || {};
    const childKeys: string[] = [];

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') {
          const cKey = walk(child);
          childKeys.push(cKey);
        }
      }
    }

    elements[key] = {
      type,
      props,
      children: childKeys.length > 0 ? childKeys : undefined,
    };

    return key;
  }

  const rootKey = walk(input);
  return {
    root: rootKey,
    elements,
  };
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GenerativeUiErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.warn('[@json-render] Error in generative UI rendering:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

interface JsonRenderGenerativeUiProps {
  spec?: any;
  userOrders?: Array<{ submission: FormSubmission; schedules: AdScheduleEntry[] }>;
  fallbackType?: 'survey_picker' | 'price_calculator' | string;
  fallbackProps?: Record<string, any>;
}

// 2. Component Renderer using @json-render
export const JsonRenderGenerativeUi: React.FC<JsonRenderGenerativeUiProps> = ({
  spec,
  userOrders = [],
  fallbackType,
  fallbackProps = {},
}) => {
  const navigate = useNavigate();

  // Registry komponen dengan implementasi React UI yang estetik & interaktif
  const { registry } = defineRegistry(miminCatalog, {
    components: {
      Card: ({ props, children }) => (
        <div className="mt-3 p-3.5 sm:p-4 bg-gradient-to-br from-slate-50/95 to-indigo-50/30 border border-indigo-100 rounded-2xl shadow-xs space-y-3 w-full max-w-full overflow-hidden box-border">
          <div className="flex items-center justify-between gap-2 border-b border-indigo-100/60 pb-2.5">
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight truncate">{props.title}</h4>
              {props.description && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{props.description}</p>
              )}
            </div>
            {props.badge && (
              <span className="text-[10px] font-semibold bg-indigo-100/80 text-indigo-700 px-2.5 py-0.5 rounded-full shrink-0">
                {props.badge}
              </span>
            )}
          </div>
          <div className="space-y-2 w-full min-w-0">
            {children}
          </div>
        </div>
      ),

      SurveyItem: ({ props }) => {
        const getBadgeStyle = () => {
          switch (props.badgeVariant) {
            case 'warning':
              return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'success':
              return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'danger':
              return 'bg-rose-100 text-rose-800 border-rose-200';
            case 'info':
              return 'bg-sky-100 text-sky-800 border-sky-200';
            default:
              return 'bg-slate-100 text-slate-700 border-slate-200';
          }
        };

        return (
          <div className="p-3 bg-white border border-slate-200/80 hover:border-indigo-300 rounded-xl shadow-xs transition-all space-y-2 w-full min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h5 className="text-xs font-bold text-slate-900 leading-tight truncate flex-1">
                {props.title}
              </h5>
              {props.badge && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${getBadgeStyle()}`}>
                  {props.badge}
                </span>
              )}
            </div>
            {props.description && (
              <p className="text-xs text-slate-600 leading-relaxed">{props.description}</p>
            )}
            {props.schedule && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <span>📅 {props.schedule}</span>
              </div>
            )}
            {props.actionLabel && (
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => navigate(props.actionUrl || '/dashboard')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  <span>{props.actionLabel}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      },

      Metric: ({ props }) => (
        <div className="p-3 bg-white border border-slate-200/80 rounded-xl shadow-xs text-center">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">{props.label}</span>
          <span className="text-base font-extrabold text-slate-800 block mt-0.5">{props.value}</span>
          {props.subtext && <span className="text-[10px] text-slate-500 block mt-0.5">{props.subtext}</span>}
        </div>
      ),

      AlertCallout: ({ props }) => {
        const isWarn = props.variant === 'warning';
        const isSuccess = props.variant === 'success';
        return (
          <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            isWarn
              ? 'bg-amber-50/80 border-amber-200 text-amber-800'
              : isSuccess
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
              : 'bg-indigo-50/80 border-indigo-200 text-indigo-800'
          }`}>
            {isWarn ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : isSuccess ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <p className="flex-1 leading-relaxed">{props.message}</p>
          </div>
        );
      },

      ActionButton: ({ props }) => (
        <button
          type="button"
          onClick={() => {
            if (props.url.startsWith('http')) {
              window.open(props.url, '_blank');
            } else {
              navigate(props.url);
            }
          }}
          className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
            props.variant === 'secondary'
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              : props.variant === 'outline'
              ? 'border border-slate-200 hover:bg-slate-50 text-slate-700'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
          }`}
        >
          <span>{props.label}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      ),

      SurveyPicker: ({ props }) => (
        <SurveyPickerWidget
          orders={userOrders}
          actionLabel={props.actionLabel || '➕ Tambah Jadwal untuk Survei Terpilih'}
          defaultAction={props.defaultAction || 'extend_schedule'}
        />
      ),

      PriceCalculator: () => <PriceCalculatorWidget />,

      QuickInfoCard: ({ props }) => (
        <div className="mt-3 p-3.5 bg-white border border-indigo-100 rounded-2xl shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800">{props.title}</h4>
            {props.badge && (
              <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                {props.badge}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{props.description}</p>
        </div>
      ),
    },
    actions: {},
  });

  // 1. Cek apakah ada spec yang diberikan
  const activeSpec = spec ? normalizeToSpec(spec) : null;
  if (activeSpec && activeSpec.root && activeSpec.elements) {
    return (
      <GenerativeUiErrorBoundary fallback={
        fallbackType === 'survey_picker' ? (
          <SurveyPickerWidget
            orders={userOrders}
            actionLabel={fallbackProps.action_label || '➕ Tambah Jadwal untuk Survei Terpilih'}
            defaultAction={fallbackProps.action || 'extend_schedule'}
          />
        ) : fallbackType === 'price_calculator' ? (
          <PriceCalculatorWidget />
        ) : null
      }>
        <JSONUIProvider registry={registry} navigate={navigate}>
          <Renderer spec={activeSpec as any} registry={registry} />
        </JSONUIProvider>
      </GenerativeUiErrorBoundary>
    );
  }

  // 2. Fallback direct component rendering
  if (fallbackType === 'survey_picker') {
    return (
      <SurveyPickerWidget
        orders={userOrders}
        actionLabel={fallbackProps.action_label || '➕ Tambah Jadwal untuk Survei Terpilih'}
        defaultAction={fallbackProps.action || 'extend_schedule'}
      />
    );
  }

  if (fallbackType === 'price_calculator') {
    return <PriceCalculatorWidget />;
  }

  return null;
};
