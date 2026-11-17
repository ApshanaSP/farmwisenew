# 30 · Planner and tool-use design; Claude Haiku 5.5 tool use, streaming and caching

Research for Jarvis v7, 17 Nov 2026. No model API was called; no code was changed.
Legend: **(B)** read in the cited source this session. **(B-skill)** read in the bundled `claude-api` skill reference
(Anthropic's cached docs digest, model table dated 2026-11-03); the matching live page is cited, re-fetch it before quoting
to the owner. **(M)** my inference. **(P)** project fact (the v7 brief, or code in `src/lib/ai/claude.ts`).
Sources read: 12 web fetches (two were redirects) plus the skill files.

## Summary

- Jarvis already has the shape the literature recommends for low latency: a code router first, then a planner that emits
  a whole plan in one call, executed by code (plan-and-execute, not ReAct). Keep it; the gains are in the round count,
  parallel execution of the plan, and the new answer step. (M, from B sources in section 1)
- Plan-ahead designs beat call-observe-call loops on speed and tokens: LLMCompiler reports "up to 3.7x" latency speedup,
  "up to 6.7x" cost savings and "up to ~9%" accuracy over ReAct; ReWOO reports "5x token efficiency and 4% accuracy
  improvement on HotpotQA". (B)
- Answer writer: make it a **separate, small, streamed plain-text call** that sees only the question, the language and the
  fact sheet, with a code check per sentence before speech. It is cheaper on Groq's 8K tokens a minute, has the
  shortest prompt (lowest time to first token), and its output can be checked against a closed fact list. No published
  head-to-head on faithfulness was found within budget; the case rests on latency, tokens and checkability. (M)
- Do not wrap the spoken answer in JSON: Groq says "Streaming and tool use are not currently supported with Structured
  Outputs" (B), and on any provider a JSON wrapper delays the first speakable words. (M)
- Claude Haiku 5.5: minimum cacheable prompt is **512 tokens** (Haiku 4.5: 4,096). Cache writes 1.25x (5 min) or 2x (1 h),
  reads 0.1x, max 4 breakpoints, cache entry usable only after the first response starts. (B)
- Haiku 5.5 thinks by default (adaptive, effort default `medium`); `thinking: {type:"disabled"}` is allowed at effort
  low/medium/high only. With thinking off, it "can skip a tool call it needs when the request also asks for JSON
  output". Forced `tool_choice` works on Haiku 5.5 (it skips thinking) but returns 400 on Opus 5.5 / Sonnet 5.5. (B-skill)
- Structured outputs on Claude: 20 strict tools, 24 optional parameters, 16 union-type parameters per request; grammar
  compiles on first use of a schema and is cached "24 hours from last use"; changing `output_config.format` invalidates
  the prompt cache. (B)
- Groq: strict JSON schema on `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` (all fields required);
  best-effort mode is what returns 400 on a schema miss; `reasoning_format` is not supported on gpt-oss (use
  `include_reasoning`); "Cached tokens do not count towards your rate limits." (B)
- Gemini Flash-Lite: the free-tier limits are no longer on the docs page ("can be viewed in Google AI Studio"); limits are
  per project, RPD resets at midnight Pacific. (B)

## 1. Planner patterns for a low-latency voice assistant

**Anthropic, "Building effective agents"** — https://www.anthropic.com/engineering/building-effective-agents
- Workflows are "systems where LLMs and tools are orchestrated through predefined code paths"; agents let the model pick
  its own steps. Advice: "finding the simplest solution possible, and only increasing complexity when needed";
  agentic systems trade latency and cost for task performance. (B)
- Routing "classifies an input and directs it to a specialized followup task", including sending easy questions to a
  smaller, cheaper model. (B) Jarvis's code/rules lane is a router in this sense. (M)
- Prompt chaining "decomposes a task into a sequence of steps" with programmatic gates between steps. (B) The v7
  planner → tools → writer → code check is a chain; the code check is the gate. (M)
- Parallelization (sectioning, voting), orchestrator-workers, evaluator-optimizer: all add calls. (B) None fit a 2-4 s
  spoken turn except sectioning of independent tool calls, which needs no extra model call. (M)
- Tool interface: "Give the model enough tokens to 'think'", keep formats close to text seen in training, and
  poka-yoke the arguments ("Change the arguments so that it is harder to make mistakes"). (B)
- Closing principles: keep the design simple, make planning visible, craft the agent-computer interface carefully. (B)

**Anthropic, "Writing effective tools for agents"** — https://www.anthropic.com/engineering/writing-tools-for-agents
- "More tools don't always lead to better outcomes"; avoid tools that only wrap endpoints; consolidate multi-step work
  into one tool; namespace related tools with shared prefixes; "Too many tools or overlapping tools can also distract
  agents". (B)
- Return "only high signal information"; natural-language names over IDs; offer a `response_format` concise/detailed
  switch — their example used 206 tokens detailed vs 72 concise, "~⅓ of the tokens". Claude Code caps tool responses
  at 25,000 tokens by default. (B)
- Evaluate tools on held-out tasks; read transcripts. (B) For Jarvis: recipes should return a compact, named fact sheet
  (district names, not codes), not raw rows. (M)

**ReAct vs plan-and-execute vs LLMCompiler**
- LLMCompiler (Kim et al., ICML 2024), https://arxiv.org/abs/2312.04511: planner builds a call graph, a task-fetching unit
  dispatches, an executor runs calls in parallel; vs ReAct "up to 3.7x" latency, "up to 6.7x" cost, "up to ~9%"
  accuracy. (B)
- ReWOO, https://arxiv.org/abs/2305.18323: "detaches the reasoning process from external observations"; "5x token
  efficiency and 4% accuracy improvement on HotpotQA". (B) The abstract does not say what the final solver step sees;
  the full paper was not read. (B)
- Time model (B-skill, Anthropic latency guide; live page https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency):
  task time ≈ calls × time-to-first-token + output tokens ÷ output speed + time outside the model; "For a multi-turn
  agent the dominant term is often the number of calls".
- **Rounds for voice** (M): with the measured planner p50 of ~1.2 s (Groq) and 2.1-2.4 s (Haiku) (P), each extra planner
  round costs about one more p50 before the writer can start. One round should be the default; a second only when the
  plan itself declares a step that needs a value from an earlier result (a dependency the plan cannot know in advance);
  never a third on a spoken turn. Independent recipe calls in one plan run in parallel (LLMCompiler's point), so a
  "compare A and B" turn stays one round.

## 2. Answer writer: inside the planner conversation, or a separate call?

| | A. Same conversation (tool results go back; model writes the answer) | B. Separate call: question + language + fact sheet only |
|---|---|---|
| Input tokens | whole planner prompt again (2.5-7K, P) plus results; cheap on Claude when cached (0.1x, B) | small prompt (M: roughly 0.5-1.5K) |
| Groq 8K TPM | uncached replay of the planner prompt can use most of a minute's budget (M) | fits several turns a minute (M) |
| Time to first token | prefix read is skipped only if cached; uncached tokens add TTFT on every call (B-skill) | short prompt, low TTFT on any rung (M) |
| Faithfulness | model sees everything, including instructions and its own planning, so it can answer from memory (M) | can only state what the fact sheet holds; code can check every number and name against a closed list (M) |
| Provider switch mid-turn | thinking blocks/history must match the model; Haiku 5.5 runs a history-editing check when thinking blocks are replayed (B-skill) | none: the writer is a fresh call on any rung (M) |
| Tamil | same model must also plan well | writer prompt can carry Tamil style rules and examples alone (M) |

Evidence: decoupling reasoning from observations saves tokens (ReWOO, B); Anthropic's chain-with-gates pattern (B) is
exactly "writer, then code check". I found no published study within the search budget measuring faithfulness of a
fact-sheet-only writer against an in-conversation writer; treat the faithfulness gain as an inference to be tested on
the v7 grounding set (see `10-grounding.md`). (M)

Streaming the first sentence (M, from B facts): stream plain text; cut at the first sentence end (`.`, `?`, `!`, and the
Tamil full stop the style guide uses); run the code check on that sentence; send it to TTS while the rest streams.
On Claude the deltas are `content_block_delta` events with `text_delta` (B-skill:
https://platform.claude.com/docs/en/build-with-claude/streaming). Do not use `output_config.format` or a tool for the
writer: grammars apply only to "Claude's direct output" and a JSON wrapper holds the text behind keys (B, M).

## 3. Claude API specifics (Haiku 5.5 leading)

**Model and price** (B-skill; https://platform.claude.com/docs/en/about-claude/pricing): `claude-haiku-5-5`, US$0.10 / 0.50
per MTok in/out for prompts ≤100K tokens (0.50 / 2.50 above). New tokenizer: "approximately 30% more tokens" than Haiku
4.5 for the same text. Haiku 5.5 has **no server-side refusal fallback**: handle `stop_reason: "refusal"` in the client
(the ladder already does, P).

**Thinking and effort** (B-skill; https://platform.claude.com/docs/en/build-with-claude/thinking)
- Thinking is on by default (adaptive); effort default `medium`; "To get less thinking, lower the effort level".
- `{type:"disabled"}` works at `low`/`medium`/`high`, 400 at `xhigh`/`max`. With thinking off the model "can skip a tool
  call it needs when the request also asks for JSON output"; Anthropic's fix line: "The JSON output format applies to
  your final answer only. When you need a tool, call it first, with no text before the call, and write the JSON once
  you have the results."
- The current code sends `disabled` + effort low on Jarvis turns, `max_tokens` 600, a plan ≈ 230 tokens (P). Keep it.

**Tool use** (B-skill; https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- `tool_choice`: `auto`, `any`, `tool`, `none`; any value can add `disable_parallel_tool_use: true` (at most one call).
- Haiku 5.5 accepts forced `any`/`tool`, and the response then has no thinking block. Opus 5.5 and Sonnet 5.5 return
  400 on forced tool use. A ladder that may reach those models should get JSON via `output_config.format`, as now (P).
- Parallel tool calls are on by default; return all `tool_result` blocks in one user message (splitting them "silently
  trains Claude to stop making parallel calls").
- `token-efficient-tools-2025-02-19` is "Built in to all Claude 4+ models" — remove the header if present.

**Structured outputs / strict tools** (B; https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- `output_config.format` (JSON outputs) and `strict: true` (tool inputs); both list `claude-haiku-5-5`.
- Limits per request, summed over all strict schemas: 20 strict tools, 24 optional parameters, 16 union-type parameters;
  beyond internal limits: "Schema is too complex for compilation"; compile timeout 180 s.
- First use of a schema adds compile latency (no figure given); grammars "are cached for 24 hours from last use";
  the grammar cache is reset by a change of schema structure or tool set, not by name/description edits.
- "Changing the output_config.format parameter invalidates any prompt cache for that conversation thread."
- Required properties come first, then optional, each in schema order; enum casing is not guaranteed (compare
  case-insensitively); `refusal` or `max_tokens` stops can break the schema. Not supported: recursive schemas, numeric
  and string-length constraints, `additionalProperties` other than false. Incompatible with citations and prefill.

**Streaming tool input** (B-skill; https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)
- Set `eager_input_streaming: true` per tool; no beta header (the old `fine-grained-tool-streaming-2025-05-14` header is GA
  and should be removed). The API then does not buffer or validate the input: partial JSON may be invalid; validate
  before running. Useful only for long tool inputs; a 230-token plan gains little. (B-skill, M)

**Prompt caching** (B; https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Minimum: 512 tokens for Claude Haiku 5.5 (4,096 for Haiku 4.5). Shorter prompts "are processed without caching, and
  no error is returned".
- TTL 5 min default, "refreshed for no additional cost each time the cached content is used"; measured from the start
  of the request; `ttl: "1h"` option.
- Price: writes 1.25x (5 min) or 2x (1 h) base input; reads 0.1x on Haiku (0.05x Opus 5.5 / Sonnet 5.5).
- Up to 4 breakpoints; each looks back at most 20 positions; top-level `cache_control` auto-places one (not on Bedrock).
- Invalidators: any tool-definition change invalidates tools, system and messages; `tool_choice` changes affect message
  blocks only; thinking config and `output_config.effort` changes invalidate message blocks (and on some models more).
- "a cache entry only becomes available after the first response starts" — parallel cold calls all pay full price.
- "cache hits are not deducted against your rate limit".
- Haiku 5.5 supports mid-conversation `role: "system"` messages (no beta), which add instructions without moving the
  cached prefix (B-skill).
- Message threads (beta `message-threads-2026-08-12`) cut request size and TTFT in long multi-turn loops (B-skill);
  irrelevant for one-round planning plus a fresh writer call. (M)

**Time to first token for Haiku 5.5**: no published figure was found on the pages read. Use the project's own runner
numbers (planner p50 2.1-2.4 s, P) and time the writer's first sentence in the owner's run. (B: absent; M)

## 4. Groq (gpt-oss-120b, gpt-oss-20b, qwen3.8-27b)

**Structured outputs** (B; https://console.groq.com/docs/structured-outputs)
- Strict mode (`strict: true`): `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `meta-models/muse-spark-open`.
  Strict "Never errors or produces invalid JSON". Best-effort (`strict: false`) adds `openai/gpt-oss-safeguard-20b`;
  there, a miss returns HTTP 400 "Generated JSON does not match the expected schema. Please adjust your prompt."
- Strict schema rules: "All schema properties must be marked as `required`. Optional fields are not supported";
  `additionalProperties: false` on every object; optional values as `["string","null"]` and still required.
- JSON object mode (`{"type":"json_object"}`) works on all models; the prompt must ask for JSON; output may not match
  the intended schema.
- "Streaming and tool use are not currently supported with Structured Outputs."
- So (M): the "strict mode 400s" seen earlier are most likely best-effort misses or schema features strict mode rejects;
  one all-required schema can serve Claude strict and Groq strict alike (Claude's union limit is 16, so keep nullable
  fields few).

**Reasoning** (B; https://console.groq.com/docs/reasoning)
- `reasoning_effort`: gpt-oss `low`/`medium`/`high`; qwen3.8-27b `none`/`default`/`low`/`medium`/`high` ("On Groq, Qwen 3.8
  27B does not return reasoning tokens at this setting" for `default`).
- `reasoning_format` (`parsed`/`raw`/`hidden`) "is not supported by" the gpt-oss models; use `include_reasoning`
  (`true` default / `false`), which is mutually exclusive with `reasoning_format`. `raw` with JSON mode or tools → 400;
  must be `parsed` or `hidden` there.
- Temperature default 0.6, recommended 0.5-0.7; `max_completion_tokens` "Default may be too low for complex reasoning".
- Project note (P): `src/lib/thunai/bakeoff.live.ts` sends `reasoning_format: "hidden"` to `openai/` models; per the page
  that field is not supported there — check the gateway path does not do the same.

**Rate limits** (B; https://console.groq.com/docs/rate-limits)
- Table: gpt-oss-120b, gpt-oss-20b, qwen3.8-27b each 30 RPM, 1K RPD, 8K TPM, 200K TPD. The fetch could not tell whether
  the table shown was the Free or Developer tab; the project's own probe read `x-ratelimit-limit-tokens` 8000 (P,
  `ledger.ts`).
- Headers: `x-ratelimit-limit-requests` (RPD), `x-ratelimit-limit-tokens` (TPM), `x-ratelimit-remaining-requests`,
  `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`; `retry-after` only on 429.
- "Cached tokens do not count towards your rate limits." (M) A stable planner prefix therefore stretches the 8K TPM.

## 5. Gemini Flash-Lite (last rung)

- Rate limits (B; https://aistudio.google.com/docs/rate-limits, redirected from ai.google.dev): no free-tier RPM/TPM/RPD
  for any Flash-Lite model on the page; limits "can be viewed in Google AI Studio"; "Rate limits are applied per
  project, not per API key"; "Requests per day (RPD) quotas reset at midnight Pacific time." Names listed (batch
  tables): Gemini 3.5 Flash-Lite, 3.1 Flash Lite, 2.5 Flash Lite, 2.0 Flash Lite.
- Structured output (B; https://aistudio.google.com/docs/structured-output): page now documents the Interactions API
  (`response_format` with `mime_type: application/json` and a `schema`); "streamed chunks are valid partial JSON
  strings"; `minLength`/`maxLength` etc. are not enforced; very large schemas fail with `400 INVALID_ARGUMENT`;
  structured output with tools is preview, Gemini 4 and 3 series only. Flash-Lite is not named on the page.
- The gateway calls Gemini with `responseMimeType: "application/json"` and `structuredOutputs: false` (P). Keep zod as
  the real check on this rung. (M)

## Recommendations for Jarvis v7 (ranked)

1. **Separate answer writer: plain text, streamed, fact sheet only, checked per sentence.**
   Benefit: first sentence can play while the rest is written; prompt small enough for Groq's 8K TPM; every number and
   name can be checked against a closed list; works on any rung. Cost: one extra call on tool turns; on Haiku about
   US$0.0002 a turn (M: 1,500 in × $0.10/M + 150 out × $0.50/M); latency = writer TTFT to first sentence (to measure).
   Risk: the writer lacks context (fix: pass the question, language, last-turn topic); a check failure mid-answer
   (fix: drop the sentence and end with the checked part, or speak a code template).
2. **One planner round by default; parallel recipe execution; a second round only for a declared dependency; never three.**
   Benefit: saves one planner p50 (1.2 s Groq, 2.1-2.4 s Haiku, P) on most tool turns; LLMCompiler-style gains (B).
   Cost: a `needs`/dependency field in the plan schema (one more optional or nullable field; counts toward 24/16, B).
   Risk: true multi-hop questions get a partial answer; the writer must say what was not looked up.
3. **Code-template fallback for the writer.** If no checked first sentence by a deadline (owner to set; e.g. ~1.5 s
   after facts, M), speak a template filled from the fact sheet. Benefit: Jarvis never goes silent and never speaks an
   unchecked figure. Cost: templates per recipe family (code only, no tokens). Risk: stiff phrasing; Tamil templates
   need review.
4. **Keep caches warm and byte-stable.** Planner and writer each get a stable system prefix of at least 512 tokens with
   `cache_control` on its last block; fix `tools`, `thinking`, `effort`, `output_config.format` per route; volatile
   context after the breakpoint; one warm-up call before parallel calls. In mocks, assert the request bytes of the
   prefix are identical across turns. Benefit: 0.1x input price, lower TTFT, hits not counted against Claude or Groq
   rate limits (B). Cost: 1.25x write once per 5 min idle. Risk: silent invalidators (a timestamp in `system`, tool
   order) — the byte-equality test catches them.
5. **One all-required plan schema for Claude strict and Groq strict; JSON via `output_config.format`, not forced tools.**
   Benefit: portable across Haiku/Opus/Sonnet 5.5 (forced `tool_choice` 400s on the latter two, B-skill) and Groq strict
   (B). Cost: nullable unions count toward Claude's 16; first-use compile latency per deploy (warm it). Risk: a schema
   edit resets the 24 h grammar cache and the prompt cache (B).
6. **Groq request hygiene.** Planner: `response_format` strict json_schema, not streamed; `reasoning_effort: "low"` on
   gpt-oss with `include_reasoning: false`; `reasoning_effort: "none"` on qwen3.8-27b; read
   `x-ratelimit-remaining-tokens`/`reset-tokens` before choosing a rung. Writer: plain text, streamed, no
   `response_format`. Benefit: fewer output tokens and no 400s from unsupported fields. Cost: none. Risk: lower
   reasoning may weaken plans — compare on live-60 in the owner's run.
7. **Haiku 5.5 settings stay as v6** (thinking `disabled`, effort low, small `max_tokens`) for planner and writer; if a
   planner turn ever both calls tools and asks for JSON with thinking off, add Anthropic's final-answer-only line (B-skill).
   Handle `refusal` by moving down the ladder (no server-side fallback on Haiku 5.5). Risk: low effort skips checks in
   long prompts (B-skill) — keep the planner prompt short.
8. **Flash-Lite stays the last rung with JSON mode + zod;** the owner reads the project's free-tier numbers in AI Studio
   before relying on it (B: not on the docs page).
