# Jarvis mode: results

Measured on 4 Nov 2026 on this Windows laptop, on branch `claude/jarvis-agentic-voice-5be9b7`. The brief is `docs/jarvis/OPUS_BUILD_PROMPT_V3.md`. Raw results are in `eval/holdout/results/`. The frozen sets were checked against `eval/holdout/HASHES.txt` before the final run, and all hashes match.

**In short, after the second pass below:** on a new frozen set of the same kind, the full pipeline went from 24/60 (40 %) on its first run to **44/60 (73.3 %)** on the finished code, and Tamil from 9/30 to **22/30**. It costs 64 % more tokens a sentence. Two calls in that final run met a Groq limit, so read the caveat in the section before quoting the figure. Side-talk false acts are unchanged, at 4/60 (6.7 %) against a 5 % target. **Nothing has been tried with a real microphone in a real room, and these sentences are typed text, not what Whisper hears.**

**In short, as first built (this report's older sections, kept as they were):** the safety gates, barge-in and mode gates pass. Understanding does not reach its targets: the rules are at 66.7 % against 85 %, and the full pipeline on the 40-sentence sample scored 42.5 %, with Tamil at 15.4 %. Side-talk false acts are 10 % against a 5 % target. The follow-up gate of 18/20 was reached only on a set I had already read; the unseen set scored 15/20 in code.

## Second pass: understanding, on a new held-out set (4 Nov 2026)

The sets in `eval/holdout/` had been read while the report was written, so they could no longer measure anything. Before any change, a new set was drafted and frozen in `eval/holdout2/`: 169 sentences (Tamil 78, English 48, Tanglish 43), a 60-sentence live sample with Tamil at half, and 100 ambient lines. Gemini drafted it from a prompt that sees no code (`draft.mjs`). A second model labelled every sentence blind, and the 15 where the two disagreed were dropped, so the set leans a little easier than a raw draft. The script never prints a sentence and no row has been read: only totals were looked at, so the set is still usable. The commits show the order: the freeze, then the scorer, then the first run, then the changes. All tuning used the old sets.

### The live sample: the same 60 sentences through the real pipeline

| | First run, unchanged code | Final, finished code |
|---|---|---|
| **All 60** | 24 (40 %, 28.6-52.6) | **44 (73.3 %, 61-82.9)** |
| English, 15 | 8 (53.3 %) | 13 (86.7 %) |
| **Tamil, 30** | 9 (30 %, 16.7-47.9) | **22 (73.3 %, 55.6-85.8)** |
| Tanglish, 15 | 7 (46.7 %) | 9 (60 %, 35.7-80.2) |
| Capacity failures counted | 0 | 0 |

**The caveat.** The final run's log has four refusals from Groq (429, `qwen` over its output tokens per minute), which the ledger does not track. Each time the next model answered, so no sentence went unanswered, but the rule is that a run with 429s is a capacity failure and not a clean score. The log does not tie them to sentences. Leaving out up to four sentences, the score stays between 71.4 % and 78.6 %, so the conclusion holds and the exact figure is provisional. It could not be re-run today, because that same run used up `qwen`'s day. The first run had no 429s. **The code has not changed since, so a clean re-run after the cap resets is fair, and should replace this figure.**

| By lane | First run | Final |
|---|---|---|
| Rules (quick) | 16/28 | 13/15 |
| Planner | 5/28 | 28/40 |
| Refuse | 2/2 | 2/2 |
| Frame | 1/2 | 1/2 |
| General | | 0/1 (the model's reply held a figure or was empty, so the "cannot reason" line was said, as it should be; scored wrong) |

| The planner's misses | First run | Final |
|---|---|---|
| Asked a clarifying question | 14 | 4 |
| Nothing usable left by the checker | 5 | 1 |
| A different screen | 4 | 7 |

| Right, by the model that answered (these saw different sentences, so this is a pointer, not a comparison) | First run | Final |
|---|---|---|
| `qwen3.8-27b` | 2/7 | 19/24 |
| `gpt-oss-20b` | 3/13 | 5/9 |
| `gpt-oss-120b` | 0/8 | 4/7 |

### What it costs

| | First run | Final |
|---|---|---|
| Sentences that used a model, of 60 | 28 | 41 |
| Tokens, whole run | 46,412 | 76,117 |
| Tokens a sentence, all | 774 | 1,269 (+64 %) |
| Tokens a sentence, Tamil | 973 | 1,679 (+73 %) |
| Tokens a model turn | 1,658 | 1,857 |
| Calls a model turn | 1.2 | 1.0 |
| A model turn, p50 / p90 | 1,015 / 1,767 ms | 1,174 / 2,557 ms |

This is the price of handing off, and it falls on one Groq organisation. At about 1,900 tokens a turn, the 8K-a-minute limit allows about four planner turns a minute per model, and Tamil now nearly always takes one, so most Tamil answers wait on a model rather than coming from the rules at once. **Today's evaluation used `qwen`'s whole daily allowance (199,936 of 200,000 by the ledger), so do not demo for 24 hours.**

### Rules and router alone: 169 sentences, no model

| | First run | Final |
|---|---|---|
| With hand-off | 66.9 % | **89.3 %** (83.8-93.2) |
| English | 79.2 % | 93.8 % |
| Tamil | 66.7 % | 91 % |
| Tanglish | 53.5 % | 81.4 % |
| Strict (code alone named the intent) | 33.7 % | 27.8 %, down on purpose |
| Wrong, with no model involved | 43 | 10 |
| The fast lane, when it answered | 49 of 89 right | 38 of 43 right |
| Handed to the planner | 69 | 112 |

This passes the 85 % and 80 % targets on paper, **but do not lean on it.** "With hand-off" only says the sentence reached a prompt that could serve it, not that the planner then got it right, and part of the rise is by definition, because the data and Tamil prompts now hold the screens. The live table is the real measure. The useful figure here is the fast lane: when it answers now, it is usually right.

### Side conversation: 60 side sentences, 40 commands, no name

| | First run | Final |
|---|---|---|
| Side talk that acted | 4/60 (6.7 %) | 4/60 (6.7 %), target 5 %. **Not met** |
| Of those, Level B or C | 0 | 0 |
| Commands accepted | 37/40 (92.5 %) | 36/40 (90 %) |

All four false acts are in Tanglish. The gate's wording rules were not changed.

### What changed

- **Scorer.** A general answer given as chat now counts as right; the lane's "cannot reason" line does not. A run on the new set refuses to start if a hash has changed.
- **Rules lane (`quick.ts`).** It answers only when it can account for the sentence's words and only one kind of question is being asked. A topic alone no longer becomes a list of its cases, and "closure rates" no longer becomes market prices.
- **Planner (`round.ts`).** `do` is the default, and clarify and chat are narrow. A general question has its own kind and label. If the model only asks back or chats about a sentence the rules can read, the rules' reading is shown (once in the final run). A model's refusal is never overruled.
- **Tamil.** Tamil and Tanglish get screens and console steps in one call, with their own examples. Loan words in Tamil letters are glossed, and localities and reservoirs are hinted.
- **Ladder (`llm.ts`).** `qwen` comes first while the minute has room.
- **False refusal (`privacy.ts`).** "Who wrote the book Mahabharata?" now goes to the general lane; "who wrote this complaint" is still refused. The 50 and 10 adversarial tests are green.

### Should a small model replace some address-gate rules?

The owner asked why Jarvis is not all AI. **Recommendation: not replace, but add one as a veto, and it has not been built, because it sends overheard sentences to a model and that is the owner's call.** The rules still decide first, and the model is asked only about a sentence they would already act on with no name, so it can stop an act and never add one. Safety and number rules stay in code either way.

| | Rules alone | With the veto |
|---|---|---|
| Old ambient set, which has been read: side talk that acted | 4/40 | **0/40** |
| Old ambient set: commands accepted | 34/40 | 34/40 |
| Frozen set | 4/60, 36/40 | **Capacity failure, no result** |

On the old set it took 38 calls, 140 tokens a call and 333 ms at p50, on the first prompt tried. On the frozen set `qwen` had no budget left, 31 of 40 calls got no answer, and that run (`final-gatemodel.json`) says nothing about accuracy. It does show that the other two models did not answer in time with so small an output limit, so the veto depends on `qwen`. **It needs a clean run on the frozen set before anyone relies on it.**

The arithmetic against an all-AI gate: at the worst-case 334 ambient sentences an hour, asking about every one costs about 47K tokens an hour, which is a model's whole day in about four hours of nonstop talk. Asked only about what the rules would act on, it should be a small fraction of that.

### Checks on the finished code

Vitest 1,917 passed, 13 skipped, including the 50 and 10 adversarial privacy tests; `tsc` clean; `next build` passes; Playwright voice specs 30 of 30 (`mode`, `bargein`, `hold`, `vad`, `vadfake`, `e2e-latency`, on injected audio). The HUD specs were not re-run, since nothing they cover changed. Raw results: `eval/holdout2/results/firstrun-*` and `final-*`. The tuning runs on the old sets are `eval/holdout/results/dev3-planner-final40.json` (33/40, tuned on), `dev6-planner-tamilrest.json` (30/37, Tamil no change was made against) and `dev5-gatemodel.json` (the veto).

### What this does not show

- **Real speech.** These are typed sentences. Tamil transcription has a WER near 0.5 (see below), so a Tamil speaker in a room will do worse than 73 %, by an amount not measured. Sentences in the frozen set are also a model's idea of how a Collector talks, not recordings of one.
- **The right place.** The scorer checks the kind of screen, not its slots, so the right screen for the wrong zone counts as right.
- **Comparing localities.** Most localities have no zone in the district reference, and compare needs zones, so "Mylapore and T Nagar" cannot be served. Seen on the old set; a gap in the data, not in understanding.
- **Tanglish** is now the weakest language, at 9/15, on few sentences.
- The changes were checked by tests and these runs, not by an independent review.

## Acceptance against section 12 of the brief

| Metric | Target | Result | Status |
|---|---|---|---|
| Existing suite plus new tests, tsc, build | all green (gate) | Vitest 1,887 passed, 13 skipped (Phase 0 baseline: 1,573 passed, 13 skipped); `tsc` clean; `next build` passes; Playwright voice specs 30 of 30, HUD specs 5 of 5 | Pass |
| Mode on: a command with no click and no name, the console acts | 3 scripted (gate) | `mode.spec` | Pass, on injected audio |
| Side conversation ignored | ≤ 5 % false acts of 40 (report); Level B/C = 0 (gate) | 4/40 = 10 %; Level B/C 0 | **Report target missed**; gate passes |
| Unnamed commands accepted | ≥ 80 % of 40 (report) | 35/40 = 87.5 % | Met |
| Mode off or muted: mic tracks stopped | verified in test (gate) | `mode.spec` | Pass |
| Hold words, "wait, do X", continue, noise-resume, late-transcript drop, no old answer after stop | named tests (gate) | `hold.spec`, `bargein.spec`, `turn.test.ts` | Pass |
| Barge-in from known speech start, PCM path | p50 ≤ 150 ms, p90 ≤ 250 ms (p90 gate) | p50 82 ms, p90 98 ms | Pass, on injected audio |
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
| Voice paused, from known speech start | p50 82 ms, p90 98 ms | p50 ≤ 150, p90 ≤ 250 |
| Detector fired | p50 82 ms | |
| Turn cancelled | p50 444 ms | |

No echo canceller and no real microphone are involved. The browser voice path cannot pause: it cancels and restarts the chunk.

## Latency, from the end of speech

**Mocked providers** (hear 450 ms, planner 1,200 ms, voice 400 ms), so these are the browser's overhead plus those constants. The p90s are inflated by clips that split at a pause.

| Mark | p50 | p90 |
|---|---|---|
| Acknowledgement | 776 ms | 3,141 ms |
| Answer on screen | 2,005 ms | 4,377 ms |
| First audio | 2,007 ms | 4,832 ms |
| First spoken finding | 2,007 ms | 4,832 ms |

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

The number went up on purpose. The low-budget window used to re-arm under nonstop talk, so after 8 sentences unnamed commands stayed out for good. It now ends after its minute. So nonstop talk costs up to 8 requests a minute in bursts, and this figure is the worst case, not a typical room. The ledger records Whisper's cap as 2,000 requests a day, so nonstop talk at this rate would reach it in about 6 hours, and the budget would then fall back to listening for the name only.

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
