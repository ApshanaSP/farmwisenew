# Jarvis v10: top class (the owner's "version 9")

This is the brief for the next Jarvis build, written on 19 Nov 2026 from the owner's own request that day. The owner calls this build "version 9". In the repo it is v10, because the news-matching build pushed with this file already took the v9 name in `chennai-grievance-portal-main/eval/RESULTS.md`. Where this brief is silent, the v8 and v7 briefs' rules hold (`docs/jarvis/JARVIS_V8.md`, `docs/jarvis/JARVIS_V7.md`).

## Part 1: where Jarvis stands

Jarvis is the voice assistant inside the District Collector of Chennai's console (`chennai-grievance-portal-main/`, Next 15 / React 19; English, Tamil, Tanglish; "Hey Jarvis"). v8 resolved requests in code in front of the model (`src/lib/thunai/v8/`). v9 fixed v8's news-matching misses:
- acronyms spoken letter by letter;
- split and by-ear place names;
- misheard outlets;
- colloquial Tamil;
- ordinals past the fifth;
- "open the X protest" without the word news.

Both are on `main` (pushed 19 Nov 2026). The numbers are in RESULTS, sections v8 and v9.

The owner tried v9 in Edge on 19 Nov and said **"not good"**. They want one build that is far better: "Iron Man Jarvis", "top class", "there should be no error".

## Part 2: the owner's asks (19 Nov 2026, condensed from their own words)

1. **Names said by ear must be understood.** "Cyclone aquan": "I'm not pronouncing it correctly. It should understand it." The store spells that storm *Akvan* and *Akwan* (The Hindu, DT Next), and also carries *Cyclone Murasu* and the nickname *Asuran*. Pronunciation in general: places, people, outlets, events, departments.
2. **"Open the first news" must open the first news on the screen.** "It should see what is on the screen."
3. **Reading must be intelligent.** "When I ask to read, it's simply like reading, not make it more powerful and understand."
4. **Iron Man Jarvis**: human-like intelligence, the best assistant there is, no errors.
5. **Use Sarvam AI**: "what all API we can use".
6. **Ask the Map, all of it, through Jarvis**: "every features in the map Jarvis can access".
7. **The whole dashboard by voice**: "With voice itself, I can control the whole dashboard."
8. **Side talk**: "if I'm speaking someone outside, it should not respond".
9. **The voice stays as it is.** The owner first asked for a change, then took it back: "voice don't need to change".
10. **Python and high-end libraries are allowed.** Research open source.
11. **Two or three creative new features.** "Think creative, out of the box."
12. **Run as long as it takes** ("even one day"), top-class code, and tell the owner what improved.

## Part 3: what the owner's sessions show (read from the local audit log, never committed)

The log is `E:/farm/.claude/worktrees/dazzling-torvalds-52b811/chennai-grievance-portal-main/data/thunai/audit.jsonl`. It is local, and your worktree will not have it: copy it in, or read it by that path. The owner's Edge sessions are on 18 Nov 20:05–21:21 IST and 19 Nov 14:06–14:16 IST. What they show:

- **"Tell me about Cyclone Aquan."** (19 Nov 14:07, and 18 Nov 20:06) was answered by the **instant** lane. The news was never searched. The weather words catch "cyclone" first (`src/lib/thunai/newsask.ts:98`, the FORECAST pattern; also `quick.ts`). On an older day, "Explain me about Murasar Saikilon" (Cyclone Murasu) was **refused**.
- **"Tell me about the fast news."** (19 Nov 14:08) is Whisper's "first news", answered by the instant lane. Indian English "first" is heard as "fast". The fix must also cover "secand", "thurd" and the like, and only when a list is on screen.
- **Tamil comes through garbled.** Examples: "ராஜவுகாந்தி நகரில் என்ன கம்ப்பியன்டு?" (Rajiv Gandhi Nagar, what complaint?); "தக்காலி பிரைச்சென்னை நிகியும்." (tomato price in Chennai); "ETHUK ENDOFICER RESPONSIBLE?" (Tanglish: which officer is responsible?). Whisper is the weak link here, and Sarvam fixes most of it (Part 5).
- **Cut-off lines get answered as if they were requests**: "Tell me about the", "What are the". So do one-word ones: "தயவுசெய்து,", "வாயமுர்ரா." Jarvis should wait for the rest, or ask, not answer.
- **Another assistant's name** ("Alexa, when was it open?") was answered. That is speech meant for someone else.

## Part 4: the improvement plan (research first, then build; each defect gets a failing test first)

### 4.1 Hearing
- **Sarvam on.** The bench (19 Nov, 40 synthetic clips, `chennai-grievance-portal-main/data/thunai/sarvam-bench.json`, local) measured word error rate, Whisper against Sarvam `saaras:v4` codemix:

  | Language | Whisper | Sarvam |
  |---|---|---|
  | Tamil | 0.452 | 0.258 |
  | Tanglish | 0.612 | 0.138 |
  | English | 0.077 | 0.042 |

  Sarvam got the language right more often (0.975 against 0.90) and answered faster: 281 ms p50 / 403 ms p90, against 439 ms / 683 ms for the Whisper race. The setting `JARVIS_STT_SARVAM` exists (`docs/jarvis/SARVAM.md`):
  - start at `shadow` for the owner's first real session, comparing on the owner's real voice;
  - then `tamil`;
  - then `primary` if English holds.

  The key is in `.env`, which you never open. The owner adds the line, or the launch script sets the variable.
- **Keyterms from the day.** `sarvam.ts` sends a fixed list of zone names. Build the list each day instead, within Sarvam's limits:
  - today's named entities from the store's news (cyclones, people, places, outlets);
  - what is on screen.

  Then "Akvan" is spelt right before matching even starts.
- **Streaming and confidence.** Research Sarvam's streaming speech to text. Use whatever confidence it gives to ask instead of guess.

### 4.2 Names said by ear: one entity layer for every lane
- An **entity lexicon** built from the store and refreshed with it: cyclones, places, people in the news, outlets, departments, officers' titles. Each entry has its spellings in English, Tamil and Tanglish.
- **Phonetic keys beside `looseKey`**: Double Metaphone or similar for Latin script ("Aquan" and "Akwan" both give AKN), a Tamil phonetic key, and transliteration both ways. For transliteration, research Sarvam's transliterate API against open libraries such as `indic-transliteration` and `aksharamukha`.
- **Cross-lingual meaning.** The repo already embeds incidents with `multilingual-e5-base` (`src/lib/assistant/embed.ts`, LanceDB in `lance.ts`). Use the same model as a second ranker for news, so a Tamil request finds an English headline by meaning, under v8 and v9's lexical guards (the floor, the margin, the place veto).
- **"Did you mean ...?"** When a name match falls between the floor and certainty, ask in three or four words ("Cyclone Akvan?"). Do not refuse, and do not open the wrong thing. This is how "no error" is reached in practice.

### 4.3 Seeing the screen
- **One screen model**, the single source of truth for references: what is visible, in which order, which list is "the list", what is in focus. Every reference resolves against it: "first", "the last one", "that one", "the Adyar one", and by-ear forms like "fast". Today the news panel, the Stage and the case list each have their own rules: `refs8.ts`, `browser.ts` (`onNewsPanel`, `caseInFocus`) and the v7 lanes.
- **Compound ordinals.** v9's blind set showed "irubathi rendavadhu" (22nd) read as the 2nd, and "irubathi naalavadhu" (24th) as the 4th (`ord8.ts`). Read the tens, or refuse; never read only the last part.

### 4.4 Routing
- A **named event** ("Cyclone Akvan", "the Kodungaiyur protest") goes to the news. For a weather event it also goes to the weather readings: the rain gauges, the IMD forecast, the relief centres.
- The instant lane never answers a question that names an entity it does not know.

### 4.5 Intelligent reading (the news aide)
"Read" means a brief, not a recital:
- what happened, where, and when, in the asked language;
- why it matters to Chennai's district;
- what the console's own data says about it: open cases near that place, the responsible department, the rain gauges for a storm;
- one or two offered next steps: follow it, show it on the map, draft a note to the officer.

v7's aide pattern applies: the facts come from code, one streamed model call writes the brief, and a code check runs on every sentence before it is spoken. "Read it fully" still reads the whole story. A Tamil story asked about in English is read in English, and the other way round.

### 4.6 Ask the Map, all of it (`src/components/collector/app/askmap/`, `src/lib/map/`, `src/app/api/map/*`)
Jarvis reaches it today only for place-and-distance questions (`src/lib/thunai/data.ts`, `askMap`). Every feature should work by voice:
- the question;
- follow-ups that edit the plan, and the chips;
- a drawn circle by voice ("within two kilometres of Kasimedu");
- layers and the camera's shots ("replay", "next shot");
- export as CSV or GeoJSON;
- save the view;
- the visit order with its Google Maps link;
- the AI analyst's insight;
- Send to department: drafts, and sent only on the Collector's own yes, as today;
- the suggested questions;
- Rain & flooding.

### 4.7 The whole dashboard by voice
`src/lib/thunai/reach.ts` is the inventory: 20 rows, each with a level, the way Jarvis does it and an example sentence.
1. Walk the console and list every control, map and Ask the Map included.
2. Give each a voice path in English, Tamil and Tanglish.
3. Add a test that fails when a control has no voice path.

"Show numbers" stays as the fallback for anything else. Jarvis still never sends, approves or deletes on its own.

### 4.8 Side talk
Strengthen the addressee decision with these signals:
- the wake word;
- a short follow-up window after Jarvis speaks;
- speech addressed to a person: a name, "sir", "madam", Tamil vocatives such as "சார்", "ஏங்க", "தம்பி";
- another assistant's name;
- third-person talk about the screen;
- cut-off or one-word lines.

Measure false wakes and missed requests on a set that includes the owner's real turns. If it helps, add speaker verification as a local Python sidecar, so that other people's voices are ignored. SpeechBrain ECAPA (Apache-2.0) is one candidate; research others. It needs the owner's explicit yes and an enrolment by the owner. Store only a voice embedding, locally, and never the audio.

### 4.9 Two or three new features (proposals; research, then pick and build the best)
1. **News to ground truth.** When a story describes a civic problem in Chennai (sewage flowing at a bus stand, a protest over water), Jarvis says what the console knows about it. For example: "There are four open sewage complaints within 500 m, the oldest 12 days, all with the zone's AE." It shows them on the map and offers a draft to the officer, which goes to the tray. News becomes action.
2. **The narrated district tour.** "Jarvis, take me round the district." The map's camera flies stop by stop: today's hotspots, a storm's relief centres, the places in the news. Jarvis speaks one line per stop. "Next", "stop" and "go deeper here" steer it. Ask the Map already has camera cues (`useMapAsk.ts`, `lib/map/camera.ts`).
3. **Field visit by voice.** "Plan my visit to the worst flooded spots tomorrow morning." Ask the Map's visit order (`askmap/actions.ts`, `visitOrder`) builds a route card with a Google Maps link. Sending it anywhere needs the Collector's yes and an existing channel. No new accounts.

### 4.10 Python
A local sidecar is allowed (for example FastAPI with uvicorn, on Windows) for:
- phonetics;
- transliteration;
- embeddings, if better than the existing transformers.js ones;
- speaker verification.

The rules for it:
- Libraries pinned, with permissive licences only.
- Jarvis keeps working when the sidecar is down.
- The launch scripts start it.
- Nothing personal leaves the machine.

## Part 5: services and money
- **Claude.** The ceiling is US$10 in all (`JARVIS_CLAUDE_BUDGET_USD=10`), counted in `data/thunai/claude-budget.sqlite`. About US$1.05 was used by 19 Nov 14:15 IST; read `node scripts/jarvis7/claude-spend.mjs` before and after. Haiku leads and Sonnet is the deep model, as shipped. The live flags for runners: `JARVIS_LIVE_CLAUDE=1 JARVIS_CLAUDE_BUDGET_USD=10 JARVIS_CLAUDE_DAY_TOKENS=8000000 JARVIS_CLAUDE_DAY_REQUESTS=3000 LIVE_GAP_MS=20000`. Never run `src/lib/ai/claude.live.ts`, `src/lib/thunai/claude.v4.live.ts` or `src/lib/thunai/deploy.live.ts`.
- **Sarvam.** The owner made the account on 19 Nov; the key is in `.env`. They are on the free signup credit (Rs 100), of which about Rs 3 has been used by the bench. Research the whole API catalogue on the official docs: speech to text with streaming, transliteration, translation, language identification and their language models. Use what clearly helps, within the free credit. Buying Rs 500 is the owner's decision; give them the numbers.
- **Free tiers.** Groq and Gemini, as today.
- **No new accounts**, and nothing personal in any request to an outside service or any web search.

## Part 6: evaluation (built before tuning)
- **A new blind set first.** A helper that sees neither the code nor `eval/` writes about 100 realistic spoken requests in English, Tamil and Tanglish. It covers:
  - names said by ear: storms, places, people, outlets;
  - "first", "fast", "the last one" against a screen that is given;
  - intelligent reading;
  - Ask the Map by voice;
  - dashboard controls;
  - side talk that must stay silent;
  - cut-off lines.

  Hash it as `eval/v8/HASHES.txt` does, commit it before any fix, and run it once at the end against v9's commit as the baseline.
- **Regression sets**: v8's dev set (`eval/v8/dev`) and v9's blind set (`eval/v8/news9`, seen now, so regression only), dry and live. Never touch `eval/holdout3`.
- **The owner's real turns** from the audit log, as a local replay set. Never commit it.
- **Hearing**: the Sarvam bench again, on more clips, with the day's keyterms.
- **Latency**: wake, command to screen, question to first word, each with n, p50 and p90. None may be worse than v9.

## Part 7: standing rules
- **Git.** Push your own branch only. `main` only on the owner's own yes in chat (they gave it for v9, on 19 Nov). Stage explicit paths only; never `git add -A` or `commit -a`. `data/i18n/*`, `data/embeddings/*` and `next-env.d.ts` never go in a commit. Commits start with `jarvis10(<phase>):` and end with the attribution line. Rows holding citizens' words (case titles, the owner's turns) stay local; commit summaries only.
- **Tests.** Every defect fix gets a failing test first.
- **Keys.** Never print or commit a key, and never open `.env`.
- **The look.** The HUD and "Hi Jarvis" stay as the owner sees them. Any visible change needs before-and-after stills. Apshana's console work is final.
- **Quiet runs.** When the owner may be using the console, check before stopping their server. Restore `next-env.d.ts` and `tsconfig.json` after builds.

## Part 8: carried over from v9
- **The second independent review of v9's diff** (`7fa525fb..` v9's tip) stalled on the usage limit and was stopped. Run it first, read-only, and fix its confirmed findings test-first.
- **`start-fast.bat` fails** with "... was unexpected at this time." (parentheses inside an `echo` within an `if` block). Fix it so the owner can start the console with one click again.
- **v9's blind set** (60 requests, run once on 19 Nov): v8's commit 15/60, v9 24/60 live. News by topic was only 3 of 22. The causes are in RESULTS v9, "Where v9 still misses". The biggest:
  - **"நியூஸ்" is not a news word.** It is the Tamil-script "news" that Whisper writes. Every Tamil request whose only news word it is makes no news request at all.
  - **A story described with no news word gets no news request.** For example, a made-up one: "Kodambakkam la bus stop-a udaichaangale, adha kaattu". The planner then never searches the news.

  That set is seen now: use it for regression only. Fix these against your own new set.

## Part 9: done means
- Every ask in Part 2 shown working live on the real path (the browser, real providers), not only in unit tests. The owner's own failing turns from Part 3 are replayed and now right.
- The new blind set before and after, the regression sets, and latency, each in RESULTS v10.
- An independent read-only review before the finals, every confirmed finding fixed test-first.
- Gates green:
  - the full unit suite, tsc, lint and `next build`;
  - the QA gate, `bash tests/qa/pass7/gate-fast.sh`, on a clean tree;
  - the Jarvis browser specs.
- Write-ups:
  - RESULTS v10;
  - HANDOVER, owner decisions first: the Sarvam setting and whether to buy credit;
  - BUILD_LOG;
  - DEMO, with the new features to try in Edge.
- `start-fast.bat` rebuilt on the final code and working. The branch pushed. A memory note.
- The report to the owner: what improved, in plain words, with the numbers.
