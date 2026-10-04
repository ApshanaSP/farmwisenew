"""Compare the current news labels (regex keywords + logistic regression) with the LLM's.

    python scripts/compare_news_labels.py output/eval/news_test_set_llm.csv output/eval/comparison.md

Without hand labels this measures agreement and lists the disagreements to check. Once the
`correct_is_incident (1/0)` and `correct_category` columns are filled in, it also scores both methods.
"""
from __future__ import annotations

import sys

import pandas as pd

GOLD_INC, GOLD_CAT = "correct_is_incident (1/0)", "correct_category"


def pct(a: int, b: int) -> str:
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "n/a"


def main(src: str, dst: str) -> None:
    d = pd.read_csv(src, encoding="utf-8-sig")
    d = d[d["llm_category"].notna()].copy()
    d["cur_inc"] = d["current_is_incident"].astype(int).astype(bool)
    d["llm_inc"] = d["llm_is_incident"].astype(str).str.lower().eq("true")
    # the current pipeline only categorises incidents; compare categories where both call it an incident
    both = d[d.cur_inc & d.llm_inc]
    same_cat = both["current_category"].fillna("OTHER") == both["llm_category"]
    out = [f"# News classification: current method vs LLM ({d['llm_category'].notna().sum()} articles)", "",
           "## Agreement", "",
           "| | Agree |", "|---|---|",
           f"| Is it a Chennai incident? | {pct(int((d.cur_inc == d.llm_inc).sum()), len(d))} |",
           f"| Category (articles both call an incident) | {pct(int(same_cat.sum()), len(both))} |", "",
           "## Incident filter disagreements", "",
           f"- Current says incident, LLM says not: **{int((d.cur_inc & ~d.llm_inc).sum())}**",
           f"- LLM says incident, current missed it: **{int((~d.cur_inc & d.llm_inc).sum())}**", ""]

    sui = d[d["title"].str.contains("தற்கொலை|suicide", case=False, na=False)]
    if len(sui):
        out += ["## Suicide articles", "", "| Current | LLM | Title |", "|---|---|---|"]
        out += [f"| {r.current_category} | {r.llm_category} | {str(r.title)[:90]} |" for r in sui.itertuples()]
        out.append("")

    moved = both[~same_cat].groupby(["current_category", "llm_category"]).size().sort_values(ascending=False).head(15)
    out += ["## Biggest category changes (current -> LLM)", "", "| Current | LLM | Articles |", "|---|---|---|"]
    out += [f"| {a} | {b} | {n} |" for (a, b), n in moved.items()]
    out.append("")

    out += ["## Sample disagreements to check", "", "| Current | LLM (conf) | LLM reason | Title |", "|---|---|---|---|"]
    for r in both[~same_cat].head(25).itertuples():
        out.append(f"| {r.current_category} | {r.llm_category} ({r.llm_confidence:.2f}) | {r.llm_reason} | {str(r.title)[:80]} |")
    out.append("")

    gold = d[d[GOLD_INC].notna() & d[GOLD_INC].astype(str).str.strip().ne("")] if GOLD_INC in d else d.iloc[:0]
    if len(gold):
        g = gold[GOLD_INC].astype(int).astype(bool)
        out += [f"## Accuracy against hand labels ({len(gold)} articles)", "", "| | Current | LLM |", "|---|---|---|",
                f"| Incident filter | {pct(int((gold.cur_inc == g).sum()), len(gold))} | {pct(int((gold.llm_inc == g).sum()), len(gold))} |"]
        gc = gold[g & gold[GOLD_CAT].notna() & gold[GOLD_CAT].astype(str).str.strip().ne("")]
        if len(gc):
            out.append(f"| Category | {pct(int((gc['current_category'].fillna('OTHER') == gc[GOLD_CAT]).sum()), len(gc))} "
                       f"| {pct(int((gc['llm_category'] == gc[GOLD_CAT]).sum()), len(gc))} |")
    else:
        out += ["## Accuracy", "", f"Not scored yet: fill in `{GOLD_INC}` and `{GOLD_CAT}` in the CSV, then run this again."]

    open(dst, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("\n".join(out[:14]))


if __name__ == "__main__":
    main(*sys.argv[1:3])
