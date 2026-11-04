# Jarvis mode: handover

Pushed to `main` by fast-forward on the owner's request, 4 Nov 2026, from branch `claude/jarvis-agentic-voice-5be9b7`. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Numbers are in `chennai-grievance-portal-main/eval/RESULTS.md`, the day's record is in `docs/thunai/BUILD_LOG.md`, and pictures are in `docs/jarvis/screens/`.

**Read this first.** Nothing has been tried with a real microphone in a real room. Barge-in, the address gate and the latency figures come from injected or recorded audio. Do the five-minute check at the top of `docs/jarvis/DEMO.md` before showing it to anyone.

## What shipped

Turn on Jarvis mode (top bar, or `Ctrl+Shift+J`). There is no mic button.

- **Always listening, with an address gate.** It works out from the words whether it was spoken to: by name, within 20 s of its last turn, or a sentence the rules are sure of. A sentence with no name and no recent turn can only do level A. Side talk gets a faint line that fades in 2 s, and never reaches the planner.
- **Barge-in in two stages.** The energy gate pauses the voice at once, Silero confirms it is speech, and 200 ms held cancels the turn. A cough resumes from where it stopped. Every answer carries a generation id, so an old answer cannot speak after an interruption.
- **Hold words.** "wait" goes silent and changes nothing on screen, and "continue" brings the answer back. "Wait, show Anna Nagar" is a command.
- **Three lanes.** Reflex commands are local and take no model. Screens are built by code from the data, using templated speech. Planner turns are driven from the browser in rounds on `/agent/round`, using prompt bundles and a token diet.
- **Capacity handling.** A ledger keyed by organisation and model, a ladder with a hedge at p95, and a spoken "cannot reason right now" within 8 s if no model answers.
- **New abilities.** Compare, what stands out (each finding shows its method, its n and a caveat), complete this data (filled cells show their source, blanks stay blank and say why), pin to the Overview, save a workspace. The last two need a spoken yes or a tap.
- **Every number from code.** The model writes `{n:key}` placeholders, and a gate runs on every spoken chunk.
- **Privacy in code.** A request for a citizen's words, phone or Aadhaar is refused by rules with no model involved, and tool results are redacted.
- **It never sends, approves or deletes.** The tray's button is the Collector's own tap. Buttons with those effects also carry `data-jarvis-never`, so they cannot be pressed by number or by name.
- **The HUD.** Core, ribbon, work timeline with real times, result panels, map reticle, system strip, power-on, Tamil type, reduced motion. The console stays underneath and usable.
- **Voice.** Edge natural voices first, then Gemini TTS on an AudioContext PCM path, then words on screen.

## What was cut, and what changed from the brief

| Item | What happened | Why |
|---|---|---|
| PCM 2 s self-test | Cut | Phase 1's stated cut line |
| Speculative prefetch | Cut | Phase 4's stated cut line ("prefetch last") |
| Ollama rung | Dropped | The probe got no reply in 60 s. Phase 3's cut line |
| Bedrock rung | Off | The probe returned `AccessDeniedException`: bearer token expired |
| FLEURS `ta_in` | Not used | The datasets API refused it. 100 SLR65 clips were used; male clips were not |
| `msw` | Not added | It cannot intercept the Next server's outbound fetches from a browser test. `page.route` is used instead |
| 240 px core with a Stage open | Stays 96 px | 240 px does not fit above an open screen. The 240 px rule holds with no screen open |
| Wake word on page load | Removed | With the mode off, nothing listens |
| Tab hidden | Reopens the mic on return and says so | The brief says mute and say so. The mic is closed while hidden, and the mode is meant to need no pressing |

Severity red on Stage screens was left for the owner to decide (UI review finding 25).

## How to run the demo in Edge

From the repository root (the folder above `chennai-grievance-portal-main/`):

```bash
start-fast.bat
```

This opens Microsoft Edge, which has the natural Tamil and Indian English voices. Chrome has no Tamil voice. The script and the failure fallbacks are in `docs/jarvis/DEMO.md`. Wired headphones avoid most echo. Do not demo within 24 hours of a heavy evaluation run: Groq's daily caps reset 24 hours after use.

The two settings most likely to need changing after a real-room try are both in `TUNING` in `src/lib/thunai/vad.ts`: `echoMarginDb` (8; raise to 12 if it stops itself) and `endOfUtteranceMs` (300; raise to 500 if sentences get cut at pauses. thunai/v3's own data recommended 500 to 800).

## Known limits

- **No speaker identification.** Anyone in the room can command it. The gate decides whether a sentence was addressed to Jarvis, not who said it. Level B and C need the name and a yes, but anyone can say those too.
- **Unnamed requests depend on the words.** The gate is a text rule set, so it will sometimes act on side talk or ignore a real command. See the ambient figures in `RESULTS.md`.
- **The rules now hand off when unsure, so Tamil nearly always takes a model turn** of about 1,900 tokens and 1.2 to 2.6 s. Understanding rose from 40 % to 73 % on the new frozen set, at 64 % more tokens a sentence.
- **Claude is paid by the token.** With `ANTHROPIC_API_KEY` in `.env`, Jarvis asks `claude-opus-5-5` first and falls back to Groq with no key or on any failure. Nothing else in the portal uses it. On the frozen set it scored 49/60 (Tamil 25/30) against Groq's 44/60 (22/30), which is probably better but not proven. A model turn takes about 3.9 s at p50 and 5.2 s at p90 against Groq's 1.2 s and 2.6 s, and the ledger caps a day at 500 requests. The key has to be in the `.env` of whichever copy runs, including any hosted deployment.
- **Quota is the real ceiling.** The three Groq keys are one organisation, so they add nothing: 8K tokens a minute, and a daily cap that one evaluation run can use up. There is also a limit on output tokens per minute that the ledger does not track, which `qwen` hit during the final run. The Gemini transcriber allowed about 28 calls in a day, so it runs only as a third racer when Whisper is unsure.
- **Tamil voice needs Edge.** Elsewhere the words stay on screen.
- **Tamil coverage on screens is partial.** Only the `cases` recipe's labels are Tamil at the source. Other recipes rely on the runtime translator, `when()` writes English months, and HUD panel titles use the screen's title as it comes.
- **The console's runtime translator shares the same Groq organisation.** Loading the Tamil console drew 429s on its minute limits during the screen runs, which competes with Jarvis's own quota. It also makes mistakes with figures: one news headline, "47-year-old Chennai man", came out in Tamil as "47-thousand". That translator is not part of this build and the number gate does not cover it, but it shows on the same screen.
- **Noise figures for Tamil transcription use synthetic babble**, and are labelled so.
- **The ledger is a local SQLite file** (`node:sqlite`, with a memory fallback). A hosted deployment with more than one process needs a different store behind the same interface.
- **Whisper's end of utterance at 300 ms** splits "Jarvis," from what follows. The name alone now engages and listens on, but this is the first thing to retest in a room.
- **A sentence still at Whisper when someone else talks for 200 ms is merged with their words.** The capture reaches back so that a sentence with a pause in it stays whole, and that means a second speaker's words go along with it.
- **Understanding: the second pass is in `eval/RESULTS.md`.** The full pipeline scored 44/60 (73.3 %) on the new frozen set, with Tamil at 22/30, up from 24/60 and 9/30 on its first run. Two things come first: re-run that sample once the cap resets, because the final run met four 429s, and try real Tamil speech, because every one of these sentences is typed text. Tanglish, at 9/15, is now the weakest language.
- **The address gate is still above its target:** 4/60 false acts against 5 %, all in Tanglish. A small model as a veto on what the rules would act on took the old set from 4/40 to 0/40 and lost no commands, but its run on the frozen set was a capacity failure. It has not been built: it sends overheard sentences to a model, so that is the owner's call.

## What an Azure key would add

A speech key (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`) with `TTS_PROVIDER=auto` or `azure` turns on the branch in `src/app/api/jarvis/say/route.ts`. It sends one SSML request and gets a 24 kHz WAV back in the ta-IN Pallavi or en-IN Neerja voice.

- The natural voices would work outside Edge, including Chrome and hosted machines.
- The audio would go through the PCM path, so barge-in gets the exact pause and resume measured here. Edge's own voices cannot pause, so they restart the chunk.
- The HUD gets a real voice level from the analyser, not an envelope driven by the state.

That branch has never run, because no key exists. It is marked Not verified, and is not a paid service this build added or relies on.

## Findings from the final independent review

See "Independent review" in `eval/RESULTS.md` for what was fixed and what was left.

## Tests

From `chennai-grievance-portal-main/`:

```bash
npx vitest run
```

```bash
npx tsc --noEmit --incremental false
```

```bash
npx playwright test tests/e2e/mode.spec.ts tests/e2e/bargein.spec.ts tests/e2e/hold.spec.ts tests/e2e/vad.spec.ts tests/e2e/vadfake.spec.ts tests/e2e/e2e-latency.spec.ts
```

A measuring production build for the real latency run needs `NEXT_PUBLIC_JARVIS_SPEC=1` at compile time, so a normal production build has none of the test hooks. See `playwright.config.ts` (`SPEC_PROD=1`).

Live evaluation lives in `src/lib/thunai/holdout.live.ts` and spends real quota, so check the ledger first. The set still held out is `eval/holdout2/` (`HOLDOUT_DIR=holdout2`, `HOLDOUT_SET=live60`), with hashes in `HASHES.txt`, and a run refuses it if one has changed. Do not edit it, tune to it or open its rows: only totals have been read so far. `eval/holdout/` has been read, so use it for tuning.
