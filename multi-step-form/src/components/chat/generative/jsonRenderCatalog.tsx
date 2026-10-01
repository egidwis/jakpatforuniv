import React from 'react';
import { useNavigate } from 'react-router-dom';
import { defineCatalog } from '@json-render/core';
import { schema, defineRegistry, Renderer, JSONUIProvider } from '@json-render/react';
import { z } from 'zod';
import { ChevronRight, ArrowUpRight, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { SurveyPickerWidget } from './SurveyPickerWidget';
import { PriceCalculatorWidget } from './PriceCalculatorWidget';
import { FaqListWidget, type FaqListItem } from './FaqListWidget';
import {
  ChecklistWidget,
  ComparisonTableWidget,
  ContactCardWidget,
  KeyValueListWidget,
  LinkListWidget,
  ListItemWidget,
  BoxWidget,
  ComparisonCardWidget,
  OptionCardsWidget,
  PricingTiersWidget,
  StepListWidget,
  StepperWidget,
  TimelineWidget,
} from './ExtraCatalogWidgets';
import {
  JrAccordion,
  JrAlert,
  JrBadge,
  JrButton,
  JrGrid,
  JrHeading,
  JrProgress,
  JrSeparator,
  JrStack,
  JrTable,
  JrTabs,
  JrText,
} from './JsonRenderPrimitives';
import type { FormSubmission, AdScheduleEntry } from '@/utils/supabase';
import { openChatHref } from '@/utils/chatLinks';
import { resolveComponentType } from '@/utils/resolveComponentType';

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
    FaqList: {
      props: z.object({
        title: z.string().optional(),
        items: z.array(z.object({
          q: z.string(),
          a: z.string(),
        })),
        defaultOpenIndex: z.number().optional(),
      }),
    },
    QuickInfoCard: {
      props: z.object({
        title: z.string(),
        description: z.string(),
        badge: z.string().optional(),
      }),
    },
    StepList: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(z.object({
          title: z.string(),
          body: z.string().optional(),
        })),
      }),
    },
    OptionCards: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        options: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          badge: z.string().optional(),
          actionLabel: z.string().optional(),
          url: z.string().optional(),
        })),
      }),
    },
    ComparisonTable: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        columns: z.array(z.string()),
        rows: z.array(z.object({
          label: z.string(),
          values: z.array(z.string()),
        })),
      }),
    },
    Checklist: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        items: z.array(z.object({
          text: z.string(),
          ok: z.boolean().optional(),
        })),
      }),
    },
    ContactCard: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        email: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        actionLabel: z.string().optional(),
      }),
    },
    KeyValueList: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        items: z.array(z.object({
          label: z.string(),
          value: z.string(),
        })),
      }),
    },
    Timeline: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        items: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          state: z.enum(['done', 'current', 'upcoming']).optional(),
        })),
      }),
    },
    PricingTiers: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        tiers: z.array(z.object({
          range: z.string(),
          price: z.string(),
        })).optional(),
      }),
    },
    LinkList: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        links: z.array(z.object({
          label: z.string(),
          url: z.string(),
        })),
      }),
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).optional(),
        gap: z.enum(['sm', 'md', 'lg']).optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        justify: z.enum(['start', 'center', 'end', 'between']).optional(),
      }),
      description: 'Flex layout. Wrap other components as children.',
    },
    Grid: {
      props: z.object({
        columns: z.number().optional(),
        gap: z.enum(['sm', 'md', 'lg']).optional(),
      }),
      description: '1-4 column grid. Wrap other components as children.',
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(['h1', 'h2', 'h3', 'h4']).optional(),
      }),
    },
    Text: {
      props: z.object({
        text: z.string(),
        variant: z.enum(['body', 'muted', 'small']).optional(),
      }),
    },
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(['default', 'success', 'warning', 'danger', 'info']).optional(),
      }),
    },
    Alert: {
      props: z.object({
        title: z.string(),
        message: z.string().optional(),
        type: z.enum(['info', 'success', 'warning', 'error']).optional(),
      }),
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'outline', 'secondary']).optional(),
        href: z.string().optional(),
        url: z.string().optional(),
      }),
    },
    Accordion: {
      props: z.object({
        items: z.array(z.object({
          title: z.string(),
          content: z.string(),
        })),
        type: z.enum(['single', 'multiple']).optional(),
      }),
      description: 'Collapsible Q&A. Prefer FaqList when SOP has linked FAQs.',
    },
    Table: {
      props: z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        caption: z.string().optional(),
      }),
    },
    Tabs: {
      props: z.object({
        tabs: z.array(z.object({
          label: z.string(),
          content: z.string(),
        })),
        defaultValue: z.string().optional(),
      }),
    },
    Progress: {
      props: z.object({
        value: z.number(),
        max: z.number().optional(),
        label: z.string().optional(),
      }),
    },
    Separator: {
      props: z.object({
        orientation: z.enum(['horizontal', 'vertical']).optional(),
      }),
    },
    ListItem: {
      props: z.object({
        title: z.string().optional(),
        label: z.string().optional(),
        text: z.string().optional(),
        description: z.string().optional(),
        body: z.string().optional(),
        content: z.string().optional(),
        badge: z.string().optional(),
      }),
    },
    ComparisonCard: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        badge: z.string().optional(),
        features: z.array(z.string()).optional(),
      }),
    },
    Stepper: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(z.object({
          title: z.string().optional(),
          body: z.string().optional(),
          label: z.string().optional(),
          description: z.string().optional(),
        })).optional(),
      }),
    },
    Box: {
      props: z.object({
        title: z.string().optional(),
        label: z.string().optional(),
        text: z.string().optional(),
        description: z.string().optional(),
      }),
    },
  },
  actions: {},
});

export const GENERATIVE_TYPE_ALIASES: Record<string, string> = {
  survey_picker: 'SurveyPicker',
  price_calculator: 'PriceCalculator',
  faq_list: 'FaqList',
  step_list: 'StepList',
  option_cards: 'OptionCards',
  comparison_table: 'ComparisonTable',
  checklist: 'Checklist',
  contact_card: 'ContactCard',
  key_value_list: 'KeyValueList',
  timeline: 'Timeline',
  pricing_tiers: 'PricingTiers',
  link_list: 'LinkList',
  comparison_card: 'ComparisonCard',
  stepper: 'Stepper',
  list_item: 'ListItem',
};

/**
 * Normalizes any JSON input (flat or nested tree) into @json-render's Spec format
 */
export function normalizeToSpec(input: any): any {
  if (!input || typeof input !== 'object') return null;

  // Already flat Spec format { root: string, elements: Record<string, UIElement> }
  if (input.root && input.elements && typeof input.elements === 'object') {
    const elements: Record<string, any> = {};
    for (const [key, el] of Object.entries(input.elements as Record<string, any>)) {
      if (!el || typeof el !== 'object') continue;
      elements[key] = {
        ...el,
        type: resolveComponentType(el.type),
      };
    }
    return { root: input.root, elements };
  }

  // Nested tree format { type/component, props, children: [...] }
  const elements: Record<string, any> = {};
  let counter = 0;

  function walk(node: any): string {
    const key = node.key || `el_${++counter}`;
    const type = resolveComponentType(node.type || node.component);
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
          onClick={() => openChatHref(props.url, navigate)}
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

      FaqList: ({ props }) => (
        <FaqListWidget
          title={props.title}
          items={(props.items || []) as FaqListItem[]}
          defaultOpenIndex={props.defaultOpenIndex}
        />
      ),

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

      StepList: ({ props }) => <StepListWidget {...props} />,
      OptionCards: ({ props }) => <OptionCardsWidget {...props} />,
      ComparisonTable: ({ props }) => <ComparisonTableWidget {...props} />,
      Checklist: ({ props }) => <ChecklistWidget {...props} />,
      ContactCard: ({ props }) => <ContactCardWidget {...props} />,
      KeyValueList: ({ props }) => <KeyValueListWidget {...props} />,
      Timeline: ({ props }) => <TimelineWidget {...props} />,
      PricingTiers: ({ props }) => <PricingTiersWidget {...props} />,
      LinkList: ({ props }) => <LinkListWidget {...props} />,
      Stack: ({ props, children }) => <JrStack {...props}>{children}</JrStack>,
      Grid: ({ props, children }) => <JrGrid {...props}>{children}</JrGrid>,
      Heading: ({ props }) => <JrHeading {...props} />,
      Text: ({ props }) => <JrText {...props} />,
      Badge: ({ props }) => <JrBadge {...props} />,
      Alert: ({ props }) => <JrAlert {...props} />,
      Button: ({ props }) => <JrButton {...props} />,
      Accordion: ({ props }) => <JrAccordion {...props} />,
      Table: ({ props }) => <JrTable {...props} />,
      Tabs: ({ props }) => <JrTabs {...props} />,
      Progress: ({ props }) => <JrProgress {...props} />,
      Separator: ({ props }) => <JrSeparator {...props} />,
      ListItem: ({ props, children }) => <ListItemWidget {...props}>{children}</ListItemWidget>,
      ComparisonCard: ({ props, children }) => <ComparisonCardWidget {...props}>{children}</ComparisonCardWidget>,
      Stepper: ({ props, children }) => <StepperWidget {...props}>{children}</StepperWidget>,
      Box: ({ props, children }) => <BoxWidget {...props}>{children}</BoxWidget>,
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
        ) : fallbackType === 'faq_list' ? (
          <FaqListWidget
            title={fallbackProps.title}
            items={fallbackProps.items || []}
            defaultOpenIndex={fallbackProps.defaultOpenIndex}
          />
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

  if (fallbackType === 'faq_list') {
    return (
      <FaqListWidget
        title={fallbackProps.title}
        items={fallbackProps.items || []}
        defaultOpenIndex={fallbackProps.defaultOpenIndex}
      />
    );
  }

  if (fallbackType === 'step_list') return <StepListWidget {...fallbackProps} />;
  if (fallbackType === 'option_cards') return <OptionCardsWidget {...fallbackProps} />;
  if (fallbackType === 'comparison_table') return <ComparisonTableWidget {...fallbackProps} />;
  if (fallbackType === 'checklist') return <ChecklistWidget {...fallbackProps} />;
  if (fallbackType === 'contact_card') return <ContactCardWidget {...fallbackProps} />;
  if (fallbackType === 'key_value_list') return <KeyValueListWidget {...fallbackProps} />;
  if (fallbackType === 'timeline') return <TimelineWidget {...fallbackProps} />;
  if (fallbackType === 'pricing_tiers') return <PricingTiersWidget {...fallbackProps} />;
  if (fallbackType === 'link_list') return <LinkListWidget {...fallbackProps} />;

  return null;
};
