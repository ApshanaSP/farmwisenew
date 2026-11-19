# Turning on Claude Haiku for Jarvis

Jarvis is built to think with Claude Haiku 5.5 first, and with the Groq models after it.
The v5 build made no call to Claude: the key was refused, and you asked us to test with Groq.
This page is what you do on deploy day. It takes about 20 minutes.

## 1. Fix the key

The Anthropic key in `chennai-grievance-portal-main/.env` returned 401 (not accepted) on 15 Nov 2026.

1. Make a new key at https://console.anthropic.com (Settings, API keys).
2. In `chennai-grievance-portal-main/.env`, set `ANTHROPIC_API_KEY=...` yourself. (`npm run ai:key` takes only AWS and Groq keys: it does not write an Anthropic key.)
3. Make sure `JARVIS_CLAUDE_OFF` is not set, in `.env` or in your shell. While it is `1`, nothing reaches Anthropic.

Never paste the key into a chat, a file in git, or a screenshot.

## 2. Run the deploy check

From `chennai-grievance-portal-main`:

```
HOLDOUT=deploy-haiku npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts
```

On Windows (cmd):

```
set HOLDOUT=deploy-haiku&& npx vitest run --config vitest.live.config.ts src/lib/thunai/deploy.live.ts
```

It costs about US$0.15. It stops itself before it could spend US$0.50.

What it does:

1. **Key.** One tiny call. If it prints `key refused`, it stopped at once and cost nothing. Go back to step 1.
2. **Timing.** Three settings, 40 calls each: effort low; effort medium; effort low with the compact plan. Thinking is off in all three.
3. **Accuracy.** The 24 tuning sentences in each setting, scored as the Groq grid was, and compared with each Groq model.
4. **Live-60.** The 60 frozen test sentences through the real planner, with Haiku alone, in the setting step 3 picked. It is compared with this build's final Groq run, `eval/holdout2/results/v5final-planner-live60.json` (36/60), which is already in the branch. **Do not run its command again**: it would overwrite that file with a new run (about 170K Groq tokens). For the record, it was made with (from `chennai-grievance-portal-main`, plus `JARVIS_CLAUDE_OFF=1 LIVE_GAP_MS=20000`):

   ```
   HOLDOUT=planner2 HOLDOUT_DIR=holdout2 HOLDOUT_SET=live60 HOLDOUT_TAG=v5final npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts
   ```

   On Windows (cmd): `set HOLDOUT=planner2&& set HOLDOUT_DIR=holdout2&& set HOLDOUT_SET=live60&& set HOLDOUT_TAG=v5final&& npx vitest run --config vitest.live.config.ts src/lib/thunai/holdout.live.ts`

   If that file is not there, or the run was cut off, it is compared with v4's Groq run (`v4final-groq-planner-live60.json`, older code) instead, and it prints the file's name and why. The Groq-or-Haiku decision is then made against v4's run, not this build's. It prints only counts: never a sentence.

It writes its results to `eval/holdout/results/deploy-haiku-*.json` and `eval/holdout2/results/deploy-haiku-planner-live60.json`.

The check's own calls are counted in a ledger of its own (a temporary folder), never in Jarvis's daily Claude allowance in `data/thunai`. So the check does not use up Jarvis's Claude day on deploy day, and steps 1 to 3 do not take the room step 4 needs. Its own cap is the US$0.50 above.

## 3. Read the decision

At the end it prints `Decision:`, the reasons, and three lines like these:

```
JARVIS_PLANNER_LEAD=haiku
JARVIS_HAIKU_EFFORT=low
JARVIS_PLAN_COMPACT=0
```

How it decides:

- **Effort.** `medium` only if it got at least 3 more sentences right than `low`, and its middle call time is 1.2 s or less. Otherwise `low`.
- **Compact plan.** On if it is not worse than the full plan (fewer than 3 sentences lost) and it saves at least 0.2 s a call.
- **Who leads.** Haiku stays first, unless Groq got at least 3 more of the live-60 right, or Haiku's middle call time is over 1.5 s. Then it also prints `set JARVIS_PLANNER_LEAD=groq`.
- **Who leads, when step 4 did not run** (or found no Groq run to compare with). The check does not choose. It prints `lead undecided` and, in place of the `JARVIS_PLANNER_LEAD` line, three comment lines (starting with `#`) that give both choices. Pick one and set it yourself: `JARVIS_PLANNER_LEAD=groq` (Groq first, as this build measured it) or `JARVIS_PLANNER_LEAD=haiku` (Haiku first, not measured on the live-60). If you leave it unset, Jarvis puts Haiku first. If Haiku's middle call time was over 1.5 s, it still prints `groq`.

## 4. Set the lines and restart

1. Put the printed lines in `chennai-grievance-portal-main/.env`. The check never edits `.env` itself.
2. Restart the portal server.

To go back to Groq first at any time: set `JARVIS_PLANNER_LEAD=groq` and restart. Haiku then answers only when the Groq models cannot.

If Anthropic refuses the key later, Jarvis skips Claude for 10 minutes, then tries once more. The Groq models answer meanwhile.

## The settings

| Setting | Values | Default |
|---|---|---|
| `JARVIS_PLANNER_LEAD` | `haiku` (Haiku first), `groq` (Groq first, Haiku after) | `haiku` |
| `JARVIS_HAIKU_EFFORT` | `low`, `medium` (anything else is read as `low`) | `low` |
| `JARVIS_PLAN_COMPACT` | `1` on, `0` off | off |
| `JARVIS_CLAUDE_MODEL` | `claude-haiku-5-5`; `claude-opus-5-5` only if you choose it | `claude-haiku-5-5` |
| `JARVIS_CLAUDE_OFF` | `1` stops every call to Anthropic | not set: leave it unset |
| `JARVIS_LADDER_PIN` | used by the check only; never set it in `.env` | not set |

## What it costs a month

At 300 turns a day, a turn is about 2,650 tokens in and 230 out. Haiku 5.5 costs $0.10 a million tokens in and $0.50 out.

- Full plan: about **$3.42 to $4.45 a month**. The higher figure allows 30 % more tokens, in case the tokenizer counts more than our estimate.
- Compact plan: about **$2.75 to $3.57 a month**. It cuts about 150 of the 230 tokens out.

These figures price every input token at the plain rate. The prompt cache makes most turns cheaper (a cache read costs a tenth). A turn after a pause of more than 5 minutes writes the cache again, at a little more ($0.125 a million).

## What Anthropic keeps

Anthropic's page on API data retention (read by the research on 15 Nov 2026, not re-read in this build):
https://platform.claude.com/docs/en/manage-claude/api-and-data-retention

- Prompts and outputs on Haiku 5.5 are not retained by default.
- A conversation its safety systems flag may be kept for up to 2 years.

We did not find whether the flagged-chat retention can be turned off. Read the page again before you deploy, and ask Anthropic if you need zero retention.

Jarvis is built never to send audio, a citizen's own words, a phone number or an Aadhaar number to Claude. Audio goes only to Groq's Whisper, for speech-to-text. It sends the Collector's sentence as text and the console's state.
