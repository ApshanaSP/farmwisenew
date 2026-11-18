# 40: Matching spoken Tamil, Tanglish and English to known names and topics

**Date:** 18 Nov 2026 · **Scope:** research only (no code, no commits, no paid calls) · **For:** Jarvis v8 (TypeScript on Node)

**Legend**
- **(B)**: I read this in the cited source during this session.
- **(S)**: I saw it only in a search-result excerpt of the cited source. The page itself did not open or was not read in full, so it carries less weight than (B).
- **(M)**: my own inference or arithmetic. It is not stated in a source. Test it before relying on it.

Hand arithmetic (Jaro-Winkler and Damerau-Levenshtein values below) is (M). It should be confirmed by the unit tests listed at the end.

---

## Summary

1. **The variation follows rules, and a small loose key absorbs most of it (M).** Tamil script does not mark voicing: one letter covers k/g, t/d and p/b, and voicing depends on position (B, [Tamil phonology](https://en.wikipedia.org/wiki/Tamil_phonology)). ற்ற is said [tːr] and in many dialects merges with tt (B, same source). ழ is written "zh" and is often said as /ɭ/ (B, same source). So th/t, dh/d, d/t, zh/l, tt/ttr, aa/a, ee/i, oo/u, v/w and doubled consonants are all one sound class for matching purposes. One Wikipedia article on a single Chennai locality spells it five ways: Tiruvottiyur, Thiruvottriyur, Tiruvottriyur, Thiruvottiyur and Tiruvotriyur (B, [Tiruvottiyur](https://en.wikipedia.org/wiki/Tiruvottiyur)).
2. **No ready-made, permissively licensed JS library does Indic phonetic keys (S/B).** `indic-soundex` is Python and MIT per its README (B). `libindic/soundex` is LGPL-3.0 (B). No JS port was found (S). The JS building blocks that are permissive are `@indic-transliteration/sanscript` (MIT), `talisman` (MIT, which has Jaro-Winkler, Damerau-Levenshtein, Double Metaphone and n-grams), `double-metaphone` (MIT), `fuzzball` (MIT) and Fuse.js (Apache-2.0) (all B). Double Metaphone is a poor fit as the main key: it codes "Th" as theta (`0`), which separates Thiruvottiyur from Tiruvottiyur in the primary code (B, from its source code). Recommendation: write an in-house "Tamil-loose key" of about 40 rules (M).
3. **For matching, rule-based Tamil-to-Latin transliteration beats neural (M).** IndicXlit is MIT. Its Tamil-to-English top-1 accuracy on named entities is only 35.46 (B, [IndicXlit](https://github.com/AI4Bharat/IndicXlit)), and it needs Python and fairseq. A deterministic table from Tamil script into the same loose key is exact, fast and dependency-free. Sarvam and Google romanisation are paid network calls (B), so they do not belong in the hot path.
4. **Case suffixes must be stripped only when a dictionary confirms the stem (M).** The spoken locative is *-le* and the literary one is *-il* (B, [Schiffman](https://books.openedition.org/ifp/7736)). The dative is *-(uk)ku* and the accusative is *-ai* (B, [Tamil grammar](https://en.wikipedia.org/wiki/Tamil_grammar)). Nouns ending in *-am* and *-ṟu* change their stem before a suffix (*maram* → *maratt-il*) (B, same source). Many real names end in *-ai* (Pallikaranai, Chennai) or *-la* (Kerala). So the rule is: strip a suffix only if the unstripped form fails and the stripped stem matches the gazetteer.
5. **Scoring (M):** use Jaro-Winkler on the loose key with standard parameters (p = 0.1, prefix cap 4, boost threshold 0.7) (S). Add a Damerau-Levenshtein ceiling per length band, a separate prefix rule for truncated names, and a margin rule that asks the user to confirm instead of guessing. Jaro-Winkler alone wrongly accepts Dinamalar→Dinamani (≈0.88) and Thiruvanmiyur→Thiruvottiyur (≈0.91) (M, arithmetic). The edit-distance ceiling rejects both.
6. **Evidence from ASR entity correction (B):** retrieving a short, phonetically ranked candidate list and then deciding works. One study keeps up to 10 candidates and reports a 73.6% relative entity-error reduction (B, [arXiv 2409.15353](https://arxiv.org/abs/2409.15353)). Confusion grows as the entity list grows (B, [DANCER](https://arxiv.org/abs/2403.17645)), so keep the gazetteer scoped.

---

## 1. Spelling variation in romanised Tamil and Indian place names

### 1.1 Why the alternations exist (sound to letter)
| Alternation | Cause | Tag / source |
|---|---|---|
| t / th / d / dh (த), ṭ / d (ட) | Tamil script does not mark voicing. Stops are "voiced intervocalically and after nasals except when geminated". | (B) [Tamil phonology](https://en.wikipedia.org/wiki/Tamil_phonology) |
| k / g, p / b, c / s / ch (ச) | Same voicing rule. ச is pronounced [s] in the middle of a word. | (B) same |
| zh / l / z (ழ) | ழ is the retroflex approximant /ɻ/, written "zh". In colloquial speech it shifts to /ɭ/ in the south and /j/ in the north. | (B) same |
| ttr / tr / tt / rr (ற்ற) | Geminated ṟṟ is said [tːr] and in many dialects merges with t̪t̪. This explains Thiruvottiyur vs Thiruvotriyur. | (B) same |
| aa / a, ee / i, oo / u | Tamil has five short and five long vowels. English spellings mark length inconsistently (Mayilaappoor vs Mylapore). | (B) same; examples (B) [The Federal](https://thefederal.com/states/south/tamil-nadu/mayilaappoor-transliteration-by-tn-govt-irks-linguistics-experts) |
| v / w | South Indian spelling variation. `indic-soundex` maps w→v. | (B) [indic-soundex on libraries.io](https://libraries.io/pypi/indic-soundex) |
| doubled / single consonants | Gemination is phonemic in Tamil but often dropped in English spellings (Pallikkaranai vs Pallikaranai). | (B) gemination in [Tamil phonology](https://en.wikipedia.org/wiki/Tamil_phonology); spellings (M) |
| final -u present or absent | Tamil words often end in an enunciative u (அடையாறு *aḍai-ārŭ* vs Adyar). | (B) [Adyar](https://en.wikipedia.org/wiki/Adyar,_Chennai) shows *aḍai-ārŭ*, colloquially *aḍayār* |
| -pet / -pettai, -ai / -ay / -e | English short forms of Tamil endings (Saidapet / Saidapettai). | (B) [The Federal](https://thefederal.com/states/south/tamil-nadu/mayilaappoor-transliteration-by-tn-govt-irks-linguistics-experts) |

- In 2020 the Tamil Nadu government respelled place names (Mylapore→Mayilaappoor, Dharmapuri→Tharumapuri, Saidapet→Saithappettai). Critics called it inconsistent: Madhavaram kept "dh" (B, [The Federal](https://thefederal.com/states/south/tamil-nadu/mayilaappoor-transliteration-by-tn-govt-irks-linguistics-experts)). I believe the order was withdrawn soon after (M, verify). Either way, both spellings now appear in news text, so keep both as aliases (M).
- The UN 1972 romanisation system for Tamil exists. The UN report itself says "There is no evidence of the use of the system" in India (B, [UN WGRS](https://arhiiv.eki.ee/wgrs/rom1_ta.htm)). So no official scheme exists that ASR output or newspapers follow (M).
- One Wikipedia article uses five spellings of Tiruvottiyur, plus the older name Ottriyur (B, [Tiruvottiyur](https://en.wikipedia.org/wiki/Tiruvottiyur)). Adyar has the infobox alias "Adayar" (B, [Adyar](https://en.wikipedia.org/wiki/Adyar,_Chennai)). Daily Thanthi appears as "Dina Thanthi" (article title), "Daily Thanthi" and "Dinathanti" (B, [Daily Thanthi](https://en.wikipedia.org/wiki/Daily_Thanthi)). Pallikaranai is பள்ளிக்கரணை (B, [Pallikaranai](https://en.wikipedia.org/wiki/Pallikaranai)).
- Off-the-shelf fuzzy matchers "overestimate the distance" between Latin transliterations of Indian names. One field team recommends recording names in native script and then applying a standard transliteration (B, [IDinsight](https://www.idinsight.org/article/part-1-whats-in-a-name-combining-datasets-when-unique-identifiers-are-missing/)).

### 1.2 ASR truncation ("Palikan" for Pallikaranai)
- No paper measuring Whisper's truncation of long Tamil names was found (B, search came up empty). Code-switched ASR error (CER) is more than 2× the monolingual rate, and pairs of languages with different scripts do worse (S, [CS-FLEURS](https://arxiv.org/pdf/2509.14161)). A Tanglish Whisper fine-tune's model card says proper nouns remain a weak point (S, self-reported).
- My reading (M): long agglutinative names lose their final syllables, and the final heard syllable is often garbled ("-kan" for "-karanai"). A rule of "heard key minus its last character is a prefix of exactly one gazetteer key" catches this. Whole-string edit distance does not, because DL(palikan, palikaranai) = 4.

### 1.3 Published phonetic keys and libraries: licence check
| Tool | What it does | Licence | Usable from JS/TS? | Tag |
|---|---|---|---|---|
| `indic-soundex` (PyPI, maverickMehul) | Soundex for Indian names in Latin script: zh→l, w→v, q→k, f→ph, x→ks; th/dh become separate codes T/D; doubled letters collapse; aa→a, ee→i, oo→u, ai→e, au→o; length 4 by default | README says MIT; libraries.io shows "Other" | Python only; port the rules (no JS port found) | (B) [libraries.io](https://libraries.io/pypi/indic-soundex); no JS port (S) |
| `libindic/soundex` (SILPA) | Soundex across Indic scripts and English, so cross-script codes compare | **LGPL-3.0** on GitHub; PyPI lists LGPLv2+ | Avoid copying code (copyleft); reuse the idea only | (B) [GitHub](https://github.com/libindic/soundex); PyPI (S) |
| IndicSOUNDEX (Amazon, 2021) | SOUNDEX variant "collapsing spelling differences" across 9 Indic languages and English | No code linked | Paper only | (B) [amazon.science](https://www.amazon.science/publications/indicsoundex-algorithm-for-text-matching) |
| Double Metaphone (`double-metaphone`, wooorm) | English-oriented phonetic code with primary and secondary forms | MIT, ESM-only, typed | Yes | (B) [GitHub](https://github.com/words/double-metaphone) |
| `talisman` | jaro-winkler, damerau-levenshtein, double-metaphone, fuzzy-soundex, phonex, ngrams, fingerprint keyers | MIT | Yes | (B) [docs](https://yomguithereal.github.io/talisman/), [GitHub](https://github.com/Yomguithereal/talisman) |
| Microsoft `phoneticmatching` | English G2P plus phonetic distance; EnPlaceMatcher | MIT | Yes, but needs native C++ via node-gyp; English-only pronouncer | (B) [docs](https://microsoft.github.io/PhoneticMatching/) |
| `fuzzball` | ratio, partial_ratio, token_set_ratio, WRatio | MIT (per GitHub sidebar) | Yes | (B) [GitHub](https://github.com/nol13/fuzzball.js) |
| Fuse.js | Bitap approximate search | Apache-2.0 | Yes | (B) [GitHub](https://github.com/krisk/Fuse) |
| fuzzywuzzy (Python original) | Token ratios | GPL-2.0 as I recall (**not usable**) | No | (M) not checked this session |

**Double Metaphone limits for Tamil (B, then M).** From the source: "TH" gives primary `0` and secondary `T`, unless Germanic rules apply. "DH" becomes `T`. "ZH" becomes `J` ([index.js](https://raw.githubusercontent.com/words/double-metaphone/main/index.js)). So (M):
- Thiruvottiyur and Tiruvottiyur differ in the primary code.
- Thamizh (…J) does not match Tamil (…L).
- Vowels after the first letter are dropped, so short names collide: Adyar and Otteri both reduce to roughly "ATR".

Double Metaphone is "designed for… lists of proper names" with "minimal ranking ability" (S, [CodeProject](https://www.codeproject.com/KB/string/dmetaphone6.asp)). Use it, if at all, only for retrieving candidates, never for accepting a match.

**`indic-soundex` limits (M):** it keeps th (T) apart from t, so it does not merge the Tamil romanisation alternation th/t. Its 4-character code is too coarse for 500 Chennai names, many of which start with Thiru- or end in -pakkam.

---

## 2. Tamil morphology on names

### 2.1 Case markers (written / spoken / Tanglish)
| Case | Literary (script) | Spoken / Tanglish forms seen in ASR | Tag / source |
|---|---|---|---|
| Locative "in/at" | -il (இல்); -iṭam for people | -le, -la, -lae; joined (Adyarla) or separate (Adyar la, Adyar-il) | -il, -le (B) [Schiffman](https://books.openedition.org/ifp/7736); -la spelling (M); the source says spoken -le "cannot occur with human or animate noun phrases" (B) [Schiffman node6](https://ccat.sas.upenn.edu/~haroldfs/dravling/case/node6.html) |
| Dative "to/for" | -(uk)ku (க்கு / உக்கு) | -ku, -kku, -ukku; on English nouns, "driver-kku" | (B) [Tamil grammar](https://en.wikipedia.org/wiki/Tamil_grammar); "driverkku" (B) [Tanglish](https://en.wikipedia.org/wiki/Tanglish) |
| Accusative | -ai (ஐ) | -e, -a; "journey-ai" | (B) [Tamil grammar](https://en.wikipedia.org/wiki/Tamil_grammar), [Tanglish](https://en.wikipedia.org/wiki/Tanglish); spoken -e (S) |
| Sociative / spoken genitive | -ōṭu, -uṭaṉ (ஓடு, உடன்) | -oda, -ooda, -ode; "teacher-oḍa" means "of the teacher" | ōḍu/ōḍe (B) [Schiffman](https://books.openedition.org/ifp/7736); -oḍa (B) [Tanglish](https://en.wikipedia.org/wiki/Tanglish) |
| Instrumental | -āl (ஆல்) | -aale | (B) [Schiffman](https://books.openedition.org/ifp/7736) |
| Ablative "from" | -il + iruntu (இலிருந்து) | -lerundhu, -la irundhu, -lendhu | (B) Schiffman: "locative case marker plus a postposition irundu"; -lendhu (M) |
| Genitive / euphonic | -iṉ (இன்), -uṭaiya | -in, -oda | (B) [Tamil grammar](https://en.wikipedia.org/wiki/Tamil_grammar) |
| Person "with/to" | -iṭam | -kitta, -kitte | (B) [Schiffman node6](https://ccat.sas.upenn.edu/~haroldfs/dravling/case/node6.html) |
| Clitics (not case) | -um "also", -ā question, -ē emphasis | -um, ah/aa ("news ah"), -e | (M) |

### 2.2 Stem changes before suffixes (these matter for un-stripping)
- **-am nouns:** final -am becomes -att(u)-, as in *maram* → *maratt-il* (B, [Tamil grammar](https://en.wikipedia.org/wiki/Tamil_grammar)). So Kodambakkam-la is heard as "Kodambakkathula" and Kodambakkam-il as "Kodambakkathil" (M).
- **-ṭu / -ṟu nouns:** the consonant doubles (*vīṭu* → *vīṭṭ-*) (B, same). So அடையாறு + il gives அடையாற்றில் "Adaiyaatril", next to the looser அடையாறில் (M).
- **Glide insertion:** -y- or -v- is inserted between vowels (B, same, which says Tamil requires "euphonic changes during agglutination"). So Chennai + il gives Chennaiyil, Pallikaranai + la gives Pallikaranaiyila, and Hindu + oda gives Hinduvoda (M).

### 2.3 Safe stripping (M)
- Strip only when it is confirmed. First try the token unstripped. If it matches (exact key or fuzzy pass), stop. This protects Pallikaranai, Chennai, Kerala, Manali and Kovil.
- Otherwise try each suffix from the list in §R.4, longest first. Keep a stripped form only if:
  - the remaining stem has at least 4 characters,
  - the stem (after the oblique repair in §R.4) passes the same thresholds as an unstripped token, and
  - it beats every unstripped candidate.
- Never strip from tokens in the protected list: gazetteer names that themselves end in a suffix string, such as Kerala, Manali and Perumal Kovil.

---

## 3. Transliteration (Tamil script ↔ Latin) for matching

| Option | Direction | Proper-noun quality | Licence / cost | Runtime | Tag |
|---|---|---|---|---|---|
| In-house table (ISO-15919-like, collapsed into the loose key) | Tamil → Latin key | Deterministic. It only needs to land in the same loose key as the gazetteer, not produce a "nice" spelling | Own code | ~1 µs per token | (M) |
| `@indic-transliteration/sanscript` | Many schemes: `tamil`, `tamil_superscripted`, `iso`, `itrans`, `itrans_dravidian`, `iast` | Deterministic scheme conversion; Tamil-to-Latin not shown in the README | MIT | JS | (B) [GitHub](https://github.com/indic-transliteration/sanscript.js) |
| IndicXlit (AI4Bharat) | Roman ↔ native, 21 languages, about 11M parameters | Tamil-to-English top-1: 45.08 on native words, **35.46 on named entities**. English-to-Tamil: 42.12 on named entities | "The IndicXlit code (and models) are released under the MIT License." | Python and fairseq; no ONNX mentioned | (B) [GitHub](https://github.com/AI4Bharat/IndicXlit) |
| Aksharantar dataset | 26M word pairs, 21 languages | Includes a named-entity test set | CC-BY for manual data, CC0 for mined data | Offline data | (S) [HF card](https://huggingface.co/datasets/ai4bharat/Aksharantar) |
| Sarvam `/transliterate` | ta-IN ↔ en-IN | Not stated | API key; price not on the page | Network | (B) [docs](https://docs.sarvam.ai/api-reference-docs/text/transliterate) |
| Google `romanizeText` | Tamil → Latin (Advanced v3 only) | Not stated | Priced per character | Network | (S) [docs](https://cloud.google.com/translate/docs/advanced/romanize-text) |

**Recommendation (M).** Use the in-house table at runtime. You could optionally run IndicXlit offline (in a build script, never on the hot path) to generate Tamil-script and alternate Latin spellings for each gazetteer entry, then hand-check them into the alias list. Do not use the network APIs: they add latency, cost and a privacy surface for no gain over a key-space match.

---

## 4. Fuzzy matching for short spoken fragments

- **Jaro-Winkler.** Standard parameters are prefix scale p = 0.1, maximum prefix length 4 and boost threshold 0.7. Keep p ≤ 0.25, otherwise scores leave the 0–1 range (S, [R comparator](https://search.r-project.org/CRAN/refmans/comparator/html/JaroWinkler.html), [edits gem](https://www.rubydoc.info/gems/edits/Edits/JaroWinkler)). It was designed for names at the US Census Bureau (S, same).
- **False positives.** On short identifiers (not personal names), Jaro-Winkler gave the most false positives at a 20% threshold (34.2% vs 20.3% for Levenshtein). It reached zero false positives only at 0.99 (S, [arXiv 1305.0688](https://arxiv.org/pdf/1305.0688)). Lesson (M): never use Jaro-Winkler alone on short keys; pair it with an edit-distance ceiling.
- **Hybrids.** A hybrid of TF-IDF weighting with Jaro-Winkler as the inner similarity (SoftTFIDF) did best in the classic name-matching comparison (S, [Cohen, Ravikumar, Fienberg 2003](https://www.cs.cmu.edu/~wcohen/postscript/ijcai-ws-2003.pdf)). This suits headlines (many tokens), not single place names (M). One practitioner write-up uses Jaro-Winkler ≥ 0.88 for short names and falls back to char-n-gram TF-IDF for long ones (S).
- **Token-set ratio trap.** token_set_ratio "returns 100.0 if one string is a subset of the other" (B, [RapidFuzz](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html)). That makes "Anna" score 100 against both Anna Nagar and Anna Salai. Do not use it to accept place names (M).
- **ASR entity correction.** Apple's detect → retrieve → regenerate pipeline:
  - computes normalised phonetic distance as edit distance over phonemes divided by the query length;
  - keeps candidates where "the NPD is no greater than 1.2 times the best NDP" or NPD < 0.2;
  - keeps at most 10 candidates (10 was best; 20 was worse);
  - notes that edit distance ignores which phonemes are similar.

  It reports a 73.6% relative named-entity error reduction (B, [arXiv 2409.15353 html](https://arxiv.org/html/2409.15353)). DANCER notes that as the entity list grows, "homophone ambiguities increase substantially", and gets a 46% relative CER cut on a homophone-heavy set (B, [arXiv 2403.17645](https://arxiv.org/abs/2403.17645)). PARCO prunes biasing lists by phoneme similarity to cut false positives (S, [arXiv 2509.04357](https://arxiv.org/pdf/2509.04357)).
- **Takeaway for Jarvis (M):** an exact match on the loose key, plus a guarded fuzzy match, plus a prefix rule, plus "confirm when it is close". If still unresolved, pass the top 3–5 candidates (not the whole gazetteer) to the LLM. Scope the gazetteer to the current context (today's headlines plus the office's wards and localities) to keep homophone density low.

---

## 5. Tanglish / Tamil reference words and verbs

| Meaning | Forms to accept (Latin) | Tamil script | Tag |
|---|---|---|---|
| first | first, 1st, mudhal, modhal, mudhalaavadhu, muthalaavathu, onnaavadhu | முதல், முதலாவது, ஒண்ணாவது, ஒன்றாவது | muthalaavathu / முதலாவது (S) [MSU](https://openbooks.lib.msu.edu/basictamil/chapter/chapter-1-6-numbers-in-tamil/); spoken variants (M) |
| second | second, 2nd, rendaavadhu, rendavadhu, irandaavathu, randaavadhu | இரண்டாவது, ரெண்டாவது, இரண்டாம் | irandaavathu / இரண்டாவது and formal -ām (S) [MSU](https://openbooks.lib.msu.edu/basictamil/chapter/chapter-1-6-numbers-in-tamil/), [Preply](https://preply.com/en/blog/numbers-in-tamil); rendavadhu (M) |
| third…fifth | third, moonaavadhu, moondraavadhu; naalaavadhu / naangaavadhu; anjaavadhu | மூன்றாவது, மூணாவது; நான்காவது, நாலாவது; ஐந்தாவது, அஞ்சாவது | moonraavathu (S); rest (M) |
| last | last, kadaisi, kadasi, kadaisila | கடைசி | "final, last" (B) [Wiktionary](https://en.wiktionary.org/wiki/கடைசி) |
| next / previous | next, adutha, aduththa / previous, munnadi, mundhaiya | அடுத்த / முந்தைய, முன்னாடி | (M) |
| that / it (distal) | andha, antha, anda (adjective "that"); adhu, athu ("that one / it") | அந்த; அது | (M) |
| this (proximal) | indha, intha; idhu, ithu | இந்த; இது | (M) |
| same | adhe, athe | அதே | (M) |
| about | pathi, patthi, patri | பத்தி, பற்றி | (M) |
| news | news, seidhi, seithi, seidhigal | செய்தி, செய்திகள் | (M) |
| open | open pannu, open panni, open pannunga, thira | திற | verbaliser "drive paṇṇu" (B) [Tanglish](https://en.wikipedia.org/wiki/Tanglish); rest (M) |
| read | padi, padinga, padichu kaattu, vaasi | படி, படிங்க, வாசி | "to read, recite, chant", synonym vāci (B) [Wiktionary படி](https://en.wiktionary.org/wiki/படி) |
| tell / say | sollu, sollunga, solla | சொல்லு, சொல்லுங்க | *sollu* "say" (B) [Schiffman node6](https://ccat.sas.upenn.edu/~haroldfs/dravling/case/node6.html) |
| show | kaattu, kaatu, kaanbi | காட்டு, காண்பி | "show, exhibit", synonym kāṇpi (B) [Wiktionary காட்டு](https://en.wiktionary.org/wiki/காட்டு) |
| want to know | therinjukkanum, therinjikkanum, theriyanum, venum | தெரிஞ்சுக்கணும், தெரியணும், வேணும் | (M) |
| play / put on | podu, poodu | போடு | (M) |

**Traps (M):**
- **Padi is a Chennai locality** as well as the verb "read".
- "**Andha**" is a prefix of "Andhra". Match function words by exact key only, never by fuzzy match.
- "**Second** Line Beach" and "**First** Avenue" are street names, not ordinals.
- "**rendu** news" means *two* items (a cardinal), not "the second item".

---

## Recommendations for Jarvis v8

### R.1 Pipeline (in order)
1. **Script split.** Find runs of Tamil script (U+0B80–U+0BFF) and transliterate them with the table in R.2. Leave Latin runs as they are.
2. **Clean.** Apply NFKD, drop combining marks (ā→a, ṭ→t, ḷ→l, ṉ→n), and lowercase. Turn `-`, `'`, `.`, `,` and `?` into spaces. Merge runs of single letters ("d t next" → "dt next"). Map spoken letter names before merging (dee→d, tee→t).
3. **Tokenise and tag function words** by exact loose-key lookup in the §5 lists:
   - Tag verbs, ordinals, demonstratives, "news/seidhi", "pathi", and standalone clitics (la, le, il, ku, kku, ukku, ah, aa, oda, um, e).
   - Remove them from the entity span and keep them as slots (action, ordinal, reference).
   - A token in the gazetteer's protected list (Padi, Second Line Beach) is tagged as an entity when it is followed by news/la/pathi or another entity word (M).
4. **Candidate spans.** Take every remaining n-gram of 1 to 4 tokens. Key each one joined with spaces and joined without spaces, so "Dina Thanthi" and "Dinathanthi" meet.
5. **Stems.** For each span, the candidates are the unstripped form, then each suffix-stripped form (R.4) with oblique repair.
6. **Key** every candidate and every gazetteer alias with the Tamil-loose key (R.3).
7. **Score and decide** (R.5).

### R.2 Tamil script → Latin table (into key space; ~50 entries)
- **Independent vowels:** அ a, ஆ aa, இ i, ஈ ii, உ u, ஊ uu, எ e, ஏ ee, ஐ ai, ஒ o, ஓ oo, ஔ au.
- **Vowel signs:** ா aa, ி i, ீ ii, ு u, ூ uu, ெ e, ே ee, ை ai, ொ o, ோ oo, ௌ au. ் (pulli) removes the inherent "a". ஃ becomes nothing.
- **Consonants:** க k, ங ng, ச s, ஞ nj, ட t, ண n, த t, ந n, ப p, ம m, ய y, ர r, ல l, வ v, ழ l, ள l, ற r, ன n.
- **Grantha:** ஜ j, ஷ s, ஸ s, ஹ h, ஶ s, க்ஷ ks, ஸ்ரீ sri.
- **Clusters first:** ற்ற → ttr, ன்ற → ntr, ஞ்ச → nj, ங்க → nk.
- **Check (M):** பள்ளிக்கரணை → pallikkaranai → key *palikaranai*; திருவொற்றியூர் → tiruvottriyuur → key *tiruvotiyur*; தினத்தந்தி → tinattanti → key *tinatanti*; அடையாறு → ataiyaaru → key *atayar*.

### R.3 The Tamil-loose key (apply to both sides, in this order) (M)
1. Keep a–z and space only.
2. Digraphs first: `zh→l`, `sh→s`, `ch→s`, `ph→p`, `f→p`, `q→k`, `x→ks`, `w→v`, `z→s`.
3. Drop `h` after any consonant (th, dh, kh, gh, bh, jh). Keep a word-initial `h` (Hindu).
4. Voicing collapse: `d→t`, `g→k`, `b→p`. This follows Tamil script, which does not mark voicing.
5. `ttr→t`, `tr→t` only when the next letter is `i` or `y` (otriy/ottriy → otiy).
6. Vowels: `aa→a`, `ee→i`, `ii→i`, `oo→u`, `uu→u`, `aiy→ay`, a final `y` or `ey` becomes `i`.
7. Collapse doubled letters (`ll→l`, `kk→k`, `tt→t`, …).
8. Drop a final `u` after a consonant if the key is longer than 4 characters (Adaiyaaru → atayar).
9. For multi-word names, produce a spaced key and a joined key. A leading `the` is dropped as a stop word.

Check (M):
- Thiruvottiyur, Tiruvottiyur and Thiruvottriyur all give *tiruvotiyur*.
- Velachery and Velacheri both give *velaseri*.
- Adyar gives *atyar*; Adaiyar and Adayar give *atayar* (DL 1 from *atyar*).
- Thamizh gives *tamil*.

### R.4 Suffix list (try longest first; dictionary-guarded) (M)
- **Latin (on the cleaned lowercase token, before keying):**
  - Ablative: `ilirundhu, ilirunthu, lerundhu, lirundhu, lendhu, lerunthu`
  - Glide + locative: `yila, yile, yil, vila, vil`
  - Locative: `ula, ule, ile, ila, il, la, le, lae`
  - Dative: `ukku, kku, ku, yikku, vukku`
  - Spoken genitive / sociative: `voda, vooda, oda, ooda, ode, odu`
  - Instrumental: `aale, aal`
  - Euphonic / genitive: `in, yin`
  - Person: `kitta, kitte`
  - Accusative: `yai, ai, ya, e`
  - Clitics: `um, yum, aa, ah`
- **Tamil script:** transliterate first (R.1 step 1), then strip with the Latin list above. Don't strip on script: the suffix vowel is often a sign fused onto the stem's last consonant. In அடையாறில், for example, the "i" is the sign ி on ற. Tamil script endings and the Latin forms they become: இலிருந்து → ilirundu, யில் → yil, வில் → vil, இல் → il, ல / ல்ல → la / lla, க்கு → kku, உக்கு → ukku, ஓட / ஓடு → oda / odu, உடன் → udan, இன் → in, ஆல் → aal, ஐ / யை → ai / yai, உம் → um, ஆ → aa, ஏ → ee. Add `lla, udan, ilirundu` to the Latin list.
- **Oblique repair, tried after a strip:**
  - stem ends `ath|att|athu|attu|atthu` → `+am` (Kodambakkathula → Kodambakkam)
  - stem ends `atr|attr|aatr` → `ar` (அடையாற்றில் → atayar)
  - stem ends `tt` → `t` + `u` (vīṭṭ- → vīṭu)
- **Guards:**
  - The unstripped form wins if it passes.
  - The stem must be at least 4 key characters.
  - Never strip a protected-list name.
  - Accusative `ai/e/ya` and clitic `aa` may be stripped only if no other candidate in the utterance passed.

### R.5 Scoring and thresholds (M; tune on the tests below)
| Heard key length | Accept if | Notes |
|---|---|---|
| ≤ 3 | exact alias key only | Acronyms (DT, TVK) go through the alias list |
| 4–7 | JW ≥ 0.90 **and** DL ≤ 1 | JW with p = 0.1, ℓ = 4, boost threshold 0.7 |
| ≥ 8 | JW ≥ 0.88 **and** DL ≤ 2 | DL = Damerau-Levenshtein on keys |
| Multi-word gazetteer names | joined key passes the row above **and** every distinctive token passes on its own | Generic tokens that don't count as distinctive: nagar, salai, road, street, main, east, west, north, south, colony, the |
| **Prefix rule** (truncation) | heard key ≥ 5 chars; heard minus its last char is a prefix of the gazetteer key; gazetteer key ≥ heard + 2; ≥ 5 shared chars; **exactly one** entity has that prefix | Only when no fuzzy candidate passed. Act, but echo the full name ("Pallikaranai news…") |
| **Margin** | best − second ≥ 0.04 | Otherwise ask: "Adyar or Ayanavaram?" |
| Nothing passes | send the top 5 candidates by JW to the LLM, as in the Apple paper's top-k retrieval | Never send the whole gazetteer |

Preference order when several candidates pass: exact alias > unstripped fuzzy > stripped fuzzy > prefix rule.

**Headlines (~200) (M):** treat them as documents.
- Key every token of the query (after removing function words) and every headline token.
- Soft-match each query token to its best headline token, counting it if JW ≥ 0.90 and the DL band holds.
- Score = IDF-weighted share of the query's tokens that matched (SoftTFIDF style).
- Accept if score ≥ 0.6 and it beats the runner-up by ≥ 0.15. Otherwise read back the top 2–3 titles.
- Add bilingual topic aliases: Supreme Court ↔ உச்ச நீதிமன்றம் / uchcha needhimandram; High Court ↔ உயர் நீதிமன்றம்; rain ↔ mazhai / மழை; flood ↔ vellam / வெள்ளம்; Corporation ↔ maanagaraatchi / மாநகராட்சி.
- Ordinals ("rendavadhu") index the list most recently read out. andha/adhu points to the last-mentioned item, and idhu/indha to the item on screen.

**Implementation note (M):** Jaro-Winkler and Damerau-Levenshtein (restricted / OSA) are each about 30 lines of TypeScript. Write them in-house with unit tests rather than taking a dependency. `talisman` (MIT) works as a reference oracle in tests. 500 names × ~4 aliases × ~20 spans is about 40k comparisons per utterance, which should take well under 10 ms in Node (M, not measured).

### R.6 Test pairs
JW and DL values are hand-computed on keys (M). Encode them as unit tests and let the code be the arbiter.

**Must match (heard → intended)**
| # | Heard | Intended | Path |
|---|---|---|---|
| 1 | Palikan | Pallikaranai | prefix rule (*palika…*, unique); DL 4, so fuzzy alone fails |
| 2 | Pallikaranai la | Pallikaranai | standalone clitic dropped |
| 3 | Pallikaranaila | Pallikaranai | strip `la` |
| 4 | Pallikaranaiyila | Pallikaranai | strip `yila` |
| 5 | பள்ளிக்கரணையில் | Pallikaranai | transliterate → *pallikkaranaiyil* → strip `yil` → key exact |
| 6 | Pallikkaranai | Pallikaranai | double collapse → exact |
| 7 | Adyar la | Adyar | clitic |
| 8 | Adyar-il | Adyar | hyphen → clitic |
| 9 | Adyarla / Adyarle | Adyar | strip `la` / `le` |
| 10 | Adyarukku | Adyar | strip `ukku` |
| 11 | அடையாறில் | Adyar | strip, then *atayar* vs *atyar* DL 1, JW ≈ 0.90 |
| 12 | அடையாற்றில் | Adyar | *ataiyaattril* → strip `il` → repair `attr→ar` → *ataiyaar* → key *atayar* |
| 13 | Adaiyar / Adayar | Adyar | `aiy→ay`; alias |
| 14 | Tiruvottiyur | Thiruvottiyur | key exact |
| 15 | Thiruvotriyur | Thiruvottiyur | `tr(i)→t`, key exact (otherwise DL 1) |
| 16 | Thiruvottriyur | Thiruvottiyur | `ttr→t` |
| 17 | திருவொற்றியூர் | Thiruvottiyur | ற்ற → ttr → key exact |
| 18 | Thiruvottiyurla | Thiruvottiyur | strip `la` |
| 19 | Velacheri / Velachery-la | Velachery | `y→i`; clitic |
| 20 | Kodambakkathula | Kodambakkam | strip `la` + `athu→am` |
| 21 | Chennaiyila | Chennai | strip `yila` |
| 22 | Mayilaappoor / Mylai | Mylapore | aliases |
| 23 | Thamizh Nadu | Tamil Nadu | `zh→l`, `th→t` |
| 24 | Daily Thanthi | Dina Thanthi | alias |
| 25 | Dinathanthi | Dina Thanthi | joined key *tinatanti* |
| 26 | தினத்தந்தி | Dina Thanthi | Tamil key exact |
| 27 | Dhinamalar / தினமலர் | Dinamalar | `dh→t` / key exact |
| 28 | D.T. Next / dee tee next | DT Next | dots → letters merged |
| 29 | Hinduvoda news / The Hindu-oda | The Hindu | strip `voda` / `oda`; `the` dropped |
| 30 | Supreme Court news open pannu | topic Supreme Court; action open | verb tags |
| 31 | andha Pallikaranai news ah padi | place Pallikaranai; ref "that"; action read | `ah` clitic; `padi` at the end is a verb |
| 32 | rendavadhu news | ordinal 2 | |
| 33 | இரண்டாவது செய்தி படி | ordinal 2; action read | |
| 34 | kadaisi news sollu | ordinal last; action tell | |
| 35 | mudhal news kaattu | ordinal 1; action show | |
| 36 | Dinamalr (ASR drop) | Dinamalar | DL 1 |

**Must NOT match (near misses)**
| # | Heard | Must not become | Why it is rejected |
|---|---|---|---|
| N1 | Adyar | Ayanavaram | JW ≈ 0.76 |
| N2 | Adyar | Otteri | Same Double Metaphone skeleton (≈ATR); JW ≈ 0.60 on keys |
| N3 | Dinamalar | Dinamani | JW ≈ 0.88 (passes JW alone!) but DL 3 > 2 |
| N4 | Thiruvanmiyur | Thiruvottiyur | JW ≈ 0.91 but DL 3 > 2 |
| N5 | Kodambakkam | Nungambakkam | JW ≈ 0.84; DL ≥ 3 |
| N6 | Egmore | Ennore | JW ≈ 0.84; DL 2 > 1 |
| N7 | Anna Nagar | Anna Salai | distinctive token nagar ≠ salai (token-set would score 100 on "Anna") |
| N8 | Anna | Anna Nagar / Anna Salai | ambiguous: confirm, do not pick |
| N9 | Pallava | Pallavaram / Palavakkam | prefix not unique: confirm |
| N10 | Thiru | any Thiru- name | prefix < 5 and not unique |
| N11 | Kerala | "Ker" | unstripped exact wins; `la` not stripped |
| N12 | Pallikaranai | "Pallikaran" | unstripped exact wins; `ai` not stripped |
| N13 | Perumal Kovil | "Kov" | stem < 4; protected |
| N14 | Hindu Tamil (Thisai) | The Hindu | multi-word alias is longer and more specific |
| N15 | Thanthi TV | Dina Thanthi | separate entity; "Thanthi" alone means confirm |
| N16 | Dinakaran | Dina Thanthi / Dinamalar | JW below band; DL > 2 |
| N17 | Andhra Pradesh news | demonstrative "andha" | function words match exactly only |
| N18 | Second Line Beach | ordinal 2 | protected street name |
| N19 | Padi news | verb "read" | Padi is a locality; followed by "news" |
| N20 | rendu news sollu | ordinal 2 | cardinal "two items", not "the second" |
| N21 | Velachery | Valasaravakkam | JW below band |
| N22 | Saidapet | Sowcarpet | JW below band (verify) |

---

## Sources (opened this session unless marked S)
- **Phonology and grammar:** [Tamil phonology](https://en.wikipedia.org/wiki/Tamil_phonology) · [Tamil grammar](https://en.wikipedia.org/wiki/Tamil_grammar) · [Schiffman, Tamil case system](https://books.openedition.org/ifp/7736) · [Schiffman spoken case node6](https://ccat.sas.upenn.edu/~haroldfs/dravling/case/node6.html) · [Tanglish](https://en.wikipedia.org/wiki/Tanglish) · [Wiktionary படி](https://en.wiktionary.org/wiki/படி) · [காட்டு](https://en.wiktionary.org/wiki/காட்டு) · [கடைசி](https://en.wiktionary.org/wiki/கடைசி) · (S) [MSU numbers](https://openbooks.lib.msu.edu/basictamil/chapter/chapter-1-6-numbers-in-tamil/)
- **Place names:** [Tiruvottiyur](https://en.wikipedia.org/wiki/Tiruvottiyur) · [Pallikaranai](https://en.wikipedia.org/wiki/Pallikaranai) · [Adyar](https://en.wikipedia.org/wiki/Adyar,_Chennai) · [Daily Thanthi](https://en.wikipedia.org/wiki/Daily_Thanthi) · [The Federal on 2020 respelling](https://thefederal.com/states/south/tamil-nadu/mayilaappoor-transliteration-by-tn-govt-irks-linguistics-experts) · [UN WGRS Tamil](https://arhiiv.eki.ee/wgrs/rom1_ta.htm) · [IDinsight](https://www.idinsight.org/article/part-1-whats-in-a-name-combining-datasets-when-unique-identifiers-are-missing/)
- **Libraries:** [IndicXlit](https://github.com/AI4Bharat/IndicXlit) · [indic-soundex](https://libraries.io/pypi/indic-soundex) · [libindic soundex](https://github.com/libindic/soundex) · [IndicSOUNDEX](https://www.amazon.science/publications/indicsoundex-algorithm-for-text-matching) · [sanscript.js](https://github.com/indic-transliteration/sanscript.js) · [talisman](https://yomguithereal.github.io/talisman/) · [double-metaphone](https://github.com/words/double-metaphone) · [fuzzball](https://github.com/nol13/fuzzball.js) · [Fuse.js](https://github.com/krisk/Fuse) · [MS PhoneticMatching](https://microsoft.github.io/PhoneticMatching/) · [RapidFuzz](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html) · [Sarvam](https://docs.sarvam.ai/api-reference-docs/text/transliterate) · (S) [Google romanizeText](https://cloud.google.com/translate/docs/advanced/romanize-text) · (S) [Aksharantar](https://huggingface.co/datasets/ai4bharat/Aksharantar)
- **Matching and ASR papers:** [Apple phonetic retrieval, arXiv 2409.15353](https://arxiv.org/html/2409.15353) · [DANCER, arXiv 2403.17645](https://arxiv.org/abs/2403.17645) · (S) [PARCO](https://arxiv.org/pdf/2509.04357) · (S) [Cohen et al. 2003](https://www.cs.cmu.edu/~wcohen/postscript/ijcai-ws-2003.pdf) · (S) [arXiv 1305.0688](https://arxiv.org/pdf/1305.0688) · (S) [CS-FLEURS](https://arxiv.org/pdf/2509.14161) · (S) [JW parameters, R comparator](https://search.r-project.org/CRAN/refmans/comparator/html/JaroWinkler.html)
