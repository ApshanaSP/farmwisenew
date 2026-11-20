# Before / after: v10q-v9 -> v10q-v10

From `eval/v6/latency/v10q-v9-*.json` and `v10q-v10-*.json` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.

| Moment | v10q-v9 | v10q-v10 |
|---|---|---|
| Wake, open, "Hey Jarvis" -> first audible reply | 13 · 193 · 227 | 13 · 181 · 202 |
| Wake, open, "Hi/Hello Jarvis" and Tamil -> first audible reply | 23 · 579 · 602 | 23 · 560 · 595 |
| Wake, open, all -> first audible reply | 36 · 547 · 602 | 36 · 546 · 589 |
| Wake, closed -> first audible reply (fired / tried in the first column) | 0 · - · - | 0 · - · - |
| Command -> the screen changes | 0 · - · - | 0 · - · - |
| Command -> first sound | 0 · - · - | 0 · - · - |
| Question (EN, TA, Tanglish) -> first sound | 36 · 405 · 429 | 36 · 401 · 422 |
| Question -> first word of the answer | 33 · 4646 · 6561 | 34 · 4900 · 8218 |
|   English | 11 · 4050 · 6083 | 12 · 4619 · 5913 |
|   Tamil | 11 · 4902 · 9265 | 11 · 5010 · 9216 |
|   Tanglish | 11 · 3616 · 5981 | 11 · 4740 · 8218 |
| Question -> the whole answer in hand (the console's answer mark) | 33 · 1149 · 3746 | 34 · 1112 · 4543 |
| Question -> the answer's last word spoken | 34 · 23467 · 27959 | 34 · 23859 · 27312 |
| Voice start (answer handed -> its first word) | 33 · 293 · 805 | 34 · 297 · 608 |
| Transcript at the page (questions) | 36 · 839 · 881 | 36 · 833 · 897 |

Closed wakes that fired: v10q-v9 0/0, v10q-v10 0/0. Heard in the wrong language (a clip's language against what Whisper returned, by script): en: v10q-v9 0/12, v10q-v10 0/12; cmd: v10q-v9 0/0, v10q-v10 0/0.
