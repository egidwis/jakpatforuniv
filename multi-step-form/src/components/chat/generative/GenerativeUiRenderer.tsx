import React from 'react';
import { JsonRenderGenerativeUi } from './jsonRenderCatalog';
import type { FormSubmission, AdScheduleEntry, GenerativeUiData } from '@/utils/supabase';

export type { GenerativeUiData };

interface GenerativeUiRendererProps {
  data?: GenerativeUiData;
  userOrders: Array<{ submission: FormSubmission; schedules: AdScheduleEntry[] }>;
}

export const GenerativeUiRenderer: React.FC<GenerativeUiRendererProps> = ({
  data,
  userOrders = []
}) => {
  if (!data) return null;

  // Support both explicit spec property and top-level spec objects
  const spec = data.spec || ((data.root || data.component || (data.type && data.type !== 'survey_picker' && data.type !== 'price_calculator')) ? data : null);

  return (
    <JsonRenderGenerativeUi
      spec={spec}
      fallbackType={data.type}
      fallbackProps={data.props}
      userOrders={userOrders}
    />
  );
};
