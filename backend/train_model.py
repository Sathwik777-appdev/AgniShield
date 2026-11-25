"""
Train a scikit-learn RandomForestClassifier for AgniShield C2 & Phishing Detection.
Fallback trainer using synthetic data — used only when no real DGA dataset is available.
"""

import pickle
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

from features import FEATURE_NAMES, CLASSES


def generate_training_data(n_per_class: int = 400, seed: int = 42):
    rng = np.random.default_rng(seed)
    X_list, y_list = [], []

    # 0: Safe traffic
    for _ in range(n_per_class):
        X_list.append([
            rng.uniform(2.2, 3.5),   # domainEntropy
            rng.integers(0, 2),      # subdomainCount
            rng.uniform(0.0, 0.1),   # digitRatio
            1,                       # httpsEnabled
            0,                       # suspiciousKeyword
            0,                       # ipOrShortener
            rng.uniform(0.15, 0.40), # beaconingScore (domain-derived proxy)
            rng.uniform(0.5, 2.0),   # outboundByteRatio (domain-derived proxy)
            rng.uniform(10, 22),     # dnsQueryRate (domain-derived proxy)
            rng.uniform(0.02, 0.15), # nxdomainRatio (domain-derived proxy)
        ])
        y_list.append(0)

    # 1: Suspicious traffic
    for _ in range(n_per_class):
        X_list.append([
            rng.uniform(3.0, 3.8),   # domainEntropy
            rng.integers(0, 3),      # subdomainCount
            rng.uniform(0.0, 0.15),  # digitRatio
            rng.choice([0, 1], p=[0.35, 0.65]),
            1,                       # suspiciousKeyword (always has phishing word)
            rng.choice([0, 1], p=[0.8, 0.2]),
            rng.uniform(0.30, 0.55), # beaconingScore
            rng.uniform(1.5, 3.5),   # outboundByteRatio
            rng.uniform(18, 32),     # dnsQueryRate
            rng.uniform(0.08, 0.30), # nxdomainRatio
        ])
        y_list.append(1)

    # 2: Dangerous / C2 / DGA traffic
    for _ in range(n_per_class):
        X_list.append([
            rng.uniform(3.2, 4.5),   # domainEntropy
            rng.integers(0, 3),      # subdomainCount
            rng.uniform(0.0, 0.25),  # digitRatio
            1,                       # httpsEnabled (can be either)
            0,                       # suspiciousKeyword (DGA domains don't have keywords)
            0,                       # ipOrShortener
            rng.uniform(0.50, 0.85), # beaconingScore (high bigram anomaly)
            rng.uniform(1.5, 3.5),   # outboundByteRatio
            rng.uniform(18, 32),     # dnsQueryRate
            rng.uniform(0.15, 0.55), # nxdomainRatio (high for DGA TLDs)
        ])
        y_list.append(2)

    return np.array(X_list, dtype=float), np.array(y_list, dtype=int)


def train_and_save():
    X, y = generate_training_data()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=14,
        min_samples_leaf=5,
        random_state=42,
        n_jobs=-1,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    print("AgniShield Random Forest Evaluation (synthetic fallback):")
    print(classification_report(y_test, y_pred, target_names=CLASSES))

    out_path = Path(__file__).parent / "model.pkl"
    with open(out_path, "wb") as f:
        pickle.dump({
            "model": clf,
            "features": FEATURE_NAMES,
            "classes": CLASSES,
            "training_samples": len(X),
            "n_estimators": clf.n_estimators,
        }, f)
    print(f"Saved trained model to {out_path}")


if __name__ == "__main__":
    train_and_save()
