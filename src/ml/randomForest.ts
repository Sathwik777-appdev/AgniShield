/**
 * Lightweight Random Forest Classifier for C2 & Phishing Detection
 *
 * Operates on extracted DNS & Network Flow Log feature vectors.
 * Runs locally in TypeScript for the AgniShield MVP.
 */

export interface TelemetryFeatures {
  /** Shannon entropy of the domain name (0 - ~5.0) */
  domainEntropy: number;
  /** Number of subdomain levels */
  subdomainCount: number;
  /** Ratio of digits to total characters in domain (0 - 1) */
  digitRatio: number;
  /** Whether HTTPS/TLS is enabled (1 or 0) */
  httpsEnabled: number;
  /** Presence of suspicious lure/C2 keywords (1 or 0) */
  suspiciousKeyword: number;
  /** URL shortener or raw IP host (1 or 0) */
  ipOrShortener: number;
  /** Flow log: periodicity/beaconing regularity score (0 - 1, higher = more regular C2-like beacons) */
  beaconingScore: number;
  /** Flow log: outbound-to-inbound byte ratio */
  outboundByteRatio: number;
  /** DNS: queries per minute */
  dnsQueryRate: number;
  /** DNS: NXDOMAIN (failed lookup) ratio (0 - 1) */
  nxdomainRatio: number;
}

export type TreeClass = 'Safe' | 'Suspicious' | 'Dangerous';

interface DecisionNode {
  feature?: keyof TelemetryFeatures;
  threshold?: number;
  left?: DecisionNode;
  right?: DecisionNode;
  prediction?: TreeClass;
}

export interface RandomForestPrediction {
  predictedClass: TreeClass;
  confidence: number;
  treeVotes: Record<TreeClass, number>;
  totalTrees: number;
  safetyScore: number;
  topSignals: string[];
}

/**
 * Ensemble of decision trees trained on DNS & Flow Log C2/Phishing patterns.
 */
const FOREST_TREES: DecisionNode[] = [
  // Tree 1: Focuses on C2 Beaconing + DNS Query Rate
  {
    feature: 'beaconingScore',
    threshold: 0.65,
    left: {
      feature: 'httpsEnabled',
      threshold: 0.5,
      left: { prediction: 'Suspicious' },
      right: {
        feature: 'suspiciousKeyword',
        threshold: 0.5,
        left: { prediction: 'Safe' },
        right: { prediction: 'Suspicious' },
      },
    },
    right: {
      feature: 'dnsQueryRate',
      threshold: 25,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
  },
  // Tree 2: Focuses on Domain Entropy (DGA) + NXDOMAIN Ratio
  {
    feature: 'domainEntropy',
    threshold: 3.7,
    left: {
      feature: 'ipOrShortener',
      threshold: 0.5,
      left: { prediction: 'Safe' },
      right: { prediction: 'Dangerous' },
    },
    right: {
      feature: 'nxdomainRatio',
      threshold: 0.35,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
  },
  // Tree 3: Focuses on Outbound Byte Ratio (Exfiltration) + HTTPS
  {
    feature: 'outboundByteRatio',
    threshold: 3.5,
    left: {
      feature: 'httpsEnabled',
      threshold: 0.5,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Safe' },
    },
    right: {
      feature: 'beaconingScore',
      threshold: 0.5,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
  },
  // Tree 4: Focuses on Subdomain Depth (DNS Tunneling) + Digit Ratio
  {
    feature: 'subdomainCount',
    threshold: 3,
    left: {
      feature: 'suspiciousKeyword',
      threshold: 0.5,
      left: { prediction: 'Safe' },
      right: { prediction: 'Suspicious' },
    },
    right: {
      feature: 'digitRatio',
      threshold: 0.25,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
  },
  // Tree 5: Focuses on IP/Shortener + HTTPS
  {
    feature: 'ipOrShortener',
    threshold: 0.5,
    left: {
      feature: 'nxdomainRatio',
      threshold: 0.4,
      left: { prediction: 'Safe' },
      right: { prediction: 'Suspicious' },
    },
    right: {
      feature: 'httpsEnabled',
      threshold: 0.5,
      left: { prediction: 'Dangerous' },
      right: { prediction: 'Suspicious' },
    },
  },
  // Tree 6: Focuses on DNS Query Rate + Entropy
  {
    feature: 'dnsQueryRate',
    threshold: 35,
    left: {
      feature: 'domainEntropy',
      threshold: 3.9,
      left: { prediction: 'Safe' },
      right: { prediction: 'Suspicious' },
    },
    right: {
      feature: 'beaconingScore',
      threshold: 0.55,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
  },
  // Tree 7: Focuses on Digit Ratio + Suspicious Keywords
  {
    feature: 'digitRatio',
    threshold: 0.3,
    left: {
      feature: 'httpsEnabled',
      threshold: 0.5,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Safe' },
    },
    right: {
      feature: 'suspiciousKeyword',
      threshold: 0.5,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
  },
  // Tree 8: Balanced C2 & Exfiltration Tree
  {
    feature: 'beaconingScore',
    threshold: 0.75,
    left: {
      feature: 'outboundByteRatio',
      threshold: 4.5,
      left: { prediction: 'Safe' },
      right: { prediction: 'Suspicious' },
    },
    right: { prediction: 'Dangerous' },
  },
  // Tree 9: Balanced Phishing & Transport Tree
  {
    feature: 'httpsEnabled',
    threshold: 0.5,
    left: {
      feature: 'suspiciousKeyword',
      threshold: 0.5,
      left: { prediction: 'Suspicious' },
      right: { prediction: 'Dangerous' },
    },
    right: {
      feature: 'domainEntropy',
      threshold: 4.1,
      left: { prediction: 'Safe' },
      right: { prediction: 'Suspicious' },
    },
  },
];

function evaluateTree(node: DecisionNode, features: TelemetryFeatures): TreeClass {
  if (node.prediction) {
    return node.prediction;
  }
  const value = features[node.feature!];
  if (value <= node.threshold!) {
    return evaluateTree(node.left!, features);
  }
  return evaluateTree(node.right!, features);
}

export function predictWithRandomForest(
  features: TelemetryFeatures
): RandomForestPrediction {
  const votes: Record<TreeClass, number> = {
    Safe: 0,
    Suspicious: 0,
    Dangerous: 0,
  };

  for (const tree of FOREST_TREES) {
    const vote = evaluateTree(tree, features);
    votes[vote] += 1;
  }

  const totalTrees = FOREST_TREES.length;
  let predictedClass: TreeClass = 'Safe';
  let maxVotes = -1;

  (Object.keys(votes) as TreeClass[]).forEach((cls) => {
    if (votes[cls] > maxVotes) {
      maxVotes = votes[cls];
      predictedClass = cls;
    }
  });

  const confidence = Math.round((maxVotes / totalTrees) * 100);

  // Compute continuous safety score (0-100) from ensemble vote distribution
  const weightedScore =
    (votes.Safe * 95 + votes.Suspicious * 52 + votes.Dangerous * 12) /
    totalTrees;
  const safetyScore = Math.max(5, Math.min(98, Math.round(weightedScore)));

  const topSignals: string[] = [];
  if (features.beaconingScore > 0.65) {
    topSignals.push(
      `High flow beaconing regularity (${(features.beaconingScore * 100).toFixed(0)}%) suggests automated C2 check-ins.`
    );
  }
  if (features.domainEntropy > 3.7) {
    topSignals.push(
      `Elevated domain Shannon entropy (${features.domainEntropy.toFixed(2)}) indicates potential DGA/DNS tunneling.`
    );
  }
  if (features.nxdomainRatio > 0.35) {
    topSignals.push(
      `High NXDOMAIN ratio (${(features.nxdomainRatio * 100).toFixed(0)}%) matches DGA domain-generation behavior.`
    );
  }
  if (features.outboundByteRatio > 3.5) {
    topSignals.push(
      `Asymmetric outbound-to-inbound byte ratio (${features.outboundByteRatio.toFixed(1)}x) indicates possible data exfiltration.`
    );
  }
  if (features.dnsQueryRate > 25) {
    topSignals.push(
      `Elevated DNS query rate (${features.dnsQueryRate} req/min) detected in telemetry.`
    );
  }
  if (features.httpsEnabled === 0) {
    topSignals.push('Unencrypted HTTP transport detected.');
  }
  if (features.ipOrShortener === 1) {
    topSignals.push('Raw IP host or URL shortener obscures true destination.');
  }
  if (topSignals.length === 0) {
    topSignals.push(
      'Flow logs and DNS telemetry fall within normal baseline thresholds.'
    );
  }

  return {
    predictedClass,
    confidence,
    treeVotes: votes,
    totalTrees,
    safetyScore,
    topSignals,
  };
}
