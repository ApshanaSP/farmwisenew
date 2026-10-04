"""Local news classifier: SetFit on intfloat/multilingual-e5-base, trained on the LLM's labels.

SetFit in two steps: (1) contrastive fine-tuning of a sentence-embedding model on pairs of articles (same
category -> similar, different category -> dissimilar), so the embedding space separates the categories by
meaning in Tamil and English alike; (2) small logistic-regression heads on the fine-tuned embeddings, one per
output: category, report type, is it an incident, is it in Chennai. The method is implemented here directly with
sentence-transformers and torch (the setfit package needs pyarrow, which Smart App Control blocks on this PC).

The LLM is the teacher: its cached labels (newsllm.classify) are the training set. The model labels every
article the LLM has not reached, so the dashboard keeps working without the API.

    python run_pipeline.py train-news      # about 10-20 minutes on a laptop CPU
"""
from __future__ import annotations

import json
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .util import log

HEADS = {"category": "category", "report_type": "report_type", "is_incident": "is_incident", "in_chennai": "in_chennai"}


def _text(title, summary) -> str:
    return f"{title or ''}. {str(summary or '')[:300]}".strip()


class NewsModel:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.model = None
        self.heads: dict = {}
        self.meta: dict = {}

    @property
    def exists(self) -> bool:
        return (self.path / "heads.joblib").exists()

    def load(self) -> "NewsModel":
        import joblib
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(str(self.path / "body"), device="cpu")
        self.heads = joblib.load(self.path / "heads.joblib")
        self.meta = json.loads((self.path / "meta.json").read_text(encoding="utf-8"))
        return self

    def encode(self, texts: list[str]) -> np.ndarray:
        return self.model.encode(["query: " + t for t in texts], batch_size=32, normalize_embeddings=True, show_progress_bar=False)

    def predict_cached(self, docs: pd.DataFrame, cache: Path) -> pd.DataFrame:
        """predict(), remembering answers per article and model version: an hourly build reads only new articles."""
        version = self.meta.get("trained_at", "")
        seen: dict[str, dict] = {}
        if cache.exists():
            for line in cache.read_text(encoding="utf-8").splitlines():
                try:
                    x = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if x.get("v") == version:
                    seen[x["doc_id"]] = x
        todo = docs[~docs["doc_id"].isin(seen)]
        if len(todo):
            new = self.predict(todo)
            cache.parent.mkdir(parents=True, exist_ok=True)
            with cache.open("a", encoding="utf-8") as f:
                for r in new.to_dict("records"):
                    r = {**r, "v": version, "is_incident": bool(r["is_incident"]), "in_chennai": bool(r["in_chennai"]),
                         "confidence": float(r["confidence"])}
                    seen[r["doc_id"]] = r
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            log.info("news: SetFit read %d new articles (%d remembered)", len(todo), len(docs) - len(todo))
        out = pd.DataFrame([seen[i] for i in docs["doc_id"]]).drop(columns=["v"])
        return out

    def predict(self, docs: pd.DataFrame) -> pd.DataFrame:
        X = self.encode([_text(t, s) for t, s in zip(docs["title"], docs["summary"])])
        out = pd.DataFrame({"doc_id": docs["doc_id"].to_numpy()})
        for name, clf in self.heads.items():
            P = clf.predict_proba(X)
            best = P.argmax(axis=1)
            out[name] = clf.classes_[best]
            if name == "category":
                out["confidence"] = P[np.arange(len(best)), best].round(3)
        for b in ("is_incident", "in_chennai"):
            out[b] = out[b].astype(bool)
        return out


def train(settings, labels: pd.DataFrame, docs: pd.DataFrame, base: str = "intfloat/multilingual-e5-base",
          pairs_per_text: int = 4, epochs: int = 1, seed: int = 7) -> dict:
    """Fine-tune `base` on the LLM labels (contrastive pairs on category), fit the heads, save, report held-out agreement."""
    import joblib
    import torch
    from sentence_transformers import SentenceTransformer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split

    t0 = time.time()
    rng = random.Random(seed)
    torch.manual_seed(seed)
    d = labels.merge(docs[["doc_id", "title", "summary"]], on="doc_id", how="inner").drop_duplicates("doc_id")
    d["text"] = [_text(t, s) for t, s in zip(d["title"], d["summary"])]
    # categories with too few examples cannot be learned or tested; they stay with the LLM
    counts = d["category"].value_counts()
    d = d[d["category"].isin(counts[counts >= 4].index)].reset_index(drop=True)
    tr, te = train_test_split(d, test_size=0.2, random_state=seed, stratify=d["category"])
    log.info("train-news: %d labelled articles (%d train, %d held out), %d categories, base %s", len(d), len(tr), len(te), d["category"].nunique(), base)

    model = SentenceTransformer(base, device="cpu")
    model.max_seq_length = 128
    # Fits a 8 GB laptop: the vocabulary table (about 70% of the weights) and the lower layers stay frozen;
    # only the top layers, which carry the meaning, are fine-tuned. Full fine-tuning needs 4-5 GB of free memory.
    enc_model = model[0].auto_model
    for p in enc_model.embeddings.parameters():
        p.requires_grad = False
    layers = enc_model.encoder.layer
    for layer in layers[: len(layers) // 2]:
        for p in layer.parameters():
            p.requires_grad = False
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    log.info("train-news: fine-tuning %d of %d weights (top %d of %d layers)", trainable, sum(p.numel() for p in model.parameters()),
             len(layers) - len(layers) // 2, len(layers))
    # (1) contrastive pairs: for every text, positives from its category and negatives from others
    by_cat = tr.groupby("category")["text"].apply(list).to_dict()
    texts, cats = tr["text"].tolist(), tr["category"].tolist()
    pairs = []
    for t, c in zip(texts, cats):
        for _ in range(pairs_per_text // 2):
            same = by_cat[c]
            if len(same) > 1:
                pairs.append((t, rng.choice([x for x in same if x is not t] or same), 1.0))
            other = rng.choice([k for k in by_cat if k != c])
            pairs.append((t, rng.choice(by_cat[other]), 0.0))
    rng.shuffle(pairs)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=3e-5)
    model.train()
    bs, steps = 8, 0
    for ep in range(epochs):
        for i in range(0, len(pairs), bs):
            b = pairs[i:i + bs]
            fa = model.tokenize(["query: " + x[0] for x in b])
            fb = model.tokenize(["query: " + x[1] for x in b])
            ea = model(fa)["sentence_embedding"]
            eb = model(fb)["sentence_embedding"]
            sim = torch.nn.functional.cosine_similarity(ea, eb)
            loss = torch.nn.functional.mse_loss(sim, torch.tensor([x[2] for x in b], dtype=sim.dtype))
            opt.zero_grad()
            loss.backward()
            opt.step()
            steps += 1
            if steps % 50 == 0:
                log.info("train-news: step %d/%d, loss %.4f (%.0f s)", steps, epochs * ((len(pairs) + bs - 1) // bs), loss.item(), time.time() - t0)
    model.eval()

    # (2) heads on the fine-tuned embeddings
    enc = lambda xs: model.encode(["query: " + x for x in xs], batch_size=32, normalize_embeddings=True, show_progress_bar=False)
    Xtr, Xte = enc(tr["text"].tolist()), enc(te["text"].tolist())
    heads, report = {}, {}
    for name, col in HEADS.items():
        ytr = tr[col].astype(str) if col not in ("is_incident", "in_chennai") else tr[col].astype(bool)
        yte = te[col].astype(str) if col not in ("is_incident", "in_chennai") else te[col].astype(bool)
        clf = LogisticRegression(max_iter=3000, C=4.0, class_weight="balanced").fit(Xtr, ytr)
        heads[name] = clf
        report[f"{name}_agreement_with_llm"] = round(float((clf.predict(Xte) == yte.to_numpy()).mean()), 3)

    # for the cascade: how often the category agrees with the LLM above each confidence, and how many articles that covers
    P = heads["category"].predict_proba(Xte)
    pred, conf = heads["category"].classes_[P.argmax(axis=1)], P.max(axis=1)
    ok = pred == te["category"].astype(str).to_numpy()
    report["by_confidence"] = [{"min_confidence": t, "share_of_articles": round(float((conf >= t).mean()), 3),
                                "agreement_with_llm": round(float(ok[conf >= t].mean()), 3) if (conf >= t).any() else None}
                               for t in (0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)]
    report["by_category"] = {c: {"held_out": int((te["category"] == c).sum()),
                                 "found": round(float(ok[(te["category"] == c).to_numpy()].mean()), 3)}
                             for c in sorted(te["category"].unique())}
    report["test_texts"] = te[["doc_id", "category"]].assign(predicted=pred, confidence=conf.round(3)).to_dict("records")

    out = Path(settings.out_dir) / "models" / "news_setfit"
    out.mkdir(parents=True, exist_ok=True)
    model.save(str(out / "body"))
    joblib.dump(heads, out / "heads.joblib")
    meta = {"base": base, "trained_at": time.strftime("%Y-%m-%d %H:%M"), "train": len(tr), "held_out": len(te),
            "categories": sorted(d["category"].unique().tolist()), "pairs": len(pairs), "steps": steps,
            "runtime_s": round(time.time() - t0), **report}
    tests = meta.pop("test_texts")
    (out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    pd.DataFrame(tests).to_csv(out / "held_out_predictions.csv", index=False, encoding="utf-8-sig")
    log.info("train-news: done in %d s; category agreement with the LLM %s", meta["runtime_s"], meta["category_agreement_with_llm"])
    return meta
