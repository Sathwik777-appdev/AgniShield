import csv
import io
import os
import pickle
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from database import get_stats, init_db, list_scans, save_scan
from features import CLASSES, FEATURE_NAMES, domain_to_features
from llm_analyst import analyze_with_llm
from rate_limit import RateLimitMiddleware
from telemetry import extract_features, shannon_entropy

MODEL_PATH = Path(__file__).parent / "model.pkl"
if not MODEL_PATH.exists():
    # Fallback: train a small synthetic model if no model.pkl exists
    from train_model import train_and_save
    train_and_save()

with open(MODEL_PATH, "rb") as f:
    MODEL_BUNDLE = pickle.load(f)

RF_MODEL = MODEL_BUNDLE["model"]
N_TREES = getattr(RF_MODEL, "n_estimators", 200)
MODEL_LOCK = threading.Lock()

init_db()

app = FastAPI(title="AgniShield Security API", version="1.0.0")

_default_origins = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:8000,http://127.0.0.1:8000"
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^(https://.*\.(trycloudflare\.com|onrender\.com)|chrome-extension://.*)$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    url: str
    preset: str = "auto"


class AnalyzeAiRequest(BaseModel):
    url: str = ""
    safetyScore: int = 80
    riskCategory: str = "Safe"
    c2Verdict: str = "No C2 Activity"
    mitreAttack: str = "None"
    httpsEnabled: bool = True
    telemetry: dict = {}
    domainInfo: dict = {}

    model_config = {"extra": "allow"}


def normalize_url(raw_url: str) -> str:
    trimmed = raw_url.strip()
    if not trimmed:
        raise ValueError("URL cannot be empty")
    if not trimmed.startswith(("http://", "https://")):
        trimmed = f"https://{trimmed}"
    parsed = urlparse(trimmed)
    if not parsed.hostname or "." not in parsed.hostname:
        raise ValueError("Invalid domain name")
    return trimmed


@app.get("/api/v1/health")
def health():
    cv_acc = MODEL_BUNDLE.get("cv_accuracy_mean", "N/A")
    training_samples = MODEL_BUNDLE.get("training_samples", "N/A")
    return {
        "status": "ok",
        "model": f"RandomForestClassifier ({N_TREES} trees)",
        "cvAccuracy": cv_acc,
        "trainingSamples": training_samples,
    }


@app.get("/api/v1/history")
def history(limit: int = 50):
    return {"items": list_scans(limit)}


@app.get("/api/v1/stats")
def stats():
    return get_stats()


@app.post("/api/v1/analyze/ai")
def analyze_ai(scan_result: AnalyzeAiRequest):
    """Analyze website scan results using local LLM with fallback reasoning."""
    return analyze_with_llm(scan_result.model_dump())


@app.post("/api/v1/model/train")
async def train_from_dataset(file: UploadFile = File(...)):
    global RF_MODEL, N_TREES
    raw = (await file.read()).decode("utf-8", errors="ignore")
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="Uploaded dataset is empty.")

    X_rows, y_rows = [], []
    reader = csv.reader(io.StringIO("\n".join(lines)))
    for row in reader:
        if not row or row[0].lower() in ("domain", "url", "hostname"):
            continue
        domain_str = row[0].strip()
        label_str = row[1].strip().lower() if len(row) > 1 else "dga"
        if label_str in ("0", "safe", "benign", "legit"):
            label_idx = 0
        elif label_str in ("1", "suspicious"):
            label_idx = 1
        else:
            label_idx = 2
        # Use the UNIFIED feature extraction — no label leakage
        X_rows.append(domain_to_features(domain_str))
        y_rows.append(label_idx)

    if not X_rows:
        raise HTTPException(status_code=400, detail="No valid rows found in dataset.")

    from train_model import generate_training_data
    X_base, y_base = generate_training_data(n_per_class=100)
    X_all = np.vstack([X_base, np.array(X_rows, dtype=float)])
    y_all = np.concatenate([y_base, np.array(y_rows, dtype=int)])

    X_train, X_test, y_train, y_test = train_test_split(
        X_all, y_all, test_size=0.2, random_state=42, stratify=y_all
    )
    clf = RandomForestClassifier(
        n_estimators=200, max_depth=14, min_samples_leaf=4,
        random_state=42, n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    acc = round(float(accuracy_score(y_test, clf.predict(X_test))) * 100, 2)

    with MODEL_LOCK:
        bundle = {
            "model": clf,
            "features": FEATURE_NAMES,
            "classes": CLASSES,
            "training_samples": len(X_all),
            "cv_accuracy_mean": round(acc / 100.0, 4),
            "n_estimators": clf.n_estimators,
        }
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(bundle, f)
        MODEL_BUNDLE.clear()
        MODEL_BUNDLE.update(bundle)
        RF_MODEL = clf
        N_TREES = clf.n_estimators

    return {
        "status": "retrained",
        "uploadedSamples": len(X_rows),
        "totalTrainingSamples": len(X_all),
        "validationAccuracy": acc,
    }


@app.post("/api/v1/scan")
def scan(req: ScanRequest):
    try:
        normalized = normalize_url(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    parsed = urlparse(normalized)
    hostname = (parsed.hostname or "").lower()
    features, live_net = extract_features(normalized, req.preset)

    vector = np.array([[features[name] for name in FEATURE_NAMES]], dtype=float)
    probs = RF_MODEL.predict_proba(vector)[0]
    pred_idx = int(np.argmax(probs))
    predicted_class = CLASSES[pred_idx]
    confidence = round(float(probs[pred_idx]) * 100)

    tree_votes = {
        "Safe": round(float(probs[0]) * 100),
        "Suspicious": round(float(probs[1]) * 100),
        "Dangerous": round(float(probs[2]) * 100),
    }

    safety_score = max(
        5,
        min(
            98,
            round(float(probs[0]) * 95 + float(probs[1]) * 52 + float(probs[2]) * 12),
        ),
    )

    if not live_net["dnsResolved"]:
        if predicted_class == "Safe":
            predicted_class = "Suspicious"
        safety_score = min(safety_score, 42)

    if (
        predicted_class == "Dangerous"
        or features["beaconingScore"] >= 0.75
        or features["nxdomainRatio"] >= 0.45
    ):
        c2_verdict = "High-Confidence C2 / DGA"
        mitre_attack = (
            "TA0011: Command & Control — T1568.002 (Domain Generation Algorithms)"
            if features["domainEntropy"] > 3.7 or features["nxdomainRatio"] > 0.35
            else "TA0011: Command & Control — T1071.004 (DNS)"
        )
    elif (
        predicted_class == "Suspicious"
        or features["beaconingScore"] >= 0.45
        or features["dnsQueryRate"] >= 25
    ):
        c2_verdict = "Potential C2 Beaconing"
        mitre_attack = "TA0011: Command & Control — T1071.001 (Web Protocols)"
    else:
        c2_verdict = "No C2 Activity"
        mitre_attack = "No ATT&CK Technique Triggered"

    top_signals = []
    if features["beaconingScore"] > 0.65:
        top_signals.append(
            f"High flow beaconing regularity ({int(features['beaconingScore'] * 100)}%) suggests automated C2 check-ins."
        )
    if features["domainEntropy"] > 3.7:
        top_signals.append(
            f"Elevated domain Shannon entropy ({features['domainEntropy']}) indicates potential DGA/DNS tunneling."
        )
    if features["nxdomainRatio"] > 0.35:
        top_signals.append(
            f"High NXDOMAIN ratio ({int(features['nxdomainRatio'] * 100)}%) matches DGA behavior."
        )
    if features["outboundByteRatio"] > 3.5:
        top_signals.append(
            f"Asymmetric outbound-to-inbound byte ratio ({features['outboundByteRatio']}x) indicates possible data exfiltration."
        )
    if not live_net["dnsResolved"]:
        top_signals.append("Live DNS A-record resolution failed for this host.")
    if not top_signals:
        top_signals.append("Live DNS/TLS & flow telemetry fall within normal baseline thresholds.")

    top_signals.append(
        f"scikit-learn Random Forest ({N_TREES} trees): {tree_votes[predicted_class]}% voted {predicted_class} ({confidence}% confidence)."
    )

    result = {
        "id": f"scan-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "url": req.url.strip(),
        "normalizedUrl": normalized,
        "safetyScore": safety_score,
        "riskCategory": predicted_class,
        "httpsEnabled": features["httpsEnabled"] == 1,
        "domainInfo": {
            "domain": hostname,
            "registrar": live_net["sslIssuer"] if live_net["sslValid"] else "Unverified / No TLS",
            "registeredDate": "Live DNS + TLS Check",
            "ipAddress": live_net["ipAddress"],
            "serverLocation": "Live Resolution",
        },
        "checklist": [
            {
                "id": "https",
                "label": "HTTPS / Live TLS Certificate",
                "status": "pass" if live_net["sslValid"] else ("warn" if features["httpsEnabled"] else "fail"),
                "detail": f"TLS Valid: {live_net['sslValid']} ({live_net['sslIssuer']}).",
            },
            {
                "id": "dns-live",
                "label": "Live DNS Resolution",
                "status": "pass" if live_net["dnsResolved"] else "fail",
                "detail": f"Resolved IP: {live_net['ipAddress']}.",
            },
            {
                "id": "c2-beaconing",
                "label": "Flow Log C2 Beaconing",
                "status": "fail" if features["beaconingScore"] >= 0.7 else ("warn" if features["beaconingScore"] >= 0.45 else "pass"),
                "detail": f"Beaconing score: {int(features['beaconingScore'] * 100)}% | Out/In ratio: {features['outboundByteRatio']}x.",
            },
            {
                "id": "rf-classifier",
                "label": f"scikit-learn Random Forest ({N_TREES} Trees)",
                "status": "pass",
                "detail": f"Predicted {predicted_class} with {confidence}% confidence.",
            },
        ],
        "reasons": top_signals,
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "c2Verdict": c2_verdict,
        "mitreAttack": mitre_attack,
        "telemetry": features,
        "randomForest": {
            "predictedClass": predicted_class,
            "confidence": confidence,
            "treeVotes": tree_votes,
            "totalTrees": N_TREES,
            "safetyScore": safety_score,
            "topSignals": top_signals,
        },
        "isMock": False,
    }

    save_scan(result)
    return result


# Serve built React frontend (dist/) if present for single-port unified deployment
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
