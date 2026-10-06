"""Multilingual sentence embeddings (intfloat/multilingual-e5-small), cached on disk.

The model reads Tamil and English into one space, so a Tamil headline and an English
headline about the same event land close together. Vectors are cached by text hash,
so only new articles are encoded on each build. If the model is not available the
pipeline carries on without it (character n-grams only).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import numpy as np

from .util import INTEL_DIR, log

MODEL = "intfloat/multilingual-e5-small"
CACHE = INTEL_DIR / "output" / "cache" / "e5_small.npz"
_model = None


def _load():
    global _model
    if _model is not None:
        return _model
    try:
        try:  # antivirus / proxy TLS inspection: verify against the OS certificate store
            import truststore
            truststore.inject_into_ssl()
        except ImportError:
            pass
        os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
        from sentence_transformers import SentenceTransformer
        try:
            _model = SentenceTransformer(MODEL, local_files_only=True)
        except Exception:
            _model = SentenceTransformer(MODEL)
    except Exception as exc:
        log.warning("embeddings unavailable (%s); continuing without them", exc)
        _model = False
    return _model


def encode(texts: list[str], prefix: str = "query: ", cache_path: Path | None = CACHE, prune: bool = False,
           store: list[bool] | None = None) -> np.ndarray | None:
    """L2-normalised vectors, one row per text; None when the model is unavailable.

    cache_path=None encodes without any cache. prune=True keeps only this call's texts in the cache file
    (for record texts that come and go). store[i]=False never writes text i's vector to disk."""
    keys = [hashlib.sha1((prefix + t).encode("utf-8")).hexdigest() for t in texts]
    cache: dict[str, np.ndarray] = {}
    if cache_path is not None and cache_path.exists():
        z = np.load(cache_path, allow_pickle=False)
        cache = dict(zip(z["keys"].tolist(), z["vecs"]))
    todo = [i for i, k in enumerate(keys) if k not in cache]
    fresh: dict[str, np.ndarray] = {}
    if todo:
        m = _load()
        if not m:
            return None
        vecs = m.encode([prefix + texts[i] for i in todo], batch_size=64, normalize_embeddings=True, show_progress_bar=False)
        for i, v in zip(todo, vecs):
            fresh[keys[i]] = v.astype(np.float32)
        log.info("embeddings: encoded %d new texts (%d cached)", len(todo), len(keys) - len(todo))
    vec = {**cache, **fresh}
    if cache_path is not None and (fresh or prune):
        keep = {k for i, k in enumerate(keys) if store is None or store[i]}
        out = {k: v for k, v in vec.items() if (k in keep if prune else (k in cache or k in keep))}
        if out and (fresh.keys() & keep or prune and len(out) != len(cache)):
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            np.savez(cache_path, keys=np.array(list(out.keys())), vecs=np.stack(list(out.values())))
    return np.stack([vec[k] for k in keys]) if keys else np.zeros((0, 384), np.float32)
