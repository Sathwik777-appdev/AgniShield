import {
  AlertOctagon,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Wrench,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { ScanResult } from '../types/scan';

interface IssueItem {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  component: string;
  finding: string;
  impact: string;
}

interface RemediationItem {
  priority: 'P0' | 'P1' | 'P2';
  action: string;
  guidance: string;
}

interface AiAnalysisResponse {
  engine: string;
  executiveSummary: string;
  score: number;
  category: string;
  verdict: string;
  mitreAttack?: string;
  issues: IssueItem[];
  remediations: RemediationItem[];
  llmGenerated?: boolean;
}

interface AiAnalystCardProps {
  scan: ScanResult;
}

const SEVERITY_BADGE = {
  CRITICAL: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  HIGH: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  MEDIUM: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  LOW: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

const PRIORITY_BADGE = {
  P0: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  P1: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  P2: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
};

export const AiAnalystCard: React.FC<AiAnalystCardProps> = ({ scan }) => {
  const [data, setData] = useState<AiAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch('/api/v1/analyze/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scan),
    })
      .then((res) => res.json())
      .then((result: AiAnalysisResponse) => {
        if (isMounted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('AI Analysis fetch error:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [scan]);

  return (
    <div className="glass rounded-3xl p-6 sm:p-7 border border-white/10 shadow-xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-slate-200" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-display font-bold text-white tracking-tight">
              AI Threat Intelligence &amp; Root-Cause Analysis
            </h3>
            <p className="text-xs font-mono text-slate-400">
              {data?.engine || 'Synthesizing neural features & telemetry...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            Automated Assessment
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white bg-white/5 border border-white/10 cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-cyan-300">
          <Loader2 className="w-7 h-7 animate-spin text-[#00f0ff]" />
          <span className="text-xs font-mono">Running LLM forensic correlation over 10-feature vector...</span>
        </div>
      )}

      {!loading && data && expanded && (
        <div className="space-y-6 pt-5">
          {/* Executive Summary */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-sm text-gray-200 leading-relaxed font-sans">
            <span className="text-slate-400 font-semibold font-mono text-xs uppercase tracking-wider block mb-1">
              Diagnostic Summary
            </span>
            {data.executiveSummary}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Identified Issues & Risks */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span>Identified Architectural &amp; Behavioral Issues ({data.issues?.length || 0})</span>
              </div>

              <div className="space-y-2.5">
                {data.issues?.map((issue, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06] hover:border-white/15 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-white">{issue.component}</span>
                      <span
                        className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded border uppercase ${
                          SEVERITY_BADGE[issue.severity] || SEVERITY_BADGE.LOW
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 font-mono mb-1">{issue.finding}</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{issue.impact}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Remediation Guidance */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                <Wrench className="w-4 h-4 text-[#00ff88]" />
                <span>Recommended Engineering Fixes ({data.remediations?.length || 0})</span>
              </div>

              <div className="space-y-2.5">
                {data.remediations && data.remediations.length > 0 ? (
                  data.remediations.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          {item.action}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded border uppercase ${
                            PRIORITY_BADGE[item.priority] || PRIORITY_BADGE.P2
                          }`}
                        >
                          {item.priority}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 leading-relaxed font-sans">{item.guidance}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-400">
                    No remediation required — all checked telemetry parameters are within safe baseline thresholds.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
