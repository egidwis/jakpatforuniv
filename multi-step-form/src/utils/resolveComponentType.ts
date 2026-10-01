/** Nama yang sering dikarang model → komponen yang benar-benar ada di katalog. */
export const COMPONENT_TYPE_ALIASES: Record<string, string> = {
  ComparisonCard: 'ComparisonCard',
  comparison_card: 'ComparisonCard',
  Comparison: 'ComparisonTable',
  Compare: 'ComparisonTable',
  CompareCard: 'ComparisonCard',
  Stepper: 'Stepper',
  stepper: 'Stepper',
  Steps: 'Stepper',
  StepList: 'StepList',
  Step: 'ListItem',
  ListItem: 'ListItem',
  list_item: 'ListItem',
  Item: 'ListItem',
  Bullet: 'ListItem',
  BulletItem: 'ListItem',
  List: 'Stack',
};

export const CATALOG_COMPONENT_TYPES = new Set([
  'Card', 'SurveyItem', 'Metric', 'AlertCallout', 'ActionButton',
  'SurveyPicker', 'PriceCalculator', 'FaqList', 'QuickInfoCard',
  'StepList', 'OptionCards', 'ComparisonTable', 'Checklist', 'ContactCard',
  'KeyValueList', 'Timeline', 'PricingTiers', 'LinkList',
  'Stack', 'Grid', 'Heading', 'Text', 'Badge', 'Alert', 'Button',
  'Accordion', 'Table', 'Tabs', 'Progress', 'Separator',
  'ComparisonCard', 'Stepper', 'ListItem', 'Box',
]);

const FALLBACK_TYPE = 'Box';

export function resolveComponentType(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return FALLBACK_TYPE;
  const name = raw.trim();
  if (CATALOG_COMPONENT_TYPES.has(name)) return name;
  const aliased = COMPONENT_TYPE_ALIASES[name] || COMPONENT_TYPE_ALIASES[name.replace(/[\s-]/g, '')];
  if (aliased && CATALOG_COMPONENT_TYPES.has(aliased)) return aliased;

  const lower = name.toLowerCase().replace(/_/g, '');
  for (const known of CATALOG_COMPONENT_TYPES) {
    if (known.toLowerCase() === lower) return known;
  }
  if (COMPONENT_TYPE_ALIASES[name]) return COMPONENT_TYPE_ALIASES[name];
  return FALLBACK_TYPE;
}
