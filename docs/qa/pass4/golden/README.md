# Golden master

Records what every API route answers, for each role, on the pinned snapshot with the clock frozen. After a fix, record again and compare: the diff shows what the fix changed and what it did not. Every changed request must be explained. An unexplained change blocks the fix.

What is normalised, made stable or left out, each with its reason, is in [NORMALISE.md](NORMALISE.md).

## How to run

From `chennai-grievance-portal-main`:

```
node tests/qa/pass4/with-lock.mjs server 4 -- node tests/qa/pass4/golden.mjs --label <name> --port <p> [--dist .next-qa]
node tests/qa/pass4/golden-diff.mjs baseline-abef9da <name>
```

- **It records the production build in `--dist`.** It does not build. If you changed code, build first, or you will record the old code. Use your own folder, since others use `.next-qa`: `NEXT_DIST_DIR=.next-fix npm run build`, then `--dist .next-fix`, then `git checkout -- tsconfig.json next-env.d.ts`.
- It starts its own servers and stops them. It uses port `<p>`, and when it runs servers side by side also 20000+`<p>`+1, +2 and +3.
- How many servers run at once follows the free memory: 4 with 5 GB free, 2 with 2 GB, else 1. `--width 1|2|4` sets it, `--serial` is `--width 1`. The recording is the same at any width.
- `--only reads,reads2,ask,writes` records some sessions only, to look at something quickly. The others then show as removed in a diff.
- Exit code of `golden.mjs`: 0 clean; 2 the recording itself has a problem (a request got no answer, an accidental 429, a route parameter or dynamic segment with no values, a session that stopped). See `head.problems` and `head.gaps` in the manifest. A recording with exit code 2 cannot be trusted.
- Exit code of `golden-diff.mjs`: 0 no differences; 1 something differs; 2 a recording is missing.

## What it writes

| What | Where | Committed |
|---|---|---|
| Request, role, status, bytes and sha256 of each request | `docs/qa/pass4/golden/<label>.manifest.json` | Yes. A test account's email or mobile is masked |
| Each body, normalised and gzipped, named by its sha256 | `data/aws-cache/qa/golden/<label>/bodies/` | Never: they can hold personal data |
| Server logs, one per session, and timings | `data/aws-cache/qa/golden/<label>/` | Never |
| The comparison | `docs/qa/pass4/golden/diffs/<A>__<B>.json` and `.md` | Yes. Personal values are masked |

## Reading a diff

The `.md` has one table per route first (how many requests changed, for which roles, which status changes, which paths moved), then every changed request with its JSON paths and both values. The `.json` has up to 500 paths for each request. Arrays that hold the same items in a new order are reported as that, not as a change to every item. CSV and plain text are compared line by line, server-sent streams event by event, binary files by hash.

"What differs around the requests" is not a change in behaviour by itself: `next_build_id` differs after any rebuild. A difference in `fixtures` or `build_id` means the comparison is not fair: see NORMALISE.md.

To change the tool's requests, take a new baseline with the same build first, or every new request shows as added.

## The baseline

Labels `baseline-abef9da` and `baseline-abef9da-repeat`, recorded one after the other on port 3110, from the production build in `.next-qa` (Next build id `uoCyfOgnc3qJwf1N3gZ7P`, built from commit abef9da), snapshot build `2026-11-06 18:21:19|76734f481810`, clock frozen at 2026-11-06T06:30:00.000Z.

**`golden-diff baseline-abef9da baseline-abef9da-repeat`: 3272 and 3272 requests, 0 changed, 0 added, 0 removed.** Two more recordings of the same build matched the baseline with 0 differences: one at width 2 and one at width 4, so neither the order of requests between servers nor the load changes an answer.

### Time

| Recording | Servers at once | Time | The machine |
|---|---|---|---|
| `baseline-abef9da` | 1 | 606 s | Busy: other agents' tests and browsers, CPU near 100 %, under 700 MB free |
| `baseline-abef9da-repeat` | 1 | 519 s | Busy, the same |
| Width 2 | 2 | 179 s | Less busy, 4.8 GB free |
| Width 4 | 4 | 279 s | Busy again, 2.5 GB free |

The target is under 5 minutes. Both runs with two or more servers met it. With one server on a machine that busy it was not met (about 9 to 10 minutes). The first trial run, with one server on a quieter machine, took 228 s.

### Requests

3272 requests, 116 route files (74 with a GET).

| Role | Requests |
|---|---|
| anonymous | 558 |
| citizenA | 568 |
| officerA | 653 |
| officerB | 602 |
| collector | 891 |

| Session | Requests | What |
|---|---|---|
| reads | 2163 | Every GET route except the slowest, for all five roles, with every scope. Ids only a response can give. Exports with a confirmation. Ask the Map with what the page holds, Thunai's agent, the rehearsal's route and plan. Ask District IQ. Last, one at a time, the logs |
| reads2 | 744 | The slowest GET routes (`officer/*`, `collector/insights`, `collector/report`), for all five roles, with every scope |
| ask | 253 | The 40 sentences through Ask the Map, Jarvis (`thunai/plan`, `agent/round`, direct and follow-on rounds) and Ask District IQ. Map insights, exports and drafts. Reading a conversation as its owner and as someone else |
| writes | 112 | The fixed write sequence on a fresh durable file, each followed by re-reading what it should change (below) |

By method: POST 405, GET 2864, PATCH 1, DELETE 2. By status: 200: 1124, 201: 9, 204: 12, 400: 64, 401: 1859, 404: 142, 409: 2, 428: 58, 500: 1, 503: 1. The 401s are roles asking a route they may not use, and are on the record for that reason. No request got a 429.

Every GET route is asked by all five roles, with the same URLs, so a role that may not see a route shows its refusal for every scope. Scopes are a spread of period, zone, department, taluk, category, severity and status, then some together. Ids for dynamic segments are picked from the pinned snapshot with a fixed seed (`tests/qa/pass4/lib/golden-plan.mjs`), and include ids of another officer's department. A parameter or dynamic segment with no values fails the recording, so a new route cannot slip past.

The 40 sentences (17 English, 12 Tamil script, 11 Tanglish) are in `tests/qa/pass4/lib/golden-sentences.mjs`. They were written for this tool and only need to stay the same.

GET routes that never gave data to any role in the baseline, and why:

| Route | Why |
|---|---|
| `collector/assistant/tools`, `dev/thunai/draft`, `rehearsal/dev` | Off in a production build: 404 |
| `collector/studio/pick` | Needs a token only the file picker makes |
| `complaints/media/[name]`, `rehearsal/photo/[dir]/[name]` | The snapshot's files are not on this machine, and the recording uploads no media or task photo |
| `collector/workspaces/[id]` | The snapshot's workspaces belong to another owner, and the one the recording saves hits finding GB-3 |
| `rehearsal/traffic/[z]/[x]/[y]` | Answers 204: the tile service is refused in a recording |

### The writes

In one fresh server, in a fixed order, each followed by re-reading what it should change: a citizen files a complaint (also twice, and without signing in). The Collector makes a note and an action, escalates, verifies and reopens incidents, with "Confirm it's you" where the route asks for it. Officers approve and report on cases of their own department, a severe case goes to the Collector and is verified, and an officer tries a case of another department. Then Jarvis's memory and audit line, a briefing saved as a workspace, a workspace saved, renamed and deleted, an answer pinned and rated, and a Data Studio sample with its exports. It ends by reading the audit log and the security log for each role. It only touches that server's own dry-run durable file and folders.

## Routes with no GET

42 of 116. "Recorded" is how many requests the baseline holds. The reasons for what is left out are in NORMALISE.md.

| Route | Methods | Recorded |
|---|---|---|
| `auth/confirm` | POST | 18 |
| `auth/forgot-password/request-otp` | POST | left out |
| `auth/forgot-password/reset-password` | POST | left out |
| `auth/forgot-password/verify-otp` | POST | left out |
| `auth/login` | POST | 16 |
| `auth/logout` | POST | left out |
| `auth/register` | POST | left out |
| `auth/tab` | POST | left out |
| `collector/actions` | POST | 2 |
| `collector/assistant/briefing` | POST | 2 |
| `collector/assistant/chat` | POST | 84 |
| `collector/assistant/feedback` | POST | 1 |
| `collector/decisions` | POST | 8 |
| `collector/jobs/route-news` | POST | left out |
| `collector/sources/[id]` | DELETE, PATCH, POST | left out |
| `collector/sources/ocr` | POST | left out |
| `collector/sources/onboard` | POST | left out |
| `collector/sources/onboard/approve` | POST | left out |
| `collector/sources/onboard/preview` | POST | left out |
| `collector/thunai/agent` | POST | 12 |
| `collector/thunai/agent/round` | POST | 60 |
| `collector/thunai/plan` | POST | 41 |
| `complaints/media` | POST | left out |
| `dev/thunai/agent` | POST | left out |
| `dev/thunai/agent/round` | POST | left out |
| `dev/thunai/hear` | POST | left out |
| `dev/thunai/plan` | POST | left out |
| `dev/thunai/tool` | POST | left out |
| `i18n` | POST | left out |
| `jarvis/hear` | POST | left out |
| `jarvis/say` | POST | left out |
| `map/ask` | POST | 108 |
| `map/export` | POST | 14 |
| `map/insight` | POST | 12 |
| `map/send` | POST | 3 |
| `officer/grievances/[id]/report` | POST | 6 |
| `profile/change-password` | POST | left out |
| `profile/mobile-otp/request` | POST | left out |
| `profile/mobile-otp/verify` | POST | left out |
| `profile/photo` | POST | left out |
| `rehearsal/plan` | POST | 2 |
| `rehearsal/route` | POST | 4 |

## Routes that answered 5xx on the baseline

Each is a finding in `docs/qa/pass4/findings/golden-baseline.json`.

| Route | Status | Who | Finding |
|---|---|---|---|
| `GET /api/collector/search?q=குப்பை` | 500 | collector | GB-1: searching in Tamil fails |
| `GET /api/rehearsal/state?replay=rain-1999-01-01` | 503 | collector | GB-2: an unknown rain says 'service unavailable' |

The same file holds two findings that were not 5xx: GB-3 (a saved workspace cannot be opened on a server that does not save) and GB-4 (a model that cannot load breaks Ask District IQ instead of leaving it to its keyword search). Their tests are in `tests/qa/pass4/golden-baseline.test.ts`. The only other error in the baseline's server logs is the server's own line for GB-1.

## Non-determinism found

None left in the app's answers. Everything that varied between trial recordings came from the test setup, and is made stable as NORMALISE.md says: table rows stamped with the real clock by a column default, Ask District IQ depending on a table another agent had left in `data/lancedb`, and table files other agents leave in `data/aws-cache`.
