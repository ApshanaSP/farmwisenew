# District IQ: 8-minute demo script (October 2026)

Replaces `District_IQ_Demo_Script.md` (2 Oct), which still walks through MySQL Workbench and collect Lambdas.
Today the data is built every hour on GitHub Actions and served from AWS S3/DynamoDB; the site reads it from there.

Numbers below are from the live build of 17 Oct 2026. Say "about": they move every hour.

## Before the demo (morning of)

- [ ] Open the Collector console. The **Collected** chip in the top bar should say all feeds are current. If one is
      orange, open it: a feed closed by its owner (captcha, login) is expected; anything else, check before going on.
- [ ] Sign in with the **judge account**, not a seeded test account.
- [ ] Ask District IQ one question to warm it up (the first answer loads the search model).
- [ ] Have the backup screen recording ready, in case the network fails.
- [ ] Slides open on: the sources slide, the architecture slide, the measured-accuracy slide.

## 0:00 – 0:45 · The problem

> A Collector gets information from dozens of places: departments, the news, weather and flood warnings, citizen
> complaints. None of it is joined up. District IQ brings it into one place and answers two questions every
> morning: **what is happening in the district, and what needs my attention.**

## 0:45 – 1:45 · Sources, said honestly (slide)

> **Live public data:** about 13,900 Chennai news articles in English and Tamil (about 6,000 in Tamil), IMD weather
> and district warnings, CPCB air quality, the Chennai Flood Monitor's reservoirs and bulletins, Chennai Metro Water's
> lake levels, and AGMARKNET market prices. All collected automatically, every hour.
>
> **Simulated department records:** grievances, police, PWD and hospitals do not publish open data, so we generate
> realistic records for them, calibrated to the real weather and places, in the same format a real system would send.
> Connecting a real department means writing one loader; nothing else changes.

If asked about the two FarmwiseAI systems:

> We explored both. The hostels system is GHMC (Hyderabad) and the leave portal is Yadadri Bhuvanagiri (Telangana):
> neither has Chennai data. The same kind of source, a website with a login, plugs in through Data Studio, which I'll show.

Sources checked and not used: TN Climate Tracker covers 4 districts, not Chennai; the Town Panchayats dashboard and
AGRISNET are rural (Chennai is fully urban).

## 1:45 – 3:15 · Wow 1: one story from Tamil and English reports

**Do:** Overview → the news section → open a story with reports in both languages.

> These are different outlets, in Tamil and English, about one event. A Tamil and an English report rarely share a
> word, so we match by meaning: a multilingual embedding (bge-m3) finds candidates, a cross-encoder reranks them, and a
> model trained on our own hand-labelled pairs decides. Unsure pairs go to an LLM, and anything it cannot settle stays
> apart. We also stop chaining, so A-like-B and B-like-C do not drag in an unrelated C.

Point at: the outlet count, the place (we pick *where it happened*, not the hospital it mentions), the timeline.

## 3:15 – 4:45 · Wow 2: what needs attention, and why

**Do:** Overview → **Needs your attention** → open the top incident → its reasons and evidence.

> Every incident has a priority with the reasons written out: severity, how many sources report it, past its deadline,
> vulnerable people, rain. Every number traces back to its source records.
>
> Unusual rises are tested properly: each category and zone is compared with its own last 28 days, adjusted for the
> weekday and for rain, and about 3,800 checks a day go through one false-discovery correction. So we raise a handful of
> real alerts instead of dozens of false ones.

**Do:** Take action → the department, the deadline, the email draft.

## 4:45 – 6:15 · Wow 3: ask, chart, pin

**Do:** Ask District IQ: *"theft cases by zone this month"*, then *"show as a chart"*, then pin it. Then *"tell me
about Velachery crime"*. Then one question in Tamil.

> Questions with exact answers are answered from the data directly, never guessed by a model, and any number the AI
> writes is checked against the data before it is shown. On our test set of 75 questions with known answers, with the AI
> switched off, it answers all 75 correctly.

**Do:** Customize (sliders icon) → hide or reorder a tile. *"The Collector chooses what the dashboard shows."*

## 6:15 – 7:00 · Add a source by link

**Do:** Data Studio → **Add data** → paste a public link (have one ready, e.g. an AGMARKNET page).

> The brief asks that new sources can be added with a link and, where allowed, credentials. Paste a link, and the
> agent works out the type, maps the fields and shows a preview before anything is saved. It handles API keys and
> logins, and it respects robots.txt and never bypasses a captcha.

## 7:00 – 8:00 · How it runs, and what we measured (slides)

> **Pipeline:** collectors → one events table → deduplication → cross-source linking → incidents → anomalies,
> hotspots, priority → briefings. Python (pandas, scikit-learn, sentence-transformers) builds it every hour on GitHub
> Actions; it is stored on AWS S3 and DynamoDB; the website is Next.js reading it into an in-memory store.
>
> **Measured:** see the accuracy slide. We separate numbers measured on real news from numbers measured on the
> simulation's answer key, and we say which is which.
>
> **Next:** connect one real department system, label more real news, and let the priority ranking learn from the
> Collector's decisions (it is built; it needs 30 decisions).

## Accuracy slide (fill in from `district_intel/output/reports/evaluation.md` after the team's labels)

| What | Measured on | Number |
|---|---|---|
| Same-incident linking across sources | simulation answer key (held-out half) | F1 ≈ 0.84 |
| Same-incident linking, news vs records | **real pairs marked by the team** | fill in after `LABELLING_GUIDE.md` step 1 |
| News incident filter | 300 hand-labelled real articles | F1 ≈ 0.63 (finds about 6 in 10) |
| Duplicate grouping within a source | simulation answer key | B-cubed F1 ≈ 0.99 |
| Chatbot golden questions (AI off) | 75 questions, numbers checked by SQL | 75 / 75 |
| Automated tests | | about 570 web, 100 pipeline, 90 news |

## Likely questions

**Is the data real?** News, weather, air, flood, lakes and market prices are live. Department records are simulated
because those departments have no open API; every simulated row is flagged in the data.

**How accurate is the news filter?** About 6 in 10 incident articles are found today. That is our weakest number, and
labelling more real news is first on the roadmap.

**Why not one big AI model?** Numbers come from SQL, models only read and write text, and every number in AI text is
checked. It is cheaper, testable, and it cannot invent a count.

**Which AI?** Amazon Bedrock (Nova Lite) when the team's AWS keys are valid, Gemini and Groq as backups; the site
keeps answering from the data when all are down.
