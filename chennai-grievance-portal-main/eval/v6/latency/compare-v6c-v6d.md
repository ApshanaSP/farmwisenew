# Before / after: v6c -> v6d

From `eval/v6/latency/v6c-*.json` and `v6d-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v6c | v6d |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 20 · 191 · 223 | 7 · 189 · 227 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 0 · - · - | 0 · - · - |
| Wake, open, all -> first audible reply | 20 · 191 · 223 | 7 · 189 · 227 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 0 · - · - | 12 · 163 · 185 |
| Command -> the screen changes | 9 · 1045 · 2795 | 0 · - · - |
| Command -> first sound | 12 · 414 · 438 | 0 · - · - |
| Question (EN, TA, Tanglish) -> first sound | 8 · 435 · 772 | 7 · 409 · 428 |
| Question -> first word of the answer | 8 · 4011 · 7879 | 7 · 3096 · 7006 |
|   English | 3 · 3058 · 3357 | 2 · 3020 · 3020 |
|   Tamil | 3 · 6145 · 6393 | 3 · 3889 · 4073 |
|   Tanglish | 2 · 7879 · 7879 | 2 · 7006 · 7006 |
| Question -> the whole answer in hand (the console's answer mark) | 8 · 2976 · 5496 | 7 · 2379 · 5847 |
| Question -> the answer's last word spoken | 8 · 37781 · 39278 | 7 · 37906 · 39168 |
| Voice start (answer handed -> its first word) | 12 · 1006 · 2604 | 7 · 742 · 1282 |
| Transcript at the page (questions) | 8 · 939 · 1387 | 7 · 785 · 857 |

Closed wakes that fired: v6c 0/0, v6d 12/12. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v6c 0/3, v6d 0/2; cmd: v6c 1/12, v6d 0/0.
