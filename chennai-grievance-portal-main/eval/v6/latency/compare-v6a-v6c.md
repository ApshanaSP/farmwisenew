# Before / after: v6a -> v6c

From `eval/v6/latency/v6a-*.json` and `v6c-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v6a | v6c |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 24 · 193 · 210 | 20 · 191 · 223 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 24 · 636 · 826 | 0 · - · - |
| Wake, open, all -> first audible reply | 48 · 551 · 732 | 20 · 191 · 223 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 1 · 158 · 158 | 0 · - · - |
| Command -> the screen changes | 9 · 1030 · 1737 | 9 · 1045 · 2795 |
| Command -> first sound | 12 · 414 · 432 | 12 · 414 · 438 |
| Question (EN, TA, Tanglish) -> first sound | 36 · 409 · 438 | 8 · 435 · 772 |
| Question -> first word of the answer | 33 · 2864 · 6343 | 8 · 4011 · 7879 |
|   English | 12 · 2864 · 3688 | 3 · 3058 · 3357 |
|   Tamil | 11 · 2874 · 6343 | 3 · 6145 · 6393 |
|   Tanglish | 10 · 3197 · 8226 | 2 · 7879 · 7879 |
| Question -> the whole answer in hand (the console's answer mark) | 34 · 2188 · 4200 | 8 · 2976 · 5496 |
| Question -> the answer's last word spoken | 33 · 23617 · 37759 | 8 · 37781 · 39278 |
| Voice start (answer handed -> its first word) | 37 · 675 · 1251 | 12 · 1006 · 2604 |
| Transcript at the page (questions) | 36 · 907 · 1408 | 8 · 939 · 1387 |

Closed wakes that fired: v6a 1/12, v6c 0/0. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v6a 1/12, v6c 0/3; cmd: v6a 0/12, v6c 1/12.
