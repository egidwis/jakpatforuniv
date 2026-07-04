import { Badge } from '../ui/badge';
import { Chip } from '../ui/chip';
import { type Customer, customerTier } from './types';

/**
 * Tier chip for a customer row/detail. VVIP keeps the flashy gradient
 * Badge (deliberate brand touch); the rest use the standard Chip.
 */
export function CustomerTierChip({ customer }: { customer: Customer }) {
  const tier = customerTier(customer);
  if (tier === 'vvip') {
    return (
      <Badge className="bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white border-none font-extrabold rounded-full px-2.5 py-0.5 shadow-lg shadow-fuchsia-500/30 tracking-wide" variant="default">
        ✦ VVIP
      </Badge>
    );
  }
  if (tier === 'vip') return <Chip variant="amber" size="sm">VIP</Chip>;
  if (tier === 'returning') return <Chip variant="blue" size="sm">Returning</Chip>;
  return <Chip variant="slate" size="sm">New</Chip>;
}
