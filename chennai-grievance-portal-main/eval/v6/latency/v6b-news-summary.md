# The news turn, spoken: v6b

From `eval/v6/latency/v6b-news.json` (tests/e2e/real6.spec.ts, V6_PARTS=news: real providers, Edge's natural voices, synthetic clips, live outlets). The news list is put on Jarvis's screen as a tap on an offered step builds it; then "Hey Jarvis" and the clip. Each cell: **n · p50 · p90**, ms from the clip's true end of speech.

| Moment | Reads ("Read the Nth article.", EN and TA) | Web look-ups (Met department, rain, red alert) |
|---|---|---|
| taken by the news lane (marks present) / asked | 11 / 11 | 5 / 6 |
| first sound (the end-of-speech earcon) | 11 · 414 · 437 | 6 · 403 · 424 |
| the server's first line in hand ("Reading The Hindu's report...") | 11 · 826 · 967 | 5 · 865 · 1460 |
| the first line's voice starts | 11 · 1066 · 1463 | 6 · 1484 · 1838 |
| the brief in hand (article read and answered) | 11 · 854 · 1304 | 5 · 1442 · 1858 |
| the brief's first sentence starts in the voice | 11 · 4669 · 5129 | 6 · 4097 · 4473 |
| related coverage in hand | 11 · 854 · 1304 | 0 · - · - |
| the coverage brief in hand | 0 · - · - | 0 · - · - |
| the turn done (every event in) | 11 · 854 · 1304 | 5 · 1443 · 1858 |
| transcript at the page | 11 · 796 · 894 | 6 · 1287 · 1444 |

Heard: news_read1 "Read the first article."; news_read2 "Read the second article."; news_read3 "Read the third article."; news_read4 "Read the fourth article."; news_read5 "Read the fifth article."; news_read6 "Read the sixth article."; news_read7 "Read the seventh article."; news_read8 "Read the eighth article."; news_read9 "Read the ninth article."; news_read10 "Read the tenth article."; news_look_met "What did the Met Department say about two nights rain?"; news_look_met2 "What did the Met Department say about tonight's rain?"; news_look_rain "Will it rain in Chennai tonight?"; news_look_rain2 "Will it rain in Jainidenight?"; news_look_alert "Is there a red alert for Chennai today?"; news_look_alert2 "சின்னையில் ராயப்புரம் இருக்கிறதா?"; news_ta_read1 "முதல் சேதியைப் படிந்தை.".
