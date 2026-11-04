# Jarvis mode: handover

Branch `claude/jarvis-agentic-voice-5be9b7`, not merged to `main`, no PR. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Numbers are in `chennai-grievance-portal-main/eval/RESULTS.md`, the day's record is in `docs/thunai/BUILD_LOG.md`, and pictures are in `docs/jarvis/screens/`.

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
- **Understanding through rules alone is below the 85 % target** in the report-only metric. The planner picks up what the rules hand it, at a cost in quota.
- **Quota is the real ceiling.** The three Groq keys are one organisation, so they add nothing: 8K tokens a minute, and a daily cap that one evaluation run can use up. The Gemini transcriber allowed about 28 calls in a day, so it runs only as a third racer when Whisper is unsure.
- **Tamil voice needs Edge.** Elsewhere the words stay on screen.
- **Tamil coverage on screens is partial.** Only the `cases` recipe's labels are Tamil at the source. Other recipes rely on the runtime translator, `when()` writes English months, and HUD panel titles use the screen's title as it comes.
- **Noise figures for Tamil transcription use synthetic babble**, and are labelled so.
- **The ledger is a local SQLite file** (`node:sqlite`, with a memory fallback). A hosted deployment with more than one process needs a different store behind the same interface.
- **Whisper's end of utterance at 300 ms** splits "Jarvis," from what follows. The name alone now engages and listens on, but this is the first thing to retest in a room.
- **A sentence still at Whisper when someone else talks for 200 ms is lost.** The Collector has to say it again.

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

Live evaluation lives in `src/lib/thunai/holdout.live.ts` and spends real quota. The frozen sets are in `eval/holdout/`, with hashes in `HASHES.txt`. Do not edit them or tune to them.
