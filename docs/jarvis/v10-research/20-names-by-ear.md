# 20. Names said by ear: matching what speech-to-text writes to the names Jarvis knows

Written 19 Nov 2026 for the v10 build (JARVIS_V10.md 4.2, "Names said by ear"). The research used public documentation, papers, model cards and package registries. It also ran read-only experiments on this laptop against the worktree's own code and models. No account was made, no paid API was called, no audio or text was sent to any service, and no `.env` file was opened. This file is the only file written in the repository. Earlier work is not repeated here: `docs/jarvis/v8-research/40-tamil-matching.md` (18 Nov) covers Tamil case endings, the loose key and licence checks, and `10-sarvam-catalogue.md` covers Sarvam's keyterms and its transliterate API.

**Marks.**
- **(B)** I read it in the linked source on 19 Nov 2026.
- **(M)** It is my own inference, design or arithmetic.
- **(M, measured)** It is my own measurement on this laptop: AMD Ryzen 5 5600H (12 threads), 15 GB RAM, Windows 11, Node 24.21, Python 3.14.7. The method is given next to each measurement.

**What the code measurements ran against.** Worktree HEAD `e6655d37` with the uncommitted working copies of `src/lib/thunai/v10/phon10.ts` (sha1 `fd73c18a`) and `v10/entity10.ts` (sha1 `d3647ad3`), around 15:30 on 19 Nov. Another session was editing these files at the time, so re-run the tests in 7.4 before trusting the pass/fail column.

Contents: 0 Summary · 1 The failures, mechanism by mechanism · 2 Phonetic algorithms (a) · 3 Transliteration both ways (b) · 4 Cross-lingual meaning (c) · 5 Entity linking, confidence and "did you mean" (d) · 6 JS/TS libraries (e) · 7 The design to build from · 8 Recommendations for Jarvis v10 · 9 Not confirmed · 10 Sources

---

## 0. Summary

1. **The listed failures come from about eight mechanisms, each with a known fix (M):**
   - v and w are one sound in Indian English and in Tamil, which explains Aquan, Akvan and Akwan.
   - Tamil script does not mark voicing: க is k or g, and த is t or d. This explains ராஜவுகாந்தி for Rajiv Gandhi.
   - The speech-to-text adds or drops vowels (saikilon for cyclone, Kodungayur for Kodungaiyur).
   - It cuts long names short (Palikan for Pallikaranai).
   - It splits and joins words (Kasi medu, ராஜவுகாந்தி).
   - "chr" is said /kr/ (Chronical, Crompet).
   - Indian English is variably rhotic, so "first" can be heard as "fast".
   - English loanwords get written in Tamil script.
2. **No classical phonetic key covers these cases (M, measured: section 2.2).** On 11 must-match pairs:

   | Key | Pairs it gets right (of 11) | False matches (of 12 must-not pairs) |
   |---|---|---|
   | Caverphone 2 | 7 | 0 |
   | Double Metaphone | 6 | 0 |
   | Soundex | 5 | 1 |
   | Metaphone | 4 | 0 |
   | NYSIIS | 2 | 0 |
   | NYSIIS, cut to 6 letters | 4 | 4 |
   | Match Rating Approach | 11 | 10 |
   | v10's own `earKey` | 8 exact, 10 within 0.84 by `phraseSim` | 0 |

   Beider-Morse covers only European languages and Hebrew (B). Metaphone 3 cannot be ported (B). IndicSOUNDEX is weakest on Tamil: it matched 58.79 % of Tamil Indic/Latin name pairs against 95.71 % for all languages, and its Tamil errors are voicing errors (B).
3. **The v10 entity layer is close; its gaps are in coverage, not in the key (M, measured: 5.6, 7.4).**
   - On my first test list: must-match 28/34 and must-not 29/29. One of the six misses, "fast news" read as an outlet, is not an entity case and is left out of 7.4.
   - Against a 279-entry lexicon built from the 250 district areas: must-match 27/33 (two of the misses are only duplicate spellings in my test harness), must-not 31/31, and `findMentions` takes 1.9 ms at p50 and 8.7 ms at p90.
   - What fails:
     - Truncation: Palikan scores 0.864, and a place said alone has no ask band.
     - Short names: Ennur and Adayar need aliases.
     - "chr": Crompet and Kronikal.
     - Entities with no Tamil-script spelling: Tamil letters are deliberately not matched across scripts without a class word.
     - Outlet names that contain English words or stopwords: "Polymer news".
4. **Transliteration (B/M).** Match in key space and do not generate surface variants at run time. Generate Tamil-script spellings offline, once per entity, so that Tamil speech matches within the script: ear-key similarity between such spellings is 0.96–1.0 (M, measured).

   | Tool | Licence | What it is |
   |---|---|---|
   | IndicXlit | MIT | About 11M parameters. Tamil top-1 on named entities: 42.12 English→Tamil, 35.46 Tamil→English (B) |
   | `@indic-transliteration/sanscript` | MIT | Scheme conversion only |
   | Aksharamukha | AGPL-3.0 (Python); the npm build is GPL-3.0-only and 16.8 MB | Pyodide build in the browser |
   | AnyAscii | ISC | Drops Tamil inherent vowels |

   No offline Google option fits this Windows laptop (M): Nisaba's documented builds are Linux and macOS (B), and the offline Input Tools installer is reported discontinued (not confirmed).
5. **Embeddings tell topics apart but not names (M, measured: 4.3).** The repository's own multilingual-e5-base (q8 ONNX) runs in 9–12 ms a query here. The right headline beat the best wrong one by only −0.015 to +0.049. It ranked wrong first:
   - for a Tanglish request;
   - for "Murasar saikilon" (or only 0.001 ahead, depending on prefixes).
   
   A Tamil-script request rates an unrelated Tamil headline about as high as the right English one. Use it as a second ranker only: after the entity is resolved, or for requests that name nothing.
6. **Production assistants confirm when unsure (B).**
   - Alexa returns a match, no match, or several values.
   - SiriKit has three outcomes: success, confirmation required, and disambiguation.
   - Rasa uses a confidence threshold plus an ambiguity threshold, then asks the user to confirm.

   Keep v10's starting thresholds (sure 0.90; 0.84 beside a storm's class word; ask from 0.80; a tie within 0.03 is asked). Add a truncation rule that only ever asks (0.88). Then calibrate on the dev set so that "sure" is right at least 98 % of the time (M).

---

## 1. The failures, mechanism by mechanism

| Heard (as the speech-to-text wrote it) | Meant | Mechanism | Evidence | Fixed by |
|---|---|---|---|---|
| Cyclone **Aquan** | Akvan / Akwan (both in the news) | qu = /kw/; v and w are one sound for most Indian speakers | "Most Indian languages do not differentiate between /v/ and /w/" (B, [Indian English](https://en.wikipedia.org/wiki/Indian_English)) | key: q→k, w→v (`earKey` does this) (M) |
| **Murasar Saikilon** | Cyclone Murasu | a class word heard as a Tamil speaker says it: the diphthong written "ai", and an i put into the "cl" cluster; the name's last syllable heard as "-ar" | Tamil adds vowels to English clusters (M) | a class-word lexicon matched by ear; the name matched with the class word lowering the bar (M) |
| **Palikan** | Pallikaranai | the name cut short; the last syllable garbled | v8 note 1.2 (B, internal) | a cut-off rule; ask, never "sure" (M) |
| **ராஜவுகாந்தி நகர்** | Rajiv Gandhi Nagar | an English-origin name in Tamil script: voicing not written (க is k or g, த is t or d), "v" given an epenthetic u, two words joined | Tamil IndicSOUNDEX errors are "k vs. g", "t vs. d" (B, [IndicSOUNDEX](https://cdn.amazon.science/86/4e/ebc49f01492d89307dbb45d0faf2/indicsoundex-algorithm-for-text-matching.pdf), Table 6) | romanise, then a voicing-blind key on the joined words (M) |
| **Kodungayur** | Kodungaiyur | the ai/ay glide before y | (M) | `aiy` → `ay`; y between vowels dropped (M) |
| **Kasi medu** | Kasimedu | one word split in two | (M) | match spans joined (M) |
| **Deccan Chronical** | Deccan Chronicle | an unstressed vowel spelt another way | (M) | a vowel-blind key (M) |
| **Crompet**, **Kronikal**, **க்ரோனிக்கிள்** | Chromepet, Chronicle | "chr" is /kr/; `earKey` folds ch→s | (M, measured: 2.2, 7.4) | chr→kr before the key (M) |
| **fast news** | first news (the first story) | the NURSE vowel, and r dropped after a vowel | Indian English "is variably rhotic"; NURSE is ə(r), ʌ(r) or ɜ(r) (B, [Indian English](https://en.wikipedia.org/wiki/Indian_English)) | a command word, not an entity. v10 already routes it: commit `fdf8f41b` reads "'fast news' is the first" (B, git log). See recommendation 7 |

---

## 2. Phonetic algorithms (a)

### 2.1 The algorithms

| Algorithm | Origin | What the code looks like | Fit for Indian names | Mark |
|---|---|---|---|---|
| Soundex (American) | Census name index; Russell's patent | first letter + 3 digits; vowels, h, w and y dropped | very coarse, and the first letter is kept as written, so Saikilon (S245) ≠ Cyclone (C245) | census use, truncation and "many false hits" (B, [BMPM paper](https://stevemorse.org/phonetics/bmpm.pdf)); the letter rules and fit (M) |
| Metaphone | Philips, 1990; 16 consonant symbols, vowels only at the start | e.g. KRNKL | English spelling rules; keeps W before a vowel, so Akwan (AKWN) ≠ Akvan (AKFN) | (B, [Metaphone](https://en.wikipedia.org/wiki/Metaphone)); fit (M) |
| Double Metaphone | Philips, *C/C++ Users Journal*, June 2000; primary + secondary code ("Smith" SM0/XMT, "Schmidt" XMT/SMT) | full-length in `double-metaphone` (its README shows 8-letter codes) | handles several languages' spellings of English-world names; v→F but w dropped (Akvan AKFN ≠ Akwan AKN); TH→0 (theta) | (B, [Metaphone](https://en.wikipedia.org/wiki/Metaphone), [double-metaphone](https://github.com/words/double-metaphone)); fit (M) |
| Metaphone 3 | Philips, Oct 2009; "approximately 99% for English words"; sold commercially as source code; v2.5.4 (Mar 2015) | — | Version 2.1.3 is BSD inside OpenRefine, but the author "doesn't want that code used for ports to other languages", and Abydos refused to add it. Not usable here | (B, [Metaphone](https://en.wikipedia.org/wiki/Metaphone), [Abydos FAQ](https://abydos.readthedocs.io/en/latest/faq.html)) |
| Beider-Morse (BMPM) | Beider and Morse, 2008. Identifies the language, then an exact phonetic value, an approximate one and a Hebrew one; all sounds count, nothing is truncated | sets of phonetic strings | languages: Russian (Cyrillic and Latin), Polish, German, Romanian, Hungarian, Hebrew, French, Spanish, English. No Indic language. It "is primarily concerned with matching surnames of Ashkenazic Jews" | (B, [BMPM paper](https://stevemorse.org/phonetics/bmpm.pdf)) |
| NYSIIS | Taft, 1970, New York State; "an accuracy increase of 2.7% over the traditional Soundex" | letters, e.g. CADANGAYAR | vowels all become A; K→C. Many implementations cut it to 6 letters | (B, [NYSIIS](https://en.wikipedia.org/wiki/New_York_State_Identification_and_Intelligence_System)); the 6-letter cut (M: from implementations) |
| Caverphone 2.0 | Hood, Caversham Project, Otago, 2002, revised 2004; 1893–1938 New Zealand electoral rolls | 10 characters padded with 1s | drops r, l, w and h before a consonant: a non-rhotic accent, which helps fast/first | origin and code shape (B, [Caverphone](https://en.wikipedia.org/wiki/Caverphone)); the r/l/w/h behaviour, read from the rule list, and fit (M) |
| Match Rating Approach | Western Airlines, 1977 | 6-letter codex plus a comparison rated against a length-dependent minimum | far too lenient (section 2.3) | (B, [MRA](https://en.wikipedia.org/wiki/Match_rating_approach)) |

### 2.2 What each gives for the examples (M, measured)

These come from my own implementations, written from the published rules in `scratchpad/phon/phon.py`, which was not committed:
- **Double Metaphone** is a port of Philips' 2000 rules. It reproduces all 9 published examples exactly: 7 in the `double-metaphone` README and Smith/Schmidt on Wikipedia (B for the examples).
- **Soundex, NYSIIS and Caverphone 2** were checked only against examples I remember from the Apache Commons Codec tests (M). Two Caverphone examples I remembered did not reproduce, and I could not check them against a source.
- **Metaphone** follows the Apache Commons Codec rules, without its default 4-letter cap.
- **The last column** is v10's `earKeyJoined()`, run from the worktree.

Codes per word:

| Word (romanised Tamil for the Tamil example) | Soundex | Metaphone | Double Metaphone | NYSIIS | Caverphone 2 | MRA codex | v10 `earKey` |
|---|---|---|---|---|---|---|---|
| Aquan | A250 | AKN | AKN | AGAN | AKN1111111 | AQN | akvn |
| Akvan | A215 | AKFN | AKFN | ACVAN | AKFN111111 | AKVN | akvn |
| Akwan | A250 | AKWN | AKN | ACWAN | AKWN111111 | AKWN | akvn |
| Murasar | M626 | MRSR | MRSR | MARASAR | MRSA111111 | MRSR | mrsr |
| Murasu | M620 | MRS | MRS | MARAS | MRSA111111 | MRS | mrs |
| saikilon | S245 | SKLN | SKLN | SACALAN | SKLN111111 | SKLN | skln |
| cyclone | C245 | SKLN | SKLN | CYCLAN | SKLN111111 | CYCLN | skln |
| Palikan | P425 | PLKN | PLKN | PALACAN | PLKN111111 | PLKN | plkn |
| Pallikaranai | P426 | PLKRN | PLKRN (4-letter cap: PLKR) | PALACARAN (6-cap: PALACA) | PLKRNA1111 | PLKRN | plkrn |
| Kodungayur / Kodungaiyur | K352 / K352 | KTNKYR / same | KTNKR / same | CADANGAYAR / same | KTNKA11111 / same | KDNGYR / same | ktnkr / same |
| Kasimedu (and "Kasi medu" joined) | K253 | KSMT | KSMT | CASANAD | KSMTA11111 | KSMD | ksmt |
| ராஜவுகாந்தி நகர், romanised by v10 as "rajavukanti nakar", joined | R212 | RJFKNTNKR | RJFKNTNKR | RAJAVACANTANACAR | RFKNTNKA11 | RJVNKR | rjvkntnkr |
| Rajiv Gandhi Nagar, joined | R212 | RJFKNTHNKR | RJFKNTNKR | RAJAVGANDANAGAR | RFKNTNKA11 | RJVNGR | rjvkntnkr |
| Chronical / Chronicle | C652 / C652 | KRNKL / KRNKL | KRNKL / KRNKL | CRANACAL / CRANACL | KRNKA11111 / same | CHRNCL / same | srnkl / srnkl |
| fast / first | F230 / F623 | FST / FRST | FST / FRST | FAST / FARST | FST1111111 / FST1111111 | FST / FRST | pst / prst |

Same code for the pair. The `earKey` column also gives v10's graded `phraseSim` in brackets.

| Must-match pair | Soundex | Metaphone | Double Metaphone | NYSIIS | Caverphone 2 | MRA | v10 earKey |
|---|---|---|---|---|---|---|---|
| Aquan ~ Akvan | no | no | no | no | no | yes | yes (0.943) |
| Aquan ~ Akwan | yes | no | yes | no | no | yes | yes |
| Akvan ~ Akwan | no | no | no | no | no | yes | yes (1.000) |
| Murasar ~ Murasu | no | no | no | no | **yes** | yes | no (0.849) |
| saikilon ~ cyclone | no | yes | yes | no | yes | yes | yes (0.888) |
| Palikan ~ Pallikaranai | no | no | no | only at 6 letters | no | yes | no (0.864) |
| Kodungayur ~ Kodungaiyur | yes | yes | yes | yes | yes | yes | yes (1.000) |
| Kasi medu ~ Kasimedu (joined) | yes | yes | yes | yes | yes | yes | yes (1.000) |
| ராஜவுகாந்தி நகர் ~ Rajiv Gandhi Nagar | yes (4 letters only) | no (TH) | yes | no | yes | yes | yes (0.964) |
| Chronical ~ Chronicle | yes | yes | yes | only at 6 letters | yes | yes | yes (0.985 as "Deccan Chronical") |
| fast ~ first | no | no | no | no | **yes** | yes | no (0.876 as "fast news" ~ "first news") |
| **Pairs right (of 11)** | **5** | **4** | **6** | **2 (4 at 6 letters)** | **7** | **11** | **8 exact; 10 at ≥ 0.84** |

| Must-not pair | Soundex | Metaphone | Double Metaphone | NYSIIS | Caverphone 2 | MRA | v10 earKey (`phraseSim`) |
|---|---|---|---|---|---|---|---|
| Pallavaram ~ Pallikaranai | no | no | no | no | no | **yes** | no (0.000) |
| Kodambakkam ~ Kodungaiyur | no | no | no | no | no | **yes** (rating 2) | no (0.000) |
| Dinamalar ~ Dinamani | no | no | no | **yes at 6 letters** (DANANA) | no | **yes** | no (0.000) |
| Herald ~ Chronicle | no | no | no | no | no | no | no (0.000) |
| Akvan ~ Asuran | no | no | no | no | no | **yes** | no (0.000) |
| Adyar ~ Avadi | no | no | no | no | no | no | no (0.000) |
| Perungudi ~ Perungalathur | **yes** (P652) | no | **yes at 4 letters** (PRNK) | **yes at 6** (PARANG) | no | **yes** | no (0.000) |
| Thiruvanmiyur ~ Thiruvottiyur | no | no | no | **yes at 6** (TARAVA) | no | **yes** | no (0.000) |
| Fengal ~ Fani | no | no | no | no | no | **yes** | — |
| Royapuram ~ Royapettah | no | no | no | **yes at 6** (RAYAPA) | no | **yes** | no (0.000) |
| Saidapet ~ Sowcarpet | no | no | no | no | no | **yes** | — |
| Murasu ~ Mocha | no | no | no | no | no | **yes** | — |
| **False matches (of 12)** | **1** | **0** | **0 (1 at 4 letters)** | **0 (4 at 6 letters)** | **0** | **10** | **0** |

### 2.3 Reading the tables (M)

- **Every key that cuts its code short trades recall for false matches.** Soundex keeps 4 characters, Double Metaphone 4 in the original, NYSIIS 6. Chennai has many names that share a stem, such as Perung-, Thiruva- and Royap-. Use full-length codes only.
- **MRA is unusable.** It "matches" 10 of the 12 different-place pairs.
- **Caverphone 2 has the best balance of the classical keys here** (7 of 11 right, 0 false). It drops a post-vocalic r, l, w and h, which suits a non-rhotic accent: fast = first, Murasar = Murasu. But it keeps v/f apart from w (Akvan ≠ Akwan ≠ Aquan) and has no truncation rule. Borrow its non-rhotic idea for command words (recommendation 7). Do not adopt it as the name key.
- **Double Metaphone is usable as one extra key for English-origin names, for blocking only.** Its weak points for Tamil names:
  - TH gives 0 (theta), as the v8 note found.
  - W is dropped while V becomes F.
  - It has no truncation rule.
- **v10's `earKey` is the right base.** It merges voicing (k/g, t/d, p/b), drops aspiration, merges v/w, s/sh/ch/z, f/p and q/k, drops y glides and the final enunciative vowel, and keeps the first vowel as a mark. It gets 8 of 11 exactly and has no false match among these pairs. Its graded `earSim`/`phraseSim` closes two more pairs (Murasar 0.849, Palikan 0.864) but leaves both under the 0.90 bar for a place said alone.

### 2.4 Indic and Tamil-specific keys

- **IndicSOUNDEX** (DiPersio, Amazon Alexa AI; The Web Conference '21, Workshop on Multilingual Search, April 2021) (B, [paper](https://cdn.amazon.science/86/4e/ebc49f01492d89307dbb45d0faf2/indicsoundex-algorithm-for-text-matching.pdf)):
  - **Algorithm.** The first letter goes through a modified ISO-15919 romanisation; every later letter maps to one of 15 codes based on manner of articulation. It then removes "h" after a consonant, removes vowels that do not start the word, and merges repeated codes. Plosives keep voicing and place, aspiration merges, all nasals merge, and fricatives keep every distinction.
  - **Indic/Latin results.** Tamil 58.79 % (117/199) against 95.71 % over all languages.
  - **Tamil paired with other Indic scripts.** 43.93–63.41 %.
  - **Cause.** The paper's Table 6 lists Tamil's errors as "k vs. g", "t vs. d", "k vs. h", "p vs. bh".
  - **Pairs one sound apart.** They got the same code 36.27 % of the time at length 3 and 87.64 % at length 8 (Table 10).
  - **Conclusion (M).** Any key for Tamil must merge voicing, which IndicSOUNDEX deliberately does not. Short names (two or three consonants) need exact or alias matches, not keys. v10 already refuses keys with fewer than 3 consonants.
- **Earlier Indic Soundex work, as reported by DiPersio (B, same paper):**
  - Chaware and Rao's custom Soundex matched 34 % of Hindi and 14 % of Marathi pairs. Their q-gram method matched 68 %/46 %, and their "Indic-Phonetic" method 76 %/38 %.
  - Shah and Singh reported perfect accuracy on 100 names, but their threshold "will declare a pair as a match even if the resulting SOUNDEX representations ... differ in up to two characters".
- **Python ports.** `indic-soundex` (MIT per its README) and `libindic/soundex` (LGPL-3.0) are Python only and keep th/t apart. There is no JS port (B, v8 note 1.3). None is worth porting over v10's key (M).
- **Beider-Morse's asymmetry is worth copying (B for BMPM, M for the copy).** The engine allows for lost diacritics in what the user typed but not in the proof-read list, so matches "are not necessary commutative" (B, [BMPM paper](https://stevemorse.org/phonetics/bmpm.pdf)). For Jarvis: apply the loose rules to the heard side only. Those rules are truncation, case-ending stripping and the cut vowel. Never apply them to the store's spellings.

---

## 3. Transliteration both ways (b)

### 3.1 Tools

| Tool | Directions | Licence, size, version | Runtime | Use for Jarvis | Mark |
|---|---|---|---|---|---|
| v10's own `romanise()` (`src/lib/thunai/xlit.ts`) plus `fold()` (`v8/match.ts`) | Tamil → Latin | in the repository | deterministic table lookup | **keep**: it already lands in the same key space as English spellings. "ராஜவுகாந்தி நகர்" gives "rajavukanti nakar" | (B, code; M, measured) |
| `@indic-transliteration/sanscript` | between schemes (tamil, tamil_extended, tamil_superscripted, ISO, ITRANS…) | **MIT**, v1.3.3, 270 KB unpacked; depends on `@indic-transliteration/common_maps` 1.0.6 (MIT, 159 KB) | JS | scheme conversion, not natural spelling; not needed beside `romanise()` | (B, [npm](https://registry.npmjs.org/@indic-transliteration/sanscript/latest), [common_maps](https://registry.npmjs.org/@indic-transliteration/common_maps/latest)) |
| Aksharamukha | 120 scripts; romanisations include ISO, IAST, "Roman (Readable)" and "Roman (Colloquial)" | Python: **AGPL-3.0**. npm `aksharamukha` 2.3.0-32: **GPL-3.0-only**, 16.8 MB, runs Python in Pyodide | Python, or WASM in the browser | not in the app (copyleft, heavy). At most a one-off offline aid (M) | (B, [GitHub](https://github.com/virtualvinodh/aksharamukha/), [npm](https://registry.npmjs.org/aksharamukha/latest), [aksharamukha.js](https://aksharamukha.js.org/)) |
| AI4Bharat **IndicXlit** | Roman → Indic and Indic → Roman, 21 languages incl. Tamil | **MIT** (code and models). Transformer: 6+6 layers, 256 dimensions, "~11M" parameters. PyPI `ai4bharat-transliteration` 1.1.3 (14 Sep 2022) | Python + fairseq; API `XlitEngine(src_script_type="roman"\|"indic", beam_width=4, rescore=True)`, then `.translit_word(w, lang_code="ta", topk=4)` | **offline**, in a Python sidecar build step: top-3 Tamil spellings of English names and Latin spellings of Tamil names, reviewed (M) | (B, [GitHub](https://github.com/AI4Bharat/IndicXlit), [PyPI](https://pypi.org/project/ai4bharat-transliteration/)) |
| IndicXlit accuracy, Tamil, top-1 | Dakshina En→Ta 68.10; Aksharantar native words En→Ta 69.78; **named entities En→Ta 42.12**; native words Ta→En 45.08; **named entities Ta→En 35.46** | | | top-1 is too weak for names; use top-k plus review (M) | (B, [GitHub](https://github.com/AI4Bharat/IndicXlit)) |
| Google Nisaba | FST normalisation and transliteration for Brahmic scripts, incl. "Natural transliteration" | **Apache-2.0** | Bazel + OpenFst/Pynini/Thrax; CI badges for Linux and macOS; Windows not mentioned | not practical on this Windows laptop (M) | (B, [GitHub](https://github.com/google-research/nisaba)) |
| Google Dakshina dataset | romanisation lexicons: 25,000 training, 2,500 dev and 2,500 test words a language, as TSV with attestation counts | **CC BY-SA 4.0**; v1.0 (27 May 2020) | data | learn and verify Tamil romanisation variants offline. Share-alike applies if derived data is redistributed (M) | (B, [GitHub](https://github.com/google-research-datasets/dakshina)) |
| AnyAscii | any script → ASCII | **ISC**; npm 0.3.3, 553 KB | JS | **no**: "கன்னியாகுமரி" → "knniyakumri" (it drops the inherent vowels) | (B, [GitHub](https://github.com/anyascii/anyascii), [npm](https://registry.npmjs.org/any-ascii/latest)) |
| Google Input Tools offline, Cloud `romanizeText`, Sarvam `/transliterate`, Azure | — | the offline Windows installer is reported discontinued; the cloud services are paid | network | **no** at run time (latency, cost, privacy). Sarvam's API is in note 10 | Input Tools (not confirmed: low-authority sources only); the rest (M) |
| open-tamil (Python) | Azhagi, Jaffna, Madras University and ISO tables | licence unclear (GPLv3 and MIT both listed) | Python | not needed (M) | not confirmed |

**Romanised Tamil really is ambiguous (B).** In the Dakshina development sets, a repeated Tamil word appears in **1.9** distinct romanisations on average. The same figure holds for Hindi, Bengali and Gujarati. The Tamil word for tamarind appears as "puli" and, less often, "pulli", and "puli" is also an attested romanisation of the word for tiger (B, [Kirov et al. 2024, *Computational Linguistics* 50(2)](https://aclanthology.org/2024.cl-2.2.pdf), Table 1).

### 3.2 Tamil script → Latin for matching (M)

Keep `romanise()` and the ear key. Do not try to produce the spelling a person would write: matching happens in key space, where `rajavukanti nakar` and `rajiv gandhi nagar` already give the same key (`rjvkntnkr`). Two fixes:
1. **Fold "chr" to "kr"** before the key, on both sides. This lets a Tamil-script English loanword (க்ரோனிக்கிள் → "kronikkil") meet the English spelling (Chronicle). Section 7.4 has the measured effect.
2. **Fix inherited cluster rules only when a test shows the need.** `fold()` already maps ற்ற to "ttr" and ன்ற to "ndr" (B, `v8/match.ts`).

### 3.3 English name → the Tamil-script spellings a speech-to-text writes

**Why it matters (B, code; M, measured).** v10's `findMentions` matches Tamil letters only against an entity's Tamil spellings, unless a class word is beside them. The code comment gives the reason: "வந்திருக்கு" (it has come) sounds like Vandalur. Because of this rule, every entity without a Tamil spelling is unreachable from Tamil speech. On my test list that covered "தந்தி டிவி", "போலிமர் நியூஸ்", "டெக்கான் க்ரோனிக்கிள் செய்தி" and "க்ரோம்பேட்டை". Keep the rule and fill in the spellings.

**How (M):**
1. **Store first.** Use the spelling the Tamil headlines use for the same entity. `lexicon10.ts` already merges a Tamil storm name into its English entry by ear.
2. **Generated, offline, for the rest.** Run IndicXlit En→Ta with `topk=3` in the Python sidecar at lexicon-build time. Keep the candidates whose romanised ear key equals the English entry's ear key, and review the top 100 entities by hand once. Within-script matching tolerates the variation the speech-to-text adds (M, measured: `phraseSim` within Tamil script):

   | Tamil spelling pair | `phraseSim` |
   |---|---|
   | டெக்கான் க்ரோனிக்கிள் / டெக்கான் குரோனிக்கல் | 0.973 |
   | போலிமர் நியூஸ் / பாலிமர் நியூஸ் | 0.982 |
   | தந்தி டிவி / தந்தி டீவி | 1.000 |
   | க்ரோம்பேட்டை / குரோம்பேட்டை | 0.970 |
   | சைக்கிளோன் / சைக்ளோன் | 0.970 |
   | அக்வான் / அக்வன் | 1.000 |
   | ராஜவுகாந்தி நகர் / ராஜீவ் காந்தி நகர் | 0.964 |

3. **Rule fallback when the sidecar is not available.** Tamil loanword conventions: English t/d → ட; th → த; k/g → க; p/b → ப; j → ஜ; s → ஸ or ச; sh → ஷ; f → ஃப; v/w → வ; final consonant + ், or + உ after ட/ர. Initial clusters are written with ் ("க்ரோ") or with an added vowel ("குரோ"). Generate both forms (M).
4. **Use the same Tamil spellings for Sarvam's keyterms.** The service takes at most 50 terms of up to 64 characters each (B, note 10 section 3); `keytermsOf()` already caps them at 40.

### 3.4 Tamil name → Latin spellings (M)

There is no need to generate them for matching: the heard Latin form goes through `looseKey`/`earKey`, and the Tamil name through `romanise` and then the same keys.

Generate them only for:
- **Display and keyterms.** IndicXlit Ta→En top-k (its PyPI example returns five spellings for one Hindi word) (B, [PyPI](https://pypi.org/project/ai4bharat-transliteration/)).
- **The unit-test list.** Variant rules: th/t, dh/d, zh/l, aa/a, ee/i, oo/u, ai/ay, doubled/single consonants, final -u present or absent, -pet/-pettai, v/w. These rules are already in v8 note R.3.

---

## 4. Cross-lingual meaning (c)

### 4.1 Models

| Model | Licence | Size | Max input | Notes | Mark |
|---|---|---|---|---|---|
| multilingual-e5-small | MIT | 12 layers, 384 dimensions (about 118M parameters, mostly the 250k-token embedding table) | 512 | Tatoeba tam-eng accuracy **85.0** (hin 94.9, mal 96.1, tel 88.9, ben 82.6), from the model card's MTEB results | (B, [card](https://huggingface.co/intfloat/multilingual-e5-small); read from the locally cached copy of the card); parameters (M) |
| **multilingual-e5-base** (already in the repository: `src/lib/assistant/embed.ts`, q8 ONNX 278,647,662 bytes under `.cache/models/Xenova/...`) | MIT | 12 layers, 768 dimensions; built on xlm-roberta-base | 512 | inputs must start with "query: " or "passage: "; "cosine similarity scores distribute around 0.7 to 1.0" because of temperature 0.01, so "relative order" is what matters, not absolute values | (B, [card](https://huggingface.co/intfloat/multilingual-e5-base)); file size (M, measured) |
| multilingual-e5-large | MIT | 24 layers, 1024 dimensions | 512 | best e5 on Tamil IndicMSMARCO (below) | (B, [card](https://huggingface.co/intfloat/multilingual-e5-large)) |
| LaBSE | Apache-2.0 | 0.5B; 768 dimensions; 109 languages; vocabulary 501,153 | 256 | built for bitext: STS-B 72.8 against 79.2 for SentenceBERT; "biases the model to excel at detecting meaning equivalence" | (B, [card](https://huggingface.co/sentence-transformers/LaBSE), [paper](https://ar5iv.labs.arxiv.org/html/2007.01852)) |
| BGE-M3 | MIT | 1024 dimensions; more than 100 languages | 8192 | dense, sparse and multi-vector scores; example weights [0.4, 0.2, 0.4] | (B, [card](https://huggingface.co/BAAI/bge-m3)) |
| L3Cube IndicSBERT (`indic-sentence-similarity-sbert`) | CC-BY-4.0 | MuRIL base (BERT-base) | — | 11 languages incl. Tamil | (B, [card](https://huggingface.co/l3cube-pune/indic-sentence-similarity-sbert), [paper](https://arxiv.org/pdf/2304.11434)) |
| MuRIL | — (released on TFHub and Hugging Face) | 236M parameters; vocabulary 197,285 | — | pre-trained with transliterated text (Dakshina) | (B, [paper](https://ar5iv.labs.arxiv.org/html/2103.10730)) |

### 4.2 Tamil evidence from the sources

- **IndicMSMARCO, Tamil, mean reciprocal rank** (monolingual Tamil retrieval on a machine-translated MS MARCO) (B, [IndicRAGSuite, AI4Bharat 2025](https://arxiv.org/pdf/2506.01615), Table 2):

  | e5-small | e5-base | e5-large | LLM2VEC | BGE-M3 |
  |---|---|---|---|---|
  | 0.38 | 0.45 | 0.49 | 0.42 | 0.49 |

- **IndicSBERT paper, zero-shot Tamil "embedding similarity"** (Spearman correlation of cosine scores with gold scores on the paper's Tamil STS evaluation) (B, [arXiv 2304.11434](https://arxiv.org/pdf/2304.11434), Table 4):

  | mBERT | MuRIL | LASER | paraphrase-multilingual-mpnet-base-v2 | LaBSE | IndicSBERT | IndicSBERT-STS |
  |---|---|---|---|---|---|---|
  | 0.49 | 0.60 | 0.49 | 0.65 | 0.72 | 0.73 | 0.82 |

- **IndicSBERT paper, English-Tamil cross-lingual** (B, Table 6): IndicSBERT-STS 0.80, IndicSBERT 0.71, LaBSE 0.69.
- **Romanised Tamil is hard for every encoder** (B, [MuRIL paper](https://ar5iv.labs.arxiv.org/html/2103.10730), Table 2). On Tamil Tatoeba, accuracy falls sharply once the text is romanised:

  | Encoder | Native script | Romanised |
  |---|---|---|
  | mBERT | 12.4 | 2.0 |
  | MuRIL | 36.8 | 11.1 |

  So Tanglish requests should not be embedded as they are (M).
- **CPU latency (B).** Elastic's quantised e5-small card reports 0.0181 against 0.00826 for inputs of 0–50 characters, without stating units or the CPU (B, [card](https://huggingface.co/elastic/multilingual-e5-small-optimized)). My reading is seconds, that is 18 → 8 ms (M).

### 4.3 Measured here: the repository's e5-base on name-bearing requests (M, measured)

**Method.** The scratchpad scripts `emb/emb_base.mjs` and `emb/emb.py` (not committed) did the following:
- **e5-base:** transformers.js 4.3.0 and onnxruntime-node from the worktree's `node_modules`, loading the worktree's own q8 model with `allowRemoteModels=false`. Mean pooling, normalised vectors, 2 intra-op threads as in `embed.ts`.
- **e5-small:** run from the Hugging Face cache already on this laptop, through a numpy forward pass I wrote.
- **Texts:** six requests as a speech-to-text might write them, against ten headlines.

**Speed (e5-base q8).**

| Measure | 2 threads | 6 threads |
|---|---|---|
| Model load | 1.0–1.1 s | 1.0–1.1 s |
| One short request (p50 / p90) | 9.4 / 11.7 ms | 7.4 / 8.0 ms |
| One headline-length text (p50 / p90) | 11.4 / 13.2 ms | 8.5 / 9.5 ms |
| Batch of 20 headlines (p50) | 179–193 ms | 119 ms |

Headline vectors must therefore be cached; `sem10.ts` already caches them.

**Quality, with "query:" for the request and "passage:" for the headline (as `sem10.ts` does).**

| Request (as heard) | Right headline (cosine) | Best wrong headline (cosine) | Margin |
|---|---|---|---|
| Cyclone Aquan latest update | Tamil Akvan story 0.844; English Akvan story 0.833 | unrelated Tamil water story 0.797; the Murasu storm 0.781 | +0.047 |
| Murasar saikilon news | Murasu 0.803 | Pallikaranai water story 0.802 | **+0.001** |
| அக்வான் புயல் எங்கே இருக்கு | Tamil Akvan story 0.843; **English Akvan story 0.803** | Kodambakkam fire 0.794 | +0.049 (Tamil); **+0.009 (English)** |
| Kodungayur fire news | Kodungaiyur fire 0.859 | Kodambakkam fire 0.848 | **+0.011** |
| Palikan la thanni nikkudha (Tanglish) | Pallikaranai 0.802 (3rd) | Kodambakkam fire 0.817 (1st) | **−0.015 (wrong on top)** |
| ராஜவுகாந்தி நகர் தண்ணீர் பிரச்சனை | Tamil Rajiv Gandhi Nagar story 0.839 (the English one is not in the top 3) | Pallikaranai water story 0.837 | **+0.002** |

**Quality, with "query:" on both sides.**
- "Murasar saikilon news": the wrong story is on top (0.790 against Murasu's 0.789).
- "Kodungayur fire news": 0.906 against 0.881.
- The Tanglish request: the right story is not in the top 4.

**Single names (e5-base, query mode).** The vectors do not separate names:

| Pair | Cosine |
|---|---|
| Akvan ~ Aquan | 0.883 |
| Akvan ~ Akwan | 0.939 |
| Akvan ~ Asuran | 0.814 |
| Pallikaranai ~ Palikan | 0.844 |
| **Pallikaranai ~ Pallavaram** | **0.870, higher than the right pair** |
| cyclone ~ saikilon | 0.801 |
| cyclone ~ புயல் | 0.813 |

**e5-small (fp32, numpy) gives the same picture.** Aquan → Akvan 0.863 against Murasu 0.845; Kodungaiyur 0.921 against Kodambakkam 0.896; the Tanglish request's right story is 4th; Pallikaranai ~ Palikan 0.871 against ~ Pallavaram 0.866.

**Conclusion (M).** Embeddings rank topic first (fire, storm, water) and then script: a Tamil request prefers Tamil headlines. They barely react to which name is said. Every margin between the right and the wrong same-topic story was 0.05 or less, and some were negative.

### 4.4 Using it as a second ranker under lexical guards (M)

1. **Name first.** If the entity layer finds a mention, in the "sure" band or confirmed after asking, restrict the candidate stories to that entity's `docs`, and only then let the embedding order them. Never let the embedding choose between two entities of the same class (two storms, two places).
2. **Requests that name nothing** ("anything about water shortage today?"): use the embedding. Accept the top story only if:
   - its cosine is at least **0.82** (passage mode, e5-base; starting value: the right top stories above scored 0.833–0.859, the wrong top stories 0.803–0.817), and
   - it is at least **0.03** ahead of the second story.
   
   Otherwise read the top two titles and ask. Tune both numbers on the dev set.
3. **Do not exempt Tamil letters from the name gate.** `sem10.ts` currently says "unless the request is in Tamil letters". If a Tamil request contains a name, which the entity layer finds within the script, gate the stories on that name too. The measured case: for the Tamil Akvan request, the right English story beat an unrelated story by only 0.009.
4. **Tanglish.** Before embedding, gloss the Tanglish words already in the repository's word lists into English (thanni → water; nikkudha → standing or stagnant), or embed only the entity plus English topic words. Never embed raw romanised Tamil and trust the score.
5. **Compare scores within a script, or calibrate per script.** The same story in Tamil and in English scored 0.04–0.10 apart for the same Tamil request (Akvan: 0.843 against 0.803 in passage mode, 0.901 against 0.805 in query mode).
6. **Do not add LaBSE or BGE-M3 in v10.** BGE-M3 and e5-large are better on Tamil retrieval (0.49 against 0.45 for e5-base). But neither fixes names, and each would be a second model of roughly 0.5B parameters (B for the sizes; M for the advice).

---

## 5. Entity linking with a small daily knowledge base: confidence and "did you mean" (d)

### 5.1 What production assistants and dialogue toolkits do (B)

- **Alexa entity resolution.**
  - A custom slot type lists entities with IDs and synonyms ("holland" resolves to "Netherlands").
  - The request carries `resolutions.resolutionsPerAuthority[]`, each with `authority`, `status.code` and `values[].value.{name,id}`.
  - The status codes are `ER_SUCCESS_MATCH`, `ER_SUCCESS_NO_MATCH`, `ER_ERROR_TIMEOUT` and `ER_ERROR_EXCEPTION`.
  - One authority can return several values ("hiking" gave both HIKE and SNOWSHOE), and the skill must choose or ask.
  
  (B, [Alexa docs](https://developer.amazon.com/en-US/docs/alexa/custom-skills/entity-resolution.html))
- **SiriKit.** `INPersonResolutionResult` has `success(with:)`, `confirmationRequired(with:)` ("the user must confirm the value before proceeding") and `disambiguation(with:)` ("the user to select from among the specified objects") (B, [Apple docs](https://developer.apple.com/documentation/intents/inpersonresolutionresult)).
- **Rasa.**
  - `FallbackClassifier` predicts the fallback intent if no intent reaches `threshold`, "or the confidence scores of the two top ranked intents are closer than the `ambiguity_threshold`".
  - Two-stage fallback asks the user to confirm the intent. If the user says no, it asks for a rephrase, and finally hands off to the ultimate fallback.
  - The documentation's example uses `threshold: 0.7`.
  
  (B, [components](https://legacy-docs-oss.rasa.com/docs/rasa/components/), [fallback](https://legacy-docs-oss.rasa.com/docs/rasa/fallback-handoff/))
- **Rejection thresholds.** "A common design pattern in spoken dialog systems is to reject an input when the recognition confidence score falls below a preset rejection threshold." Fixed thresholds trade misunderstandings against false rejections poorly. The authors derive error costs from data and set state-specific thresholds (B, [Bohus and Rudnicky, Interspeech 2005](https://www.microsoft.com/en-us/research/publication/principled-approach-rejection-threshold-optimization-spoken-dialog-systems/)).
- **Calibration and abstention.**
  - Temperature scaling (one-parameter Platt scaling) is "surprisingly effective at calibrating predictions" (B, [Guo et al., ICML 2017](https://arxiv.org/abs/1706.04599)).
  - Selective classification rejects inputs to meet a user-set risk, for example a guaranteed 2 % top-5 error on ImageNet while still covering almost 60 % of inputs (B, [Geifman and El-Yaniv 2017](https://arxiv.org/abs/1705.08500)).

### 5.2 What the research says about features (B)

- **Names misheard by a third-party speech-to-text** (B, [Raghuvanshi et al., EMNLP-IJCNLP 2019 demos](https://aclanthology.org/D19-3011.pdf)):
  - The system indexes names with character n-grams, word n-grams and **edge n-grams** ("the phonemes at the edges of tokens tend to contribute more"), plus nicknames.
  - It adds phonetic features from Double Metaphone and a sequence-to-sequence grapheme-to-phoneme model, the n-best transcripts, and a personalisation prior.
  - Recall from cumulative features:

    | Features added | R@1 | R@5 |
    |---|---|---|
    | Text only | 0.100 | 0.120 |
    | + phonetic | 0.255 | 0.347 |
    | + n-best | 0.326 | 0.454 |
    | + personalisation | 0.508 | 0.627 |

  - Weights were tuned by hand and by random walk.
- **Alexa phonetic embeddings** (B, [Zhou, Bao, Campbell, Interspeech 2022](https://www.isca-archive.org/interspeech_2022/zhou22h_interspeech.pdf)):
  - Positive training pairs come from the same ASR n-best cluster, with phoneme edit distance normalised by length at most **0.3**. Negative pairs need at least **0.5**, and the gap between the two bounds is kept on purpose.
  - Against lexical search on video, as relative error reduction at recall@5:

    | Method | Whole set | Phonetic-variation subset |
    |---|---|---|
    | Phonetic n-gram search | 34.7 % | 52.3 % |
    | Semantic vector search | 39.7 % | 60.3 % |
    | Semantic + phonetic | 44.0 % | 71.2 % |
    | Semantic + phonetic + n-best augmentation | 49.9 % | 79.0 % |

  - "Phonetic search can also hurt precision by adding more candidates."
- **ASR n-best in deep entity retrieval:** 11.07 % relative error reduction "while maintaining the same performance on rejecting out-of-domain" requests (B, [Wang et al., Interspeech 2021](https://www.isca-archive.org/interspeech_2021/wang21b_interspeech.pdf)).

**Lessons for Jarvis (M).**
- Phonetic keys plus the n-best do most of the work.
- A context prior (for Jarvis: today's stories and what is on screen) is worth as much as both.
- Keep a gap between "same" and "different" in normalised distance. For Jarvis's ear key, the measured must-not pairs all scored 0.000 and the must-match pairs 0.84–1.0, so v10's 0.80–0.90 bands sit in that gap.

### 5.3 Candidate generation for Jarvis (M)

- **Hypotheses.** Use every text the speech-to-text gave: Sarvam codemix, and Whisper forced to English and to Tamil. Run `findMentions` on each and take the union.
- **Spans.**
  - Spans of 1–4 words. A stopword, or a class word, ends a span.
  - Join adjacent words ("Kasi medu").
  - Try word stems after the unstripped word (`stemsOf`, including "-வுல/-யுல").
  - Join letters spelt out singly (`joinSpelled`).
- **Class cue words, by ear and in both scripts** (`classOf`). Present today: storm, protest, fire, accident, court. Add:
  - storm: சூறாவளி / sooravali; காற்றழுத்த தாழ்வு ("low pressure").
  - flood / waterlogging: வெள்ளம் / vellam, தண்ணீர் தேங்கி / thanni thengi.
  - strike: வேலைநிறுத்தம்.
  - siege: முற்றுகை.
  - hunger strike: உண்ணாவிரதம்.
- **Blocking.** Today a candidate needs the same first consonant of the ear key, which is cheap. Up to about 500 entries, brute force is fine: p50 1.9 ms and p90 8.7 ms at 279 entries (M, measured). For the 4,883 district localities, add three indexes:
  1. an exact ear-key map;
  2. a 3-gram index on the loose key (edge n-grams weighted ×2, per the MindMeld finding);
  3. a prefix map on the loose key for truncation.
- **Aliases.** The table holds:
  - merged spellings from every source (the store, the district lists, generated Tamil spellings);
  - short forms (Chronicle, DC, Thanthi, Polimer, PT, TOI);
  - learned aliases (5.5).

### 5.4 Scoring and calibration (M)

- **Score.** Keep `phraseSim` as the name score. Add:
  - a class agreement bonus (+0.02, as today);
  - a context prior: +0.02 if the entity is in today's stories or on screen;
  - an n-best agreement bonus: +0.02 for each extra hypothesis with the same top entity, at most +0.04.
- **Never add the embedding score to the name score.**
- **Calibration, once the dev set and logs are large enough** (a few hundred decided mentions):
  1. Fit one isotonic or Platt mapping from score to the probability of being right, per kind (storm, place, outlet, name).
  2. Set `SURE` where precision on the dev set is at least 98 %.
  3. Set `ASK_FLOOR` where the top candidate is right at least 70 % of the time.
  4. Following Bohus and Rudnicky, use different thresholds per action. Opening a story or reading it aloud costs more when wrong than a three-word question.
- **What to log.** The heard span, the entity, the score, the band and the user's yes or no. Aggregate counts are enough.

### 5.5 Bands and the "did you mean" turn (M)

| Band | Condition (starting values; v10 already uses the first four) | What Jarvis says or does |
|---|---|---|
| sure | `phraseSim` ≥ **0.90** said alone; ≥ **0.84** beside a storm's class word; ≥ **0.86** beside another class word; and no other entity of the same kind within **0.03** | acts, and says the name back in its store spelling ("Cyclone Akvan: …") |
| ask | **0.80** ≤ score < sure; or the cut-off rule fired (fixed at **0.88**, ask only); or two entities within 0.03 of each other | "Cyclone Akvan?" or "Akvan or Asuran?", in three or four words. Never a refusal, never the wrong story (JARVIS_V10.md 4.2) |
| none | below 0.80, or the span is a lone English word that is not an exact spelling, or a key of fewer than 3 consonants without an exact or alias match | no mention. A class word beside an unknown name gives "No Cyclone X in today's news" (`classMention`) |
| place said alone | sure only, except a cut-off-rule hit or a place in today's stories or on screen, which can be asked | (as v10 does now, plus the exception) |

**After the answer:**
- **Yes** (yes, aamaa, ஆமா, sari, correct): act, and record the heard form → entity in a learned-alias table with a count. A learned alias is promoted to automatic "sure" after **2** confirmations of the same heard form. Never learn:
  - English dictionary words;
  - keys of fewer than 3 consonants;
  - Tamil grammar words.
  
  Storm aliases expire with the storm's entry.
- **No:** offer the second candidate if one is at least ASK_FLOOR; otherwise ask once to repeat or spell, then hand over to the normal lanes.

### 5.6 The v10 entity layer, measured (M, measured)

**The first test list:** must-match **28/34**, must-not **29/29**. One of the misses was "fast news" read as an outlet; it is not an entity case and is not in 7.4. A further 12 cross-script and morphology cases gave 6 must-match passes and 8/8 must-not. Section 7.4 merges both runs.

**Passes:**
- Aquan (0.963 sure), Akwan, Murasar Saikilon (0.869 sure), அக்வான் புயல், Michong, Niwar, Mandus and Vardha.
- Fenjal (0.850, ask).
- Pallikaranaila; பள்ளிக்கரணையில்; Kodungayur; கொடுங்கையூரில்; Kasi medu; காசிமேட்டில் (stem change); ராஜவுகாந்தி நகர் (0.964); அடையாற்றில்.
- Vela cherry, Mylapur, Solinganallur, Deccan Chronical (0.985), Dina Thanthi, Dhandhi TV, Puthiyathalaimurai and தினமலர்.

**Fails, with the fix that closes each one:**

| Heard | Why it fails | Fix (measured where shown) |
|---|---|---|
| Palikan | 0.864, and a place said alone has no ask band | the cut-off rule gives 0.88 to Pallikaranai only, with Pallavaram 0.000 |
| Ennur | a key of 2 consonants needs Jaro-Winkler ≥ 0.94 | alias |
| Adayar | same as Ennur | alias. The district list itself spells the area "Adayar" and "Tiruvottriyur", so those entries pass once merged |
| Crompet | ch→s | chr→kr: 0.807 → 0.970 |
| Kronikal la enna | partial outlet name, and ch | short alias plus chr→kr: 0.835 → 0.970 |
| Polymer news | "polymer" is an English word and "news" is a stopword | an outlet matcher over whole names: "Polymer" ~ "Polimer" 0.970 |
| டெக்கான் க்ரோனிக்கிள், போலிமர் நியூஸ், தந்தி டிவி, க்ரோம்பேட்டை | no Tamil spelling in the entry | generated Tamil spellings (3.3) |

**Against 279 entries** (the 250 district areas from `data/gcc-reference/areas-localities.json`, my test places, 10 storms and 15 outlets):
- must-match 27/33 and must-not 31/31;
- no mention at all for "மழை வந்திருக்கு", "what is the weather today", "open the first news" or "read the fast news";
- `findMentions` p50 **1.9 ms**, p90 **8.7 ms**, maximum 12.7 ms, run from source through jiti, so not bundled.

---

## 6. JS/TS libraries we may use or copy (e)

| Package | Version, licence, unpacked size | What it gives | Verdict | Mark |
|---|---|---|---|---|
| `double-metaphone` (wooorm) | 2.0.1, **MIT**, 34 KB, ESM only | `doubleMetaphone(s) → [primary, secondary]`, full length | optional extra blocking key for English-origin names | (B, [npm](https://registry.npmjs.org/double-metaphone/latest), [GitHub](https://github.com/words/double-metaphone)) |
| `talisman` | 1.1.6 (published 13 Nov 2026), **MIT** | 16 phonetic modules (alpha-sis, caverphone, daitch-mokotoff, double-metaphone, eudex, fuzzy-soundex, lein, metaphone, mra, nysiis, onca, phonex, roger-root, sound-d, soundex, statcan), plus distance metrics; no Beider-Morse | copy single functions if needed (MIT), for example Caverphone's rules for command words | (B, [docs](https://yomguithereal.github.io/talisman/phonetics/), [npm](https://registry.npmjs.org/talisman)) |
| `natural` | 8.2.6, **MIT**, 13.8 MB, depends on pg, redis, mongoose, memjs and others | phonetics and distances | **avoid** in the browser bundle (M) | (B, [npm](https://registry.npmjs.org/natural/latest)) |
| `fuse.js` | 7.5.0, **Apache-2.0**, 417 KB | Bitap fuzzy search | not phonetic. Could search over pre-computed ear keys, but v10's own scorer is better (M) | (B, [npm](https://registry.npmjs.org/fuse.js/latest), [GitHub](https://github.com/krisk/Fuse)) |
| `flexsearch` | 0.8.212, **Apache-2.0**, 2.3 MB | full-text index | not needed under ~500 entries (M) | (B, [npm](https://registry.npmjs.org/flexsearch/latest)) |
| `fastest-levenshtein` | 1.0.16, **MIT**, 21 KB | fast Levenshtein | only if profiling shows `editDistance` is hot (M) | (B, [npm](https://registry.npmjs.org/fastest-levenshtein/latest)) |
| `fuzzball` | **MIT** | token ratios | its `token_set_ratio` scores 100 when one string is a subset of the other ("Anna" against Anna Nagar and Anna Salai): never use it to accept a place | (B, v8 note 1.3, 4) |
| Microsoft `PhoneticMatching` | **MIT** | English pronouncer plus phonetic distance | native C++ (node-gyp), English only: no | (B, v8 note 1.3) |
| `@indic-transliteration/sanscript`, `any-ascii`, `aksharamukha` (npm) | MIT / ISC / GPL-3.0-only | scheme conversion / ASCII / Pyodide | see 3.1 | (B) |
| `@huggingface/transformers`, `onnxruntime-node` | 4.3.0 Apache-2.0 (already in `node_modules`) | runs e5-base locally | already used by `embed.ts` and `sem10.ts` | (B, `node_modules/@huggingface/transformers/package.json`) |

---

## 7. The design to build from

### 7.1 Flow, per request (M)

```
hypotheses (Sarvam codemix, Whisper-en, Whisper-ta)
  → per hypothesis: wordsOf → stop / class / Tamil grammar marks → spans 1–4 words (+ joined pairs, + stems)
  → blocking: same first ear consonant (≤ 500 entries) | earKey map + 3-gram + prefix index (> 500)
  → name score  = max( phraseSim(span, spelling) over the entry's spellings, cutOff(span, entry), alias exact = 1.0 )
                  Tamil heard: Tamil spellings only, unless a class word is beside it (v10's rule; keep it)
  → context     = + class agreement 0.02, + today/screen 0.02, + n-best agreement 0.02 each (max 0.04)
  → decide      = sure / ask / none (5.5), per kind; ties within 0.03 → ask between two
  → stories     = the entity's docs; embedding orders them (4.4); no entity → embedding with floor and margin, else ask
```

### 7.2 Functions (TypeScript, M)

| Function | File | What it does |
|---|---|---|
| `earKeys(word): string[]` | phon10 | the primary ear key, plus an alternate for a word-initial "ch" (s and k). Applies chr→kr first. At most 2 keys |
| `cutOff(heard, name, lexKeys): number` | phon10 | 0.88 if: the heard span is one word, its loose key has at least 6 letters, it is not an English word or Tamil grammar, and its loose key minus the last letter is a prefix of exactly one same-kind entry's loose key. Otherwise 0. Takes the band to "ask" only |
| `findMentions(text, lex, { hyps?, onScreen?, today? })` | entity10 | as today, plus n-best and context |
| `decide(mentions, kind, action)` | entity10 | the bands of 5.5, with per-action thresholds once calibrated |
| `buildLexicon(...)` | lexicon10 | also merges spellings across all sources; attaches `ta` spellings (store → sidecar → rules); adds outlet short forms and aliases |
| `outletMentions(text, outlets)` | new | whole-name matching over the closed outlet list, where news/tv/daily/the are part of the name |
| `learnAlias(heard, entityId, said: "yes" \| "no")` | new, server-side | the promotion rule of 5.5 |
| `tamilSpellings(name): string[]` | sidecar, offline | IndicXlit En→Ta top-3, filtered by ear key; rule fallback |
| `semPick(q, stories, { entityId?, floor: 0.82, margin: 0.03 })` | sem10 | gates of 4.4 |

### 7.3 Starting thresholds (M)

| Constant | Value | Evidence |
|---|---|---|
| `SURE` (said alone) | 0.90 | v10's value; my must-match scores reached 0.85–1.0 and must-not pairs scored 0.000 (M, measured) |
| `SURE_WITH_CLASS` (storm) / other class | 0.84 / 0.86 | v10's values. The band is decided on the score before the +0.02 class bonus: Murasar + saikilon 0.849 (0.869 shown) → sure; Fenjal + puyal 0.830 (0.850 shown) → ask |
| `ASK_FLOOR` | 0.80 | v10's value |
| `TIE` | 0.03 | v10's value; Rasa's ambiguity threshold plays the same role (B) |
| cut-off rule | 0.88, ask only, loose key ≥ 6 letters, unique prefix | Pallikaranai only; Perungal and Thiruvan wake one entry each (M, measured) |
| key length | under 3 consonants: exact or alias only | IndicSOUNDEX Table 10 (B); Adyar/Avadi |
| embedding floor / margin (e5-base, passage mode) | 0.82 / 0.03 | 4.3; tune on the dev set |
| learned-alias promotion | 2 confirmations | (M) |

### 7.4 Test list

"Now" is v10 as measured (sha1s above). "Fix" names the change that makes a failing case pass.

**Must match (37 cases):**

| # | Heard (as written by the speech-to-text) | Resolves to | Mechanism | Now | Fix |
|---|---|---|---|---|---|
| 1 | Cyclone Aquan latest | Cyclone Akvan | qu/kv, v/w | PASS 0.963 sure | |
| 2 | any update on Akwan cyclone | Cyclone Akvan | w/v | PASS | |
| 3 | Murasar Saikilon news | Cyclone Murasu | class word by ear; ending | PASS 0.869 sure | |
| 4 | saikilon (class word) | storm class | epenthesis | PASS | |
| 5 | அக்வான் புயல் எங்கே | Cyclone Akvan | Tamil script | PASS | |
| 6 | சைக்கிளோன் முரசு | Cyclone Murasu | class word as a Tamil loanword | PASS | |
| 7 | முரசு புயல் | Cyclone Murasu | Tamil | PASS | |
| 8 | Michong cyclone damage | Cyclone Michaung | vowel spelling | PASS | |
| 9 | Fenjal puyal | Cyclone Fengal | g/j | PASS (ask, 0.850) | |
| 10 | Niwar puyal | Cyclone Nivar | w/v | PASS | |
| 11 | Mandus cyclone | Cyclone Mandous | ou/u | PASS | |
| 12 | Vardha cyclone | Cyclone Vardah | dh/d, final h | PASS | |
| 13 | **Palikan** flooding | Pallikaranai | truncation | **FAIL** (0.864) | cut-off → "Pallikaranai?" |
| 14 | Pallikaranaila thanni | Pallikaranai | Tanglish case ending | PASS | |
| 15 | பள்ளிக்கரணையில் தண்ணீர் | Pallikaranai | Tamil locative | PASS | |
| 16 | **Kodungayur** fire | Kodungaiyur | ai/ay | PASS | |
| 17 | கொடுங்கையூரில் தீ | Kodungaiyur | Tamil locative | PASS | |
| 18 | **Kasi medu** harbour | Kasimedu | split | PASS | |
| 19 | காசிமேட்டில் மீன் விலை | Kasimedu | stem change டு→ட்ட | PASS | |
| 20 | **ராஜவுகாந்தி நகர்** தண்ணீர் | Rajiv Gandhi Nagar | Tamil script, voicing, join | PASS 0.964 (needs the Tamil spelling in the entry) | |
| 21 | Velacheri traffic | Velachery | i/y | PASS | |
| 22 | Vela cherry lake | Velachery | split into English words | PASS | |
| 23 | Thiruvotriyur sea erosion | Tiruvottiyur | th/t, ttr | PASS (ask if the district's "Tiruvottriyur" is a separate entry) | merge spellings |
| 24 | Mylapur temple | Mylapore | ore/ur | PASS | |
| 25 | Ennur creek | Ennore | short key | **FAIL** | alias |
| 26 | Adayar river | Adyar | short key | **FAIL** alone; PASS with the district's spelling merged | alias / merge |
| 27 | அடையாற்றில் வெள்ளம் | Adyar | ற்ற, locative | PASS | |
| 28 | Tondiarpettai fish market | Tondiarpet | -pettai | PASS | |
| 29 | Perungudila garbage | Perungudi | Tanglish case | PASS | |
| 30 | Solinganallur IT corridor | Sholinganallur | sh/s | PASS | |
| 31 | Crompet bus stand | Chromepet | chr | **FAIL** (0.807) | chr→kr → 0.970 |
| 32 | **Deccan Chronical** report | Deccan Chronicle | vowel | PASS 0.985 | |
| 33 | டெக்கான் க்ரோனிக்கிள் செய்தி | Deccan Chronicle | Tamil-script loanword | **FAIL** | Tamil spelling (0.973 within script) |
| 34 | Kronikal la enna | Deccan Chronicle | partial name, chr | **FAIL** | short alias + chr→kr |
| 35 | Polymer news | Polimer News | English word, stopword | **FAIL** | outlet matcher (0.970) |
| 36 | போலிமர் நியூஸ் / தந்தி டிவி | Polimer News / Thanthi TV | Tamil-script loanwords | **FAIL** | Tamil spellings (0.982 / 1.000) |
| 37 | Dina Thanthi story / Dhandhi TV / Puthiyathalaimurai news / தினமலர் செய்தி | Daily Thanthi / Thanthi TV / Puthiya Thalaimurai / Dinamalar | aliases, dh/th, join, Tamil | PASS (all 4) | |

**Must not match (32 cases):**

| # | Heard | Must not resolve to | Now |
|---|---|---|---|
| 1 | Akvan cyclone | Cyclone Asuran | PASS |
| 2 | Cyclone Murasu | Cyclone Mocha | PASS |
| 3 | Fengal cyclone | Cyclone Fani | PASS |
| 4 | Michaung cyclone | Cyclone Mandous | PASS |
| 5 | Pallavaram flooding | Pallikaranai | PASS |
| 6 | பல்லாவரம் வெள்ளம் | Pallikaranai | PASS |
| 7 | Kodambakkam fire | Kodungaiyur | PASS |
| 8 | கோடம்பாக்கம் | Kodungaiyur | PASS |
| 9 | Nungambakkam | Kodambakkam | PASS |
| 10 | Dinamalar report | Dinamani | PASS |
| 11 | Dinakaran report | Dinamani | PASS |
| 12 | தினகரன் செய்தி | Dinamani | PASS |
| 13 | Malai Malar report | Dinamalar | PASS |
| 14 | Deccan Herald report | Deccan Chronicle | PASS |
| 15 | The Hindu report | Hindu Tamil Thisai | PASS |
| 16 | Times Now report | Times of India | PASS |
| 17 | Thanthi TV | Daily Thanthi | PASS |
| 18 | Perungudi garbage | Perungalathur | PASS |
| 19 | Thiruvanmiyur beach | Tiruvottiyur | PASS |
| 20 | Adyar river | Avadi | PASS |
| 21 | Royapuram harbour | Royapettah | PASS |
| 22 | Saidapet market | Sowcarpet | PASS |
| 23 | Anna Nagar tower | Anna Salai | PASS |
| 24 | Ashok Nagar | Anna Nagar | PASS |
| 25 | Egmore station | Ennore | PASS |
| 26 | Velachery lake | Villivakkam | PASS |
| 27 | Madhavaram / Teynampet / Washermanpet / Kilpauk hospital | Madipakkam / Tondiarpet / Vyasarpadi / Kolapakkam | PASS (all 4) |
| 28 | a cycle rally | any storm | PASS |
| 29 | மழை வந்திருக்கு | any entity (Vandalur must be in the lexicon for this to test anything) | PASS (Vandalur not in my lexicon) |
| 30 | what is the weather today / open the first news / read the fast news | any entity | PASS |
| 31 | Palikan (with the cut-off rule) | Pallavaram | PASS (0.000) |
| 32 | Perungal / Thiruvan (with the cut-off rule) | Perungudi / Thiruvottiyur | PASS (0.000) |

---

## 8. Recommendations for Jarvis v10

1. **Keep v10's entity layer** (`phon10.earKey`/`phraseSim`, `entity10.findMentions` and its bands) as the name matcher. Do not swap in Soundex, Metaphone, NYSIIS, Match Rating or Beider-Morse: section 2.2 shows each either misses the listed failures or wakes Chennai's look-alike names. Double Metaphone (MIT, 34 KB) is optional, as an extra blocking key for English-origin names only.
2. **Add the cut-off rule.** The heard span is one word whose loose key has at least 6 letters, is not an English word or Tamil grammar, and whose loose key minus the last letter is the prefix of exactly one same-kind entry. Score 0.88 and always ask ("Pallikaranai?"). It is also the one way a place said alone may be asked rather than dropped.
3. **Fold "chr" to "kr"** on both sides before `earKey`/`looseKey`, and give words that start with "ch" a second key with k. This fixes Crompet, Kronikal and க்ரோனிக்கிள்.
4. **Merge spellings into one entry when the lexicon is built, and keep an alias table.**
   - The district's own list spells areas "Adayar" and "Tiruvottriyur".
   - Short names (Adyar/Adayar/Adaiyar, Ennore/Ennur, Avadi) need explicit aliases, because keys under 3 consonants are refused, rightly.
   - Outlets need their short forms (Chronicle, DC, Thanthi, Polimer, PT, TOI).
5. **Give every entity Tamil-script spellings**, because Tamil speech only matches within the script without a class word. Take them from the store's Tamil headlines first. Otherwise generate them offline in the Python sidecar: IndicXlit En→Ta top-3 (MIT), kept only if its ear key equals the English entry's, with a one-time review of the top 100. Use the same spellings in Sarvam's keyterms. Do not use Aksharamukha (AGPL/GPL), AnyAscii (drops vowels) or any network transliteration at run time.
6. **Match outlets with a separate whole-name matcher** over the closed outlet list, in which news, tv, daily and the count as part of the name. "Polymer news" → Polimer News (0.970).
7. **Keep "fast news" → "first" out of the entity layer.** Use a small command vocabulary of ordinals and next/last, with a non-rhotic fold borrowed from Caverphone 2 (drop r after a vowel and before a consonant), and only when the next word is news, story, headline or item.
8. **Use all hypotheses as an n-best.** Run `findMentions` on Sarvam, Whisper-en and Whisper-ta, take the union, add +0.02 for each agreeing hypothesis (at most +0.04), and ask if the hypotheses disagree on the entity. For comparison: n-best raised R@1 from 0.255 to 0.326 for MindMeld, and gave 11.07 % relative error reduction at Alexa.
9. **Use e5-base (already shipped, 9–12 ms a request here) as a second ranker only.**
   - Use it to order an entity's stories, or for requests that name nothing, with a floor of 0.82 and a margin of 0.03 in passage mode.
   - Apply the name gate to Tamil-letter requests too.
   - Gloss Tanglish to English before embedding.
   - Never let cosine pick between two storms or two places: measured margins were 0.05 or less, and some were negative.
   - Do not add LaBSE or BGE-M3 in v10.
10. **Keep the starting bands** (sure 0.90 alone; 0.84 beside a storm's class word, 0.86 beside other class words; ask from 0.80; tie 0.03 → "Akvan or Asuran?"). Log every decision with the user's yes or no. Then calibrate per kind (isotonic or Platt): `SURE` at ≥ 98 % precision on the dev set, the ask floor at ≥ 70 % top-1 precision, and per-action thresholds after Bohus and Rudnicky.
11. **Learn aliases from confirmations.** After two "yes" answers to the same heard form, promote it to sure. Never learn English words, keys under 3 consonants or Tamil grammar. Expire storm aliases with the storm.
12. **Index when the lexicon grows past about 500 entries** (for example, adding the 4,883 district localities). Brute force is p90 8.7 ms at 279 entries and grows linearly. Add an exact ear-key map, a loose-key 3-gram index (edge n-grams weighted) and a prefix map.
13. **Commit the test list in 7.4 as v10 unit tests.** It has 37 must-match rows and 32 must-not rows. Eight must-match rows (nine cases) fail now, each with its fix named, and every must-not row passes. Re-run it after every threshold change.

---

## 9. Not confirmed, and limits

- **Beider-Morse and Metaphone 3 codes were not computed.** No offline implementation was available without installing one, and the BMPM paper itself says "an individual would be very hard-pressed to do the calculations manually" (B). Metaphone 3's licence forbids ports (B).
- **IndicSOUNDEX codes for the examples were not computed.** The paper's text does not give the full 15-code table, and no code is published (B, paper). My statement that it would fail the Tamil-script cases is inferred from its Table 6 (M).
- **My Soundex, NYSIIS and Caverphone implementations were checked only against examples I remember**, not against a fetched reference. Two remembered Caverphone examples did not reproduce. Double Metaphone matches the 9 published examples.
- **Not measured on this laptop:** e5-large, LaBSE, BGE-M3 and IndicSBERT. They are not on disk, and downloading models was outside this task's rules.
- **No Tamil Tatoeba or STS figures were found for e5-base or BGE-M3.** The only Tamil-specific numbers are those cited in 4.2.
- **Elastic's latency table does not state units or hardware** (B). "Seconds" is my reading.
- **Rasa's default numbers** for `threshold` and `ambiguity_threshold` were not found in the documentation; only the example `threshold: 0.7` (B).
- **Google Input Tools' offline status** comes only from low-authority web pages. **open-tamil's licence** is listed as both GPLv3 and MIT.
- **IndicXlit on Python 3.14 and Windows was not tried.** It depends on fairseq, and its last PyPI release is September 2022 (B). A separate older-Python environment may be needed, and fetching its model files needs the owner's approval (M).
- **The similarity tables in 4.3 cover six requests and ten headlines.** They show the failure mode; they are not benchmark numbers. The thresholds derived from them are starting values only.
- **The v10 results reflect files that were being edited during this research** (sha1s at the top). The test list must be re-run.

---

## 10. Sources

Phonetic algorithms:
- [Metaphone (Wikipedia)](https://en.wikipedia.org/wiki/Metaphone)
- [Abydos FAQ (Metaphone 3, BMPM licensing)](https://abydos.readthedocs.io/en/latest/faq.html)
- [Beider and Morse, Beider-Morse Phonetic Matching](https://stevemorse.org/phonetics/bmpm.pdf)
- [DiPersio, IndicSOUNDEX, WWW'21 workshop](https://cdn.amazon.science/86/4e/ebc49f01492d89307dbb45d0faf2/indicsoundex-algorithm-for-text-matching.pdf)
- [Caverphone](https://en.wikipedia.org/wiki/Caverphone)
- [NYSIIS](https://en.wikipedia.org/wiki/New_York_State_Identification_and_Intelligence_System)
- [Match rating approach](https://en.wikipedia.org/wiki/Match_rating_approach)
- [Indian English](https://en.wikipedia.org/wiki/Indian_English)
- [double-metaphone (GitHub)](https://github.com/words/double-metaphone)
- [double-metaphone (npm)](https://registry.npmjs.org/double-metaphone/latest)
- [talisman phonetics](https://yomguithereal.github.io/talisman/phonetics/)
- [talisman (npm)](https://registry.npmjs.org/talisman)

Transliteration:
- [IndicXlit (GitHub)](https://github.com/AI4Bharat/IndicXlit)
- [ai4bharat-transliteration (PyPI)](https://pypi.org/project/ai4bharat-transliteration/)
- [Aksharamukha (GitHub)](https://github.com/virtualvinodh/aksharamukha/)
- [aksharamukha (npm)](https://registry.npmjs.org/aksharamukha/latest)
- [aksharamukha.js](https://aksharamukha.js.org/)
- [@indic-transliteration/sanscript (npm)](https://registry.npmjs.org/@indic-transliteration/sanscript/latest)
- [@indic-transliteration/common_maps (npm)](https://registry.npmjs.org/@indic-transliteration/common_maps/latest)
- [Nisaba (GitHub)](https://github.com/google-research/nisaba)
- [Dakshina dataset (GitHub)](https://github.com/google-research-datasets/dakshina)
- [Kirov et al. 2024, Context-aware transliteration of romanized South Asian languages](https://aclanthology.org/2024.cl-2.2.pdf)
- [AnyAscii (GitHub)](https://github.com/anyascii/anyascii)
- [any-ascii (npm)](https://registry.npmjs.org/any-ascii/latest)

Embeddings:
- [multilingual-e5-small card](https://huggingface.co/intfloat/multilingual-e5-small)
- [multilingual-e5-base card](https://huggingface.co/intfloat/multilingual-e5-base)
- [multilingual-e5-large card](https://huggingface.co/intfloat/multilingual-e5-large)
- [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)
- [Elastic multilingual-e5-small-optimized](https://huggingface.co/elastic/multilingual-e5-small-optimized)
- [LaBSE card](https://huggingface.co/sentence-transformers/LaBSE)
- [LaBSE paper](https://ar5iv.labs.arxiv.org/html/2007.01852)
- [BGE-M3 card](https://huggingface.co/BAAI/bge-m3)
- [IndicSBERT card](https://huggingface.co/l3cube-pune/indic-sentence-similarity-sbert)
- [IndicSBERT paper](https://arxiv.org/pdf/2304.11434)
- [MuRIL paper](https://ar5iv.labs.arxiv.org/html/2103.10730)
- [IndicRAGSuite](https://arxiv.org/pdf/2506.01615)

Entity linking and abstention:
- [Raghuvanshi et al. 2019, Entity resolution for noisy ASR transcripts](https://aclanthology.org/D19-3011.pdf)
- [Zhou, Bao, Campbell 2022, Phonetic embedding for ASR robustness in entity resolution](https://www.isca-archive.org/interspeech_2022/zhou22h_interspeech.pdf)
- [Wang et al. 2021, Leveraging ASR N-best in deep entity retrieval](https://www.isca-archive.org/interspeech_2021/wang21b_interspeech.pdf)
- [Alexa entity resolution](https://developer.amazon.com/en-US/docs/alexa/custom-skills/entity-resolution.html)
- [SiriKit INPersonResolutionResult](https://developer.apple.com/documentation/intents/inpersonresolutionresult)
- [Rasa components (FallbackClassifier)](https://legacy-docs-oss.rasa.com/docs/rasa/components/)
- [Rasa fallback and handoff](https://legacy-docs-oss.rasa.com/docs/rasa/fallback-handoff/)
- [Bohus and Rudnicky 2005](https://www.microsoft.com/en-us/research/publication/principled-approach-rejection-threshold-optimization-spoken-dialog-systems/)
- [Guo et al. 2017](https://arxiv.org/abs/1706.04599)
- [Geifman and El-Yaniv 2017](https://arxiv.org/abs/1705.08500)

JS packages:
- [natural (npm)](https://registry.npmjs.org/natural/latest)
- [fuse.js (npm)](https://registry.npmjs.org/fuse.js/latest)
- [Fuse (GitHub)](https://github.com/krisk/Fuse)
- [flexsearch (npm)](https://registry.npmjs.org/flexsearch/latest)
- [fastest-levenshtein (npm)](https://registry.npmjs.org/fastest-levenshtein/latest)

Internal (read in this worktree):
- `docs/jarvis/JARVIS_V10.md` 4.2
- `docs/jarvis/v8-research/40-tamil-matching.md`
- `docs/jarvis/v10-research/10-sarvam-catalogue.md`
- `chennai-grievance-portal-main/src/lib/thunai/v10/{phon10,entity10,lexicon10,sem10}.ts`
- `src/lib/thunai/v8/match.ts`, `src/lib/thunai/xlit.ts`, `src/lib/assistant/embed.ts`, `scripts/embed-worker.mjs`
- `data/gcc-reference/areas-localities.json` (area names only)
- git log (`fdf8f41b`)
