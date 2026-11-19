# Before / after: v6a -> v7g

From `eval/v6/latency/v6a-*.json` and `v7g-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v6a | v7g |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 24 · 193 · 210 | 6 · 201 · 229 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 24 · 636 · 826 | 10 · 577 · 763 |
| Wake, open, all -> first audible reply | 48 · 551 · 732 | 16 · 554 · 605 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 1 · 158 · 158 | 4 · 170 · 172 |
| Command -> the screen changes | 9 · 1030 · 1737 | 3 · 1080 · 1295 |
| Command -> first sound | 12 · 414 · 432 | 4 · 293 · 335 |
| Question (EN, TA, Tanglish) -> first sound | 36 · 409 · 438 | 12 · 408 · 426 |
| Question -> first word of the answer | 33 · 2864 · 6343 | 12 · 3191 · 4150 |
|   English | 12 · 2864 · 3688 | 4 · 1947 · 4225 |
|   Tamil | 11 · 2874 · 6343 | 4 · 4027 · 4150 |
|   Tanglish | 10 · 3197 · 8226 | 4 · 1898 · 3191 |
| Question -> the whole answer in hand (the console's answer mark) | 34 · 2188 · 4200 | 12 · 1788 · 2937 |
| Question -> the answer's last word spoken | 33 · 23617 · 37759 | 12 · 20914 · 25676 |
| Voice start (answer handed -> its first word) | 37 · 675 · 1251 | 13 · 387 · 809 |
| Transcript at the page (questions) | 36 · 907 · 1408 | 12 · 823 · 970 |

Closed wakes that fired: v6a 1/12, v7g 4/12. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v6a 1/12, v7g 1/4; cmd: v6a 0/12, v7g 0/4.
