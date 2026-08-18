import React from 'react';
import { Crown, Star, User, UserCheck, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export type ClientTier = 'vvip' | 'vip' | 'returning' | 'new' | 'unpaid';

interface ClientStatusIconProps {
  tier?: ClientTier;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const TIER_CONFIG: Record<ClientTier, {
  label: string;
  icon: React.ElementType;
  containerClass: string;
  iconClass: string;
  dotClass: string;
}> = {
  vvip: {
    label: 'Client VVIP',
    icon: Crown,
    containerClass: 'bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-pink-500 text-white shadow-sm shadow-fuchsia-500/30 ring-1 ring-fuchsia-300/40',
    iconClass: 'fill-white/30',
    dotClass: 'bg-purple-500 ring-1 ring-purple-300/40',
  },
  vip: {
    label: 'Client VIP',
    icon: Star,
    containerClass: 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-white shadow-sm shadow-amber-500/30 ring-1 ring-amber-300/40',
    iconClass: 'fill-white/30',
    dotClass: 'bg-amber-500 ring-1 ring-amber-300/40',
  },
  returning: {
    label: 'Client Returning',
    icon: UserCheck,
    containerClass: 'bg-blue-500 text-white shadow-sm shadow-blue-500/20 ring-1 ring-blue-300/40',
    iconClass: '',
    dotClass: 'bg-blue-500 ring-1 ring-blue-300/40',
  },
  new: {
    label: 'Client Baru (Sudah Paid)',
    icon: UserPlus,
    containerClass: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 ring-1 ring-emerald-300/40',
    iconClass: '',
    dotClass: 'bg-emerald-500 ring-1 ring-emerald-300/40',
  },
  unpaid: {
    label: 'Belum Paid (Rp 0)',
    icon: User,
    containerClass: 'bg-slate-400 text-white shadow-sm shadow-slate-400/20 ring-1 ring-slate-300/40',
    iconClass: '',
    dotClass: 'bg-slate-400 ring-1 ring-slate-300/40',
  },
};

export function ClientStatusDot({ tier, className }: { tier?: ClientTier; className?: string }) {
  if (!tier || !TIER_CONFIG[tier]) return null;
  const config = TIER_CONFIG[tier];

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'w-2 h-2 rounded-full inline-block shrink-0 cursor-help transition-transform hover:scale-125',
              config.dotClass,
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px] py-1 px-2">
          <p>{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ClientStatusIcon({ tier, className, size = 'md' }: ClientStatusIconProps) {
  if (!tier || !TIER_CONFIG[tier]) return null;

  const config = TIER_CONFIG[tier];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-6 h-6 text-xs',
    lg: 'w-7 h-7 text-sm',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }[size];

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              'inline-flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95 cursor-help shrink-0 select-none',
              config.containerClass,
              sizeClasses,
              className
            )}
            title={config.label}
            aria-label={config.label}
          >
            <Icon className={cn(iconSizes, config.iconClass)} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-semibold px-2.5 py-1 bg-slate-900 text-white border-slate-800 shadow-xl">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
