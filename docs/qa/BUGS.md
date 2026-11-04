# Bugs found in the QA pass

Severity: P0 wrong number, privacy or security failure, unsafe action, crash, data loss, broken sign-in. P1 the feature does not do what it says. P2 works but confusing, slow or misleading. P3 polish.

Definition of Fixed (all six): failing test now passes; reverting the fix makes it fail again (confirmed); root cause in one sentence here; the code base searched for the class; user-visible fixes confirmed in a real browser with evidence; a skeptic tried to break it.

| Id | Sev | Title | Status |
|---|---|---|---|
| BUG-001 | P1 | "chennai city police report" gives no brief | FIXED (browser and skeptic pending, see row) |
| BUG-002 | P0 | Another city's police resolve to Greater Chennai Police | FIXED (skeptic pending) |
| BUG-003 | P2 | District brief always says "today's brief", whatever the period | FIXED |

---

## BUG-001 · P1 · A report on a named body gives no brief

- **Steps:** Jarvis, typed or spoken: "chennai city police report" (also "GCP report", "madras police report", the Tamil forms).
- **Expected:** a brief on Greater Chennai Police: what it is, the period, how it stands, what needs attention, the source and its age.
- **Actual (live Groq, unchanged code, `eval/holdout/results/qa-police-one-before.json`):** the planner (qwen3.8-27b, 1,198 tokens) built a *cases* list filtered to police and "Theft, snatching & fraud", and the voice read out case titles. No brief. With no model answering, the client's rules put a police filter on the console and said nothing more.
- **Root cause:** no layer understood "a report, brief or status about a named body": the rules have no reading for "<body> + report word", and the planner's only brief screen (`brief[period]`) takes no department, so a model had to choose between a district brief that drops the police and a list of police cases.
- **Fix:** `src/lib/thunai/entities.ts` (a registry generated from the World, plus a matching ladder: exact, initials, one edit, same sound; qualifiers folded; unknown qualifiers make the body unknown) and `briefTurn()`, called in `planRound` before the fast lane and before any model. The `brief` recipe takes a department or an org (`org` slot) and speaks a short code-written brief that says the records are generated test data and how old they are (`screens.ts` `bodyBrief`, `recordsOf`, `freshness`).
- **Tests:** `src/lib/thunai/briefturn.test.ts` (24), `src/lib/thunai/entities.test.ts` (32). With the `round.ts` change reverted, 23 of 24 in briefturn fail (confirmed); restored, all pass. 3 runs green.
- **After (live, same sentence, `qa-police-one-after.json`):** lane `resolve`, 0 tokens, no model: "Taking that as Greater Chennai Police. 158 new incidents came in today; 392 cases are still open, and 76 are past the deadline. The one to look at first is in Royapuram. That backlog is the thing to chase today. These are generated police test records, not an official police report. These records are a few days old." (fake-hands figures).
- **Class search:** every recipe that names a department was checked for the same gap: `performance`, `compare` and `cases` take `dept`; only `brief` did not. The planner's `SCREENS` catalog line now needs `brief[dept|org,period]` too (done in a later commit if the dev set shows the planner still picks it).

## BUG-002 · P0 · Someone else's police treated as ours

- **Steps:** "Mumbai police report", "Tambaram police report", "filter Coimbatore police complaints".
- **Expected:** "I have no data on Mumbai Police"; no Greater Chennai Police filter.
- **Actual:** `understand()` matched the bare word "police" and put the Greater Chennai Police filter on at confidence 0.98; with a command verb ("filter ...") the client ran it at once with no model. Tambaram and Avadi are separate commissionerates (Tambaram is outside the district in `ref_taluks`; Avadi is not in the data at all).
- **Root cause:** department matching took any alias word anywhere in the sentence, with no check of what qualified it.
- **Fix:** `resolveEntity()` reports a body named with a qualifier the district does not know as unknown; `understand()` puts no department filter on for it; `briefTurn()` answers it honestly and offers the nearest body we do have.
- **Tests:** `entities.test.ts` "never filter to our police for someone else's" (3) and "unknown" cases; `briefturn.test.ts` 5 "no data" cases.

## BUG-003 · P2 · "today's brief" for a weekly brief

- `screens.ts` `brief()` said "N points in today's brief" whatever the period. Now names the period. Found while reading the brief path.
