
## RC-17 (PB-068): fixed
- Root cause: /api/i18n (no sign-in, by the owner's decision) handed req.json() to zod with no size check; zod builds one issue per bad element, so a big array exhausts memory.
- Why earlier tests missed it: routes were only tested with small bodies
- Sweep: docs/qa/pass4/sweeps/RC-17.txt: every other route with no session check (auth/*, map/*, jarvis/say, auth/tab) now reads through the same readJsonCapped helper
- Class guard: lane-c.guards.test.ts fails if a route with no session check reads its body without readJsonCapped
- Three languages: False; real path: unit and route-level (body size is language free)
- Commit: see git log for RC-17
