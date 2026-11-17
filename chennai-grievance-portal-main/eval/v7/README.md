# v7 answer evaluation

- `dev/set.json`: 48 questions for tuning, 8 in each of incident, news, compare, why, follow-up and outside-dashboard; English, Tamil (`ta`) and Tanglish (`tg`). Model-drafted, not checked by a Tamil speaker.
- `holdout/set.json`: 48 more, other places and phrasings, written and hashed (`HASHES.txt`, the LF form) before any tuning or live run; run once, at the end. The runner refuses it if its hash has changed.
- Gold facts are not stored: they are computed by code from the dry-run store at run time (each answer's fact sheet is kept in its result row). The rules per kind are the audit's (`src/lib/thunai/aide7/eval7.live.ts`).
- `*/results/<tag>.json`: one row per question with v7's answer (its sentences, the model, the facts, the lines the checker refused and why, the first-sentence time, the gap search) and v6's answer for the same question (its line and the items v6 read out); `<tag>.audit.json`, `<tag>.judge-<model>.json`, `<tag>.gjudge-<model>.json` beside it. `smoke*.json` are the Gemini smoke tests of 17 Nov (not measurements).

Commands (from `chennai-grievance-portal-main/`; check `node scripts/jarvis6/ledger-left.mjs` first; Claude stays off unless `JARVIS_LIVE_CLAUDE=1`):

```
AIDE7=dry SET=dev JARVIS_AIDE_WEB=0 npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts
AIDE7=run SET=dev TAG=<tag> V6=code LIVE_GAP_MS=20000 npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts
AIDE7=audit SET=dev TAG=<tag> npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts
AIDE7=judge SET=dev TAG=<tag> npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts
AIDE7=gjudge SET=dev TAG=<tag> npx vitest run --config vitest.live.config.ts src/lib/thunai/aide7/eval7.live.ts
```

`V6=code` answers v6 only where its answer is code's (no model); `V6=all` answers every question as v6 did (its planner turns cost Groq); `V6_FROM=<tag>` reuses v6's answers from an earlier run of the same set. `JUDGE_MODEL` and `JUDGE_PROVIDER` (`gemini` or `groq`) pick the judge.
