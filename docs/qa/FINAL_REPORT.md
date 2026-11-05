# QA full pass: final report

The branch `qa/full-pass` is pushed but not merged. It was cut from `a999d42`, Apshana's accepted base.

All live model scores in this report are **Groq only** (qwen3.8-27b, gpt-oss-20b, gpt-oss-120b). Every other provider key was removed from the test process (`vitest.qa-live.config.ts`), and each row records the model that answered: 0 rows were answered by anything else. Claude was tested with mocks only. **The live Claude path is NOT VERIFIED.** Never compare these figures with the earlier 49/60, which was a Claude score.

## 1. Bugs

| | Found | Fixed | Open |
|---|---|---|---|
| P0 | 7 | 7 | 0 |
| P1 | 13 | 10 | 3 |
| P2 | 10 | 3 | 7 |
| P3 | 4 | 1 | 3 |

The list is in `BUGS.md`. Fixed means a test fails without the fix, except in rows marked otherwise. BUG-001, 002, 004, 006 and 020 were confirmed on the real console, on a production build, in a browser (`evidence/BROWSER.md`). BUG-020 was found that way. The skeptic's refutation of the first police fix is counted as BUG-005 and fixed.

**Remaining-bug estimate (rough).** Two independent hunters covered the same high-risk areas. They found 6 and 5 P0/P1 bugs, with 2 in common. The Lincoln-Petersen estimate is about 15 in those areas (Chapman 13), so roughly 4 to 6 were not found by either. Per pass, the hunters found 9 distinct P0/P1 bugs and the red team found 4 more P0s.

**Stop rule:** not met. One hunting pass ran, not the two clean passes the brief requires. No known P0 is open. 3 P1s are open: dev routes with no sign-in, `/api/i18n` with no session, and model chat lines that can spell out a name or email.

## 2. "chennai city police report": before and after (real runs)

**Before:** the unchanged code, live on Groq qwen3.8-27b, 1,198 tokens (`eval/holdout/results/qa-police-one-before.json`). It built a *cases* list filtered to police plus "Theft, snatching & fraud", and said:

> "23 cases today; here are the 4 that matter most. 2 are past their deadline and need you first: Wall collapse at Chetpet in Royapuram, and Hospital beds critical at Stanley in Royapuram. PWD Water Resources holds 2 of them. Say "read them", or "open" and a number."

That is not a brief, and it reads out case titles. The test data does not respect the filters, which is why PWD cases appear.

**After:** the final code, with no model, 0 tokens and the lane "resolve" (`qa-police-one-after.json`; the wording shown is the final code's, from `briefturn.test.ts`):

> "Taking that as Greater Chennai Police. 158 new incidents came in today; 392 cases are still open, and 76 are past the deadline. The one to look at first is in Royapuram. That backlog is the thing to chase today. These are generated police test records, not an official police report. These records are a few days old."

All 15 phrasings in the brief, including the Tamil ones, reach this same brief, with the same figures. Coimbatore, Tambaram, Avadi and Mumbai police get "I have no data on …". The Chennai corporation gets a corporation brief, and the city traffic report does not become a police brief. The police data is generated (`police_dataset_generator`), and the brief says so.

## 3. Explaining an issue: before and after (same record, test data)

- **Before** (`a999d42`'s template): "Past deadline. Severe, status Open, open for 6 hours. Government Hospitals handles it."
- **After:** "There's a hospital under strain at Stanley Hospital. It's been open for several hours, and it's past its deadline. It's one of the serious ones. I'd ask the health department for an update today."
- **Tamil after:** "ராயபுரம் பகுதியில் நெருக்கடியில் உள்ள மருத்துவமனை இருக்கிறது. சில மணி நேரமாக தீர்க்கப்படாமல் இருக்கிறது, கெடுவும் தாண்டிவிட்டது. இது கடுமையானவற்றில் ஒன்று. சுகாதாரத் துறையிடம் இன்றே நிலவரம் கேட்கலாம்."

## 4. Scores against targets

| Metric | Target | Result | Met? |
|---|---|---|---|
| Section 6 positive family, dev set | 100 % | 15/15 in code (`briefturn.test.ts`) | yes |
| Positive family under noise | ≥ 90 % | Not measured with a noise generator. Hand-made misspellings and mishearings pass (polis, grater, GCP, tan gen co, C M W S S B). | **not measured** |
| Negative family | 0 wrong confident matches | 0 out of 6 dev cases plus 10 of the skeptic's lookalikes | yes |
| Generality canaries | ≥ 90 % | **49/60 blind (81.7 %)** at first. After general fixes made with the misses in view: 56/60 (93.3 %). The second figure is not blind. | blind: **no** |
| Understanding on held-out, live (Groq) | ≥ 90 % | First run 14/40 (35.0 %, 22.1–50.5). **Final 27/40 (67.5 %, 52.0–79.9)** | **no** |
| Held-out by family, live final | | agency 8/9, explain 3/9, unknown 3/6, follow-up 5/6, other 8/10 | |
| Held-out, code lanes alone (180) | | 54/180 at first; 91/180 final (50.6 %, 43.3–57.8) with the resolver | **no** |
| Same model on both runs | | Only 7 rows: 4 right before, 4 after. Too few to compare. | |
| Tokens, live 40 | | 38,276 at first, 24,545 final. 25 of 40 answered in code. | |
| Capacity failures, invalid rows | | 0 and 0 in both runs | |
| Metamorphic language check | 100 % same facts | The 15 police phrasings (English, Tamil, Tanglish) give an identical KPI block (test). Not run on other families. | partly |
| Natural speech (blind judge) | ≥ 4/5 | **3.02** final against 2.33 first (one judge, 40 pairs) | **no** |
| Blind win rate | ≥ 80 % | Final preferred 15, first 5, ties 20: **75 % of decided pairs** (37.5 % of all) | **no** |
| Wrong numbers, privacy leaks, unsafe actions, injection successes | 0 | The red team's 4 P0 failures were fixed and are now tests. Not re-attacked by a fresh red team. | fixed; re-check pending |
| Copy-check violations in recipes | 0 | 0. The label gate runs on every recipe in both languages (`speechsweep.test.ts`). The copy gate is on the case retelling and the model's lines. | yes |
| Faults caught on critical logic | ≥ 90 % | See section 6 | |
| Resolver in process, p95 | ≤ 20 ms | Under 20 ms on a 300-character sentence with the whole suite running in parallel, 3 runs | yes |
| Acknowledgement, first audio, barge-in latency | | **Not measured** in this pass: no production latency run and no injected-audio run | **not measured** |

## 5. Product-readiness scorecard

Scores are out of 10, rounded down. A skeptic review of scores above 7 was not run, so no score above 7 is given.

| Area | Score | Evidence | What would make it 10 |
|---|---|---|---|
| Correctness | 6 | 7 P0s fixed (counts, weekly keys, privacy, injection). On the real console, severe events (17) and open complaints (128) match the independent oracle exactly; ongoing incidents (237 against 240) and past deadline (12 against 13) differ, explained by the app's own build hooks. The oracle found pipeline issues (933 cases past due but not flagged; the `kpis` complaints count). | The oracle compared against every screen; pipeline fixes; two clean hunting passes |
| Reliability | 5 | 2,180 tests green 3 times. No soak test, no provider-kill test, no restart test in this pass. | A 30-minute soak and the resilience tests in the brief |
| Security and privacy | 5 | Redaction and refusals hardened, and the old route closed. Open: dev routes with no sign-in, `/api/i18n` with no session. | Close OPEN-2 and OPEN-3; a fresh red team finds nothing |
| Data freshness and honesty | 5 | Generated feeds are labelled; briefs say how old the data is and where it comes from. Prices are 29 days old with no date; Ask District IQ still hides test data. | A live adapter for rain; the owner's decision on the labelling policy |
| Understanding | 5 | 67.5 % live (Groq); agency briefs 8/9; "explain this issue" only 3/9 | 90 % on the held-out set |
| Natural speech | 4 | Blind judge 3.02/5; label and copy gates in code | Judges at 4 or above; spoken-register Tamil |
| Tamil quality | 4 | Tamil briefs and retellings, a Tamil-ending fix. Written register; no native-speaker review. | A native-speaker review; spoken-register templates |
| Latency | 4 | No model on briefs (0 tokens), resolver p95 under 20 ms. End-to-end not measured in this pass. | A production latency run against the targets |
| Accessibility | 3 | Not tested in this pass (no axe run) | An axe-core pass and keyboard and screen-reader checks |
| Observability | 5 | Turn trace lanes, telemetry "resolve" events, live run rows with model, tokens and lane. No full per-layer trace UI. | The complete turn trace from the brief |
| Recoverability | 5 | Failed tray drafts are kept; late answers are dropped. Not tested under failure in a browser. | Resilience tests |
| Test depth | 6 | 2,180 tests, a frozen held-out set, canaries, a skeptic, two hunters, a red team. The mutation score is in section 6. | 90 % mutation kill rate; two clean passes |

## 6. Test strength (seeded faults)

Hand-seeded faults (`evidence/mutation.txt`): **20 of 22 caught (91 %)** in the resolver, the gazetteer, the number gate, privacy, the speech gates, injection and narration. The two misses were real test gaps: the TANGEDCO "no records" reply and spelled-out English numbers. Tests were added for both, and the re-run caught **22 of 22**. Target ≥ 90 %: **met**. These are hand-seeded faults, not Stryker.

## 7. Not verified

- The live Claude path, the Azure voice, and any real microphone.
- Latency targets. The production latency run was not repeated.
- Browser coverage: only what `evidence/BROWSER.md` lists, which is the sign-in page, the console KPIs against the oracle, and three Jarvis questions in the Chromium browser pane at 800x600. Edge, Chrome through Playwright, other viewports, Tamil overflow, keyboard and screen readers, and axe were **not run**.
- `host-tunnel.bat`: read only, never run.
- Writes to the real AWS store: never done. The store ran in dry-run mode on a local durable file.
- Fixes that live only in the client (tray, Studio race, captions yes): verified by code reading and unit-tested helpers only.

## 8. How to run the demo in Edge

1. From `E:\farm`, run `start-fast.bat`. It opens Edge, which has the natural Tamil and Indian English voices.
2. Sign in, then press `Ctrl+Shift+J` for Jarvis mode.
3. Follow the 5-minute check in section 7 of `JARVIS_SUGGESTIONS.txt` on the Desktop.
4. To run this branch's tests, from `chennai-grievance-portal-main`:
   - `npx vitest run`
   - `npx tsc --noEmit --incremental false`
   - Live, Groq only, which spends quota: set `QA_LIVE=live40` and run `npx vitest run --config vitest.qa-live.config.ts src/lib/thunai/qa.live.ts`

## 9. Documents in `docs/qa/`

| File | What it holds |
|---|---|
| `STATE.md` | Where the run stands |
| `FEATURE_MATRIX.md` | Every page, route and Jarvis action, with its risk |
| `BUGS.md` | Every bug, fixed and open |
| `RESEARCH.md` | Techniques and open-source projects, with licences |
| `DATA_SOURCES.md` | Every data source, its freshness, and the live plan |
| `JARVIS_VOICE.md` | The spoken style guide and the pronunciation lexicon |
| `hunt/` | The hunters' and the red team's reports |
| `evidence/` | Baselines, builds, the oracle, the blind judging, the live logs |
