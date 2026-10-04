"""Local-first news classifier: word TF-IDF + character n-gram TF-IDF + logistic regression, one head per question
(is it about Chennai? an actionable incident? which report type? which category?).

CPU friendly (trains in seconds, predicts thousands of articles a second), explainable (the weights are per word and
per character n-gram), and multilingual without translation: word features keep whole Tamil words apart (தற்கொலை,
suicide, is a different feature from கொலை, murder), while character n-grams within words absorb spelling variation.

Training data: SILVER = the LLM's labels (newsllm cache; a teacher, not ground truth), GOLD = hand-checked labels
(output/eval/news_test_set.csv columns `correct_is_incident (1/0)` and `correct_category`, when filled). Gold rows are
weighted higher and are never used to test a model they trained. Low-confidence articles go to the LLM (cascade);
its answers are cached and become silver labels for the next training round (active learning).

    python run_pipeline.py train-news-local      # seconds
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from .util import log

HEADS = ["category", "report_type", "is_incident", "in_chennai"]
TOKEN = r"(?u)[a-z0-9஀-௿]{2,}"


def normalize(title, summary) -> str:
    t = f"{title or ''}. {str(summary or '')[:300]}"
    t = unicodedata.normalize("NFC", t).lower()
    t = re.sub(r"https?://\S+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


class LocalModel:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.vec = None
        self.heads: dict = {}
        self.meta: dict = {}

    @property
    def exists(self) -> bool:
        return (self.path / "model.joblib").exists()

    def load(self) -> "LocalModel":
        import joblib

        obj = joblib.load(self.path / "model.joblib")
        self.vec, self.heads = obj["vec"], obj["heads"]
        self.meta = json.loads((self.path / "meta.json").read_text(encoding="utf-8"))
        return self

    def features(self, texts: list[str]):
        from scipy.sparse import hstack

        return hstack([self.vec["word"].transform(texts), self.vec["char"].transform(texts)]).tocsr()

    def predict(self, docs: pd.DataFrame) -> pd.DataFrame:
        X = self.features([normalize(t, s) for t, s in zip(docs["title"], docs["summary"])])
        out = pd.DataFrame({"doc_id": docs["doc_id"].to_numpy()})
        for name, clf in self.heads.items():
            P = clf.predict_proba(X)
            best = P.argmax(axis=1)
            out[name] = clf.classes_[best]
            out[f"{name}_conf"] = P[np.arange(len(best)), best].round(3)
        out["confidence"] = out["category_conf"]
        for b in ("is_incident", "in_chennai"):
            out[b] = out[b].astype(str).str.lower().isin(["true", "1"])
        return out


class _Const:
    """A head whose training labels all agree (a small or one-sided training set): it predicts that label."""

    def __init__(self, value: str) -> None:
        self.classes_ = np.array([value])

    def predict_proba(self, X):
        return np.ones((X.shape[0], 1))


def _fit(texts: list[str], y: dict[str, list], weights: np.ndarray, C: float = 4.0):
    from scipy.sparse import hstack
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    vec = {"word": TfidfVectorizer(analyzer="word", token_pattern=TOKEN, ngram_range=(1, 2), min_df=1, sublinear_tf=True, max_features=120_000),
           "char": TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True, max_features=200_000)}
    X = hstack([vec["word"].fit_transform(texts), vec["char"].fit_transform(texts)]).tocsr()
    heads = {}
    for h in HEADS:
        labels = [str(v) for v in y[h]]
        heads[h] = (LogisticRegression(max_iter=4000, C=C, class_weight="balanced").fit(X, labels, sample_weight=weights)
                    if len(set(labels)) > 1 else _Const(labels[0]))
    return vec, heads


def _scores(true: list[str], pred: list[str]) -> dict:
    from sklearn.metrics import accuracy_score, precision_recall_fscore_support

    p, r, f, _ = precision_recall_fscore_support(true, pred, average="macro", zero_division=0)
    return {"accuracy": round(float(accuracy_score(true, pred)), 3), "macro_precision": round(float(p), 3), "macro_recall": round(float(r), 3),
            "macro_f1": round(float(f), 3), "n": len(true)}


def _gold(settings) -> pd.DataFrame:
    p = Path(settings.out_dir) / "eval" / "news_test_set.csv"
    if not p.exists():
        return pd.DataFrame(columns=["doc_id", "is_incident", "category"])
    g = pd.read_csv(p, encoding="utf-8-sig")
    inc, cat = "correct_is_incident (1/0)", "correct_category"
    g = g[g[inc].notna() & (g[inc].astype(str).str.strip() != "")] if inc in g else g.iloc[:0]
    return pd.DataFrame({"doc_id": g["doc_id"], "is_incident": g[inc].astype(int).astype(bool) if len(g) else [],
                         "category": g[cat] if cat in g else None})


def train(settings, labels: pd.DataFrame, docs: pd.DataFrame, held_out: list[str], fair_ids: set[str] | None = None) -> dict:
    """Fit on silver (+ gold) labels outside `held_out`, test on `held_out` (the same articles SetFit was tested on),
    save the production model, and return the evaluation."""
    import joblib

    t0 = time.time()
    d = labels.merge(docs[["doc_id", "title", "summary"]], on="doc_id", how="inner").drop_duplicates("doc_id")
    d["text"] = [normalize(t, s) for t, s in zip(d["title"], d["summary"])]
    gold = _gold(settings)
    d["w"] = np.where(d["doc_id"].isin(gold["doc_id"]), 3.0, 1.0)
    test = d[d["doc_id"].isin(held_out)]
    train_all = d[~d["doc_id"].isin(held_out)]
    report: dict = {"silver_labels": int(len(d)), "gold_labels": int(len(gold)), "held_out": int(len(test))}

    def evaluate(tr: pd.DataFrame, tag: str):
        vec, heads = _fit(tr["text"].tolist(), {h: tr[h].tolist() for h in HEADS}, tr["w"].to_numpy())
        m = LocalModel(Path("."))
        m.vec, m.heads = vec, heads
        X = m.features(test["text"].tolist())
        res = {"trained_on": int(len(tr))}
        for h in HEADS:
            P = heads[h].predict_proba(X)
            pred = heads[h].classes_[P.argmax(axis=1)]
            res[h] = _scores([str(v) for v in test[h]], [str(v) for v in pred])
            if h == "category":
                conf = P.max(axis=1)
                ok = pred == test[h].astype(str).to_numpy()
                res["category_by_confidence"] = [{"min_confidence": t, "share": round(float((conf >= t).mean()), 3),
                                                  "accuracy": round(float(ok[conf >= t].mean()), 3) if (conf >= t).any() else None}
                                                 for t in (0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)]
        report[tag] = res
        return vec, heads

    if fair_ids is not None:  # the same training labels SetFit had, for a like-for-like comparison
        evaluate(train_all[train_all["doc_id"].isin(fair_ids)], "fair_vs_setfit")
    evaluate(train_all, "all_silver")
    # the production model: every label (the held-out ones too)
    vec, heads = _fit(d["text"].tolist(), {h: d[h].tolist() for h in HEADS}, d["w"].to_numpy())
    out = Path(settings.out_dir) / "models" / "news_local"
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"vec": vec, "heads": heads}, out / "model.joblib")
    # the cascade's trust level: the lowest confidence at which held-out category accuracy reaches 90%
    table = report["all_silver"]["category_by_confidence"]
    trust = next((r["min_confidence"] for r in table if r["accuracy"] is not None and r["accuracy"] >= 0.9), 0.9)
    report.update({"suggested_trust": trust, "trained_at": time.strftime("%Y-%m-%d %H:%M"), "runtime_s": round(time.time() - t0, 1),
                   "features": "word 1-2 gram TF-IDF + char_wb 2-5 gram TF-IDF", "model": "logistic regression (balanced)"})
    (out / "meta.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    log.info("train-news-local: %s", {k: report[k] for k in ("silver_labels", "held_out", "suggested_trust", "runtime_s")})
    return report
