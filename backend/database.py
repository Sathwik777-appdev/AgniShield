"""
PostgreSQL Database persistence layer for AgniShield website audits.
Connects to PostgreSQL (running in Docker on port 5432) with automatic local SQLite
failover to guarantee 100% continuous uptime during live presentations.
"""

import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger("agnishield.database")


def _load_dotenv() -> None:
    """Load key=value pairs from project .env without overriding existing env vars."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_USER = os.getenv("PG_USER", "")
PG_PASSWORD = os.getenv("PG_PASSWORD", "")
PG_DB = os.getenv("PG_DB", "agnishield_db")

SQLITE_PATH = Path(__file__).resolve().parent / "agnishield.db"

_PG_ACTIVE = False


def get_pg_connection():
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL, connect_timeout=5)
    if not PG_USER or not PG_PASSWORD:
        raise RuntimeError("DATABASE_URL or PG_USER/PG_PASSWORD not configured; using SQLite fallback.")
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        dbname=PG_DB,
        connect_timeout=2,
    )


def init_db():
    global _PG_ACTIVE
    # 1. Initialize PostgreSQL in Docker
    try:
        conn = get_pg_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS website_audits (
                    id VARCHAR(64) PRIMARY KEY,
                    url TEXT NOT NULL,
                    normalized_url TEXT,
                    safety_score INTEGER NOT NULL,
                    risk_category VARCHAR(32) NOT NULL,
                    c2_verdict VARCHAR(64) NOT NULL,
                    mitre_attack TEXT,
                    https_enabled BOOLEAN DEFAULT FALSE,
                    domain_info JSONB,
                    telemetry JSONB,
                    random_forest JSONB,
                    checklist JSONB,
                    reasons JSONB,
                    is_mock BOOLEAN DEFAULT FALSE,
                    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_audits_url ON website_audits(url);
                CREATE INDEX IF NOT EXISTS idx_audits_risk ON website_audits(risk_category);
                CREATE INDEX IF NOT EXISTS idx_audits_scanned_at ON website_audits(scanned_at DESC);
                ALTER TABLE website_audits ALTER COLUMN mitre_attack TYPE TEXT;
                """
            )
            conn.commit()
        conn.close()
        _PG_ACTIVE = True
        logger.info("Connected to PostgreSQL (Docker container on port 5432).")
    except Exception as e:
        _PG_ACTIVE = False
        logger.warning(f"PostgreSQL not ready, active fallback to SQLite: {e}")

    # 2. Local fallback SQLite schema
    conn_sq = sqlite3.connect(SQLITE_PATH)
    cur_sq = conn_sq.cursor()
    cur_sq.execute(
        """
        CREATE TABLE IF NOT EXISTS scans (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            normalized_url TEXT,
            safety_score INTEGER,
            risk_category TEXT,
            c2_verdict TEXT,
            data_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn_sq.commit()
    conn_sq.close()


def save_scan(scan_result: Dict[str, Any]):
    """Save scan to PostgreSQL (primary) and SQLite (mirror)."""
    global _PG_ACTIVE
    now_iso = scan_result.get("scannedAt") or datetime.now(timezone.utc).isoformat()

    # Try PostgreSQL first
    if _PG_ACTIVE:
        try:
            conn = get_pg_connection()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO website_audits (
                        id, url, normalized_url, safety_score, risk_category,
                        c2_verdict, mitre_attack, https_enabled, domain_info,
                        telemetry, random_forest, checklist, reasons, is_mock, scanned_at
                    ) VALUES (
                        %(id)s, %(url)s, %(normalizedUrl)s, %(safetyScore)s, %(riskCategory)s,
                        %(c2Verdict)s, %(mitreAttack)s, %(httpsEnabled)s, %(domainInfo)s,
                        %(telemetry)s, %(randomForest)s, %(checklist)s, %(reasons)s, %(isMock)s, %(scannedAt)s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        safety_score = EXCLUDED.safety_score,
                        risk_category = EXCLUDED.risk_category,
                        c2_verdict = EXCLUDED.c2_verdict,
                        scanned_at = EXCLUDED.scanned_at;
                    """,
                    {
                        "id": scan_result.get("id"),
                        "url": scan_result.get("url"),
                        "normalizedUrl": scan_result.get("normalizedUrl"),
                        "safetyScore": scan_result.get("safetyScore"),
                        "riskCategory": scan_result.get("riskCategory"),
                        "c2Verdict": scan_result.get("c2Verdict"),
                        "mitreAttack": scan_result.get("mitreAttack"),
                        "httpsEnabled": scan_result.get("httpsEnabled", False),
                        "domainInfo": json.dumps(scan_result.get("domainInfo", {})),
                        "telemetry": json.dumps(scan_result.get("telemetry", {})),
                        "randomForest": json.dumps(scan_result.get("randomForest", {})),
                        "checklist": json.dumps(scan_result.get("checklist", [])),
                        "reasons": json.dumps(scan_result.get("reasons", [])),
                        "isMock": scan_result.get("isMock", False),
                        "scannedAt": now_iso,
                    },
                )
                conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"PG save error, falling back to SQLite: {e}")
            _PG_ACTIVE = False

    # Mirror to SQLite
    try:
        conn_sq = sqlite3.connect(SQLITE_PATH)
        cur_sq = conn_sq.cursor()
        cur_sq.execute(
            """
            INSERT OR REPLACE INTO scans (id, url, normalized_url, safety_score, risk_category, c2_verdict, data_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_result.get("id"),
                scan_result.get("url"),
                scan_result.get("normalizedUrl"),
                scan_result.get("safetyScore"),
                scan_result.get("riskCategory"),
                scan_result.get("c2Verdict"),
                json.dumps(scan_result),
            ),
        )
        conn_sq.commit()
        conn_sq.close()
    except Exception as e:
        logger.error(f"SQLite save error: {e}")


def list_scans(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve audit history from PostgreSQL if active, else SQLite."""
    global _PG_ACTIVE
    if _PG_ACTIVE:
        try:
            conn = get_pg_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT 
                        id, url, normalized_url AS "normalizedUrl",
                        safety_score AS "safetyScore", risk_category AS "riskCategory",
                        c2_verdict AS "c2Verdict", mitre_attack AS "mitreAttack",
                        https_enabled AS "httpsEnabled", domain_info AS "domainInfo",
                        telemetry, random_forest AS "randomForest", checklist,
                        reasons, is_mock AS "isMock", scanned_at AS "scannedAt"
                    FROM website_audits
                    ORDER BY scanned_at DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
            conn.close()
            results = []
            for r in rows:
                d = dict(r)
                if isinstance(d.get("scannedAt"), datetime):
                    d["scannedAt"] = d["scannedAt"].isoformat()
                results.append(d)
            if results:
                return results
        except Exception as e:
            logger.warning(f"PG list error, falling back to SQLite: {e}")
            _PG_ACTIVE = False

    # Fallback to SQLite
    conn_sq = sqlite3.connect(SQLITE_PATH)
    cur_sq = conn_sq.cursor()
    cur_sq.execute("SELECT data_json FROM scans ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cur_sq.fetchall()
    conn_sq.close()
    return [json.loads(r[0]) for r in rows if r[0]]


def get_stats() -> Dict[str, Any]:
    """Calculate dashboard summary directly from database."""
    items = list_scans(limit=1000)
    total = len(items)
    safe = sum(1 for item in items if item.get("riskCategory") == "Safe")
    suspicious = sum(1 for item in items if item.get("riskCategory") == "Suspicious")
    dangerous = sum(1 for item in items if item.get("riskCategory") == "Dangerous")
    return {
        "totalScanned": total,
        "safeCount": safe,
        "suspiciousCount": suspicious,
        "dangerousCount": dangerous,
        "databaseEngine": "PostgreSQL (Docker 5432)" if _PG_ACTIVE else "SQLite Fallback",
        "isDemoData": total == 0,
    }
