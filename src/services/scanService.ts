import {
  predictWithRandomForest,
  type TelemetryFeatures,
} from '../ml/randomForest';
import type {
  C2Verdict,
  DashboardStatsData,
  ScanResult,
  SecurityCheckItem,
} from '../types/scan';

/**
 * AgniShield Scanning & C2 Detection Service (MVP)
 *
 * Uses a local Random Forest classifier (`predictWithRandomForest`) operating on
 * extracted DNS & Network Flow Log features. In this frontend MVP, Flow Log &
 * DNS telemetry are simulated or supplied via demo presets; replace with a live
 * telemetry collector / backend API in production.
 */

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export type TelemetryPreset = 'auto' | 'normal' | 'c2_beaconing' | 'dns_tunneling';

export function validateUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please enter a website URL to scan.' };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return {
        valid: false,
        error: 'Please enter a valid domain name (e.g., https://example.com).',
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format. Example: https://example.com',
    };
  }
}

function calculateShannonEntropy(str: string): number {
  if (!str) return 0;
  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(2));
}

export function extractTelemetryFeatures(
  normalizedUrl: string,
  preset: TelemetryPreset = 'auto'
): TelemetryFeatures {
  const parsed = new URL(normalizedUrl);
  const hostname = parsed.hostname.toLowerCase();
  const fullLower = normalizedUrl.toLowerCase();

  const httpsEnabled = parsed.protocol === 'https:' ? 1 : 0;
  const suspiciousKeywords = [
    'login',
    'verify',
    'update',
    'secure',
    'account',
    'bank',
    'prize',
    'free',
    'claim',
    'wallet',
    'c2',
    'beacon',
    'gate',
  ];
  const suspiciousKeyword = suspiciousKeywords.some((kw) =>
    fullLower.includes(kw)
  )
    ? 1
    : 0;

  const isIpHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isShortener = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl'].some((s) =>
    hostname.includes(s)
  );
  const ipOrShortener = isIpHost || isShortener ? 1 : 0;

  const domainEntropy = calculateShannonEntropy(hostname.replace(/\./g, ''));
  const subdomainCount = Math.max(0, hostname.split('.').length - 2);
  const digits = (hostname.match(/\d/g) || []).length;
  const digitRatio = Number((digits / Math.max(1, hostname.length)).toFixed(2));

  // Apply preset or heuristic Flow Log + DNS telemetry
  if (preset === 'c2_beaconing') {
    return {
      domainEntropy: Math.max(domainEntropy, 3.85),
      subdomainCount,
      digitRatio,
      httpsEnabled,
      suspiciousKeyword,
      ipOrShortener,
      beaconingScore: 0.91,
      outboundByteRatio: 4.8,
      dnsQueryRate: 42,
      nxdomainRatio: 0.22,
    };
  }

  if (preset === 'dns_tunneling') {
    return {
      domainEntropy: Math.max(domainEntropy, 4.35),
      subdomainCount: Math.max(subdomainCount, 4),
      digitRatio: Math.max(digitRatio, 0.34),
      httpsEnabled,
      suspiciousKeyword,
      ipOrShortener,
      beaconingScore: 0.72,
      outboundByteRatio: 5.4,
      dnsQueryRate: 68,
      nxdomainRatio: 0.56,
    };
  }

  if (preset === 'normal') {
    return {
      domainEntropy: Math.min(domainEntropy, 3.3),
      subdomainCount,
      digitRatio,
      httpsEnabled: 1,
      suspiciousKeyword: 0,
      ipOrShortener: 0,
      beaconingScore: 0.12,
      outboundByteRatio: 0.8,
      dnsQueryRate: 4,
      nxdomainRatio: 0.02,
    };
  }

  // 'auto' mode: synthesize realistic Flow & DNS telemetry from URL signals
  const riskBoost =
    (httpsEnabled === 0 ? 0.25 : 0) +
    (suspiciousKeyword === 1 ? 0.3 : 0) +
    (ipOrShortener === 1 ? 0.35 : 0);

  return {
    domainEntropy,
    subdomainCount,
    digitRatio,
    httpsEnabled,
    suspiciousKeyword,
    ipOrShortener,
    beaconingScore: Number(Math.min(0.95, 0.14 + riskBoost).toFixed(2)),
    outboundByteRatio: Number((0.9 + riskBoost * 5.2).toFixed(1)),
    dnsQueryRate: Math.round(5 + riskBoost * 45),
    nxdomainRatio: Number(Math.min(0.75, 0.03 + riskBoost * 0.5).toFixed(2)),
  };
}

function getC2Verdict(
  riskCategory: 'Safe' | 'Suspicious' | 'Dangerous',
  features: TelemetryFeatures
): C2Verdict {
  if (
    riskCategory === 'Dangerous' ||
    features.beaconingScore >= 0.75 ||
    features.nxdomainRatio >= 0.45
  ) {
    return 'High-Confidence C2 / DGA';
  }
  if (
    riskCategory === 'Suspicious' ||
    features.beaconingScore >= 0.45 ||
    features.dnsQueryRate >= 25
  ) {
    return 'Potential C2 Beaconing';
  }
  return 'No C2 Activity';
}

function buildChecklist(features: TelemetryFeatures): SecurityCheckItem[] {
  return [
    {
      id: 'https',
      label: 'HTTPS / TLS Transport',
      status: features.httpsEnabled === 1 ? 'pass' : 'fail',
      detail:
        features.httpsEnabled === 1
          ? 'Encrypted HTTPS transport detected.'
          : 'Unencrypted HTTP transport detected.',
    },
    {
      id: 'c2-beaconing',
      label: 'Flow Log C2 Beaconing',
      status:
        features.beaconingScore >= 0.7
          ? 'fail'
          : features.beaconingScore >= 0.45
            ? 'warn'
            : 'pass',
      detail: `Beaconing regularity score: ${(features.beaconingScore * 100).toFixed(0)}% (Outbound/Inbound ratio: ${features.outboundByteRatio}x).`,
    },
    {
      id: 'dns-dga',
      label: 'DNS Entropy & DGA Check',
      status:
        features.domainEntropy > 3.9 || features.nxdomainRatio > 0.35
          ? 'fail'
          : features.domainEntropy > 3.5
            ? 'warn'
            : 'pass',
      detail: `Shannon entropy: ${features.domainEntropy} | DNS rate: ${features.dnsQueryRate} req/min | NXDOMAIN: ${(features.nxdomainRatio * 100).toFixed(0)}%.`,
    },
    {
      id: 'rf-classifier',
      label: 'Random Forest C2 Ensemble',
      status: 'pass',
      detail: 'Evaluated locally across 9 decision trees (Flow + DNS features).',
    },
  ];
}

export const API_BASE_URL =
  typeof window !== 'undefined' && window.location.port === '5173'
    ? 'http://localhost:8000/api/v1'
    : '/api/v1';

export async function scanWebsite(
  rawUrl: string,
  preset: TelemetryPreset = 'auto'
): Promise<ScanResult> {
  const validation = validateUrl(rawUrl);
  if (!validation.valid || !validation.normalizedUrl) {
    throw new Error(validation.error || 'Invalid URL');
  }

  // Try live FastAPI + scikit-learn Random Forest backend first
  try {
    const response = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rawUrl, preset }),
    });
    if (response.ok) {
      return (await response.json()) as ScanResult;
    }
  } catch {
    // Backend unavailable; fall back to local TypeScript Random Forest
  }

  // Simulate telemetry collection & model inference latency
  await new Promise((resolve) => setTimeout(resolve, 900));

  const parsed = new URL(validation.normalizedUrl);
  const hostname = parsed.hostname.toLowerCase();
  const telemetry = extractTelemetryFeatures(validation.normalizedUrl, preset);
  const randomForest = predictWithRandomForest(telemetry);
  const c2Verdict = getC2Verdict(randomForest.predictedClass, telemetry);

  return {
    id: `scan-${Date.now()}`,
    url: rawUrl.trim(),
    normalizedUrl: validation.normalizedUrl,
    safetyScore: randomForest.safetyScore,
    riskCategory: randomForest.predictedClass,
    httpsEnabled: telemetry.httpsEnabled === 1,
    domainInfo: {
      domain: hostname,
      registrar: 'Local Fallback (backend unavailable)',
      registeredDate: 'N/A',
      ipAddress: 'N/A',
      serverLocation: 'N/A',
    },
    checklist: buildChecklist(telemetry),
    reasons: [
      ...randomForest.topSignals,
      `Random Forest Ensemble: ${randomForest.treeVotes[randomForest.predictedClass]}/${randomForest.totalTrees} trees voted ${randomForest.predictedClass} (${randomForest.confidence}% confidence).`,
    ],
    scannedAt: new Date().toISOString(),
    c2Verdict,
    telemetry,
    randomForest,
    isMock: false,
  };
}

export async function fetchHistoricalAudits(limit: number = 50): Promise<ScanResult[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/history?limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        return data.items;
      }
    }
  } catch (e) {
    console.warn('Backend history fetch unavailable, using session storage:', e);
  }
  return [];
}

export function getInitialDemoHistory(): ScanResult[] {
  return [];
}

export function computeDashboardStats(
  history: ScanResult[]
): DashboardStatsData {
  const safeCount = history.filter((s) => s.riskCategory === 'Safe').length;
  const suspiciousCount = history.filter(
    (s) => s.riskCategory === 'Suspicious'
  ).length;
  const dangerousCount = history.filter(
    (s) => s.riskCategory === 'Dangerous'
  ).length;

  return {
    totalScanned: history.length,
    safeCount,
    suspiciousCount,
    dangerousCount,
    isDemoData: false,
  };
}
