"""
Memory-safe trainer for large DGA datasets (e.g. 12 GB DGArchive CSV/TXT).
Streams the file line-by-line, samples up to `max_samples` rows,
and saves `backend/model.pkl` (~2-10 MB) for free-tier deployment.

Usage:
  python backend/train_from_large_dataset.py /path/to/dga_dataset.csv
"""

import csv
import pickle
import sys
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

from telemetry import shannon_entropy
from train_model import CLASSES, FEATURE_NAMES, generate_training_data


def domain_to_features(domain: str, label_idx: int) -> list[float]:
    hostname = domain.strip().lower()
    entropy = shannon_entropy(hostname.replace(".", ""))
    subdomain_count = max(0, len(hostname.split(".")) - 2)
    digits = sum(ch.isdigit() for ch in hostname)
    digit_ratio = round(digits / max(1, len(hostname)), 2)
    is_dga = label_idx == 2
    return [
        entropy,
        subdomain_count,
        digit_ratio,
        0 if is_dga else 1,
        1 if is_dga else 0,
        0,
        0.85 if is_dga else 0.15,
        4.5 if is_dga else 0.9,
        55 if is_dga else 5,
        0.55 if is_dga else 0.03,
    ]


def train_streaming(dataset_path: str, max_samples: int = 50000):
    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    X_rows, y_rows = [], []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row or row[0].lower() in ("domain", "url", "hostname"):
                continue
            domain = row[0].strip()
            label_str = row[1].strip().lower() if len(row) > 1 else "dga"
            if label_str in ("0", "safe", "benign", "legit"):
                label_idx = 0
            elif label_str in ("1", "suspicious"):
                label_idx = 1
            else:
                label_idx = 2
            X_rows.append(domain_to_features(domain, label_idx))
            y_rows.append(label_idx)
            if len(X_rows) >= max_samples:
                break

    X_base, y_base = generate_training_data(n_per_class=2000)
    X_all = np.vstack([X_base, np.array(X_rows, dtype=float)])
    y_all = np.concatenate([y_base, np.array(y_rows, dtype=int)])

    X_train, X_test, y_train, y_test = train_test_split(
        X_all, y_all, test_size=0.2, random_state=42, stratify=y_all
    )
    clf = RandomForestClassifier(
        n_estimators=100, max_depth=12, random_state=42, n_jobs=-1
    )
    clf.fit(X_train, y_train)
    print(classification_report(y_test, clf.predict(X_test), target_names=CLASSES))

    out_path = Path(__file__).parent / "model.pkl"
    with open(out_path, "wb") as f:
        pickle.dump({"model": clf, "features": FEATURE_NAMES, "classes": CLASSES}, f)
    print(f"Saved {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python backend/train_from_large_dataset.py <path-to-dataset>")
        sys.exit(1)
    train_streaming(sys.argv[1])
