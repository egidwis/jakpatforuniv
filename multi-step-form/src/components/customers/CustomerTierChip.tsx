import { type Customer, customerTier } from './types';
import { ClientStatusIcon } from './ClientStatusIcon';

/**
 * Status icon for customer tier (VVIP, VIP, Returning, New) with hover tooltips.
 */
export function CustomerTierChip({ customer }: { customer: Customer }) {
  const tier = customerTier(customer);
  return <ClientStatusIcon tier={tier} />;
}
