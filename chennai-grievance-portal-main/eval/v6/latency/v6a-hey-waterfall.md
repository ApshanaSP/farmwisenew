# Latency waterfall: v6a-hey

From `eval/v6/latency/v6a-hey-*.json` (tests/e2e/real6.spec.ts). Each cell: **n · p50 · p90**, ms. Ends are from the clip's true last voiced sample; stage spans are between two stamps of the v5 trace in the same turn (server stages placed on the page clock at the request that sent them).

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
