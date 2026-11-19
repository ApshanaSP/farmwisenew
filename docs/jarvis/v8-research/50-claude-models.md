# 50 · Claude Sonnet 5.5 and Haiku 5.5 for the planner and the writer; which model a turn gets

Research for Jarvis v8, 18 Nov 2026. No model API was called for this note. Legend: **(B-skill)** read in the bundled `claude-api` skill reference (Anthropic's cached docs digest, model table dated 2026-11-03; re-fetch the live pages before quoting prices to the owner). **(P)** project fact (code in `src/lib/ai/claude.ts`, `src/lib/ai/claudebudget.ts`, `src/lib/thunai/llm.ts`). **(M)** my inference.

## The two models

| | Claude Haiku 5.5 | Claude Sonnet 5.5 |
|---|---|---|
| Model id | `claude-haiku-5-5` (B-skill) | `claude-sonnet-5-5` (B-skill) |
| Price per million tokens, input / output | US$0.10 / 0.50 up to 100K-token prompts; 0.50 / 2.50 beyond (B-skill) | US$2 / 10; cache reads 0.10, 5-minute cache writes 2.50 (B-skill) |
| Thinking off | `thinking: {type: "disabled"}`, allowed at effort `high` or below (B-skill) | `disabled` is a **400**; the thinking-off setting is `{type: "between_tools"}` (no other field, effort `high` or below), or adaptive thinking at effort `low` (B-skill) |
| Sampling parameters | non-default `temperature`/`top_p`/`top_k` are a 400 (B-skill) | the same (B-skill) |
| Forced `tool_choice` (`any`/`tool`) | accepted (v7 research, B-skill) | **400**; use `auto` with `strict: true`, or structured outputs (B-skill) |
| Minimum cacheable prompt | 512 tokens (B-skill) | 512 tokens (B-skill) |
| Effort default | `medium` (B-skill) | `high`; recalibrated levels; `low` recommended for chat and classification (B-skill) |
| Refusals | `stop_reason: "refusal"`; no server-side fallback (B-skill) | five refusal categories; server-side fallback beta (B-skill) |

The project's client already handles both (P): `claude.ts` sends `disabled` to Haiku 5.5 and `between_tools` to Sonnet 5.5 for a spoken turn (`thinkingFor`), sends no temperature, and uses structured outputs (`output_config.format`) rather than forced tools; `claudebudget.ts` prices Sonnet 5.5 at 2 / 10 with cache write 2.5 and read 0.1; the ledger has a day cap for `anthropic/claude-sonnet-5-5`.

## Cost of a turn (M, from the prices above and v7's measured sizes)

v7's planner prompt is about 2.5K cached system tokens plus about 1-1.5K per-turn tokens, with about 250 output tokens; the writer about 1.2-1.8K input and 100-200 output (v7 RESULTS, BUILD_LOG).
- Haiku 5.5: a planner call about US$0.0003, a writer call about US$0.0002; v7 spent US$0.119 over 446 calls (about US$0.00027 a call), which matches.
- Sonnet 5.5: a planner call about 1.5K × 2 + 2.5K × 0.1 (cached) + 250 × 10 per million ≈ US$0.006; a writer call ≈ US$0.004-0.005. A turn that plans and writes ≈ US$0.01; a 110-item set run ≈ US$1-1.5 with retries; live-60 ≈ US$0.4-0.6.

The owner's ceiling (US$10 in all; US$0.1475 recorded at the start of v8) therefore covers the Sonnet finals several times over; Jarvis's own day cap (1.5M tokens) must be raised by flag for a Sonnet run, as for Haiku (`JARVIS_CLAUDE_DAY_TOKENS`).

## Latency (M)

No first-token figure for Sonnet 5.5 was measured here before v8. v6 measured Haiku 5.5 planner calls at p50 2.1-2.4 s in the runner; v7 measured Haiku's first checked sentence about 1.0 s after the screen. Sonnet is the larger model: expect a slower first token. So Sonnet cannot lead every turn without making the voice slower; the rule below gives it only the turns where understanding is at stake.

## Which model a turn gets (the rule built in v8)

1. **No model** for what code settles: the lanes (navigation, the fast lane, frames, references bound in code, a story found by its topic, side talk). Most turns end here; their speed does not change.
2. **The fast model** (Haiku 5.5 when the owner's key works, else Groq) for the planner's ordinary turns and for the aide's writing.
3. **The deep model** (Sonnet 5.5, `JARVIS_DEEP_MODEL`) for the planner when a turn is hard or unclear: the code resolver saw a reference it could not bind, two candidates within the ambiguity margin, a long multi-part request, a why or comparison the lanes did not take, or the fast plan came back as a question back, "other" or nothing usable. One deep call per turn at most.
4. **The finals** run with Sonnet leading every Claude call (planner and writer, `JARVIS_CLAUDE_MODEL=claude-sonnet-5-5`), as the owner asked, labelled as such; the latency is measured for the shipped rule and for Sonnet leading.

Prompt design carried over from v7's research (30-planner-tools-claude.md): fixed-bytes system prompts over 512 tokens so both models cache them, per-turn text after the cache point, plain streamed text for the writer, a numbered candidate list ("0 = none") when the planner must pick a referent, and code rejecting any id not on the list (10-understanding.md rec 10).
