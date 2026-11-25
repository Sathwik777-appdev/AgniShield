"""
Production DGA & Phishing model trainer for AgniShield.

Reads real DGA parquet datasets (DGArchive), extracts features using the
UNIFIED feature extraction pipeline (features.py), trains a 200-tree
RandomForestClassifier with 5-fold cross-validation, and saves model.pkl.

Usage:
    cd backend
    python3 train_dga_model.py
"""

import pickle
import random
import time
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

from features import CLASSES, FEATURE_NAMES, domain_to_features

# ── Configuration ────────────────────────────────────────────────────────────

DATASET_DIR = Path.home() / "Downloads" / "AgniShield-DGA-Dataset" / "raw_including_TLD"
MODEL_PATH = Path(__file__).parent / "model.pkl"

MAX_BENIGN = 40_000
MAX_DGA = 40_000
MAX_SUSPICIOUS = 10_000

N_ESTIMATORS = 200
MAX_DEPTH = 14
MIN_SAMPLES_LEAF = 4
N_FOLDS = 5
RANDOM_STATE = 42


# ── Synthetic suspicious domains (phishing / credential lures) ───────────────

def generate_suspicious_domains(n: int, seed: int = 42) -> list[str]:
    """Generate realistic phishing/lure domains using real brand names and action keywords."""
    rng = random.Random(seed)

    brands = [
        "paypal", "apple", "microsoft", "amazon", "google", "netflix",
        "chase", "wellsfargo", "bankofamerica", "citibank", "usaa",
        "dropbox", "facebook", "instagram", "twitter", "linkedin",
        "binance", "coinbase", "metamask", "blockchain", "steam",
    ]
    keywords = [
        "login", "verify", "secure", "update", "account", "confirm",
        "signin", "password", "alert", "recover", "support", "help",
        "billing", "validate", "portal", "security",
    ]
    tlds = ["com", "net", "org", "info", "co", "xyz", "online", "site", "top", "live"]
    separators = ["-", "", "."]

    domains = []
    for _ in range(n):
        brand = rng.choice(brands)
        kw = rng.choice(keywords)
        tld = rng.choice(tlds)
        sep = rng.choice(separators)
        variant = rng.randint(0, 5)

        if variant == 0:
            d = f"{kw}{sep}{brand}.{tld}"
        elif variant == 1:
            d = f"{brand}{sep}{kw}.{tld}"
        elif variant == 2:
            d = f"{brand}{sep}{kw}{rng.randint(1, 999)}.{tld}"
        elif variant == 3:
            d = f"{kw}.{brand}-{rng.choice(keywords)}.{tld}"
        elif variant == 4:
            d = f"{brand}.{kw}-{rng.choice(tlds)}.{tld}"
        else:
            d = f"secure-{brand}-{kw}.{tld}"

        domains.append(d)
    return domains


# ── Data Loading ─────────────────────────────────────────────────────────────

def load_parquet_domains(pattern: str, max_samples: int) -> list[str]:
    """Load domain strings from matching parquet files."""
    files = sorted(DATASET_DIR.glob(pattern))
    if not files:
        print(f"  WARNING: No files matching {pattern} in {DATASET_DIR}")
        return []

    all_domains = []
    for f in files:
        table = pq.read_table(f, columns=["domain"])
        domains = table.column("domain").to_pylist()
        all_domains.extend(domains)
        if len(all_domains) >= max_samples * 2:
            break

    rng = np.random.default_rng(RANDOM_STATE)
    if len(all_domains) > max_samples:
        indices = rng.choice(len(all_domains), size=max_samples, replace=False)
        all_domains = [all_domains[i] for i in indices]

    print(f"  Loaded {len(all_domains):,} domains for pattern '{pattern}'")
    return all_domains


def build_dataset() -> tuple[np.ndarray, np.ndarray]:
    """Build the dataset with 3 classes using unified feature extraction."""
    print("=" * 70)
    print("STEP 1: Loading domains from DGArchive parquet files")
    print("=" * 70)

    benign_domains = load_parquet_domains("T*_benign.parquet", MAX_BENIGN)
    dga_domains = load_parquet_domains("T*_dga.parquet", MAX_DGA)
    suspicious_domains = generate_suspicious_domains(MAX_SUSPICIOUS, seed=RANDOM_STATE)
    print(f"  Generated {len(suspicious_domains):,} phishing lure domains")

    print("\n" + "=" * 70)
    print("STEP 2: Extracting 10 features via unified pipeline")
    print("=" * 70)

    X_rows = []
    y_rows = []
    t0 = time.time()

    # 0: Safe (benign)
    for domain in benign_domains:
        try:
            X_rows.append(domain_to_features(domain))
            y_rows.append(0)
        except Exception:
            pass

    # 1: Suspicious (phishing / credential lures)
    for domain in suspicious_domains:
        try:
            X_rows.append(domain_to_features(domain))
            y_rows.append(1)
        except Exception:
            pass

    # 2: Dangerous (DGA / C2)
    for domain in dga_domains:
        try:
            X_rows.append(domain_to_features(domain))
            y_rows.append(2)
        except Exception:
            pass

    elapsed = time.time() - t0
    print(f"  Feature extraction complete: {len(X_rows):,} samples in {elapsed:.1f}s")

    X = np.array(X_rows, dtype=float)
    y = np.array(y_rows, dtype=int)

    for cls_idx, cls_name in enumerate(CLASSES):
        count = int(np.sum(y == cls_idx))
        print(f"    {cls_name}: {count:,}")

    return X, y


# ── Main Training Routine ────────────────────────────────────────────────────

def train():
    X, y = build_dataset()

    print("\n" + "=" * 70)
    print(f"STEP 3: 5-Fold Stratified Cross-Validation ({N_ESTIMATORS} trees)")
    print("=" * 70)

    clf = RandomForestClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_leaf=MIN_SAMPLES_LEAF,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(clf, X, y, cv=skf, scoring="accuracy", n_jobs=-1)

    print(f"  Per-fold accuracy: {[f'{s:.4f}' for s in cv_scores]}")
    print(f"  Mean accuracy:     {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    print("\n" + "=" * 70)
    print("STEP 4: Holdout Test Set Evaluation (80/20)")
    print("=" * 70)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    t0 = time.time()
    clf.fit(X_train, y_train)
    train_time = time.time() - t0
    print(f"  Training time: {train_time:.1f}s")

    y_pred = clf.predict(X_test)
    print("\n  Holdout Classification Report:")
    print(classification_report(y_test, y_pred, target_names=CLASSES, digits=4))

    print("  Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"  {'':>12s}  {'Pred Safe':>10s}  {'Pred Susp':>10s}  {'Pred Dang':>10s}")
    for i, cls_name in enumerate(CLASSES):
        print(f"  {cls_name:>12s}  {cm[i][0]:>10d}  {cm[i][1]:>10d}  {cm[i][2]:>10d}")

    print("\n  Feature Importances:")
    importances = clf.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]
    for idx in sorted_idx:
        print(f"    {FEATURE_NAMES[idx]:<22s}  {importances[idx]:.4f}")

    print("\n" + "=" * 70)
    print("STEP 5: Retrain on Full Dataset and Save model.pkl")
    print("=" * 70)

    clf_final = RandomForestClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        min_samples_leaf=MIN_SAMPLES_LEAF,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    clf_final.fit(X, y)

    bundle = {
        "model": clf_final,
        "features": FEATURE_NAMES,
        "classes": CLASSES,
        "training_samples": len(X),
        "cv_accuracy_mean": round(float(cv_scores.mean()), 4),
        "cv_accuracy_std": round(float(cv_scores.std()), 4),
        "n_estimators": N_ESTIMATORS,
    }

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(bundle, f)

    size_kb = MODEL_PATH.stat().st_size / 1024
    print(f"  Saved {MODEL_PATH}")
    print(f"  Model file size: {size_kb:.1f} KB ({size_kb / 1024:.2f} MB)")
    print(f"  Ensemble trees:  {N_ESTIMATORS}")
    print(f"  CV Accuracy:     {cv_scores.mean() * 100:.2f}% (± {cv_scores.std() * 100:.2f}%)")
    print(f"  Total samples:   {len(X):,}")
    print("=" * 70)


if __name__ == "__main__":
    train()
