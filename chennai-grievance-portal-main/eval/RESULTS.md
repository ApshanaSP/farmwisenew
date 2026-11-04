# Jarvis mode: results

Measured on 4 Nov 2026 on this Windows laptop, on branch `claude/jarvis-agentic-voice-5be9b7`. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Raw results are in `eval/holdout/results/`. The frozen sets were checked against `eval/holdout/HASHES.txt` before the final run, and all hashes match.

**In short:** the safety gates, barge-in and mode gates pass. Understanding does not reach its targets: the rules are at 66.7 % against 85 %, and the full pipeline on the 40-sentence sample scored 42.5 %, with Tamil at 15.4 %. Side-talk false acts are 10 % against a 5 % target. The follow-up gate of 18/20 was reached only on a set I had already read; the unseen set scored 15/20 in code. **Nothing has been tried with a real microphone in a real room.**

## Acceptance against section 12 of the brief

| Metric | Target | Result | Status |
|---|---|---|---|
| Existing suite plus new tests, tsc, build | all green (gate) | Vitest 1,887 passed, 13 skipped (Phase 0 baseline: 1,573 passed, 13 skipped); `tsc` clean; `next build` passes | Pass |
| Mode on: a command with no click and no name, the console acts | 3 scripted (gate) | `mode.spec` | Pass, on injected audio |
| Side conversation ignored | ≤ 5 % false acts of 40 (report); Level B/C = 0 (gate) | 4/40 = 10 %; Level B/C 0 | **Report target missed**; gate passes |
| Unnamed commands accepted | ≥ 80 % of 40 (report) | 35/40 = 87.5 % | Met |
| Mode off or muted: mic tracks stopped | verified in test (gate) | `mode.spec` | Pass |
| Hold words, "wait, do X", continue, noise-resume, late-transcript drop, no old answer after stop | named tests (gate) | `hold.spec`, `bargein.spec`, `turn.test.ts` | Pass |
| Barge-in from known speech start, PCM path | p50 ≤ 150 ms, p90 ≤ 250 ms (p90 gate) | p50 81 ms, p90 90 ms | Pass, on injected audio |
| Ack and first-audio latency | mocked and one real run (report) | See "Latency" | Reported |
| Follow-ups | 18/20 (gate) | 18/20 on the set I had read; **15/20 in code on the unseen set**, the other 5 go to the planner and were not scored | **Not met cleanly** |
| Compare, insights, complete this data end to end | 3/3, filled cells show sources (gate) | 3/3 in `owner.test.ts`, code and mocked model | Pass; not run on real Studio data |
| Understanding, 150 via rules and router | ≥ 85 %, Tanglish ≥ 80 % (report) | 66.7 % with hand-off (Tanglish 65 %); 36.7 % strict | **Missed** |
| Unsupported numbers rejected | 1,000 generated cases (gate) | Property test in `chunker.test.ts` | Pass |
| Privacy adversarial; never send, approve, delete | 50 and 10 cases (gate) | `privacy.test.ts` | Pass |
| Removing Groq keys: completes or says "cannot reason" within 8 s | integration test (gate) | `owner.test.ts`: with Gemini up it answers from Gemini under 2.5 s; with no keys it says so in time | Pass, with Gemini stubbed |
| HUD: speaking ≥ 55 fps, reduced motion ≥ 59 fps, Tamil legible, UI review passed | measured (report) | speaking 144.1 fps, reduced motion 144.1 fps; UI review 25 findings, see below | Met in headless Edge only |
| Tokens per turn; ambient requests per hour | measured (report) | 1,682 tokens per model turn; 334 ambient requests an hour under nonstop room talk, 0 to the planner | Reported |

## First run versus final

First-run files are `firstrun-*.json`, kept as they were, and final files are `final-*.json`. Between them came generic fixes and the fixes from the independent review. No sentence was special-cased.

### Understanding: 150 sentences through rules and router, no model

"Strict" means code alone named the intent. "With hand-off" also counts a sentence correctly passed to the planner with a prompt bundle that can serve it, and says nothing about whether the planner then got it right.

| Set | n | `main` baseline | First run, strict | Final, strict | First run, with hand-off | Final, with hand-off (95 % interval) |
|---|---|---|---|---|---|---|
| All | 150 | 20 % | 36.7 % | 36.7 % | 62.7 % | **66.7 %** (58.8-73.7) |
| English | 60 | 30 % | 55 % | 55 % | 68.3 % | 70 % (57.5-80.1) |
| Tamil | 50 | 10 % | 14 % | 14 % | 62 % | 64 % (50.1-75.9) |
| Tanglish | 40 | 17.5 % | 37.5 % | 37.5 % | 55 % | 65 % (49.5-77.9) |

In the final run, 34 sentences were wrong and 16 deferred. No capacity failures, since no model is involved.

### Full pipeline on the frozen sample, live models

| Run | n | Right | Wrong | Capacity failures | Tokens |
|---|---|---|---|---|---|
| `main` baseline, 20-sentence sample | 20 | 11 (55 %, 34.2-74.2) | 9 | 0 | about 3,700 a sentence |
| **Final, 40-sentence sample** | 40 | **17 (42.5 %, 28.5-57.8)** | 23 | 0 | 1,682 per model turn, 1.2 calls per model turn, 28,599 in all |

| Language | n | Right |
|---|---|---|
| English | 16 | 8 (50 %) |
| Tamil | 13 | **2 (15.4 %)** |
| Tanglish | 11 | 7 (63.6 %) |

This sample was run once, on the finished code, and I did not tune to it. The two samples differ and their intervals overlap, so this does not show that accuracy fell or rose against `main`. It does show that token cost fell by more than half, and that accuracy is not good enough, least of all in Tamil.

Where the 23 misses came from:

| Lane | Right | Wrong | What the misses look like |
|---|---|---|---|
| Rules (quick) | 10 | 10 | A confident wrong screen with no model involved, for example prices or cases where performance, why or nearby was meant. **This is the first thing to fix** |
| Planner | 5 | 11 | Four asked a clarifying question and two answered as chat where a screen was expected. Two more were dropped by the checker, one was refused, and the others picked the wrong intent |
| Frame | 2 | 0 | |
| General | 0 | 1 | "What is the capital of Australia?" was answered as chat, which is what the lane is for. **My scorer has no match from general to chat, so this one miss is the scorer's.** Counted fairly it is 18/40. I have left the figure as scored |
| Refuse | 0 | 1 | "Who wrote the book Mahabharata?" refused as private, in code. A false refusal |

17 of the 40 sentences used a model at all. Groq's limits sent several of those to `gpt-oss-20b` and `gpt-oss-120b` rather than `qwen3.8-27b`, by the ledger's ordering rather than by a 429. p50 for a model turn was 1,454 ms.

### Side conversation: 40 side sentences, 40 commands, no name

| | First run | Final |
|---|---|---|
| Side talk that acted | 3/40 (7.5 %) | **4/40 (10 %)** |
| Of those, Level B or C | 0 | 0 |
| Commands accepted | 36/40 (90 %) | 35/40 (87.5 %) |

The final run is slightly worse than the first. The address gate was widened after the review found ordinary wordings it got wrong, and this set was not used for that work. I left it there rather than tune to the set. By language, the false acts are Tamil 1/12, Tanglish 3/12 and English 0/16.

### Follow-ups

| Set | First run | Final |
|---|---|---|
| `followups.jsonl`, 20 | 6/20 (16 resolved in code) | 18/20 |
| `followups2.jsonl`, 20, written later and unseen at its first run | 15/20 in code | 15/20 in code |

**The gate's 18/20 was reached only on a set I had read while fixing the scorer and the frame, so it is no longer held out.** That is why the second set exists. On that set, 15 resolve in code and the other 5 go to the planner, whose answers were not scored. The fair reading of the gate is "15/20 unseen, plus whatever the planner adds".

### Tamil transcription: 100 SLR65 clips (60 clean, 40 noisy)

Noise is synthetic babble from 8 other clips plus pink noise at 10 dB, and is labelled so. Language forced to Tamil, with the place-name prompt, except for the race, which sees the site's language.

| Transcriber | CER | WER | Clean CER / WER | Noisy CER / WER | p50 | Capacity failures |
|---|---|---|---|---|---|---|
| `whisper-large-v3` | 0.140 | 0.504 | 0.156 / 0.517 | 0.115 / 0.486 | 447 ms | 0 |
| `whisper-large-v3-turbo` | 0.157 | 0.626 | 0.138 / 0.606 | 0.186 / 0.657 | 368 ms | 0 |
| **The shipped race, `hearUtterance`** | **0.131** | **0.503** | 0.143 / 0.511 | 0.114 / 0.490 | 546 ms | 0 |
| `gemini-3.5-transcribe`, 12 clips only | 0.127 | 0.340 | | | 2.6 s | see below |

The race read all 100 clips as Tamil with the site set to English. A WER near 0.5 is high: this is speech-corpus Tamil, and Tamil word boundaries inflate WER, but it still means about one word in two differs.

## Capacity failures, shown separately

| Run | What happened | How it is treated |
|---|---|---|
| Full Gemini transcribe pass, Phase 0 | 429 on 96 of 100 | **A capacity failure, not an accuracy score.** Only the 12-clip probe is quoted above. The ledger now caps this model at 20 a day, and it runs only as a third racer when Whisper is unsure |
| Bedrock probe | `AccessDeniedException`, bearer token expired | Rung off |
| Ollama probe | No reply in 60 s | Dropped, per the phase's cut line |
| Every run in the tables above | 0 capacity failures | |

## Barge-in, injected audio through the real worklet and Silero, PCM path

| | Measured | Target |
|---|---|---|
| Voice paused, from known speech start | p50 81 ms, p90 90 ms | p50 ≤ 150, p90 ≤ 250 |
| Detector fired | p50 80 ms | |
| Turn cancelled | p50 389 ms | |

No echo canceller and no real microphone are involved. The browser voice path cannot pause: it cancels and restarts the chunk.

## Latency, from the end of speech

**Mocked providers** (hear 450 ms, planner 1,200 ms, voice 400 ms), so these are the browser's overhead plus those constants. The p90s are inflated by clips that split at a pause.

| Mark | p50 | p90 |
|---|---|---|
| Acknowledgement | 782 ms | 3,142 ms |
| Answer on screen | 2,010 ms | 4,369 ms |
| First audio | 2,015 ms | 4,826 ms |
| First spoken finding | 2,015 ms | 4,826 ms |

**One real run, production build with real providers:**

Real Whisper, real planner and the real voice ladder in Edge, on the measuring build (`NEXT_PUBLIC_JARVIS_SPEC=1`, `next start`). Audio is injected. This is one run, with few samples, so read it as an indication only.

| Sentence, as heard | Lane | Ack | Answer on screen | First audio, and first spoken finding | Tokens |
|---|---|---|---|---|---|
| "Show the severe cases in Udyar." | rules | 760 ms | 781 ms | 896 ms | 0 |
| "Show me the flooding complaints in Vela Cherry." | rules | 827 ms | 864 ms | 875 ms | 0 |
| "What about the rain in Peringudi today?" | rules | 825 ms | 850 ms | 857 ms | 0 |
| "put together something useful for my morning." | planner | 788 ms | 2,820 ms | **2,826 ms** | 1,265 |
| "how is the metro water backlog looking overall?" | rules, by its token count | 726 ms | 751 ms | 755 ms | 0 |
| "Go to the trends page" | plain move, no speech | | | | 0 |

The rules' p50 for the first spoken finding is 875 ms. **Only one sentence in this run needed the model**, so 2,826 ms is one sample, not a planner figure. On that turn Groq returned a JSON 400 twice before an answer came, and that time is included. Place names came back misheard from English Whisper ("Udyar", "Vela Cherry", "Peringudi"), and the rules still found them. The earlier dev-server run is kept in `latency-real.json`; this one is `latency-real-prod.json`.

## Ambient listening, 10.1 minutes of room talk with nothing addressed to Jarvis

Detector and budget are real; the transcriber is mocked.

| | Before the budget fix | Final |
|---|---|---|
| Sentences spoken | 146 | 146 |
| Requests to the transcriber | 8 | 56 |
| An hour, at that rate | 48 | **334** |
| To the planner | 0 | 0 |

The number went up on purpose. The low-budget window used to re-arm under nonstop talk, so after 8 sentences unnamed commands stayed out for good. It now ends after its minute. So nonstop talk costs up to 8 requests a minute in bursts, and this figure is the worst case, not a typical room.

## HUD

A 20-second `requestAnimationFrame` count in headless Edge, with the HUD over the console and nothing else running:

| State | fps | Worst frame |
|---|---|---|
| Speaking | 144.1 | 8 ms |
| Reduced motion | 144.1 | |

Screens are in `docs/jarvis/screens/`: 40 images, English and Tamil, at 1366 and 1920.

The target was a real display. Headless Edge is not vsync-limited, so those figures show headroom, not what a Collector's screen would show. A separate review of the HUD raised 25 findings. 1 to 5, 7, 9 to 16 and 18 to 24 were fixed. 6 was settled by amending the rule (96 px with a Stage open). 8 and 17 are partly fixed (see Tamil under Known limits in `HANDOVER.md`). 25 is the owner's call.

## Independent review of the finished code

Five reviewers each read one risk area, and one skeptic per area tried to refute each finding. Of 60 findings, **57 were upheld, 3 refuted**. Four were blockers:

- `spoken()` dropped the integer part of every decimal, so 33.4 °C was said as "4 °C".
- A barge-in's audio started at the previous sentence.
- Jarvis could press the Verify button, which closes a severe incident for the citizen, and a bare "Yes" that deletes a dataset.
- A provider that failed fast still waited out the hedge timer, which cost 3.5 s per rung and missed the 8 s gate with Gemini healthy.

**All four blockers were real, and the earlier tests had passed with them present.** All 19 highs were fixed or fixed with a stated limit. These are the ones not fully closed:

| Finding | Status |
|---|---|
| 46 (low): the browser discards a turn's facts at 8 s, and a non-OK round goes to the analyst | Not fixed |
| 51 (low): on non-answer screens the number gate approves whatever the screen's `say` holds, so a model's `q: "flood deaths 300"` could be said as "headlines about flood deaths 300" | **Not fixed.** A real hole in "every number from code", on a narrow path |
| 54 (low): Studio column lookup mismatch in `data.ts` | Partly: `safeHands` now redacts `map` and `dataset`, the lookup remains |
| 57 (low): the power-on's tone still plays once under reduced motion | Partly |
| 18: "Jarvis, don't draft" still reaches the planner at tier 1 | Fixed except this |
| 22: HUD panels now let clicks through and hide for the console's popovers, but have no close control and can cover content by sight | Fixed except this |
| 36: a phone number spoken in single digits, "9 8 7 6…", is not masked | Fixed except this |
| 37: some errands still act when engaged, for example "take me to the hospital" within 20 s of a turn; no Tanglish statement class | Partly, by design |

The review's fixes went in after the first-run numbers and before the final ones. **They were checked by unit and browser tests and by reading part of the diffs, not by a second independent review.** The address gate in particular grew a good deal in that work (`addressed.ts`, `wake.ts`), and the side-talk figure above did not improve.

Running the specs after the fixes also found one more real bug: a sentence that went on after a short pause lost its first part. The old re-ask behaviour had been hiding this. It is fixed, with a test.

## Not verified

- **A real microphone in a real room:** AEC, its echo margin, and Jarvis hearing itself through speakers. All barge-in and latency figures are from injected audio.
- **End of utterance at 300 ms in real speech.** It splits sentences in recorded fixtures.
- **A Tamil voice heard by a person.** Tamil speech through the browser path was not exercised; no Tamil voice can be captured on this PC. Tamil is covered by the ASR set and text-level tests.
- **The speech path on the signed-in console.** `/dev/collector` was used on the dry-run store with the typed path; the voice specs run on the dev harness.
- **Live captions within 150 ms.**
- **The Azure branch.** No key exists, so it has never run.
- **The Bedrock rung.** The token has expired.
- **A live hedge** firing against a slow real provider. It is unit-tested, and Gemini's schema path was proved with one live call.
- **The reticle's position on a loaded real map.**
- **Complete this data on a real Studio dataset**, and on real rows through `slots.ids`.
- **HUD fps on a real display**, and the CSS fixes for finding 22 and 40 beyond the screenshots.
- **The planner's answers on the 5 unseen follow-ups** it was handed.
- **Whether the review's fixes introduced new defects** beyond what the tests catch.

## Conditions that affected measurement

The final real-latency run overlapped the 10-minute ambient run on the same laptop, to fit the session's time limit. That can only slow it. The screens and fps were re-run afterwards with nothing else running. Quota use for the day came from these runs on one Groq organisation, so do not demo within 24 hours.
