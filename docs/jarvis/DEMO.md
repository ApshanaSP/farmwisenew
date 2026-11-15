# Jarvis: a two-minute demo, and the five-minute room check

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
