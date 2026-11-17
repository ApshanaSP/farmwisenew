# Latency waterfall: v6a

From `eval/v6/latency/v6a-*.json` (tests/e2e/real6.spec.ts). Each cell: **n · p50 · p90**, ms. Ends are from the clip's true last voiced sample; stage spans are between two stamps of the v5 trace in the same turn (server stages placed on the page clock at the request that sent them).

## closed (12 turns; lanes none 12; first sound pcm 1, none 11; woke 1/12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 1 · 158 · 158 |
| first speech (a voice, not a tone) | 1 · 158 · 158 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 1 · 1276 · 1276 |
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

## cmd (12 turns; lanes rules 7, planner 4, none 1; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 414 · 432 |
| first speech (a voice, not a tone) | 4 · 1676 · 2484 |
| answer handed to the voice (console's finding mark) | 4 · 1429 · 1737 |
| first word of the answer (the voice's own start) | 4 · 1676 · 2484 |
| voice start delay (handed → first word) | 4 · 247 · 747 |
| answer in hand, on screen (the console's answer mark) | 4 · 1370 · 1710 |
| end of the answer (its last word spoken) | 4 · 24607 · 28477 |
| screen change | 9 · 1030 · 1737 |
| transcript at the page (transcribed mark) | 12 · 853 · 1014 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 80 · 107 |
| end-of-turn wait (last voiced → end decided) | 12 · 332 · 343 |
| upload (end decided → upload sent) | 12 · 3 · 3 |
| server → speech-to-text sent | 12 · 12 · 13 |
| speech-to-text (sent → decode back) | 12 · 398 · 565 |
| transcript to the page (decode back → page has it) | 12 · 15 · 16 |
| address gate and rules | 11 · 18 · 21 |
| gate → planner call sent | 1 · 44 · 44 |
| planner (call sent → back) | 1 · 568 · 568 |
| tools and first sentence (planner back → tools done) | 1 · 295 · 295 |
| first streamed event (gate → first event) | 4 · 461 · 494 |
| to speak() (gate → speak called) | 4 · 522 · 920 |
| TTS (speak called → voice start) | 4 · 278 · 770 |

## en (12 turns; lanes planner 12; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 416 · 438 |
| first speech (a voice, not a tone) | 12 · 1831 · 2516 |
| answer handed to the voice (console's finding mark) | 12 · 2149 · 2914 |
| first word of the answer (the voice's own start) | 12 · 2864 · 3688 |
| voice start delay (handed → first word) | 12 · 693 · 805 |
| answer in hand, on screen (the console's answer mark) | 12 · 2126 · 2892 |
| end of the answer (its last word spoken) | 12 · 23617 · 37971 |
| screen change | 11 · 2060 · 2914 |
| transcript at the page (transcribed mark) | 12 · 992 · 1456 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 71 · 96 |
| end-of-turn wait (last voiced → end decided) | 12 · 332 · 366 |
| upload (end decided → upload sent) | 12 · 4 · 4 |
| server → speech-to-text sent | 12 · 13 · 13 |
| speech-to-text (sent → decode back) | 12 · 475 · 1021 |
| transcript to the page (decode back → page has it) | 12 · 17 · 19 |
| address gate and rules | 12 · 13 · 14 |
| gate → planner call sent | 3 · 25 · 47 |
| planner (call sent → back) | 3 · 1210 · 1226 |
| tools and first sentence (planner back → tools done) | 3 · 11 · 15 |
| first streamed event (gate → first event) | 12 · 186 · 1520 |
| to speak() (gate → speak called) | 12 · 935 · 2060 |
| TTS (speak called → voice start) | 12 · 697 · 814 |

## wake (12 turns; lanes none 12; first sound pcm 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 200 · 216 |
| first speech (a voice, not a tone) | 12 · 200 · 216 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 12 · 959 · 1194 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 12 · 661 · 919 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 63 · 72 |
| end-of-turn wait (last voiced → end decided) | 12 · 204 · 214 |
| upload (end decided → upload sent) | 12 · 4 · 8 |
| server → speech-to-text sent | 12 · 14 · 18 |
| speech-to-text (sent → decode back) | 12 · 358 · 599 |
| transcript to the page (decode back → page has it) | 12 · 16 · 35 |
| address gate and rules | 0 · - · - |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 0 · - · - |
| to speak() (gate → speak called) | 0 · - · - |
| TTS (speak called → voice start) | 0 · - · - |

## wake (12 turns; lanes none 12; first sound pcm 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 263 · 285 |
| first speech (a voice, not a tone) | 12 · 263 · 285 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 12 · 1057 · 1288 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 12 · 614 · 639 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 61 · 89 |
| end-of-turn wait (last voiced → end decided) | 12 · 203 · 214 |
| upload (end decided → upload sent) | 12 · 4 · 6 |
| server → speech-to-text sent | 12 · 14 · 15 |
| speech-to-text (sent → decode back) | 12 · 307 · 321 |
| transcript to the page (decode back → page has it) | 12 · 17 · 29 |
| address gate and rules | 0 · - · - |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 0 · - · - |
| to speak() (gate → speak called) | 0 · - · - |
| TTS (speak called → voice start) | 0 · - · - |

## ta (12 turns; lanes planner 11, none 1; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 404 · 434 |
| first speech (a voice, not a tone) | 11 · 1808 · 1939 |
| answer handed to the voice (console's finding mark) | 11 · 2203 · 5188 |
| first word of the answer (the voice's own start) | 11 · 2874 · 6343 |
| voice start delay (handed → first word) | 11 · 817 · 1341 |
| answer in hand, on screen (the console's answer mark) | 11 · 2188 · 5159 |
| end of the answer (its last word spoken) | 11 · 16890 · 29891 |
| screen change | 10 · 2289 · 6510 |
| transcript at the page (transcribed mark) | 12 · 866 · 1243 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 64 · 85 |
| end-of-turn wait (last voiced → end decided) | 12 · 333 · 344 |
| upload (end decided → upload sent) | 12 · 3 · 4 |
| server → speech-to-text sent | 12 · 13 · 14 |
| speech-to-text (sent → decode back) | 12 · 439 · 803 |
| transcript to the page (decode back → page has it) | 12 · 17 · 33 |
| address gate and rules | 11 · 18 · 26 |
| gate → planner call sent | 6 · 40 · 78 |
| planner (call sent → back) | 6 · 1400 · 3143 |
| tools and first sentence (planner back → tools done) | 6 · 929 · 2873 |
| first streamed event (gate → first event) | 11 · 76 · 299 |
| to speak() (gate → speak called) | 11 · 1221 · 4328 |
| TTS (speak called → voice start) | 11 · 831 · 1385 |

## tg (12 turns; lanes planner 11, none 1; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 409 · 424 |
| first speech (a voice, not a tone) | 10 · 2097 · 3197 |
| answer handed to the voice (console's finding mark) | 11 · 2423 · 4210 |
| first word of the answer (the voice's own start) | 10 · 3197 · 8226 |
| voice start delay (handed → first word) | 10 · 762 · 2535 |
| answer in hand, on screen (the console's answer mark) | 11 · 2346 · 4123 |
| end of the answer (its last word spoken) | 10 · 25402 · 38722 |
| screen change | 10 · 2454 · 7750 |
| transcript at the page (transcribed mark) | 12 · 999 · 1251 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 70 · 81 |
| end-of-turn wait (last voiced → end decided) | 12 · 332 · 343 |
| upload (end decided → upload sent) | 12 · 4 · 6 |
| server → speech-to-text sent | 12 · 15 · 16 |
| speech-to-text (sent → decode back) | 12 · 501 · 721 |
| transcript to the page (decode back → page has it) | 12 · 34 · 37 |
| address gate and rules | 11 · 33 · 43 |
| gate → planner call sent | 8 · 82 · 135 |
| planner (call sent → back) | 8 · 1245 · 2229 |
| tools and first sentence (planner back → tools done) | 8 · 161 · 5221 |
| first streamed event (gate → first event) | 11 · 145 · 495 |
| to speak() (gate → speak called) | 11 · 1263 · 3268 |
| TTS (speak called → voice start) | 10 · 785 · 2597 |

## wake (48 turns; lanes none 48; first sound pcm 48)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 48 · 551 · 732 |
| first speech (a voice, not a tone) | 48 · 551 · 732 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 48 · 1192 · 1684 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 48 · 654 · 854 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 48 · 70 · 96 |
| end-of-turn wait (last voiced → end decided) | 48 · 204 · 215 |
| upload (end decided → upload sent) | 48 · 3 · 7 |
| server → speech-to-text sent | 48 · 12 · 16 |
| speech-to-text (sent → decode back) | 48 · 334 · 524 |
| transcript to the page (decode back → page has it) | 48 · 17 · 33 |
| address gate and rules | 0 · - · - |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 0 · - · - |
| to speak() (gate → speak called) | 0 · - · - |
| TTS (speak called → voice start) | 0 · - · - |

## wake (4 turns; lanes planner 2, rules 2; first sound tone 4)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 4 · 399 · 407 |
| first speech (a voice, not a tone) | 2 · 1414 · 1414 |
| answer handed to the voice (console's finding mark) | 2 · 1193 · 1193 |
| first word of the answer (the voice's own start) | 2 · 1414 · 1414 |
| voice start delay (handed → first word) | 2 · 221 · 221 |
| answer in hand, on screen (the console's answer mark) | 2 · 1150 · 1150 |
| end of the answer (its last word spoken) | 2 · 8160 · 8160 |
| screen change | 3 · 923 · 1193 |
| transcript at the page (transcribed mark) | 4 · 710 · 725 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 4 · 73 · 77 |
| end-of-turn wait (last voiced → end decided) | 4 · 332 · 342 |
| upload (end decided → upload sent) | 4 · 3 · 3 |
| server → speech-to-text sent | 4 · 13 · 13 |
| speech-to-text (sent → decode back) | 4 · 300 · 302 |
| transcript to the page (decode back → page has it) | 4 · 18 · 18 |
| address gate and rules | 4 · 27 · 48 |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 2 · 404 · 404 |
| to speak() (gate → speak called) | 2 · 424 · 424 |
| TTS (speak called → voice start) | 2 · 274 · 274 |

## wake (4 turns; lanes planner 2, rules 2; first sound tone 4)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 4 · 415 · 419 |
| first speech (a voice, not a tone) | 2 · 1606 · 1606 |
| answer handed to the voice (console's finding mark) | 2 · 1322 · 1322 |
| first word of the answer (the voice's own start) | 2 · 1606 · 1606 |
| voice start delay (handed → first word) | 2 · 284 · 284 |
| answer in hand, on screen (the console's answer mark) | 2 · 1273 · 1273 |
| end of the answer (its last word spoken) | 2 · 8361 · 8361 |
| screen change | 3 · 1291 · 1322 |
| transcript at the page (transcribed mark) | 4 · 756 · 900 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 4 · 72 · 98 |
| end-of-turn wait (last voiced → end decided) | 4 · 342 · 344 |
| upload (end decided → upload sent) | 4 · 4 · 4 |
| server → speech-to-text sent | 4 · 16 · 20 |
| speech-to-text (sent → decode back) | 4 · 331 · 345 |
| transcript to the page (decode back → page has it) | 4 · 18 · 121 |
| address gate and rules | 4 · 25 · 74 |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 2 · 495 · 495 |
| to speak() (gate → speak called) | 2 · 517 · 517 |
| TTS (speak called → voice start) | 2 · 337 · 337 |
