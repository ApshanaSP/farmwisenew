# Jarvis v4: QA oracles changed for v4's intended behaviour

The QA gate (`tests/qa/pass7/gate-fast.sh`) was run on the v4 tip de40dd26. Pass 4's real-path suite came back red. Each red test is listed below
with one of three outcomes:

- **environment**: the test passes once the environment is fixed;
- **expected change**: the oracle pinned behaviour that the v4 brief (`docs/jarvis/ULTIMATE_JARVIS.md`) told Jarvis to change. The oracle was
  changed as little as possible, so it still guards the bug's real promise;
- **regression**: v4 broke something, so the code was fixed and a test was added that fails without the fix.

No oracle was weakened to hide a regression. Where v4's new screens made an old check pass without testing anything (a `not.toBe("case")`
that the new `explain` recipe slips past, or an English-only title check on a Tamil title), the check was widened to cover the v4 shape.

## Environment (no oracle change)

All Collector sign-ins on the QA servers failed with 401. The worktree's gitignored `data/aws-cache/qa/` was copied from elated-yalow at 11:30
(`pinned/rows.seeded.json.gz`, which holds the test accounts' bcrypt hashes). But `test-collector.txt` (the accounts' passwords) had already
been written fresh at 11:29, so the passwords no longer matched the hashes. The fix was to copy elated-yalow's `test-collector.txt` over it,
and every account now matches its seeded hash. After that, these files pass, each run alone: audit-ui_honesty 46/46, redteam-final 17/17,
gate-oracle-figures 3/3, golden-baseline 15/15, same-number 53/53, model-lifecycle 2/2 (both of its failures were the 401), and hunt-askiq 7/7
(askiq-4 `''` and askiq-5 `401` were the same 401).

The golden step's `no manifest for p7-gate-r3` had a different cause. That manifest was never committed, and it is not in elated-yalow. It was
rebuilt from `git show fe7c15d7:docs/qa/pass4/golden/p7-gate.manifest.json`, the round 3 gate whose recording is `p7-gate-r3`: all 789 body
hashes are in that recording.

## Expected changes (oracle updated)

| File | Test | Old expectation | New expectation | Why (brief) | Still guards |
|---|---|---|---|---|---|
| tests/qa/pass4/audit-understanding.test.ts | BUG-003 holds where the period is read (4 Tamil/Tanglish rows: indha maasam/vaaram brief sollu, இந்த மாதம் சுருக்கம், போலீஸ் அறிக்கை இந்த மாதம்) | `title` contains the English period ("the last 30 days", "this week") | the English title (`titles.en`, or `title` when a screen has no `titles`) contains the English period; on a Tamil screen (`lang: "ta"`), `title` must also contain the same period in Tamil (கடந்த 30 நாட்களில், இந்த வாரம், கடந்த 24 மணி நேரத்தில், கடந்த 90 நாட்களில்) | Pillar 1: bilingual `title`, so the title is in the turn's language (lane L1, 20460d31) | BUG-003: the asked period is said, in either language, and is the one asked for |
| same | audit-understanding-11 "the asked period is ignored" (10 Tamil rows) | `title` contains the English period | same as the row above (`saysPeriod`) | Pillar 1 | BUG-003, audit-understanding-11 |
| same | audit-understanding-11 "does not hand over today's" (5 rows) and "another week asked for" (3 rows) | `title` does not match `today` / `this week` | the English title does not match them; for "another week", a Tamil title must also not say இந்த வாரம் | Pillar 1: on Tamil turns these checks read a Tamil title and passed without testing anything | BUG-003, audit-understanding-11 |
| same | BUG-020 holds for the original words (6 rows) | `recipe` is `case`, the case is Adyar flooding | `recipe` is `explain`, and its CaseDetail is Adyar flooding | Pillar 3: the explain recipe, which retells one case on its own CaseDetail (0b850334 made the same change to the unit oracles in lane-a.pass4, pass3 and narrate) | BUG-020: with a police brief open, the request opens the Adyar flood case and does not re-scope the brief |
| same | audit-understanding-7 "the original words hold with a corporation brief open" | `recipe` is `case` | `recipe` is `explain`, and its CaseDetail is in Adyar | Pillar 3 | audit-understanding-7 |
| same | BUG-032 "is not one case" (7) and "is not the zone's top case" (6), audit-understanding-8 "no case from somewhere else" (2), audit-understanding-14 "not one case" (5) | `recipe` is not `case` | not one case: neither `case`, nor `explain` holding a CaseDetail (`isOneCase`) | Pillar 3: since one case now comes back as `explain`, `not.toBe("case")` would pass without testing anything. Explaining a change (no CaseDetail) is still allowed | BUG-032, audit-understanding-8, audit-understanding-14 (all 20 pass) |
| tests/qa/pass4/audit-narrate_and_figures.test.ts | BUG-004, BUG-031 "reads no field out" (3 rows) | `recipe` is `case` | `recipe` is `explain` and holds a CaseDetail; the rest of the test is unchanged (no field label, no INC- id or status words, opens "There's"/"There was") | Pillar 3 | BUG-004 (no field read out), BUG-031 |
| tests/qa/pass4/g2-cache.test.ts | RC-35 class guard "each is either epoch-aware or listed with its reason" | `components/collector/app/thunai/Thunai.tsx` is not in NOT_NEEDED | listed, with the reason: a browser throttle (warm-up once a minute) and a per-tick local Map, not a server cache | Pillar 2: pre-warm the prompt cache on mode-on (`warmUp`, Thunai.tsx:2274) | RC-35 |
| same | `timedCache` (the guard's detector) | `Date.now() - x <` only | also `now - v.at >` (the clock read into a variable first) | the guard could not see v4's new cache in signals.ts (see the regression below) | RC-35 class: a new timed cache over the store cannot hide from the guard |
| tests/qa/pass4/g2-real.test.ts | "a zone's brief has no conditions point: English" (Kodambakkam zone situation summary) | a Brief block exists and has no Conditions point | when the sentence opens the v4 `situation` screen: no Brief block, and any IMD finding carries its "for the district" caveat. Otherwise as before. Added the row "Kodambakkam zone summary", so the English zone brief is still checked | Pillar 3: situation synthesis ("situation" with one zone is the situation recipe, quick.ts:480) | RC-15: the district's conditions are never shown as a zone's |
| same | "a Tamil brief point holds no English headline: Tanglish" (Tiruvottiyur la situation epdi iruku) | a Brief block exists | when the sentence opens the `situation` screen: its Tamil line has Tamil letters and no run of 4 or more English words, and so do its findings on a Tamil screen. Otherwise as before. Added the row "Tiruvottiyur summary sollu" for the Tanglish zone brief | Pillar 3 | RC-15 |

All four files pass: 562/562 (audit-understanding 356, audit-narrate_and_figures 108, g2-cache 9, g2-real 89). g2-cache's "a write ... bumps
the epoch" passed in 9 s. In the gate it hit the 180 s timeout under the other lane's load, the same timeout main's round 4 gate recorded.

## Regression fixed

- **RC-35 in v4's watch, `src/lib/thunai/signals.ts` `cachedInput`.** v4 added a 60 s cache of the watch's store input, which includes the
  past-deadline stock with the Collector's decisions on top. Nothing emptied it after a decision. The fix calls `syncEpoch(cache)` before the
  cache is read. `cachedInput` is now exported and takes its loader, so it can be tested. The new test,
  `src/lib/thunai/signals.epoch.v4.test.ts` ("is shared within the minute, and read again after a decision"), failed before the fix (expected
  1 to be 2) and passes after it. The whole unit suite still passes (5496 passed, 13 skipped), and the type check is clean.

## Still red (not pre-existing: both passed in main's round 4 gate, 38d96d2f pass4-suite-gate.json)

- `grader/open-baseline.findings.test.ts` open-baseline-11 (ta-followup-06). The earlier turn, "Flood monitoring WRD இந்த வாரம் என்ன
  சொல்லுது?", now reaches the fast lane as a flooding-cases list. v4 registers WRD-CFM as a body with no records (entities.ts, lane D2), so
  `briefTurn` returns null for that wording. With "report" in the sentence it does say "has no records". The follow-up then carries the topic,
  not the body. The grader also finds "32 past their deadline" on last week's list, where its oracle says 20. Not decided: a routing change or a
  figure fault.
- same, open-baseline-46 (tanglish-brief-10, "Tiruvottiyur la situation epdi iruku"). This now opens the v4 situation screen (expected,
  Pillar 3). The grader fails it on four points: 7_action (it expects a brief); 5_language (the browser reads the situation screen's
  NewsReader items aloud, an English headline on a Tamil turn); 4_open_closed (a top case marked "past its deadline" that the oracle does not
  flag); and 3_figures (6 in the last 24 hours, where the oracle has 3). Also seen: `titles.en` is in Tamil, because recipes that return a
  one-language title get the same text in both halves (screens.ts:338).

## Golden master (p7-gate, as gate-fast.sh lane B runs it, on the gate's .next-qa build of de40dd26)

The run recorded 3298 requests, with 0 server errors (5xx) and 0 problems in 243 s. It exited with code 2 because of gaps, as main's gate
did: main had 4 gaps (the manu and profile routes with dynamic segments), and v4 adds 3 query parameters on v4 routes that the plan has no
values for (`thunai/audit?today`, `thunai/memory?view`, `thunai/watch?quiet`).

Diff counts:

- against p6-gate: 359 changed, 42 added, 21 removed (main's round 4 had 342 / 17 / 21);
- against p7-gate-r3: 73 changed, 35 added, 10 removed (main's round 4 had 23 / 10 / 10);
- against main's own round 4 recording, `p7-gate-main` (elated-yalow's p7-gate, manifest from 38d96d2f): 56 changed, 25 added, 0 removed;
- noise floor, p6-base to p6-base2: 3 changed, the same as main.

Every change against main's recording:

| Route | Change | Why |
|---|---|---|
| /api/collector/thunai/agent/round (41), /api/collector/thunai/agent (7) | `stage.lang`, `stage.titles`, `stage.notesBi` added; on Tamil turns the screen's own words are in Tamil: `title`, block titles, Ranking labels (zone names), `sub`, `method`, map `rule` and shade label, Note text | Pillar 1: bilingual title and notes, Tamil block titles (lane L1, 20460d31) |
| same | `say.ta` and `takeaway.ta` say the severity in Tamil (அதிக முக்கியத்துவம், not "High") and the zone in Tamil; every figure is unchanged | Pillar 1 and rule 2 (Tamil must work) |
| same, the "why" screen (4) | one sentence added: "Only two cases, so I wouldn't read much into it." | Pillar 4 persona: push back on thin data when a screen rests on 1 to 9 cases (0b850334) |
| same, the "nearby" screen (Tamil and Tanglish turns) | `say.ta` was Ask the Map's English headline ("13 hospitals within 1 km of Velachery"); it is now a Tamil line, "வரைபடத்தில் முடிவுகள் உள்ளன.", and `takeaway.ta` is "" | Pillar 1 (lane L1): no English line on a Tamil turn. No figure is invented, but the count is no longer said in Tamil and the Tamil takeaway is empty (screens.ts:1645). That is a small finding, not a regression of a QA bug |
| /api/collector/thunai/memory (collector, writes session) | POST 200 to 403 `{needsYes: true, error: "That needs your yes first."}`; so the GET that follows has 0 notes, not 1 | Rule 4 and Pillar 4: remembering is a Level B action and needs a yes first |
| /api/collector/studio/[id] (3) | `confirm.scope` hash | noise: changes on every run (in main's r3 to r4 diff too) |
| /api/collector/overview (2), /api/collector/search (1) | pin `lat`/`lon` | noise (in main's r3 to r4 diff too) |
| added: GET /api/collector/thunai/brief, /follow, /watch | collector 200; anonymous, citizen and officers 401 | Pillar 4: the proactive brief, follows and watch are new routes, for the Collector only |
| added: GET /api/dev/thunai/brief, /watch | 404 for every role | the dev routes are off in a production build |

Against p7-gate-r3 the diff adds main's own round 4 changes (/api/map/ask, /api/map/export, /api/collector/audit, explained in
docs/qa/fixall/EXPECTED_CHANGES.md) to the rows above. Nothing else changed: no status change other than memory's, and no figure changed on
any shared route. The golden master is green for v4.

The golden master ran on the gate's build, which does not include the signals.ts fix. That fix only affects the watch and brief routes
within 60 s of a decision, and the golden master's writes session does not read either of them.

## After the gate (coordinator, 15 Nov 12:30, `c8b0fb1e`)

- **open-baseline-46 is green again.** A zone's "situation" is the zone's brief again, as on main: the brief resolver answers before the situation screen (round.ts). The two g2-real rows above still pass, because their oracle accepts either screen.
- **open-baseline-11 (ta-followup-06) is still red, and is a v4 regression:** it was green in main's round 4 gate. What is known:
  - The brief resolver gives the same answer on main and v4 for both turns of the row (checked by running main's `entities.ts` against the row).
  - So the difference is upstream, in how the first turn is routed in v4: frame, fast lane or clarify. The follow-up then carries the topic instead of the WRD-CFM body.
  - To reproduce: `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/grader/open-baseline.findings.test.ts`.
  - Left open for the owner; not hidden.
