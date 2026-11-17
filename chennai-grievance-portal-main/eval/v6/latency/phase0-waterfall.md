# Latency waterfall: phase0

From `eval/v6/latency/phase0-*.json` (tests/e2e/real6.spec.ts). Each cell: **n · p50 · p90**, ms. Ends are from the clip's true last voiced sample; stage spans are between two stamps of the v5 trace in the same turn (server stages placed on the page clock at the request that sent them).

## closed (12 turns; lanes none 12; first sound none 12; woke 0/12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 0 · - · - |
| first speech (a voice, not a tone) | 0 · - · - |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| end of the answer | 0 · - · - |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 0 · - · - |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 0 · - · - |
| end-of-turn wait (last voiced → end decided) | 0 · - · - |
| upload (end decided → upload sent) | 0 · - · - |
| server → speech-to-text sent | 0 · - · - |
| speech-to-text (sent → decode back) | 0 · - · - |
| transcript to the page (decode back → page has it) | 0 · - · - |
| address gate and rules | 0 · - · - |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 0 · - · - |
| to speak() (gate → speak called) | 0 · - · - |
| TTS (speak called → voice start) | 0 · - · - |

## cmd (12 turns; lanes rules 4, planner 8; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 424 · 445 |
| first speech (a voice, not a tone) | 8 · 2469 · 3040 |
| answer handed to the voice (console's finding mark) | 8 · 1739 · 4157 |
| first word of the answer (the voice's own start) | 8 · 3040 · 5293 |
| voice start delay (handed → first word) | 8 · 858 · 1301 |
| end of the answer | 8 · 24687 · 32881 |
| screen change | 3 · 1192 · 1194 |
| transcript at the page (transcribed mark) | 12 · 825 · 1172 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 88 · 97 |
| end-of-turn wait (last voiced → end decided) | 12 · 333 · 343 |
| upload (end decided → upload sent) | 12 · 3 · 4 |
| server → speech-to-text sent | 12 · 13 · 14 |
| speech-to-text (sent → decode back) | 12 · 366 · 748 |
| transcript to the page (decode back → page has it) | 12 · 19 · 23 |
| address gate and rules | 12 · 18 · 34 |
| gate → planner call sent | 4 · 37 · 44 |
| planner (call sent → back) | 4 · 934 · 2277 |
| tools and first sentence (planner back → tools done) | 4 · 2315 · 2552 |
| first streamed event (gate → first event) | 8 · 412 · 1112 |
| to speak() (gate → speak called) | 8 · 737 · 3296 |
| TTS (speak called → voice start) | 8 · 887 · 1306 |

## en (12 turns; lanes planner 12; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 405 · 429 |
| first speech (a voice, not a tone) | 12 · 2498 · 3251 |
| answer handed to the voice (console's finding mark) | 12 · 3092 · 3999 |
| first word of the answer (the voice's own start) | 12 · 4109 · 5471 |
| voice start delay (handed → first word) | 12 · 869 · 1657 |
| end of the answer | 12 · 21270 · 29355 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 12 · 1006 · 1426 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · -445 · 74 |
| end-of-turn wait (last voiced → end decided) | 12 · 892 · 1063 |
| upload (end decided → upload sent) | 12 · 11 · 12 |
| server → speech-to-text sent | 12 · 13 · 14 |
| speech-to-text (sent → decode back) | 12 · 581 · 1010 |
| transcript to the page (decode back → page has it) | 12 · 21 · 23 |
| address gate and rules | 12 · 18 · 21 |
| gate → planner call sent | 5 · 43 · 62 |
| planner (call sent → back) | 5 · 1427 · 3701 |
| tools and first sentence (planner back → tools done) | 5 · 27 · 2397 |
| first streamed event (gate → first event) | 12 · 92 · 2733 |
| to speak() (gate → speak called) | 12 · 1499 · 3204 |
| TTS (speak called → voice start) | 12 · 875 · 1665 |

## ta (12 turns; lanes planner 11, none 1; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 407 · 419 |
| first speech (a voice, not a tone) | 11 · 2838 · 4251 |
| answer handed to the voice (console's finding mark) | 11 · 1739 · 2785 |
| first word of the answer (the voice's own start) | 11 · 3428 · 4318 |
| voice start delay (handed → first word) | 11 · 1652 · 1986 |
| end of the answer | 11 · 19532 · 28093 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 12 · 825 · 913 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · -124 · 50 |
| end-of-turn wait (last voiced → end decided) | 12 · 554 · 799 |
| upload (end decided → upload sent) | 12 · 3 · 3 |
| server → speech-to-text sent | 12 · 13 · 14 |
| speech-to-text (sent → decode back) | 12 · 375 · 421 |
| transcript to the page (decode back → page has it) | 12 · 21 · 24 |
| address gate and rules | 11 · 23 · 29 |
| gate → planner call sent | 6 · 49 · 62 |
| planner (call sent → back) | 6 · 1237 · 1865 |
| tools and first sentence (planner back → tools done) | 6 · 32 · 432 |
| first streamed event (gate → first event) | 11 · 76 · 512 |
| to speak() (gate → speak called) | 11 · 885 · 1966 |
| TTS (speak called → voice start) | 11 · 1660 · 1993 |

## tg (12 turns; lanes planner 11, none 1; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 404 · 410 |
| first speech (a voice, not a tone) | 11 · 3128 · 7578 |
| answer handed to the voice (console's finding mark) | 11 · 1901 · 5115 |
| first word of the answer (the voice's own start) | 11 · 3128 · 7578 |
| voice start delay (handed → first word) | 11 · 1390 · 2306 |
| end of the answer | 11 · 15328 · 30842 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 12 · 830 · 926 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 63 · 69 |
| end-of-turn wait (last voiced → end decided) | 12 · 342 · 342 |
| upload (end decided → upload sent) | 12 · 3 · 4 |
| server → speech-to-text sent | 12 · 13 · 14 |
| speech-to-text (sent → decode back) | 12 · 387 · 485 |
| transcript to the page (decode back → page has it) | 12 · 21 · 25 |
| address gate and rules | 11 · 21 · 26 |
| gate → planner call sent | 9 · 44 · 72 |
| planner (call sent → back) | 9 · 1119 · 1619 |
| tools and first sentence (planner back → tools done) | 9 · 37 · 2929 |
| first streamed event (gate → first event) | 11 · 62 · 90 |
| to speak() (gate → speak called) | 11 · 937 · 4330 |
| TTS (speak called → voice start) | 11 · 1396 · 2313 |

## wake (48 turns; lanes none 47, planner 1; first sound tone 48)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 48 · 713 · 846 |
| first speech (a voice, not a tone) | 1 · 2913 · 2913 |
| answer handed to the voice (console's finding mark) | 1 · 1975 · 1975 |
| first word of the answer (the voice's own start) | 1 · 2913 · 2913 |
| voice start delay (handed → first word) | 1 · 938 · 938 |
| end of the answer | 1 · 4829 · 4829 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 48 · 692 · 843 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 48 · 54 · 91 |
| end-of-turn wait (last voiced → end decided) | 48 · 342 · 966 |
| upload (end decided → upload sent) | 48 · 2 · 6 |
| server → speech-to-text sent | 48 · 11 · 12 |
| speech-to-text (sent → decode back) | 48 · 259 · 391 |
| transcript to the page (decode back → page has it) | 48 · 18 · 22 |
| address gate and rules | 1 · 20 · 20 |
| gate → planner call sent | 1 · 39 · 39 |
| planner (call sent → back) | 1 · 1035 · 1035 |
| tools and first sentence (planner back → tools done) | 1 · 2 · 2 |
| first streamed event (gate → first event) | 1 · 48 · 48 |
| to speak() (gate → speak called) | 1 · 1106 · 1106 |
| TTS (speak called → voice start) | 1 · 944 · 944 |
