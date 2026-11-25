import type { RiskCategory } from '../types/scan';

interface SecurityScoreProps {
  score: number;
  category: RiskCategory;
}

const COLOR_MAP: Record<RiskCategory, { stroke: string; text: string }> = {
  Safe: { stroke: '#10b981', text: 'text-emerald-400' },
  Suspicious: { stroke: '#f59e0b', text: 'text-amber-400' },
  Dangerous: { stroke: '#f43f5e', text: 'text-rose-400' },
};

export function SecurityScore({ score, category }: SecurityScoreProps) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const colors = COLOR_MAP[category];

  return (
    <div className="relative inline-flex items-center justify-center w-28 h-28">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 104 104">
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth="8"
        />
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tracking-tight ${colors.text}`}>
          {clamped}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          / 100
        </span>
      </div>
    </div>
  );
}
