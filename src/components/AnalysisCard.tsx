import type { ReactNode } from 'react';

interface AnalysisCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AnalysisCard({
  title,
  subtitle,
  icon,
  children,
  className = '',
}: AnalysisCardProps) {
  return (
    <div className={`glass-card rounded-md p-5 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            {icon}
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
