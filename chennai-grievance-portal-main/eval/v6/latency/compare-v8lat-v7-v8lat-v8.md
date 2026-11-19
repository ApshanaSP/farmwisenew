# Before / after: v8lat-v7 -> v8lat-v8

From `eval/v6/latency/v8lat-v7-*.json` and `v8lat-v8-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v8lat-v7 | v8lat-v8 |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 16 · 206 · 214 | 16 · 211 · 223 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 0 · - · - | 0 · - · - |
| Wake, open, all -> first audible reply | 16 · 206 · 214 | 16 · 211 · 223 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 0 · - · - | 0 · - · - |
| Command -> the screen changes | 3 · 757 · 1759 | 3 · 1235 · 1928 |
| Command -> first sound | 4 · 292 · 310 | 4 · 322 · 327 |
| Question (EN, TA, Tanglish) -> first sound | 12 · 407 · 415 | 12 · 412 · 421 |
| Question -> first word of the answer | 12 · 5327 · 9796 | 12 · 5944 · 8701 |
|   English | 4 · 5690 · 10163 | 4 · 5920 · 5962 |
|   Tamil | 4 · 7066 · 8123 | 4 · 7249 · 8701 |
|   Tanglish | 4 · 4930 · 9796 | 4 · 4681 · 8931 |
| Question -> the whole answer in hand (the console's answer mark) | 12 · 3525 · 8128 | 12 · 4360 · 5325 |
| Question -> the answer's last word spoken | 12 · 23219 · 36308 | 12 · 24987 · 34188 |
| Voice start (answer handed -> its first word) | 13 · 400 · 824 | 13 · 372 · 953 |
| Transcript at the page (questions) | 12 · 832 · 902 | 12 · 827 · 903 |

Closed wakes that fired: v8lat-v7 0/0, v8lat-v8 0/0. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v8lat-v7 1/4, v8lat-v8 1/4; cmd: v8lat-v7 0/4, v8lat-v8 0/4.
