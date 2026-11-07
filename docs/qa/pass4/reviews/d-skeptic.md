# Lane D skeptic review

Branch `claude/p4-lane-d`, commits `7d3a6f9..aa47def`. I read only the commit messages and the code. Each break below has a failing test, written as `it.fails`, in `chennai-grievance-portal-main/tests/qa/pass4/d-skeptic.test.ts` (run with `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/d-skeptic.test.ts`: 33 pass, the open breaks among them as `it.fails`). Each `it.fails` was also run as a plain `it` to confirm it fails on the assertion and not on an error. No model was called. The server on port 3164 (frozen clock) is stopped.

## Breaks

| id | severity | commit it dodges | what breaks |
|---|---|---|---|
| DSK-4a | P1 | RC-34 "one rule for past deadline" | The Briefing's follow-up and attention rows still read the raw `sla_breached` flag (`insights.ts` lines 261 and 333). Real run: `INC-20261106-BAE416` is open, due 12:42, console time 18:08. The list says overdue (status=overdue), and the department's own overdue count includes it. Its follow-up row says `overdue: false`, so no "Past deadline" badge. |
| DSK-4b | P1 | RC-34 | Ask District IQ's incident detail (`incidents.ts` lines 329 and 333) says "past its deadline" and `deadlineMissed` only from the raw flag. 5 of 5 incidents that the list calls overdue say the deadline was not missed. The same raw flag is read in `warnings.ts:94`, `aibrief.ts:137`, `actionmail.ts:137` and `:319` (the mail text), `studio/link.ts:35` and `rehearsal/source.ts:66`. I tested only 4a and 4b. The others are the same class, read from the code and not run. |
| DSK-1 | P1 | RC-33 "stop stops" | In the voice machine only the words in `HOLD` (turn.ts) can fire `cancelTurn`. `isStopWord` (addressed.ts) knows more. "stop it", "enough", "நிறுத்துங்க", "நிறுத்துங்கள்" and "nirutha" go to `handle` as a sentence, with no cancel. Run: `Stop.` gives cancelVoice, cancelTurn, hold. `stop it` gives `["handle"]`. |
| DSK-2 | P2 | RC-33 | Common Tamil and Tanglish stops are not stops at all: "நிறுத்தவும்", "stop pannunga", "nirutthunga", "stop jarvis please", "போதும் நிறுத்து". The stop list has no Tamil case or polite endings. |
| DSK-5 | P2 | RC-32 Tamil PM | The class guard's own header says காலை (morning) alone is wrong for AM at 2 AM. The AM phrase `Collected today, #:# AM` is still காலை, and the guard never checks AM. |
| DSK-6 | P2 | RC-33 "yes list takes ஆமாம் and a polite tail" | The yes to a one-tap card (Thunai.tsx line 1142) misses "Yes, please." (comma), "ஆமாங்க", "சரிங்க", "seringa", "yes do it", "ஆமாம் சார்". A missed yes fails safe: the card stays and the person taps it. |
| DSK-3 | P3 | RC-33 keep-button guard | A bare Yes with a mark ("Yes ✓", "Yes.", "Yes!", "ஆம்!") is not a keep button, because the yes branch of `KEEP_BUTTON` is an exact match. The Data card's Yes carries `data-jarvis-never`, so this bites only a card without it. |

## What I tried that held

- Overview tiles against the list's `incidents` figure, for daily, weekly and monthly, with status open, Resolved, overdue, critical and sev=Severe. They match (for example weekly open 1167, Resolved 1166, overdue 505). The list's `total` is a group count, as designed.
- Past deadline on one surface set: overview snapshot, report snapshot, insights briefing stats and the list all say 505 for weekly.
- `parsePeriod`, `parseZone`, `parseDept`, `parseCat` and `parseTaluk` take no prototype names. The list route whitelists sort and status. I found no 500s.

## Notes

- Not run: the browser walk, and any live Groq run. I did not read the sealed set.
- Login was rate-limited (429) after about 15 sign-ins from one script. A server restart cleared it. That is the existing limiter and not a finding.
