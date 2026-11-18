# Sarvam speech to text in Jarvis (v8)

For the owner. Written 18 Nov 2026. Nothing here has been run against Sarvam: no account exists, no key exists, and no Sarvam endpoint was called. Every test so far uses a mocked Sarvam. The prices and limits come from desk research (`docs/jarvis/v8-research/30-sarvam.md`). Check them on Sarvam's own pages at checkout.

## What it is

Jarvis hears today with Groq's Whisper. Each engaged or named sentence is decoded twice at once, once forced to English and once forced to Tamil, and the surer decode wins. Whisper is weak on Tamil, and weaker still on Tanglish.

Sarvam AI is an Indian speech-to-text service. Its `saaras:v4` model has a **codemix** mode, which writes English words in English letters and Tamil words in Tamil script. For example: `Adyar zone-ல pending cases எத்தனை?`. That is the form Jarvis's place and department matching already reads.

v8 adds Sarvam as **one more way to hear**. It sits behind one setting and is **off by default**. With the setting off, Jarvis hears exactly as it does today.

- **Where it runs:** only on engaged and named turns. Room talk (the ambient lane) never goes to Sarvam, so it cannot spend credit.
- **The key:** stays on the server (`SARVAM_API_KEY`). The browser never sees it.
- **Audio:** Jarvis stores no audio. It logs timings, status codes, the language and numbers, never a word.
- **Groq is still needed.** Whisper remains the fallback, and the hear route still refuses to start without a Groq key.

## The setting: `JARVIS_STT_SARVAM`

Put it in `chennai-grievance-portal-main/.env`, then restart the server.

| Value | What Jarvis does |
|---|---|
| unset, `0`, or anything else | **Off.** Today's Whisper race, unchanged. No call is made to Sarvam. |
| `shadow` | Whisper decides every turn. Sarvam hears the same clip alongside, and only its timing and its agreement with Whisper are logged. Use this first. It costs credit but changes nothing the Collector sees. |
| `tamil` | Sarvam takes the place of the forced-Tamil Whisper decode. Groq's English decode still runs. If Sarvam hears Tamil or Tanglish, its words are used. If Sarvam hears English, Whisper's English words are used. This is the recommended setting once `shadow` looks good. |
| `primary` | Sarvam goes first, and the Whisper race runs only if Sarvam fails. Use it only if the test shows Sarvam at least as good on English. |

In every mode, Jarvis falls back to today's Whisper path when Sarvam fails. Failing means any of these:

- an error, a timeout or a reply that cannot be read;
- an empty transcript, or text in another script (for example, Sarvam heard Hindi);
- Sarvam was skipped.

Sarvam is skipped when there is no key, when the clip is over 30 s, when Sarvam is cooling off after a refusal, or when the day's cap is reached.

Other settings, all optional:

| Setting | Default | Meaning |
|---|---|---|
| `JARVIS_SARVAM_TIMEOUT_MS` | `2500` | How long one Sarvam call may take before Jarvis gives up on it. |
| `JARVIS_SARVAM_DAY_S` | `2400` | The most billed seconds per rolling 24 hours. 2,400 s is 40 minutes, or Rs 19.60 a day before GST (Rs 23.13 with 18 % GST). Past the cap, Whisper hears alone. |
| `JARVIS_SARVAM_KEYTERMS` | on | Each call carries 25 Chennai zone and locality names, to help Sarvam spell them (Sarvam's limit is 50). Set it to `0` to leave them out, for example if Sarvam refuses calls with a 400 error. |

What Jarvis does when Sarvam refuses:

| Sarvam's answer | What Jarvis does |
|---|---|
| 401 or 403 (bad key) | Uses Whisper. Sarvam is not asked again for 10 minutes. |
| 402, or 429 "insufficient quota" (credit spent) | Uses Whisper. Sarvam is not asked again for 10 minutes. Top up, or turn the setting off. |
| 429 (too many requests) | Uses Whisper. Sarvam is not asked again for 30 s. |
| 400, 5xx, a timeout or a network error | Uses Whisper for this turn only. |

Each call is counted in Jarvis's spend ledger under the provider `sarvam`, in billed seconds. A failed call counts too, since it was sent.

## What Rs 500 buys

The price is Rs 0.49 a minute (Rs 29.40 an hour), pay as you go, excluding GST. Sarvam charges per second, rounds each clip up to the next whole second and has a 1 s minimum. So a 3 s turn costs Rs 0.0245 before GST, or Rs 0.029 with 18 % GST.

| If... | Credit | Hours of audio | 3 s turns | 5 s turns |
|---|---|---|---|---|
| Rs 500 buys Rs 500 of credit, with GST on top (you pay about Rs 590) | Rs 500 | **17.0 h** | **20,408** | 12,244 |
| Rs 500 must also cover 18 % GST | Rs 423.73 | **14.4 h** | **17,295** | 10,377 |
| The first row, plus the +10 % language-detection charge that one FAQ mentions | Rs 500 | 15.5 h | 18,552 | 11,131 |
| The second row, plus the +10 % charge | Rs 423.73 | 13.1 h | 15,722 | 9,433 |
| The free signup credit only (it never expires) | Rs 100 | 3.4 h | 4,081 (3,710 with the +10 %) | 2,448 |

Plan with the 5 s column. Jarvis's clip includes a little silence before and after the words, so a 3 s sentence is often a 4 to 5 s clip.

**In use:** 150 engaged turns a day of 4 s each is 10 minutes, or Rs 4.90 a day before GST. Rs 500 of credit lasts about 100 working days at that rate. If every day hit the default cap of 40 minutes, it would last 25 days.

## The final test (before the setting goes on)

This is what the bench (`src/lib/thunai/sarvam.live.ts`) does when the key exists.

- **The clips:** 40 from `tests/e2e/fixtures/v6/`:
  - 14 English: 12 questions and 2 commands.
  - 14 Tamil: 12 questions, one news line and "Hi Jarvis" in Tamil.
  - 12 Tanglish questions.

  They are synthetic voices reading invented lines, so no one's speech is sent to Sarvam. Each clip is sent as the console sends it: 16 kHz, mono, 16-bit WAV. The Gemini clips are 24 kHz and are resampled first.
- **Two passes, both on the English site** (the hard case for Tamil):
  1. `JARVIS_STT_SARVAM=shadow`: Whisper decides, and Sarvam's reply is read off the wire. In this pass Sarvam is given 10 s, so its true time is measured.
  2. `JARVIS_STT_SARVAM=tamil`: the race as it would ship, with the 2.5 s limit.
- **What it measures**, for English, Tamil and Tanglish separately:
  - word error and character error against each clip's own line, for Whisper, for Sarvam and for the `tamil` race;
  - how often each picks the right language, and how often Sarvam and Whisper agree on it;
  - how often Sarvam won the `tamil` race;
  - time to an answer, p50 and p90, for today's Whisper race, for a single Sarvam call and for the `tamil` race.
- **What it costs:**
  - Sarvam: 80 calls and 316 billed seconds. That is **Rs 2.58 before GST, Rs 3.05 with 18 % GST**, or Rs 3.35 if the +10 % charge applies. The free signup credit covers it many times over.
  - Groq: about 120 Whisper calls, inside its free limits.
  - Time: about 8 minutes, paced for Groq's limits.
- **Reading the result.** These are suggestions; the call is yours. Move from `shadow` to `tamil` if:
  - Sarvam's word error on Tamil and on Tanglish is clearly below Whisper's;
  - the `tamil` race still gets English right;
  - the `tamil` race's p90 time is no more than about 300 ms above today's.

  One caution on Tanglish: the reference lines are written in mixed script, as codemix writes them. Whisper's forced-Tamil decode writes everything in Tamil script, so its word error on Tanglish looks worse than it sounds. Check the character error, and read a few rows.

## When you buy a key: the exact steps

1. **Settings first, before any call.** In Sarvam's dashboard, as the Owner:
   - set **data retention for Model APIs to 0 days**. Sarvam's docs say data is otherwise "retained indefinitely".
   - switch **"Model training" off**, under Settings, then Organisation, then General.
   - optionally, ask support@sarvam.ai for their data processing agreement (DPA). This is official audio from a government office.
2. **At checkout:** note the minimum top-up and whether GST is added on top. Spend the free Rs 100 signup credit first.
3. **Create an API key.** Add this one line to `chennai-grievance-portal-main/.env`:
   ```
   SARVAM_API_KEY=<your key>
   ```
   Do not give it a `NEXT_PUBLIC_` name, and do not paste it anywhere else.
4. **Check that nothing calls Sarvam yet.** These tests are mocked and free. Run them from `chennai-grievance-portal-main`:
   ```
   npx vitest run src/lib/thunai/sarvam src/lib/thunai/stt
   ```
5. **Smoke run, 3 clips, about Rs 0.20.** In PowerShell, in `chennai-grievance-portal-main`:
   ```
   $env:SARVAM_BENCH="1"; $env:SARVAM_BENCH_N="3"; npx vitest run --config vitest.live.config.ts src/lib/thunai/sarvam.live.ts
   ```
   In cmd.exe, the same run is `set SARVAM_BENCH=1&& set SARVAM_BENCH_N=3&& npx vitest run --config vitest.live.config.ts src/lib/thunai/sarvam.live.ts`.

   Then check three things:
   - The printed summary shows `sarvamNoReply: 0`.
   - `data/thunai/sarvam-bench.json` holds real transcripts in `rows[].sarvam.body`.
   - Sarvam's dashboard bills about 24 s. More than that suggests the +10 % charge, or billing on something other than the file's length.
6. **Full run, 40 clips, about Rs 3:**
   ```
   Remove-Item Env:SARVAM_BENCH_N; npx vitest run --config vitest.live.config.ts src/lib/thunai/sarvam.live.ts
   ```
   Read the summary at the top of `data/thunai/sarvam-bench.json`.
7. **A day of real use in shadow mode.** Add `JARVIS_STT_SARVAM=shadow` to `.env`, restart (`npm run dev`), and use Jarvis as usual. Then look at the shadow lines:
   ```
   Select-String -Path data\thunai\telemetry.ndjson -Pattern '"stt_shadow"' | Select-Object -Last 30
   ```
   Each line gives:
   - `ms`: Sarvam's time;
   - `lang`: the language Sarvam heard;
   - `sttWinner`: the language Whisper picked;
   - `hit`: whether the two agree on the language;
   - `conf`: how far their words agree, from 0 to 1.

   Lines with `"stt_sarvam"` give each call's status.
8. **Switch on.** Change the line to `JARVIS_STT_SARVAM=tamil` and restart. To switch off, delete the line or set it to `0`, then restart.
9. **Optional:** replace the synthetic test fixtures with a few real replies from the bench. See `src/lib/thunai/__fixtures__/sarvam/README.md`.

## Open questions the research could not settle

1. **Speed.** No REST latency figure for 2 to 5 s clips is published for Sarvam, from Chennai or anywhere. The bench measures it.
2. **Accuracy.** No one has published a Tamil figure for `saaras:v4`, or a Tamil-English code-mixed benchmark for any Sarvam model. The bench gives the first evidence, on synthetic voices rather than the Collector's.
3. **Pure English in codemix mode.** It is not confirmed that codemix returns clean English. It is also not confirmed that `language_probability` is returned in codemix mode.
4. **Place names.** It is not known how codemix writes a Chennai place name inside a Tamil sentence: in English letters or in Tamil script. The lexicon matches both, but the bench will show which.
5. **Language-detection charge.** The +10 % charge appears in Sarvam's FAQ but not on the pricing page.
6. **Billed length.** It is not confirmed whether billing counts the uploaded file's length or only the detected speech. The smoke run's dashboard figure answers this.
7. **Defaults.** The default position of the "Model training" switch and the default retention are not confirmed; the docs conflict. Set both yourself before the first call (step 1).
8. **Checkout terms.** The minimum top-up and whether GST is added at checkout are not confirmed; Sarvam's pages conflict. Nor is what the free credit's "verification" needs.
9. **Spent credit.** Sarvam's pages give two different signals for it: 402, and 429 "insufficient quota". Jarvis handles both.
10. **Keyterms format.** It is not confirmed that the keyterms field is accepted in the form sent: a JSON list of names. If calls come back 400, set `JARVIS_SARVAM_KEYTERMS=0`.
11. **Confidence.** Sarvam gives no confidence for its words, only for the language. Jarvis reports a Sarvam turn as a clean Whisper decode would be reported: log-probability -0.2, about 0.82 sure on the console. It therefore neither doubts nor over-trusts Sarvam. Real use should show whether that is right.

## For the developer

- **Code:**
  - `src/lib/thunai/sarvam.ts` is the client, the flag, the ledger count and the shadow log.
  - `src/lib/thunai/stt.ts` holds the wiring:
    - `hearUtterance` branches on the mode;
    - `scoreDecode` skips the script check for Sarvam's decode;
    - `choose` lets Sarvam's language decide.
- **Tests:**
  - `sarvam.test.ts`: the client.
  - `sarvam.stt.test.ts`: the race in each mode.
  - `sarvam.fixtures.test.ts`: replays the synthetic bodies in `__fixtures__/sarvam/`.
- **Unchanged:** the hear route.
- **Ledger:** `ledger.ts`'s `Org` type does not name `sarvam`, so `sarvam.ts` casts it (`SARVAM_ORG`). Adding `"sarvam"` to `Org` is a one-word follow-up if wanted.
