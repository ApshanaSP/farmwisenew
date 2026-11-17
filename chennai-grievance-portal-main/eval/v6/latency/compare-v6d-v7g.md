# Before / after: v6d -> v7g

From `eval/v6/latency/v6d-*.json` and `v7g-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v6d | v7g |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 7 · 189 · 227 | 6 · 201 · 229 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 0 · - · - | 10 · 577 · 763 |
| Wake, open, all -> first audible reply | 7 · 189 · 227 | 16 · 554 · 605 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 12 · 163 · 185 | 4 · 170 · 172 |
| Command -> the screen changes | 0 · - · - | 3 · 1080 · 1295 |
| Command -> first sound | 0 · - · - | 4 · 293 · 335 |
| Question (EN, TA, Tanglish) -> first sound | 7 · 409 · 428 | 12 · 408 · 426 |
| Question -> first word of the answer | 7 · 3096 · 7006 | 12 · 3191 · 4150 |
|   English | 2 · 3020 · 3020 | 4 · 1947 · 4225 |
|   Tamil | 3 · 3889 · 4073 | 4 · 4027 · 4150 |
|   Tanglish | 2 · 7006 · 7006 | 4 · 1898 · 3191 |
| Question -> the whole answer in hand (the console's answer mark) | 7 · 2379 · 5847 | 12 · 1788 · 2937 |
| Question -> the answer's last word spoken | 7 · 37906 · 39168 | 12 · 20914 · 25676 |
| Voice start (answer handed -> its first word) | 7 · 742 · 1282 | 13 · 387 · 809 |
| Transcript at the page (questions) | 7 · 785 · 857 | 12 · 823 · 970 |

Closed wakes that fired: v6d 12/12, v7g 4/12. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v6d 0/2, v7g 1/4; cmd: v6d 0/0, v7g 0/4.
