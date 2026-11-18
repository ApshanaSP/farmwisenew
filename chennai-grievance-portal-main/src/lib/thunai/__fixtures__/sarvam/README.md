# Sarvam response fixtures: SYNTHETIC

**Every file in this folder is synthetic.** None was recorded from Sarvam's live API: no Sarvam key existed when they were written (18 Nov 2026), and no Sarvam endpoint was called.

They were written by hand from Sarvam's documented response shapes, as summarised in `docs/jarvis/v8-research/30-sarvam.md` section 2.1:

- a 200 reply is `{ request_id, transcript, language_code, language_probability }`, plus `timestamps` only when `with_timestamps=true`;
- an error reply is `{ "error": { request_id, message, code } }`, with the codes `invalid_request_error` (400), `invalid_api_key_error` (403), `rate_limit_exceeded_error` (429), `insufficient_quota_error` (402 or 429) and internal or overloaded errors (500, 503).

`vendor_example_hi.json` is Sarvam's own documented example (a Hindi reply). In every other file, the transcripts, language codes and probabilities are invented. They are the shapes Jarvis expects, not evidence of what `saaras:v4` writes for Tamil, English or Tanglish speech.

`cases.json` lists each body with the HTTP status it is replayed under and what `sarvam.ts` must make of it (`sarvam.fixtures.test.ts`). Every body file must have a case.

## Replacing them with recorded replies

Do this once the owner has a key (see `docs/jarvis/SARVAM.md`):

1. Run the bench (`src/lib/thunai/sarvam.live.ts`). It keeps each reply's raw body in `data/thunai/sarvam-bench.json` under `rows[].body`. The clips it sends are synthetic voices reading invented lines, so the bodies hold no one's speech.
2. Copy a few bodies (one English, one Tamil, one Tanglish, plus any error you met) into this folder as new files, for example `recorded_tanglish_adyar.json`. Remove `request_id` if you prefer.
3. Add a line for each new file to `cases.json`, and change this README to say which files are recorded and on what date.
4. Run `npx vitest run src/lib/thunai/sarvam`.
