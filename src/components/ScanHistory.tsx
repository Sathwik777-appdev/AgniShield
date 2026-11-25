import { ArrowUpRight, Clock, History } from 'lucide-react';
import type { ScanResult } from '../types/scan';
import { RiskBadge } from './RiskBadge';

interface ScanHistoryProps {
  items: ScanResult[];
  onOpenResult: (result: ScanResult) => void;
}

export function ScanHistory({ items, onOpenResult }: ScanHistoryProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2.5">
          <History className="w-6 h-6 text-[#00f0ff]" />
          Scan History
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Previously scanned URLs (includes demo entries and your current
          session scans).
        </p>
      </div>

      {items.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-slate-400 text-sm">
          No scans recorded yet. Run a URL scan to see results here.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800/80">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenResult(item)}
                className="w-full text-left px-5 py-4 hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {item.url}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(item.scannedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-slate-200">
                    {item.safetyScore}
                    <span className="text-xs text-slate-500 font-normal">
                      /100
                    </span>
                  </span>
                  <RiskBadge category={item.riskCategory} size="sm" />
                  <ArrowUpRight className="w-4 h-4 text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
