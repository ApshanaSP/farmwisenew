# Jarvis v5: test oracles changed for v5's intended behaviour

v5 build, START `f830efbd` (branch `claude/jarvis-v5-build-dfece7`). The build prompt is `docs/jarvis/JARVIS_V5_BUILD_2.md`.
Each row is one oracle that pinned behaviour a v5 item changes on purpose. Nothing else was changed: any other red test is a regression,
fixed in code. Lanes and the lead append rows to the one table below.

| Oracle (file, test) | Old value | New value | Item |
|---|---|---|---|
| `src/lib/thunai/addressed.test.ts`, "the address gate > tier 3: a sure rule or imperative plus a district noun acts, level A only" (4 sentences: show Adyar's cases, அடையாறு புகார்கள் காட்டு, Adyar la complaints kaattu, severe cases in Adyar this week) | unnamed, `lastTurnAt: null`: `{ tier: 3, act: true, maxLevel: "A" }` | by default `{ tier: 0, act: false }`; the old value holds with `commandTier: true` (= `JARVIS_GATE_COMMAND_TIER=1`) | C1 |
| `src/lib/thunai/addressed.test.ts`, "the address gate > levels B and C need tier 1 or 2" (`three` = show Adyar's cases) | `three` is tier 3 from the default gate, so `levelAllowed(three, "A")` is true | `three` is built with `commandTier: true`; the `levelAllowed` expectations are unchanged (A yes, B no, C no) | C1 |
| `src/lib/thunai/addressed.test.ts`, "side talk that used to act > tier 3: the same words as work still act" (5 sentences) | unnamed, `lastTurnAt: null`: `{ tier: 3, act: true }` | by default `{ tier: 0, act: false }`; the old value holds with `commandTier: true` | C1 |
| `src/lib/thunai/addressed.test.ts`, "real commands that used to be ignored when engaged > traffic and tea are topics once a district noun is there, chatter before" (Show traffic complaints in Adyar, unengaged) | `{ tier: 3, act: true }` | by default `{ tier: 0, act: false }`; the old value holds with `commandTier: true`. The engaged line in the same test is unchanged (tier 2) | C1 |
| `src/lib/thunai/llm.test.ts`, "the ladder > Claude comes first when it has a key…", "…out of its day, or cooling, is not a rung…", "…a failing Claude moves on to Groq…" | Jarvis's Claude rung is `claude-opus-5-5` (the default of `JARVIS_CLAUDE_MODEL`) | `claude-haiku-5-5` (the new default); the ladder order and the fall to Groq are unchanged | A6 |
| `src/lib/thunai/llm.v4.test.ts`, "v4 defect 2: the hedge waits for the rung's own record" (five tests, constant `CLAUDE`) | `CLAUDE = "claude-opus-5-5"` | `CLAUDE = "claude-haiku-5-5"`; every hedge expectation unchanged | A6 |
| `src/lib/ai/claude.v4.test.ts`, "Opus 5.5: effort low, adaptive thinking left on…" | Opus reached as the default Jarvis model | the test names Opus explicitly with `JARVIS_CLAUDE_MODEL=claude-opus-5-5` (Opus only by explicit env); every expectation about Opus's request is unchanged | A6 |
| `src/lib/thunai/stream.v4.test.ts`, "the streamed turn > without emit the reply is what it was: the same shape, no stream" | the round's keys: cached, calls, done, hops, lane, result, steps, tokens, trace | the same plus `timing` (the server's stage times, epoch ms, timings only); nothing removed | 6.4 (the trace) |
