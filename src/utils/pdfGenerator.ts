import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ScanResult } from '../types/scan';

export function generateAuditPdfReport(scan: ScanResult) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Background Header Bar
  doc.setFillColor(10, 15, 29);
  doc.rect(0, 0, pageWidth, 42, 'F');

  // Brand Name & Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0, 240, 255);
  doc.text('AGNISHIELD', 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('AI-POWERED WEBSITE SECURITY & THREAT AUDIT REPORT', 14, 25);
  doc.text(`Generated: ${new Date().toUTCString()} | Report ID: ${scan.id}`, 14, 32);

  // Status Badge in Top Right
  const isSafe = scan.riskCategory === 'Safe';
  const isDangerous = scan.riskCategory === 'Dangerous';
  const badgeColor: [number, number, number] = isDangerous
    ? [244, 63, 94]
    : isSafe
    ? [16, 185, 129]
    : [245, 158, 11];

  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.roundedRect(pageWidth - 54, 12, 40, 18, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(scan.riskCategory.toUpperCase(), pageWidth - 34, 20, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`Score: ${scan.safetyScore}/100`, pageWidth - 34, 26, { align: 'center' });

  // Section 1: Executive Target Summary
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Executive Target Summary', 14, 52);

  const summaryData = [
    ['Audited URL', scan.url],
    ['Resolved IP Address', scan.domainInfo?.ipAddress || 'Unresolved'],
    ['SSL / TLS Status', scan.httpsEnabled ? 'HTTPS Active' : 'Unencrypted HTTP / Invalid Handshake'],
    ['C2 Behavioral Verdict', scan.c2Verdict || 'Standard Web Traffic'],
    ['MITRE ATT&CK Mapping', scan.mitreAttack || 'None'],
    ['Evaluation Model', `${scan.randomForest?.totalTrees || 200}-Tree Random Forest Ensemble${scan.isMock ? ' (Offline Fallback)' : ''}`],
  ];

  autoTable(doc, {
    startY: 56,
    theme: 'grid',
    head: [['Parameter', 'Diagnostic Detail']],
    body: summaryData,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  // Section 2: Root-Cause Forensic Telemetry
  let nextY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Root-Cause Telemetry & Heuristic Flags (Live DNS/TLS + Lexical Flow Estimates)', 14, nextY);

  const t = scan.telemetry || {
    domainEntropy: 0,
    subdomainCount: 0,
    digitRatio: 0,
    beaconingScore: 0,
    outboundByteRatio: 0,
    dnsQueryRate: 0,
    nxdomainRatio: 0,
  };

  const telemetryData = [
    [
      'Domain Shannon Entropy',
      `${t.domainEntropy} bits`,
      t.domainEntropy > 3.6 ? 'HIGH (Random generated string detected)' : 'Normal lexical pattern',
      t.domainEntropy > 3.6 ? 'High' : 'Normal',
    ],
    [
      'Subdomain Structure',
      `${t.subdomainCount} subdomains`,
      t.subdomainCount >= 2 ? 'Deep multi-level subdomain nesting' : 'Standard single domain',
      t.subdomainCount >= 2 ? 'Elevated' : 'Normal',
    ],
    [
      'Flow Beacon Regularity',
      `${Math.round((t.beaconingScore || 0) * 100)}%`,
      t.beaconingScore > 0.6 ? 'Automated fixed-interval network pings' : 'Natural human browse intervals',
      t.beaconingScore > 0.6 ? 'Critical' : 'Normal',
    ],
    [
      'DNS Burst & NXDOMAIN Rate',
      `${t.dnsQueryRate || 0} req/min (${Math.round((t.nxdomainRatio || 0) * 100)}% NXDOMAIN)`,
      t.nxdomainRatio > 0.25 ? 'High rate of non-existent domain queries' : 'Valid address resolution',
      t.nxdomainRatio > 0.25 ? 'Elevated' : 'Normal',
    ],
  ];

  autoTable(doc, {
    startY: nextY + 4,
    theme: 'striped',
    head: [['Signal Name', 'Measured Metric', 'Risk Interpretation', 'Severity']],
    body: telemetryData,
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    didParseCell: (data) => {
      if (data.column.index === 3) {
        const val = data.cell.raw as string;
        if (val === 'Critical') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'Elevated' || val === 'High') {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [22, 163, 74];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Section 3: Remediation & Recommendations
  nextY = (doc as any).lastAutoTable.finalY + 12;

  // Add new page if close to bottom
  if (nextY > pageHeight - 65) {
    doc.addPage();
    nextY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Recommended Remediation & Action Plan', 14, nextY);

  const remedies = [];
  if (scan.safetyScore < 70) {
    remedies.push([
      'Custom Domain Verification',
      'Replace auto-generated or ephemeral tunnel subdomains (e.g. trycloudflare.com, ngrok-free.app) with an authenticated enterprise domain (e.g., yourcompany.com) with registered WHOIS provenance.',
    ]);
    remedies.push([
      'Enforce TLS 1.3 & HSTS',
      'Deploy full Strict-Transport-Security (HSTS) with a valid certificate authority (DigiCert, Let’s Encrypt) to avoid unverified handshake warnings.',
    ]);
    remedies.push([
      'Randomness & Brand Protection',
      'Avoid long random hyphenated strings in hostnames which mathematically mimic Domain Generation Algorithms (DGA) used by malware.',
    ]);
    remedies.push([
      'DNS & WAF Filtering',
      'Implement Cloudflare WAF or AWS Route53 DNSSEC to prevent DNS query spikes and anomalous outbound byte imbalances.',
    ]);
  } else {
    remedies.push([
      'Continuous Monitoring',
      'The audited host demonstrates legitimate DNS structure and valid encryption. Continue automated weekly scans to verify zero drift.',
    ]);
    remedies.push([
      'Certificate Expiry Alerting',
      'Ensure TLS certificate auto-renewal is configured to avoid sudden trust score drops upon cert expiration.',
    ]);
  }

  autoTable(doc, {
    startY: nextY + 4,
    theme: 'grid',
    head: [['Action Item', 'Technical Remediation Guidance']],
    body: remedies,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [0, 240, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `AgniShield Defense Labs • Automated Security Audit • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Trigger browser download
  let cleanDomain = 'website';
  try {
    cleanDomain = new URL(scan.normalizedUrl || scan.url).hostname.replace(/[^a-zA-Z0-9-]/g, '_');
  } catch {
    cleanDomain = (scan.domainInfo?.domain || 'website').replace(/[^a-zA-Z0-9-]/g, '_');
  }
  doc.save(`AgniShield_Audit_${cleanDomain}.pdf`);
}
