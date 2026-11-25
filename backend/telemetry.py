"""
Telemetry module for AgniShield.

Performs live DNS resolution and TLS certificate inspection, then
combines the results with the unified domain-based feature extraction
(from features.py) to produce the final feature vector.
"""

import math
import socket
import ssl
from urllib.parse import urlparse

import dns.resolver

from features import (
    FEATURE_NAMES,
    domain_to_features,
    domain_to_features_dict,
    shannon_entropy,
)


def resolve_dns_and_ssl(hostname: str, use_https: bool) -> dict:
    """Perform live DNS A-record resolution and TLS certificate check."""
    ip_address = "Unresolved"
    dns_records = []
    try:
        answers = dns.resolver.resolve(hostname, "A", lifetime=2.5)
        dns_records = [rdata.to_text() for rdata in answers]
        if dns_records:
            ip_address = dns_records[0]
    except Exception:
        try:
            ip_address = socket.gethostbyname(hostname)
        except Exception:
            ip_address = "Unresolved"

    ssl_valid = False
    ssl_issuer = "None"
    if use_https and ip_address != "Unresolved":
        try:
            ctx = ssl.create_default_context()
            with ctx.wrap_socket(
                socket.socket(socket.AF_INET), server_hostname=hostname
            ) as s:
                s.settimeout(2.5)
                s.connect((hostname, 443))
                cert = s.getpeercert()
                ssl_valid = True
                issuer = dict(x[0] for x in cert.get("issuer", []))
                ssl_issuer = issuer.get("organizationName", "Valid TLS")
        except Exception:
            ssl_valid = False

    return {
        "ipAddress": ip_address,
        "dnsResolved": ip_address != "Unresolved",
        "sslValid": ssl_valid,
        "sslIssuer": ssl_issuer,
    }


def extract_features(normalized_url: str, preset: str = "auto") -> tuple[dict, dict]:
    """
    Extract the full 10-feature vector for a URL.

    Uses the UNIFIED domain_to_features() pipeline from features.py,
    then overlays live network telemetry (DNS resolution, TLS check)
    to refine the httpsEnabled feature with the actual value.

    The preset parameter is kept for API compatibility but no longer
    overrides features with hardcoded values — the model was trained
    without presets, so inference must match.
    """
    parsed = urlparse(normalized_url)
    hostname = (parsed.hostname or "").lower()

    # Get features from the unified pipeline (same as training)
    features = domain_to_features_dict(hostname)

    # Override httpsEnabled with the ACTUAL protocol (this is the one
    # feature that cannot be known at training time but CAN be known at
    # inference time, and it's legitimate to use the real value).
    features["httpsEnabled"] = 1 if parsed.scheme == "https" else 0

    # Perform live network checks
    live_net = resolve_dns_and_ssl(hostname, bool(features["httpsEnabled"]))

    # If DNS doesn't resolve, slightly boost the risk indicators
    if not live_net["dnsResolved"]:
        features["nxdomainRatio"] = min(0.95, features["nxdomainRatio"] + 0.08)

    return features, live_net
