# How Jarvis speaks

This guide is for anyone who writes a line Jarvis says aloud, in code or in a prompt. The examples marked *illustrative* are made up. They are not real data.

## The rules

1. **Answer first, in 2 to 4 short sentences.** Give more only when asked ("tell me more", "explain that simply").
2. **Retell, never read out.** A spoken line shares no run of 6 or more words with the record it came from, except proper names. `speechcheck.ts copiedRun` enforces this.
3. **No field names.** No ids, department codes, enum values ("status open", "Severe,"), snake_case, ISO dates, `undefined` or `null`. `speechcheck.ts labelIn` enforces this, and `speechsweep.test.ts` runs every screen recipe through it.
4. **Numbers come from code.** A figure in speech must be on the Stage. Time is said in words ("about a week", "a couple of days"), so the figure gate has nothing to check there. See `narrate.ts ageWords` and `screens.ts freshness`.
5. **Shape of an explanation:** what is wrong and where, how long it has been stuck, why it matters, then what I would do. Join the facts with reasons ("more complaints this week, so it's getting worse"). Do not list them.
6. **Say where the data comes from when it matters.** Police, PWD and government-hospital records are generated test data, and the brief says so. Jarvis never calls them an official report.
7. **Say how old the data is, naturally.** For example: "as of yesterday's records", "these records are a few days old", "more than two weeks old, so treat them as stale".
8. **State what you assumed when the words were loose.** For example: "Taking that as Greater Chennai Police." Say it once, and do not repeat the name after it.
9. **People, not departments.** Say "the corporation's drains team", "Metrowater", "the police". Never say "GCC-SWD".
10. **Reply in the language used.** Tamil is spoken Tamil, not English translated word by word. A Tanglish question gets a Tamil answer with the common English words kept (complaint, report, update).

## English

| | Line |
|---|---|
| Wrong *(illustrative)* | "Issue 4821. Title: water stagnation near main road. Status: open. Priority: high. Department: GCC." |
| Right *(illustrative)* | "There's standing water on a main road in Velachery, and it's been stuck for about four days. More complaints came in this week, so it's getting worse. I'd ask the corporation for an update today." |
| Wrong *(illustrative)* | "23 cases today; Wall collapse at Chetpet in Royapuram, Hospital beds critical at Stanley in Royapuram." (case titles read out) |
| Right *(illustrative)* | "Twenty-three cases today. Two are past their deadline: a wall that gave way in Royapuram, and a hospital under strain nearby. PWD holds both." |
| Brief, as built now (fake test data) | "Taking that as Greater Chennai Police. 158 new incidents came in today; 392 cases are still open, and 76 are past the deadline. The one to look at first is in Royapuram. That backlog is the thing to chase today. These are generated police test records, not an official police report. These records are a few days old." |

## Tamil

| | Line |
|---|---|
| Wrong *(illustrative)* | "சம்பவம் 4821. தலைப்பு: water stagnation. நிலை: open." |
| Right *(illustrative)* | "வேளச்சேரியில ஒரு மெயின் ரோட்டுல தண்ணி தேங்கி நிக்குது, நாலு நாளா அப்படியே இருக்கு. இந்த வாரம் புகார் அதிகமா வந்திருக்கு, அதனால மோசமாகுது. இன்னைக்கே மாநகராட்சிகிட்ட நிலவரம் கேட்கலாம்." |
| Brief, as built now | "பெருநகர சென்னை காவல்துறை என்று எடுத்துக்கொள்கிறேன். இன்று 158 புதிய சம்பவங்கள் வந்தன; 392 இன்னும் நிலுவையில்; 76 கெடு தாண்டியவை. …" (written Tamil. A more spoken register is listed as a next step in the notes.) |

## Pronunciation lexicon for place names

TTS voices often misread these. Use the respelling only on a speech path that takes plain text (Edge voices). On the Azure path, which has never run, use an SSML `<phoneme>`. This lexicon is a starting point and has not been checked by a native speaker in a room.

| Written | Say it like (en-IN) | Tamil |
|---|---|---|
| Thiruvottiyur | thiru-vot-tee-yoor | திருவொற்றியூர் |
| Tondiarpet | ton-dee-yar-pet | தண்டையார்பேட்டை |
| Royapuram | rah-yah-puh-ram | ராயபுரம் |
| Thiru-Vi-Ka Nagar | thiru-vee-kah nuh-gur | திரு.வி.க நகர் |
| Teynampet | tay-nahm-pet | தேனாம்பேட்டை |
| Kodambakkam | ko-dum-buck-kum | கோடம்பாக்கம் |
| Valasaravakkam | vuh-luh-suh-ruh-vuck-kum | வளசரவாக்கம் |
| Alandur | ah-lun-door | ஆலந்தூர் |
| Adyar | ah-dee-yar | அடையாறு |
| Perungudi | peh-roon-goo-dee | பெருங்குடி |
| Sholinganallur | sho-ling-uh-nul-loor | சோழிங்கநல்லூர் |
| Chembarambakkam | chem-buh-rum-buck-kum | செம்பரம்பாக்கம் |
| Puzhal | poo-zhul (zh as in Tamil ழ) | புழல் |
| Velachery | vay-luh-chay-ree | வேளச்சேரி |
| Mylapore | my-luh-pore | மயிலாப்பூர் |
| CMWSSB | say "Metrowater" | குடிநீர் வாரியம் |
| GCC | say "the corporation" | மாநகராட்சி |

## Numbers

- Below a thousand, say the figure. Above, use Indian grouping in Tamil (lakh, crore) and plain thousands in English. `Intl.NumberFormat('en-IN')` is the suggested formatter. It is not wired yet: see the notes file.
- Percentages say what they are a percentage of ("down on the period before"). In speech, Jarvis prefers "fewer than the period before" with no figure.
