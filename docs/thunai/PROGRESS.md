# Thunai: progress

Branch `thunai/pilot` (from `main` at 9a20b92). Built from `docs/thunai/BUILD_PROMPT.md`. Nothing pushed.

## Decisions taken while building (the owner was asleep)
- The build runs in the session that wrote the prompt: the app refused to start a new session from an automated
  event, so the fallback promised to the owner was used.
- Golden set: 162 commands (70 English, 51 Tamil, 41 Tanglish). It was written together with the rules, so it shows
  that the rules do what was designed, not how they do on unseen speech. A separate unseen set is reported in REPORT.md.
- Departments and categories come from the console at runtime; the spoken aliases (lexicon.ts) use the department
  codes in `data/gcc-reference/intel-reference.json` (GCC-SWD, CMWSSB, POL-GCP…).
- "Same for last month" sets the monthly period: the console already compares each period with the one before, so no
  new date-offset logic was added.
- A bare "water" is both a department (Metro Water) and a category (drinking water): Thunai asks once.
- Ward numbers (16–200) go to Ask the Map, because the console's filters stop at zones.

## Slices
| Slice | State | Proof |
|---|---|---|
| 1. Understanding engine (normalise, lexicon, understand, risk, say, audit, watch) | done | `src/lib/thunai/*.test.ts`: 30 tests; golden 100% EN / TA / Tanglish; rules p50 0.9 ms, p90 1.4 ms |
| 2. Orb, subtitles, registry, pointer, chips, undo | next | |
| 3. Voice modes, show numbers, tray, audit API | | |
| 4. Nova Lite fallback, memory | | |
| 5. Watch, missions, spotlight | | |
| 6. Browser check, build, report | | |
