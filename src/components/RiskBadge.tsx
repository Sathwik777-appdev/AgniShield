import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { RiskCategory } from '../types/scan';

interface RiskBadgeProps {
  category: RiskCategory;
  size?: 'sm' | 'md';
}

const STYLES: Record<
  RiskCategory,
  { bg: string; text: string; border: string; Icon: typeof ShieldCheck }
> = {
  Safe: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    Icon: ShieldCheck,
  },
  Suspicious: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    Icon: AlertTriangle,
  },
  Dangerous: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    Icon: ShieldAlert,
  },
};

export function RiskBadge({ category, size = 'md' }: RiskBadgeProps) {
  const { bg, text, border, Icon } = STYLES[category];
  const sizeClasses =
    size === 'sm' ? 'px-2.5 py-0.5 text-xs gap-1' : 'px-3 py-1 text-sm gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${bg} ${text} ${border} ${sizeClasses}`}
    >
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {category}
    </span>
  );
}
