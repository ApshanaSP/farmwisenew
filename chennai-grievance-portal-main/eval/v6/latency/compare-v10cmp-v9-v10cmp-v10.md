# Before / after: v10cmp-v9 -> v10cmp-v10

From `eval/v6/latency/v10cmp-v9-*.json` and `v10cmp-v10-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v10cmp-v9 | v10cmp-v10 |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 18 · 202 · 218 | 18 · 195 · 213 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 30 · 570 · 614 | 30 · 563 · 636 |
| Wake, open, all -> first audible reply | 48 · 555 · 603 | 48 · 546 · 609 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 4 · 164 · 168 | 4 · 165 · 176 |
| Command -> the screen changes | 10 · 859 · 1956 | 10 · 806 · 1405 |
| Command -> first sound | 12 · 308 · 340 | 12 · 293 · 324 |
| Question (EN, TA, Tanglish) -> first sound | 36 · 404 · 423 | 36 · 399 · 427 |
| Question -> first word of the answer | 33 · 2431 · 4716 | 34 · 3950 · 5968 |
|   English | 12 · 2431 · 3646 | 12 · 2837 · 4470 |
|   Tamil | 11 · 2598 · 3747 | 11 · 4304 · 5971 |
|   Tanglish | 10 · 4079 · 4997 | 11 · 3259 · 5709 |
| Question -> the whole answer in hand (the console's answer mark) | 33 · 1026 · 3558 | 34 · 1223 · 3940 |
| Question -> the answer's last word spoken | 33 · 20803 · 28165 | 34 · 22503 · 30733 |
| Voice start (answer handed -> its first word) | 37 · 326 · 709 | 37 · 300 · 777 |
| Transcript at the page (questions) | 36 · 832 · 893 | 36 · 831 · 953 |

Closed wakes that fired: v10cmp-v9 4/12, v10cmp-v10 4/12. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v10cmp-v9 0/12, v10cmp-v10 0/12; cmd: v10cmp-v9 0/12, v10cmp-v10 0/12.
