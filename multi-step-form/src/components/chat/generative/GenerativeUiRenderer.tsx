import React from 'react';
import { JsonRenderGenerativeUi, GENERATIVE_TYPE_ALIASES } from './jsonRenderCatalog';
import type { FormSubmission, AdScheduleEntry, GenerativeUiData } from '@/utils/supabase';

export type { GenerativeUiData };

interface GenerativeUiRendererProps {
  data?: GenerativeUiData;
  userOrders: Array<{ submission: FormSubmission; schedules: AdScheduleEntry[] }>;
}

const DATA_WIDGETS = new Set(['survey_picker', 'price_calculator', 'faq_list']);

export const GenerativeUiRenderer: React.FC<GenerativeUiRendererProps> = ({
  data,
  userOrders = []
}) => {
  if (!data) return null;

  if (data.type && DATA_WIDGETS.has(data.type) && !data.component && !data.root) {
    return (
      <JsonRenderGenerativeUi
        spec={null}
        fallbackType={data.type}
        fallbackProps={data.props}
        userOrders={userOrders}
      />
    );
  }

  const aliased =
    data.type && GENERATIVE_TYPE_ALIASES[data.type] && !data.component
      ? { component: GENERATIVE_TYPE_ALIASES[data.type], props: data.props || {}, children: data.children }
      : data;

  const spec = aliased.spec || ((aliased.root || aliased.component) ? aliased : null);

  return (
    <JsonRenderGenerativeUi
      spec={spec}
      fallbackType={data.type}
      fallbackProps={data.props}
      userOrders={userOrders}
    />
  );
};
