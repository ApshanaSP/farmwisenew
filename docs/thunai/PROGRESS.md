# Thunai: progress

Branch `thunai/pilot` (from `main` at 9a20b92). Built from `docs/thunai/BUILD_PROMPT.md`. Nothing pushed or merged.

## Decisions taken while building (the owner was asleep)
- The build ran in the session that wrote the prompt: the app refused to start a new session from an automated event,
  so the fallback promised to the owner was used.
- Golden set: 162 commands (70 English, 51 Tamil, 41 Tanglish), written together with the rules: it shows the rules do
  what was designed. An **unseen** set of 36 new phrasings measures generalisation (see REPORT.md).
- Departments and categories come from the console at runtime; the spoken aliases (`lexicon.ts`) use the department
  codes in `data/gcc-reference/intel-reference.json` (GCC-SWD, CMWSSB, POL-GCP…).
- "Same for last month" sets the monthly period: the console already compares each period with the one before.
- A bare "water" is both a department (Metro Water) and a category (drinking water): Thunai asks once.
- Ward numbers (16–200) go to Ask the Map, because the console's filters stop at zones.
- A question that starts with "how many / which / why…" goes to Ask District IQ even if it names a period or place.
- The approval tray sends only when the draft says its delivery mode is `sandbox`; otherwise it opens the incident's
  Take action panel and the Collector sends from there.
- The browser check used a dev-only stand-in console (`/dev/thunai`, 404 in production): the real console needs a
  Collector sign-in, which was not used. The real console wiring is type-checked and built, not clicked through.

## Slices
| Slice | State | Proof |
|---|---|---|
| 1. Understanding engine | done | 162/162 golden; unseen 66.7% → 75% after two generic fixes; p50 0.9 ms |
| 2. Orb, subtitles, registry, pointer, chips, undo | done | browser check on `/dev/thunai` |
| 3. Show numbers, tray, audit | done | browser check; `parts.test.ts`, `server.test.ts` |
| 4. Nova Lite fallback, memory | done | `server.test.ts` (checker, memory file); the live model call was not exercised |
| 5. Watch, missions, spotlight | done (code) | Watch scoring/budget unit-tested; missions need the real console to check |
| 6. Build, report | see REPORT.md | |

## Next steps for the owner
1. Sign in to the console on port 3007 (`thunai-3007` launch config) and run the demo script in REPORT.md.
2. Have a Tamil speaker read the Tamil templates in `src/lib/thunai/say.ts` and the Tamil golden lines.
3. Check that Bedrock (Nova Lite) answers: say something unusual ("show me what's going on around the beach") and watch
   for "Thinking…" followed by a plan.
