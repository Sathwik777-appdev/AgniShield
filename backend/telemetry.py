"""
Telemetry module for AgniShield.

Performs live DNS resolution and TLS certificate inspection, then
combines the results with the unified domain-based feature extraction
(from features.py) to produce the final feature vector.
"""

import ipaddress
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
    """
    Perform live host existence verification via DNS resolution & IP check,
    followed by TLS certificate inspection if HTTPS is enabled.
    """
    ip_address = "Unresolved"
    dns_resolved = False

    # 1. Check if the hostname is a direct IPv4 or IPv6 literal
    try:
        ipaddress.ip_address(hostname)
        ip_address = hostname
        dns_resolved = True
    except ValueError:
        pass

    # 2. If not a raw IP, perform live DNS resolution (A, AAAA, CNAME)
    if not dns_resolved and hostname:
        try:
            infos = socket.getaddrinfo(hostname, None)
            ips = [info[4][0] for info in infos if info and info[4]]
            if ips:
                ip_address = ips[0]
                dns_resolved = True
        except Exception:
            try:
                answers = dns.resolver.resolve(hostname, "A", lifetime=2.5)
                dns_records = [rdata.to_text() for rdata in answers]
                if dns_records:
                    ip_address = dns_records[0]
                    dns_resolved = True
            except Exception:
                ip_address = "Unresolved"
                dns_resolved = False

    ssl_valid = False
    ssl_issuer = "None"
    if use_https and dns_resolved:
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
        "dnsResolved": dns_resolved,
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

    # Get features from the unified pipeline (pass full URL so path keywords & scheme are preserved)
    features = domain_to_features_dict(normalized_url)

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
