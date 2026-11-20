# 40 · The whole console, the map, and news, by voice

Research note for Jarvis v10, written 19 Nov 2026 for the engineer who builds from it next. It covers four things:
- (a) full UI coverage by voice;
- (b) voice control of the map;
- (c) "intelligent reading" of news;
- (d) proactive features for a district administrator.

It ends with concrete designs (§5) and numbered recommendations (§7).

**How to read the marks**
- **(B)**: I read it in the cited source, and the URL is given. Repo facts are (B) with the repo path; I read them in this worktree.
- **(M)**: my own inference or design proposal. Where a fact reached me only through a search engine's summary of a page I could not open, it is marked (M) and says so.
- Papers are cited by title, venue and year. Under this research's rules no person is named or searched for, so author names are left out. Some repository and model URLs contain their owner's account name; those URLs are kept only because they are the citation and the download identifier.
- No account was made, no API was called, and no audio or text was sent anywhere. I read only public documentation, papers and READMEs. What I could not confirm is listed in §6.

---

## 0. The short version

- **(M)** Every OS voice-control system gives full coverage in three layers: *say the name*, then *show numbers*, then *show grid*. None of them supports Tamil, and none supports Tanglish. Jarvis has to own a registry of controls with spoken names in English, Tamil and Tanglish, plus a test that fails when a control has no voice path.
- **(M)** On a tie, the OS systems never guess. They number the matching items and ask "Which one?". Jarvis's `byName()` today breaks a tie silently, by the shortest name.
- **(M)** Home Assistant's template format (hassil, Apache-2.0) is the best open grammar format to copy. It can express Tamil and Tanglish only if two things hold:
  - the input is normalised first: Tamil-script loanwords, Tanglish clitics, light verbs;
  - entity lists carry the *inflected* forms of each name (அடையாற்றில், காசிமேட்டுக்கு).

  Its fuzzy matcher is English-only.
- **(M)** Prior art for map tours is KML touring and the Mapbox storytelling chapters: a playlist of fly, speak, wait and pause. People read "near" by scale, and language models do not. So "near X" must be a default radius chosen in code, said back aloud, and adjustable by voice.
- **(M)** A spoken news brief is four sentences of at most 20 words each, in inverted-pyramid order:
  1. what happened, where and when;
  2. why it matters locally;
  3. what the console knows;
  4. one or two offered next steps.

  Each sentence carries the ids of the facts it uses, and code checks numbers, names, dates, language and attribution before the sentence is spoken.
- **(M)** The evidence on what officials value favours "readily-accessible and actionable" information that names who is responsible (PayDash). Proactive speech shows clear benefit only in safety-critical and emergency situations.

---

## 1. Whole-UI coverage by voice (a)

### 1.1 What the OS voice-control systems do

**Apple Voice Control (macOS, iOS)**
- To act on an item, you "say its name or number, or say a command—such as 'Click'—followed by the item's name or number". **(B: https://support.apple.com/guide/mac-help/mh40719)**
- Overlays on the Mac: "Show names", "Show numbers", "Show grid" and "Show window grid", turned off with "Hide names", "Hide numbers" or "Hide grid". **(B: same)**
- On iPhone, "Show text numbers" is added, and there is a "Continuous Overlay" setting. "The item names or numbers disappear after you say the command." **(B: https://support.apple.com/guide/iphone/use-voice-control-iph2c21a3c88/ios)**
- **Developer synonyms.** SwiftUI's `accessibilityInputLabels` "Sets alternate input labels with which users identify a view".
  - Apple's guidance: "Provide labels in descending order of importance. Voice Control and Full Keyboard Access use the input labels."
  - Availability: iOS 14+ and macOS 11+.
  - If none are given, the accessibility label is used. **(B: https://developer.apple.com/documentation/swiftui/view/accessibilityinputlabels(_:), read via its JSON at https://developer.apple.com/tutorials/data/documentation/swiftui/view/accessibilityinputlabels(_:).json)**
- **Languages.** Voice Control's list includes English (India). Tamil and Hindi are not on it. **(B: https://www.apple.com/ios/feature-availability/)**
- What Voice Control does when two items share a name: not found (§6).

**Android Voice Access**
- Say "Tap" followed by any visible text, or the label alone ("Save"). **(B: https://support.google.com/accessibility/android/answer/6151854)**
- Overlays:
  - "Show labels" when you don't know the name;
  - "Show numbers" puts numbers on everything you can interact with;
  - "Show grid" (Android 7.0+), resized with "More squares" and "Fewer squares". **(B: same)**
- **Ambiguity.** "If a command could affect more than one item", Voice Access asks "Which one?" and you answer with the number. When two items share a label, you say the number. **(B: same)**
- "What is 7?" and "Show commands for [label or number]" explain an item. **(B: same)**
- **Languages.** English, Spanish, German, Italian, French, Portuguese and Japanese; Portuguese and Japanese have the top 25 commands only. **(B: same)**

**Windows Voice Access** (the Collector uses Edge on Windows)
- Say "Click <item name>". Partial names work: "Click privacy" selects "Privacy & security". **(B: https://support.microsoft.com/en-us/topic/use-voice-to-interact-with-items-on-the-screen-e1b53c8a-7765-495a-9611-d9b37c008319)**
- When several items match, Voice Access attaches a number to each and asks you to pick one. **(B: same)**
- "Show numbers" (here, everywhere), then "Click <number>" or just the number. Items without a number are reached with the grid overlay. **(B: same)**
- **Languages.** English variants including English–India, plus Japanese, Chinese, German, Spanish and French.
  - "Voice shortcuts" (custom commands) exist only in the English variants.
  - Copilot+ PCs add natural-language commanding that "understands multiple variations of an existing command"; its languages are not stated. **(B: https://support.microsoft.com/en-gb/accessibility/windows/voice-access/history-of-voice-access-updates)**

**Talon with Rango (the browser extension)**
- A `.talon` file has a context header (`app`, `title`, `mode`, `tag`, `os`, `language`, …) above a `-` line, and rules below it.
  - Rule syntax: `[optional]`, `a | b`, `x*`, `x+`, `{user.list}` for lists, `<user.capture>` for captures, and `^`/`$` anchors.
  - Lines of the same type are OR-ed; lines of different types are AND-ed. **(B: https://talon-wiki-refactor.netlify.app/customization/talon-files; a community wiki, not Talon's official docs)**
- Rango (MIT) draws letter hints on clickable elements and has three kinds of target:
  - hints;
  - **references**: you save a name for an element with "mark <target> as <text>" and use it with "click mark <text>";
  - text search: "click text submit" picks the element whose text "better matches".

  By default it hints only "minimally accessible" elements; "hint extra" and "exclude" adjust that. **(B: https://github.com/david-tejada/rango)**

**Serenade**
- The monorepo is Apache-2.0. **(B: https://github.com/serenadeai/serenade)**
- Its Chrome plugin is MIT and routes protocol commands to handlers. **(B: https://github.com/serenadeai/chrome)**
- Its spoken commands and custom-command template syntax: not confirmed (§6).

**What this means for Jarvis**
- **(M)** All of them use the same three layers: name, then numbers, then grid. Custom names come on top: Apple's input labels, Windows voice shortcuts, Rango's references.
- **(M)** Jarvis has two of the layers: names (accessible-name match) and numbers (`dom.ts`). It has no "show names" overlay, no grid over the map canvas, and no deliberate per-language synonyms.
- **(M)** No OS layer understands Tamil or Tanglish, so the console cannot lean on Windows Voice Access for the Collector's Tamil.
- **(M)** On ambiguity, none of the three OS systems guesses.

### 1.2 Spoken names: what the standards say
- **WCAG 2.5.3 Label in Name (Level A).**
  - The accessible name "contains the text that is presented visually".
  - "A best practice is to have the text of the label at the start of the name."
  - Text used symbolically, such as an icon, "should not be considered a visible label".
  - When names and labels don't match, speech-input users who say the visible label fail. **(B: https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)**
- **axe-core 4.14.0** (Deque's blog post, 22 Oct 2026) enables `label-content-name-mismatch` by default.
  - The rule compares word by word, "Properly ignores text in parentheses", and supports non-Latin scripts.
  - Caveat: Apple Voice Control needs an *exact* match on macOS and the visible text *at the start* on iOS, so "Axe-core can still pass cases that would not work in Apple's Voice Control". **(B: https://www.deque.com/blog/find-label-in-name-issues-in-every-scan-with-axe-core-4-14-0/)**
- axe-core is licensed MPL-2.0. **(B: https://github.com/dequelabs/axe-core)**
- The console already has `@axe-core/playwright ^4.14.0`, `@playwright/test ^1.63.0`, `vitest ^3.2.7` and `leaflet ^1.9.4`. **(B: repo `chennai-grievance-portal-main/package.json`)**
- Playwright aria snapshots give a YAML of `- role "name" [attributes]` (`locator.ariaSnapshot()`, `toMatchAriaSnapshot()`). "A template is a constraint, not necessarily a complete serialization", so they are good for listing role and name pairs but are not a coverage proof by themselves. **(B: https://playwright.dev/docs/aria-snapshots)**
- **(M)** For Jarvis:
  - each control's first English registry name should be its visible label, exactly (Apple's rule, the strictest);
  - synonyms follow in order of importance (Apple's ordering);
  - for an icon-only control, the name describes the function.

### 1.3 Disambiguation
- Android asks "Which one?" and takes a number. Windows numbers the matches. **(B: the pages in §1.1)**
- Rango picks the best text-match score; how it breaks ties is not described. **(B: Rango README above)**
- Confirmation phrasing from Google's voice-agent guide: use "You mean x?" and repeat only what needs confirming. **(B: https://docs.cloud.google.com/dialogflow/cx/docs/concept/voice-agent-design)**
- Jarvis today: `byName()` scores 3 for an exact match, 2 for a prefix and 1 for containment, then takes the shortest name among equals, so it never asks. `clickables()` numbers at most 99 visible controls, top to bottom and left to right. **(B: repo `src/components/collector/app/thunai/dom.ts`)**
- **(M)** The shortest-name tie-break is a silent guess, which runs against "no error". §5.1 replaces it with scores, a margin, and a question.

### 1.4 Coverage tests: prior art
- Home Assistant's intents repository keeps one YAML file per language with test sentences and their expected intents, under `tests/<language>/`.
  - Commands: `pytest tests --language nl -k fan_HassTurnOn`, `python3 -m script.intentfest validate`, plus `sample` and `count_sentences`. **(B: https://github.com/OHF-Voice/intents)**
  - "Unused rules or lists fail a pull request." **(B: https://contributors.home-assistant.io/translate/voice/template-syntax/)**
- Jarvis today: `reach.test.ts` checks two things:
  - each `REACH` row's *English* example sentence reaches an action, and "never" rows are refused;
  - every `ActionName` has the level that `risk.ts` runs.

  **(B: repo `src/lib/thunai/reach.test.ts`, `reach.ts`, 20 rows)**
- **(M)** It checks rows, not on-screen controls, and English only. That is the gap the brief's item 4.7.3 asks to close.

### 1.5 Open-source intent template engines

**hassil (Home Assistant's template matcher)**
- **Status.** Apache-2.0; latest 3.12.1 (14 Sep 2026); Python ≥ 3.9; depends on PyYAML. **(B: https://pypi.org/project/hassil/ ; https://github.com/OHF-Voice/hassil)**
- **Template syntax:**
  - alternatives `(red | green | blue)`, also inside a word: `turn(s | ed | ing)`;
  - optional parts `[the]`, `light[s]`;
  - permutations `(a; b)`, which match in any order; two to four items are recommended;
  - lists `{list}` or `{list:slot}`;
  - expansion rules `<rule>`;
  - inline ranges `{10..100,10:seconds}`. **(B: hassil README; template-syntax page above)**
- **Lists:**
  - text lists use `in`/`out`. `in` may contain alternatives; `out` may be a number, so a Tamil word can map to a canonical value;
  - range lists take `from`, `to`, `step`, `type` (number, percentage or temperature), `fractions` and `multiplier`;
  - wildcard lists use `wildcard: true` and are *greedy*;
  - lists cannot appear inside alternatives or optional parts. **(B: template-syntax page)**
- **Other features:**
  - `skip_words`;
  - `settings: ignore_whitespace: true`, for languages written without spaces;
  - per-intent `requires_context` and `excludes_context`;
  - `python3 -m hassil.sample <yaml> -n 1` to sample sentences. **(B: README; template-syntax page)**
- **Size.** "Each optional part doubles the sentence count and alternatives multiply it." **(B: template-syntax page)**
- **Fuzzy matching.** Home Assistant 2025.9 shipped an improved fuzzy matcher, "initially only available for the English language". **(B: https://www.home-assistant.io/blog/2025/10/22/voice-chapter-11)**
  - How it works (M, seen only in a search summary of a Debian copy of hassil 3.5.0's docs): order-4 n-gram models with Kneser-Ney smoothing, trained on the templates, which penalise words likely in other intents and boost `{name}`.
- **(M)** I found no JavaScript or TypeScript port. The search turned up none.

**Home Assistant's intents repository (the sentence data)**
- Licensed CC-BY-4.0. Layout: `sentences/<lang>/<domain>_<intent>.yaml`, `responses/<lang>/`, `tests/<lang>/` and `languages.yaml`. **(B: https://github.com/OHF-Voice/intents)**
- `languages.yaml` lists 60+ codes, including `ta`, `hi`, `ml`, `te`, `kn`, `bn`, `mr` and `gu`. Tamil has no language leader listed. **(B: https://raw.githubusercontent.com/OHF-Voice/intents/main/languages.yaml)**
- `sentences/ta/` exists, with `HassTurnOn/`, `HassTurnOff/` and `_common.yaml`. HassTurnOn has 11 files. **(B: https://github.com/OHF-Voice/intents/tree/main/sentences/ta ; .../ta/HassTurnOn)**
- **The Tamil suffix approach:**
  - template: `{area}[(-இல்|–இல்|இல்)] {name}[(-ஐ|–ஐ|ஐ)] <turn_on>`, with the example sentence "படுக்கையறையில் மேசை லாம்பு ஆன் செய்யவும்" **(B: https://raw.githubusercontent.com/OHF-Voice/intents/main/sentences/ta/HassTurnOn/name_area.yaml)**;
  - `ta/_common.yaml` puts locatives on a separate noun ("{{ area }} பகுதியில்") and has an empty `skip_words` **(B: https://raw.githubusercontent.com/OHF-Voice/intents/main/sentences/ta/_common.yaml)**.
- **(M)** My reading, not tested: an optional suffix group matches only when the suffix arrives as its own token or hyphenated. The natural written form படுக்கையறையில் fuses noun and suffix through a glide (…யில்), so it matches only if the `area` list itself carries the inflected form. Tamil needs inflected list values, not just suffix groups.

**Rhasspy**
- **Template syntax** (`sentences.ini`):
  - intents as `[Intent]`;
  - `(a | b)` alternatives and `[optional]` parts;
  - tags `(...){tag}`;
  - substitutions `spoken:output`;
  - rules `name = (...)`, used as `<name>`;
  - slot lists `$slot`, one file per list;
  - converters such as `!int`;
  - ranges `(0..100){brightness}`, with words generated by `num2words`. **(B: https://rhasspy.readthedocs.io/en/latest/training/)**
- `rhasspy-nlu` is MIT and was archived on 6 Oct 2025, so it is read-only. **(B: https://github.com/rhasspy/rhasspy-nlu)**

**Data and tools that help with Tamil**
- **MASSIVE.** 52 languages including **ta-IN**; 11,514 / 2,033 / 2,974 utterances per locale (train, dev, test); 60 intents and 55 slot types; CC BY 4.0. Slots are written `[time : five am]`. **(B: https://huggingface.co/datasets/AmazonScience/massive ; https://github.com/alexa/massive)**
  - **(M)** It is useful as a source of Tamil imperative phrasings for testing, not for dashboard intents.
- **snowballstemmer.** 3.1.1 (3 Jun 2026), BSD-3-Clause; Tamil is among its languages. **(B: https://pypi.org/project/snowballstemmer/)**
  - **(M)** It is usable in the Python sidecar only, so it cannot be on the critical path, because Jarvis must keep working when the sidecar is down.

### 1.6 Can templates express Tamil and Tanglish?
These are my judgements **(M)**, checked against the facts above. A Tamil speaker should review every Tamil and Tanglish example in this note.

1. **Script.** Yes. Unicode Tamil works, and Home Assistant already ships Tamil templates (B, §1.5). Normalise to NFC first; v9 already reads decomposed Tamil letters as composed.
2. **Word order.** Tamil is verb-final with fairly free order. Use permutations `(<what>; <where>)` rather than writing every order.
3. **Case suffixes and sandhi** are the real problem. Examples:
   - அடையாறு (Adyar) → அடையாற்றில் (in), அடையாற்றிலிருந்து (from), அடையாற்றுக்கு (to);
   - காசிமேடு (Kasimedu) → காசிமேட்டில், காசிமேட்டுக்கு;
   - வேளச்சேரி (Velachery) → வேளச்சேரியில்.

   Generate these forms per entity, at build time, into the list's `in` alternatives. hassil's `in` accepts alternatives (B). This works with no sidecar and is easy to test. Stripping suffixes with a stemmer is the fallback, for names outside the lexicon.
4. **Tanglish**: Latin script, English verbs with the Tamil light verb (*pannu, pannunga, panni*), clitic case markers (*-la, -ku, kulla, pakkathula, la irundhu, kitta*), and spellings that vary.
   - Templates can carry `<do> = (pannu|pannunga|panni|pannu da)` and the clitics as optional groups.
   - Spelling variation (*Kasimedu, Kasimédu, Kaasimedu*) belongs to the entity and phonetic layer, which another v10 note covers, not to the grammar.
5. **Mixed script.** Speech-to-text can write English loanwords in Tamil script. "நியூஸ்" was v9's missed news word **(B: repo `docs/jarvis/JARVIS_V10.md`, Part 8)**. Map loanwords to English tokens *before* matching:
   - நியூஸ் → news, மேப் → map, லேயர் → layer, ஜூம் → zoom;
   - எக்ஸ்போர்ட் → export, சேவ் → save, ஓப்பன் → open, க்ளோஸ் → close;
   - நெக்ஸ்ட் → next, ஸ்டாப் → stop;
   - பண்ணு / பண்ணுங்க → *do*.
6. **Numbers and units.**
   - Tamil: ஒன்று/ஒரு, இரண்டு/ரெண்டு, மூன்று/மூணு, நான்கு/நாலு, ஐந்து/அஞ்சு, அரை (half), ஒன்றரை (one and a half).
   - Tanglish: *onnu, rendu, moonu, naalu, anju, arai, onnarai*.
   - Units: கிலோமீட்டர் / கி.மீ. / *km*, மீட்டர் / *meter*.
   - hassil's range lists won't produce these words, so write a per-language number parser. Check what the repo's `digits.ts` already covers first.
7. **Verdict.** Yes, with a normalisation pass first and inflected entity lists. Don't count on fuzzy matching for Tamil, since Home Assistant's is English-only (B).

### 1.7 What Jarvis already has (baseline, all from the repo)
- **`reach.ts`.** 20 rows with levels read, A, B, C and never. A runs at once with undo, B needs a spoken yes or a tap, C goes to the tray as a draft only. Jarvis "never sends, approves or deletes". **(B: repo `src/lib/thunai/reach.ts`)**
- **`dom.ts`.**
  - `CLICKABLE` selector; `visible()`, which also tests occlusion;
  - `accessibleName()`, built from aria-label, title, placeholder, labelledby and the shown text;
  - `clickables()`, at most 99 controls;
  - `byName()`;
  - `data-thunai-ui` marks Jarvis's own controls;
  - `data-jarvis-never`, together with `isDangerButton`, blocks sends, approvals and deletes. **(B: repo `src/components/collector/app/thunai/dom.ts`, `Thunai.tsx`)**
- **`camera.ts`.**
  - Shots by answer shape.
  - Flights take 0.6–1.6 s, scaled by distance: `600 + km*60` ms, clamped.
  - Zoom is capped at 16 for areas and 17 for points.
  - There is a hotspot "tour" of the top 3, with flights of 1.2 s and then 3 s.
  - "Follow the road" takes 6 s.
  - Reduced motion gives the same final view with no flight. **(B: repo `src/lib/map/camera.ts`)**
- **`askmap/actions.ts`.**
  - CSV or GeoJSON export through `/api/map/export`.
  - Save view: a workspace for the Collector, the browser's local storage for an officer.
  - `visitOrder`: at most 10 open, pinnable cases by priority, ordered by nearest neighbour, then 2-opt, with straight-line legs.
  - `googleMapsLink`: coordinates only, at most 9 waypoints, `travelmode=driving`, "Opened only by the officer's click". **(B: repo `src/components/collector/app/askmap/actions.ts`)**

---

## 2. Voice control of the map (b)

### 2.1 The camera
- **Leaflet 1.9.4 `flyTo`.**
  - `rho = 1.42`, `S = (r(1) - r0) / rho`.
  - `duration = options.duration ? 1000 * options.duration : 1000 * S * 0.8`.
  - It falls back to `setView` when `animate === false` or the browser lacks 3D transforms.
  - `flyToBounds` computes centre and zoom, then calls `flyTo`. **(B: https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/src/map/Map.js)**
- **Events.** `moveend` fires "when the center of the map stops changing"; `zoomend` fires "after any animations". **(B: https://leafletjs.com/reference.html, which now documents 2.0.0-beta.5)**
  - **(M)** I assume these event names are unchanged from 1.9.4; check `node_modules/leaflet` before relying on it.
- In Leaflet 2.0-beta, `flyTo` acts like `setView` when the user prefers reduced motion. **(B: same)**
  - The console is on 1.9.4, and `camera.ts` already handles reduced motion. **(B: repo)**
- **The 1.42 curve.** MapLibre documents the same default: "1.42 is the average value selected by participants in the user study" from 2003 on smooth zooming and panning. Its `speed` default is 1.2 screenfuls per second. **(B: https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/FlyToOptions/)**
- **(M)** Leaflet's flight path is already the user-tested curve. `camera.ts`'s explicit durations matter for narration: a known flight time lets Jarvis schedule speech, and the `moveend` event is the cue when it can't.

### 2.2 Tours: prior art
- **KML touring (Google Earth).** `gx:Tour` holds a `gx:Playlist` of primitives:
  - `gx:FlyTo`: `gx:duration` in seconds; `gx:flyToMode` is `bounce` (the default) or `smooth`;
  - `gx:Wait`;
  - `gx:TourControl` with `gx:playMode` pause, which waits for the user;
  - `gx:SoundCue`, which plays audio and has no duration;
  - `gx:AnimatedUpdate`.

  How they run:
  - *Series* primitives (FlyTo, Wait, TourControl) run one at a time.
  - *Parallel* ones (SoundCue, AnimatedUpdate) start, and the playlist moves on at once, so **audio plays during flights**.
  - To let a sound finish, put a `gx:Wait` after it.
  - Known issue: sound keeps playing during a TourControl pause.

  **(B: https://developers.google.com/kml/documentation/touring)**
- **Mapbox storytelling template** (BSD-3-Clause). Each chapter has `id`, `alignment`, `hidden`, `title`, `image`, `description`, `location {center, zoom, pitch, bearing}`, `mapAnimation` (`flyTo`/`easeTo`/`jumpTo`), `rotateAnimation`, `callback`, and `onChapterEnter`/`onChapterExit: [{layer, opacity}]`. **(B: https://github.com/mapbox/storytelling)**
- **The "martini glass" structure** from *Narrative Visualization: Telling Stories with Data*: stories "start of with an author-driven approach" and then "give controls to the user to filter or (dis)aggregate". **(B: https://data.europa.eu/apps/data-visualisation-guide/martini-glass-story-structure)**
  - The paper's year, IEEE InfoVis 2010, comes from search summaries. (M)
- **(M)** A narrated district tour is a martini glass:
  - a short author-driven stem (3–5 stops, Jarvis decides);
  - then the reader-driven bowl: "go deeper here" opens Ask the Map scoped to that stop.

  KML's FlyTo, SoundCue and TourControl and Mapbox's chapters with layer opacity are the data model.

### 2.3 Spatial references ("within two kilometres of X", "near the harbour")
- **"Near" depends on the size of the reference object.** A 2022 conference study compared the distances at which nine geospatial prepositions are acceptable, at three locations. It found the reference object's "image schema" affects whether people say *near* or *in*. **(B: https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.COSIT.2022.1)**
  - Its numeric thresholds are in the PDF, which I could not read (§6).
- **(M, from search summaries, not opened)** Two older studies point the same way:
  - *How far is near? Inferring distance from spatial descriptions* (Language and Cognitive Processes, 2005): the inferred distance grows with the size of the objects related;
  - *Nearness relations in environmental space* (IJGIS 15, 2001): an experiment showing "near" is vague and context-dependent.
- **Language models get the scale wrong.** "LLMs lack the ability to adapt the meaning of the words 'near' and 'far' to the appropriate scale." (*Metric Reasoning in Large Language Models*, ACM SIGSPATIAL 2024.) **(B: https://osullik.github.io/publication/2024-10-30-LLM-metric-reasoning)**
- **Prior art for defaults with adjusters.** In a natural-language visual-analysis system (Eviza, UIST 2016), "large" and "near" are flagged as fuzzy. "Near California" becomes "a 100 mile radius around the border". Two "ambiguity widgets" let the user change the defaults, and its grammar rules are "dynamically updated based on the data from the visualization".
  - **(M)** Seen only in search-result quotes of the Tableau Research page; my fetch got a 403.
- **(M)** Consequences for Jarvis:
  - pick "near" radii in **code**, by the anchor's type, never by the language model;
  - **say the assumption aloud** and offer "wider" and "closer" (Eviza's widgets, done by voice);
  - an explicit distance always wins;
  - fill grammar lists (places, layers, categories) from the console's live data.

### 2.4 Layers and map analysis tools by voice
- **Google's examples for voice during navigation:** "Add stop", "Mute guidance", "Avoid tolls", "Show alternative routes", "What's my next turn?", "When will I arrive?", "What's my next stop?". **(B: https://support.google.com/maps/answer/6041199?hl=en)**
  - **(M)** These are short imperative and question forms, the register Jarvis's map grammar should accept.
- **Google Maps URLs, the Directions action.**
  - Base: `https://www.google.com/maps/dir/?api=1&`.
  - Parameters: `origin`, `destination`, `waypoints` separated by `%7C`, `travelmode` (driving, walking, bicycling, two-wheeler or transit), `dir_action=navigate`.
  - "up to three waypoints supported on mobile browsers, and a maximum of nine waypoints supported otherwise".
  - "URLs are limited to 2,048 characters".
  - "You don't need a Google API key".

  **(B: https://developers.google.com/maps/documentation/urls/get-started)**
- **(M)** The console's `googleMapsLink` (9 waypoints, driving) is right on a desktop and on a phone with the Maps app. If the Collector opens it in a phone *browser*, only 3 waypoints survive. Say so on the card, or split the route into two links.
- **OSRM's public demo server.**
  - It runs on a "best effort basis" and heavy use is prohibited.
  - "Access to the Demo Server shall be withdrawn at any time and without giving a reason."
  - Selling access is forbidden.

  **(B: https://github.com/Project-OSRM/osrm-backend/wiki/API%20Usage%20Policy)**
- **(M)** Do not send case coordinates to any third-party router. v10's rule is that nothing personal leaves the machine. Keep straight-line legs, and say "in straight lines". Google computes the road route only when the Collector opens the link.

### 2.5 Spoken narration: pacing and form
- **Writing radio news for the ear:**
  - avoid sentences over 20 words, with one or two ideas per sentence;
  - put attribution first, because "your listeners need to know who was speaking before they can judge what was said";
  - use numbers only when they inform, rounded;
  - repeat names and places at least once;
  - use the present tense;
  - never open a paragraph with an unfamiliar name;
  - a TV stand-up runs 10–20 s.

  **(B: https://www.thenewsmanual.net/Manuals%20Volume%202/volume2_48.htm)**
- **Speech rate and recall.** In a study of Spanish public-radio news (*Media Psychology*, 2015, 200 students):
  - 150 words per minute was rated slow;
  - 170–190 wpm was rated "normal", and recall was best there "regardless of density";
  - 230 wpm with dense content was worst ("cognitive overload").

  **(B: https://journalistsresource.org/?p=48675, a summary of the paper)**
  - **(M)** The study is Spanish, not Tamil. Measure Jarvis's own voice; it stays as it is.
- **Lists of three.** Group spoken options and multi-item answers in threes. The Assistant reads "the first three items" and then offers more. **(B: https://design.google/library/rule-of-three, an editorial, not a formal rule)**
- **Brevity.** Google's voice-agent guide: "limit your voice agent to one or two sentences per turn" when you want short replies. On a no-match, restate briefly and don't say "try rephrasing". **(B: https://docs.cloud.google.com/dialogflow/cx/docs/concept/voice-agent-design)**
- **Pauses.** For text read aloud, commas and semicolons give short pauses and full stops give longer ones. **(B: https://developer.amazon.com/en-US/docs/alexa/flashbriefing/flash-briefing-skill-api-feed-reference.html)**
- **Overview first.** Image-description guidance for complex images (maps included) is "high-level context first", then details. (M: seen only in a search summary, not opened.)
- **(M)** A tour line is one sentence of at most 20 English words, about 7 s at 170 wpm. Put the place first, then one number, then why it matters. Before stop 1, say how many stops there are and how to steer. After three stops, ask before going on.

---

## 3. "Intelligent reading" of a news story (c)

### 3.1 How a news brief is built
- **The inverted pyramid.** "The most fundamental information" goes in the lead paragraph, and the rest follows in order of importance. The lead covers the Five Ws (who, what, when, where, why). Editors can trim from the bottom. **(B: https://owl.purdue.edu/owl/subject_specific_writing/journalism_and_journalistic_writing/the_inverted_pyramid.html)**
- **Broadcast rules** (≤ 20 words, attribution first, rounded numbers, repeat the place): §2.5. **(B: The News Manual)**
- **Signposts.** "Why it matters" and "Go deeper" are Axios's signposts, and "Go deeper" leaves the choice to the reader. (M: search summaries only.)
- **A shipped shape for spoken items: Alexa Flash Briefing.**
  - Fields: `uid`; `updateDate` (ISO 8601, UTC); `titleText`; `mainText`, the text read aloud ("fewer than 4,500 characters", plain text, "no SSML, HTML, or XML"); `redirectionUrl`; `streamUrl` for audio.
  - "Provide between 1 and 5 unique feed items at a time", newest first.
  - "Alexa ignores items with a date older than 7 days."

  **(B: Amazon Flash Briefing feed reference, above)**

### 3.2 What listeners say about spoken news
- **The Reuters Institute's report** *The Future of Voice and the Implications for News*:
  - "Only a fifth (18% US, 22% UK) access news briefing functionality daily";
  - users are "underwhelmed by existing content, which is mostly re-versioned from radio or print".

  **(B: https://reutersinstitute.politics.ox.ac.uk/our-research/future-voice-and-implications-news)**
- A summary of the same report (20 Nov 2018) lists "a wide range of user complaints, including updates that are too long and out of date". **(B: https://newscollab.org/2018/11/20/alexa-whats-the-future-of-news-on-smart-speakers/)**
- **(M)** For Jarvis:
  - the default "read" is short and says how fresh the story is;
  - its length is the Collector's choice: "read it fully";
  - a brief must not be a re-read of the print text, which is the owner's own complaint: "it's simply like reading".

### 3.3 Grounding: a check on each sentence before it is spoken
- **ALCE** (EMNLP 2023): a benchmark for generating text with citations, scored on fluency, correctness and citation quality. On ELI5, "even the best models lack complete citation support 50% of the time". **(B: https://arxiv.org/abs/2305.14627)**
- **SummaC** (TACL 2022): earlier NLI-based checkers failed through "a mismatch in input granularity". The fix is to split the document into sentences and aggregate scores over pairs of sentences. SummaCConv reaches 74.4% balanced accuracy. **(B: https://aclanthology.org/2022.tacl-1.10)**
- **MiniCheck** (EMNLP 2024): a sentence-level checker; "the claim should first be broken up into sentences".
  - Models: `roberta-large`, `deberta-v3-large`, `flan-t5-large` (770M) and `Bespoke-MiniCheck-7B`.
  - API: `MiniCheck(model_name='flan-t5-large').score(docs=[...], claims=[...])` returns `pred_label` and `raw_prob`.
  - The repo is Apache-2.0. For the 7B model, "For commercial licensing, please contact" the company. Languages are not stated.

  **(B: https://github.com/Liyan06/MiniCheck)**
  - **(M)** The 7B model card's own licence is CC BY-NC 4.0 per a search summary, so treat it as unusable.
- **HHEM-2.1-Open.**
  - Apache-2.0, fine-tuned from flan-t5-base (about 0.1B parameters).
  - **English only**; multilingual support exists only in a commercial hosted version.
  - Takes (premise, hypothesis) pairs and returns a score from 0 to 1.
  - "around 1.5 second for a 2k-token input" on a modern x86 CPU, under 600 MB.

  **(B: https://huggingface.co/vectara/hallucination_evaluation_model)**
- **mDeBERTa-v3-base-xnli-multilingual-nli-2mil7.**
  - MIT, 0.3B parameters.
  - Its NLI training data covers 27 languages, **Tamil included**, but no Tamil accuracy is reported. Hindi scores 0.769 on XNLI.
  - Speed is reported for GPU only.

  **(B: https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7)**
- **(M) Design.** Code checks come first: numbers, names, dates, language and attribution against the sentence's cited facts. They are cheap, work in any language, and are always on.
  - Second, NLI in the sidecar when it is up: HHEM for English, mDeBERTa for Tamil.
  - When the sidecar is down, the code checks decide alone. Speech never waits on it.
  - No CPU latency is published for a single short pair. Measure on the laptop.

### 3.4 Reading a story in another language
- **CrossSum**: cross-lingual summarisation over "1500+ language-pairs", 45 languages including Tamil, built from XL-Sum (BBC News); **CC BY-NC-SA 4.0**, "non-commercial research purposes". **(B: https://huggingface.co/datasets/csebuetnlp/CrossSum)**
  - **(M)** It is usable only as an *evaluation* reference, not for training anything shipped.
- **IndicTrans2.**
  - Code and model checkpoints are MIT.
  - Models: English to Indic and Indic to English at 1B, plus distilled 200M versions (Fairseq and Hugging Face); Indic to Indic at 320M, distilled, on Hugging Face only.
  - Tamil's code is `tam_Taml`.
  - CTranslate2 ports exist "for efficient inference".

  **(B: https://github.com/AI4Bharat/IndicTrans2)**
  - **(M)** A search snippet showed a contact-sharing gate on one Hugging Face model page. A gate needs a Hugging Face account, which v10's no-new-accounts rule forbids. Check before planning on it (§6).
- **(M) Design.**
  - Translate the *facts*, not the article's prose.
  - Take names from the entity lexicon in the target script.
  - Give quotes as reported speech with attribution, as The News Manual advises (B).
  - "Read it fully" in another language means translating paragraph by paragraph and starting to speak after the first one.

### 3.5 Next steps, control, and when to stop
- Google's guide suggests a closing question such as "Is there anything else I can help you with?". **(B: Dialogflow voice-agent design, above)**
- **Microsoft's human-AI interaction guidelines (CHI 2019).** The relevant ones here:
  - G1 "Make clear what the system can do";
  - G3 "Time services based on context";
  - G4 "Show contextually relevant information";
  - G7 "Support efficient invocation", G8 "Support efficient dismissal", G9 "Support efficient correction";
  - G10 "Scope services when in doubt";
  - G11 "Make clear why the system did what it did".

  **(B: https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/)**
- **(M)** End a brief with *one* question offering at most two concrete next steps, your pick first. "Read it fully" reads the original paragraphs, with a check-in every three. "Stop", "skip" and "repeat that" always work.

---

## 4. Proactive and creative features for a district administrator (d)

### 4.1 Evidence of what such users value
- **PayDash** was a mobile app built on India's digitised MGNREGA wage-payment data. Officials could see pending payments, "identify the officers responsible", and follow up by WhatsApp or phone.
  - Trial: randomised at scale in Madhya Pradesh and Jharkhand.
  - Result: payment processing time fell by **11% (about 2 days) in the areas with the highest delays**.
  - Surveys put its value in "readily-accessible and actionable" information, *not new information*.
  - Giving it to either level of the hierarchy worked about as well as giving it to both.

  **(B: https://cega.berkeley.edu/collection/using-digital-trials-to-improve-management-and-accountability-for-public-service/)**
- **A systematic review of proactive voice assistants** (*Computers in Human Behavior Reports*, 2024, 21 studies):
  - studied mostly in "domestic and in-vehicle contexts";
  - "only safety-critical and emergency situations demonstrating clear benefits for proactivity";
  - its model of proactivity has context, initiation and action.

  **(B: https://alexandria.unisg.ch/handle/20.500.14171/119758)**
- **A survey on proactive smart speakers** (CUI 2021) found ratings were "surprisingly positive", but the assistant is "too intrusive especially if it interferes in a conversation". (M: search summary only.)
  - **(M)** This ties proactivity to v10's side-talk work.
- **A proactive voice assistant in a climate-data exploration task** (2024 preprint) "enhanced user engagement" and "facilitated quicker insights". It listened continuously. **(B: https://arxiv.org/abs/2409.10797)**
- **Under-reporting** (*Nature Computational Science*, 5 Dec 2023; NYC and Chicago, over 1M reports):
  - after controlling for the type of incident, some neighbourhoods reported incidents **three times faster** than others;
  - reporting rates track income, education and density;
  - so services allocated on reports alone favour areas that report more.

  **(B: https://news.cornell.edu/stories/2023/12/method-may-improve-cities-responses-resident-service-calls)**
  - **(M)** "No complaints near X" must never be said as "no problem at X".

### 4.2 News to action (the brief's feature 1)
- **(M)** Its shape:
  1. The story's place is matched in the gazetteer.
  2. Find the complaints within a radius and time window, in the categories that match the story.
  3. Say one line: the count, the oldest case's age, and the responsible office.
  4. Offer to show them on the map, or to draft a note to the officer (tray only).

  This is exactly PayDash's "actionable, names who is responsible" pattern (B). Defaults are in §5.4.

### 4.3 The daily tour (feature 2)
- **(M)**
  - A "morning round" of at most 5 stops: today's hotspots, the oldest severe cluster, the places in today's news, and the rain gauges when it is raining.
  - It is *offered* in one line, never auto-played. The review supports this: proactivity clearly helps only in emergencies (B).
  - Exception: a cyclone or heavy-rain alert may be announced unprompted, but never during side talk.

### 4.4 Field-visit planning (feature 3)
- **(M)**
  - "Plan my visit to the worst flooded spots tomorrow morning" becomes an Ask the Map plan, then `visitOrder`, then a route card with the Google Maps link.
  - Speak: the number of stops, the straight-line kilometres, and the first stop.
  - Nothing is sent without the Collector's yes and an existing channel.
  - Link limits: §2.4.

---

## 5. Designs to build from

### 5.1 Control registry, disambiguation, coverage test (M)

**Registry** (`src/lib/thunai/voice/controls.ts`, a proposed name), one entry per control:

```ts
export interface VoiceControl {
  id: string;                 // stable, dotted: "askmap.export.csv", "topbar.period.weekly"
  region: string;             // "topbar" | "news-panel" | "askmap" | "stage" | ... (spoken in disambiguation)
  role: "button" | "tab" | "toggle" | "select" | "link" | "map-op" | "field";
  names: { en: string[]; ta: string[]; tl: string[] }; // [0] = preferred = visible label (en); synonyms after, by importance
  level: "read" | "A" | "B" | "C" | "never"; // must equal ACTION_LEVEL / risk.ts for its action
  act: { step?: string; click?: true };       // a Step from types.ts, or press the element
  when?: string;              // context key that must be active, e.g. "askmap.open", "tour.active"
}
```

- **In the DOM.** Every interactive element gets `data-voice="<id>"`. A control that has no voice path *on purpose* carries `data-voice-skip="<reason>"`. Keep `data-jarvis-never` on sends, approvals and deletes.
- **Region names** are what Jarvis says when it asks: "the map's Export or the report's Export?".

**Matching and disambiguation.** Start with these numbers and tune them on the new blind set:

| Evidence | Score |
|---|---|
| Exact match of a registry name (after normalisation, §1.6) | 1.00 |
| Registry synonym | 0.95 |
| Exact match of the accessible name | 0.90 |
| Prefix of ≥ 2 words, or ≥ 60% of the name | 0.80 |
| All spoken tokens contained in the name | 0.70 |
| Phonetic-key match | 0.70 |
| Fuzzy similarity ≥ 0.85 | 0.60 |
| Bonus: in the focused region (open dialog or panel) | +0.05 |

What to do with the scores:
- **Act** when the top score s1 ≥ 0.80 and s1 − s2 ≥ 0.10.
- **Ask** when s1 ≥ 0.60 but the margin or the score is short. Name at most three candidates by region ("Which one: the map's Export, or the report's?"), and number only those candidates on screen, as Windows and Android do (B).
- **Otherwise**, say so: "I don't see 'X' here. Say *show names*."
- **Never** guess by the shortest name.

**New voice affordances**
- "**Show names**": overlay each visible control's preferred registry name, in the current language. Apple and Android have this overlay (B), and it teaches the Collector what to say.
- "**What can I say here?**": three commands for this screen, read from the registry (G1, B).
- "**Call this X**": a personal synonym, Rango's "references" (B), stored locally at level A.
- "**Show grid**" on the map: a 3×3 numbered grid over the Leaflet canvas. "Zoom into 5" and "go deeper at 7" use it. The OS grids exist for exactly what has no label (B).

**The coverage test** (the brief, 4.7.3). It is the brief's "test that fails when a control has no voice path", with these parts:
1. **Static (vitest):**
   - every registry entry has ≥ 1 name in each of `en`, `ta` and `tl`;
   - `level` equals `ACTION_LEVEL` for its step;
   - every `never` entry's element carries `data-jarvis-never`;
   - in each region, no two entries share a name, and no name is a prefix of another's unless a qualifier separates them;
   - **round trip**: one generated sample sentence per entry and per language (from the grammar, §5.2) resolves to exactly that id;
   - every entry is reached by at least one sample.
2. **Walking the console (Playwright):**
   - for every state (each page × each panel open × Ask the Map open or closed × UI language en/ta), list visible controls with the same `CLICKABLE` selector and `visible()` that "show numbers" uses;
   - **fail** on any control with neither `data-voice` (a known id) nor `data-voice-skip`;
   - run axe with `button-name`, `link-name`, `label` and `label-content-name-mismatch` (on by default in 4.14, B) and fail on any violation;
   - check that each visible id's visible text appears in its `names.en[0]` or `names.ta[0]`. This is Apple's exact-match bar, stricter than axe (B).
3. **Smoke (Playwright, sampled):**
   - for N random entries per run, type the sample sentence into Jarvis's text box and assert the effect;
   - run every `never` entry and assert a refusal.
4. **The failure message names the fix**, for example: `Control "Export CSV" (askmap) has no voice path: add it to voice/controls.ts with en/ta/tl names, or mark data-voice-skip="<reason>".`

### 5.2 A voice grammar for map operations (M)

**Pipeline, in-process TypeScript with no sidecar:**
1. NFC, and compose decomposed Tamil letters.
2. Map Tamil-script loanwords to English tokens (§1.6.5).
3. Split off Tanglish clitics (`-la`, `-ku`, `kulla`, `pakkathula`, `la irundhu`).
4. Map light verbs (`pannu/பண்ணு`) to `<do>`.
5. Match against a hassil-compatible template set, with lists filled from live console data: places (with inflected forms), layers, categories, and the controls visible now.
6. With no match, hand over to Ask the Map's own engine or the existing lanes. The grammar never tries to parse analytic questions.

Use Python hassil only offline, in CI: `hassil.sample` and `count_sentences` (B) check the YAML. Write a small TypeScript matcher for the subset: alternatives, optional parts, permutations, lists with in/out, ranges, contexts and skip words.

**Intents and example phrasings.** Have a Tamil speaker review every example before it goes into tests.

| Intent (level) | English | Tamil | Tanglish |
|---|---|---|---|
| `map.flyTo {place}` (A) | show Kasimedu; zoom to Adyar | காசிமேட்டைக் காட்டு; அடையாறு காட்டு | Kasimedu kaattu; Adyar zoom pannu |
| `map.zoom in/out` (A) | zoom in; closer; zoom out | பெரிதாக்கு; சிறிதாக்கு | zoom in pannu; zoom out pannu |
| `map.radius {n}{unit} {place}` (A) | complaints within two kilometres of Kasimedu | காசிமேட்டிலிருந்து இரண்டு கிலோமீட்டருக்குள் உள்ள புகார்கள் | Kasimedu-la irundhu rendu km kulla complaints |
| `map.near {place}` (A) | near the harbour; around Koyambedu bus stand | துறைமுகத்துக்கு அருகில்; துறைமுகம் பக்கத்துல | harbour pakkathula |
| `map.layer.on/off {layer}` (A) | show the rain layer; hide schools | மழை அடுக்கைக் காட்டு; பள்ளிகளை மறை | rain layer on pannu; schools off pannu |
| `map.mode zones/taluks` (A) | switch to taluks | வட்டங்களைக் காட்டு | taluk-a maathu |
| `map.shot replay/next/prev` (A) | replay; next shot | மறுபடி காட்டு; அடுத்த காட்சி | replay pannu; next shot |
| `map.grid` (A) | show grid; zoom into five | கட்டம் காட்டு; ஐந்தில் பெரிதாக்கு | grid kaattu; anju-la zoom pannu |
| `map.export {csv/geojson}` (A) | export this as CSV | இதை CSV ஆக ஏற்றுமதி செய் | idha CSV-a export pannu |
| `map.saveView` (B) | save this view | இந்தப் பார்வையைச் சேமி | indha view-a save pannu |
| `map.visitOrder` (A) | plan my visit; visit order | பார்வையிடும் வரிசையைக் காட்டு | visit plan pannu |
| `map.insight` (read) | what stands out here | இங்கே என்ன தனித்து நிற்கிறது | inga enna special-a irukku |
| `map.send {dept}` (C, draft) | send this to Metro Water | இதை மெட்ரோ வாட்டருக்கு அனுப்பு | idha Metro Water-ku anuppu |
| `map.suggest` (read) | what can I ask here | இங்கே என்ன கேட்கலாம் | inga enna kekkalaam |
| `tour.start` (A) | take me round the district | மாவட்டத்தைச் சுற்றிக் காட்டு | district-a suthi kaattu |

For `map.send`, the draft goes to the tray. Sending is the Collector's own tap.

**The spatial parser.** `{relation} {distance?} {anchor}` with these slots:
- **distance:** digits, or number words in English, Tamil or Tanglish (§1.6.6), with an optional unit. "half a kilometre" and "அரை கிலோமீட்டர்" are 500 m.
- **relation:**
  - *within, inside*, -க்குள், *kulla*: a hard radius or containment;
  - *near, around, close to*, அருகில், பக்கத்தில், சுற்றி, *pakkathula, suthi*: the default by anchor type;
  - *next to, right by*: half the default.
- **anchor:** a gazetteer entity (point, line or polygon). "here" means the current tour stop, else the map centre. "this place" means the selected marker.

**Default "near" radii,** chosen in code and never by the model:

| Anchor type | Default radius |
|---|---|
| Point (bus stand, school, junction, hospital) | 500 m |
| Line (road, canal, river) | a 500 m buffer |
| Large polygon (harbour, lake, park) | a 1 km buffer from the outline |
| Locality, ward or zone | containment ("in") |

- Clamp every radius to 50 m – 10 km. An explicit distance always wins.
- **Speak it back:** "Within 500 metres of the Koyambedu bus stand. Say *wider* or *closer*." Wider doubles the radius and closer halves it.
- These are follow-up edits of the existing plan; `camera.followUpMoves("distance")` already keeps the view (B: repo).

**Contexts** use hassil's `requires_context` (B). "next", "back", "stop" and "go deeper" belong to `tour.active` when a tour runs, and otherwise to the list or Stage. "Export" belongs to `askmap.open` when the map panel is open, and otherwise to the report export.

### 5.3 The narrated tour (M)

**Data model**, a cross between a KML playlist and Mapbox chapters (B):

```ts
interface TourStop { id: string; kind: "hotspot" | "news" | "relief" | "gauge" | "case";
  shot: Shot;                       // from camera.ts (point or bounds; caption_en/ta already exist)
  line: { en: string; ta: string }; // <= 20 words / <= 7 s each, built from facts by template
  facts: string[];                  // fact ids, for the same per-sentence check as §5.4
  layers?: { on?: string[]; off?: string[] };     // onChapterEnter-style
  deeper: { question_en: string; question_ta: string; plan?: unknown } } // Ask the Map scoped to this stop
```

**State machine:** `idle → intro → fly(i) ∥ speak(i) → hold(i) → [auto: fly(i+1)] … → checkIn (after stop 3) → … → done`.
- Side states: `paused`, `deeper(i)` (the tour is suspended and Ask the Map is scoped to stop i) and `stopped`.
- Events: next, back, repeat, stop, pause, resume, deeper, skip, "how many left", and "back to the tour".

**Timings:**
- **Intro**, before the first flight: "Five stops: Kasimedu, Adyar, … Say *next*, *stop* or *go deeper* any time."
- **Flight:** use `camera.ts`'s `flightMs` (0.6–1.6 s), not the old fixed 3 s.
- **Speech starts with the flight.** KML plays audio during FlyTo (B), and the place name orients the listener.
- **Hold** 1.5 s after the line ends, so there is time to say "go deeper", then auto-advance. Any speech during the hold pauses the tour.
- **Check in after stop 3:** "Shall I go on? Two more: Velachery and Tondiarpet." This is the rule of three (B).
- **Length:** at most 5 stops by default; "the full round" allows up to 9.

**The line template** (EN): `{Place}: {what, one number}; {why it matters / compared with}.`
- An illustrative example with made-up figures: "Kasimedu: fourteen open sewage complaints, the oldest twelve days; the most in North Chennai this week."
- Lines come from code templates over facts, which is fast and has no model error. A single model call to polish all lines is optional, and each polished line must pass the same per-sentence check as §5.4.
- Captions use `Shot.caption_en/ta`.

**Behaviour:**
- **Order:** the most important stop first (inverted pyramid, B), the rest by nearest neighbour from it.
- **Barge-in:** "stop" or "next" must cut speech. Measure the time from the word to silence, p50 and p90.
- **Reduced motion:** jumps instead of flights, already in `camera.ts` (B: repo).

### 5.4 The news brief, and the checks before speaking (M)

**Facts come from code**, then **one streamed model call writes the brief** (v7's aide pattern, B: repo `docs/jarvis/JARVIS_V10.md` §4.5). The output is JSON lines, one per sentence:

An illustrative example: the outlet, place and figures are placeholders, not a real report.

```json
{"role":"what","text":"<Outlet> reports sewage overflowing at the <bus stand> since Monday.","facts":["s1","s2","s3"]}
{"role":"why_local","text":"It is the zone's main bus terminus, used by thousands each day.","facts":["g4"]}
{"role":"console","text":"Four open sewage complaints sit within 500 metres, the oldest twelve days, all with the zone's AE.","facts":["c1","c2","c3"]}
{"role":"offer","text":"Shall I show them on the map, or draft a note to the AE?","offer":["map","draft"]}
```

Facts carry ids:
- story facts `s*`: outlet, published_at, place, event, numbers, claim flags;
- gazetteer and place facts `g*`;
- console facts `c*`: counts, oldest age, office, rain readings.

**Shape**
- At most 4 sentences, in the order what, why_local, console, offer.
- Each sentence is ≤ 20 English words (B, §2.5) and ≤ 7 s when spoken. Measure characters per second for Tamil with the fixed voice.

**Checks, run on each sentence in code before it goes to text-to-speech:**
1. **Numbers.** Every numeral or number word, in English or Tamil, equals a number in the sentence's cited facts. Rounding is allowed only after "about", "nearly", "over" or "almost", to two significant figures. This follows broadcast style (B).
2. **Names.** Every place, outlet, department or office the lexicon finds in the sentence is in the cited facts. Nothing new may appear.
3. **Time.** Time words agree with `published_at` and the current time. Never say "today" for a story more than 24 h old. Past 48 h, say the weekday or "n days ago". The News Manual warns that a stale date in the intro dates the story (B).
4. **Attribution.** If a cited fact has `claim: true` (an allegation, a demand, an official statement), the sentence names the outlet or speaker *before* the claim (B).
5. **Language.** The sentence is in the requested language: at least 70% Tamil-script letters for Tamil, names and numbers excepted.
6. **The offer** must come from the allowed set: map, draft, follow, read fully, the rain gauges.
7. **NLI, optional, in the sidecar.** HHEM ≥ 0.5 for English, and mDeBERTa entailment ≥ 0.5 with contradiction < 0.3 for Tamil, both against the cited facts' text (B for the models). Tune the thresholds on about 100 labelled sentences.

**When a check fails**
- A failed sentence is dropped, never spoken.
- If the `what` sentence fails, speak the safe template "<Outlet> reports: <headline>", from code fields, in the requested language.
- The checks must cost < 5 ms per sentence in code. NLI runs while the previous sentence is being spoken.

**News to action** (feature 1):
- **Place:** the most specific gazetteer match (landmark, then locality, then ward, then zone). If there is none, say "I can't place this story on the map" and skip the console sentence.
- **Radius and window:** the same "near" defaults as §5.2. Count cases open now, or opened in the 30 days before `published_at`.
- **Category:** a reviewed table from news topic to complaint categories, for example:
  - sewage → UGD and sewerage;
  - water protest → water supply;
  - garbage → solid waste;
  - waterlogging → storm-water drains.
- **Zero results:** "None logged within 500 metres in the last 30 days. Under-reporting is common, so that may not mean all is well." (B: the under-reporting study)

**"Read it fully"**
- Read the original paragraphs, with no model involved. Announce the length first ("about two minutes; say stop any time").
- Check in after every three paragraphs. "Skip", "stop" and "repeat" always work.
- For another language, translate paragraph by paragraph and start speaking after the first.

---

## 6. What I could not confirm
- How Apple Voice Control handles two items with the same name: not in Apple's Mac or iPhone guides as fetched.
- The languages of Windows Voice Access's natural-language commanding: not stated in Microsoft's history page.
- Serenade's spoken commands and its custom-command template syntax: its docs were not reached.
- How Rango breaks ties between equal text matches: not described.
- The numeric "near" thresholds in the 2022 COSIT paper: the PDF was unreadable here; pdftoppm and pypdf are not installed, and I installed nothing. The 2001 IJGIS and 2005 "How far is near?" findings come from search summaries only.
- Eviza's defaults and widgets: the Tableau page returned 403, so I have only search-result quotes.
- The Reuters Institute report's details on ideal briefing length: the PDF was unreadable; only the institute's page and a summary were read.
- Licences:
  - Bespoke-MiniCheck-7B's licence (CC BY-NC per a search summary);
  - whether IndicTrans2's Hugging Face or Fairseq downloads are gated;
  - padacioso's licence;
  - OSRM's licence.
- CPU latency for MiniCheck and for mDeBERTa on one short pair, and mDeBERTa's accuracy on Tamil. None is published; measure them.
- Whether Leaflet 1.9.4's docs give the same `moveend`/`zoomend` semantics as the 2.0-beta reference I read. Likely, but check `node_modules`.
- That Home Assistant's Tamil suffix templates fail on fused forms such as படுக்கையறையில். This is my reading of hassil and was not tested.
- The Tamil and Tanglish phrasings in §5.2 and §1.6 are mine and need a native speaker's review.

---

## 7. Recommendations for Jarvis v10

1. **Build the control registry** (`voice/controls.ts`, §5.1) and put `data-voice` ids on every console control: Ask the Map, the panels, the Stage. Each control needs names in `en`, `ta` and `tl`, with the visible label first. Its `level` must agree with `reach.ts`'s `ACTION_LEVEL`. Keep `data-jarvis-never`.
2. **Add the coverage test** (§5.1, all four parts) and put it in the QA gate. It walks every console state, fails on any visible control with neither a voice id nor a skip reason, runs axe's naming rules, does a round trip from sample sentences to ids in three languages, and runs sampled Playwright smoke checks.
3. **Replace `byName()`'s shortest-name tie-break** with scores and a margin. Act at s1 ≥ 0.80 with a margin of 0.10. Otherwise ask "Which one?", name up to three candidates by region, and number only those. Never guess.
4. **Add "show names", "what can I say here?", "call this X" and a 3×3 map "show grid".** Keep "show numbers" as the fallback for everything else.
5. **Put a normalisation pass before all grammar matching:** NFC; Tamil-script loanwords to English tokens (நியூஸ், மேப், லேயர், ஜூம், எக்ஸ்போர்ட்…); Tanglish clitics split off; light verbs mapped to `<do>`. It is a single function with its own tests, and every lane uses it.
6. **Adopt hassil's YAML template format** for console and map commands, matched by a small in-process TypeScript matcher, with lists filled from live data. Generate the inflected Tamil forms of every place, layer and control name into list `in` alternatives at build time, and have a Tamil speaker review the generator. Use Python hassil only offline in CI (`sample`, `count_sentences`). Nothing may depend on the sidecar.
7. **Map grammar** (§5.2): the 15 intents listed, plus the spatial parser for distance, relation and anchor. "Near" radii are chosen in code by anchor type (500 m for a point, a 1 km buffer for a large polygon), always said back with "wider/closer" (×2, ÷2), clamped to 50 m – 10 km. Never let the model choose a radius.
8. **Narrated tour** (§5.3): a playlist of stops with a state machine, one line per stop of ≤ 20 words or ≤ 7 s, speech starting with the flight, a 1.5 s hold, a check-in after 3 stops, at most 5 stops by default. Tour commands are scoped to `tour.active`. "Go deeper here" opens Ask the Map scoped to the stop. Measure barge-in latency.
9. **News brief** (§5.4): four roles in order, at most 4 sentences, JSON with fact ids per sentence. The seven checks run in code before text-to-speech; NLI (HHEM for English, mDeBERTa for Tamil) runs only when the sidecar is up. A failed sentence is dropped, and the `what` sentence falls back to "<Outlet> reports: <headline>".
10. **"Read it fully" and another language:** the original paragraphs, announced length, a check-in every 3 paragraphs, stop, skip and repeat. Across languages, translate the facts, not the prose, take names from the lexicon, give quotes as attributed reported speech, and translate paragraph by paragraph while speaking.
11. **News to action:** gazetteer place → complaints within radius and window → a category table → one line with count, oldest age and the responsible office → an offer to show them on the map or draft a note (tray). Always add the under-reporting caveat when the count is zero.
12. **Field visit:** Ask the Map plan → `visitOrder` → a card with the Google Maps link. Keep ≤ 9 waypoints and ≤ 2,048 characters, and warn that a phone *browser* keeps only 3 (split into two links if needed). Say "in straight lines". Send no coordinates to any third-party router. Drafts only; the Collector sends.
13. **Proactivity policy:** offer, don't interrupt. Speak unprompted only for safety or an emergency (cyclone or heavy-rain alerts), and never while side talk is detected. The morning round is a one-line offer at the first wake of the day.
14. **Measure:**
    - voice coverage per console state, with a target of 100% voice id or skip reason;
    - sample-sentence success per language;
    - the rate of "Which one?" questions, and the wrong-control rate (target 0);
    - command-to-screen p50 and p90;
    - tour line seconds, and barge-in latency;
    - brief sentences dropped by the checks.

    Report all of them in RESULTS v10.
