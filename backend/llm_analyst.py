"""
AI SOC Analyst Engine for AgniShield.
Uses local Ollama LLMs (e.g. qwen3:8b, gemma4:12b) when available with a
fast sub-millisecond heuristic reasoning fallback.
Produces structured, deep forensic breakdowns of website issues, C2 risks, and remedies.
"""

import json
import logging
import urllib.request
from typing import Any, Dict

logger = logging.getLogger("agnishield.llm")

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
DEFAULT_MODEL = "qwen3:8b"


def generate_fallback_ai_analysis(scan_data: Dict[str, Any]) -> Dict[str, Any]:
    """Fast, deterministic SOC reasoning engine when local LLM is cold or offline."""
    url = scan_data.get("url", "")
    score = scan_data.get("safetyScore", 80)
    category = scan_data.get("riskCategory", "Safe")
    verdict = scan_data.get("c2Verdict", "No C2 Activity")
    mitre = scan_data.get("mitreAttack", "None")
    t = scan_data.get("telemetry", {})
    live_net = scan_data.get("domainInfo", {})

    entropy = t.get("domainEntropy", 2.5)
    beaconing = t.get("beaconingScore", 0.1)
    dns_rate = t.get("dnsQueryRate", 5)
    nxdomain = t.get("nxdomainRatio", 0.05)
    outbound = t.get("outboundByteRatio", 1.0)
    https = scan_data.get("httpsEnabled", True)

    issues = []
    remediations = []

    # Issue 1: Lexical / Entropy Analysis
    if entropy > 3.5:
        issues.append({
            "severity": "HIGH",
            "component": "Domain Randomness & Entropy",
            "finding": f"Elevated Shannon entropy measured at {entropy} bits.",
            "impact": "High lexical randomness mathematically matches Domain Generation Algorithms (DGA) used by botnets to evade static domain blocklists.",
        })
        remediations.append({
            "priority": "P1",
            "action": "Domain Name Stabilization",
            "guidance": "Migrate from randomized or auto-generated hostnames to human-readable brand domains with verified WHOIS registration.",
        })
    elif "trycloudflare" in url or "ngrok" in url or "localtunnel" in url:
        issues.append({
            "severity": "MEDIUM",
            "component": "Ephemeral Tunnel Hostname",
            "finding": f"Audited domain operates over an ephemeral proxy tunnel ({url.split('/')[2]}).",
            "impact": "Threat actors frequently exploit free tunnel services to stage phishing campaigns without owning authentic domain infrastructure.",
        })
        remediations.append({
            "priority": "P1",
            "action": "Custom Domain Binding",
            "guidance": "Bind a registered corporate domain with authenticated DNS records (CNAME/A) rather than public shared tunnel domains.",
        })
    else:
        issues.append({
            "severity": "LOW",
            "component": "Lexical Pattern",
            "finding": f"Shannon entropy is {entropy} bits, within normal organic language thresholds.",
            "impact": "No algorithmic domain generation markers detected.",
        })

    # Issue 2: Network Flow & Beaconing Regularity
    if beaconing > 0.6:
        issues.append({
            "severity": "CRITICAL",
            "component": "Command & Control (C2) Beaconing",
            "finding": f"Beacon regularity score is {int(beaconing * 100)}% with regular periodic interval clustering.",
            "impact": f"Matches MITRE ATT&CK {mitre}. Automated heartbeat signals indicate infected endpoints checking in with a centralized C2 server.",
        })
        remediations.append({
            "priority": "P0",
            "action": "Network Isolation & Traffic Quota",
            "guidance": "Implement jitter on outgoing HTTP/DNS heartbeats and restrict outbound port 80/443 traffic from unauthorized binaries using host-based EDR.",
        })
    elif beaconing > 0.35:
        issues.append({
            "severity": "MEDIUM",
            "component": "Periodic Telemetry Heartbeat",
            "finding": f"Moderate beaconing regularity detected ({int(beaconing * 100)}%).",
            "impact": "Slight automated polling patterns observed. Could indicate background API polling or telemetry services.",
        })
        remediations.append({
            "priority": "P2",
            "action": "Introduce Random Jitter",
            "guidance": "Inject pseudo-random delay (+/- 20% interval) in client polling loops to eliminate artificial network signatures.",
        })

    # Issue 3: DNS Protocol & NXDOMAIN Ratio
    if nxdomain > 0.25:
        issues.append({
            "severity": "HIGH",
            "component": "DNS NXDOMAIN Anomaly",
            "finding": f"NXDOMAIN ratio stands at {int(nxdomain * 100)}% with query rate of {dns_rate} req/min.",
            "impact": "High rate of failed DNS lookups is a classic indicator of malware querying candidate DGA domains waiting for an active rendezvous.",
        })
        remediations.append({
            "priority": "P1",
            "action": "DNS Sinkholing & Response Rate Limiting (RRL)",
            "guidance": "Enforce DNS RPZ (Response Policy Zones) and filter high-burst NXDOMAIN queries at the recursive resolver level.",
        })

    # Issue 4: Encryption & TLS Handshake
    if not https:
        issues.append({
            "severity": "HIGH",
            "component": "Transport Layer Security (TLS)",
            "finding": "Unencrypted HTTP or unverified TLS certificate handshake.",
            "impact": "Exposes all data in transit to Man-in-the-Middle (MITM) credential interception and protocol downgrade attacks.",
        })
        remediations.append({
            "priority": "P0",
            "action": "Deploy HSTS & TLS 1.3",
            "guidance": "Enforce HTTP Strict Transport Security (HSTS) with max-age=31536000 and obtain an authenticated certificate via Let's Encrypt or DigiCert.",
        })

    executive_summary = (
        f"AgniShield AI SOC Analyst evaluated {url}. The domain received a neural safety score of {score}/100 "
        f"({category.upper()}), exhibiting verdict '{verdict}'. Primary diagnostic signals include {len(issues)} "
        f"telemetry findings spanning lexical entropy ({entropy} bits) and flow beaconing characteristics. "
        f"Implementing the recommended remediation items below will restore host safety into trusted baseline thresholds."
    )

    return {
        "status": "success",
        "engine": "AgniShield Neural SOC Analyst (Local Expert System)",
        "executiveSummary": executive_summary,
        "score": score,
        "category": category,
        "verdict": verdict,
        "mitreAttack": mitre,
        "issues": issues,
        "remediations": remediations,
        "llmGenerated": False,
    }


def analyze_with_llm(scan_data: Dict[str, Any]) -> Dict[str, Any]:
    """Attempt local Ollama LLM inference with automated fallback."""
    url = scan_data.get("url", "")
    score = scan_data.get("safetyScore", 80)
    category = scan_data.get("riskCategory", "Safe")
    t = scan_data.get("telemetry", {})

    prompt = (
        f"You are a Senior Cyber Threat Intelligence Analyst for AgniShield.\n"
        f"Analyze this audited website:\n"
        f"URL: {url}\n"
        f"Safety Score: {score}/100 ({category})\n"
        f"Shannon Entropy: {t.get('domainEntropy')} bits\n"
        f"Beaconing Score: {t.get('beaconingScore')}\n"
        f"DNS Query Rate: {t.get('dnsQueryRate')}\n"
        f"NXDOMAIN Ratio: {t.get('nxdomainRatio')}\n\n"
        f"Respond in valid JSON with these keys:\n"
        f"- executiveSummary: 2 concise sentences summarizing the risk.\n"
        f"- issues: array of objects with keys 'severity' (CRITICAL/HIGH/MEDIUM/LOW), 'component', 'finding', 'impact'.\n"
        f"- remediations: array of objects with keys 'priority' (P0/P1/P2), 'action', 'guidance'.\n"
        f"Output ONLY valid JSON."
    )

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps({
                "model": DEFAULT_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json"
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        res = urllib.request.urlopen(req, timeout=4)
        data = json.loads(res.read().decode())
        parsed = json.loads(data.get("response", "{}"))
        if "executiveSummary" in parsed and "issues" in parsed:
            parsed["engine"] = f"Local LLM ({DEFAULT_MODEL} via Ollama)"
            parsed["llmGenerated"] = True
            parsed["score"] = score
            parsed["category"] = category
            return parsed
    except Exception as e:
        logger.info(f"Ollama inference skipped ({e}), using fast SOC diagnostic engine.")

    return generate_fallback_ai_analysis(scan_data)
