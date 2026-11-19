# Before / after: v7h6 -> v7hg

From `eval/v6/latency/v7h6-*.json` and `v7hg-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v7h6 | v7hg |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 4 · 207 · 218 | 4 · 203 · 217 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 8 · 578 · 748 | 8 · 581 · 743 |
| Wake, open, all -> first audible reply | 12 · 572 · 621 | 12 · 568 · 597 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 0 · - · - | 0 · - · - |
| Command -> the screen changes | 0 · - · - | 0 · - · - |
| Command -> first sound | 0 · - · - | 0 · - · - |
| Question (EN, TA, Tanglish) -> first sound | 12 · 409 · 421 | 12 · 404 · 419 |
| Question -> first word of the answer | 11 · 1651 · 3745 | 11 · 1995 · 5101 |
|   English | 3 · 1404 · 2533 | 3 · 1733 · 5101 |
|   Tamil | 4 · 3636 · 4354 | 4 · 5058 · 9453 |
|   Tanglish | 4 · 1382 · 3745 | 4 · 1995 · 2302 |
| Question -> the whole answer in hand (the console's answer mark) | 11 · 1241 · 3114 | 11 · 1154 · 3220 |
| Question -> the answer's last word spoken | 12 · 18581 · 34677 | 12 · 20673 · 28037 |
| Voice start (answer handed -> its first word) | 11 · 379 · 846 | 11 · 316 · 1456 |
| Transcript at the page (questions) | 12 · 777 · 965 | 12 · 781 · 886 |

Closed wakes that fired: v7h6 0/0, v7hg 0/0. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v7h6 0/4, v7hg 1/4; cmd: v7h6 0/0, v7hg 0/0.
