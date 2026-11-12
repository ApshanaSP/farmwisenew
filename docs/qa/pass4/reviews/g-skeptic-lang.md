# Skeptic 1 (language): lane f and fixers G1, G2, U1, U2

Scope: the commits after 7f7d537 (27 of them), the ledgers `docs/qa/pass4/lanes/{f,g1,g2,u1,u2}.jsonl`, and the fixes for the ordinal reader (RC-42), the digit reader and number gate (RC-13), window words (RC-06, RC-10), parseWhen (RC-16), RC-43, RC-44 and RC-15.
I got no explanation from the authors. I tried other wordings in English, Tamil letters and Tanglish, Tamil case endings, code-switching, edge values, and the same class in a neighbouring feature.

Proof: 37 `it.fails` tests in `tests/qa/pass4/skeptic-g1.test.ts` (run `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/skeptic-g1.test.ts`; all 37 are green because each one fails today). I also ran the file once with `it.fails` turned into `it`: all 37 fail, each on the assertion it names. Real-run logs: `docs/qa/pass4/reviews/g-skeptic-lang-realrun.txt` (a server on port 3215 from `.next-qa`, now stopped; the in-process `ask()`; the browser path in `grader/client-sim.ts`).
Limits: `.next-qa` is older than the G2 commits, so the server run shows the Ask answers only (they match the in-process run). I ran no model. I did not rebuild.

## The short version

The fixes hold for the words the authors tried, and break one step to the side. Three patterns repeat:

1. **English got the fix, Tamil and Tanglish did not.** Ask District IQ's window reader (`customWindow` in `src/lib/assistant/fastpath.ts`) knows "last 10 days" in English only. Tamil `கடந்த 10 நாட்களில்` (a case ending on the unit), `கடந்த 24 மணி நேரத்தில்`, and every Tanglish "pona N naal / vaaram / maasam" fall to the 90-day default, or to 7 or 30 days when N is 2 or 3. The "one period table in every language" fix (3b4a771) covers Jarvis's quick lane, not this reader.
2. **A word the reader does not know is read as something else, not refused.** "draft first and third" drafts the first three. "the last two" drafts the last and the second. Tamil "3 முதல் 5" drafts 3, 1 and 5. A source date with `IST` loses its clock. This is the opposite of the RC-42 promise ("a word it does not know makes it return null").
3. **The same class in the next feature was not swept.** RC-16 fixed `sourcemap.parseWhen` and its guard crossed seven zones, but `understand.ts parseWhen` (reminders, run on the server by `plan.ts`) still reads the clock in the server's zone, and `sourcemap.parseWhen` still moves with the zone for `02-Oct-2026`.

## Breaks (each has a failing test)

Severity uses the rules file: P0 a wrong number or a confident answer about the wrong thing; P1 the feature does not do what it says; P2 works but misleading.

| id | sev | what happens (real run) | what should happen | root cause |
|---|---|---|---|---|
| SKG1-20 | P0 | Tamil "கடந்த 10 நாட்களில் எத்தனை புகார்கள்" gives 9,113 (last 90 days). English "last 10 days" gives 1,063. Same for "கடந்த 24 மணி நேரத்தில்" (9,113 vs 147) and Tanglish "pona 10 naal la", "pona 24 manineram". | the same count as English | `customWindow` Tamil pattern lists `நாட்கள்` but not `நாட்களில்`; no Tanglish `pona N naal/manineram` (fastpath.ts near line 847) |
| SKG1-21 | P0 | Tanglish "pona 2 vaaram" gives 787 (last 7 days): two weeks read as one. "pona 3 maasam", "pona moonu maasam" give 3,255 (last 30 days): three months read as one. English "last 14 days" is 1,552 and "last 3 months" is 9,113. | 14 days / 90 days, or say it cannot | the Tanglish word is matched, its number is not. The G2 ledger says "Tamil three months read as one month" was fixed; Tanglish was not |
| SKG1-22 | P0 | "last ten days", "last seven days", "last 7d", "last 30d", "last 1 day": all answered as the 90-day default (9,113) | read them, or say they are not read | the number is digits only, and only with a spelled unit |
| SKG1-23 | P0 | "last -5 days", "last 3.5 days", "last 1000 days", "pona 0 naal", "கடந்த 0 நாட்களில்", "கடந்த 500 நாட்களில்" answered with 9,113 | named as not a window, as "last 0 days" is in English | RC-43 fixed the English "0" only |
| SKG1-24 | P0 | "since monday", "this year", "last year", "from last monday", "this fortnight": 9,113 (90 days) | say the window is not held | no refusal for an unread window; the default is used |
| SKG1-25 | P0 | "how many complaints on 15 Oct" and "between 1 Oct and 15 Oct": 3,249 (the whole of October) | the day or range, or say a single day is not held | the month pattern takes "Oct" and drops the day |
| SKG1-26 | P0 | Tamil "அக்டோபர் மாதம்" gives 3,255 (last 30 days); English "october" gives 3,249. "அக்டோபர் 15 அன்று" gives 9,113 and "15 october anru" gives 3,249 | the month asked | the month list is English only; Tamil month names are not read |
| SKG1-27 | P1 | Tanglish "innaiku evlo complaints" gives 9,113 (90 days); Tamil "இன்று" gives 147 | today | `innaiku` is not in the today words of this reader (it is in Jarvis's) |
| SKG1-31 | P0 | Jarvis: Tamil "கடந்த 2 வாரங்களில்", "கடந்த இரண்டு வாரம்", Tanglish "pona 2 vaaram", "pona rendu vaaram" set the period to weekly (7 days) | not 7 days: 14 days is not a console window, so ask or refuse | the count word is dropped, the unit is kept |
| SKG1-32 | P0 | Jarvis: Tamil "கடந்த 3 மாதங்களில்", Tanglish "pona 3 maasam", "pona moonu maasam" set monthly (30 days). English "last 3 months" sets quarterly | quarterly | same cause |
| SKG1-28 | P1 | A forecast in Tamil words ("எதிர்காலத்தில் ... எப்படி இருக்கும்", "முன்கணிப்பு", "கணிப்பு", "முன்னறிவிப்பு", "அடுத்த காலாண்டு", "அடுத்த வருடம்") is answered with a past count ("8 சம்பவங்கள் · கடந்த 90 நாட்களில்", 9,113) | the "I cannot forecast" refusal | the future-word list in `cannot.ts` has few Tamil words |
| SKG1-29 | P1 | English "by december how many complaints will there be", "in the coming days how many complaints", "upcoming week complaints estimate", "what is the outlook for complaints": a past count | refusal | the pattern is `will (be, get, ...)` and misses "will there be"; no "coming", "upcoming", "outlook" |
| SKG1-30 | P1 | "close all overdue cases", "reopen yesterday's complaints", "export all complaints to excel" (and the Tanglish and Tamil of export) are answered with a list of incidents. "delete all complaints" is refused correctly | say it is not done, and where to do it | the order verbs close, reopen, export are not in the not-done list (RC-44 class) |
| SKG1-01 | P1 | Stage: "draft the last two" drafts positions [8,2] (the list has 8). Same for "draft last 2" | [7,8] | `readPositions` keeps LAST (-1) and the number as two positions |
| SKG1-02 | P1 | "draft first and third" and "draft the first and the third" draft [1,2,3] | [1,3] | the "first N is a count" branch of `readPositions` and the `first` flag in `stagelocal.ts` take the last number as a count |
| SKG1-03 | P1 | "draft the second last" / "2nd last" draft [2,8] | the one before the last, or ask | same |
| SKG1-04 | P1 | Tamil "முதல் மூன்று வரைவு செய்" and Tanglish "mudhal moonu draft pannu" draft [1,3]; English "first three" drafts [1,2,3] | [1,2,3] | the "first N is a count" rule tests the English words `first` and `top` only |
| SKG1-05 | P1 | Tamil "கடைசி இரண்டு", Tanglish "kadaisi rendu" draft [8,2] | [7,8] | as SKG1-01 |
| SKG1-06 | P1 | "3 முதல் 5 வரைவு செய்" and "draft pannu 3 mudhal 5" draft [3,1,5] (முதல் read as "first", and "from 3 to 5" has no `to` word) | [3,4,5], or ask | `முதல்`/`mudhal` is only ever 1 |
| SKG1-07 | P1 | "draft 3.5" drafts [3,5] ("3" and "5") | ask | `tokensOf` splits on the point |
| SKG1-08 | P1 | Number gate passes a model line "இருவர் உயிரிழந்தனர்" (two died), and the same with மூவர், நால்வர், ஐவர், அறுவர், எழுவர் | refused as a figure | the Tamil stems have no people-count words |
| SKG1-09 | P1 | gate passes "எட்டுப் புகார்கள் உள்ளன" (eight complaints), "ஆறுப் புகார்கள்", "ஏழுப் புகார்கள்", "ஆறுபேர் காயம்", "இரு புகார்கள் தாமதம்", "ஈராயிரம்" | refused | the stems for 6, 7, 8 are anchored with `$`, so the joining `ப்` or a glued noun hides them; `இரு` and `ஈர` are not stems |
| SKG1-10 | P1 | gate passes "௱ புகார்கள்" (100), "௰", "௲", "ஒன்றரை மணி நேரம்", "அரை மணி நேரம்", "கால் மணி நேரம்", "arai manineram" | refused | the Tamil number signs are not digits (category No) and not in NFKC; fractions are not stems |
| SKG1-11 | P1 | gate passes Tanglish "irupathu", "muppathu", "ambathu", "arubathu", "ezhubathu", "enbathu", "thombadhu" | refused | `TG_WORDS` lists one spelling of each ten (`-dhu`), not the `-thu` spelling |
| SKG1-12 | P1 | gate passes "moonooru", "naanooru", "ainooru", "irandaayiram", "moonaayiram", "randu", "anchu", "aindhu", "moonru", "munru" | refused | a closed word list of one spelling each |
| SKG1-13 | P2 | gate passes "threefold", "tenfold", "trebled", "quadrupled" while "double", "triple", "twice" are figures | refused | `EN_WORDS` has no multiples |
| SKG1-14 | P1 | Reminders: `understand.ts parseWhen` on a UTC server gives 17:00 UTC for "tomorrow at 5 pm", which is 22:30 IST; on a Los Angeles server 01:00 UTC. Tamil and Tanglish the same | 11:30 UTC (17:00 IST) on any server | `d.setDate`, `d.setHours`, `getDay` read the server zone. `plan.ts` line 217 runs it on the server. RC-16 was fixed in `sourcemap.ts` only |
| SKG1-15 | P1 | the same through the browser's real path, `TZ=UTC`: the card says "Remind you 7 Nov, 10:30 pm" for "tomorrow at 5 pm" | 5:00 pm | as SKG1-14 |
| SKG1-16 | P1 | `parseWhen("02-Oct-2026")` is 2 Oct 00:00 UTC on a UTC server and 07:00 UTC on a Los Angeles server; on an IST machine it is 1 Oct 18:30 UTC. The RC-16 guard has no day-dash-month-name case | 18:30 UTC on 1 Oct on every server | falls to the generic parse, which V8 reads differently for this shape, so the zone fix does not apply |
| SKG1-17 | P1 | "02 Oct 2026 23:30 IST" gives 00:00 IST (the 23:30 is lost); "Oct 2, 2026 11:30 PM IST" and "2026-10-02T23:30:00 IST" give null | 18:00 UTC | the named-zone test accepts `IST`, but V8's `Date` does not know `IST`, so the fallback reads the date only |
| SKG1-18 | P2 | "31/02/2026" gives 2 Mar, "2026-02-31" 3 Mar, "29/02/2027" 1 Mar, "31 Feb 2026" 3 Mar (silently moved) | null | V8 rolls the day over. RC-43 (a date that cannot be applied is named) is not applied to source dates |
| SKG1-19 | P2 | "12 Oct" and "Oct 12" give the year 2001 | null, or this year | V8's legacy parse |
| SKG1-33 | P1 | Jarvis: "zone anju brief sollu", "zone aindhu brief sollu" open the district morning brief (`mission brief`); "zone ٥ brief" and "zone ５ brief" give the district brief | zone 5 | the quick brief reader and the Tanglish zone reader take ASCII digits and English words only; the G2 fix reached the Tamil-letter reader |
| SKG1-34 | P1 | "zone 99 brief", "zone 0 brief", "zone fifty brief" give the district brief ("239 incidents ... in Chennai district") with no word that there is no such zone | name the zone as not there (as Ask does) | RC-43 was applied in `ask()` and the routes, not in the Jarvis quick brief |
| SKG1-35 | P2 | "zone five and six brief", "zones 5 to 7 brief" answer for zone 5 only, no word about the rest | say one zone at a time, or answer them | the second zone is dropped |
| SKG1-36 | P1 | A Tamil zone brief item reads "PWD Water Resources, ராயபுரம்: ..." and "Greater Chennai Police, தண்டையார்பேட்டை: ..." (a Latin body name in a Tamil spoken line). The G1 fix named the body in Tamil for a body's own brief only | a Tamil body name | the zone-brief point uses the English department name |
| SKG1-37 | P2 | Tamil rain line "4 அளவீடுகள். அதிகம்: Chennai-Madhavaram, 14 mm, 6 Nov, 8:30 AM நிலவரப்படி."; taluk line "Kolathur வட்டம்" | Tamil place, month, clock | the RC-15 pieces (month, unit, clock) were fixed in the briefing tool only |

SKG1-36 and SKG1-37 are RC-15 residue. The G2 ledger already marks RC-15 "partly"; I list them because they are in the shipped Tamil lines, with real-run text.

## What held (I tried and could not break it)

- Ordinals: "the one in Pallikaranai", "sixteenth", "open the 20th one" (said out of range), every digit script (I checked all 72 runs of `\p{Nd}`: every run is a multiple of 10 long except 0x116D0 (20) and 0x1D7CE (50), and both align), "open 08", "open ௩", Tamil ordinals to ten (`ஆறாவது`, `ஒன்பதாவது`), "I can open one case at a time" for a list.
- Zones: Tamil digits `௫`, Tamil words `ஐந்து`, `ஐந்தாம் எண்`, English `fifteen`, `zone 05`, `005`.
- parseWhen (sourcemap): every month-name shape in the guard, "12 AM", "12 PM", unix seconds and milliseconds, ISO with `+0530`, `Z`, fractions.
- Ask: "last 0 days", "31 February", "2025", "yesterday", Tamil "நேற்று", "கடந்த மாதம்", "pona maasam" (last month), forecast, "will be", "next week" in all three languages, save, letters, sources, split by department.
- The gate on digits of every script, `12k`, `2.5 lakhs`, `twenty-one`, grouped numbers: all caught or fail closed.

## Notes for the fixer

- One window reader, not three: `customWindow` (Ask), the Jarvis period table (3b4a771) and `LAST_WEEK_MONTH` should share one table with number words (English, Tamil letters, Tanglish, to 99), unit stems with case endings (`நாட்கள்`, `நாட்களில்`, `நாளில்`, `வாரங்களில்`, `மாதங்களில்`, `மணி நேரத்தில்`), digits of every script, and an explicit "not a window" answer. An unread window must never fall to the default. A property test over number x unit x language x ending would have found SKG1-20..27 and 31..32.
- Stage ordinals: make `readPositions` treat `last N`, `first N`, `top N`, `முதல் N`, `கடைசி N` as one count rule in all three languages; `முதல்` after a number is "from"; "second last" is LAST minus one; a list with a count word beside another number is refused.
- RC-16 class: one Chennai-clock helper for `understand.ts` (`getDay`, `setDate`, `setHours` in IST) and a parseWhen guard over the day-dash-month-name shape, `IST`, and impossible days.
- Gate: stems with an optional `ப்`, people words, `௰ ௱ ௲`, fractions, `-thu` and `-dhu` for every Tanglish ten, hundreds, and the multiples. A closed list of spellings will keep missing; consider refusing any Tamil or Tanglish token the gate cannot classify next to a counted noun.

## Not done

- No model was called, so nothing about a model's own wording was tested.
- Browsers were not run; the Stage and Jarvis were driven through `client-sim.ts`, which copies the browser's order of lanes and runs the real `planRound`.
- I did not check Tamil month names in the Jarvis lane or the officer console's window words.
- I did not read the sealed set or the authoring trail.
