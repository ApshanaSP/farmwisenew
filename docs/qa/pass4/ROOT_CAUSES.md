# Root causes, QA pass 4

Triage of 258 findings from 17 finding files and the open-baseline report. 51 are duplicates (kept in BUGS.json with duplicate_of). Findings are claims. Where the cause was unclear the named code was opened (outside.ts and entities.ts:250-257, screens.ts:412-418, decisions/route.ts:83-90, intel.ts:44-47, officer/data.ts:225-230, and the SCAN-1 to SCAN-3 text). The rest is as the finding agents reported it. Rows and clusters: docs/qa/pass4/BUGS.json.

Lanes: a Jarvis understanding, b figures and time, c security, robustness and gates, d console, officer, citizen and honesty. A dash means not queued.

| id | sev | findings (rows, distinct) | kind | lane |
|---|---|---|---|---|
| RC-01 | P0 | 20, 5 | app | a |
| RC-02 | P0 | 12, 8 | app | a |
| RC-03 | P0 | 8, 6 | app | a |
| RC-04 | P0 | 8, 7 | app | a |
| RC-05 | P0 | 13, 13 | app | a |
| RC-06 | P0 | 11, 4 | app | a |
| RC-07 | P0 | 5, 4 | app | a |
| RC-08 | P0 | 7, 3 | app | b |
| RC-09 | P0 | 4, 4 | app | b |
| RC-10 | P0 | 6, 5 | app | b |
| RC-11 | P0 | 3, 3 | app | b |
| RC-12 | P0 | 5, 2 | app | b |
| RC-13 | P1 | 2, 2 | app | b |
| RC-14 | P1 | 4, 3 | app | a/b/d |
| RC-15 | P2 | 8, 7 | app | b |
| RC-16 | P1 | 1, 1 | app | b |
| RC-17 | P0 | 1, 1 | app | c |
| RC-18 | P0 | 8, 7 | app | c |
| RC-19 | P0 | 8, 8 | app | c |
| RC-20 | P0 | 1, 1 | app | c |
| RC-21 | P1 | 1, 1 | app | c |
| RC-22 | P0 | 2, 2 | app | c |
| RC-23 | P1 | 4, 4 | app | c |
| RC-24 | P1 | 3, 1 | app | c |
| RC-25 | P1 | 6, 6 | app | c |
| RC-26 | P0 | 5, 4 | app | d |
| RC-27 | P0 | 12, 11 | app | d |
| RC-28 | P0 | 3, 3 | app | d |
| RC-29 | P0 | 11, 10 | app | d |
| RC-30 | P0 | 4, 2 | app | d |
| RC-32 | P1 | 4, 4 | app | d |
| RC-33 | P1 | 11, 11 | app | d |
| RC-34 | P0 | 2, 2 | app | d |
| RC-35 | P2 | 2, 1 | app | - |
| RC-36 | P2 | 16, 16 | app | - |
| RC-37 | P2 | 4, 4 | app | - |
| RC-38 | P2 | 4, 4 | app | - |
| RC-39 | P2 | 20, 20 | pipeline | - |
| RC-40 | P1 | 5, 5 | owner | - |
| RC-41 | P1 | 4, 2 | environment | - |

## RC-01: Outside-the-district place or body is decided by a closed list, and the check is skipped in several lanes

- Severity: P0 (highest in the cluster). Explains 20 findings (5 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/outside.ts:7-17 and :26-38 list districts and big cities only; src/lib/thunai/entities.ts:255 skips the outside check when the only hit is a zone, and :264-266 takes any word before 'department' as an unknown agency; src/lib/thunai/quick.ts:251-291 builds screens with no outside check; src/lib/thunai/understand.ts has no outside check before view steps (13 no-model rows).
- Why earlier tests missed it: Earlier fixes (BUG-002, BUG-030) were tested with the one or two named cities, and in the resolver only. The fast lane and the no-model rules take other paths that never call the check.
- Guard: A default of 'ask, do not answer' for any unknown proper noun beside an agency word, one shared function used by every lane, and a property test that crosses a list of Indian towns with every agency head in English, Tamil and Tanglish.
- Rows: PB-018, PB-019, PB-036, PB-037, PB-038, PB-039, PB-054, PB-117, PB-118, PB-119, PB-120, PB-121, PB-122, PB-123, PB-124, PB-125, PB-126, PB-127, PB-128, PB-129

## RC-02: Fuzzy and sound matching turns ordinary words and foreign names into zones, bodies, reservoirs and cases

- Severity: P0 (highest in the cluster). Explains 12 findings (8 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/entities.ts:232-244 (wordScore: one edit on a one-word alias scores 0.86 and passes the 0.8 bar at :335; short pieces are joined, for example inta + varam near madavaram); :54-55 and :79-83 (Anna alone becomes Anna Nagar); :351-361 localities by exact spelling only; src/lib/thunai/normalise.ts:163 taMatch cuts a name ending in the vowel sign to its stem; src/lib/thunai/understand.ts:299 reservoir by sound; number words become zones or cases in understand.ts and normalise.ts. OPEN-17 (a body's name inside a longer name) is the same class.
- Why earlier tests missed it: Tests used clean names. There is no list of everyday words that must never match, and no test with sentences that hold no place at all.
- Guard: A stop list of ordinary Tamil, Tanglish and English words per alias, a rule that a fuzzy hit needs a second signal, and a negative property test: random everyday sentences must resolve to no entity.
- Rows: PB-020, PB-021, PB-040, PB-041, PB-091, PB-099, PB-130, PB-131, PB-132, PB-133, PB-134, PB-135

## RC-03: Short words are matched inside longer words, with no word edge

- Severity: P0 (highest in the cluster). Explains 8 findings (6 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/quick.ts:80 catIn uses indexOf for Tamil words (the word for severe is heard as fire); quick.ts:87-91 sevIn takes high or low anywhere (lexicon.ts:94-98); src/lib/thunai/plan.ts:324 NAV_VERB has a short Tamil verb stem and pannu with no boundary, so it matches inside the word for police; src/lib/thunai/understand.ts:202 and gloss.ts explain words (vilakku) match inside lamp words. The plain-object lookup at normalise.ts:73,97 (RC-14, scans-code-1) is fixed in this lane in the same file.
- Why earlier tests missed it: Tests were written in English, where a boundary exists in the regex. Tamil has no boundary rule in the code, and the static word audit was never turned into a test.
- Guard: One shared matcher that takes a boundary rule per script, and a test that runs every word-list entry against the real data vocabulary (docs/qa/pass4/evidence/word-patterns.md) and fails on any hit inside another word.
- Rows: PB-012, PB-024, PB-025, PB-114, PB-115, PB-116, PB-205, PB-206

## RC-04: A command reflex or an English-only guard list takes a question, a keeping note or a forbidden order

- Severity: P0 (highest in the cluster). Explains 8 findings (7 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/plan.ts:324-336 (isNavCommand, speed as a reflex: 'show', 'please show me', the Tamil slow word) and src/components/collector/app/thunai/Thunai.tsx:1177-1183 act on it and the model is never asked; src/lib/thunai/entities.ts:314 and :348 NOT_A_BRIEF holds English words only (no change, maathu, remind or type in Tamil) while the same words reach the fast lane unguarded; src/lib/thunai/quick.ts:239 reads 'click trends' as the trend recipe; src/lib/thunai/understand.ts:278 opens a workspace by an English-only pattern. The privacy.ts half of open-baseline-45 is in RC-18; this lane fixes only the plan.ts half.
- Why earlier tests missed it: Each fix was added in one lane (BUG-001, BUG-022). The same words travel through three other lanes, and no test sent one sentence through all of them.
- Guard: One intent gate in front of every lane, with the command, keep, forbidden and question classes in a table by language; a cross-lane test that sends the same sentence to every lane and requires the same class.
- Rows: PB-042, PB-086, PB-090, PB-098, PB-110, PB-136, PB-137, PB-156

## RC-05: Category, filter and deadline word lists are closed, ordered wrong, or drop a filter, so the answer is about another thing

- Severity: P0 (highest in the cluster). Explains 13 findings (13 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/lexicon.ts:64-92 CAT_ALIASES (no flood relief, no drain; the bare word water beats lakes at :77); src/lib/thunai/quick.ts:120 and :258 (unresolved is in COMPLETE), :209-210 (one unknown topic word is let through), :288-293 and :290 (status is only ever overdue; few deadline words); the zone branch ignores deadline, ward and category filters; src/lib/thunai/normalise.ts:109 detectLang reads a zone name as the language.
- Why earlier tests missed it: The metamorphic suite (same question, other words) was not part of earlier passes. Earlier tests checked one phrasing per feature.
- Guard: Run the metamorphic suite as a gate (tests/qa/pass4/metamorphic.test.ts), plus a rule that a lane may not drop a recognised filter: if any slot is read but not applied, ask.
- Rows: PB-032, PB-033, PB-034, PB-035, PB-052, PB-053, PB-093, PB-094, PB-111, PB-112, PB-173, PB-203, PB-204

## RC-06: Period words and ranking questions are not read the same in the fast lane, so the window or the question is lost

- Severity: P0 (highest in the cluster). Explains 11 findings (4 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/quick.ts:92-98 periodIn matches week and month anywhere and has no yesterday, no quarter forms, no last-week or last-month, and few Tamil forms; quick.ts:284 ranking drops the category and answers with the all-topics list; src/lib/thunai/entities.ts:343 briefs know week and month and fall back to daily.
- Why earlier tests missed it: Periods were tested on the helper, not on the path. The two lists of period words (quick and entities) were never compared.
- Guard: One period table used by every lane, with a test that feeds every word in the table through each lane and checks the window said in the answer.
- Rows: PB-043, PB-044, PB-045, PB-046, PB-047, PB-048, PB-049, PB-050, PB-080, PB-092, PB-144

## RC-07: A request is re-scoped or has a word dropped between lanes (explain one, follow-up frame, the stage's own filter)

- Severity: P0 (highest in the cluster). Explains 5 findings (4 distinct, the rest duplicates). Kind: app. Lane: a.
- Mechanism: src/lib/thunai/quick.ts:236 NOT_ONE is a closed list of rise words and :247-252 ignores a place that gives no zone when a topic was read; src/lib/thunai/frame.ts:85 treats anything of six words or fewer with no listed verb as a follow-up; src/lib/thunai/stagelocal.ts:62-63 takes any 'only X' as a local filter without checking the open screen.
- Why earlier tests missed it: Follow-ups and explain were tested with the listed verbs. The closed lists made the tests pass.
- Guard: Replace 'no verb listed means follow-up' with a positive follow-up signal, and ask when a named place cannot be resolved instead of dropping it.
- Rows: PB-006, PB-022, PB-023, PB-095, PB-100

## RC-08: Counts and totals are taken from one page of a list (12 rows) after the slice

- Severity: P0 (highest in the cluster). Explains 7 findings (3 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/thunai/screens.ts:414-417 asks the incidents tool for open, page 0, then keeps the overdue rows of that page; :425-437 and :461-473 count overdue and 'held by' after the slice; the same pattern at :233, :368, :432, :514, :1072; :411 and :485 define 'severe' differently from the tile.
- Why earlier tests missed it: The tests used a fake tool that returned all rows at once, which hid the paging. BUG-007 and BUG-021 were checked on the helper.
- Guard: Get every count from a count query, never from rows on screen; a test that runs the real tool with more rows than one page and compares to the oracle.
- Rows: PB-002, PB-004, PB-016, PB-017, PB-058, PB-059, PB-215

## RC-09: A department, zone or dashboard figure is read from a wider scope than the one asked

- Severity: P0 (highest in the cluster). Explains 4 findings (4 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/thunai/screens.ts:993 adds every row of deptMeasures; :1032-1037 zone performance sums the zones tool and drops the zone filter; :1070 the dashboard reads the zones tool with zone null; :1226 and :1272-1275 a body's brief for one zone names no zone.
- Why earlier tests missed it: Tests compared the district and never the filtered scope against the tile.
- Guard: A same-number test that runs every screen with each filter and compares to the console tile; the screen must say its scope in its title.
- Rows: PB-060, PB-067, PB-096, PB-142

## RC-10: Ask District IQ's rules lane has its own window and language handling: yesterday, rolling windows, Tamil count words, label

- Severity: P0 (highest in the cluster). Explains 6 findings (5 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/assistant/fastpath.ts:694-700 returns a range and an offset of 1 together and matches one Tamil form of yesterday only (:53 knows others); :62 countInLanguage takes no overdue or open word; :368 labels every count 'Reported'; rolling windows stand for this week, last week and this month; :675 holiday dates for one year (OPEN-10).
- Why earlier tests missed it: BUG-018 was fixed on the helper, not on the path the chat takes. The Tamil and Tanglish lane was never checked against the English one.
- Guard: One window table, tested end to end through the chat route at the frozen moment (time-travel.mjs), in every language, and a check that the label said matches the filter used.
- Rows: PB-003, PB-007, PB-081, PB-143, PB-150, PB-221

## RC-11: Ask District IQ's keyword routes are tried in a fixed order, so a feeds or by-department question goes to the wrong tool

- Severity: P0 (highest in the cluster). Explains 3 findings (3 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/assistant/guard.ts:162-165 (order of the keyword routes; any sentence with 'department' goes to the department tool); src/lib/assistant/help.ts:9-10 (no Tamil forms).
- Why earlier tests missed it: Route order was never tested with two intents in one sentence.
- Guard: A routing table test: each intent sentence must reach its own tool, with its Tamil and Tanglish forms.
- Rows: PB-014, PB-145, PB-171

## RC-12: A case row's flags and next step come from the pipeline flag or from loose words in the title

- Severity: P0 (highest in the cluster). Explains 5 findings (2 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/thunai/screens.ts:133 caseRow reads breached alone (a closed case still shows 'past deadline, needs you first'); :200-226 actionForOne runs substring patterns over category and title and names another body than the one that holds the case.
- Why earlier tests missed it: Tests checked an open case in the right body only.
- Guard: Derive the owner from the case's own department field and the flag from the effective status; a test over closed and reopened cases.
- Rows: PB-051, PB-113, PB-159, PB-175, PB-225

## RC-13: The number gate checks a short list of forms, and not every digit script or number word

- Severity: P1 (highest in the cluster). Explains 2 findings (2 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/thunai/numbergate.ts:49 (Tamil digits only; fullwidth, Arabic-Indic and Devanagari digits pass); the 'one <noun>' pattern allows one adjective from a short list (so Tamil and Tanglish all pass); compound English words held back (OPEN-13); :69-70 treats the word constructor as a figure (RC-14, scans-code-2, fixed in this lane).
- Why earlier tests missed it: The gate was tested with English digits and the words of the fix. No property test.
- Guard: Normalise every digit script before the gate, and a property test that spells each number in each script and word form.
- Rows: PB-077, PB-208

## RC-14: A plain object is used as a lookup on words the user typed (constructor, __proto__)

- Severity: P1 (highest in the cluster). Explains 4 findings (3 distinct, the rest duplicates). Kind: app. Lane: a/b/d.
- Mechanism: src/lib/thunai/normalise.ts:73 and :97 (LOAN, EN_NUM); src/lib/thunai/numbergate.ts:69-70; src/lib/collector/intel.ts:46 (`v in PERIODS`: 500 on ?period=constructor). One mechanism in three files, so the fix is queued in the lane that owns each file (a: RC-03 entry, b: RC-13 entry, d: RC-29 entry).
- Why earlier tests missed it: No test used a word that is a property of Object.prototype.
- Guard: Use Object.hasOwn or a Map for every table keyed by user text, and one property test that feeds every Object.prototype name to each such function.
- Rows: PB-070, PB-146, PB-216, PB-217

## RC-15: Spoken lines and Tamil lines are written in English or with wrong wording

- Severity: P2 (highest in the cluster). Explains 8 findings (7 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/thunai/screens.ts:488 where() builds an English label that the Tamil line reuses; :1303 and :1310 use points[0].text (English) in both languages; :914 and :1096 ('incidents reports'); :74 PERIOD_EN and :498; a brief can say 'came in today' and 'a few days old' together (OPEN-18's third part, screens.ts bodyBrief); src/lib/thunai/narrate.ts:139,181,199,202,204,209 (a department with no Tamil name gets the suffix glued on; two complaints are 'hitting a lot of residents'; ' today' is added to any step). The detectLang half of open-baseline-46 is in normalise.ts (RC-05, lane a).
- Why earlier tests missed it: Language checks looked at the first word, and wording was reviewed in English only.
- Guard: A language grader on every Tamil answer (no English sentence in a Tamil line), and a wording test that compares each closed form with its plural.
- Rows: PB-158, PB-161, PB-174, PB-207, PB-223, PB-224, PB-230, PB-250

## RC-16: Dates with a month name are read in the server's time zone

- Severity: P1 (highest in the cluster). Explains 1 findings (1 distinct, the rest duplicates). Kind: app. Lane: b.
- Mechanism: src/lib/collector/sourcemap.ts:355 `new Date(s)` takes the string first and reads it in the server's zone, so on a UTC server the date is 5 h 30 min late.
- Why earlier tests missed it: Tests ran in the same zone as the developer's PC (IST).
- Guard: Run the suite under TZ=UTC and TZ=Asia/Kolkata in the gate.
- Rows: PB-107

## RC-17: An open route parses an unbounded body (20 MB) with zod before any size check

- Severity: P0 (highest in the cluster). Explains 1 findings (1 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/app/api/i18n/route.ts:42 and :67 (zod 3.25.76 ZodArray makes one error object per element; 10 million items ran the heap out and the server died). The owner's decision that the route takes no sign-in is not touched: the ready patch reads the text, refuses above 64 KB, and parses inside a try.
- Why earlier tests missed it: The route was tested with small bodies. No test sends a body larger than the app expects.
- Guard: A shared body-size cap on every unsigned route, and a fuzz test that sends 1 MB and 20 MB bodies to each route and expects 413 and a live server.
- Rows: PB-068

## RC-18: Privacy redaction and refusal work from lists of known forms

- Severity: P0 (highest in the cluster). Explains 8 findings (7 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/lib/thunai/privacy.ts:35 asksPrivate needs a person word beside an identifier word; :62 asksForbidden; :79-84 no verb for release, close all or change in Tamil and Tanglish; :101-109 turns one no-break space or dash between digits only, and runs before the Tamil-digit step; PHONE and dialled() need [ .-] groups (0, 91, +91, 2-4-4 grouping); personalRun treats single-digit groups as safe; no strip of format characters (zero-width, direction marks) before matching (do it inside privacy.ts). OPEN-6 (print your prompt, low risk) and OPEN-18's phone parts sit here.
- Why earlier tests missed it: The red team's forms were fixed one by one (BUG-010, BUG-025). Nobody generated the forms.
- Guard: Normalise first (strip format characters, map all digit scripts, unify separators), then match digits by count and not by listed shape; keep the property tests property-2, 3, 4, 6 and 7 as the guard.
- Rows: PB-008, PB-055, PB-056, PB-057, PB-082, PB-138, PB-139, PB-140

## RC-19: The privacy and injection gates do not cover every output or every path

- Severity: P0 (highest in the cluster). Explains 8 findings (8 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/lib/thunai/round.ts:231 generalReply has no copy check, :284 `if (b.round === 0)` runs the refusal on round 0 only, :360-364 and finish in src/lib/thunai/agent.ts apply view steps without checking the outside body; agent.ts:445-451 and :518 the do reply and answerScreen have no leaks() check; src/lib/thunai/injection.ts:12 ASKED matches one word anywhere; src/lib/thunai/brain.ts:17 and the v1 plan route have no gate; a record's own words are spoken at stagelocal.ts:267 and screens.ts:101.
- Why earlier tests missed it: Each gate was tested on the line it was written for. There is no single exit that every spoken line must pass through.
- Guard: One exit gate in finish() through which every line, button and recent turn passes (redact, copy-check, outside-body check), with a test that plants a record holding a phone, an e-mail and an instruction and drives every route.
- Rows: PB-009, PB-010, PB-011, PB-083, PB-084, PB-097, PB-165, PB-166

## RC-20: The Data Studio's rules answer a measure question with a row count and filter silently

- Severity: P0 (highest in the cluster). Explains 1 findings (1 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/lib/studio/ask.ts:52-54 only 'total', 'sum' and 'how much' turn a named measure into a sum, so 'how many rows' gives 16 in a 400-row file and report rows are filtered.
- Why earlier tests missed it: Tested with a model on; the rules are the no-model path.
- Guard: A no-model golden set for the Studio against a fixed dataset, graded against a computed oracle.
- Rows: PB-001

## RC-21: Clean-up code that nothing calls (saved sign-ins are never removed)

- Severity: P1 (highest in the cluster). Explains 1 findings (1 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/lib/studio/pipeline.ts:170-171; src/lib/studio/store.ts:127 and :132; dropVault has no caller.
- Why earlier tests missed it: A dead-code scan only; no test deletes a dataset and then looks for the vault.
- Guard: A test that deletes a dataset and checks the sign-in store is empty.
- Rows: PB-147

## RC-22: next 14.2.35 has an unauthenticated remote-code-execution advisory for Windows hosts, and a documented 'No' is wrong

- Severity: P0 (highest in the cluster). Explains 2 findings (2 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: chennai-grievance-portal-main/package.json next ^14.2.35 (GHSA-p293-qw3h-jr36, critical); node_modules/next/dist/server/lib/router-server.js:486 proxies an upgrade whenever the parsed URL has a protocol (GHSA-c4j6-fc7j-m34r); docs/SECURITY_AUDIT.md says No.
- Why earlier tests missed it: The audit counted binding to 127.0.0.1 as the mitigation, which does not stop a tunnel that forwards to it.
- Guard: npm audit and OSV in the gate, and a rebuild test after each bump. The fixer must build: next 15.5.28 was not built here.
- Rows: PB-069, PB-219

## RC-23: Route handlers throw on bad input, and a missing record answers with the wrong status

- Severity: P1 (highest in the cluster). Explains 4 findings (4 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/app/api/profile/photo/route.ts:17 `await req.formData()` unguarded; src/app/api/profile/mobile-otp/request/route.ts:16 malformed body; src/lib/collector/searchwords.ts:33 splits on [^\p{L}\p{N}-]+ and Tamil vowel signs break the search (500); src/lib/rehearsal/engine.ts:133 throws RehearsalUnavailable for an unknown replay (503, should be 404).
- Why earlier tests missed it: Routes were tested with well-formed bodies and English search words.
- Guard: A route fuzz matrix (access-fuzz.test.ts) in the gate: every route gets a non-multipart body, a bad JSON body and a Tamil query.
- Rows: PB-108, PB-151, PB-233, PB-256

## RC-24: Two places disagree on the size of a workspace id

- Severity: P1 (highest in the cluster). Explains 3 findings (1 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/app/api/collector/workspaces/[id]/route.ts:9-10 /^\d{1,9}$/ against src/lib/aws/store.ts:298 (ten digits) and src/app/api/collector/sources/[id]; a workspace saved on a copy that does not save to AWS gets a ten-digit id and cannot be opened.
- Why earlier tests missed it: Only the AWS path was tested. The local-save path makes a longer id.
- Guard: One id module used by both writer and reader, with a round-trip test (save, then open) in both modes.
- Rows: PB-085, PB-196, PB-212

## RC-25: Unsafe defaults, and a second route that skips a step-up

- Severity: P1 (highest in the cluster). Explains 6 findings (6 distinct, the rest duplicates). Kind: app. Lane: c.
- Mechanism: src/lib/otp.ts:241 and src/app/api/auth/forgot-password/request-otp/route.ts:49 (a dev build shows the reset code); src/lib/crypto.ts:23 (AES-GCM tag length not fixed); src/lib/secrets.ts:20-25 (production accepts the JWT_SECRET placeholder); src/lib/thunai/devguard.ts:8 counts x-forwarded headers as a proxy and refuses every request; src/app/api/collector/assistant/export/route.ts:16-24 has no requireConfirm; src/lib/csv.ts:8 (-2+3 is not written as text).
- Why earlier tests missed it: The production build was tested; dev paths and second routes were not. The devguard test mocked the headers.
- Guard: A table test per export route (all need the same step-up), a start-up check that refuses placeholder secrets, and tests of the dev guard on a real server.
- Rows: PB-141, PB-163, PB-164, PB-220, PB-255, PB-257

## RC-26: A Collector decision can be dropped, or can disagree across roles

- Severity: P0 (highest in the cluster). Explains 5 findings (4 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/app/api/collector/decisions/route.ts:85-88 the 'recent' query checks decision = ? in a two-minute window, so a real resolve after a reopen is dropped (answers 201, not recorded); src/lib/collector/effective.ts:10-14 (verify has no effect) and :36-37 (latest ignores only notes, so an escalate after a resolve reopens); src/lib/complaint-progress.ts:167 COALESCE(?, remarks) keeps the reject reason after a reopen.
- Why earlier tests missed it: Decisions were tested one at a time. The sequence matrix (decision-matrix) did not exist.
- Guard: A sequence matrix test (every pair and triple of actions) comparing the console, officer and citizen views, kept as a gate.
- Rows: PB-026, PB-101, PB-149, PB-176, PB-180

## RC-27: Readers use the pipeline's flag or status instead of the decisions overlay

- Severity: P0 (highest in the cluster). Explains 12 findings (11 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/lib/collector/intel.ts:1368, :1441 (search), :1483-1488 and :1530-1535 (ROW carries i.is_open), :182 sentByOfficer; src/lib/collector/insights.ts:45 and :166-168; src/lib/collector/briefbook.ts:42; src/lib/assistant/incidents.ts:227-233 and COLS (closed_at is not overlaid); src/lib/assistant/compile.ts and src/lib/assistant/lance.ts:69-71, :219 (OPEN-16).
- Why earlier tests missed it: BUG-028 and BUG-035 were fixed for the screens that were named. A new reader is added without the overlay, and the tests grep one column.
- Guard: One withDecisions() layer that every incident reader must go through, plus the decision-matrix test over every surface; a test that fails on a new SELECT of i.is_open outside the layer.
- Rows: PB-028, PB-029, PB-030, PB-079, PB-102, PB-103, PB-104, PB-105, PB-106, PB-160, PB-178, PB-231

## RC-28: The officer console credits and counts the Collector's work wrongly, and shows other figures than the Collector's

- Severity: P0 (highest in the cluster). Explains 3 findings (3 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/lib/officer/data.ts:352-353 collectorFeedback (an officer's own close is shown as Collector verified; a reject never reaches the officer), :247 (no kind in the SELECT, so 6 of 8 feeds live against the Collector's 2 of 8), :227 (OPEN-4, the map legend counts 300 capped pins; the line was checked); src/lib/officer/insights.ts:217-219.
- Why earlier tests missed it: The officer console was tested separately from the Collector's.
- Guard: A cross-role figure test: same build, same figure on both consoles.
- Rows: PB-013, PB-027, PB-177

## RC-29: Counts are taken from a capped or shortened list, a group count or a partial time bucket; some sort order is reversed

- Severity: P0 (highest in the cluster). Explains 11 findings (10 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/lib/collector/insights.ts:143 LIMIT 60 and :235-242 slice(0, 6), :145-146 (12*7*24 hours cuts the oldest week), :162 department scope of patterns; src/lib/collector/intel.ts:1399,1403 (COUNT(DISTINCT cluster) called incidents), :1385-1395 and src/lib/assistant/tools.ts:615 (default dir -1: the most urgent is the least severe), :1530 LIMIT 400, :46 (RC-14, fixed here: Object.hasOwn); src/lib/assistant/tools.ts:465 (a missing value read as 0); src/lib/collector/aibrief.ts:107; src/components/collector/app/Overview.tsx:68.
- Why earlier tests missed it: Tests compared a shown list to itself. There was no district-level oracle on the same build.
- Guard: Counts must come from COUNT queries with the same predicate as the tile; the same-number tests with the oracle as a gate; a sort-direction test on every list that says most or least.
- Rows: PB-005, PB-061, PB-062, PB-063, PB-064, PB-065, PB-066, PB-078, PB-162, PB-209, PB-214

## RC-30: Search falls back wrongly, or says it searched when it did not

- Severity: P0 (highest in the cluster). Explains 4 findings (2 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/lib/assistant/lance.ts:236-239 and embed.ts:282 (only ModelNotReady falls back; any other load failure ends in an error); src/lib/assistant/tools.ts:58-63, :104, :111, :651-655 (asking words kept as keywords; a no-match sentence with no index; news is [] and not null).
- Why earlier tests missed it: The fallback was tested for one failure kind.
- Guard: Test each failure kind (not ready, bad file, no index) and require the keyword lane and an honest 'could not search' line.
- Rows: PB-015, PB-089, PB-197, PB-232

## RC-32: Honesty labels: generated feeds called Healthy or REAL, a pulsing live dot, Tamil PM wording

- Severity: P1 (highest in the cluster). Explains 4 findings (4 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/components/collector/app/Sources.tsx:11,71,78 and src/lib/collector/sources.ts:88,102; src/lib/rehearsal/impacts.ts:386 and :516 (Rain Traffic tagged REAL); src/components/auth/AuthHero.tsx:96; src/lib/i18n/ta.ts:28 (every PM time is midday).
- Why earlier tests missed it: A fix was applied to dead code (BUG-006). The label is chosen in code, and the tests checked the string and not the screen.
- Guard: A DOM test that no generated feed carries the words Live, Healthy or REAL.
- Rows: PB-087, PB-168, PB-227, PB-228

## RC-33: Jarvis client guards test a string the real code never builds, or use an exact word list

- Severity: P1 (highest in the cluster). Explains 11 findings (11 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/components/collector/app/thunai/guards.ts:5 and Thunai.tsx:668 (guard on the bare name Yes while the button's name differs); Thunai.tsx:1137-1142 exact yes list; :1171 the dataset lane takes everything; :545 each live draft calls openAction; :1392 a progress line is kept as the answer; :1825 and src/lib/thunai/say.ts:29-37 words left over after a behaviour changed; src/lib/thunai/turn.ts:155 a hold word cancels voice but not the turn; src/components/security/confirm.css:2 z-index 4000 under the Jarvis screen; src/lib/thunai/conductor.ts:245 fromCaptions has no selfHeard check.
- Why earlier tests missed it: Unit tests built the string the guard expects. This pass's browser run is the first that clicks the real buttons.
- Guard: Browser tests in the gate for every guard (spoken click, stop, confirm), driven from the real button names.
- Rows: PB-071, PB-072, PB-073, PB-074, PB-075, PB-076, PB-152, PB-153, PB-154, PB-155, PB-222

## RC-34: Two definitions of overdue and on time, and the flag is read as a date

- Severity: P0 (highest in the cluster). Explains 2 findings (2 distinct, the rest duplicates). Kind: app. Lane: d.
- Mechanism: src/lib/assistant/incidents.ts:249 and src/lib/officer/insights.ts:205 count 'closed on time' from the pipeline flag (incidents closed months late count); src/components/collector/app/Detail.tsx:130 against src/lib/reference/metrics.ts:65 (914 open incidents say missed on the case page but are not on the Past deadline tile). The pipeline cause (RC-39, OPEN-7) is not this repo's.
- Why earlier tests missed it: Closed-on-time was never compared with the dates.
- Guard: Compute on-time from closed_at and due_at in one function in src/lib/reference/metrics.ts, used by every surface.
- Rows: PB-031, PB-109

## RC-35: Caches are not cleared by a decision

- Severity: P2 (highest in the cluster). Explains 2 findings (1 distinct, the rest duplicates). Kind: app. Lane: -.
- Mechanism: src/lib/thunai/round.ts:62-79 toolCache (30 s), src/lib/assistant/tools.ts:125 once() (60 s), and the Map and developing-stories caches.
- Why earlier tests missed it: Tests read after a long wait.
- Guard: A write-then-read test for each cached reader. Touches round.ts (lane c) and tools.ts (lane d), so it is not queued: do it after the lanes merge.
- Rows: PB-157, PB-179

## RC-36: Tests with shared state, order dependence or wall-clock limits (flaky), and tests that guard a copy

- Severity: P2 (highest in the cluster). Explains 16 findings (16 distinct, the rest duplicates). Kind: app. Lane: -.
- Mechanism: connectors.test.ts:44-200 one connector made in the first test; stt.ts:140 cooling set shared; ledger.ts:187 shared ledger; the photo and sources route tests never reset a mock (h.written, h.calls); briefturn.test.ts:102 p95 wall-clock; decide.test.ts:107 import inside the test; scans-code-8 tests guard a copy of the real code. OPEN-15 (Gemini timing test) is the same class and was not reproduced in this pass.
- Why earlier tests missed it: The suites ran in one order on a quiet machine.
- Guard: Run each file in random order and under load in the gate; no module singleton in a test without a reset.
- Rows: PB-181, PB-182, PB-183, PB-184, PB-185, PB-186, PB-187, PB-188, PB-189, PB-190, PB-191, PB-192, PB-193, PB-194, PB-195, PB-253

## RC-37: Tooling and dead code

- Severity: P2 (highest in the cluster). Explains 4 findings (4 distinct, the rest duplicates). Kind: app. Lane: -.
- Mechanism: package.json has no ESLint config; src/lib/dataset/append.ts:152 has no caller; animejs is unused; 87 dead names.
- Why earlier tests missed it: Not covered by tests.
- Guard: Add the lint config and a dead-code check to the gate.
- Rows: PB-218, PB-251, PB-252, PB-254

## RC-38: Console data hygiene in the search box, forecasts and the profile form

- Severity: P2 (highest in the cluster). Explains 4 findings (4 distinct, the rest duplicates). Kind: app. Lane: -.
- Mechanism: src/lib/collector/derive.ts:311 newsMedia skips dropIncidents; src/lib/collector/intel.ts:1420 search news with no redaction; src/lib/assistant/tools.ts:185 a forecast open for '-1 hours'; src/app/api/profile/route.ts:111-118 accepts a ward from another zone.
- Why earlier tests missed it: Not exercised by earlier tests.
- Guard: A link-integrity test in the build and a redaction test on search.
- Rows: PB-198, PB-199, PB-200, PB-234

## RC-39: District pipeline (district_intel) data problems

- Severity: P2 (highest in the cluster). Explains 20 findings (20 distinct, the rest duplicates). Kind: pipeline. Lane: -.
- Mechanism: district_intel/dintel/incidents.py:125-129 (sla_breached), analytics.py:279-280 and :29, linking.py:98-101 (unstable ids), incidents.py:70, :88-93, :192; the geocoding, news fetcher and translation steps. OPEN-7, OPEN-8 and OPEN-11 belong here.
- Why earlier tests missed it: Outside the app's tests.
- Guard: Pipeline checks at build time. Not fix work for this app: the rules say do not patch around them.
- Rows: PB-201, PB-202, PB-210, PB-211, PB-229, PB-235, PB-236, PB-237, PB-238, PB-239, PB-240, PB-241, PB-242, PB-243, PB-244, PB-245, PB-246, PB-247, PB-248, PB-249

## RC-40: The owner's decisions (reported, not changed)

- Severity: P1 (highest in the cluster). Explains 5 findings (5 distinct, the rest duplicates). Kind: owner. Lane: -.
- Mechanism: Rain Power and Metro show generated figures as plain fact (ImpactView.tsx:239); Ask District IQ's 'Live data' claim (assistant/text.ts); feed answers count generated feeds as healthy (tools.ts:1141, datasets.ts:387-393); complaint wording as titles shown unredacted in the console (OPEN-12); the build hook that drops sites that are not news media (derive.ts:299-310, newsrel.ts:115). OPEN-3 and OPEN-14 (no sign-in on /api/i18n) are also the owner's; RC-17 fixes only the size, not the sign-in.
- Why earlier tests missed it: They are decisions.
- Guard: Report with evidence and a ready patch; the owner decides.
- Rows: PB-088, PB-167, PB-169, PB-170, PB-213

## RC-41: Environment, not code

- Severity: P1 (highest in the cluster). Explains 4 findings (2 distinct, the rest duplicates). Kind: environment. Lane: -.
- Mechanism: MySQL listens on every address with a firewall rule open to anyone and a weak admin login (the PC's my.ini and firewall); the meaning-search model file is a Git LFS pointer in this worktree (.cache not fetched, tests/qa/pass4/worktree-setup.mjs).
- Why earlier tests missed it: Outside the repo.
- Guard: Owner steps for MySQL; run git lfs pull or link .cache in the worktree setup.
- Rows: PB-148, PB-172, PB-226, PB-258
