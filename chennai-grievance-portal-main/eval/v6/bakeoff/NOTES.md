# v6 model bake-off: the reading (Phase 1)

The numbers are in `TABLE.md` (generated from the `*.json` files here by `src/lib/thunai/bakeoff.live.ts`, 17 Nov 2026, this PC, the existing free keys). Understanding is the shipped planner call (grid cell B) pinned per model through the production gateway on the dev set `eval/holdout/tuning24.jsonl` (12 sentences, 4 EN / 4 TA / 4 Tanglish, seed 20261117); speed is the same prompt streamed in plain JSON mode.

**Every free model the keys list, and what happened:**

| Model | Result |
|---|---|
| Groq `qwen/qwen3.8-27b` | Speed only (understanding quoted from v5's grid cell B on the same dev set, 15 Nov: 12/13 scored). The JSON arrives in one piece: total p50 1,037 / p90 1,050 ms (n 4), two of six calls 429 (8K tokens a minute) |
| Groq `openai/gpt-oss-120b` | Speed only (v5 grid cell B: 15/17). Total p50 1,053 / p90 1,218 ms (n 4), two of six 429 |
| Groq `openai/gpt-oss-20b` | Not run: the ledger held 1,894 of 200,000 tokens for the day (v5's last runs). v5 grid cell B: 9/14 |
| Groq `openai/gpt-oss-safeguard-20b` | One probe call: 413 "Request too large" (the free tier's per-minute allowance for this model is below one planner prompt) |
| Groq `allam-2-7b` | 400 on every call: no `json_schema` structured output; 4,096-token context |
| Gemini `gemini-3.5-flash-lite` (today's last rung) | 11/12 scored right (EN 4/4, TA 4/4, Tanglish 3/4); planner call p50 1,960 / p90 3,062 ms (n 12, all ok); streamed TTFT p50 1,273 ms |
| Gemini `gemini-3.1-flash-lite` | 11/11 scored (one call failed); planner call p50 2,088 / p90 3,814 ms; TTFT p50 1,482 ms |
| Gemini `gemini-2.5-flash-lite` | 404: "no longer available to new users" |
| Gemini `gemma-4-26b-a4b-it` | Through the gateway 400 "Thinking level is not supported for this model"; streamed: 503 "high demand", 11.7 s |
| Gemini `gemma-4-31b-it` | One probe: 503 "high demand" after 39 s |

**Choice (understanding first, within the latency budget):** no free model is both faster than Groq's and as right. The ladder stays Groq first (qwen, then gpt-oss-120b, then gpt-oss-20b by what is left), Gemini 3.5 flash-lite last; Gemini 3.1 flash-lite is as right on these 11-12 sentences but slower, so it is not added in front. **The fast path is code, not a smaller model:** turns the code lanes answer need no model at all (Phase 0: they handed the answer at 0.9-1.6 s against 2.2-5.0 s for planner turns), so v6 widens those lanes (Phase 5) rather than adding a small model. Haiku 5.5 is not measured live (no live Claude call; its path is tested with mocks and the deploy check).

**Not verified:** n is small (4-12 a model); Tamil and Tanglish are 4 sentences each; the Groq models' understanding is v5's 15 Nov grid, not re-run today (quota).
