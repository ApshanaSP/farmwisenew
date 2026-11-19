# Before / after: v7h6 -> v7h

From `eval/v6/latency/v7h6-*.json` and `v7h-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v7h6 | v7h |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 4 · 207 · 218 | 6 · 184 · 206 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 8 · 578 · 748 | 10 · 558 · 735 |
| Wake, open, all -> first audible reply | 12 · 572 · 621 | 16 · 545 · 683 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 0 · - · - | 0 · - · - |
| Command -> the screen changes | 0 · - · - | 3 · 696 · 1090 |
| Command -> first sound | 0 · - · - | 4 · 298 · 301 |
| Question (EN, TA, Tanglish) -> first sound | 12 · 409 · 421 | 12 · 396 · 410 |
| Question -> first word of the answer | 11 · 1651 · 3745 | 12 · 3826 · 5754 |
|   English | 3 · 1404 · 2533 | 4 · 3826 · 5754 |
|   Tamil | 4 · 3636 · 4354 | 4 · 5335 · 6805 |
|   Tanglish | 4 · 1382 · 3745 | 4 · 3004 · 4422 |
| Question -> the whole answer in hand (the console's answer mark) | 11 · 1241 · 3114 | 12 · 1466 · 3039 |
| Question -> the answer's last word spoken | 12 · 18581 · 34677 | 12 · 22694 · 28034 |
| Voice start (answer handed -> its first word) | 11 · 379 · 846 | 13 · 359 · 799 |
| Transcript at the page (questions) | 12 · 777 · 965 | 12 · 800 · 841 |

Closed wakes that fired: v7h6 0/0, v7h 0/0. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v7h6 0/4, v7h 0/4; cmd: v7h6 0/0, v7h 0/4.
