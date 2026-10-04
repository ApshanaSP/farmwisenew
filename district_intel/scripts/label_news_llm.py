"""Label news articles with an LLM (Groq), for evaluation and as SetFit training data.

    python scripts/label_news_llm.py output/eval/news_test_set.csv output/eval/news_test_set_llm.csv

Reads GROQ_API_KEY from district_intel/.env (that key is for this news work only). Sends articles in
small batches with a strict JSON schema; every answer is cached in output/eval/llm_cache.jsonl, so a
re-run (or a run stopped by the free tier's rate limit) resumes without paying for the same article twice.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd
import requests
import yaml
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
MODEL = "openai/gpt-oss-120b"
BATCH = 5
CACHE = ROOT / "output" / "eval" / "llm_cache.jsonl"
URL = "https://api.groq.com/openai/v1/chat/completions"

# categories the current taxonomy lacks (proposed; evaluated before they are added to categories.yaml)
NEW_CATS = {
    "SUICIDE_SELF_HARM": "Suicide, attempted suicide or self-harm (not a crime by someone else)",
    "FIRE_EXPLOSION": "Fire, blaze, cylinder or other explosion",
    "CRIMES_AGAINST_WOMEN": "Sexual assault, harassment, dowry or domestic violence against women and girls",
}
REPORT_TYPES = ["incident", "crime", "civic_complaint", "service_notice", "announcement", "court", "politics",
                "entertainment_sport", "business", "opinion_feature", "other"]


def taxonomy() -> dict[str, str]:
    cats = yaml.safe_load((ROOT / "reference" / "categories.yaml").read_text(encoding="utf-8"))
    cats = cats if isinstance(cats, list) else cats.get("categories", cats)
    out = {c["code"]: c["label"] for c in cats}
    out["CRIME_VIOLENT"] = "Violent crime: murder, assault, attack, stabbing (by another person)"
    out.update(NEW_CATS)
    return out


def system_prompt(cats: dict[str, str]) -> str:
    lines = "\n".join(f"- {k}: {v}" for k, v in cats.items())
    return f"""You classify news articles for the Chennai District Collector's dashboard. Articles are in English or Tamil.
For each article decide:
- is_chennai_incident: true only for a specific event or problem that happened in Chennai district (Greater Chennai
  Corporation area) and that a government department may need to act on: an accident, crime, death, fire, flooding,
  disease, civic failure, residents' complaint, protest. False for announcements, schemes, inaugurations, politics,
  court proceedings, opinion, features, business, sport, film, statewide or national news, and events outside Chennai.
- report_type: one of {", ".join(REPORT_TYPES)}.
- category: the single best code from the list below, by meaning (read Tamil carefully: தற்கொலை is suicide, not
  murder). Use OTHER when nothing fits. Give a category even when is_chennai_incident is false.
- confidence: 0 to 1, how sure you are of the category.
- reason: at most 12 words, in English.

Categories:
{lines}"""


def schema(cats: list[str]) -> dict:
    item = {
        "type": "object", "additionalProperties": False,
        "required": ["id", "is_chennai_incident", "report_type", "category", "confidence", "reason"],
        "properties": {
            "id": {"type": "string"},
            "is_chennai_incident": {"type": "boolean"},
            "report_type": {"type": "string", "enum": REPORT_TYPES},
            "category": {"type": "string", "enum": cats},
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
    }
    return {"type": "object", "additionalProperties": False, "required": ["items"],
            "properties": {"items": {"type": "array", "items": item}}}


def call(key: str, system: str, sch: dict, batch: pd.DataFrame) -> list[dict]:
    articles = "\n\n".join(f"[id {r.doc_id}] {r.title}\n{str(r.summary or '')[:220]}" for r in batch.itertuples())
    body = {"model": MODEL, "temperature": 0, "reasoning_effort": "low", "max_tokens": 2500,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": f"Classify these articles:\n\n{articles}"}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "labels", "strict": True, "schema": sch}}}
    for attempt in range(6):
        r = requests.post(URL, headers={"Authorization": f"Bearer {key}"}, json=body, timeout=120)
        if r.status_code == 429:  # free tier: tokens per minute
            wait = float(r.headers.get("retry-after", 20)) + 1
            print(f"  rate limited, waiting {wait:.0f}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code >= 500:
            time.sleep(10)
            continue
        r.raise_for_status()
        return json.loads(r.json()["choices"][0]["message"]["content"])["items"]
    raise RuntimeError("Groq kept refusing the request")


def main(src: str, dst: str) -> None:
    key = (dotenv_values(ROOT / ".env").get("GROQ_API_KEY") or "").strip()
    if not key:
        sys.exit("GROQ_API_KEY is empty in district_intel/.env")
    cats = taxonomy()
    system, sch = system_prompt(cats), schema(list(cats))
    df = pd.read_csv(src, encoding="utf-8-sig")
    done: dict[str, dict] = {}
    if CACHE.exists():
        for line in CACHE.read_text(encoding="utf-8").splitlines():
            x = json.loads(line)
            done[x["id"]] = x
    todo = df[~df["doc_id"].isin(done)]
    print(f"{len(df)} articles, {len(done)} cached, {len(todo)} to label with {MODEL}", flush=True)
    t0 = time.time()
    with CACHE.open("a", encoding="utf-8") as f:
        for i in range(0, len(todo), BATCH):
            batch = todo.iloc[i:i + BATCH]
            for x in call(key, system, sch, batch):
                if x["id"] in set(batch["doc_id"]):
                    x["model"] = MODEL
                    done[x["id"]] = x
                    f.write(json.dumps(x, ensure_ascii=False) + "\n")
            f.flush()
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)} ({time.time() - t0:.0f}s)", flush=True)
    lab = pd.DataFrame(done.values()).rename(columns={"id": "doc_id", "is_chennai_incident": "llm_is_incident", "report_type": "llm_report_type",
                                                      "category": "llm_category", "confidence": "llm_confidence", "reason": "llm_reason"})
    out = df.merge(lab.drop(columns=["model"], errors="ignore"), on="doc_id", how="left")
    out.to_csv(dst, index=False, encoding="utf-8-sig")
    print(f"wrote {dst}: {out['llm_category'].notna().sum()} labelled")


if __name__ == "__main__":
    main(*sys.argv[1:3])
