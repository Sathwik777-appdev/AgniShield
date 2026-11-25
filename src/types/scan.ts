import type { RandomForestPrediction, TelemetryFeatures } from '../ml/randomForest';

export type RiskCategory = 'Safe' | 'Suspicious' | 'Dangerous';

export type C2Verdict =
  | 'No C2 Activity'
  | 'Potential C2 Beaconing'
  | 'High-Confidence C2 / DGA';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface SecurityCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DomainInfo {
  domain: string;
  registrar: string;
  registeredDate: string;
  ipAddress: string;
  serverLocation: string;
}

export interface ScanResult {
  id: string;
  url: string;
  normalizedUrl: string;
  safetyScore: number;
  riskCategory: RiskCategory;
  httpsEnabled: boolean;
  domainInfo: DomainInfo;
  checklist: SecurityCheckItem[];
  reasons: string[];
  scannedAt: string;
  /** Command & Control (C2) verdict from Random Forest over Flow Logs & DNS */
  c2Verdict: C2Verdict;
  /** MITRE ATT&CK technique mapping */
  mitreAttack?: string;
  /** Extracted Flow Log & DNS features */
  telemetry: TelemetryFeatures;
  /** Random Forest ensemble output */
  randomForest: RandomForestPrediction;
  /** Clearly marks this result as using simulated/demo telemetry in the MVP. */
  isMock: boolean;
}

export interface DashboardStatsData {
  totalScanned: number;
  safeCount: number;
  suspiciousCount: number;
  dangerousCount: number;
  isDemoData: boolean;
}

export type PageView = 'landing' | 'dashboard' | 'scanner' | 'history';
