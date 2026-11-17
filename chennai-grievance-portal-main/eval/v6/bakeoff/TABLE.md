# v6 model bake-off (Phase 1)

From `eval/v6/bakeoff/*.json` (src/lib/thunai/bakeoff.live.ts), this PC, the existing free keys. Understanding: the shipped planner call (grid cell B) pinned to one model through the production gateway on the dev set `eval/holdout/tuning24.jsonl`; right = kind and recipe match gold; scored only where the model gave a plan (a 429, a strict-mode 400 with no usable draft, a timeout or an error is its own outcome). Speed: the same prompt streamed in plain JSON mode; TTFT = first content token; tok/s after the first token. n · p50 · p90.

| Model | Right (scored) | EN | TA | Tanglish | Outcomes | Planner call ms | TTFT ms | Total ms | Output tok/s |
|---|---|---|---|---|---|---|---|---|---|
| groq/allam-2-7b | - | - | - | - | error 12 | 12 · 362 · 438 | - | 6 · 256 · 650 | - |
| gemini/gemini-2.5-flash-lite | - | - | - | - | error 12 | 12 · 395 · 467 | - | 6 · 409 · 490 | - |
| gemini/gemini-3.1-flash-lite | 11/11 (74.1-100.0 %) | 3/3 | 4/4 | 4/4 | ok 1, error 11 | 12 · 2088 · 3814 | 6 · 1482 · 9731 | 6 · 2505 · 10471 | 6 · 447.7 · 591.9 |
| gemini/gemini-3.5-flash-lite | 11/12 (64.6-98.5 %) | 4/4 | 4/4 | 3/4 | ok 12 | 12 · 1960 · 3062 | 6 · 1273 · 9584 | 6 · 1750 · 9930 | 6 · 405.5 · 569.6 |
| gemini/gemma-4-26b-a4b-it | - | - | - | - | error 12 | 12 · 611 · 758 | - | 6 · 11668 · 11953 | - |
| groq/openai/gpt-oss-120b | - | - | - | - | - | - | 4 · 1096 · 1217 | 6 · 1053 · 1218 | - |
| groq/qwen/qwen3.8-27b | - | - | - | - | - | - | 4 · 1037 · 1049 | 6 · 1037 · 1050 | - |
