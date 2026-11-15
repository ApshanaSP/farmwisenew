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
