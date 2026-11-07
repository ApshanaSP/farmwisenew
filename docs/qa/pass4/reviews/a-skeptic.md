# Lane a: skeptic review

Method: read only the commit messages (7d3a6f9..HEAD) and the code, then ran about 140 hard sentences through the real path (planRound with the real store, no model, frozen clock 2026-11-06) in English, Tamil and Tanglish. No server was started, so none to stop. Tests: `chennai-grievance-portal-main/tests/qa/pass4/a-skeptic.test.ts` (six `it.fails`, all confirmed failing as written).

## Held up (no break found)
RC-01: about 20 outside places and bodies (Mumbai, Hyderabad, Delhi Jal Board, Kolkata, Pune, Kochi, Trichy, Ooty, Tamil spellings, "-la" Tanglish) all said as unknown. RC-02: Adayar, Kodambakkam, Madhavaram, Anna Nagar all resolve; "Anna", "Madhavan", "royal", "guide" do not. RC-03: "highway", "highlight", "low-lying", "moderate rain" are not a severity. RC-04: "mark all resolved", "delete the complaint" refuse. Tamil periods "this week", "last month" are right.

## Breaks
| id | sev | what | class |
|---|---|---|---|
| SK-1 | P0 | "overdue cases in Tondiarpet" answers "no cases this week for this view". "overdue severe cases in Tondiarpet" in the same build says 3 are past their deadline. screens.ts:417 filters one page of 12 by `overdue`; the zone's overdue cases are not on that page. | RC-05 "a filter is applied", wrong number |
| SK-2 | P0 | "overdue cases this week" (no zone) says no cases; Manali alone has 4. Same cause as SK-1. | same |
| SK-3 | P0 | "resolved cases this week" and "closed cases in Adyar" are answered as all cases (1253, 105). `statusIn` (quick.ts:118) has no resolved/closed class, so the word is dropped silently. | RC-05, filter dropped |
| SK-4 | P1 | Tamil "தீர்க்கப்படாத புகார்கள்" (unresolved complaints), with or without a zone, goes to the `complete` recipe with no status and says nothing is missing from the rows (total 1085, or 87 for Adyar). The English one is read as `open`. | RC-05, three languages |
| SK-5 | P1 | Windows the console does not hold are shown as another window: "cases next week" shows the last 7 days (rules lane); Tamil "two weeks ago" shows the last 7 days; "cases a month ago" is answered as the last 30 days. calendarWindowIn does not cover "ago" forms in English or Tamil. | RC-06 |
| SK-6 | P2 | "open cases in Adyar" goes to the zone page (rules-instant) and the open filter is dropped without a word. | RC-05 |

Notes: SK-1 and SK-2 sit in screens.ts, which lane a did not change; the fix commit says the filter is applied, so it is reported here. English "last week" and "last month" as this week and the last 30 days are known (BUG-003) and not counted. Rows with "no-model" lane in my runs are the rules fallback when no model answers; I judged only the sentences the lane answered itself.
