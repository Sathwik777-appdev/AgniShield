"""Automated API, ML feature, database, and rate-limiter tests for AgniShield."""

import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from features import FEATURE_NAMES, domain_to_features, domain_to_features_dict, shannon_entropy
from llm_analyst import analyze_with_llm
from main import app, normalize_url
from rate_limit import rate_limiter

client = TestClient(app)


def setup_function():
    rate_limiter.reset()


def test_normalize_url_valid_and_invalid():
    assert normalize_url("google.com") == "https://google.com"
    assert normalize_url("  https://example.org/path  ") == "https://example.org/path"

    for bad in ("", "   ", "localhost", "not-a-domain"):
        try:
            normalize_url(bad)
            assert False, f"Expected ValueError for {bad!r}"
        except ValueError:
            pass


def test_feature_vector_consistency():
    vec = domain_to_features("https://x9k2m7q8z4v1p3w6.xyz/login")
    assert len(vec) == len(FEATURE_NAMES)
    assert shannon_entropy("aaaa") == 0.0
    assert shannon_entropy("x9k2m7q8z4v1p3w6") > 3.5

    shortener_feats = domain_to_features_dict("http://bit.ly/free-bank-claim")
    assert shortener_feats["httpsEnabled"] == 0
    assert shortener_feats["ipOrShortener"] == 1
    assert shortener_feats["suspiciousKeyword"] == 1

    ip_feats = domain_to_features_dict("http://185.220.101.5/beacon")
    assert ip_feats["subdomainCount"] == 0
    assert ip_feats["ipOrShortener"] == 1
    assert ip_feats["suspiciousKeyword"] == 1

    www_feats = domain_to_features_dict("https://www.google.com/search?q=gemini")
    root_feats = domain_to_features_dict("https://google.com")
    assert www_feats == root_feats


def test_health_and_stats_endpoints():
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert "RandomForestClassifier" in body["model"]

    stats = client.get("/api/v1/stats")
    assert stats.status_code == 200
    assert "totalScanned" in stats.json()


def test_benign_subdomains_and_threats_accuracy():
    ok_net = {
        "ipAddress": "142.250.77.110",
        "dnsResolved": True,
        "sslValid": True,
        "sslIssuer": "Google Trust Services",
    }
    for safe_url in (
        "https://www.google.com/search?q=gemini",
        "https://gemini.google.com",
        "https://en.wikipedia.org",
    ):
        with patch("telemetry.resolve_dns_and_ssl", return_value=ok_net):
            res = client.post("/api/v1/scan", json={"url": safe_url, "preset": "auto"})
        assert res.status_code == 200
        data = res.json()
        assert data["riskCategory"] == "Safe", f"False positive on {safe_url}: {data}"
        assert sum(data["randomForest"]["treeVotes"].values()) >= 198

    for danger_url in (
        "http://bit.ly/free-bank-claim",
        "http://185.220.101.5/beacon",
        "https://x9k2m7q8z4v1p3w6.xyz",
    ):
        with patch("telemetry.resolve_dns_and_ssl", return_value={
            "ipAddress": "Unresolved",
            "dnsResolved": False,
            "sslValid": False,
            "sslIssuer": "None",
        }):
            res = client.post("/api/v1/scan", json={"url": danger_url, "preset": "auto"})
        assert res.status_code == 200
        data = res.json()
        assert data["riskCategory"] == "Dangerous", f"Missed threat on {danger_url}: {data}"
        assert data["safetyScore"] <= 38


def test_invalid_tls_penalizes_https_host():
    bad_tls = {
        "ipAddress": "93.184.216.34",
        "dnsResolved": True,
        "sslValid": False,
        "sslIssuer": "None",
    }
    with patch("telemetry.resolve_dns_and_ssl", return_value=bad_tls):
        res = client.post("/api/v1/scan", json={"url": "https://example.com", "preset": "auto"})
    assert res.status_code == 200
    data = res.json()
    assert data["riskCategory"] == "Suspicious"
    assert data["safetyScore"] <= 64
    https_item = next(c for c in data["checklist"] if c["id"] == "https")
    assert https_item["status"] == "warn"


def test_analyze_ai_endpoint_and_no_scheme_safety():
    res = client.post(
        "/api/v1/analyze/ai",
        json={
            "url": "https://example.com",
            "safetyScore": 88,
            "riskCategory": "Safe",
            "telemetry": {"domainEntropy": 2.6, "beaconingScore": 0.1},
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "no immediate remediation is required" in data["executiveSummary"].lower()
    assert data["remediations"] == []

    # Verify tunnel hostname without scheme doesn't raise IndexError
    no_scheme = analyze_with_llm({
        "url": "demo.trycloudflare.com",
        "safetyScore": 65,
        "riskCategory": "Suspicious",
        "telemetry": {"domainEntropy": 2.9, "beaconingScore": 0.15},
    })
    assert no_scheme["issues"][0]["component"] == "Ephemeral Tunnel Hostname"


def test_rate_limiter_enforces_429():
    rate_limiter.reset()
    with patch("telemetry.resolve_dns_and_ssl", return_value={
        "ipAddress": "93.184.216.34",
        "dnsResolved": True,
        "sslValid": True,
        "sslIssuer": "DigiCert Inc",
    }):
        for i in range(30):
            r = client.post("/api/v1/scan", json={"url": "example.com", "preset": "auto"})
            assert r.status_code == 200, f"Unexpected status on request {i + 1}: {r.status_code}"

        blocked = client.post("/api/v1/scan", json={"url": "example.com", "preset": "auto"})
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
