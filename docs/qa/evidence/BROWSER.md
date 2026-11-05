# What was driven in a real browser (5 Nov 2026)

**Setup**
- Production build in `.next-qa`, running with `next start` on 127.0.0.1:3021, in the Claude desktop browser pane (Chromium).
- The store ran dry-run: a local durable copy at `data/aws-cache/qa/durable.sqlite`, with a read-only snapshot downloaded through the team API.
- Sign-in used a local test Collector added only to that copy. Its password was generated and is kept in a gitignored file. It was never synced.
- Model provider: Groq only; the other provider keys were blank in the server's env. All of the checks below are answered by code, with no model call.
- **Not covered:** Edge and Chrome through Playwright (the browser pane only), any microphone (the pane blocks it; the page said so and offered typing, which worked), and any viewport other than 800x600.

## Results

| Check | Result | Evidence |
|---|---|---|
| Sign-in page wording (BUG-006) | Reads "Across Chennai's 15 zones" and "8 Data feeds", no "Live". No console errors. | page text |
| Sign-in with the test Collector | Lands on /collector | `browser-console.jpg` |
| Console KPIs against the independent oracle, same snapshot, daily | See below | `oracle-wall.json` |
| Jarvis, typed: "chennai city police report" (BUG-001) | Greater Chennai Police brief from real data: 78 reported, 77 open, 7 past deadline, 29 serious. Says "These are generated police test records, not an official police report. This is from today's records." The 77 open matches the console's own department menu. | `browser-police-brief.jpg` |
| Jarvis, typed: "Mumbai police report" (BUG-002) | "I have no data on Mumbai Police. This console holds Chennai district's own records; the nearest I have is Greater Chennai Police, and I can brief you on that." | page text |
| Jarvis, typed: "explain the flooding complaint in Adyar", with the police brief open | **Before the fix:** it re-scoped the police brief to Adyar (`browser-bug020-before.jpg`, now BUG-020). **After:** one flooding case in Adyar, spoken as "There's standing water at Lakshmi Nagar 1St Cross Road. It's been open for a couple of weeks, and it's past its deadline. I'd ask Storm Water Drains to send a pump and check the drain there today." | `browser-explain-adyar.jpg` |

## Console KPIs against the oracle (daily)

| Figure | Console | Oracle |
|---|---|---|
| Severe events | 17 | 17 |
| Open complaints | 128 | 128 |
| Previous-day baselines ("11 more", "31 more", "70 more") | consistent | consistent |
| Ongoing incidents | 237 | 240 |
| Past deadline | 12 | 13 |

The two differences are explained by the app's own build hooks, which run when a build loads. `derive.ts` `newsMedia` (:311) deletes news-only incidents whose publishers are not news media, and the duplicate merge (:358) deletes merged incidents. The snapshot-only oracle cannot apply those, so this is designed behaviour, not a bug. They are not reconciled row by row.

The Collector's decisions and routings (6 and 7 rows) touch no incident in the current 90-day snapshot (`tests/qa/oracle/overlay.mjs`).

## Seen but not changed

The case screen's title is the complaint's own text ("Rain water is stagnating ... mosquitoes are breeding"). The base console shows these titles everywhere. Whether that counts as "a citizen's own words on screen" is the owner's call (OPEN-12).
