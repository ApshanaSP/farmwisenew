# Lane c skeptic review (branch claude/p4-lane-c)

Read only the commit messages and code. Every break below has a failing test, written with `it.fails`, in
`tests/qa/pass4/c-skeptic.test.ts` (53 cases, all green because they fail as expected; the fixer flips them to `it`).
Run: `npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/c-skeptic.test.ts`.
Real-path evidence: `tests/qa/pass4/c-skeptic-real.probe.test.ts` through the client simulator and the real round code, log in
`docs/qa/pass4/reviews/c-skeptic-realrun.txt`. A server from `.next-qa` on port 3163 (now stopped) was used for the bad-body sweeps.

## Breaks

| id | sev | commit | what |
|---|---|---|---|
| CSK-1 | P0 | RC-18/19 exit gate | `FILED_BY`, `ADDRESS_LINE` have no `i` flag. "Filed by Ramesh Kumar", "Reported by Priya Raman of Adyar", "Raised by Priya", "Door No 5, Anna Salai", "House No 12" pass the gate (`lineProblem` = null). Only lower-case "filed by" is read. A line that starts a sentence is the common case. |
| CSK-2 | P0 | RC-19 exit gate | Tanglish "Ramesh dhaan indha complaint kuduthaar" (one word between dhaan and complaint), "indha complaint Ramesh kuduthaar"; Tamil "புகார் ரமேஷ் குமார் என்பவரால் கொடுக்கப்பட்டது", "ரமேஷ் என்பவர்": name before the verb, no fixed shape matches. |
| CSK-3 | P0 | RC-18 redaction | A number said half in digits and half in words ("98765 four three two one zero", "ஒன்பது 8 7 6 5 4 3 2 1 0", "9876 five 43210") and "98765_43210" are not hidden. |
| CSK-4 | P1 | RC-19 refusal in code | Verbs the commit says it covers, in common spoken forms, are not refused: "INC-4 ஐ அப்ரூவ் பண்ணு" (the usual Tamil for approve), "அப்ரூவ் பண்ணுங்க", "sanction pannunga", "send seiyunga", "anuppunga", "anupidunga", "azhichidunga", "neekkidunga" (the `\b` ends the word before the suffix), and mark-as-resolved in Tamil/Tanglish ("resolved nu mark pannu", "மார்க் பண்ணு", "தீர்ந்ததாக குறி"). Real run: these go to the model lane (`no-model` here) with no code refusal, while "delete all complaints" is refused (log). |
| CSK-5 | P1 | RC-19 | Neighbouring English verbs of the same act: "clear all the complaints", "discard all drafts", "drop all cases", "get rid of all complaints", "trash every record", "sign off on INC-3" are not forbidden. Real run: same, not refused. |
| CSK-6 | P0 | RC-18 asksPrivate | Who-filed asked in other words is not refused: "who is the citizen behind INC-4", "who is the person behind INC-4", "identify the complainant of INC-4", "who submitted INC-4", "who phoned in the INC-4 leak", "INC-4 ஐ புகாரளித்தவரின் வீடு எங்கே", "INC-4 la pugar solravanga peru", "INC-4 இன் மூல உரை படி". Real run: "who is the citizen behind INC-4, give 98765 four three two one zero" goes to the model lane as a normal request (log). |
| CSK-7 | P3 | RC-25 localOnly | `Forwarded: host=evil.example.com;proto=https` with no `for=` is read as this PC (the address list is empty, so `every()` is true, and only `x-forwarded-host` is checked, not Forwarded's `host=`). |
| CSK-8 | P0 | RC-20 Studio rules | Naming a measure now forces a sum, even for a head-count question. "how many hospitals reported fever cases" answers "Total fever cases: 781" (real file, through the engine), not a count of hospitals. Same for "number of hospitals with fever cases", "how many weeks of fever cases are there". A wrong number said confidently. |
| CSK-9 | P2 | RC-25 looksLikePlaceholder | Judges by shape. "changeme_in_production_0123456789abcdef", "secret_secret_secret_1234567890abcdef", "CHANGEME-CHANGEME-1234567890-CHANGEME" pass as real secrets (a digit or a joined word defeats both patterns); a real passphrase "tamil-rain-lake-ward-bridge-harbour-zone" is refused in production. |
| CSK-10 | P1 | RC-19 exit gate | `NEGATED` is tested on the whole line, so one negation word anywhere turns off the order check: "Don't worry, I will send the report to the commissioner now" passes (control without "Don't worry" is caught as `order`). Same in Tamil/Tanglish. |

## Seen but not made into a test
- "how many fever cases in Velachery" answers 781, the all-area total (the place is not read as a filter). I did not check whether this is older than RC-20.
- A Tamil "how many rows" ("எத்தனை வரிசைகள் உள்ளன") now says it cannot read the question. Honest, but it answered correctly before RC-20. P3.
- Signed routes have no body cap (RC-17 guards only routes without a sign-in). A signed collector posting 5 MB of `observations:[1,1,...]` to the round route held the server for 3.2 s (400 in 14 ms for a small body). Next's own 10 MB limit bounds it. P3.

## Held up
- Bad bodies (null, array, number, bad JSON, deep nesting, wrong field types) on all 59 POST/PUT/PATCH/DELETE routes, with and without the collector, officer and citizen sign-ins: no 5xx (RC-23 class).
- `parseStoreId`: leading zeros, 2147483648, 1e3, Arabic and fullwidth digits, spaces, newline: all as intended. No old nine-digit rule is left in `src`.
- `csvCell`: "-1+2", "-1+cmd|...", "+91 9876", "=1+1", tab, "@SUM", "-.5", "- 5", "-5\n=1+1" are all text; plain negative numbers and exponents left alone.
- `searchGroups`: Tamil words with vowel signs, lone marks, punctuation only, "100%", "_": no empty list for text with words.
- Phone and e-mail redaction: Devanagari and Tamil digits, fullwidth, zero-width marks, grouped digits, "dot"/"at" forms, Tamil spoken e-mail, spelled digits in three languages (alone) are hidden.
- `asksPrivate` for 23 other wordings in English, Tamil and Tanglish (including Tamil case endings) refused as intended.

Nothing was committed to main, no model call, no real store written. Server on 3163 stopped.
