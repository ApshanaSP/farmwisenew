# 40 · Spoken style beside a screen, and briefing style

Jarvis v7 research, 17 Nov 2026. The question is how a voice answer that sits beside the dashboard should sound when the Collector asks "tell me about this news" or "tell me about the Adyar issue".

**How this was researched.** 11 web searches and fetches. Fully read: Google's conversational-components page, LiveKit's prompting page, and the first 100K characters of OpenAI's Realtime prompting guide (the rest of that page is base64 audio and was not read). Search excerpts only: Amazon Alexa, the broadcast-writing guides, BLUF and the Tamil sources. One fetch was refused with HTTP 403 (cwi.pressbooks). Not searched: Apple's guidance, Tamil TTS and code-mixing norms, LLM-judge papers.

**Markers.** **(B)** = read in the source page in this run. **(B-x)** = read in a search excerpt that quotes the page; the page itself was not opened. **(M)** = my inference, not from a source. No figure appears here that was not read, except in the example answers, which are invented and marked as such.

---

## Summary

1. **The platforms agree that the screen complements the voice and does not repeat it.** Amazon says the screen should "complement the audio, not mimic it". Google says content moves "out of the spoken prompts and into the display prompts, chips, and visuals". So Jarvis's job is to give the point and let the screen hold the details.
2. **Voice-agent prompt guides agree on plain text, brief answers and one question at a time.** LiveKit's default is "one to three sentences". The owner's 2-4 sentences fits that, with room for one more sentence in a brief.
3. **Executive briefing means BLUF, the bottom line up front.** Broadcast writing adds three rules for the ear: say who is speaking before the claim ("City engineers say..."), keep each sentence short with one idea, and spell numbers out the way people say them.
4. **Recommended order for each answer** (M): the point, why it matters to the district, what is being done or what is stuck, and what needs the Collector (or "nothing needs you yet").
5. **Tamil is diglossic.** The formal literary register is what people write and use in formal speech; the colloquial register is spoken face to face. For a voice brief to a senior officer I suggest polite spoken Tamil, keeping English administrative words as they are (M, not checked by a Tamil speaker).
6. **Prompt craft.** Models copy sample phrases closely (OpenAI), so few-shot examples need a variety rule as well. LiveKit pairs each rule with an example and repeats key rules in more than one section.
7. **Testing.** Read every answer aloud through the TTS (Google). Run automatic checks for lists, labels, IDs, sentence count and text copied from the screen (`src/lib/thunai/speechcheck.ts` already flags labels and copied runs). Add a rubric judge and a paired comparison against v6 (M).

---

## 1. Voice beside a screen: what to say and what to show

| Claim | Source | Mark |
|---|---|---|
| Amazon wanted the screen to "complement the audio, not mimic it". Like a presentation, the point "wasn't about having Alexa just speak out what you see on the screen". | https://developer.amazon.com/blogs/alexa/post/5e4f3bb2-6ada-4121-bf97-347eb78f92fd/new-alexa-skill-sample-learn-multimodal-skill-design-with-space-explorer | B-x |
| A multimodal experience "should always complement a voice-first experience"; the core functions should work without a screen. | https://developer.amazon.com/en-US/alexa/alexa-haus/multimodal-introduction | B-x |
| What is on screen "should always be in harmony with what Alexa is saying" and should not distract from the voice. | An Amazon APL design post, one of: https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2018/11/10-tips-for-designing-alexa-skills-with-visual-responses or https://developer.amazon.com/blogs/alexa/post/5959e319-1656-40cb-b689-b35c988d6b91/how-to-design-visual-components-for-voice-first-alexa-skills (the excerpt did not say which) | B-x |
| The voice response should carry "an appropriate hierarchy of information" (written for screen-reader users). | https://developer.amazon.com/blogs/alexa/post/3b3aa3c7-a9cd-4b2d-ac3d-473eb6075173/alexa-skills-for-everyone-how-to-design-an-inclusive-voice-experience | B-x |
| One-breath test: when listing options, use "brevity, arrangement, and pacing"; give a short lead-in and pause between items. | https://developer.amazon.com/blogs/alexa/post/531ffdd7-acf3-43ca-9831-9c375b08afe0/things-every-alexa-skill-should-do-pass-the-one-breath-test | B-x |
| Offer only one to a few options at a time, depending on how long or complex they are. | https://developer.amazon.com/alexa/alexa-haus/design-principles/be-brief | B-x |
| On devices with both voice and screen, "pieces will move out of the spoken prompts and into the display prompts, chips, and visuals". A confirmation can be dropped when the user can see a visual of the item. | https://developers.google.com/assistant/conversation-design/conversational-components-overview | B |
| Display prompts: a 640-character limit per turn, with "300 characters or less" recommended. | same page | B |
| Google's pages favour crisp, user-focused text and recommend listening to each spoken prompt in TTS. | https://developers.google.com/assistant/conversation-design/language , https://developers.google.cn/assistant/conversation-design/write-sample-dialogs (the excerpt did not say which page said which) | B-x |
| Salesforce's conversation-design guide: at most two sentences per message. | https://v1.lightningdesignsystem.com/guidelines/conversation-design/language-and-style | B-x |

**What follows for Jarvis (M).**
- The dashboard is the display prompt and Jarvis's speech is the spoken prompt. Anything already visible (names, IDs, statuses, every row) should move out of the speech.
- A list on screen gets a reference in speech, not a recital: "five zones are affected; Adyar is the worst."
- The one-breath idea suggests that even a needed spoken list should hold at most two or three items.

## 2. Prompting LLM voice agents

| Claim | Source | Mark |
|---|---|---|
| "Respond in plain text only. Never use JSON, markdown, lists, tables, code, emojis, or other complex formatting." | https://docs.livekit.io/agents/start/prompting | B |
| "Keep replies brief by default: one to three sentences. Ask one question at a time." | same | B |
| "Spell out numbers, phone numbers, or email addresses." "Avoid acronyms and words with unclear pronunciation, when possible." | same | B |
| Suggested prompt sections: identity, output formatting, tools, goals, guardrails and user information. Pair each realism rule with concrete examples, and reinforce rules across several sections. | same | B |
| If an agent sounds robotic, look at the system prompt before blaming the model or the TTS. | https://livekit.com/blog/prompting-voice-agents-to-sound-more-realistic | B-x |
| Pipecat has a `MarkdownTextFilter` that strips markdown before TTS. | https://docs.pipecat.ai/learn/text-to-speech | B-x |
| Every sentence the LLM writes becomes audio the user has to listen to. | https://docs.rime.ai/docs/pipecat | B-x |
| "The model strongly closely follows sample phrases." Add a "Variety rule to reduce robotic phrasing." "Pin output to a target language if you see unwanted language switching." Use "clear, labeled sections" in the prompt. | https://developers.openai.com/cookbook/examples/realtime_prompting_guide | B (first 100K characters only) |

The OpenAI guide's Length, Pacing and number-reading example sections lay in the unread part of the page, so nothing from them is cited here.

**What follows for Jarvis (M).**
- Strip markup in code as a safety net, as Pipecat does, and still forbid it in the prompt.
- Examples will be copied word for word, so give several, vary their openings, and say "do not reuse these sentences".

## 3. Briefing a principal: BLUF, so-what, writing for the ear

| Claim | Source | Mark |
|---|---|---|
| BLUF means opening with the key information. The phrase comes from US Army correspondence rules (AR 25-50). The Air Force's Tongue and Quill advises "get your bottom line up front (most of the time)". | https://en.wikipedia.org/wiki/BLUF_(communication) | B-x |
| Following AR 25-50: state the purpose and main point up front. | https://plainlanguage.gov/media/actionoff.pdf | B-x |
| Broadcast copy puts attribution first: listeners "need to know who was speaking before they can judge what was said". Print's "The bridge is structurally unsafe, according to city engineers" becomes "City engineers say the bridge is structurally unsafe." | Broadcast-writing guides found together; the excerpt was not mapped to one page: https://thenewsmanual.net/Manuals%20Volume%202/volume2_48.htm , https://edis.ifas.ufl.edu/publication/WC193 , https://people.bethel.edu/~socsco/BCastWriting/BroadcastBasics.html , https://www.dinfos.dma.mil/Portals/66/Documents/Academics/BOMD/2015%20DINFOS%20Broadcast%20Writing%20Style%20Guide.pdf | B-x |
| Short sentences, each with one idea. Scripts should sound like everyday speech. Read the copy aloud to check timing and flow. | same set | B-x |
| Numbers for the ear: write "500-thousand-dollar grant" and never "$". Spell out a number that starts a sentence. | same set | B-x |

Not found in this run:
- The "What / So what / Now what" framing did not appear in any result. I use it below as a mnemonic only (M).
- The inverted pyramid and how a private secretary or chief of staff briefs a principal were not researched. What follows is my synthesis (M).

**What follows for Jarvis (M).** A top aide's brief is BLUF applied to speech:
1. **What:** the one-line state of play.
2. **So what:** why it matters to this district now, such as risk, deadline, public anger or money.
3. **Now what:** who is acting, and what is stuck and on whom.
4. **Ask:** the single thing that needs the Collector, or an explicit "nothing needs you yet".

The aide filters. They never list everything they know; they offer more ("the zone-wise split is on screen").

## 4. Summarising news for a decision maker (M, built on sections 1 to 3)

- **Keep:** the event, its effect on this district, the actions under way and the blocker, and one open question if it changes a decision.
- **Drop:** the background the Collector already knows, every name on a list, quotes, and exact figures unless the figure is the point.
- **Attribute by voice** (B-x pattern from section 3): start with the source, as in "The Hindu reports...", "Metrowater says..." or "According to the ward engineer...". Present a single-source claim as reported, not as fact.
- **Conflicting reports:** use one sentence to say that the sources differ and how ("The Hindu says forty families, the corporation says twelve"). Then say which one is official, or what would settle it. Do not average the figures, and do not pick one silently.
- **Stale or thin news:** say its age when that matters ("this is from Tuesday") and what Jarvis cannot see.

## 5. Tamil and Tanglish

| Claim | Source | Mark |
|---|---|---|
| Tamil is diglossic. Spoken Tamil is used face to face and informally. Written Tamil is used in formal speech and in writing, and spoken Tamil is not generally written. | https://sites.la.utexas.edu/tamilscript/?p=190 | B-x |
| A 2024 analysis argues that the formal and colloquial registers are currently mutually unintelligible, partly from Sanskrit loanwords and partly from sound change. | https://ojs.ub.uni-konstanz.de/jsal/index.php/fasal/article/view/312 | B-x |
| IruMozhi (NAACL Findings 2024): Literary Tamil is preferred in writing and formal communication, and Spoken Tamil is confined to speech and informal media. Spoken Tamil is under-studied in NLP. | https://aclanthology.org/2024.findings-naacl.195.pdf | B-x |

None of the following was found in this run, so the suggestions here are all (M) and need a Tamil speaker's check.

- **Register:** a briefing to a Collector is formal in respect but spoken in mode. Pure written centamil verb forms, such as "செய்யப்பட்டுள்ளது" or "பின்வருமாறு", sound like a press note being read out. Casual colloquial sounds disrespectful.
  - Aim for polite spoken Tamil: honorific forms ("இருக்காங்க", "சொன்னீங்கன்னா") with "சார்" at most once.
  - Use plain spoken verbs ("நடக்குது", "நின்னுருக்கு") rather than "நடைபெற்று வருகிறது".
- **Code-mixing:** officials in Chennai say "Collector", "zone", "ward", "tender", "Metrowater", "PWD" and "GO" in English. Keep those English, and keep place names in Tamil.
- **Tanglish questions:** answer in Tamil script with the English terms kept, unless the user plainly wants English.
- **Numbers for TTS:** write numbers as Tamil words ("ரெண்டு மடங்கு", "நாற்பது") or round them, rather than digits. Avoid "%", "₹" and abbreviations in Tamil text. Test with the actual Tamil TTS voice: none of this is verified for it.
- **Language choice:** follow the language of the question, and pin it in the prompt (OpenAI's language-pinning tip, section 2, B).

## 6. Writing the prompt and testing whether it sounds human

**Prompt (M, building on the section 2 B rows).**
- Use labeled sections: Role, Who you serve, Screen contract, Answer shape, Output rules, Language, Examples.
- Put the screen contract first. Pass the visible items as `ON_SCREEN` and tell the model: "the Collector can see this; never read it out; refer to it."
- Give 4-6 good/bad pairs, with each bad version labeled with why it is bad. Vary the good openings, and add "do not reuse these sentences".
- Restate the length cap and the "no lists" rule in both the Output rules section and the Examples section, as LiveKit's reinforcement advice suggests.

**Banned patterns** (M):
- Three or more proper names in a row, as in "Adyar, Teynampet, Kodambakkam...".
- Field labels such as "Status:", "Priority:", "Category:" or "Zone:".
- Ticket or record IDs, row-by-row reading, and "item one... item two".
- Openers: "Here is a summary", "According to the dashboard", "Certainly", or restating the question.
- Raw timestamps, decimals and units that TTS mangles.

**Tests** (M):
1. **Automatic checks.** Extend `speechcheck.ts`, which already flags labels and copied six-word runs, with these:
   - sentence count of 4 or fewer;
   - word count of about 70 or fewer in English;
   - a name-list detector that flags three or more names or zones in one answer;
   - digits and IDs;
   - an "overlap with ON_SCREEN" ratio.
2. **Rubric judge.** A different model from the one answering scores 1-5 with anchored descriptions on six criteria:
   - leads with the point;
   - says why it matters;
   - gives the action or blocker;
   - names the ask or "none";
   - does not read the screen;
   - sounds like a person speaking.
   Report each criterion separately rather than one score.
3. **Paired preference.** Compare v7 against v6 on the same items, with the order randomised.
4. **Listen.** Run 20 items through the TTS, as Google advises (section 1), and have the owner mark each one "would my PA say this?".

---

## Recommendations for Jarvis v7 (ranked)

1. **Fix the answer shape to Point, then So what, then Now what, then Ask, in 2-4 sentences.** Sentence one must stand alone, because it is streamed first. End with what needs the Collector, or say plainly that nothing does. This is BLUF (section 3) plus the platforms' brevity rules (sections 1-2).
2. **Add a screen contract to the prompt and to the code.** Pass what is visible as `ON_SCREEN`, forbid reading it, and refer to it instead ("the zone-wise list is on screen"). Allow at most two named places, people or figures per answer. This applies Amazon's "complement, not mimic" and Google's speech-to-display shift (section 1).
3. **Adopt LiveKit-style output rules:** plain text, no lists or labels, numbers said as words and rounded, no symbols. Keep a markdown and symbol strip before TTS as a safety net (section 2).
4. **Use broadcast attribution for news.** Name the source first ("The Hindu reports..."), present a single source as reported, and handle conflicting reports in one sentence (sections 3-4).
5. **Add few-shot good/bad pairs in English and Tamil, plus a variety rule and a language pin.** Models copy samples closely (OpenAI, section 2).
6. **Use polite spoken Tamil, not written centamil.** Keep English administrative terms and write numbers in Tamil words (section 5, M). Get a Tamil speaker to review the Tamil examples before shipping.
7. **Gate the style with checks.** Extend `speechcheck.ts` with sentence count, name lists, IDs and screen overlap. Add a rubric judge and paired comparison against v6, and run a 20-item listening check by the owner (section 6).

### Draft style guide for the prompt (about 12 rules)

1. Open with the point in one plain sentence that makes sense on its own.
2. Say 2-4 sentences, about 70 words at most. Each sentence carries one idea and stays under about 20 words.
3. Follow this order: what is happening, why it matters to the district now, what is being done or where it is stuck, and what needs the Collector. If nothing does, say "nothing needs you yet".
4. The Collector can see the screen. Never read out lists, rows, field names, IDs, statuses or counts that are visible. Point to them instead ("the ward list is on screen").
5. Name at most two places, people or figures. Group the rest ("five southern zones", "most coastal wards").
6. Say numbers as a person would: rounded and in words ("about forty", "nearly double", "since Tuesday"). Be exact only when the exact number is the point.
7. Start a report with its source: "The Hindu reports...", "Metrowater says...". Something reported is not something confirmed.
8. If sources disagree, say so in one sentence, give both claims, and say which one is official or what would settle it.
9. Use plain spoken text only: no markdown, bullets, emojis, brackets, symbols or unexplained abbreviations. Say "rupees", "crore" and "per cent".
10. Speak like a trusted senior aide: direct and calm. Do not open with filler, restate the question, or stack hedges. Make at most one recommendation.
11. Answer in the language of the question. For Tamil or Tanglish, use polite spoken Tamil, keep English administrative words in English, and write numbers as Tamil words.
12. If something is unknown, say what is missing in one sentence and what you can check. Never pad. Vary your openings, and never reuse the example sentences.

### Example pairs (invented situations and figures, for illustration only)

**A. Incident. "Tell me about the Adyar issue."**
- BAD: "The Adyar issue has the following details. Status: open. Priority: high. Affected zones: Teynampet, Kodambakkam, Adyar, Alandur and Perungudi. Complaint ID ADY-2291 was raised on 12-11-2026 at 09:42..."
  - Why it is bad: it reads the screen, gives a list of names, field labels, an ID and a raw timestamp.
- GOOD: "Sewage is still getting into the Adyar near the Saidapet bridge, and complaints have roughly doubled this week. With the rains close, that stretch is the one most likely to flood. Metrowater has the fix ready but is waiting on PWD clearance for work in the river. A word from you to the PWD Chief Engineer would unblock it."

**B. News. "Tell me about this news."**
- BAD: "Headline: Government orders desilting. The article says that the districts Chennai, Tiruvallur, Kanchipuram, Chengalpattu... must complete desilting of 1,248.6 km of drains by 30-11-2026..."
- GOOD: "The Hindu reports that the state wants every district to finish desilting its stormwater drains by the end of the month. For us the pressure is in the southern zones, which are furthest behind. Work has started, but there are not enough contractors. You may want a quick review with the zonal officers this week."

**C. Comparison. "How is Tondiarpet doing compared to Adyar?"**
- BAD: "Tondiarpet: open 212, closed 340, average days 6.4. Adyar: open 118, closed 401, average days 4.1..."
- GOOD: "Adyar is clearing complaints faster, but Tondiarpet's backlog is nearly twice as big. Most of Tondiarpet's pile is drainage work waiting on one contractor. Nothing needs you yet. I'll flag it if the backlog is still growing next week."

**D. Tamil (model-drafted, not checked by a Tamil speaker). "Adyar issue pathi sollu"**
- BAD (written centamil, reads the screen): "அடையாறு பிரச்சினை குறித்த விவரங்கள் பின்வருமாறு: நிலை: திறந்த நிலை. முன்னுரிமை: உயர். பாதிக்கப்பட்ட மண்டலங்கள்: தேனாம்பேட்டை, கோடம்பாக்கம், அடையாறு, ஆலந்தூர், பெருங்குடி. புகார் எண் ADY-2291."
- GOOD: "சார், சைதாப்பேட்டை பாலம் பக்கத்துல அடையாறுல இன்னும் கழிவுநீர் கலக்குது; இந்த வாரம் புகார்கள் கிட்டத்தட்ட ரெண்டு மடங்கு ஆயிடுச்சு. மழை நெருங்குறதால அந்த இடம் தான் முதல்ல வெள்ளம் வர வாய்ப்பு அதிகம். Metrowater வேலைக்கு ரெடியா இருக்காங்க, ஆனா ஆத்துக்குள்ள வேலை செய்ய PWD அனுமதிக்காக காத்திருக்காங்க. நீங்க PWD Chief Engineer-கிட்ட ஒரு வார்த்தை சொன்னீங்கன்னா வேலை நகரும்."
