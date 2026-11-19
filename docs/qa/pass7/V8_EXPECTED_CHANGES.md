# Jarvis v8: test oracles changed for v8's intended behaviour

v8 build, branch `claude/jarvis-v8-700c5f` (from v7's `22304da4`). The brief is `docs/jarvis/JARVIS_V8.md`.
Each row is one oracle that pinned behaviour a v8 item changes on purpose, with the measurement or the brief's item behind it. Nothing else
was changed: any other red test is a regression, fixed in code. Every v8 change is undone by `JARVIS_UNDERSTAND=v7` (and its `NEXT_PUBLIC_` twin); each changed oracle below keeps v7's value under that switch where the test can set it.

| Oracle (file, test) | Old value | New value | Item |
|---|---|---|---|
| `src/lib/thunai/stt.test.ts`, "choosing between forced decodes > takes the more confident decode, leaning a little to the site's language" | Tamil site, `அடையாறு நிலவரம்` (-0.35) against `Adyar status` (-0.3): Tamil (the +0.1 lean) | English: two decodes that are translations of each other are weighed by their confidence alone; the lean stays for the same sounds in two scripts (a new case: `அடையாறு புகார்` / `Adyar pugar`, Tamil) and v7's value under `JARVIS_UNDERSTAND=v7` | The owner's example 4 (English answered in Tamil). v6's own measurement (17 Nov, `stt.v6.test.ts`): on the 10 English sentences heard as Tamil the English decode was the surer by 0.01-0.29; on the 12 Tamil sentences the Tamil decode was the surer by 0.08-1.07: confidence alone is right on all 22, the lean turned some of the 10 Tamil. Failing-first test: `stt.v8.test.ts` |
| `src/lib/thunai/stt.v4.test.ts`, "first good decode wins > Tamil site: a confident English decode alone does not end the race; the Tamil one does" | the Tamil decode (-0.2) won over the English one (-0.1) by the lean | the race still waits for the Tamil decode (at least 380 ms, unchanged); the English decode, the surer, then wins | the same |
