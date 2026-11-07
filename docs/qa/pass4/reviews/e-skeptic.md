# Lane e skeptic review (port 3204, 7 Nov)

Method: read the fix code (fastpath.ts, when.ts, direct.ts, target.ts), tried other wordings. Unit probes on the real functions; one real run on a server from `.next-qa`.
Limit: the `.next-qa` build (12:56) is older than the RC-10 fix (13:30), so the real run could not show the RC-10 fix working or not. Claims for RC-10 rest on the unit tests.
No model was called. Tests: `tests/qa/pass4/skeptic-e.test.ts` (7 `it.fails`, 1 control that passes).

## Breaks
1. SK-E-1, SK-E-2 (P1, RC-10, Tamil): "last week" and "last month" are now the calendar week and month in English only. Tamil கடந்த வாரம் / போன வாரம் / கடந்த மாதம் still give the rolling 7 or 30 days. The same question gets a different number by language. The card label code (countInLanguage) already has Tamil text for "last week", so the window code and the label code disagree.
2. SK-E-3 (P1, RC-10, Tanglish): the regex lists `pona`, `kadandha` but only the nouns week and month. Real Tanglish is `pona vaaram` / `pona maasam`, which never match. Jarvis (thunai/quick.ts:144) already knows `pona (vaaram|maasam)`. Real run: "pona vaaram evvalavu complaints" answered "8 incidents, last 7 days".
3. SK-E-4 (P2, RC-10): "last week of October" matched as last week (26 Oct to 1 Nov) with no "in the"; with "in the" the real run answered the whole of October (3,249). Confident answer about another window.
4. SK-E-5 (P1, RC-10, PB-081 class): the one YESTERDAY pattern misses Tamil நேற்றைக்கு and Tanglish nethiku / netraikku. The Jarvis gloss and lang lists treat nethiku as yesterday. Real run: "நேற்றைக்கு எத்தனை புகார்கள்" answered 9,113 complaints in the last 90 days (yesterday is 133).
5. SK-E-6 (P2, RC-11): Tamil plural and colloquial forms (துறைகள் வாரியாக ..., துறை வாரியா தாமதம்) do not reach dept_followups; only துறை வாரியாக / துறைவாரி do. Tanglish `kedu thaandiya` also misses (LATE wants "deadline thaandi").
6. SK-E-7 (P3, RC-45): `datasetWriteAllowed` returns true when DATASET_DIR is set, even under AWS_STORE_DRY_RUN=1, so DATASET_DIR=data/datasets (the tracked folder) still writes under dry run.

## Held up
English yesterday, last week, last month (calendar bounds right at the frozen clock: 26 Oct to 1 Nov, October); "since last week" stays rolling; source_health and dept_followups routes for English and written Tamil/Tanglish forms.

## Not checked
RC-12 case rows, RC-47, RC-51, RC-49 a11y: no time (26 minutes). Server stopped on 3204.
