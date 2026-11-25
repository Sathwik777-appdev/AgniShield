"""Automated API, ML feature, and rate-limiter tests for AgniShield."""

import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from features import FEATURE_NAMES, domain_to_features, shannon_entropy
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


def test_health_and_stats_endpoints():
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert "RandomForestClassifier" in body["model"]

    stats = client.get("/api/v1/stats")
    assert stats.status_code == 200
    assert "totalScanned" in stats.json()


def test_scan_endpoint_valid_dga_and_invalid():
    bad = client.post("/api/v1/scan", json={"url": "invalid-host", "preset": "auto"})
    assert bad.status_code == 400

    mocked_net = {
        "ipAddress": "Unresolved",
        "dnsResolved": False,
        "sslValid": False,
        "sslIssuer": "None",
    }
    with patch("telemetry.resolve_dns_and_ssl", return_value=mocked_net):
        res = client.post(
            "/api/v1/scan",
            json={"url": "x9k2m7q8z4v1p3w6.xyz", "preset": "auto"},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["riskCategory"] == "Dangerous"
    assert data["safetyScore"] <= 42
    assert "T1568.002" in data["mitreAttack"]


def test_analyze_ai_endpoint():
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
    assert "executiveSummary" in data
    assert isinstance(data["issues"], list)


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
