# Before / after: v8fin-v7 -> v8fin-v8

From `eval/v6/latency/v8fin-v7-*.json` and `v8fin-v8-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v8fin-v7 | v8fin-v8 |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 4 · 209 · 215 | 4 · 208 · 257 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 8 · 581 · 782 | 8 · 649 · 671 |
| Wake, open, all -> first audible reply | 12 · 572 · 606 | 12 · 583 · 658 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 4 · 149 · 191 | 4 · 190 · 197 |
| Command -> the screen changes | 10 · 1130 · 7525 | 10 · 1123 · 8332 |
| Command -> first sound | 12 · 304 · 345 | 12 · 318 · 365 |
| Question (EN, TA, Tanglish) -> first sound | 0 · - · - | 0 · - · - |
| Question -> first word of the answer | 0 · - · - | 0 · - · - |
|   English | 0 · - · - | 0 · - · - |
|   Tamil | 0 · - · - | 0 · - · - |
|   Tanglish | 0 · - · - | 0 · - · - |
| Question -> the whole answer in hand (the console's answer mark) | 0 · - · - | 0 · - · - |
| Question -> the answer's last word spoken | 0 · - · - | 0 · - · - |
| Voice start (answer handed -> its first word) | 4 · 230 · 260 | 4 · 240 · 319 |
| Transcript at the page (questions) | 0 · - · - | 0 · - · - |

Closed wakes that fired: v8fin-v7 4/12, v8fin-v8 4/12. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v8fin-v7 0/0, v8fin-v8 0/0; cmd: v8fin-v7 0/12, v8fin-v8 0/12.
