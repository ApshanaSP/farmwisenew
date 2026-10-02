# District IQ: Review Script

**Who speaks:** Speaker 1 (intro + 4-slide deck) → Speaker 2 (live demo, start to end)
**Total time:** about 30 minutes (intro 4–5 min, demo 20–22 min, buffer for questions)
**Deck:** `docs/District_IQ_Intro.pptx` (4 slides; Speaker 1's lines are also in the slide notes)

How to read this script:

- **[DO]** = what to click or show on screen.
- Plain paragraphs = what to say. Say it in your own words; don't read it word for word.
- **Tech:** = the technology behind what is on screen, and why we chose it. Say the short version on stage and keep the rest for questions.
- Section times are a guide. If time is short, skip anything marked *(optional)*.

---

## 0. Before the review (setup checklist, 15 minutes before)

Do all of this before you walk in. A demo that has to wait for something to load looks broken.

| # | Check | How |
|---|---|---|
| 1 | Portal running locally | In `chennai-grievance-portal-main`: `npm run dev`, then open `http://localhost:3000`. Click through every page once so Next.js compiles it (first load is slow in dev mode). |
| 2 | MySQL running | MySQL Workbench open, connected, with the schemas `district_intel` and `district_intel_ops` expanded. |
| 3 | AI key installed | AWS keys rotate every ~3 hours. Get a fresh key from the portal and run `npm run ai:key`, then `npm run ai:check`. If there's no key, the assistant still works in **"Without AI"** rule mode. Say so; don't hide it. |
| 4 | AWS console tabs | Region **ap-south-1 (Mumbai)**. Open these tabs: S3 (filter `fai-tce-team37`), DynamoDB tables, Lambda functions, API Gateway (`fai-tce-team37-api`), CloudWatch log groups, Bedrock playground (optional). |
| 5 | GitHub tab | `ApshanaSP/farmwise-aws` → Actions → "aws-refresh" run history. |
| 6 | Live link tab | https://web-production-760af.up.railway.app (public hosted copy). |
| 7 | Logins ready | Collector test account; one officer account (for example the GCC Storm Water Drain or Engineering officer). Passwords come from `officer-accounts.local.csv`. **Never show that file on screen.** Log in once beforehand and keep them in **two different browser profiles** (or one normal and one incognito window), so switching roles takes one click. |
| 8 | Citizen account | A test citizen account already registered, so OTP email isn't needed live. Show the register page, but log in with the existing account. |
| 9 | VS Code | Open at `D:\farmwisenew` with the folder tree visible: collectors, `district_intel`, `aws`, portal. |
| 10 | Screen | Browser zoom 100%, laptop on charger, notifications off, screen resolution 1366×768 or higher (the consoles are designed for a 1366×680 canvas). |
| 11 | Backup | Screenshots of each console page in a folder, in case the Wi-Fi or AWS fails. |

---

## PART A: Speaker 1: Introduction (4–5 minutes, 4 slides)

### Slide 1: The problem as we understood it

> Good morning. We are team District IQ. We worked on FarmwiseAI Task 6, the Collector's unified application, web and district intelligence system, and we built it for Chennai district.
>
> First, how we understood the problem. A District Collector receives information from many channels: citizen grievances, police reports, PWD registers, hospital MIS, IMD weather warnings, CPCB pollution data, the flood monitor and the daily news. Each comes in its own format, with its own IDs, and none of them talks to the others.
>
> *(point to the orange box)* So a single flooded street shows up as four separate records: a citizen complaint, a police call, a PWD entry and a news story. Four records, zero links. The Collector can't see the real scale, departments do the same work twice, and when something is marked closed there is no proof that it was fixed.
>
> So the real problem is not "build a dashboard". It is to turn many disconnected records into one trustworthy picture, and then make sure someone acts on it.

### Slide 2: What we have built

> What we built is a working system, not a mock-up. It runs as one pipeline in six steps.
>
> **Collect:** eight feeds are collected automatically. Real public data (news, IMD weather, CPCB air quality, the Chennai flood monitor and market prices) plus realistic department records for grievances, police, PWD and hospitals.
>
> **Understand:** our Python pipeline cleans every record, classifies it, places it in one of the 200 GCC wards, removes duplicates and links the same real-world incident across sources.
>
> **Store:** one curated store, locally in SQLite and MySQL, and in the cloud on AWS S3 and DynamoDB.
>
> **Show:** role-based consoles: a citizen portal, a four-page Collector console, and 25 department officer consoles.
>
> **Ask:** an AI assistant, Ask District IQ, answers questions in English, Tamil or Tanglish, and every number it gives is checked against the data.
>
> **Decide:** the officer completes the work with a site photo, the Collector verifies it or sends it back, and every action is written to an audit log.
>
> Some numbers: 8 feeds, more than 20,600 news articles, 25 department consoles, and 0.99 precision when we link the same incident across sources.

### Slide 3: What we are going to do next

> Our plan from here has three phases.
>
> **Phase 1, Pilot:** bring real data in. Today our grievance, police, PWD and hospital records are realistic synthetic data, because we don't have access to the real department systems. Our pipeline has one loader per source, so connecting a real system means writing one new loader; nothing else changes. We'll also label more news to make the incident filter more accurate, and use full article text so English and Tamil stories about the same event can be joined.
>
> **Phase 2, Field:** a mobile app for field officers with geotagged photos, SMS or WhatsApp alerts for severe incidents, and a fully serverless AWS setup with scheduling and the ML build in the cloud.
>
> **Phase 3, Scale:** nothing is hard-coded to Chennai. A new district only needs its reference data (wards, taluks and departments). That allows a state-level view across Collectors. We also want to learn the priority weights from the Collector's own past decisions.

### Slide 4: Why our solution is the best

> Why we believe this is the best solution:
>
> **One incident, not four records.** Most dashboards put the sources side by side. We link the same real-world incident across grievance, police, PWD and news, and we measured it: 0.99 precision.
>
> **Numbers are never invented.** The AI only understands the question and writes the sentence. Every number comes from SQL and statistics, and a verifier rejects any answer with a number that isn't in the data. For a government officer, that's the difference between a toy and a tool.
>
> **Every priority is explained**, in plain words like "past deadline", "reported by three sources" or "linked to rain". No black box.
>
> **A closed loop, with proof:** the officer completes with a photo, the Collector verifies, and everything is in the audit log.
>
> **It speaks Chennai's languages:** English, Tamil and Tanglish, even with spelling mistakes.
>
> **It is working and tested today:** about 300 automated tests, running on AWS with Lambda, S3, DynamoDB and Bedrock.
>
> Now my teammate will show you the whole system live, from start to end.

---

## PART B: Speaker 2: Live demo (20–22 minutes)

The order follows the data: **where it comes from → how it's cleaned → where it's stored → who uses it → how they act on it → the AI → the cloud.** Tell the reviewers this order at the start so they always know where you are.

### B1. Opening: the map of the demo (1 minute)

**[DO]** Show VS Code with the folder tree of `D:\farmwisenew`.

> Thank you. I'll show the system in the same order the data flows: first where the data comes from, then how we clean and link it, then where it's stored (MySQL and AWS), then the three kinds of users (citizen, Collector and department officer), then the AI assistant, and finally how it runs on AWS.
>
> *(point at folders)* The project has four layers, and each layer is a folder. The collectors, one folder per source. `district_intel`, our intelligence pipeline. The portal, `chennai-grievance-portal-main`, which is the web application. And `aws`, the cloud deployment. One rule we followed throughout: a lower layer never depends on an upper one. So we can redesign the dashboard without re-fetching any data, and a collector keeps running even if the website is down.

---

### B2. Layer 1: Data collection (2.5 minutes)

**[DO]** Open each collector folder briefly; open one output CSV (for example IMD or news `master_news.csv`) to show real rows.

> We have eight sources. Each one has its own collector program that owns exactly one domain. Our rule is that collectors are never changed for the dashboard's needs; any data fix happens later, in the pipeline.

Walk through them quickly, pointing at each folder:

| Source | Say this | Tech and why |
|---|---|---|
| **News** (`chennai_news_pipeline`) | "Chennai news in English and Tamil: about 20,600 articles. It's the only source that tells us what departments have *not* recorded." | Google News RSS + publisher RSS with **feedparser**, article text with **trafilatura**, **langdetect** for language. Free and key-less, with wider Tamil coverage than paid news APIs. |
| **IMD weather** (`imd_weather_collector`) | "Rainfall, temperature, humidity, 7-day forecast and district warnings with their colour, from 4 Chennai stations." | IMD's city-weather JSON API and the GeoServer WFS warnings layer. We never bypass the logins on IMD's restricted portals. |
| **CPCB air quality** (`cpcb_air_quality_collector`) | "AQI, category and main pollutant per monitoring station." | data.gov.in API, else **Playwright** reads the public map (a JS-rendered page). We chose Playwright over Selenium because its waits are faster and more reliable. CPCB history is CAPTCHA-gated, so we build our own history from our runs instead of bypassing it. |
| **Flood monitor** (`cfm_dss_collector`) | "River and canal gauge levels with warning and danger stages, lake storage, inflow, alerts, from the Tamil Nadu Chennai Flood Monitoring DSS." | Its public JSON endpoints. |
| **AGMARKNET market prices** | "Vegetable and food prices at Chennai's Uzhavar Sandhais, with weekly change." | AGMARKNET open APIs with an honest User-Agent. |
| **GCC officials** | "48 real officials with roles and phone numbers from the GCC who-is-who page, so every incident shows who is responsible." | |
| **Police, PWD, hospitals, grievances** (`police_dataset_generator`, `pwd_dataset_generator`, `chennai_hospital_data`) | "These departments don't publish open data, so we generate realistic records: ~12,300 police reports across 16 taluks and 60 stations, PWD flood incidents and works, hospital beds, OPD and medicine stock, and ~8,100 grievances. **We always say clearly that these are synthetic.**" | Police generator in Node.js + TypeScript; PWD and hospital in Python; 180-day rolling window. |

> All collectors retry each source three times, and a failure is logged, never hidden. They run automatically every day at 6 AM on the PC through Windows Task Scheduler, and in the AWS version hourly from the cloud. I'll show that later.
>
> One clever problem we had to solve: each synthetic generator invented its own rainy days, so the police data said it rained on one day and PWD said another. Their flood days barely matched (correlation 0.12). So we built a **shared world calendar**: real IMD warning days plus police heavy-rain days are passed to every generator, so all sources agree on the weather. That is what makes cross-source linking testable.

**Tech:** Python 3.11 for all collection because it has the best data and scraping ecosystem. **truststore** makes HTTPS work behind antivirus TLS inspection without switching off certificate checks.

---

### B3. Layer 2a: News pipeline (1 minute)

**[DO]** Open `chennai_news_pipeline/config.yaml` and scroll to the gazetteer (English + Tamil place names).

> News needs extra work. First we fetch: a 90-day backfill on the first run, then the last 48 hours on each run. Then we clean: HTML stripped, Unicode normalised, dates converted to Indian time. Then the **Chennai relevance filter**: this gazetteer of Chennai places in English *and Tamil script*, with spelling variants, keeps only Chennai news and drops national and other-district stories. Then **department tagging**: weighted keyword lists put each article into one of 15 departments, with a "complaint" flag when it describes a civic failure.
>
> Why keywords and not an AI model per article? It's free, instant for 20,000 articles, and testable: this module alone has 88 automated tests. And if a place is missing, we add one line to the gazetteer and reprocess without re-fetching anything.

---

### B4. Layer 2b: district_intel, the intelligence layer (3 minutes)

This is the heart of the project. Explain it slowly.

**[DO]** Open `district_intel/` and show `dintel/` (loaders, classify.py, geo.py, dedup.py, linking.py, analytics.py, agents/). Optionally open `output/reports/` (evaluation report).

> This is the heart of District IQ. One command, `python run_pipeline.py build`, reads every collector's output and builds one curated store in about three and a half minutes on a laptop. It runs these steps in order:

1. **Load.** "Eight loaders map every source into one 70-column `events` table, keeping the source file for every row. Personal data such as mobile numbers is replaced by a keyed hash, so the intelligence store holds no phone numbers."

2. **Classify.** "Structured sources use crosswalk tables. Free text, such as 'Other' complaints, goes through a **character n-gram TF-IDF + Logistic Regression** classifier."
   - *Why:* "Character n-grams match parts of words, so 'drainage', 'drainge' and 'draineage' look alike. That handles Tamil, Tanglish and typos better than word models, and it's tiny and runs on a CPU. If the model is less than 45% sure, the complaint stays 'Other' instead of guessing."

3. **News incident filter.** "Most news isn't an incident: power-cut schedules, politics, court cases. We trained a classifier on rule-based weak labels plus **300 hand labels** we made ourselves. It improved F1 from 0.41 with rules alone to 0.63. It's not perfect yet, and that's exactly why 'label more news' is on our roadmap."

4. **Story clustering.** "The same event is rewritten by many outlets. First a cheap n-gram match catches near-identical headlines, then **multilingual-e5-small** sentence embeddings join rephrased headlines when cosine similarity ≥ 0.95 within 24 hours. We checked 129 merges by hand and all were correct. The model runs offline on CPU, so no data leaves the machine."

5. **Geo-location.** "Every record is placed into one of the **200 real GCC ward polygons** with a point-in-polygon test, then ward → zone → taluk. Points within 500 m of a boundary are snapped in and flagged. Records with only a street or locality get that location with its precision stored."
   - *Why matplotlib.path:* "No GEOS/GDAL install, which is a common pain on Windows with Shapely."

6. **Duplicates.** "Five citizens reporting one pothole become one group: blocking (same category, nearby, close in time) + source rules + **union-find**. Union-find is transitive: if A = B and B = C, then A = C, and every member stays traceable."

7. **Cross-source linking** (the key algorithm). "Record IDs never match across departments, so we link by place, time and text. A **KD-tree** finds nearby candidates only, which avoids comparing every pair. For each pair we compute distance, time gap, text similarity, same category and same ward. A **Logistic Regression** scores the pair. Above 0.85 we link; between 0.40 and 0.85 the pair goes to a human review queue; below 0.40 no link. We tested it on held-out events: **precision 0.99, F1 0.88**."
   - *Why logistic regression and not a neural network:* "Its weights are readable, so we can show *why* two records were linked, and uncertain cases go to people instead of guessing."

8. **Incidents and priority.** "Each linked group becomes one incident with a lead record, a status, a deadline per category and a **priority score with reasons**."
   - "The formula is additive: severity, plus a bonus for more sources, more complaints, past deadline, unverified severe incidents, a burst of new reports, vulnerable people, multiple news outlets, only in news, rain-linked, or a repeat location. Every bonus adds a plain-language reason. We use log2 so one viral issue with 100 complaints can't bury everything else."

9. **Analytics.**
   - **Spikes:** "Daily counts per category and zone are compared with a **Poisson baseline**: a 28-day mean adjusted by weekday. A spike is p < 0.01 with at least 3 cases. Poisson is correct for small counts, where mean + 2 SD fails, and the weekday factor stops normal busy Mondays from raising alarms."
   - **Hotspots:** "**DBSCAN** with haversine distance, eps 250 m (about a street block), finds places where the same problem keeps happening. Unlike K-means, we don't have to choose the number of clusters."
   - **Hot wards:** "**Getis-Ord Gi\***, a standard spatial statistic, flags a ward as hot only when it and its neighbours are significantly high (z > 1.96)."
   - **Sensors:** "**EWMA** and z-scores show whether a lake level, AQI or bed occupancy is unusual right now."

10. **Agents.** "Rule-based agents then write the outputs: a Data Steward for data quality, an Action Planner that drafts tasks from playbooks, a **Gap Finder** that lists news incidents no department has recorded, a Linker for the review queue, a Watchdog, and a Briefing writer. If an AI model is used to polish the text, a **numeric verifier** rejects the result unless every number is in the data."

> The core principle: **numbers come from SQL and statistics, never from a language model.**

**Tech:** pandas/NumPy, scikit-learn, SciPy, sentence-transformers, matplotlib.path, PyYAML for every threshold (tunable without code changes), pytest.

---

### B5. Layer 3: Storage: SQLite → MySQL (2 minutes)

**[DO]** Switch to MySQL Workbench. Show schema `district_intel` → tables `events`, `incidents`, `incident_members`, `anomalies`, `hotspots`, `briefings`. Run:

```sql
SELECT COUNT(*) FROM district_intel.events;
SELECT incident_id, category_label, source_count, priority_score, priority_reasons
FROM district_intel.incidents WHERE is_open = 1 ORDER BY priority_score DESC LIMIT 5;
```

*(Point at `source_count`: incidents built from several sources. Point at `priority_reasons`: the plain-language reasons.)*

Then show schema `district_intel_ops` → `collector_decisions`, `audit_log`, `officer_reports`.

> The pipeline builds a single SQLite file: 32 tables and 6 views. SQLite is perfect for a batch build because it needs no setup and is easy to test. Then it exports into **MySQL 8**, which the website reads. That gives us concurrent reads and writes.
>
> We use **two databases with a strict ownership rule.** `district_intel` belongs to the pipeline and is fully replaced on every build. We load into `__new` tables and then swap them all in with **one atomic RENAME**, so a user never sees a half-loaded dashboard. `district_intel_ops` belongs to people. It holds the Collector's decisions, officer reports and the audit log, and the pipeline **never** drops or overwrites it. After every export we also check row and column counts against SQLite.
>
> *(click audit_log)* This is the audit log. Every decision made on the website appears here with who made it and when. I'll create a new row live in a few minutes.

**Tech:** MySQL via **mysql2** with parameterised raw SQL (fast and transparent, and no SQL injection).

---

### B6. Layer 4a: The web application: entry and citizen portal (2 minutes)

**[DO]** Open `http://localhost:3000`. Show the landing page, then **Register** (don't submit), then log in as the **citizen**.

> The website is one **Next.js 14** application with **React 18** and **Tailwind CSS**. The pages and the REST APIs are in the same project, so there's one deployment and shared types between front end and back end.
>
> *(Register page)* Citizens register with an **email OTP**. Passwords are hashed with **bcrypt**. After login, the server issues a **JWT in an httpOnly cookie**, which page JavaScript can't read, so it's safer against XSS than storing a token in localStorage. A middleware checks the role on every request: a citizen can't open `/collector`, an officer can't open another department.

**[DO]** Citizen → **File a Complaint**. Choose a complaint type, area → locality → street, **drop the pin on the map**, attach a photo. Show (and submit only if you want a fresh record for the demo).

> The complaint types are the verified GCC types. When the citizen points to the problem on the map, the ward is computed from the real ward boundary polygons. If they choose "Others", AI classifies the category, with a keyword fallback when AI isn't available. All inputs are validated by **zod** schemas on the server.
>
> **Tech:** the map is **Leaflet** with OpenStreetMap, which is free with no API key and no billing, unlike Google Maps.

**[DO]** Citizen → **Track Complaints**: show status history.

> The citizen can track every complaint and its full status history. This complaint now flows into the pipeline like every other source.

---

### B7. Layer 4b: Collector console (5 minutes, the main showpiece)

**[DO]** Switch to the Collector browser profile → `/collector`.

> This is the Collector's console. It's designed as a **fixed screen, with no scrolling**: everything the Collector needs fits on one screen, in four pages.

**Top bar (30 seconds)**

> At the top: the **feed status chip**, which shows how fresh the data is, so the Collector knows whether to trust it. The **filters**: period (Daily means today from midnight, then Weekly, Monthly, Quarterly), department, zone and taluk. Choosing a department filters every panel on the same dashboard; we deliberately didn't make separate pages per department.

**Page 1: Overview (1.5 minutes)**

**[DO]** Point at each panel; zoom and pan the map; click one incident pin.

> On the left, a **satellite map** of Chennai with all 200 ward and zone outlines, which can zoom and pan. Built with Leaflet and Esri satellite imagery. Violet pins are items from added sources.
>
> The **District Snapshot** strip gives the headline numbers. **By severity** shows how many incidents are severe, high, medium or low. **My Tasks** is the Collector's personal to-do list: only incidents that need the Collector, and reports sent by officers always come first. **Today's Briefing** is the short written summary.

**[DO]** Click an incident → the pop-up.

> This is one real-world incident. In plain language: what happened, the key facts, why it needs your attention, and who is responsible, with the official's name from the GCC website. The **timeline** shows every record that was merged into this incident: the grievance, the police report, the news coverage. *This* is cross-source linking you can see: four records became one incident. Outlets are counted by distinct publisher, so ten copies of one article don't look like ten newspapers.

**Page 2: Briefing (1 minute)**

> Page 2 is the briefing. The readable briefing at the top. **Developing stories**: news threads with two or more articles about the same event. **Follow-ups**. And the card I like most: **"Only in news"**. These are incidents reported in the news that *no department has recorded*. That's the Collector's blind spot. The Gap Finder agent finds them, and they're automatically routed to the right department's officer.

**Page 3: Trends (1 minute)**

**[DO]** Click a category row or a spike → detail view opens.

> Page 3 is district-wide trends: categories by week, using full Monday-to-Sunday weeks so the comparison is fair. **Unusual spikes** come from the Poisson model I described. **Recurring hotspots** come from DBSCAN. **Unresolved by taluk.** Clicking opens a detail view that explains the pattern: observed versus expected, and where it's happening.

**Page 4: Environment & markets (30 seconds)**

> Page 4: rainfall, air quality and reservoir cards that follow the selected zone. If a zone has no station, it uses the nearest one and names it with the distance, so it's honest about where the reading comes from. Lake levels, and vegetable prices at each Chennai Uzhavar Sandhai with the cheapest and dearest market.

**Exports and audit (30 seconds)**

**[DO]** Click **Export** → download the **PDF** report; show the **CSV action list** option. Open **Audit log** from the sources/settings menu.

> One click gives a **PDF briefing** for meetings. It's generated in the browser with jsPDF, so there's no server load. The **CSV** is an action list, not a raw dump: the things that need you, plus closures to check. And the **audit log** records every decision and change.

---

### B8. Layer 4c: Department officer console and the closed loop (3 minutes)

**[DO]** Switch to the officer browser profile → `/officer`.

> Every one of the **25 departments** has its own account and its own password. The department is read from the database on every request, never from the URL, so an officer can't type another department's code and see their data. Records from other departments return "not found".

**Page 1: Overview**

> The officer sees the same kind of overview as the Collector, filtered to their own department: severe events, open incidents, waiting for approval, resolved, the map, and **My Work**, their queue.

**Page 2: Work & insights**

> Page 2 is the grievance board: **New → In action → Sent to Collector → Verified**, with **"What needs you now"** and complaint-type changes. There are department-specific insight cards: police see crime and response times, hospitals see beds and medicine stock, PWD sees lakes and works, TNPCB sees air quality, roads and electrical see rainfall.

**[DO] Live closed-loop demo:** open a grievance in **New** → **Approve** (moves to In action) → **Complete & send**: type a remark, **upload a site photo**, **Send to Collector**.

> Let me close one. I approve it, so it moves to In action. The work is done, so I add remarks and upload the site photo as proof, and send it to the Collector. Photos are stored outside the public folder and are only served to the Collector and this department.

**[DO]** Switch to the Collector → refresh → **My Tasks** shows the officer's report at the top → open it → see remarks + photo → click **Verify** (or **Send back** with a note to show the other path).

> On the Collector's side, the officer's report is already first in My Tasks. The Collector sees the remarks and the photo, and verifies it, or sends it back with a note, and then the officer sees "Returned".

**[DO]** Switch to MySQL Workbench → `SELECT at, actor, action, table_name, record_id FROM district_intel_ops.audit_log ORDER BY log_id DESC LIMIT 5;`

> And here is the new row in the audit log, written just now. That's the full accountability loop: **citizen → pipeline → officer → Collector → audit**.

---

### B9. Ask District IQ: the AI assistant (3 minutes)

**[DO]** On the Collector console press **Ctrl+K** (or the bottom-right launcher). Ask these, in this order:

| # | Ask | Point to make |
|---|---|---|
| 1 | `Which zone needs attention now?` | Answer with a chart/table built from real data |
| 2 | follow-up: `make it a pie` or `only Zone 13` | Follow-ups **edit** the previous answer instead of starting over |
| 3 | `Which hospitals are above 90% beds today?` | Pulls from a different source |
| 4 | `Velachery la indha week evlo accidents?` | **Tanglish** understood |
| 5 | `Tomato price at Anna Nagar Uzhavar Sandhai` | Market data; try a typo like `tomoto` to show the "Understood as..." spell correction |
| 6 | `Show hotspots on the map` | Answers can be maps, not only text |
| 7 | `Phone number of the citizen who filed complaint X` | **Refused**: personal data is guarded |
| 8 | `Delete all complaints` | **Refused**: the assistant is read-only |

> Collectors ask questions the fixed dashboard doesn't answer, so we built an assistant. But an AI that makes up numbers is dangerous in government. So it works as a guarded pipeline:
>
> 1. **Guard:** before any AI runs, plain code checks for personal-data requests, requests to change data, and prompt injection. That's why the last two questions were refused.
> 2. **Router:** a small, fast model on **Amazon Bedrock** (Nova Micro or Ministral) decides which console tool to use. Without an AI key, rules do this instead. That's "Without AI" mode, so the demo never dies.
> 3. **Tools or query plan:** for new questions the model fills in a structured plan. **It never writes SQL.** Our compiler turns the plan into one parameterised, read-only SELECT over a fixed catalogue of tables, with a 5-second limit and row caps. So there's no SQL injection and no runaway query.
> 4. **Composer:** the model writes the sentence only from the facts that came back.
> 5. **Number verifier:** every number in the answer and in the chart titles must match a returned fact, or the answer is rejected. The chart spec is validated before display.
>
> For spelling, we use **Damerau-Levenshtein** distance, but it only corrects toward Chennai's own vocabulary (places, categories, commodities), and never "corrects" a real English or Tamil word. It shows you what it understood.

**[DO]** *(optional, strong point)* In the officer window, open Ask and type `Which department is slowest?`

> For an officer, answers are **locked to their own department on the server**. A ranking question becomes their own department's figures. No prompt can get around it, because the lock isn't in the prompt; it's in the code.

**Tech:** Vercel **AI SDK** (switch Bedrock / Groq / OpenAI by config), **ECharts** for charts, **@huggingface/transformers** for local multilingual embeddings, **Vitest** (186 tests) plus a golden-question evaluation set (`eval/golden.json`). Limits: 20 questions/minute and 300/day per user.

---

### B10. Layer 5: AWS deployment (3 minutes)

**[DO]** AWS console, region **ap-south-1**. Go tab by tab.

> The challenge asked us to run the platform in FarmwiseAI's AWS account, using only the allowed services: **S3, Lambda, API Gateway, DynamoDB, CloudWatch Logs and Bedrock**. So we built an AWS version with **no MySQL at all.** It's in a separate repository, `farmwise-aws`, so both versions stay clean.

**Tab 1: Lambda** (filter `fai-tce-team37`)

> Our collectors run as **Lambda functions**: `collect-imd`, `collect-cpcb`, `collect-cfm`, `collect-pwd`, `collect-hospital`, plus a news Lambda. It's **one code package deployed five times**, with an environment variable saying which source to run, and it wraps our *unchanged* collectors. Each Lambda writes only the rows that changed since the last run to DynamoDB (**diff-only writes**), which keeps cost and time low. The news Lambda takes about 9 minutes, so it invokes itself asynchronously and the API returns immediately. There's also an `intel` Lambda and a `store` Lambda for the website's data.

**Tab 2: API Gateway** → `fai-tce-team37-api` → routes

> Everything goes through one **HTTP API**: `POST /refresh/<source>`, `/ingest/<source>`, `/intel/...`, `/store/...`. Every call needs a secret `x-refresh-key` header, and the stage is throttled to 1 request per second. The website never holds AWS keys; it only talks to this API.

**Tab 3: GitHub Actions** (`farmwise-aws` → Actions → aws-refresh)

> Our team's AWS role isn't allowed to use EventBridge, AWS's scheduler, so we solved scheduling with a **GitHub Actions cron**. Every hour it calls API Gateway to refresh IMD, flood, PWD and hospitals, and every 3 hours, news. Here are the past runs. *(If allowed, click "Run workflow" or show a recent green run.)*

**Tab 4: CloudWatch Logs** → open the latest `/aws/lambda/fai-tce-team37-collect-imd` log stream

> And here is the log of that run: what it fetched, how many rows changed.

**Tab 5: DynamoDB** → tables `-intel`, `-portal`, `-summary`, `-user` → Explore items

> **DynamoDB** holds the collectors' rows, plus users, complaints and the ops tables: decisions and audit. We migrated 27 tables, about 58,000 rows, from MySQL with a script that's safe to re-run. It's serverless and pay-per-request, and RDS wasn't allowed anyway.

**Tab 6: S3** → buckets `-raw`, `-uploads`, `-exports` → open `intel/current.json`

> **S3** holds raw collector files, uploads, and the curated intelligence snapshot. Each table is stored as gzip JSON **named by its SHA hash**, so unchanged tables are skipped on upload, and the `current.json` manifest is switched last. Readers never see a half-uploaded snapshot. 31 tables fit in 19.4 MB compressed.

> Why does the PC still build the intelligence layer? The ML part uses sentence-transformers, which is too big for a Lambda package. So the **PC builds and AWS stores**. Moving that build into the cloud is in our Phase 2 plan.

**How the website runs on AWS data**

> On the website side, setting `DATA_BACKEND=aws` makes the app load the S3 snapshot into an **in-memory SQLite** database inside Node.js. A small **dialect layer** rewrites our MySQL queries for SQLite, so the same queries work in both versions without a database server, and durable writes go to DynamoDB through the store API. We have a parity test that compares the two versions' answers.

**Tab 7: Bedrock** *(optional)*

> And the assistant's AI runs on **Amazon Bedrock**, using the allowed Nova Lite, Nova Micro and Ministral models, so the data stays inside AWS in the Mumbai region.

**[DO]** *(optional)* Show the public hosted copy: https://web-production-760af.up.railway.app

> We also host a public copy so anyone can try it from this link.

---

### B11. Quality, testing and honest limits (1 minute)

> How do we know it works? We measured it:
>
> - **About 300 automated tests:** 24 for the intelligence pipeline, 88 for the news pipeline, 186 for the website and assistant, plus a golden-question evaluation set for the AI.
> - **Measured accuracy:** cross-source linking at precision 0.99 and F1 0.88 on held-out events; news incident filter at F1 0.63; 129 story merges checked by hand, all correct.
> - **Data quality is shown, not hidden:** feed freshness in the top bar, source health, location validation.
>
> And we're honest about the limits. The department data is synthetic until real systems are connected. The news filter still misses about four in ten incident articles. English–Tamil story merging is switched off, because headlines alone weren't reliable enough. And rain and AQI history only grow from our own runs. Each of these is a line on our roadmap.

---

### B12. Closing (30 seconds)

> To sum up: District IQ takes eight disconnected sources and turns them into **one trustworthy picture of real incidents**. It tells the Collector **what needs attention and why**, routes the work to the right department, and tracks it to **verified completion**, with every number traceable to its source. It runs in the cloud on AWS. Thank you. We're happy to take questions.

---

## PART C: Likely questions and short answers

**Q: Is the data real?**
News, IMD, CPCB, flood monitor, AGMARKNET prices and GCC officials are real. Police, PWD, hospital and most grievances are synthetic because those departments don't publish open data. Every synthetic row is flagged, and plugging in a real source means writing one loader.

**Q: Why not just use ChatGPT for everything?**
Language models can produce confident wrong numbers. We use AI only to understand questions and write sentences. All numbers come from SQL and statistics, and a verifier rejects any answer with a number that isn't in the data. Without an AI key, the whole system still works.

**Q: How does linking work if IDs don't match?**
By place, time and text. A KD-tree finds nearby candidates, a logistic regression scores each pair, a learned threshold decides, uncertain pairs go to human review, and union-find builds the incident. Precision 0.99 on held-out data.

**Q: How did you measure linking accuracy without real ground truth?**
The shared world calendar plants matching flood reports across synthetic sources and records which world event each belongs to in a truth file. We train on half the events and test on the other half.

**Q: Why logistic regression and not deep learning?**
Small data, CPU only, and above all it's explainable: we can show why two records were linked. For government decisions, explainability matters more than a few points of accuracy.

**Q: Why Poisson for spikes?**
Daily incident counts are counts of rare events, which is what a Poisson distribution models. For small numbers, mean + 2 SD gives false alarms. We add a weekday factor and a minimum of 3 cases.

**Q: Why DBSCAN and not K-means?**
K-means needs the number of clusters in advance and forces every point into a cluster. DBSCAN finds clusters of any shape, ignores scattered noise, and with haversine distance works in real metres.

**Q: How is security handled?**
bcrypt passwords, JWT in httpOnly cookies, role middleware, department read from the database on every request, parameterised SQL only, a read-only catalogue-limited query compiler for the AI, login rate limits (20 per IP, 8 per email per 15 minutes), personal data hashed, AWS keys never in the browser, and API Gateway with a key and throttling.

**Q: Why two versions, MySQL and AWS?**
MySQL is the simplest way to run locally and on our public host. The challenge required AWS with only certain services (no RDS), so the AWS version replaces MySQL with S3 + DynamoDB + in-memory SQLite, and the same queries run through a dialect layer.

**Q: Why GitHub Actions for scheduling?**
EventBridge is denied to our team's AWS role. GitHub Actions calls our API Gateway on a cron, protected by a secret key, and it's free.

**Q: What does it cost to run?**
Everything is serverless and pay-per-use: Lambda per run, DynamoDB per request, S3 storage of a few tens of MB, throttled API Gateway. There are no always-on servers.

**Q: What happens if a source fails?**
Each source is retried 3 times. Failures are logged, and the feed chip on the console shows the data's age, so the Collector sees stale data instead of trusting it blindly.

**Q: Can it work for another district?**
Yes. Wards, taluks, departments, categories and playbooks are reference files (YAML/CSV), not code. A new district needs its reference data and its source connectors.

**Q: What would you improve first?**
Real department data, more hand labels for the news filter, full-text English–Tamil merging, and moving the ML build into the cloud.

**Q: How do you stop the AI being tricked by a prompt?**
The guard runs as code before the model. The model never writes SQL, so it can't reach any table outside the catalogue. The officer department lock is enforced on the server, not in the prompt.

---

## Appendix 1: Tech stack one-liner sheet

| Layer | Technology | One-line "why" |
|---|---|---|
| Collection | Python 3.11, requests, feedparser, trafilatura, langdetect, Playwright, truststore | Best scraping/data ecosystem; free key-less feeds; secure HTTPS behind TLS inspection |
| Police generator | Node.js + TypeScript | Type errors caught at build time |
| Intelligence | pandas, NumPy, scikit-learn, SciPy | Fast, proven, explainable, CPU-only |
| Embeddings | sentence-transformers multilingual-e5-small | Free, offline, understands Tamil |
| Geography | matplotlib.path, 200 GCC ward polygons | Real geography, no native GIS install |
| Config | PyYAML | Change thresholds without code |
| Local store | SQLite | Zero setup, single file, easy to test |
| Server store | MySQL 8 + mysql2 | Concurrent reads/writes, transparent SQL |
| Web | Next.js 14, React 18, Tailwind CSS | One full-stack app, one deploy |
| Maps | Leaflet + OpenStreetMap / Esri imagery | Free, no API key |
| Charts | ECharts | Rich, fast charts in the assistant |
| PDF | jsPDF + autotable | Generated in the browser |
| Auth | bcryptjs, jose (JWT), zod, nodemailer | Industry-standard and safe |
| AI | Vercel AI SDK + Amazon Bedrock (Nova Lite/Micro, Ministral) | Switch models by config; data stays in AWS |
| Cloud | Lambda, API Gateway, S3, DynamoDB, CloudWatch | Serverless, pay-per-use, allowed by the challenge |
| Scheduling | Windows Task Scheduler (PC, 6 AM), GitHub Actions (cloud) | EventBridge not allowed |
| Tests | pytest, Vitest, golden eval | About 300 automated tests |
| Hosting | Railway (public copy) | Shareable live link |

## Appendix 2: Numbers to remember

| Number | Meaning |
|---|---|
| 8 | source feeds |
| 200 | GCC wards (real polygons) |
| 25 | department consoles |
| 32 tables + 6 views | curated store |
| ~3.5 min | full pipeline build on a laptop |
| 20,600+ | news articles |
| ~12,300 | police records |
| ~8,100 | grievances |
| 0.99 / 0.88 | linking precision / F1 |
| 0.63 (from 0.41) | news incident filter F1 |
| 129 | story merges checked by hand, all correct |
| 300 | hand-labelled news articles |
| 0.95 within 24 h | story embedding threshold |
| 0.85 / 0.40 | link / review thresholds |
| 250 m, min 5 | DBSCAN hotspot settings |
| p < 0.01, ≥ 3 | spike rule |
| 27 tables, 58k rows | migrated to DynamoDB |
| 31 tables, 19.4 MB | S3 snapshot (gzip) |
| ~300 | automated tests (24 + 88 + 186) |
