import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Info,
  Network,
  PieChart as PieIcon,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE_URL } from '../services/scanService';
import type { DashboardStatsData, ScanResult } from '../types/scan';
import { AnalysisCard } from './AnalysisCard';
import { RiskBadge } from './RiskBadge';
import { ThreatTopologyGraph } from './ThreatTopologyGraph';

interface DashboardStatsProps {
  stats: DashboardStatsData;
  recentScans: ScanResult[];
  onOpenResult: (result: ScanResult) => void;
  onGoToScanner: () => void;
}

export function DashboardStats({
  stats,
  recentScans,
  onOpenResult,
  onGoToScanner,
}: DashboardStatsProps) {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadIsError, setUploadIsError] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'chart'>('graph');

  const handleDatasetUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsTraining(true);
    setUploadStatus(null);
    setUploadIsError(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/model/train`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Training failed');
      setUploadStatus(
        `Retrained Random Forest on ${data.uploadedSamples} uploaded samples (${data.validationAccuracy}% validation accuracy).`
      );
    } catch (err) {
      setUploadIsError(true);
      setUploadStatus(
        err instanceof Error ? err.message : 'Unable to reach backend API.'
      );
    } finally {
      setIsTraining(false);
    }
  };

  const chartData = [
    { name: 'Safe', value: stats.safeCount, color: '#10b981' },
    { name: 'Suspicious', value: stats.suspiciousCount, color: '#f59e0b' },
    { name: 'Dangerous', value: stats.dangerousCount, color: '#f43f5e' },
  ].filter((d) => d.value > 0);

  // Real chronological time-series derived strictly from persisted scan history
  const timelineData = useMemo(() => {
    const ordered = [...recentScans].slice(0, 20).reverse();
    let safeAcc = 0;
    let threatAcc = 0;
    const points = [];
    for (let idx = 0; idx < ordered.length; idx++) {
      const scan = ordered[idx];
      if (scan.riskCategory === 'Safe') {
        safeAcc += 1;
      } else {
        threatAcc += 1;
      }
      let timeLabel = `#${idx + 1}`;
      try {
        timeLabel = new Date(scan.scannedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        // Fallback to index label
      }
      points.push({
        time: timeLabel,
        safe: safeAcc,
        threats: threatAcc,
        entropy: scan.telemetry?.domainEntropy ?? 0,
        score: scan.safetyScore,
      });
    }
    return points;
  }, [recentScans]);

  const statCards = [
    {
      label: 'Total Websites Scanned',
      value: stats.totalScanned,
      Icon: Activity,
      accent: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30 shadow-[0_0_12px_rgba(0,240,255,0.2)]',
    },
    {
      label: 'Safe Websites',
      value: stats.safeCount,
      Icon: ShieldCheck,
      accent: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]',
    },
    {
      label: 'Suspicious Websites',
      value: stats.suspiciousCount,
      Icon: AlertTriangle,
      accent: 'text-amber-400 bg-amber-500/15 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
    },
    {
      label: 'Dangerous Websites',
      value: stats.dangerousCount,
      Icon: ShieldAlert,
      accent: 'text-rose-400 bg-rose-500/15 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.2)]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-white tracking-tight">Security Intelligence Dashboard</h2>
          <p className="text-sm text-gray-400">
            Real-time C2 network topology, neural tree distributions, and telemetry history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Switcher Button */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900/90 border border-slate-800">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'graph'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Threat Topology Graph
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'chart'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              Advanced Visuals
            </button>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-cyan-500/15 text-[#00f0ff] border border-cyan-500/30 shadow-[0_0_10px_rgba(0,240,255,0.15)]">
            <Info className="w-3.5 h-3.5" />
            Live 200-Tree Forest
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, Icon, accent }) => (
          <div
            key={label}
            className="glass-card glass-card-hover rounded-2xl p-5 flex items-center justify-between border border-slate-800/80 hover:border-cyan-500/30 transition-all"
          >
            <div>
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <p className="text-3xl font-display font-bold text-white mt-1">{value}</p>
            </div>
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center ${accent}`}
            >
              <Icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Interactive Visual / Graph Area */}
      {viewMode === 'graph' ? (
        <div className="space-y-6">
          <ThreatTopologyGraph
            recentScans={recentScans}
            onSelectScan={onOpenResult}
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Timeline Stream Area Chart */}
            <AnalysisCard
              title="Threat Stream & Entropy Drift"
              subtitle="Temporal analysis of beaconing frequency & DGA complexity"
              className="lg:col-span-3"
              icon={<TrendingUp className="w-4 h-4 text-cyan-400" />}
            >
              <div className="h-64 w-full pt-2">
                {timelineData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                    No scan records yet — run a scan to populate real telemetry drift.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#00f0ff" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0a0f1d',
                          borderColor: 'rgba(255, 255, 255, 0.15)',
                          borderRadius: '0.75rem',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="safe"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#cyanGradient)"
                        name="Cumulative Safe Scans"
                      />
                      <Area
                        type="monotone"
                        dataKey="threats"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#roseGradient)"
                        name="Cumulative Flagged Scans"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 mt-2 font-mono px-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Safe Scans ({stats.safeCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500" /> Flagged Scans ({stats.suspiciousCount + stats.dangerousCount})
                </span>
              </div>
            </AnalysisCard>

            {/* Recent Scans */}
            <AnalysisCard
              title="Recent Scan History"
              subtitle="Click any entry to inspect its full report"
              className="lg:col-span-2"
            >
              <div className="space-y-2.5">
                {recentScans.slice(0, 4).map((scan) => (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => onOpenResult(scan)}
                    className="w-full text-left p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/40 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate group-hover:text-cyan-400 transition-colors">
                        {scan.url}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        Score: {scan.safetyScore}/100 •{' '}
                        {new Date(scan.scannedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <RiskBadge category={scan.riskCategory} size="sm" />
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onGoToScanner}
                className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.1)] hover:shadow-[0_0_15px_rgba(0,240,255,0.2)]"
              >
                + Scan a New Website
              </button>
            </AnalysisCard>
          </div>
        </div>
      ) : (
        /* Alternate Advanced Chart Mode */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <AnalysisCard
            title="Categorical Threat Distribution"
            subtitle="Breakdown of verified domain signatures"
            className="lg:col-span-2"
          >
            <div className="h-64 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={5}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0a0f1d',
                      borderColor: 'rgba(0, 240, 255, 0.3)',
                      borderRadius: '0.75rem',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold font-display text-white">{stats.totalScanned}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Total Verified</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-5 mt-2 text-xs text-slate-300 font-mono">
              {chartData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shadow-[0_0_6px_currentColor]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>
                    {item.name} ({item.value})
                  </span>
                </div>
              ))}
            </div>
          </AnalysisCard>

          <AnalysisCard
            title="Temporal Threat Stream"
            subtitle="Live entropy spikes and malicious beacon rates"
            className="lg:col-span-3"
          >
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cyanGradient2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#00f0ff" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0a0f1d',
                      borderColor: 'rgba(0, 240, 255, 0.3)',
                      borderRadius: '0.75rem',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="safe"
                    stroke="#00f0ff"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#cyanGradient2)"
                    name="Safe Traffic"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AnalysisCard>
        </div>
      )}

      {/* Dataset Upload (Hugging Face DRIFT / CSV / TXT) */}
      <AnalysisCard
        title="Train Random Forest with Custom Dataset (Hugging Face DRIFT / CSV / TXT)"
        subtitle="Upload a domain list (one DGA domain per line, or domain,label CSV) to retrain the 200-tree Random Forest model"
        icon={<Upload className="w-4 h-4 text-cyan-400" />}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleDatasetUpload}
            disabled={isTraining}
            className="text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-300 file:border file:border-cyan-500/40 hover:file:bg-cyan-500/30 cursor-pointer"
          />
          {isTraining && (
            <span className="text-xs text-cyan-300 font-mono animate-pulse">Retraining 200 Decision Trees in backend...</span>
          )}
          {uploadStatus && (
            <span
              className={`text-xs font-mono ${
                uploadIsError ? 'text-rose-400' : 'text-emerald-300'
              }`}
            >
              {uploadStatus}
            </span>
          )}
        </div>
      </AnalysisCard>
    </div>
  );
}
