# Jarvis: the three-minute reel (v6), then the real-room check (v5)

## v6: the three-minute reel (do the v5 room check below first)

Edge on the demo laptop, speakers on, Jarvis open (Ctrl+Shift+J). The headless recording of the same steps, made on the v6 production bundle with synthetic voices and real providers, is `docs/jarvis/screens/v6/reel.webm`; its stills sit beside it (`after-<n>-<moment>.png`, and `before-*` from the v5 bundle for comparison). Nothing is recorded in the room.

| # | Time | Say or do | What the owner should see and hear |
|---|---|---|---|
| 1 | 0:00 | "Hey Jarvis." | A short spoken reply ("Yes?", one of five; Tamil when the console listens in Tamil) about 0.2 s after you stop, from the on-device wake word; the HUD ribbon says "Yes?" in the same frame. "Hi Jarvis" and "Hello Jarvis" still wake through the speech service (about 1 s, the old tone): the on-device model knows "Hey Jarvis" only. |
| 2 | 0:10 | "Show the severe cases." | The screen changes in about a second (no model: the rules lane; the speech-to-text round trip is most of it). |
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
