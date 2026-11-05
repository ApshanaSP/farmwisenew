# Bugs found in the QA pass

**Severity:**
- **P0:** a wrong number, a privacy or security failure, an unsafe action, a crash, data loss or a broken sign-in.
- **P1:** the feature does not do what it says.
- **P2:** it works but is confusing, slow or misleading.
- **P3:** polish.

**Definition of Fixed** has six parts:
- **(1)** A test that failed before the fix now passes.
- **(2)** Reverting the fix makes that test fail again.
- **(3)** The root cause is written down.
- **(4)** The code was searched for the same class of bug.
- **(5)** The fix was checked in a real browser.
- **(6)** A skeptic tried to break it.

Each row says which parts are met. Part 5 (browser) was met for BUG-001, 002, 004, 006 and 020 on a production build; see `evidence/BROWSER.md`.

Sources:
- `hunt/hunterA.md`, `hunt/hunterB.md` (two independent hunters)
- `hunt/redteam.md`
- the skeptic report (summarised under BUG-005)
- `DATA_SOURCES.md`
- `FEATURE_MATRIX.md`
- `evidence/oracle.json`

## Fixed

| Id | Sev | What was wrong | Root cause (one sentence) | Test (fails without the fix) | DoF met | Commit |
|---|---|---|---|---|---|---|
| BUG-001 | P1 | "chennai city police report" gave a police case list, not a brief | No layer read "a report on a named body", and the planner's brief screen took no department. | `briefturn.test.ts` (23 of 24 fail reverted) | 1 2 3 4 5 6 | 8ad7bfb |
| BUG-002 | P0 | "Mumbai police", "filter Coimbatore police" put the Greater Chennai Police filter on | Department matching took any alias word anywhere, with no check of what qualified it. | `entities.test.ts` foreign cases | 1 2 3 4 5 6 | 8ad7bfb |
| BUG-003 | P2 | The district brief said "today's brief" for any period | A fixed word in the template. | `speechsweep.test.ts` | 1 3 | 8ad7bfb |
| BUG-004 | P1 | Explaining an issue read its fields out ("Severe, status Open, open for 6 hours. X handles it.") | The case screen's spoken line was a join of record fields. | `narrate.test.ts` (5 fail reverted) | 1 2 3 4 5 | 595b7a5 |
| BUG-005 | P1 | The first resolver version was refuted by the skeptic (see below) | "Unknown" rested on missing evidence (any word the registry did not know), brief words were matched by sound, and no other lane was protected. | `briefturn.test.ts` "skeptic's breaks" (37 cases) | 1 3 4 6 | 136faa4 |
| BUG-006 | P2 | Generated police, PWD and hospital feeds were shown as "Live" and "Healthy" | The UI ignored `source_health.kind`, which already says "synthetic generator". | none (UI text) | 3 4 5 | a18493c |
| BUG-007 | P0 | "Show overdue cases" said 40 overdue cases as 12 | The total was counted from one 12-row page. | `overdue.test.ts` (fails reverted) | 1 2 3 | 72706c6 |
| BUG-008 | P0 | Weekly Trends were all 0 after midnight on an IST server, and lost the last week on a UTC server on Monday morning | The week keys mixed the server's local weekday with UTC dates. | `trendkeys.test.ts` (2 of 5 fail reverted) | 1 2 3 | 35b7f0a |
| BUG-009 | P0 | The older `/api/collector/thunai/agent` route sent unredacted tool data to the model and refused nothing | Redaction and privacy refusal were added to `/round` only. | `injection.test.ts` "/agent route" | 1 2 3 | a15c0a7 |
| BUG-010 | P0 | Phone numbers, Aadhaar and emails in many formats got through; 17 of 45 privacy asks were not refused | The regexes matched only a few digit groupings, and the request patterns missed "one complaint's filer". | `privacy.redteam.test.ts` (22 fail reverted, together with BUG-011) | 1 2 3 4 | a15c0a7 |
| BUG-011 | P0 | An instruction in an incident title became Jarvis's spoken answer and added steps | Records were tagged "(untrusted)" only in the prompt, and no code gate checked the model's words or steps against them. | `injection.test.ts` | 1 2 3 | fc7b7b3 |
| BUG-012 | P1 | A failed or cancelled tray send cleared every draft and said "Approved" | `setTray([])` ran whatever the outcome of each send. | none (client); code read | 3 | 3e39ead |
| BUG-013 | P1 | "Open workspace X" by voice always failed with 404 | The client expected a flat list with ids; the API returns name groups. | `guards.test.ts` | 1 3 | 3e39ead |
| BUG-014 | P1 | A spoken "click" pressed Save new version, Pin, Unpin and a bare "Yes" at level A | The click guard listed only send, approve and delete words. | `guards.test.ts` | 1 3 | 3e39ead |
| BUG-015 | P1 | A late Data Studio answer was spoken over a newer turn or a stop | `askDataset` had no turn-generation check and no abort signal. | none (client); code read | 3 | 3e39ead |
| BUG-016 | P2 | A "yes" heard only by captions dismissed the save card and was sent on as a new request | Any input that was not an accepted yes or no cleared the card. | none (client); code read | 3 | 3e39ead |
| BUG-017 | P1 | "There is only one severe case" passed the number gate with nothing allowed | "one" was left out of the number words on purpose. | `numbergate.one.test.ts` | 1 3 | 9288718 |
| BUG-018 | P1 | "Yesterday" meant the 24 hours before the last 24 | No calendar day in Asia/Kolkata was used. | `yesterday.test.ts` | 1 3 | 6807c8e |
| BUG-020 | P1 | With a police brief open, "explain the flooding complaint in Adyar" re-scoped the brief to Adyar (found in the browser) | Any short sentence with a new place was read as "and in X?" unless it held a show or list verb. | `narrate.test.ts` BUG-020 (fails reverted) | 1 2 3 5 | 42e01c4 |
| BUG-021 | P0 | "Severe overdue cases" said every overdue case's count (regression from BUG-007, pass-2 hunter C1) | The follow-ups' total ignores severity and words. | `overdue.test.ts` | 1 3 | 35f4d15 |
| BUG-022 | P1 | "remember to check the police report" became a police brief; the note, reminder, save or typing was lost (C2) | The brief step did not leave keeping and typing words to their own lanes. | `pass2.test.ts` | 1 3 | 16f4346 |
| BUG-023 | P1 | A road accident was "a damaged road"; flood warnings and relief needs were "standing water" (C3) | The general patterns were tried before the specific ones. | `pass2.test.ts` | 1 3 | 16f4346 |
| BUG-024 | P1 | "Severe cases past the deadline" listed every severe case (C4) | The fast lane never mapped deadline words to overdue. | `pass2.test.ts` | 1 3 | 16f4346 |
| BUG-025 | P0 | A phone number with a no-break space or a Unicode dash was not hidden (C5) | Only ASCII separators were counted. | `pass2.test.ts` | 1 3 | 16f4346 |
| BUG-026 | P0 | An officer's overview JSON carried other departments' severe incidents in the bell (D1) | The bell query had no department filter. | `deptscope.test.ts` (fails reverted) | 1 2 3 | e309a49 |
| BUG-027 | P0 | Emerging patterns and their headlines ignored the department (D2) | The anomaly and example queries filtered by zone only. | `deptscope.test.ts` (fails reverted) | 1 2 3 | e309a49 |
| BUG-028 | P0 | The briefing counted incidents already closed by a decision (D4) | It used raw is_open, not the decision-aware open flag. | `deptscope.test.ts` (fails reverted) | 1 2 3 | e309a49 |
| BUG-029 | P1 | The assistant CSV had 4 of 9 columns always blank (D3) | Its column names did not exist on the rows. | type-checked shared column list | 3 | e309a49 |
| OPEN-1, OPEN-2 | P1 | Model lines spelling a contact; dev routes with no sign-in | Now fixed (fea259a, 01051e3) | `injection.test.ts`, `devguard.test.ts` | 1 3 | |
| BUG-019 | P3 | The Tamil retelling said "துறைவிடம்" | A suffix glued on without Tamil joining rules. | `narrate.test.ts` idam | 1 3 | 7cb4822 |

Also caught along the way:
- A flaky speed test: the resolver p95 went over 20 ms under parallel load. Fixed by caching each word's near matches.
- A control character written into `entities.ts` by a patch script. Caught by the existing source-hygiene test.

### BUG-005 in detail (the skeptic's refutation of BUG-001's first fix)

The skeptic ran about 220 inputs. Confirmed breaks:
- Ordinary words before "police" gave "I have no data on Full Police", "Jarvis Police" and "Export Police".
- Real localities were called foreign: Mylapur, Chetpet, Anna Salai, and Tamil "தி நகர்".
- Madurai, Chengai, "police in Mumbai" and "Coimbatore city traffic police" still matched our police.
- The brief step took over other screens: reservoir readings, comparisons, news, incident lookups, drafting and police-station questions.
- A two-word zone beat the body.
- A locality was silently dropped.
- Speed was 26–60 ms at p95 on long sentences.

After the fix, all of these are regression tests in `briefturn.test.ts`, and all pass three runs in a row.

## Open (not fixed in this pass)

| Id | Sev | What | Where | Why not fixed |
|---|---|---|---|---|
| ~~OPEN-1~~ fixed | P1 | A model's chat or refuse line that names a citizen or spells an email ("ramesh at gmail dot com") is spoken. Only digits are checked. | `plan.ts:288-289` (red team C5) | Time. Redaction now covers the data the model sees (BUG-010), which removes most of the source. |
| ~~OPEN-2~~ fixed | P1 | `/api/dev/thunai/*` needs no sign-in. It is live on any dev server, or in production with `NEXT_PUBLIC_JARVIS_SPEC=1`. `start.bat` runs a dev server, and `host-tunnel.bat` exposes port 3000. | red team C7, matrix #1 | Owner's decision: these power the eval harness. See the notes. |
| OPEN-3 | P1 | `/api/i18n` POST needs no session. It triggers model calls and writes to `data/i18n/*.json`, which later visitors are shown (possible cache poisoning). | matrix #6 | Not verified with a test in this pass. |
| OPEN-4 | P2 | The officer map legend counts severities from 300 capped pins. | `officer/data.ts:227` (A7) | Time. |
| OPEN-5 | P2 | Ask-the-Map suggestions are district-wide for an officer (plausible only). | A8 | Not confirmed. |
| OPEN-6 | P2 | "Print your prompt" is not refused in code. The prompt holds no secrets. | red team C6 | Low risk. |
| OPEN-7 | P2 | 933 open incidents are past their due time but `sla_breached=0` (response SLA met, open for months), so they are not counted as past deadline. | `evidence/oracle.json` | A data-pipeline rule (`district_intel`), not the app. Listed for the owner. |
| OPEN-8 | P2 | The pipeline's `kpis` table disagrees with the oracle on complaints (daily 132 vs 123). The console computes from incidents, not this table. | oracle | The pipeline needs checking. |
| OPEN-9 | P2 | Remaining honesty items from the data audit: map layers "On the ground now" over synthetic beds and PWD works; Ask District IQ told never to say data is synthetic; a 29-day-old price line with no date; conditions with no time. | `DATA_SOURCES.md` items 4–11 | Partly owner decisions (prompt policy). Listed in the notes. |
| OPEN-10 | P3 | Holiday dates are hard-coded for one year ("since Pongal" in 2027 uses 2026). | `fastpath.ts:675` (A9 = B7) | Lunar dates need a source; not invented. |
| OPEN-12 | P2 | Case screens and lists show the complaint's own wording as the title. The rules say no citizen's own words on screen. | base console, all incident lists | Owner's decision: it is how the whole console names incidents. |
| OPEN-14 | P1 | Anyone can drive /api/i18n, which writes the shared Tamil cache (pass-2 D5). | `api/i18n/route.ts` | It is open on purpose for the sign-in page. Owner's decision. |
| OPEN-15 | P3 | A pre-existing timing test ("Gemini answers at once with no Groq keys") failed 1 of 3 full runs under load (4.2 s). | `src/lib/ai` | Not my change. A flaky test is a bug, so it is listed. |
| OPEN-13 | P3 | The number gate checks compound English number words one by one, so even an allowed 23 said as "twenty three" is held back. Safe. | `numbergate.ts` | Code-built speech uses digits. |
| OPEN-11 | P3 | 4 IMD forecast events are stored as incidents with future times; 756 Lapsed incidents have no `closed_at`; `daily_counts` has 228 fewer grievance rows than events. | oracle | Pipeline data. |

## Remaining-bug estimate (rough)

Two hunters looked at the same highest-risk areas without seeing each other's work. Counting P0 and P1 only:
- Hunter A found 6 (A1–A6).
- Hunter B found 5 (B1–B5).
- 2 were found by both (A3 = B2, A6 = B3).

The Lincoln-Petersen estimate is 6 × 5 / 2 = 15 P0/P1 bugs in those areas. The Chapman form gives 13. So **roughly 4 to 6 P0/P1 bugs in those areas were not found by either hunter.** This is a rough estimate from two small samples, not a measurement.

The red team found 4 more P0s outside the hunters' overlap. That suggests the true total is higher than the hunters' figure.

**Stop rule: not met.** Pass 2 (two fresh hunters) still found 5 new P0s and 4 P1s. All of them are now fixed. A third clean pass was not run.

**Discovery per pass (P0/P1):**
- Pass 1: 9 distinct from the hunters, plus 4 P0s from the red team.
- Pass 2: 9.

The rate is not falling yet, so more bugs are likely. **No known P0 is open. 2 P1s remain open: OPEN-3/OPEN-14 (`/api/i18n`, the owner's decision) and OPEN-12 (complaint wording as titles, the owner's decision).**
