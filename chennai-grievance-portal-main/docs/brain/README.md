# The brain: one assistant behind Jarvis and Ask District IQ

Built 26 Nov 2026. Jarvis (voice) and Ask District IQ (chat) are the same mind: `src/lib/brain`. Every sentence goes to Claude with the conversation, the screen and 22 read-only tools before any of the old word rules. The old rules stay only as a fallback when Claude is off, out of budget or down.

## How an answer is made

1. The sentence, the last turns, what is on screen and the dashboard's tiles go to Claude Haiku 5.5 with the tools.
2. Claude calls the tools it needs (up to seven rounds). Each tool returns tables, with the window, the sources, the rule and its limits.
3. Claude finishes by calling `answer`: what to say, points for the screen, and which of the tables read are drawn and how.
4. Code checks the answer (`ground.ts`): every figure, zone, taluk and newspaper must be in what was read; no "not held" without having looked; the language of the question; no half-corrected sentence. What fails goes back once or twice with the exact fault. What still fails is not said.
5. A hard question moves to Claude Sonnet 5.5: when Haiku asks for it, after two failed checks, or after several failed tools (at most 60 a day).

Spoken sentences are streamed as they are written, each one checked first.

## Files

| File | What it does |
|---|---|
| `index.ts` | `askBrain`: one question in, one checked answer out |
| `loop.ts` | the tool loop, streaming, repair, escalation, warm-up |
| `prompt.ts` | the instructions (cached for an hour) and the turn's context |
| `fit.ts` | what the model wrote for a tool, made to fit it, or refused with the fields it has |
| `ground.ts` | the check against invention |
| `sql.ts` | one read-only SELECT over the whole store; the `cases` table (a case as the dashboard counts it) |
| `when.ts`, `names.ts` | windows of time, places and departments (also names written by their sound) |
| `tools/` | incidents, briefing, dashboard, news, open, search, readings, city, prices, contacts, facilities, map, studio, guide, evidence, schema, sql, calc, console, open_screen_action, screen, workspace |
| `render.ts` | the answer as Jarvis's screen and as the chat's card |
| `knowledge/` | what every tile, panel and word on the console is, and how the data is collected (read by the `guide` tool) |
| `eval/` | the question bank (1,258 questions in 49 groups), the run, the grader, and a tool probe |

## What it may not do

It never reads passwords, sign-in records, tokens or citizens' private details, and it never sends, approves, closes or deletes. A department officer's console is locked to that department. Saving a workspace waits for the Collector's yes.

## Switches (`.env`)

`JARVIS_BRAIN=0` turns it off. `JARVIS_BRAIN_MODEL`, `JARVIS_BRAIN_DEEP` change the models. `JARVIS_BRAIN_DEEP_DAY` (60) is the number of hard questions a day. `JARVIS_BRAIN_EFFORT`, `JARVIS_BRAIN_THINK` tune it. The owner's total is `JARVIS_CLAUDE_BUDGET_USD`.

A question costs about $0.0015.

## Testing it

```powershell
npx vitest run src/lib/brain
```

Live, on a dry-run copy of the store (nothing is saved to AWS; it spends from the Claude budget):

```powershell
$env:BANK_GROUPS='demo,owner-complaints'; $env:BANK_USD='0.2'; npx vitest run --config vitest.live.config.ts src/lib/brain/eval/run.live.ts
```

```powershell
$env:BANK_OUT='data/thunai/brain/run-x.json'; npx vitest run --config vitest.live.config.ts src/lib/brain/eval/grade.live.ts
```
