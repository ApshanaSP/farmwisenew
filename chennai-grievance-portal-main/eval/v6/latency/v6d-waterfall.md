# Latency waterfall: v6d

From `eval/v6/latency/v6d-*.json` (tests/e2e/real6.spec.ts). Each cell: **n · p50 · p90**, ms. Ends are from the clip's true last voiced sample; stage spans are between two stamps of the v5 trace in the same turn (server stages placed on the page clock at the request that sent them).

## closed (12 turns; lanes none 12; first sound pcm 12; woke 12/12)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 12 · 163 · 185 |
| first speech (a voice, not a tone) | 12 · 163 · 185 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 12 · 739 · 1149 |
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

## en (2 turns; lanes planner 2; first sound tone 2)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 2 · 401 · 401 |
| first speech (a voice, not a tone) | 2 · 1799 · 1799 |
| answer handed to the voice (console's finding mark) | 2 · 2402 · 2402 |
| first word of the answer (the voice's own start) | 2 · 3020 · 3020 |
| voice start delay (handed → first word) | 2 · 618 · 618 |
| answer in hand, on screen (the console's answer mark) | 2 · 2379 · 2379 |
| end of the answer (its last word spoken) | 2 · 38210 · 38210 |
| screen change | 2 · 2402 · 2402 |
| transcript at the page (transcribed mark) | 2 · 755 · 755 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 2 · 74 · 74 |
| end-of-turn wait (last voiced → end decided) | 2 · 331 · 331 |
| upload (end decided → upload sent) | 2 · 4 · 4 |
| server → speech-to-text sent | 2 · 13 · 13 |
| speech-to-text (sent → decode back) | 2 · 354 · 354 |
| transcript to the page (decode back → page has it) | 2 · 16 · 16 |
| address gate and rules | 2 · 12 · 12 |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 2 · 1154 · 1154 |
| to speak() (gate → speak called) | 2 · 1654 · 1654 |
| TTS (speak called → voice start) | 2 · 630 · 630 |

## ta (3 turns; lanes planner 3; first sound tone 3)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 3 · 423 · 428 |
| first speech (a voice, not a tone) | 3 · 1825 · 1852 |
| answer handed to the voice (console's finding mark) | 3 · 2791 · 2902 |
| first word of the answer (the voice's own start) | 3 · 3889 · 4073 |
| voice start delay (handed → first word) | 3 · 987 · 1282 |
| answer in hand, on screen (the console's answer mark) | 3 · 2756 · 2872 |
| end of the answer (its last word spoken) | 3 · 37906 · 39168 |
| screen change | 3 · 2791 · 2903 |
| transcript at the page (transcribed mark) | 3 · 852 · 857 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 3 · 76 · 91 |
| end-of-turn wait (last voiced → end decided) | 3 · 342 · 342 |
| upload (end decided → upload sent) | 3 · 3 · 4 |
| server → speech-to-text sent | 3 · 13 · 13 |
| speech-to-text (sent → decode back) | 3 · 401 · 403 |
| transcript to the page (decode back → page has it) | 3 · 16 · 17 |
| address gate and rules | 3 · 15 · 23 |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 3 · 1957 · 2007 |
| to speak() (gate → speak called) | 3 · 1971 · 2015 |
| TTS (speak called → voice start) | 3 · 1009 · 1304 |

## tg (2 turns; lanes planner 2; first sound tone 2)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 2 · 423 · 423 |
| first speech (a voice, not a tone) | 2 · 1828 · 1828 |
| answer handed to the voice (console's finding mark) | 2 · 5876 · 5876 |
| first word of the answer (the voice's own start) | 2 · 7006 · 7006 |
| voice start delay (handed → first word) | 2 · 1130 · 1130 |
| answer in hand, on screen (the console's answer mark) | 2 · 5847 · 5847 |
| end of the answer (its last word spoken) | 2 · 38531 · 38531 |
| screen change | 2 · 5877 · 5877 |
| transcript at the page (transcribed mark) | 2 · 830 · 830 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 2 · 76 · 76 |
| end-of-turn wait (last voiced → end decided) | 2 · 341 · 341 |
| upload (end decided → upload sent) | 2 · 4 · 4 |
| server → speech-to-text sent | 2 · 12 · 12 |
| speech-to-text (sent → decode back) | 2 · 401 · 401 |
| transcript to the page (decode back → page has it) | 2 · 16 · 16 |
| address gate and rules | 2 · 15 · 15 |
| gate → planner call sent | 1 · 51 · 51 |
| planner (call sent → back) | 1 · 2454 · 2454 |
| tools and first sentence (planner back → tools done) | 1 · 2491 · 2491 |
| first streamed event (gate → first event) | 2 · 166 · 166 |
| to speak() (gate → speak called) | 2 · 5013 · 5013 |
| TTS (speak called → voice start) | 2 · 1150 · 1150 |

## wake (7 turns; lanes none 7; first sound pcm 7)

| Moment, from the end of speech | n · p50 · p90 |
|---|---|
| first sound (any: earcon, voice) | 7 · 189 · 227 |
| first speech (a voice, not a tone) | 7 · 189 · 227 |
| answer handed to the voice (console's finding mark) | 0 · - · - |
| first word of the answer (the voice's own start) | 0 · - · - |
| voice start delay (handed → first word) | 0 · - · - |
| answer in hand, on screen (the console's answer mark) | 0 · - · - |
| end of the answer (its last word spoken) | 7 · 952 · 1256 |
| screen change | 0 · - · - |
| transcript at the page (transcribed mark) | 7 · 624 · 793 |

| Stage | n · p50 · p90 |
|---|---|
| detector lag (true end → detector's last voiced sample) | 7 · 63 · 94 |
| end-of-turn wait (last voiced → end decided) | 7 · 204 · 214 |
| upload (end decided → upload sent) | 7 · 5 · 6 |
| server → speech-to-text sent | 7 · 13 · 32 |
| speech-to-text (sent → decode back) | 7 · 305 · 469 |
| transcript to the page (decode back → page has it) | 7 · 14 · 23 |
| address gate and rules | 0 · - · - |
| gate → planner call sent | 0 · - · - |
| planner (call sent → back) | 0 · - · - |
| tools and first sentence (planner back → tools done) | 0 · - · - |
| first streamed event (gate → first event) | 0 · - · - |
| to speak() (gate → speak called) | 0 · - · - |
| TTS (speak called → voice start) | 0 · - · - |
