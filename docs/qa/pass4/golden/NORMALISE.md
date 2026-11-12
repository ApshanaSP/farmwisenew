# Golden master: what is normalised, what is made stable, what is left out

A golden-master recording must only change when the app changes. This file lists every step taken for that, with the reason. Nothing else is touched: figures, dates and text are never normalised.

## Normalisation rules

Applied to text responses in `tests/qa/pass4/lib/golden-normalise.mjs`, before the hash and before the body is saved. Binary responses are compared as they are.

| # | Rule | Replaced with | Why it varies |
|---|---|---|---|
| 1 | A UUID made during the run (request, session, message and card ids) | `<uuid-1>`, `<uuid-2>`, numbered by first appearance in that body | Made with `crypto.randomUUID()` on each run. Numbering keeps "these two are the same id" visible. A UUID that is in the pinned snapshot is real data and is left as it is |
| 2 | The value of a JSON key `grant` | `<grant>` | A signed one-use ticket from "Confirm it's you". The password that buys it is never recorded |
| 3 | Values a write made up at random in this run | `<new-complaint-code-1>`, `<photo-dir-1>`, `<memory-id-1>`, `<audit-id-1>`, `<audit-hash-1>`, `<dataset-1>` | `Math.random` and `randomBytes` in `complaint-code.ts`, `officer/photos.ts`, `thunai/store.ts`, `studio/store.ts`. An audit line's hash covers its random id, so it is as random as the id. Each is captured from the answer that first shows it and replaced everywhere after, by exact value. Ids already in the snapshot are never replaced |

The request's own URL goes through the same rules, so a request has the same id in every recording.

Durations are not normalised: with the clock frozen `Date.now()` does not move, so every `ms` field is 0. Hash-named asset URLs do not appear: only `/api` routes are recorded.

Only for the committed manifest, not for the comparison: an email or a mobile number in a request's URL or body is shown as `(email)` or `(mobile)`. Bodies are not changed by this. `golden-diff` masks the same way, and by key name (name, email, mobile, address and the like), in the two files it writes.

## Made stable, not normalised

Each is set by `golden.mjs` when it starts its server (through the launcher's `--env`), and by `tests/qa/pass4/golden-preload.cjs`, loaded with `--require` beside `freeze-clock.cjs`. Production code is not changed.

| What | How | Why |
|---|---|---|
| The clock | `--frozen` (2026-11-06 12:00 IST) | Every figure is computed against the same moment |
| A new row's time | The store's `DEFAULT (datetime('now', '+330 minutes'))` is rewritten to the frozen time when a table is made | SQLite reads the real clock in a column default, which the frozen `Date` does not reach |
| The data | The pinned snapshot, through the launcher | Every figure is computed from the same build |
| Table files | In `data/aws-cache`, only the pinned snapshot's table files can be seen | `rehearsal/realdata.ts` takes the first file that starts with a table's name, and other agents leave copies there (for example `incidents-qa3133planted.json.gz`) |
| Models | No key, through the launcher | No model answers, so the code lanes and the rule-written text are what is recorded |
| Outbound network | Refused at `fetch`, at `net.Socket.connect` and at name lookup, for anything but this machine. Hosts are listed per session in the manifest (`refused_hosts`) | See "External services" below. The answer must not depend on the internet |
| Files feeds and other servers rewrite | Read from and written to a private copy, made per session from `data/aws-cache/qa/golden/_fixtures/` (see below) | They live in `data/aws-cache`, shared with every other server in this worktree. A server with no frozen clock refreshes them at any moment |
| The embedding model | The worker is refused, and the store's own "a search index exists" check is answered yes, so `warmUp` does nothing | Otherwise an answer depends on how far a background load has got, and it also embeds 600 incidents on each start |
| The search index (LanceDB) | `@lancedb/lancedb` is replaced, through a Node module hook, by one that says no table exists, so `hybridSearch` returns null, as on a site with no index | `data/lancedb` is shared by every server in this worktree, and it is native code that the file rules above cannot reach. In one trial run a table another agent's test had left there made Ask District IQ fail during the first session and not after it was removed (finding GB-4) |
| Background jobs | `DISTRICT_IQ_JOBS=off`, `SACHET_OFF=1` | The minute sweep and the alert feed fetch from outside and change data |
| Files a write makes | `STUDIO_DIR`, `DATASET_DIR`, `OFFICER_UPLOAD_DIR`, `COMPLAINT_UPLOAD_DIR` point inside the server's own folder, wiped at every start | The writes must only touch this run's own files. `data/datasets` is tracked by git |
| A fresh start | `data/aws-cache/qa/srv/<port>` is wiped before and after each session | Row ids and logs start from the same place |
| The order of writes | Anything that writes, or reads a log, runs one at a time | A log row's id is its place in the queue |
| Sessions apart | Each session has its own server and its own process, so nothing in one reaches another. `--serial` gives the same recording as side by side | The frozen clock never resets a rate-limit window, and the writes need a fresh durable file |
| `collector/brief` | If the answer has `pending: true`, the tool asks again, as the page does. Still pending after 40 tries is a problem of the recording | The route races the write-up against a real 2.5 s timer, so a busy machine could change the answer |

### The fixtures

`data/aws-cache/qa/golden/_fixtures/` holds a copy of `aibrief.json`, `nearby-news.json`, `cmwssb-lakes.json`, `news-fulltext.json` and `map-questions.jsonl` as they were at the first recording. `analysis.json` and `sachet-chennai.json` did not exist then, and stay absent. The folder is gitignored and sealed: a file named `SEALED` stops the tool adding to it, even if a feed file appears later. The manifest records each file's hash under `head.fixtures`, and `golden-diff` reports it if they differ. Do not delete the folder: a new copy would change `collector/nearby`, the reservoir figures and the cached write-ups. If it is ever lost, take a new baseline.

## External services

No request reaches any of these in a recording. The result is what a route does when the service cannot be reached, plus what the fixtures hold.

| Route | Service | In a recording |
|---|---|---|
| `collector/alerts` | NDMA SACHET feed | Off (`SACHET_OFF=1`), shows no SACHET items |
| Lake figures in `collector/overview`, `collector/insights`, `map/layers/live_lakes` and others | CMWSSB lake page | From the fixture, which is newer than the frozen clock, so no refresh starts |
| `collector/nearby` | Google News search feeds | From the fixture, for the same reason |
| `collector/news/article`, `collector/news/analysis` | News publishers (robots.txt, sitemaps, article pages) | Refused, so a report with no saved text answers `unreachable` |
| `rehearsal/state`, `rehearsal/reach`, `map/layers/live_rain` | Chennai Flood Monitor live rain | Refused, the route says it could not read it |
| `rehearsal/traffic/*` | TomTom tiles and incidents | Refused, tiles answer 204 |
| `POST complaints` (type "Other" only) | OpenAI classifier | Not used: the recorded complaint has a fixed department, and there is no key |

## Left out, with the reason

| What | Why |
|---|---|
| `GET collector/studio/[id]?brief=pdf`, and `lang`, which only applies to it | Launches a real browser, and a PDF embeds its creation time and a random document id |
| `POST i18n`, `POST jarvis/say`, `POST jarvis/hear`, `POST dev/thunai/*` | They need a model or speech service, or are off in production. `i18n` also writes to tracked `data/i18n` files |
| Everything that sends mail (`incidents/[id]/action` POST, `map/send` with `send`, `rehearsal/plan` with `send`), password flows and sign-up (`auth/*` except sign-in and confirm), `profile/*` writes, source onboarding, uploads (`complaints/media`, `collector/sources/ocr`) | Not read or compute routes, and not part of the fixed write sequence. Security and flow tests cover them |
| HTML pages | The golden master records `/api` routes only |
| Semantic search | The embedding model and the search index are off, so Ask District IQ uses its keyword search in every recording. Changes in the meaning search are not seen here |
| Live model answers | No key. The model lanes are seen only as "no model" |
