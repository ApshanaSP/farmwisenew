# Before / after: phase0 -> v6a

From `eval/v6/latency/phase0-*.json` and `v6a-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | phase0 | v6a |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 18 · 703 · 743 | 24 · 193 · 210 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 30 · 720 · 846 | 24 · 636 · 826 |
| Wake, open, all -> first audible reply | 48 · 713 · 846 | 48 · 551 · 732 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 0 · - · - | 1 · 158 · 158 |
| Command -> the screen changes | 3 · 1192 · 1194 | 9 · 1030 · 1737 |
| Command -> first sound | 12 · 424 · 445 | 12 · 414 · 432 |
| Question (EN, TA, Tanglish) -> first sound | 36 · 405 · 427 | 36 · 409 · 438 |
| Question -> first word of the answer | 34 · 3166 · 5656 | 33 · 2864 · 6343 |
|   English | 12 · 4109 · 5471 | 12 · 2864 · 3688 |
|   Tamil | 11 · 3428 · 4318 | 11 · 2874 · 6343 |
|   Tanglish | 11 · 3128 · 7578 | 10 · 3197 · 8226 |
| Question -> the whole answer in hand (the console's answer mark) | 0 · - · - | 34 · 2188 · 4200 |
| Question -> the answer's last word spoken | 34 · 19943 · 30842 | 33 · 23617 · 37759 |
| Voice start (answer handed -> its first word) | 42 · 1253 · 1856 | 37 · 675 · 1251 |
| Transcript at the page (questions) | 36 · 833 · 1356 | 36 · 907 · 1408 |

Closed wakes that fired: phase0 0/12, v6a 1/12. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: phase0 7/12, v6a 1/12; cmd: phase0 4/12, v6a 0/12.
