# Before / after: v7g -> v7h

From `eval/v6/latency/v7g-*.json` and `v7h-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v7g | v7h |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 6 · 201 · 229 | 6 · 184 · 206 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 10 · 577 · 763 | 10 · 558 · 735 |
| Wake, open, all -> first audible reply | 16 · 554 · 605 | 16 · 545 · 683 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 4 · 170 · 172 | 0 · - · - |
| Command -> the screen changes | 3 · 1080 · 1295 | 3 · 696 · 1090 |
| Command -> first sound | 4 · 293 · 335 | 4 · 298 · 301 |
| Question (EN, TA, Tanglish) -> first sound | 12 · 408 · 426 | 12 · 396 · 410 |
| Question -> first word of the answer | 12 · 3191 · 4150 | 12 · 3826 · 5754 |
|   English | 4 · 1947 · 4225 | 4 · 3826 · 5754 |
|   Tamil | 4 · 4027 · 4150 | 4 · 5335 · 6805 |
|   Tanglish | 4 · 1898 · 3191 | 4 · 3004 · 4422 |
| Question -> the whole answer in hand (the console's answer mark) | 12 · 1788 · 2937 | 12 · 1466 · 3039 |
| Question -> the answer's last word spoken | 12 · 20914 · 25676 | 12 · 22694 · 28034 |
| Voice start (answer handed -> its first word) | 13 · 387 · 809 | 13 · 359 · 799 |
| Transcript at the page (questions) | 12 · 823 · 970 | 12 · 800 · 841 |

Closed wakes that fired: v7g 4/12, v7h 0/0. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v7g 1/4, v7h 0/4; cmd: v7g 0/4, v7h 0/4.
