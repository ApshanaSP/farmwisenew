# Latency waterfall: v6c

From `eval/v6/latency/v6c-*.json` (tests/e2e/real6.spec.ts). Each cell: **n · p50 · p90**, ms. Ends are from the clip's true last voiced sample; stage spans are between two stamps of the v5 trace in the same turn (server stages placed on the page clock at the request that sent them).

## cmd (12 turns; lanes rules 7, planner 5; first sound tone 12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 414 · 438 |
| first speech (a voice, not a tone) | 5 · 1807 · 1865 |
| answer handed to the voice (console's finding mark) | 4 · 1925 · 3116 |
| first word of the answer (the voice's own start) | 4 · 3113 · 4483 |
| voice start delay (handed → first word) | 4 · 1188 · 1367 |
| answer in hand, on screen (the console's answer mark) | 4 · 1882 · 3112 |
| end of the answer (its last word spoken) | 5 · 21309 · 25598 |
| screen change | 9 · 1045 · 2795 |
| transcript at the page (transcribed mark) | 12 · 849 · 1232 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 12 · 81 · 95 |
| end-of-turn wait (last voiced → end decided) | 12 · 342 · 342 |
| upload (end decided → upload sent) | 12 · 4 · 5 |
| server → speech-to-text sent | 12 · 13 · 14 |
| speech-to-text (sent → decode back) | 12 · 405 · 798 |
| transcript to the page (decode back → page has it) | 12 · 17 · 19 |
| address gate and rules | 12 · 18 · 35 |
| gate → planner call sent | 2 · 68 · 68 |
| planner (call sent → back) | 2 · 1870 · 1870 |
| tools and first sentence (planner back → tools done) | 2 · 17 · 17 |
| first streamed event (gate → first event) | 5 · 459 · 463 |
| to speak() (gate → speak called) | 4 · 481 · 1845 |
| TTS (speak called → voice start) | 4 · 1215 · 1371 |

## en (3 turns; lanes planner 3; first sound tone 3)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 3 · 435 · 743 |
| first speech (a voice, not a tone) | 3 · 1828 · 1848 |
| answer handed to the voice (console's finding mark) | 3 · 2287 · 2572 |
| first word of the answer (the voice's own start) | 3 · 3058 · 3357 |
| voice start delay (handed → first word) | 3 · 771 · 785 |
| answer in hand, on screen (the console's answer mark) | 3 · 2275 · 2547 |
| end of the answer (its last word spoken) | 3 · 38723 · 39278 |
| screen change | 2 · 2572 · 2572 |
| transcript at the page (transcribed mark) | 3 · 826 · 1387 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 3 · 65 · 88 |
| end-of-turn wait (last voiced → end decided) | 3 · 342 · 694 |
| upload (end decided → upload sent) | 3 · 7 · 7 |
| server → speech-to-text sent | 3 · 13 · 14 |
| speech-to-text (sent → decode back) | 3 · 363 · 611 |
| transcript to the page (decode back → page has it) | 3 · 17 · 18 |
| address gate and rules | 3 · 10 · 15 |
| gate → planner call sent | 1 · 22 · 22 |
| planner (call sent → back) | 1 · 1381 · 1381 |
| tools and first sentence (planner back → tools done) | 1 · 8 · 8 |
| first streamed event (gate → first event) | 3 · 401 · 1217 |
| to speak() (gate → speak called) | 3 · 1436 · 1753 |
| TTS (speak called → voice start) | 3 · 782 · 798 |

## ta (3 turns; lanes planner 3; first sound tone 3)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 3 · 423 · 572 |
| first speech (a voice, not a tone) | 3 · 1846 · 2014 |
| answer handed to the voice (console's finding mark) | 3 · 3324 · 3541 |
| first word of the answer (the voice's own start) | 3 · 6145 · 6393 |
| voice start delay (handed → first word) | 3 · 2604 · 3069 |
| answer in hand, on screen (the console's answer mark) | 3 · 3289 · 3507 |
| end of the answer (its last word spoken) | 3 · 30755 · 39123 |
| screen change | 3 · 3325 · 3541 |
| transcript at the page (transcribed mark) | 3 · 939 · 996 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 3 · 76 · 81 |
| end-of-turn wait (last voiced → end decided) | 3 · 342 · 503 |
| upload (end decided → upload sent) | 3 · 5 · 6 |
| server → speech-to-text sent | 3 · 13 · 13 |
| speech-to-text (sent → decode back) | 3 · 394 · 494 |
| transcript to the page (decode back → page has it) | 3 · 15 · 18 |
| address gate and rules | 3 · 17 · 21 |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 3 · 2275 · 2648 |
| to speak() (gate → speak called) | 3 · 2289 · 2659 |
| TTS (speak called → voice start) | 3 · 2627 · 3091 |

## tg (2 turns; lanes planner 2; first sound tone 2)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 2 · 772 · 772 |
| first speech (a voice, not a tone) | 2 · 2182 · 2182 |
| answer handed to the voice (console's finding mark) | 2 · 5538 · 5538 |
| first word of the answer (the voice's own start) | 2 · 7879 · 7879 |
| voice start delay (handed → first word) | 2 · 2341 · 2341 |
| answer in hand, on screen (the console's answer mark) | 2 · 5496 · 5496 |
| end of the answer (its last word spoken) | 2 · 37781 · 37781 |
| screen change | 2 · 5539 · 5539 |
| transcript at the page (transcribed mark) | 2 · 1166 · 1166 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 2 · 80 · 80 |
| end-of-turn wait (last voiced → end decided) | 2 · 694 · 694 |
| upload (end decided → upload sent) | 2 · 7 · 7 |
| server → speech-to-text sent | 2 · 13 · 13 |
| speech-to-text (sent → decode back) | 2 · 367 · 367 |
| transcript to the page (decode back → page has it) | 2 · 16 · 16 |
| address gate and rules | 2 · 17 · 17 |
| gate → planner call sent | 1 · 46 · 46 |
| planner (call sent → back) | 1 · 1548 · 1548 |
| tools and first sentence (planner back → tools done) | 1 · 2711 · 2711 |
| first streamed event (gate → first event) | 2 · 183 · 183 |
| to speak() (gate → speak called) | 2 · 4327 · 4327 |
| TTS (speak called → voice start) | 2 · 2370 · 2370 |

## wake (20 turns; lanes none 20; first sound pcm 20)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 20 · 191 · 223 |
| first speech (a voice, not a tone) | 20 · 191 · 223 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 20 · 943 · 1234 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 20 · 657 · 1134 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 20 · 59 · 92 |
| end-of-turn wait (last voiced → end decided) | 20 · 203 · 214 |
| upload (end decided → upload sent) | 20 · 4 · 6 |
| server → speech-to-text sent | 20 · 13 · 16 |
| speech-to-text (sent → decode back) | 20 · 363 · 809 |
| transcript to the page (decode back → page has it) | 20 · 16 · 19 |
| address gate and rules | 0 · - · - |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 0 · - · - |
| to speak() (gate → speak called) | 0 · - · - |
| TTS (speak called → voice start) | 0 · - · - |
