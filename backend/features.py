"""
Unified Feature Extraction for AgniShield Random Forest Classifier.

This module is the SINGLE SOURCE OF TRUTH for converting a domain/URL string
into a 10-element feature vector. It is used identically during:
  1. Model training  (train_dga_model.py)
  2. Live inference   (telemetry.py -> extract_features())
  3. Retrain endpoint (main.py -> /api/v1/model/train)

Features are extracted purely from the hostname and its Second-Level Domain (SLD)
without any label leakage.
"""

import math
import re
from collections import Counter

FEATURE_NAMES = [
    "domainEntropy",
    "subdomainCount",
    "digitRatio",
    "httpsEnabled",
    "suspiciousKeyword",
    "ipOrShortener",
    "beaconingScore",
    "outboundByteRatio",
    "dnsQueryRate",
    "nxdomainRatio",
]

CLASSES = ["Safe", "Suspicious", "Dangerous"]

SUSPICIOUS_KEYWORDS = frozenset([
    "login", "verify", "update", "secure", "account",
    "bank", "prize", "free", "claim", "wallet",
    "paypal", "signin", "confirm", "password", "credential",
    "beacon", "gate", "c2", "alert", "recover", "support",
])

SHORTENER_DOMAINS = frozenset([
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
    "is.gd", "buff.ly", "adf.ly", "tiny.cc",
])

# Most common English digraphs / bigrams
COMMON_BIGRAMS = frozenset([
    "th", "he", "in", "er", "an", "re", "on", "at", "en", "nd",
    "ti", "es", "or", "te", "of", "ed", "is", "it", "al", "ar",
    "st", "to", "nt", "ng", "se", "ha", "as", "ou", "io", "le",
    "ve", "co", "me", "de", "hi", "ri", "ro", "ic", "ne", "ea",
    "ra", "ce", "li", "ch", "ll", "be", "ma", "si", "om", "ur",
    "ca", "el", "ta", "la", "ns", "ge", "ly", "ei", "us", "pe",
    "gl", "oo", "og", "go", "az", "am", "fa", "ce", "ok", "gi",
    "it", "hu", "ub", "wi", "ik", "ki", "yo", "ou", "tu", "ub",
    "mi", "cr", "so", "ft", "ap", "pl", "ne", "et", "fl", "ix",
    "tw", "tr", "sh", "ow", "qu", "un", "ex", "mp", "ac", "eb",
    "bo", "tf", "os", "pp",
])

UNUSUAL_TLDS = frozenset([
    "xyz", "top", "tk", "pw", "club", "cc", "online", "site",
    "work", "click", "link", "gdn", "bid", "stream", "racing",
    "download", "win", "review", "accountant", "science", "date",
    "faith", "party", "trade", "webcam", "loan", "cricket", "ml",
    "ga", "cf", "gq",
])

VOWELS = frozenset("aeiou")
CONSONANTS = frozenset("bcdfghjklmnpqrstvwxyz")


def shannon_entropy(text: str) -> float:
    """Shannon entropy in bits for the given text."""
    if not text:
        return 0.0
    freq = Counter(text)
    length = len(text)
    return round(-sum((c / length) * math.log2(c / length) for c in freq.values()), 2)


def get_sld(hostname: str) -> str:
    """Extract the Second-Level Domain (SLD) from a hostname."""
    parts = hostname.strip().lower().split(".")
    if len(parts) >= 2:
        return parts[-2]
    return parts[0] if parts else ""


def domain_to_features(domain: str) -> list[float]:
    """
    Convert a domain or URL string into a 10-element feature vector.
    Calculated identically across training and inference.
    """
    hostname = domain.strip().lower()
    if "://" in hostname:
        hostname = hostname.split("://", 1)[1]
    hostname = hostname.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    if hostname.startswith("www."):
        hostname = hostname[4:]

    parts = hostname.split(".")
    sld = get_sld(hostname)

    # 1. domainEntropy: Shannon entropy of the SLD
    entropy = shannon_entropy(sld)

    # 2. subdomainCount: Count of subdomains preceding SLD and TLD
    subdomain_count = max(0, len(parts) - 2)

    # 3. digitRatio: Fraction of digits in the SLD
    digits = sum(ch.isdigit() for ch in sld)
    digit_ratio = round(digits / max(1, len(sld)), 3)

    # 4. httpsEnabled: Default 1 (overridden with real value at inference time)
    https_enabled = 1

    # 5. suspiciousKeyword: Word-token boundary check for phishing/C2 keywords
    tokens = re.split(r"[-._0-9]+", hostname)
    suspicious_keyword = 1 if any(t in SUSPICIOUS_KEYWORDS for t in tokens if t) else 0

    # 6. ipOrShortener: Exact host check for IP address or URL shorteners
    is_ip = bool(re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname))
    is_short = any(hostname == s or hostname.endswith("." + s) for s in SHORTENER_DOMAINS)
    ip_or_shortener = 1 if (is_ip or is_short) else 0

    # 7. beaconingScore: SLD structural randomness (bigrams, consonants, vowels, alternation)
    alpha = [ch for ch in sld if ch.isalpha()]
    vowels = sum(1 for ch in alpha if ch in VOWELS)
    vowel_ratio = vowels / max(1, len(alpha))
    vowel_shortage = max(0.0, 0.38 - vowel_ratio) / 0.38

    if len(alpha) >= 2:
        bgs = [alpha[i] + alpha[i + 1] for i in range(len(alpha) - 1)]
        uncommon = sum(1 for bg in bgs if bg not in COMMON_BIGRAMS)
        bigram_rarity = uncommon / len(bgs)
    else:
        bigram_rarity = 0.5

    max_c, cur = 0, 0
    for ch in alpha:
        if ch in CONSONANTS:
            cur += 1
            max_c = max(max_c, cur)
        else:
            cur = 0
    consonant_cluster = max(0.0, (max_c - 2) / max(1, len(alpha) - 2)) if len(alpha) > 2 else 0.0

    trans = sum(1 for i in range(len(alpha) - 1) if (alpha[i] in VOWELS) != (alpha[i + 1] in VOWELS))
    alt = trans / max(1, len(alpha) - 1) if len(alpha) >= 2 else 0.5
    alt_deficiency = max(0.0, 1.0 - alt)

    beaconing_score = round(min(0.98,
        0.35 * bigram_rarity +
        0.35 * consonant_cluster +
        0.15 * vowel_shortage +
        0.15 * alt_deficiency
    ), 3)

    # 8. outboundByteRatio: Scaled by domain length factor and beaconing regularity
    length_factor = min(1.0, len(sld) / 20)
    outbound_byte_ratio = round(
        0.6 + length_factor * 2.5 * beaconing_score + subdomain_count * 0.5 + digit_ratio * 2.0, 2
    )

    # 9. dnsQueryRate: Estimated query rate in req/min
    dns_query_rate = round(5 + entropy * 3.5 + beaconing_score * 35 + digit_ratio * 15, 1)

    # 10. nxdomainRatio: NXDOMAIN error ratio (unusual TLDs and high entropy correlate with DGA)
    tld = parts[-1] if parts else ""
    unusual_tld = 0.20 if tld in UNUSUAL_TLDS else 0.0
    nxdomain_ratio = round(
        min(0.95, 0.02 + unusual_tld + beaconing_score * 0.45 + (0.1 if entropy > 3.2 else 0.0)), 3
    )

    return [
        entropy,
        subdomain_count,
        digit_ratio,
        https_enabled,
        suspicious_keyword,
        ip_or_shortener,
        beaconing_score,
        outbound_byte_ratio,
        dns_query_rate,
        nxdomain_ratio,
    ]


def domain_to_features_dict(domain: str) -> dict[str, float]:
    """Return features as a named dictionary matching FEATURE_NAMES."""
    values = domain_to_features(domain)
    return dict(zip(FEATURE_NAMES, values))
