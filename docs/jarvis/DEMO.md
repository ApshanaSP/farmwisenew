# Jarvis: the v7 answers (first), the three-minute reel (v6), then the real-room check (v5)

## v7: the answers, as a top aide would give them (do the v5 room check below first)

Edge on the demo laptop, speakers on, Jarvis open (Ctrl+Shift+J). The screens are v6's; what changes is what Jarvis **says**: two to four sentences a model wrote from the screen's facts, each sentence checked by code against those facts before it is spoken; nothing the screen already lists is read out ("read them" still reads the items). With a working Claude key and Claude on, Haiku 5.5 writes the answers; otherwise Groq does (the answers, the finals and most timings were measured with Haiku writing, some timings with Groq: see `chennai-grievance-portal-main/eval/RESULTS.md`, v7). `JARVIS_ANSWER=v6` in `chennai-grievance-portal-main/.env` brings v6's answers back.

| # | Say | What the owner should see and hear |
|---|---|---|
| 1 | "Hey Jarvis, tell me about the Adyar issue." | The case that matters most in Adyar, explained on the screen; spoken: what it is and where, since when, how serious and why, who has it and what is stuck, and one suggestion. No field names, no lists. |
| 2 | "Show me the latest news", then "Hey Jarvis, tell me about this news." | The news list, then "Reading The Hindu's report..." and two to four sentences from the article itself, attributed ("The Hindu reports that ..."); the other outlets that covered it named in one line, their links on the screen. Not a single headline read out. |
| 3 | "Hey Jarvis, compare everything." | Every zone side by side (the zone table and map). Spoken: the zone that needs the most attention and by how much, one or two measures, not the table. |
| 4 | "Hey Jarvis, why is Adyar worse than Anna Nagar?" | The two zones side by side. Spoken: where the gap is and what goes with it, and plainly that the record shows what moved, not why, when no fact gives a cause. |
| 5 | "Hey Jarvis, CM Vijay is visiting Adyar, what should I know?" | Adyar's situation on the screen and in two or three sentences; for the visit itself, the dashboard's news and then the outlets' own feeds are searched: a report found is named with its outlet and time (its link added to the screen); nothing found is said plainly: "Nothing in the dashboard or today's news mentions CM Vijay visiting." Never a guess. |
| 6 | "Hey Jarvis, அடையாறு பிரச்சினை என்ன?" | As step 1, in spoken Tamil (model-written; not checked by a Tamil speaker). |
| 7 | "And in Royapuram?" (within 20 s) | The same question for Royapuram, answered the same way. |
| 8 | After step 1, "Who has it?" | The case's own screen; spoken: who holds it and whether an officer is named, from the record (a role, never a person from the directory). |

If a model is busy or slow, the answer is the screen's own line (v6's words, still grounded) with no item read out; the screen is never held back for the words.

What to expect in time (measured, `eval/RESULTS.md` v7): the screen comes as fast as in v6, then the first spoken sentence. Against v6's answers on the same server, the first word comes about 1 s later per question with Claude Haiku writing (p50 3.7 s from the end of the question, against 1.7 s), and about 0.3 s later with Groq writing (`JARVIS_AIDE_LEAD=groq`). `JARVIS_ANSWER=v6` restores v6's answers.

## v6: the three-minute reel (do the v5 room check below first)

Edge on the demo laptop, speakers on, Jarvis open (Ctrl+Shift+J). The headless recording of the same steps, made on the v6 production bundle with synthetic voices and real providers, is `docs/jarvis/screens/v6/reel.webm`; its stills sit beside it (`after-<n>-<moment>.png`, and `before-*` from the v5 bundle for comparison). Nothing is recorded in the room.

| # | Time | Say or do | What the owner should see and hear |
|---|---|---|---|
| 1 | 0:00 | "Hey Jarvis." | A short spoken reply ("Yes?", one of five; Tamil when the console listens in Tamil) about 0.2 s after you stop, from the on-device wake word; the HUD ribbon says "Yes?" in the same frame. "Hi Jarvis" and "Hello Jarvis" still wake through the speech service (about 1 s, the old tone): the on-device model knows "Hey Jarvis" only. |
| 2 | 0:10 | "Go to trends." | The page changes in about 0.7 s (the browser's rules, no model; most of it is the end-of-turn wait and the speech-to-text round trip). "Show the severe cases" builds a screen on the server instead (no model either), in about 1.3-1.4 s. |
| 3 | 0:25 | "Hey Jarvis, what's happening in Royapuram?" | The situation screen at once (code, no planner), then the briefing as an aide says it: what and since when, why it is serious (complaints, the outlet that reported it, the deadline), who has it and what is stuck (a role, never a name), what to do, then "Want the details?". |
| 4 | 1:00 | Open the news ("show me the latest news": the console's news panel), then "Hey Jarvis, read the first article." | At once: "Reading The Hindu's report..." (the outlet named). Then a two-to-four sentence brief with the outlet and the time for each fact; if another outlet covered it, what agrees and differs. The Stage shows what was said and every source as a link ("From the web" in its notes). Then "What did the Met department say about tonight's rain?": "Looking that up on the web..." and the Met department's latest alert from NDMA SACHET, or that there is none, with the link. |
| 5 | 2:00 | "Hey Jarvis, தேனாம்பேட்டை எப்படி இருக்கு?" | The same situation screen and briefing in Tamil (the Tamil lines are model-drafted, not checked by a Tamil speaker). |
| 6 | 2:30 | While Jarvis is speaking, say "Wait." | The voice ducks at once and stops; Jarvis listens. "mm" or "okay" over it does not stop it. |

If the news step says it could not read the web: the outlets' feeds or the network are down, or the outlet is not on `chennai-grievance-portal-main/config/jarvis-web-domains.json` (the owner's allow/deny list).


## v5: the five-minute real-room check (do this first)

Edge, the real laptop, speakers on, no headset. **Nothing is recorded.** Note pass or fail and the counts; read the timings and the applied echo value in the measurement view: open Jarvis's log (`JarvisLogView`, its folded "Measurements" section), or run a build with `NEXT_PUBLIC_JARVIS_SPEC=1`. The bottom bar itself is unchanged (rule 6). A flag below is set in `chennai-grievance-portal-main/.env` (a `NEXT_PUBLIC_` one needs a rebuild or a dev-server restart); a `TUNING` key is in `src/lib/thunai/vad.ts`.

| # | Do | Should happen | If it does not |
|---|---|---|---|
| 1 | From off, say "Hi Jarvis" three times, then bare "Jarvis" three times. | Wakes each time (the browser wake, unchanged). Note hits out of three for each. If the on-device wake shipped, repeat both with `NEXT_PUBLIC_JARVIS_WAKE=device` and note hits out of three (that model was trained on "hey jarvis"). | Keep the browser wake (the default). |
| 2 | Say one named Tamil command with a Chennai place name, one Tanglish, one English ("Jarvis, ..."). | The right screen each time. Read "end of speech → first spoken finding" in the measurement view's trace (zero is your last voiced sample). | Note which language failed and the sentence's shape (not the sentence) for the owner. |
| 3 | Within 20 s of the answer, a follow-up without the name. | Acts. | The window is `ENGAGED_MS` (20 s) in `src/lib/thunai/addressed.ts`; do not change it without the owner. |
| 4 | After 30 s of silence, a command without the name. | **Refused** (a faint line; this is the price of C1). Say it again with "Jarvis": acts. | To bring back v4's behaviour: `JARVIS_GATE_COMMAND_TIER=1` and `NEXT_PUBLIC_JARVIS_GATE_COMMAND_TIER=1` (owner's decision). |
| 5 | Two people talk about lunch and a meeting for one minute, once with Jarvis idle and once just after an answer. | No act. Count any. | Idle acts: report. Acts just after an answer are the engaged window's (C2 measured 30-50 % of look-alike lines there); report the count for the owner. |
| 6 | Let Jarvis give five long answers with nobody speaking, at normal speaker volume, with echo `true` (default), then with `NEXT_PUBLIC_JARVIS_ECHO=all`; once with the Edge online natural voice and once with a local (non-natural) Windows voice. | Jarvis does not duck or stop itself. Count self-ducks for each of the four cases; the measurement view shows the applied echo value. | Chromium's source says `true` can miss local SAPI voices and `"all"` adds 170 ms of microphone delay. If it stops itself: raise `echoMarginDb` (8 → 12). |
| 7 | Say "mm", "sari", "okay" over an answer; then a real interruption ("no, show Royapuram"). | The voice carries on for the first three; stops for the interruption. | Stops on a backchannel: raise `bargeWords` (2 → 3). Talks over you: lower `bargeHoldMs` (600 → 450). |
| 8 | Say "stop" with no name while Jarvis is silent and while it speaks. | Stops (the bare stop word still acts at level A). | Report. |
| 9 | Ask, in Tamil, a question whose answer has a number. | The number is spoken as Tamil words (F1: no digit reaches a voice) and matches the screen. | The Tamil number words are model-drafted, not checked by a Tamil speaker: note any that sound wrong. |
| 10 | Leave the room idle for the rest of the five minutes. | No wake, no act. Count any. | Report. |

The v4 check below is kept as it was; the v5 one above replaces it for the room check.

**The demo script** is v4's, below: a loose Tamil follow-up chain, "what changed" with drivers, "explain this one", "how do you know?", side talk ignored, the never-send refusal, "go to sleep". One v5 difference: **with Jarvis idle, a command needs "Jarvis" first** (C1); its follow-ups within 20 s do not.

## v4 (kept as it was)

Open the console in **Microsoft Edge** (`start-fast.bat` does), because Edge has the natural Tamil and Indian English voices. Do not demo within 24 hours of a heavy evaluation run: Groq's daily caps reset 24 hours after use. With a valid `ANTHROPIC_API_KEY` in `.env`, Claude answers first; without one, Groq does, and the demo still runs.

## Before you start: five minutes, on the demo laptop, with a real microphone and the speakers on

Nothing in v4 has been tried with a real microphone in a real room. Do this once on the demo machine. If a step goes wrong, change only the `TUNING` value it names, in `chennai-grievance-portal-main/src/lib/thunai/vad.ts`, and restart the console.

| # | Say or do | What should happen | If it does not |
|---|---|---|---|
| 1 | Press `Ctrl+Shift+J`. Read the first-use notice and accept it. | The light bar comes up with the red mic-hot dot and "Listening". The brief may start. Let it finish: it ends with "That's everything for now." | If the brief never comes, check that `/api/collector/thunai/brief` answers (signed in as the Collector). |
| 2 | Say nothing for 20 seconds. | The core breathes slowly; nothing is said; the strip's room-speech count stays at 0. | The room is noisy: raise `echoMarginDb` (8 → 12). |
| 3 | "Jarvis, show the severe cases in Adyar." | A short tone at the end of your sentence, the screen within about a second, then the answer spoken. **Its own voice must not stop it.** | It stops itself on the speakers: raise `echoMarginDb` (8 → 12), then `bargeHoldMs` (600 → 800). |
| 4 | While it speaks, say "mm-hmm", then "okay". | The voice dips and carries on. | It stops on a backchannel: raise `bargeWords` (2 → 3). |
| 5 | While it speaks, say "no, show Royapuram instead". | It stops within about half a second and does the new request. | It talks over you: lower `bargeHoldMs` (600 → 450). |
| 6 | "Show complaints in Adyar … (pause one second) … for last week." | One request, the whole sentence. | It acts on the first half: raise `eouOpenMs` (650 → 900), or `eouCompleteMs` (300 → 450) if it cuts after complete-sounding halves. |
| 7 | Have a colleague chat near the laptop for a minute, including a sentence that names a place. | Faint lines may appear and fade. Nothing at Level B or C ever happens. A plain screen may change on a look-alike sentence (a known limit). | Say "Jarvis, go to sleep", and keep to named requests for the demo. |
| 8 | "Jarvis, go to sleep." | The mic dot goes and the mic tracks stop. | — |

## The script (about two minutes)

1. **The brief on power-on.** Press `Ctrl+Shift+J`. Jarvis gives the bottom line, then three to five items, each with its source on the card. It ends: "That's everything for now." Point at the source chips: every figure comes from code.
2. **A loose Tamil follow-up chain.**
   - "அடையாறு நிலவரம் சொல்லு." The situation screen comes up and is spoken in Tamil.
   - "அந்த ரெண்டாவது?" The second item opens.
   - "போன வாரம் மாதிரியே?" The same view, for last week.
3. **What changed.** "What changed since yesterday?" A change screen shows where the change sits (zone, kind, department), each with its share, and the band it is outside. Jarvis says "linked with", never "caused by".
4. **Explain this one.** "Explain the second one." Jarvis gives two to four sentences: what and where, how long it has been stuck, why it matters, and what it would do.
5. **A narrated mission with a redirect.**
   - "Build me a water-crisis board for Velachery." A plan card with three to six steps appears; say "start".
   - Each step is said with its real time.
   - Midway, say "instead show me Adyar's drains". The remaining steps change and the finished ones stay. Any draft lands in the tray, and nothing is sent.
6. **An interjection.** If a high-severity signal is waiting (the badge shows it), stay quiet for a moment. Jarvis chimes, says one line, and offers Tell me / Later. Tap Later.
7. **How do you know?** "How do you know?" Jarvis reads the method, the number of records, the period, the sources and the caveat.
8. **The never-send refusal.** "Jarvis, send the drafts." It refuses in code: the tray's button is the Collector's own tap. Then "Who complained about the drain in Adyar?" It refuses, with no model involved.
9. **Go to sleep.** "Jarvis, go to sleep." The mic dot goes.

## If something fails mid-demo

- **No model answers** (quota or network): Jarvis says it can't reason right now and still answers what the rules can. Carry on with the rule-lane screens (cases, a zone, a map, the brief).
- **The voice is silent:** the words are on the bar and the screen. Edge has the voices; Chrome has no Tamil voice.
- **It misheard twice:** it offers the screen and the keyboard. Type the request.
