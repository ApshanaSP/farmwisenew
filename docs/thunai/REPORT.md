# Thunai (துணை): build report, 29 Oct 2026

Branch `thunai/pilot`, 3 commits on top of `main` (9a20b92). **Nothing pushed or merged.**

## What it is, in one line
Switch Thunai on (**Alt+T** or the orb above "Ask District IQ"), hold **Alt+Space** (or click the orb) and talk in English,
Tamil or Tanglish. The console moves by itself and shows each step; anything that would reach a person waits for
"confirm" plus the count.

## What was built
| Part | Where |
|---|---|
| Understanding engine, rules first (normalise, vocabulary, slot parser with screen memory and self-repair, confidence, ask-once) | `src/lib/thunai/normalise.ts`, `lexicon.ts`, `understand.ts` |
| Risk levels A / B / C and the confirm-plus-count gate | `src/lib/thunai/risk.ts` |
| Spoken templates (English + Tamil) with a number guard | `src/lib/thunai/say.ts` |
| Nova Lite fallback: closed schema, plan checked against the real lists, cache, 2.5 s timeout | `src/lib/thunai/plan.ts`, `api/collector/thunai/plan` |
| Memory per Collector (notes, reminders, habits, learned aliases, preferences, recent commands) | `src/lib/thunai/store.ts`, `api/collector/thunai/memory` |
| Hash-chained audit trail (text only) | `src/lib/thunai/audit.ts`, `api/collector/thunai/audit` |
| Watch: importance score, bands, speaking budget | `src/lib/thunai/watch.ts` |
| The console side: orb, subtitles, ghost pointer, step chips, undo / Ctrl+Z, "wrong?" chip, one-question cards, one-tap cards, approval tray, show numbers / names / click, scroll, type, explain this chart, memory and trail panels, morning-brief and rain-readiness missions, earcons, phone layout, reduced motion | `src/components/collector/app/thunai/Thunai.tsx`, `dom.ts`, `thunai.css`, wired in `CollectorApp.tsx` |
| Dev-only stand-in console for checks (404 in production) | `src/app/dev/thunai` |

## Numbers (all measured)
- **Tests:** 1,391 passed, 13 skipped (all existing skips); 39 of them are Thunai's. Type check clean. No-AI golden run 14/14.
  The production build succeeds (with the larger heap).
- **Golden set (rules only):** 162/162 (70 English, 51 Tamil, 41 Tanglish). Written together with the rules, so it shows
  the design works, not how it does on new speech.
- **Unseen set:** 36 phrasings written after the rules were done. **66.7%** at first. Two generic bugs it exposed (Tamil
  compound words read as names, questions that mention a period) were fixed, giving 75%. That second number is no longer
  independent. The misses are mostly "not understood", which the console sends to Nova Lite.
- **Speed (rules):** p50 0.9 ms, p90 1.4 ms per command (486 runs).
- **Browser check** on the stand-in console:
  - one sentence set three filters as one step ("Adyar, weekly, critical only");
  - self-repair ("Ambattur illa, Anna Nagar kaatu" went to Zone 8 only);
  - undo, the top incident, a draft, "change filter to 7";
  - Tamil zone names, worst zone answered in Tamil, "what am I looking at", "explain this chart";
  - show numbers (21 badges) and "click 2";
  - the refusal of "delete all incidents";
  - an honest "could not save" when memory was unreachable;
  - "not understood" with examples;
  - no sideways scroll for Thunai at 375 px.

## Update, 29 Oct (later): the AI understands every sentence
The owner asked for real natural-language understanding, not rules. Now:
- **Every sentence goes to the AI brain** (`src/lib/thunai/plan.ts`, `brain.ts`). It sees the screen, the last 4 turns and
  the Collector's notes and habits, so follow-ups work: "same for Adyar", "now monthly", "and only the critical ones",
  "schools near the flooding there". It can plan several steps, ask a clarifying question with buttons ("water problems"),
  chat ("good morning"), and refuse (delete, book tickets, "ignore your rules and send").
- **Only instant controls skip the AI:** stop, off, go back/undo, "confirm 3", "click 4" while numbers show, repeat. Sending is
  never an AI action: only the Collector's own "confirm N" sends.
- **Code still checks everything:** a step naming an unreal zone/department/category is dropped; a reply with a figure the
  Collector did not say is dropped; the console speaks readings itself; reminders must be in the future.
- **The rules are now the backup:** when the AI cannot be reached (keys, rate limits), the dock says "AI unreachable:
  built-in rules answered" and the rules still work.
- **Model:** Groq `gpt-oss-120b` first (then the other Groq models) because the AWS key has expired. When a fresh AWS key
  is pasted, set `THUNAI_PROVIDER=bedrock` to use Nova Lite instead.
- **UI:** a "thinking" animation, an "Understood by AI · model · time" line, clarify buttons, natural examples in Help.

### Measured (live, Groq, 43 natural sentences in English, Tamil and Tanglish: `src/lib/thunai/brain.live.ts`)
- First run: **37/43 (86%)**, p50 1.0 s. After fixes to the checker and prompt: **40/43 (93%)**, p50 1.1 s, p90 1.5 s.
- The 3 misses ("go back", "what am I looking at", "news about this") then got prompt examples, so a rerun would no longer
  be an independent score. "go back" never reaches the AI in the console (instant control).
- Browser check on `/dev/thunai` (real Groq calls): multi-filter sentences, follow-ups, Tamil and Tanglish replies,
  clarify buttons, chat, refusal, "open the top one and draft", taluk map + rain gauges, self-correction, the rules
  fallback when Groq was rate-limited, phone width without sideways scroll.

### Watch out
- **Groq free-tier limits:** each call is about 4,000 tokens and each Groq model allows 8,000 tokens a minute per key.
  In bursts the gateway moves to the smaller Groq models (gpt-oss-20b, qwen), which are less careful; in the live run only
  22 of 57 calls were answered by gpt-oss-120b. More Groq keys (GROQ_API_KEY_3..5) or Bedrock fix this.
- Nova Lite was not measured live with the new brain (the AWS key had expired).

## Not verified (be careful in the demo)
1. **The real console was not clicked through**: it needs a Collector sign-in, which was not used. The wiring is
   type-checked and built. The first thing to do: sign in on port 3007 and run the demo below.
2. **Microphone and speaking** were not exercised (no microphone in the check). The recogniser is the browser's own
   (Chrome may use a cloud service for it).
3. **Nova Lite** was not called live (the stand-in console has no session). Its checker is unit-tested.
4. **The two missions and Watch** need real data; only Watch's scoring and budget are unit-tested.
5. **The approval tray** sends through the existing Take action endpoint only when the draft reports `sandbox`
   delivery; this was not run end to end.
6. **Tamil** lines need a native speaker's review.
7. The extra GitHub search for 3–5 more voice-control projects was not done (see REFERENCES.md).

## Cut, as the prompt said (later)
- Meeting, Presenter, Drive and Tour modes.
- Operating other websites (the "right hand"), and the wake word.
- On-device or server speech models.
- Split-screen maps.
- Anything that needs data the console lacks (pumps, field photos, WhatsApp).

## The 2-minute demo (sign in first; numbers are whatever the data shows)
1. **Alt+T.** Hold **Alt+Space**: "Show the worst flooding." The category is set, the top incident opens.
2. "Change filter to 7." → *Zone 7 · Ambattur*.
3. "Adyar, weekly, critical only." Then "Ambattur… illa, Anna Nagar kaatu."
4. "செம்பரம்பாக்கம் நீர்மட்டம் என்ன?" → the reservoir card is outlined; one Tamil line with the level and its time.
5. "Schools within 1 km of flooding here." → Ask the Map answers.
6. "Explain this chart." "Show numbers." "Click 4."
7. "Remember that Zone 13 is my priority this monsoon." → "Yes". Then "What do you remember?"
8. "Prepare for heavy rain." → steps run; drafts land in the tray.
   - "Confirm" alone is refused.
   - "Confirm 3" sends through the sandbox.
9. "Go back three steps." Then "Show the trail." Then "Thunai off."
