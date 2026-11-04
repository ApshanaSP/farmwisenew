# Jarvis mode: a two-minute demo, and what to check first

Open the console in **Microsoft Edge**, because Edge has the natural Tamil and Indian English voices. `start-fast.bat` already opens Edge. Wired headphones avoid most echo. Do not demo within 24 hours of a heavy evaluation run: Groq's daily caps reset 24 hours after use.

## Before you start (5 minutes, on the demo machine, with a real microphone)

Nothing below has been tried with a real microphone in a real room. All measured figures come from injected audio.

1. Turn on Jarvis mode (top bar, or `Ctrl+Shift+J`). The first time, read the notice and press **Understood, open it**. The browser asks for the microphone once.
2. Say nothing for 10 seconds. The core should stay in **Listening**, and the strip's room-speech count should stay at 0.
3. Say "Jarvis, show the severe cases". Check that it answers, and that **its own voice does not stop it**. If it stops itself, raise `echoMarginDb` in `src/lib/thunai/vad.ts` (`TUNING`) from 8 to 12.
4. Talk over it. It should pause at once. Cough while it speaks: it should go on from where it stopped.
5. Say "Jarvis" and pause for two seconds, then say "show Adyar". If sentences keep getting cut at your pauses, raise `endOfUtteranceMs` in `TUNING` from 300 to 500. The brief set 300; thunai/v3's own measurements recommended more.
6. Have a colleague chat near the laptop for a minute. Faint lines may appear and fade. Nothing should change on screen.

## The script

1. **The event.** Press `Ctrl+Shift+J`. The screen dims to near-black, the core ignites, the rails slide in. There is no mic button.
2. **No name, no click.** "Show the severe cases in Adyar." The screen builds. The timeline shows the real steps and their times.
3. **Follow-ups.** "And in Anna Nagar?" Then "why?" Then "the second one" on a list.
4. **Compare, spoken.** "Compare Adyar and Ambattur this week." Listen for the difference, then point out the numbers on screen: every spoken figure comes from code.
5. **Tamil.** "அடையாறு நிலவரம் சொல்லு." It answers in Tamil.
6. **Interrupt.** While it speaks, say "wait". It goes silent and nothing on screen changes. Then "continue". Then, while it speaks, "no, Royapuram".
7. **What stands out.** "What stands out this week?" Each finding shows its method, its n and a caveat.
8. **Complete this data.** "Fill in the missing data." Filled cells show their source, blanks stay blank and say why, and a follow-up draft is offered for the tray.
9. **Side talk.** Turn to a colleague: "did you see the rain in Velachery yesterday?" Nothing happens.
10. **The limits.** "Jarvis, send the drafts." It refuses: the tray's button is the Collector's own tap. "Who complained about the drain in Adyar?" It refuses, in code, with no model involved.
11. **Saving.** "Jarvis, save this workspace as Collector's Daily Briefing." It asks; say "yes".
12. **Off.** "Jarvis, go to sleep." The microphone's tracks stop and the red dot goes.

## If something fails on the day

- **No model answers:** Jarvis says it cannot reason right now. Plain requests keep working from the rules: "show the severe cases", "go to the trends page".
- **Listening budget low:** an amber note says "say Jarvis first". For a minute only the browser's free recognition listens, for the name.
- **No voice, or Chrome with Tamil:** the words stay on screen. Open in Edge.
- **Typing instead:** the keyboard icon at the right of the strip opens a box. Typed text takes the same path.
- **Mode off:** the panel at the right takes typed questions, and the microphone stays closed.
