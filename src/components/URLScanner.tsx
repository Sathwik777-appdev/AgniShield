import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  FileText,
  Globe,
  Layers,
  Loader2,
  Lock,
  LockOpen,
  Radio,
  Search,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { validateUrl, type TelemetryPreset } from '../services/scanService';
import type { CheckStatus, ScanResult } from '../types/scan';
import { generateAuditPdfReport } from '../utils/pdfGenerator';
import { AiAnalystCard } from './AiAnalystCard';
import { AnalysisCard } from './AnalysisCard';
import { RiskBadge } from './RiskBadge';
import {
  ScanBlueprintAnimation,
  getTargetDataCenter,
  type GlobeTelemetry,
} from './ScanBlueprintAnimation';
import { SecurityScore } from './SecurityScore';

interface URLScannerProps {
  onScan: (url: string, preset?: TelemetryPreset) => Promise<ScanResult>;
  selectedResult: ScanResult | null;
  isScanning: boolean;
}

const CHECK_ICON: Record<CheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertCircle,
  fail: XCircle,
};

const CHECK_COLOR: Record<CheckStatus, string> = {
  pass: 'text-[#00ff88]',
  warn: 'text-amber-400',
  fail: 'text-rose-400',
};

export function URLScanner({
  onScan,
  selectedResult,
  isScanning,
}: URLScannerProps) {
  const [inputUrl, setInputUrl] = useState(selectedResult?.url ?? '');
  useEffect(() => {
    if (selectedResult?.url) {
      setInputUrl(selectedResult.url);
    }
  }, [selectedResult?.url]);
  const [preset, setPreset] = useState<TelemetryPreset>('auto');
  const [error, setError] = useState<string | null>(null);
  const initialDc = getTargetDataCenter(selectedResult?.url ?? '');
  const [globeTelemetry, setGlobeTelemetry] = useState<GlobeTelemetry>({
    city: initialDc.city,
    asn: initialDc.asn,
    lat: initialDc.latStr,
    lon: initialDc.lonStr,
    alt: '418.4 km',
    doppler: '-14.2 kHz',
    packets: 1420,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateUrl(inputUrl);
    if (!validation.valid) {
      setError(validation.error || 'Please enter a valid URL.');
      return;
    }

    try {
      await onScan(inputUrl, preset);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to complete scan.'
      );
    }
  };

  const quickExamples = [
    'https://github.com',
    'https://superdesign.dev',
    'https://secure-login-verify.example.com',
    'http://bit.ly/free-bank-claim',
  ];

  return (
    <div className="space-y-6">
      {/* ── Top Bar: Compact Translucent Input Bar ── */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 via-purple-500/15 to-emerald-500/20 rounded-3xl blur-xl opacity-35 group-hover:opacity-90 transition duration-700 pointer-events-none" />
        
        <div className="relative rounded-3xl p-5 sm:p-6 bg-[#050505]/35 backdrop-blur-md border border-white/[0.08] shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                URL Security &amp; C2 Scanner
              </h1>
            </div>

            <span className="self-start sm:self-auto inline-flex items-center gap-2 text-xs font-mono font-medium px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300">
              <Shield className="w-3.5 h-3.5 text-[#00f0ff]" />
              200-Tree RF Engine Active
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 flex items-center px-4 py-3 rounded-2xl bg-black/30 border border-white/12 focus-within:border-[#00f0ff] focus-within:shadow-[0_0_20px_rgba(0,240,255,0.2)] transition-all">
              <Search className="w-4 h-4 text-gray-400 mr-3 shrink-0" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="https://enter-website-url.com/scan"
                className="w-full bg-transparent text-white placeholder-gray-500 border-none focus:outline-none text-sm sm:text-base"
                disabled={isScanning}
              />
            </div>
            <button
              type="submit"
              disabled={isScanning}
              className="px-6 py-3 rounded-xl font-semibold text-sm text-neutral-950 bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-sm"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-950" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <span>Analyze URL</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {error && (
            <p className="mt-2.5 text-sm text-rose-400 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-400 font-mono pt-3 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-gray-500 mr-1">Quick tests:</span>
              {quickExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setInputUrl(example);
                    setError(null);
                  }}
                  className="px-2.5 py-1 rounded-lg text-gray-300 hover:text-[#00f0ff] hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {example.replace('https://', '').replace('http://', '')}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="telemetry-preset" className="text-gray-500">
                Flow Profile:
              </label>
              <select
                id="telemetry-preset"
                value={preset}
                onChange={(e) => setPreset(e.target.value as TelemetryPreset)}
                className="px-2.5 py-1 rounded-lg bg-[#050505]/80 border border-white/15 text-gray-200 focus:outline-none focus:border-[#00f0ff] text-xs"
              >
                <option value="auto">Auto (URL Heuristics)</option>
                <option value="normal">Normal HTTPS Traffic</option>
                <option value="c2_beaconing">C2 Beaconing (Flow + DNS)</option>
                <option value="dns_tunneling">DNS Tunneling / DGA</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Scanning: Open Borderless Orbital Stage ── */}
      {isScanning && (
        <div className="relative rounded-3xl bg-[#050505]/20 backdrop-blur-sm border border-white/[0.06]">
          {/* Top Minimal Telemetry Ribbon */}
          <div className="px-6 py-3.5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00f0ff] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00f0ff]"></span>
              </span>
              <span className="text-gray-400">
                TARGET:{' '}
                <span className="text-white font-semibold font-sans">
                  {inputUrl ? inputUrl.replace(/^https?:\/\//i, '').split('/')[0] : 'Scanning...'}
                </span>
              </span>
              <span className="hidden sm:inline text-white/20">•</span>
              <span className="hidden sm:inline text-cyan-300">
                {globeTelemetry.city} ({globeTelemetry.asn})
              </span>
            </div>

            <div className="flex items-center gap-4 text-gray-400">
              <span className="flex items-center gap-1.5 text-cyan-300 whitespace-nowrap">
                <Radio className="w-3.5 h-3.5 text-[#00f0ff] animate-pulse" />
                {globeTelemetry.packets} PKTS
              </span>
              <span className="text-white/20">•</span>
              <span className="text-purple-300 flex items-center gap-1.5 whitespace-nowrap">
                <Cpu className="w-3.5 h-3.5 text-[#9d00ff]" />
                ALT {globeTelemetry.alt}
              </span>
            </div>
          </div>

          {/* Open 3-Column Panoramic Stage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-6 py-2 items-center">
            {/* Left Floating Stream */}
            <div className="lg:col-span-3 space-y-3 py-4">
              <div className="flex items-center gap-2 text-[11px] font-mono font-semibold text-gray-400 uppercase tracking-widest pb-2 border-b border-white/[0.06]">
                <Globe className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>Orbital Telemetry</span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">Target Coord</span>
                  <span className="text-white whitespace-nowrap">
                    {globeTelemetry.lat}, {globeTelemetry.lon}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">DNS Lookup</span>
                  <span className="text-[#00f0ff] whitespace-nowrap">Querying A-Record</span>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">TLS Chain</span>
                  <span className="text-[#00ff88] whitespace-nowrap">X.509 Handshake</span>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">Shannon Entropy</span>
                  <span className="text-cyan-200 whitespace-nowrap">3.24 bits</span>
                </div>

                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-gray-400 whitespace-nowrap">Doppler Shift</span>
                  <span className="text-purple-300 whitespace-nowrap">{globeTelemetry.doppler}</span>
                </div>
              </div>
            </div>

            {/* Center: Seamless Frameless Photorealistic 3D Globe */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center relative">
              <ScanBlueprintAnimation
                targetUrl={inputUrl}
                onTelemetryUpdate={setGlobeTelemetry}
              />

              <div className="w-full max-w-sm pb-4 space-y-2 text-center">
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#00f0ff] via-[#9d00ff] to-[#00ff88] animate-scan-progress" />
                </div>
                <p className="text-[11px] font-mono text-gray-400">
                  Drag globe to orbit • Extracting 10-feature vector...
                </p>
              </div>
            </div>

            {/* Right Floating Stream */}
            <div className="lg:col-span-3 space-y-3 py-4">
              <div className="flex items-center gap-2 text-[11px] font-mono font-semibold text-gray-400 uppercase tracking-widest pb-2 border-b border-white/[0.06]">
                <Cpu className="w-3.5 h-3.5 text-[#9d00ff]" />
                <span>200-Tree Ensemble</span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">Lexical (1-70)</span>
                  <span className="text-[#00ff88] whitespace-nowrap">Active</span>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">Flow (71-140)</span>
                  <span className="text-[#00f0ff] whitespace-nowrap">Evaluating</span>
                </div>

                <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.04]">
                  <span className="text-gray-400 whitespace-nowrap">DGA (141-200)</span>
                  <span className="text-purple-300 whitespace-nowrap">Aggregating</span>
                </div>
              </div>

              <div className="pt-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-300 font-display font-medium">
                  <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
                  <span>MITRE ATT&amp;CK Matrix</span>
                </div>
                <div className="text-[11px] font-mono text-gray-400 space-y-1">
                  <div className="text-purple-300 truncate">TA0011: Command &amp; Control</div>
                  <div className="text-[#00f0ff] truncate">T1568.002: DGA Detection</div>
                  <div className="text-[#00ff88] truncate">T1071.004: DNS Protocol</div>
                </div>
              </div>
            </div>
          </div>

          {/* Minimal Vector Pipeline Strip */}
          <div className="px-6 py-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-gray-400">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[#00ff88] inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                DNS Handshake
              </span>
              <ArrowRight className="w-3 h-3 text-white/25" />
              <span className="text-[#00f0ff] inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                TLS Verification
              </span>
              <ArrowRight className="w-3 h-3 text-white/25" />
              <span className="text-purple-300 inline-flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Feature Extraction
              </span>
              <ArrowRight className="w-3 h-3 text-white/25" />
              <span className="text-cyan-300 inline-flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Ensemble Voting
              </span>
            </div>

            <span className="text-[#00f0ff] whitespace-nowrap">60 FPS WebGL Telemetry</span>
          </div>
        </div>
      )}

      {/* ── Results View: Premium Glassmorphism Presentation ── */}
      {!isScanning && selectedResult && (
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="glass rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-white/10 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
              <SecurityScore
                score={selectedResult.safetyScore}
                category={selectedResult.riskCategory}
              />
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <RiskBadge category={selectedResult.riskCategory} />
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-medium px-3 py-1 rounded-full border bg-purple-500/15 text-purple-300 border-purple-500/30">
                    C2: {selectedResult.c2Verdict}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-mono font-medium px-3 py-1 rounded-full border ${
                      selectedResult.httpsEnabled
                        ? 'bg-emerald-500/10 text-[#00ff88] border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {selectedResult.httpsEnabled ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <LockOpen className="w-3.5 h-3.5" />
                    )}
                    {selectedResult.httpsEnabled ? 'HTTPS Valid' : 'No HTTPS'}
                  </span>
                </div>

                <p className="text-xl sm:text-2xl font-display font-bold text-white break-all">
                  {selectedResult.normalizedUrl}
                </p>

                <p className="text-xs text-gray-400 flex items-center justify-center sm:justify-start gap-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  Scanned at {new Date(selectedResult.scannedAt).toLocaleString()}
                </p>

                {selectedResult.mitreAttack && (
                  <p className="text-xs font-mono text-[#00f0ff]">
                    MITRE ATT&amp;CK: {selectedResult.mitreAttack}
                  </p>
                )}
              </div>
            </div>

            {/* 1-Click Export Actions */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => generateAuditPdfReport(selectedResult)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white hover:bg-neutral-200 text-neutral-950 flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <FileText className="w-4 h-4 text-neutral-950" />
                Download PDF Audit
              </button>
              <button
                type="button"
                onClick={() => {
                  const csv = `domain,risk_category,safety_score,c2_verdict,mitre_attack,scanned_at\n"${selectedResult.domainInfo.domain}","${selectedResult.riskCategory}",${selectedResult.safetyScore},"${selectedResult.c2Verdict}","${selectedResult.mitreAttack ?? ''}","${selectedResult.scannedAt}"\n`;
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `agnishield-ioc-${selectedResult.domainInfo.domain}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-200 border border-white/15 flex items-center gap-2 cursor-pointer transition-all"
              >
                <Download className="w-4 h-4 text-gray-300" />
                Export IOC (CSV)
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `0.0.0.0 ${selectedResult.domainInfo.domain} # AgniShield ${selectedResult.riskCategory}`
                  );
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-200 border border-white/15 flex items-center gap-2 cursor-pointer transition-all"
              >
                <Copy className="w-4 h-4" />
                Copy Block Rule
              </button>
            </div>
          </div>

          {/* AI SOC Analyst Threat Breakdown */}
          <AiAnalystCard scan={selectedResult} />

          {/* Analysis Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Checklist */}
            <AnalysisCard
              title="Security Analysis Checklist"
              subtitle="Live heuristic & protocol checks"
              icon={<Shield className="w-4 h-4 text-[#00f0ff]" />}
            >
              <ul className="space-y-3">
                {selectedResult.checklist.map((item) => {
                  const Icon = CHECK_ICON[item.status];
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/10"
                    >
                      <Icon
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          CHECK_COLOR[item.status]
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">
                          {item.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </AnalysisCard>

            {/* Domain Info & Reasons */}
            <div className="space-y-6">
              <AnalysisCard
                title="Domain Information"
                subtitle="DNS resolution & host metadata"
                icon={<Globe className="w-4 h-4 text-purple-400" />}
              >
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
                    <dt className="text-xs font-mono text-gray-400">Domain</dt>
                    <dd className="font-medium text-white mt-0.5 break-all">
                      {selectedResult.domainInfo.domain}
                    </dd>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
                    <dt className="text-xs font-mono text-gray-400">IP Address</dt>
                    <dd className="font-medium text-white mt-0.5 font-mono">
                      {selectedResult.domainInfo.ipAddress}
                    </dd>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
                    <dt className="text-xs font-mono text-gray-400">Registrar</dt>
                    <dd className="font-medium text-white mt-0.5">
                      {selectedResult.domainInfo.registrar}
                    </dd>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10">
                    <dt className="text-xs font-mono text-gray-400">Server Location</dt>
                    <dd className="font-medium text-white mt-0.5">
                      {selectedResult.domainInfo.serverLocation}
                    </dd>
                  </div>
                </dl>
              </AnalysisCard>

              <AnalysisCard
                title="Random Forest C2 & Telemetry"
                subtitle={`${selectedResult.randomForest.totalTrees}-Tree Ensemble • ${selectedResult.randomForest.confidence}% confidence • Live DNS/TLS + Lexical Flow Estimates`}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4 font-mono">
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <span className="text-gray-400">Beaconing</span>
                    <p className="font-semibold text-[#00f0ff] mt-0.5">
                      {(selectedResult.telemetry.beaconingScore * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <span className="text-gray-400">DNS Entropy</span>
                    <p className="font-semibold text-white mt-0.5">
                      {selectedResult.telemetry.domainEntropy}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <span className="text-gray-400">DNS Rate</span>
                    <p className="font-semibold text-white mt-0.5">
                      {selectedResult.telemetry.dnsQueryRate} req/m
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <span className="text-gray-400">Out/In Ratio</span>
                    <p className="font-semibold text-white mt-0.5">
                      {selectedResult.telemetry.outboundByteRatio}x
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <span className="text-gray-400">NXDOMAIN</span>
                    <p className="font-semibold text-white mt-0.5">
                      {(selectedResult.telemetry.nxdomainRatio * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <span className="text-gray-400">Tree Votes</span>
                    <p className="font-semibold text-[#00ff88] mt-0.5">
                      {selectedResult.randomForest.treeVotes[selectedResult.riskCategory]}/
                      {selectedResult.randomForest.totalTrees}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-gray-300">
                  {selectedResult.reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] mt-2 shrink-0" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </AnalysisCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
